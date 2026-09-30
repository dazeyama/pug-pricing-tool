// `prices` Edge Function (spec 5.3): condition-specific prices from JustTCG,
// shared by every store computer through a 6-hour cache.
//
// POST { lookups: Lookup[] } → { results: { [key]: { card, fetchedAt } } }
//   Lookup = { key, game: 'mtg'|'pokemon', lang: 'en'|'ja',
//              scryfallId? | tcgplayerId? | (name + number [+ setName]) }
//   key    = the source key, also the price_map key:
//            mtg:scryfall:<id>, mtg:etched:<tcgplayer id>,
//            pokemon:tcgplayer:<id>, pokemon:<lang>:<tcgdex id> (search)
//   card   = the JustTCG card, slimmed to what the app reads, or null when
//            JustTCG has no match (the app then shows its fallback price).
// Errors: 401 not signed in; 429 { code: DAILY_LIMIT_EXCEEDED |
// REQUEST_LIMIT_EXCEEDED, resetAt } when the allowance is used up.
import { adminClient, corsHeaders, json, readSecret, requireStoreSession } from '../_shared/supabase.ts';
import { BATCH_MAX, call, QuotaError } from '../_shared/justtcg.ts';

const FRESH_MS = 6 * 3600_000;          // price_cache freshness
const RETRY_UNMATCHED_MS = 7 * 86400_000; // price_map "no match" is retried after this
const GAMES = { mtg: 'magic-the-gathering', pokemon: 'pokemon' } as const;

type Lookup = {
  key: string; game: 'mtg' | 'pokemon'; lang: 'en' | 'ja';
  scryfallId?: string; tcgplayerId?: string; name?: string; number?: string; setName?: string;
  setCode?: string;   // printed set code ("SV2a", "OBF"): breaks a tie between search matches
  size?: number;      // printed set size (165): JustTCG's numbers are "025/165"
};

/** Only what the app reads; price history and statistics are dropped. */
function slim(card: any) {
  return {
    uuid: card.uuid ?? null,
    id: card.id,
    name: card.name,
    set: card.set,
    set_name: card.set_name,
    number: card.number,
    tcgplayerId: card.tcgplayerId ?? null,
    scryfallId: card.scryfallId ?? null,
    rarity: card.rarity ?? null,
    variants: (card.variants ?? []).map((v: any) => ({
      uuid: v.uuid ?? null,
      id: v.id,
      condition: v.condition,
      printing: v.printing,
      language: v.language ?? null,
      price: v.price ?? null,
      lastUpdated: v.lastUpdated ?? null,
    })),
  };
}
const cardKey = (card: any) => card.uuid ?? card.id;

const fold = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFKD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
/** "SV2a: Pokemon Card 151" → ["sv2a", "pokemon", "card", "151"]: whole words, so "sv2" ≠ "sv2a". */
const words = (s: unknown) => String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
// JustTCG writes "025/165" and "TG12/TG30"; TCGdex just "025" and "TG12". Compare
// the part before the "/", without leading zeros.
/** "25" + 165 → "025/165", JustTCG's number format; null for "TG12" and the like. */
const justtcgNumber = (n: string, size?: number) =>
  /^\d+$/.test(n) && size && /^\d+$/.test(String(size))
    ? `${n.padStart(3, '0')}/${String(size).padStart(3, '0')}`
    : null;
const normNumber = (n: unknown) => String(n ?? '').trim().toLowerCase().split('/')[0]
  .replace(/^([a-z]*-?)0+(?=\d)/, '$1');

