// `prices` Edge Function (spec 5.3): condition-specific prices from JustTCG,
// shared by every store computer through a 6-hour cache.
//
// POST { lookups?: Lookup[], searches?: Search[], fresh?: true }
//   → { results: { [key]: { card, fetchedAt } }, searches: { [key]: { cards, fetchedAt } } }
//   fresh  = the export's Sell Prices (docs/EXPORT_FUNCTION.md 5.4): prices
//            fetched in the last 12 hours count (owner, 2026-10-01); older
//            ones are fetched again (and the cache refreshed).
//   Lookup = { key, game: 'mtg'|'pokemon', lang: 'en'|'ja',
//              scryfallId? | tcgplayerId? | tcgplayerSkuId? | justtcgId? | (name + number [+ setName]) }
//            tcgplayerSkuId: one condition and printing of a product, as
//            TCGplayer's own inventory files list cards (owner, 2026-10-09);
//            the card comes back whole, its variants carrying their SKUs.
//   key    = the source key, also the price_map key:
//            mtg:scryfall:<id>, mtg:etched:<tcgplayer id>, pokemon:tcgplayer:<id>,
//            pokemon:justtcg:<JustTCG card id>, pokemon:<lang>:<tcgdex id> (search)
//   Search = { key, kind: 'find'|'siblings'|'dex', game: 'pokemon', name, number?, size? }
//            (owner, 2026-10-09: Pokémon cards TCGdex lacks). Every English
//            JustTCG card (TCGplayer's catalogue) for a name and number:
//            find   = the cards whose names contain the name (a search TCGdex
//                     found nothing for: new promos, missing sets);
//            siblings = the products sharing a TCGdex card's name and number
//                     (Cosmos Holo, stamped and other TCGplayer-only versions);
//            dex    = a Japanese "No. 121" search (owner, 2026-10-10): the
//                     Japanese cards from the sets that print the Pokédex number
//                     instead of a collector number (NO_NUMBER_SETS), whose names
//                     end in the species ("Misty's Starmie", "Dark Quilava"):
//                     `name` is the species' English name.
//            Kept in price_cache as search:<key>, like a price (a miss a day),
//            and each card found cached under its own lookup keys, so pricing
//            one costs no more requests.
//   card   = the JustTCG card, slimmed to what the app reads, or null when
//            JustTCG has no match (the app then shows its fallback price).
// Errors: 401 not signed in; 429 { code: DAILY_LIMIT_EXCEEDED |
// REQUEST_LIMIT_EXCEEDED, resetAt } when the allowance is used up.
import { adminClient, corsHeaders, json, readSecret, requireStoreSession } from '../_shared/supabase.ts';
import { BATCH_MAX, call, QuotaError } from '../_shared/justtcg.ts';
import { TCGPLAYER_SETS } from './sets.ts';

const FRESH_MS = 6 * 3600_000;          // price_cache freshness
const EXPORT_FRESH_MS = 12 * 3600_000; // with fresh: true (an export's Sell Prices; owner, 2026-10-01)
const RETRY_UNMATCHED_MS = 7 * 86400_000; // price_map "no match" is retried after this
const GAMES = { mtg: 'magic-the-gathering', pokemon: 'pokemon' } as const;
// Japanese Pokémon is its own JustTCG game, `pokemon-japan` (checked
// 2026-10-10: `pokemon` with language=Japanese now returns only English sets,
// with no Japanese listings, so every Japanese search came back empty). Its
// cards' variants carry `language: "Japanese"`.
const gameFor = (l: { game: 'mtg' | 'pokemon'; lang?: string }) =>
  (l.game === 'pokemon' && l.lang === 'ja' ? 'pokemon-japan' : GAMES[l.game]);
