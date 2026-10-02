// Card search across both games (spec 8.2–8.3): parse the line, query
// Scryfall and TCGdex side by side, filter by printed size and set code,
// rank, and fall back to a typo correction when nothing matches.
import Fuse from 'fuse.js';
import * as scry from './scryfall.js';
import * as dex from './tcgdex.js';
import { isAbort, UnavailableError } from './transport.js';
import { nameKey } from './normalize.js';
import { parseQuery, withoutGuessedSetCode, numericSize, numberPrefix, sameNumber, dexNumberQuery } from './query.js';

/** First page of each source; beyond this, "refine your search". */
export const PAGE = 175;

/**
 * One printing, from either game, in the shape the Price screen draws.
 * @typedef {{
 *   key: string,              // 'mtg:<scryfall id>' | 'pokemon:<lang>:<tcgdex id>'
 *   game: 'mtg'|'pokemon',
 *   lang: 'en'|'ja',
 *   name: string,
 *   setCode: string,          // as displayed: "2X2", "OBF", "SV2a"
 *   setName: string,
 *   setId: string,            // Scryfall set code / TCGdex set id
 *   number: string,           // collector number as printed
 *   printedSize: number|null,
 *   releasedAt: string|null,
 *   order: number,            // tiebreak for sets without a date yet (higher = newer)
 *   thumb: string|null,       // small image
 *   image: string|null,       // large image
 *   score: number,            // number 4 + size 2 + set 1
 *   rarity?: string,          // Magic: common | uncommon | rare | mythic | special | bonus
 *   setIcon?: string|null,    // Magic: the set symbol SVG, for the hover overlay
 *   scryfall?: any,           // the Scryfall card (Magic)
 *   tcgdexId?: string,        // the TCGdex card id (Pokémon)
 * }} Candidate
 */

/** Start loading what searches need, so the first keystrokes aren't slow. */
export function warmUp(lang) {
  scry.loadSets().catch(() => {});
  dex.startSetFill('en');
  if (lang === 'ja') dex.startSetFill('ja');
  scry.loadNames().catch(() => {});
  dex.loadNames().catch(() => {});
}

/**
 * A typed set code that only the other Pokémon language has ("S8b" with EN
 * on is Japanese; "OBF" with JP on is English): that language, else null.
 * Magic codes and the current language's codes are never "other".
 * @returns {Promise<'en'|'ja'|null>}
 */
export async function otherLanguageSet(code, lang) {
  if (!code || scry.isMagicSetCode(code) || dex.isPokemonSetCode(lang, code)) return null;
  const other = lang === 'en' ? 'ja' : 'en';
  if (other === 'ja') await dex.loadSetList('ja').catch(() => null);
  return dex.isPokemonSetCode(other, code) ? other : null;
}

// ---------------------------------------------------------------- Magic

/**
 * A Scryfall card as a Candidate. Also used for sibling printings the details
 * panel moves to, which don't come from a search.
 * @returns {Candidate}
 */
export function magicCandidate(card) {
  const set = scry.setByCode(card.set);
  return {
    key: `mtg:${card.id}`,
    game: 'mtg',
    lang: 'en',
    name: card.name,
    setCode: card.set.toUpperCase(),
    setName: card.set_name,
    setId: card.set,
    number: card.collector_number,
    printedSize: set?.printed_size ?? null,
    releasedAt: card.released_at ?? null,
    order: 0,
    thumb: scry.cardImage(card, 'small'),
    image: scry.cardImage(card, 'large'),
    score: 0,
    rarity: card.rarity,
    setIcon: set?.icon_svg_uri ?? null,
    scryfall: card,
  };
}

async function magicCandidates(q, signal) {
  await scry.loadSets();
  const { cards, total, hasMore } = await scry.searchPrints(
    { name: q.name, number: q.number, setCode: q.magicSet, oldest: q.oldest }, signal);
  const size = numericSize(q.size);
  const list = [];
  for (const card of cards) {
    const c = magicCandidate(card);
    // Filter by size only where the set's printed size is known (SLD, PLST… have none).
    if (size != null && c.printedSize != null && c.printedSize !== size) continue;
    list.push(c);
  }
  return { list, total: hasMore ? total : list.length, hasMore };
}

// ---------------------------------------------------------------- Pokémon