/** The next 00:00 UTC, when the daily allowance resets. */
function nextUtcMidnight(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const denied = await requireStoreSession(req);
  if (denied) return denied;

  let lookups: Lookup[];
  try {
    lookups = ((await req.json())?.lookups ?? []).filter((l: Lookup) => l?.key && GAMES[l.game]);
  } catch {
    return json({ error: 'Expected { lookups: [...] }', code: 'BAD_REQUEST' }, 400);
  }
  lookups = [...new Map(lookups.map((l) => [l.key, l])).values()].slice(0, 200);
  if (!lookups.length) return json({ results: {} });

  const db = adminClient();
  const key = await readSecret('justtcg');
  if (!key) return json({ error: 'No JustTCG key saved. Add it in Settings → API keys.', code: 'NO_KEY' }, 400);

  const now = Date.now();
  const results: Record<string, { card: any; fetchedAt: string | null }> = {};

  try {
    // 1. What's already mapped (source key → JustTCG card), and cached.
    const { data: maps } = await db.from('price_map')
      .select('source_key, justtcg_card_id, resolved_at').in('source_key', lookups.map((l) => l.key));
    const mapBy = new Map((maps ?? []).map((m) => [m.source_key, m]));
    const knownIds = [...new Set((maps ?? []).map((m) => m.justtcg_card_id).filter(Boolean))];
    const { data: cached } = knownIds.length
      ? await db.from('price_cache').select('key, payload, fetched_at').in('key', knownIds)
      : { data: [] as any[] };
    const cacheBy = new Map((cached ?? []).map((c) => [c.key, c]));

    const batch: { lookup: Lookup; item: Record<string, string> }[] = [];
    const searches: Lookup[] = [];
    for (const l of lookups) {
      const m = mapBy.get(l.key);
      if (m && !m.justtcg_card_id && now - Date.parse(m.resolved_at) < RETRY_UNMATCHED_MS) {
        results[l.key] = { card: null, fetchedAt: m.resolved_at };           // confirmed: no match
        continue;
      }
      if (m?.justtcg_card_id) {
        const c = cacheBy.get(m.justtcg_card_id);
        if (c && now - Date.parse(c.fetched_at) < FRESH_MS) {
          results[l.key] = { card: c.payload, fetchedAt: c.fetched_at };     // fresh in the shared cache
          continue;
        }
        batch.push({ lookup: l, item: { cardId: m.justtcg_card_id } });
        continue;
      }
      if (l.scryfallId) batch.push({ lookup: l, item: { scryfallId: l.scryfallId } });
      else if (l.tcgplayerId) batch.push({ lookup: l, item: { tcgplayerId: String(l.tcgplayerId) } });
      else if (l.name && l.number) searches.push(l);
      else results[l.key] = { card: null, fetchedAt: null };
    }

    const fetchedAt = new Date().toISOString();

    // The JustTCG set for a printed set code ("SV2a" → the set whose name or
    // ID has "sv2a" as a word, if exactly one does), remembered in price_map
    // as pokemon:set:<code> (spec 5.3's set mapping), a miss for 7 days.
    const setIds = new Map<string, string | null>();
    const justtcgSet = async (l: Lookup, log: string[]): Promise<string | null> => {
      const code = l.setCode!.toLowerCase();
      const mapKey = `${l.game}:set:${code}`;
      if (setIds.has(mapKey)) return setIds.get(mapKey)!;
      const { data: row } = await db.from('price_map').select('*').eq('source_key', mapKey).maybeSingle();
      if (row && (row.justtcg_card_id || now - Date.parse(row.resolved_at) < RETRY_UNMATCHED_MS)) {
        setIds.set(mapKey, row.justtcg_card_id);
        log.push(`set ${code}: remembered ${row.justtcg_card_id ?? 'none'}`);
        return row.justtcg_card_id;
      }
      const res = await call(key, `/sets?${new URLSearchParams({ game: GAMES[l.game], q: l.setCode! })}`);
      const sets: any[] = res?.data ?? [];
      const hits = sets.filter((s: any) => words(s.name).includes(code) || words(s.id).includes(code));
      const id = hits.length === 1 ? hits[0].id : null;
      log.push(`sets for ${code}: ${sets.length} back [${sets.slice(0, 8).map((s: any) => `${s.id}`).join('; ')}] → ${id ?? 'none'}`);
      setIds.set(mapKey, id);
      mapRows.push({ source_key: mapKey, justtcg_card_id: id, resolved_at: fetchedAt });
      return id;
    };
    const cacheRows: any[] = [];
    const mapRows: any[] = [];
    const found = (l: Lookup, card: any | null) => {
      if (card) {
        const s = slim(card);
        results[l.key] = { card: s, fetchedAt };
        cacheRows.push({ key: cardKey(s), game: l.game, payload: s, fetched_at: fetchedAt });
        mapRows.push({ source_key: l.key, justtcg_card_id: cardKey(s), resolved_at: fetchedAt });
      } else {
        results[l.key] = { card: null, fetchedAt };
        mapRows.push({ source_key: l.key, justtcg_card_id: null, resolved_at: fetchedAt });
      }
    };

    // 2. One batch request (≤100 items on Starter/Pro) for everything missing.
    for (let i = 0; i < batch.length; i += BATCH_MAX) {
      const chunk = batch.slice(i, i + BATCH_MAX);
      const res = await call(key, '/cards', { method: 'POST', body: JSON.stringify(chunk.map((b) => b.item)) });
      const cards: any[] = res?.data ?? [];
      for (const { lookup, item } of chunk) {
        const card = cards.find((c) =>
          (item.cardId && (c.uuid === item.cardId || c.id === item.cardId))
          || (item.scryfallId && c.scryfallId === item.scryfallId)
          || (item.tcgplayerId && String(c.tcgplayerId) === item.tcgplayerId));
        found(lookup, card ?? null);
      }
    }

    // 3. No identifier: search by name and number, and only accept one clear
    //    match (spec 5.3: don't guess). English also has to match the set name.
    //    Starter allows 20 results a search. Up to three steps, each only if
    //    the one before found nothing (owner's Pikachu SV2a, 2026-09-29):
    //    a) the name with JustTCG's own number format, "025/165";
    //    b) the name inside the card's JustTCG set, found once by its set code;
    //    c) the name alone.
    //    What each step got back is logged when nothing (or several) match.
    const search = async (l: Lookup, extra: Record<string, string>, log: string[], label: string) => {
      const params = new URLSearchParams({ game: GAMES[l.game], q: l.name!, limit: '20', ...extra });
      if (l.lang === 'ja') params.set('language', 'Japanese');
      const res = await call(key, `/cards?${params}`);
      const all: any[] = res?.data ?? [];
      const numbered = all.filter((c: any) => normNumber(c.number) === normNumber(l.number));
      let cards = numbered;
      if (l.lang === 'ja') {
        cards = cards.filter((c: any) => (c.variants ?? []).length);
        // The card is there but has no Japanese listings: the other steps
        // would only find the same (owner's Pikachu SV2a log, 2026-09-29), so
        // stop here and save their requests.
        if (numbered.length && !cards.length) noJapanese = true;
      }
      else if (l.setName) {
        const want = fold(l.setName);
        cards = cards.filter((c: any) => fold(c.set_name).includes(want) || want.includes(fold(c.set_name)));
      }
      log.push(`${label}: ${all.length} back [${all.slice(0, 8)
        .map((c: any) => `${c.number} ${c.set_name} (${(c.variants ?? []).length} var)`).join('; ')}]`);
      return cards;
    };
    let noJapanese = false;
    for (const l of searches) {
      const log: string[] = [];
      let cards: any[] = [];
      let failed = false;
      noJapanese = false;
      const attempt = async (label: string, run: () => Promise<any[]>) => {
        if (cards.length || noJapanese) return;
        try {
          cards = await run();
        } catch (e) {
          if (e instanceof QuotaError) throw e;
          failed = true;
          log.push(`${label}: failed (${(e as Error).message})`);
        }
      };
      const printed = justtcgNumber(l.number!, l.size);
      if (printed) await attempt(`number ${printed}`, () => search(l, { number: printed }, log, `number ${printed}`));
      if (l.setCode) {
        await attempt(`set ${l.setCode}`, async () => {
          const set = await justtcgSet(l, log);
          return set ? search(l, { set }, log, `set ${set}`) : [];
        });
      }
      await attempt('name only', () => search(l, {}, log, 'name only'));
      // Several with that name and number (other sets): the one whose set
      // name or ID has the card's set code as a word, if exactly one does
      // (owner, 2026-09-29). TCGplayer names Japanese sets "SV2a: …".
      if (cards.length > 1 && l.setCode) {
        const code = l.setCode.toLowerCase();
        const inSet = cards.filter((c: any) => words(c.set_name).includes(code) || words(c.set).includes(code));
        if (inSet.length === 1) cards = inSet;
      }
      if (cards.length !== 1) {
        // Why not, for the function's logs (Supabase dashboard → Edge Functions → prices → Logs).
        console.log(`prices: ${cards.length ? `${cards.length} matches, not guessing` : 'no match'} for ${l.key}`
          + ` (q="${l.name}", number ${l.number}, set ${l.setCode ?? '?'}): ${log.join(' | ')}`);
      }
      // A search that errored proves nothing: answer "no price" now, but don't
      // remember it as "no match" for 7 days.
      if (!cards.length && failed) {
        results[l.key] = { card: null, fetchedAt: null };
        continue;
      }
      found(l, cards.length === 1 ? cards[0] : null);
    }

    // 4. Share with every computer.
    if (cacheRows.length) {
      const { error } = await db.from('price_cache').upsert(cacheRows);
      if (error) console.error('price_cache write failed', error);
    }
    if (mapRows.length) {
      const { error } = await db.from('price_map').upsert(mapRows);
      if (error) console.error('price_map write failed', error);
    }
    return json({ results });
  } catch (e) {
    if (e instanceof QuotaError) {
      return json({
        error: e.message,
        code: e.code,
        resetAt: e.code === 'DAILY_LIMIT_EXCEEDED' ? nextUtcMidnight() : null,
        results,
      }, 429);
    }
    console.error('prices failed', e);
    return json({ error: (e as Error).message || 'Price lookup failed', code: 'SERVER_ERROR', results }, 502);
  }
});