// The ten oldest Japanese sets (1996–2001) print no collector numbers, and
// JustTCG lists their cards as "N/A": they're matched by name within their
// JustTCG set instead (TCGdex set → JustTCG set, checked 2026-10-10).
const OLD_JA_SETS: Record<string, string> = {
  pmcg1: 'expansion-pack-pokemon-japan',
  pmcg2: 'pokemon-jungle-pokemon-japan',
  pmcg3: 'mystery-of-the-fossils-pokemon-japan',
  pmcg4: 'rocket-gang-pokemon-japan',
  pmcg5: 'leaders-stadium-pokemon-japan',
  pmcg6: 'challenge-from-the-darkness-pokemon-japan',
  neo1: 'gold-silver-to-a-new-world-pokemon-japan',
  neo2: 'crossing-the-ruins-pokemon-japan',
  neo3: 'awakening-legends-pokemon-japan',
  neo4: 'darkness-and-to-light-pokemon-japan',
};

type Lookup = {
  key: string; game: 'mtg' | 'pokemon'; lang: 'en' | 'ja';
  scryfallId?: string; tcgplayerId?: string; tcgplayerSkuId?: string; justtcgId?: string;
  name?: string; number?: string; setName?: string;
  setId?: string;     // the TCGdex set id ("svp"): its TCGplayer home (TCGPLAYER_SETS)
  plain?: boolean;    // a product lookup for a card's plain version: its product must be the set's own card
  setCode?: string;   // printed set code ("SV2a", "OBF"): breaks a tie between search matches
  size?: number;      // printed set size (165): JustTCG's numbers are "025/165"
  // A Japanese card's Poké Ball / Master Ball version, its own product
  // "<name> (<pattern>)": read off its card's search (`patternOf`, that
  // lookup's key) when that runs in the same call, else searched itself.
  patternOf?: string;
  pattern?: string;   // "Poke Ball Pattern", "Master Ball Pattern"
};
type Search = {
  key: string; kind: 'find' | 'siblings' | 'dex'; game: 'pokemon';
  name: string; number?: string; size?: number;
};
// The Japanese sets that print "No. 121" (the Pokédex number) where later cards
// print a collector number: 1996 until the e-series (December 2001), and the
// unnumbered promos of those years (checked 2026-10-10: Pokémon VS, Web and the
// P and J promos are numbered; Battle Road and Gym Challenge are 2003 and later).
// A "No." search only ever shows cards from these, so newer cards of the same
// Pokémon never crowd it.
const NO_NUMBER_SETS = new Set([
  'expansion-pack-pokemon-japan',
  'expansion-pack-no-rarity-pokemon-japan',
  'pokemon-jungle-pokemon-japan',
  'mystery-of-the-fossils-pokemon-japan',
  'rocket-gang-pokemon-japan',
  'leaders-stadium-pokemon-japan',
  'challenge-from-the-darkness-pokemon-japan',
  'city-gym-decks-pokemon-japan',
  'quick-starter-gift-set-green-deck-pokemon-japan',
  'quick-starter-gift-set-red-deck-pokemon-japan',
  'intro-pack-bulbasaur-pokemon-japan',
  'intro-pack-squirtle-pokemon-japan',
  'southern-island-pokemon-japan',
  'neo-premium-file-1-pokemon-japan',
  'neo-premium-file-2-pokemon-japan',
  'neo-premium-file-3-pokemon-japan',
  'gold-silver-to-a-new-world-pokemon-japan',
  'crossing-the-ruins-pokemon-japan',
  'awakening-legends-pokemon-japan',
  'darkness-and-to-light-pokemon-japan',
  'intro-pack-neo-chikorita-pokemon-japan',
  'intro-pack-neo-totodile-pokemon-japan',
  'vending-machine-cards-series-1-blue-pokemon-japan',
  'vending-machine-cards-series-2-red-pokemon-japan',
  'vending-machine-cards-series-3-green-pokemon-japan',
  'corocoro-promotional-cards-pokemon-japan',
  'unnumbered-promotional-cards-pokemon-japan',
  'world-hobby-fair-pokemon-japan',
  'champion-road-pokemon-japan',
  'pokemon-card-fan-club-pokemon-japan',
  'pokemon-card-information-promotional-cards-pokemon-japan',
  'how-i-became-a-pokemon-card-pokemon-japan',
  '64-mario-stadium-best-photo-contest-pokemon-japan',
]);
/** "Lt. Surge's Pikachu (LV.15)" → "Lt. Surge's Pikachu": the name without JustTCG's number or bracketed notes. */
const plainName = (n: unknown) => baseName(n).replace(/\s*\([^()]*\)\s*$/, '');
const SEARCH_MISS_MS = 86400_000;   // a search that found nothing is asked again after a day
const SEARCHES_MAX = 3;