async function pokemonCandidates(lang, q, signal) {
  const size = numericSize(q.size);
  const briefs = await dex.searchCards(
    lang, { name: q.name, number: q.number, size, setCode: q.pokemonSet, dexNo: q.dexNo ?? null }, signal);

  let rows = briefs.map((b) => ({ b, setId: dex.setIdOf(b) }));
  if (size != null) {
    rows = rows.filter((r) => {
      const official = dex.setBrief(lang, r.setId)?.set.cardCount?.official;
      return !official || official === size;           // unknown size: keep, ranked lower
    });
  } else if (q.size) {
    // "TG05/TG30": a sub-set; the number's prefix has to match.
    rows = rows.filter((r) => numberPrefix(r.b.localId) === numberPrefix(q.size));
  }

  // English printed codes live on set details; fetch the few that are missing.
  const needInfo = async (setIds) => {
    const missing = [...new Set(setIds)].filter((id) => !dex.setInfo(lang, id));
    for (const id of missing.slice(0, 30)) {
      try {
        await dex.ensureSetInfo(lang, id, signal);
      } catch (e) {
        if (isAbort(e)) throw e;
      }
    }
  };
  if (q.pokemonSet && lang === 'en') {
    await needInfo(rows.map((r) => r.setId));
    const code = q.pokemonSet.toLowerCase();
    rows = rows.filter((r) => dex.setInfo(lang, r.setId)?.code.toLowerCase() === code);
  }

  const dated = (r) => dex.setInfo(lang, r.setId)?.releaseDate ?? '';
  const order = (r) => dex.setBrief(lang, r.setId)?.index ?? 0;
  // Sorted before the first page is taken, so oldest first really starts at the oldest.
  const dir = q.oldest ? -1 : 1;
  rows.sort((a, b) => dir * (dated(b).localeCompare(dated(a)) || order(b) - order(a)));
  const total = rows.length;
  rows = rows.slice(0, PAGE);
  // Codes for the first row of suggestions, so they read "OBF #125" at once.
  await needInfo(rows.slice(0, 7).map((r) => r.setId));

  const list = rows.map(({ b, setId }) => {
    const info = dex.setInfo(lang, setId);
    const brief = dex.setBrief(lang, setId)?.set;
    return {
      key: `pokemon:${lang}:${b.id}`,
      game: 'pokemon',
      lang,
      name: b.name,
      setCode: info?.code ?? (lang === 'ja' ? setId : setId.toUpperCase()),
      setName: info?.name ?? brief?.name ?? setId,
      setId,
      number: b.localId,
      printedSize: (info?.official || brief?.cardCount?.official) || null,
      releasedAt: info?.releaseDate ?? null,
      order: dex.setBrief(lang, setId)?.index ?? 0,
      thumb: dex.cardImage(b, 'low'),
      image: dex.cardImage(b, 'high'),
      score: 0,
      tcgdexId: b.id,
    };
  });
  return { list, total, hasMore: total > PAGE };
}

// ---------------------------------------------------------------- ranking

/** Number 4 + size 2 + set 1: number+size+set > number+size > number > name only. */
function scoreOf(c, q) {
  let s = 0;
  if (q.number && sameNumber(c.number, q.number)) s += 4;
  if (q.size) {
    const size = numericSize(q.size);
    if (size != null ? c.printedSize === size : numberPrefix(c.number) === numberPrefix(q.size)) s += 2;
  }
  if (q.setCode && c.setCode.toLowerCase() === q.setCode.toLowerCase()) s += 1;
  return s;
}

/**
 * Both games' candidates, interleaved by rank, newest release first within a
 * rank, or oldest first (the sort toggle, owner 2026-09-29). The rank still
 * comes first: the best matches lead either way.
 * @param {boolean} [oldest]
 * @returns {Candidate[]}
 */
export function rank(lists, q, oldest = false) {
  const all = lists.flat().map((c) => ({ ...c, score: scoreOf(c, q) }));
  const dir = oldest ? -1 : 1;
  return all.sort((a, b) =>
    b.score - a.score
    || dir * ((b.releasedAt ?? '').localeCompare(a.releasedAt ?? '') || (b.order ?? 0) - (a.order ?? 0)));
}

// ---------------------------------------------------------------- correction

const indexes = {};
function nameIndex(game, names) {
  if (indexes[game]?.names !== names) {
    indexes[game] = { game, names, keys: names.map(nameKey), fuse: null };
  }
  return indexes[game];
}

/**
 * "lightnig bolt" → "Lightning Bolt": only when the name isn't part of any
 * known name, and only the single best match across the games searched.
 * @returns {Promise<{ game: 'mtg'|'pokemon', name: string }|null>}
 */
export async function findCorrection(name, games = { mtg: true, pokemon: true }) {
  const key = nameKey(name);
  if (key.length < 3) return null;
  const off = () => Promise.reject(new Error('Switched off'));
  const [magic, pokemon] = await Promise.allSettled([
    games.mtg ? scry.loadNames() : off(),
    games.pokemon ? dex.loadNames() : off(),
  ]);
  const catalogs = [];
  if (magic.status === 'fulfilled') catalogs.push(nameIndex('mtg', magic.value));
  if (pokemon.status === 'fulfilled') catalogs.push(nameIndex('pokemon', pokemon.value));
  if (catalogs.some((c) => c.keys.some((k) => k.includes(key)))) return null;

  let best = null;
  for (const c of catalogs) {
    c.fuse ??= new Fuse(c.keys, { includeScore: true, threshold: 0.35, ignoreLocation: true });
    const [hit] = c.fuse.search(key, { limit: 1 });
    if (hit && (!best || hit.score < best.score)) {
      best = { game: c.game, name: c.names[hit.refIndex], score: hit.score };
    }
  }
  return best ? { game: best.game, name: best.name } : null;
}