/**
 * Only what the app reads: price history and most statistics are dropped,
 * all but each price's movement over 7 and 30 days, for the 📈 / 📉 beside
 * a price that rose or fell sharply (owner, 2026-10-14).
 */
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
      priceChange7d: v.priceChange7d ?? null,
      priceChange30d: v.priceChange30d ?? null,
      avgPrice30d: v.avgPrice30d ?? null,
      tcgplayerSkuId: v.tcgplayerSkuId ?? null,
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
/**
 * "25" + 165 → "025/165", JustTCG's number format (TCGplayer's); the older
 * sets write "12/107", so their table entry says `pad: false`; null for "TG12"
 * and the like.
 */
const justtcgNumber = (n: string, size?: number, pad = true) =>
  /^\d+$/.test(n) && size && /^\d+$/.test(String(size))
    ? (pad ? `${n.padStart(3, '0')}/${String(size).padStart(3, '0')}` : `${Number(n)}/${size}`)
    : null;
/** "025/165" → 165; null when the number names no size. */
const sizeOf = (n: unknown) => { const of = String(n ?? '').split('/')[1]; return of && /^\d+$/.test(of) ? Number(of) : null; };
/** The TCGdex set a lookup is for: said, or read off its key (pokemon:en:<set>-<number>). */
const setIdOf = (l: Lookup) => {
  if (l.setId) return l.setId;
  const id = /^pokemon:(?:en|ja):(.+)$/.exec(l.key)?.[1] ?? '';
  return id.includes('-') ? id.slice(0, id.lastIndexOf('-')) : null;
};
/** Where the lookup's set lives on TCGplayer (TCGPLAYER_SETS), if known. */
const homeOf = (l: Lookup) => (l.lang === 'en' ? TCGPLAYER_SETS[setIdOf(l) ?? ''] ?? null : null);
/**
 * A product that is another card (decision 288): its number isn't the card's
 * (Celebrations' Classic Collection keeps the originals' numbers, "CC001" vs
 * "2/102", and is let through), or a plain version's product outside the set's
 * TCGplayer home (a theme-deck reprint in "Deck Exclusives" sold as the set's
 * holo). TCGdex named 176 such products (PKM_PRICES.md 3.1): the known ones
 * are put right in the app (printings.js WRONG_PRODUCTS); the rest, and the
 * next ones, are refused here rather than priced as the wrong card.
 */
function anotherCard(l: Lookup, card: any): string | null {
  const theirs = String(card?.number ?? '');
  const mine = String(l.number ?? '');
  if (/\d/.test(theirs) && /\d/.test(mine) && !/^cc/i.test(mine) && normNumber(theirs) !== normNumber(mine)) {
    return `number ${theirs}, not ${mine}`;
  }
  const home = homeOf(l);
  if (l.plain && home && !home.names.some((n) => fold(n) === fold(card?.set_name))) {
    return `in ${card?.set_name}, not ${home.names.join(' / ')}`;
  }
  return null;
}
const normNumber = (n: unknown) => String(n ?? '').trim().toLowerCase().split('/')[0]
  .replace(/^([a-z]*-?)0+(?=\d)/, '$1');
/** "Mega Starmie ex - 021/088" → "Mega Starmie ex": JustTCG adds the number to some names. */
const baseName = (n: unknown) => String(n ?? '').replace(/\s+-\s+\S+\/\S+$/, '');

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
  let cardSearches: Search[];
  let maxAge = FRESH_MS;
  try {
    const body = await req.json();
    lookups = (body?.lookups ?? []).filter((l: Lookup) => l?.key && GAMES[l.game]);
    cardSearches = (body?.searches ?? []).filter((s: Search) => s?.key && s.game === 'pokemon'
      && (s.kind === 'find' || s.kind === 'siblings' || s.kind === 'dex') && String(s.name ?? '').trim().length >= 2);
    if (body?.fresh === true) maxAge = EXPORT_FRESH_MS;
  } catch {
    return json({ error: 'Expected { lookups: [...] }', code: 'BAD_REQUEST' }, 400);
  }
  lookups = [...new Map(lookups.map((l) => [l.key, l])).values()].slice(0, 200);
  cardSearches = [...new Map(cardSearches.map((s) => [s.key, s])).values()].slice(0, SEARCHES_MAX);
  if (!lookups.length && !cardSearches.length) return json({ results: {}, searches: {} });

  const db = adminClient();
  const key = await readSecret('justtcg');
  if (!key) return json({ error: 'No JustTCG key saved. Add it in Settings → API keys.', code: 'NO_KEY' }, 400);

  const now = Date.now();
  const results: Record<string, { card: any; fetchedAt: string | null }> = {};
  const searchOut: Record<string, { cards: any[]; fetchedAt: string }> = {};

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
        if (c && now - Date.parse(c.fetched_at) < maxAge) {
          results[l.key] = { card: c.payload, fetchedAt: c.fetched_at };     // fresh in the shared cache
          continue;
        }
        batch.push({ lookup: l, item: { cardId: m.justtcg_card_id } });
        continue;
      }
      if (l.scryfallId) batch.push({ lookup: l, item: { scryfallId: l.scryfallId } });
      else if (l.tcgplayerSkuId) batch.push({ lookup: l, item: { tcgplayerSkuId: String(l.tcgplayerSkuId) } });
      else if (l.tcgplayerId) batch.push({ lookup: l, item: { tcgplayerId: String(l.tcgplayerId) } });
      else if (l.justtcgId) batch.push({ lookup: l, item: { cardId: String(l.justtcgId) } });
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
      const game = gameFor(l);
      const mapKey = `${game}:set:${code}`;
      if (setIds.has(mapKey)) return setIds.get(mapKey)!;
      const { data: row } = await db.from('price_map').select('*').eq('source_key', mapKey).maybeSingle();
      if (row && (row.justtcg_card_id || now - Date.parse(row.resolved_at) < RETRY_UNMATCHED_MS)) {
        setIds.set(mapKey, row.justtcg_card_id);
        log.push(`set ${code}: remembered ${row.justtcg_card_id ?? 'none'}`);
        return row.justtcg_card_id;
      }
      const res = await call(key, `/sets?${new URLSearchParams({ game, q: l.setCode! })}`);
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
        let card = cards.find((c) =>
          (item.cardId && (c.uuid === item.cardId || c.id === item.cardId))
          || (item.scryfallId && c.scryfallId === item.scryfallId)
          || (item.tcgplayerId && String(c.tcgplayerId) === item.tcgplayerId)
          || (item.tcgplayerSkuId && (c.variants ?? []).some((v: any) => String(v.tcgplayerSkuId) === item.tcgplayerSkuId)));
        // A SKU asked for alone: the one card that came back, if its variants don't say.
        if (!card && item.tcgplayerSkuId && chunk.length === 1 && cards.length === 1) card = cards[0];
        // A Pokémon product that is another card is not priced, and not
        // remembered either: the product's own card may ask for it next.
        const why = card && lookup.game === 'pokemon' && item.tcgplayerId ? anotherCard(lookup, card) : null;
        if (why) {
          console.log(`prices: ${lookup.key} (${lookup.name} ${lookup.number}, ${setIdOf(lookup)}) is ${card.name} ${card.number} in ${card.set_name}: ${why}; not priced`);
          results[lookup.key] = { card: null, fetchedAt, refused: why } as any;
          continue;
        }
        found(lookup, card ?? null);
      }
    }

    // 3. No identifier: search by name and number, and only accept one clear
    //    match (spec 5.3: don't guess). English also has to match the set:
    //    its TCGplayer home exactly (TCGPLAYER_SETS, decision 288), or, for a
    //    set the table doesn't know, a set name containing the card's (or the
    //    other way), and the printed size where JustTCG's number has one.
    //    Starter allows 20 results a search. Up to three steps, each only if
    //    the one before found nothing (owner's Pikachu SV2a, 2026-09-29):
    //    a) the name with JustTCG's own number format, "025/165" ("12/107" in
    //       the sets TCGplayer writes that way);
    //    b) the name inside the card's JustTCG set: English by the set's home,
    //       Japanese by its set code ("SV2a", found once);
    //    c) the name alone.
    //    What each step got back is logged when nothing (or several) match.
    const search = async (l: Lookup, extra: Record<string, string>, log: string[], label: string) => {
      const params = new URLSearchParams({ game: gameFor(l), q: l.name!, limit: '20', ...extra });
      const res = await call(key, `/cards?${params}`);
      const all: any[] = res?.data ?? [];
      const numbered = all.filter((c: any) => normNumber(c.number) === normNumber(l.number)
        && (!l.size || !sizeOf(c.number) || sizeOf(c.number) === Number(l.size)));
      let cards = numbered;
      if (l.lang === 'ja') {
        cards = cards.filter((c: any) => (c.variants ?? []).length);
        // The card is there but has no Japanese listings: the other steps
        // would only find the same (owner's Pikachu SV2a log, 2026-09-29), so
        // stop here and save their requests.
        if (numbered.length && !cards.length) noJapanese = true;
      } else if (homeOf(l)) {
        const names = homeOf(l)!.names.map(fold);
        cards = cards.filter((c: any) => names.includes(fold(c.set_name)));
      } else if (l.setName) {
        const want = fold(l.setName);
        cards = cards.filter((c: any) => fold(c.set_name).includes(want) || want.includes(fold(c.set_name)));
      }
      log.push(`${label}: ${all.length} back [${all.slice(0, 8)
        .map((c: any) => `${c.number} ${c.set_name} (${(c.variants ?? []).length} var)`).join('; ')}]`);
      return cards;
    };
    let noJapanese = false;
    // Cards first, so their pattern versions can be read off the same results.
    searches.sort((a, b) => Number(Boolean(a.patternOf)) - Number(Boolean(b.patternOf)));
    const candidatesOf = new Map<string, any[]>();
    for (const asked of searches) {
      const l: Lookup = asked.patternOf ? { ...asked, name: `${asked.name} (${asked.pattern})` } : asked;
      if (asked.patternOf && candidatesOf.has(asked.patternOf)) {
        const want = fold(l.name);
        const pick = candidatesOf.get(asked.patternOf)!.filter((c: any) => fold(baseName(c.name)) === want);
        found(l, pick.length === 1 ? pick[0] : null);
        continue;
      }
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
      const oldSet = l.lang === 'ja' && l.setCode ? OLD_JA_SETS[l.setCode.toLowerCase()] : undefined;
      if (oldSet) {
        // An unnumbered old set: the card with exactly this name in its set.
        await attempt(`set ${oldSet}`, async () => {
          const params = new URLSearchParams({ game: 'pokemon-japan', q: l.name!, set: oldSet, limit: '20' });
          const all: any[] = (await call(key, `/cards?${params}`))?.data ?? [];
          log.push(`set ${oldSet}: ${all.length} back [${all.slice(0, 8).map((c: any) => c.name).join('; ')}]`);
          const want = fold(l.name);
          return all.filter((c: any) => fold(baseName(c.name)) === want && (c.variants ?? []).length);
        });
      } else {
        const home = homeOf(l);
        const printed = justtcgNumber(l.number!, l.size, home?.pad !== false);
        if (printed) await attempt(`number ${printed}`, () => search(l, { number: printed }, log, `number ${printed}`));
        if (home) {
          // The set itself, by JustTCG's id (TCGplayer's name as a slug); a
          // set split in two on TCGplayer (Generations and its Radiant
          // Collection) is asked set by set.
          for (const set of home.sets) await attempt(`set ${set}`, () => search(l, { set }, log, `set ${set}`));
        } else if (l.setCode && l.lang === 'ja') {
          await attempt(`set ${l.setCode}`, async () => {
            const set = await justtcgSet(l, log);
            return set ? search(l, { set }, log, `set ${set}`) : [];
          });
        }
        await attempt('name only', () => search(l, {}, log, 'name only'));
      }
      candidatesOf.set(l.key, cards);
      // Several with that name and number (other sets): the one whose set
      // name or ID has the card's set code as a word, if exactly one does
      // (owner, 2026-09-29). TCGplayer names Japanese sets "SV2a: …".
      if (cards.length > 1 && l.setCode) {
        const code = l.setCode.toLowerCase();
        const inSet = cards.filter((c: any) => words(c.set_name).includes(code) || words(c.set).includes(code));
        if (inSet.length === 1) cards = inSet;
      }
      // Several still: the one named exactly as asked, if just one is. A
      // Japanese card's Poké Ball and Master Ball Pattern versions share its
      // number and set ("Starmie (Poke Ball Pattern)"; 2026-10-10).
      if (cards.length > 1) {
        const want = fold(l.name);
        const exact = cards.filter((c: any) => fold(baseName(c.name)) === want);
        if (exact.length === 1) cards = exact;
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

    // 3b. Card searches (owner, 2026-10-09): TCGplayer's listings for a name
    //     and number, for the Pokémon cards TCGdex lacks. Up to three steps,
    //     each only if the one before found no card with that number:
    //     JustTCG's "060/162" number, the number as printed ("101", promos),
    //     then the name alone (20 results), filtered here.
    if (cardSearches.length) {
      const { data: kept } = await db.from('price_cache')
        .select('key, payload, fetched_at').in('key', cardSearches.map((s) => `search:${s.key}`));
      const keptBy = new Map((kept ?? []).map((k) => [k.key, k]));
      for (const s of cardSearches) {
        const row = keptBy.get(`search:${s.key}`);
        const keptCards: any[] = row?.payload?.cards ?? [];
        if (row && now - Date.parse(row.fetched_at) < (keptCards.length ? maxAge : SEARCH_MISS_MS)) {
          searchOut[s.key] = { cards: keptCards, fetchedAt: row.fetched_at };
          continue;
        }
        const want = fold(s.name);
        if (s.kind === 'dex') {
          // Unnumbered Japanese cards with the species' name, a page at a time
          // (most species fit one; three at most), kept from the "No." sets only.
          const log: string[] = [];
          const cards: any[] = [];
          for (let page = 0; page < 3; page++) {
            const params = new URLSearchParams({
              game: 'pokemon-japan', q: s.name, number: 'N/A', limit: '20', offset: String(page * 20),
            });
            const res = await call(key, `/cards?${params}`);
            const all: any[] = res?.data ?? [];
            const kept = all.filter((c: any) => NO_NUMBER_SETS.has(c.set) && fold(plainName(c.name)).endsWith(want)
              && (c.variants ?? []).some((v: any) => String(v.language ?? '').toLowerCase() === 'japanese'));
            cards.push(...kept);
            log.push(`page ${page + 1}: ${all.length} back, ${kept.length} kept`);
            if (!res?.meta?.hasMore) break;
          }
          if (!cards.length) console.log(`prices: no "No." cards for ${s.key} (q="${s.name}"): ${log.join(' | ')}`);
          const slimmed = cards.map(slim);
          searchOut[s.key] = { cards: slimmed, fetchedAt };
          cacheRows.push({ key: `search:${s.key}`, game: s.game, payload: { cards: slimmed }, fetched_at: fetchedAt });
          for (const c of slimmed) {
            const id = cardKey(c);
            cacheRows.push({ key: id, game: s.game, payload: c, fetched_at: fetchedAt });
            mapRows.push({ source_key: `pokemon:justtcg:${id}`, justtcg_card_id: id, resolved_at: fetchedAt });
          }
          continue;
        }
        const num = s.number ? normNumber(s.number) : null;
        const english = (c: any) => !(c.variants ?? []).length
          || c.variants.some((v: any) => !v.language || String(v.language).toLowerCase() === 'english');
        // Same name (siblings: the name the card starts with), same number,
        // and the same set size where JustTCG prints one ("060/162").
        const sameNumber = (c: any) => {
          if (num == null) return true;
          if (normNumber(c.number) !== num) return false;
          const of = String(c.number ?? '').split('/')[1];
          return !s.size || !of || !/^\d+$/.test(of) || Number(of) === Number(s.size);
        };
        const named = (c: any) => (s.kind === 'siblings' ? fold(c.name).startsWith(want) : fold(c.name).includes(want));
        const steps: Record<string, string>[] = [];
        const printed = s.number ? justtcgNumber(s.number, s.size) : null;
        if (printed) steps.push({ number: printed });
        if (s.number && s.number !== printed) steps.push({ number: s.number });
        steps.push({});
        const log: string[] = [];
        let cards: any[] = [];
        for (const extra of steps) {
          const params = new URLSearchParams({ game: GAMES[s.game], q: s.name, limit: '20', ...extra });
          const res = await call(key, `/cards?${params}`);
          const all: any[] = res?.data ?? [];
          cards = all.filter((c: any) => named(c) && sameNumber(c) && english(c));
          log.push(`${extra.number ? `number ${extra.number}` : 'name only'}: ${all.length} back, ${cards.length} fit`);
          if (cards.length) break;
        }
        if (!cards.length) console.log(`prices: search found nothing for ${s.key} (q="${s.name}", number ${s.number ?? '-'}): ${log.join(' | ')}`);
        const slimmed = cards.map(slim);
        searchOut[s.key] = { cards: slimmed, fetchedAt };
        cacheRows.push({ key: `search:${s.key}`, game: s.game, payload: { cards: slimmed }, fetched_at: fetchedAt });
        for (const c of slimmed) {
          const id = cardKey(c);
          cacheRows.push({ key: id, game: s.game, payload: c, fetched_at: fetchedAt });
          mapRows.push({ source_key: `pokemon:justtcg:${id}`, justtcg_card_id: id, resolved_at: fetchedAt });
          if (c.tcgplayerId) mapRows.push({ source_key: `pokemon:tcgplayer:${c.tcgplayerId}`, justtcg_card_id: id, resolved_at: fetchedAt });
        }
      }
    }

    // 4. Share with every computer.
    if (cacheRows.length) {
      const unique = [...new Map(cacheRows.map((r) => [r.key, r])).values()];
      const { error } = await db.from('price_cache').upsert(unique);
      if (error) console.error('price_cache write failed', error);
    }
    if (mapRows.length) {
      // One row per key: a card found by a search and a lookup in the same call.
      const unique = [...new Map(mapRows.map((r) => [r.source_key, r])).values()];
      const { error } = await db.from('price_map').upsert(unique);
      if (error) console.error('price_map write failed', error);
    }
    return json({ results, searches: searchOut });
  } catch (e) {
    if (e instanceof QuotaError) {
      return json({
        error: e.message,
        code: e.code,
        resetAt: e.code === 'DAILY_LIMIT_EXCEEDED' ? nextUtcMidnight() : null,
        results,
        searches: searchOut,
      }, 429);
    }
    console.error('prices failed', e);
    return json({ error: (e as Error).message || 'Price lookup failed', code: 'SERVER_ERROR', results, searches: searchOut }, 502);
  }
});