// ---------------------------------------------------------------- driver

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(t);
    reject(new DOMException('Superseded', 'AbortError'));
  }, { once: true });
});

/**
 * @typedef {{ status: 'searching'|'retrying'|'ok'|'failed'|'skipped'|'off',
 *   list: Candidate[], total: number, hasMore: boolean }} GameResult
 */

/** A set code sends each game only the codes it knows; a code only one game has skips the other. */
function routeSetCode(parsed, lang) {
  const code = parsed.setCode;
  if (!code) return { magicSet: null, pokemonSet: null, skip: null };
  const magic = scry.isMagicSetCode(code);
  const pokemon = dex.isPokemonSetCode(lang, code);
  return {
    magicSet: magic ? code : null,
    pokemonSet: pokemon ? code : null,
    skip: magic && !pokemon ? 'pokemon' : pokemon && !magic ? 'mtg' : null,
  };
}

/**
 * Search both games, or one (MTG | PKM). `onParsed` fires once the line is
 * read; `onUpdate(game, result)` fires as each game changes. Resolves when
 * both are done; rejects only with AbortError.
 * @param {string} input
 * @param {'en'|'ja'} lang  Pokémon language (Magic is always English)
 * @param {{ mtg: boolean, pokemon: boolean }} games  which games to search
 * @param {boolean} oldest  oldest printings first (the sort toggle)
 * @param {AbortSignal} signal
 * @param {{ onParsed: (parsed: any) => void,
 *           onUpdate: (game: 'mtg'|'pokemon', result: GameResult) => void }} callbacks
 * @returns {Promise<{ correction: { game: string, name: string }|null, tried: string|null }>}
 *   tried: a correction that was searched but found nothing either
 */
export async function runSearch(input, lang, games, oldest, signal, { onParsed, onUpdate }) {
  await Promise.allSettled([scry.loadSets(), dex.loadSetList(lang)]);
  if (signal.aborted) throw new DOMException('Superseded', 'AbortError');
  const known = (t) => scry.isMagicSetCode(t) || dex.isPokemonSetCode(lang, t);
  // "No. 32" in Japanese: a Pokédex number from the oldest sets (owner, 2026-10-01).
  const dexNo = lang === 'ja' ? dexNumberQuery(input) : null;
  const parsed = dexNo
    ? { name: '', number: null, size: null, setCode: null, setCodeFrom: null, dexNo }
    : parseQuery(input, known);
  const alternate = withoutGuessedSetCode(input, parsed);
  onParsed(parsed);

  const fetchers = {
    mtg: (p) => magicCandidates({ ...p, oldest, magicSet: routeSetCode(p, lang).magicSet }, signal),
    pokemon: (p) => pokemonCandidates(lang, { ...p, oldest, pokemonSet: routeSetCode(p, lang).pokemonSet }, signal),
  };

  // One game: the query, then the plain reading if a guessed set code found
  // nothing. A source that stops answering is retried every few seconds.
  const runGame = async (game, p) => {
    const empty = { list: [], total: 0, hasMore: false };
    // A game switched off with MTG | PKM isn't asked at all.
    if (!games[game]) {
      onUpdate(game, { status: 'off', ...empty });
      return empty;
    }
    for (let round = 0; ; round++) {
      try {
        const route = routeSetCode(p, lang);
        // A Pokédex number means nothing to Magic.
        const skip = route.skip === game || (p.dexNo && game === 'mtg');
        let result = skip ? empty : await fetchers[game](p);
        if (!result.list.length && alternate && p === parsed) result = await fetchers[game](alternate);
        onUpdate(game, { status: 'ok', ...result });
        return result;
      } catch (e) {
        if (isAbort(e)) throw e;
        console.error(`${game} search failed`, e);
        // Only a source that isn't answering is worth waiting on.
        if (round >= 4 || !(e instanceof UnavailableError)) {
          onUpdate(game, { status: 'failed', ...empty });
          return empty;
        }
        onUpdate(game, { status: 'retrying', ...empty });
        await sleep(4000, signal);
      }
    }
  };

  const results = await Promise.all([runGame('mtg', parsed), runGame('pokemon', parsed)]);

  // Nothing anywhere: try the closest known name.
  if (parsed.name && results.every((r) => !r.list.length)) {
    const correction = await findCorrection(parsed.name, games);
    if (signal.aborted) throw new DOMException('Superseded', 'AbortError');
    if (correction) {
      const result = await runGame(correction.game, { ...parsed, name: correction.name });
      return result.list.length ? { correction, tried: null } : { correction: null, tried: correction.name };
    }
  }
  return { correction: null, tried: null };
}
