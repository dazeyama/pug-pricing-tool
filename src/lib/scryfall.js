// Scryfall: Magic card data (spec 5.1). Public and keyless; every call goes
// through one serialized queue. English printings only.
import { createTransport } from './transport.js';
import { DAY, memoryCache, storedOrDownload } from './cache.js';

const API = 'https://api.scryfall.com';
// A lookup's first byte came in 0.32 s at worst (2026-10-18): given up after 4 s and tried again.
const transport = createTransport({ spacingMs: 100, timeoutMs: 4_000 });
// Many searches in a row (Import Collection) go slower: Scryfall allows about
// two searches a second, and answers faster ones with a minute's 429.
const bulkSearches = createTransport({ spacingMs: 550, timeoutMs: 10_000 });
// A search's first byte came in 0.97 s at worst (an older card's printings, 2026-10-18): 10 s.
const SEARCH_ANSWER_MS = 10_000;

// Every search, of every kind (live search, a card's printings, Import
// Collection, the scanner's), takes its turn through one gate (owner,
// 2026-10-16: "fix this"): Scryfall takes two searches a second
// (scryfall.com/docs/api/rate-limits, read 2026-10-16: /cards/search 500 ms),
// and one 429 shuts the app out for 30 seconds. One search at a time, each
// sent 550 ms or more after the last one's answer came back, so two are never
// closer however the queue behind them stands. A search given up before its
// turn (a newer query typed) takes none.
const SEARCH_GAP_MS = 550;
let lastSearchAt = 0;
let searchLine = Promise.resolve();
/**
 * A /cards/search request, in its turn.
 * @param {string} url
 * @param {{ signal?: AbortSignal, via?: object }} [opts]  via: the transport (the bulk one for Import Collection)
 */
function searchJson(url, { signal, via = transport } = {}) {
  const run = searchLine.then(async () => {
    if (signal?.aborted) return via.getJson(url, { signal });   // given up: rejects at once, no turn taken
    const wait = lastSearchAt + SEARCH_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await via.getJson(url, { signal, timeoutMs: SEARCH_ANSWER_MS });
    } finally {
      lastSearchAt = Date.now();
    }
  });
  searchLine = run.catch(() => {});
  return run;
}

/**
 * @typedef {{ code: string, name: string, printed_size: number|null, card_count: number|null,
 *   released_at: string|null, set_type: string, icon_svg_uri: string|null }} ScryfallSet
 */

let setsPromise = null;
/** @type {Map<string, ScryfallSet>|null} */
let setsByCode = null;

/**
 * Every set, cached in localStorage for 24h. Loaded once per page.
 * @returns {Promise<Map<string, ScryfallSet>>}  keyed by lower-case code
 */
export function loadSets() {
  // .v4: adds `card_count` (an old card's "123/350" names its set's size,
  // which Scryfall gives as printed_size only where they differ; scanner
  // tier 2, docs/SCAN_FUNCTION.md 6.2). .v3 added `parent_set_code` (a promo
  // set's main set, for the export's categories, export spec 7.3); .v2
  // `digital`, so Arena-only set codes aren't treated as sets.
  setsPromise ??= storedOrDownload('pug.scryfall.sets.v4', DAY, async () => {
    // The older copies go when a new one downloads (once a day at most), not on every call.
    try {
      localStorage.removeItem('pug.scryfall.sets');
      localStorage.removeItem('pug.scryfall.sets.v2');
      localStorage.removeItem('pug.scryfall.sets.v3');
    } catch {
      // storage blocked: nothing to clean up
    }
    const data = await transport.getJson(`${API}/sets`);
    return data.data.map((s) => ({
      code: s.code,
      name: s.name,
      printed_size: s.printed_size ?? null,
      card_count: s.card_count ?? null,
      released_at: s.released_at ?? null,
      set_type: s.set_type,
      parent_set_code: s.parent_set_code ?? null,
      digital: Boolean(s.digital),
      icon_svg_uri: s.icon_svg_uri ?? null,
    }));
  }).then((list) => {
    setsByCode = new Map(list.map((s) => [s.code.toLowerCase(), s]));
    return setsByCode;
  }).catch((e) => {
    setsPromise = null;                    // try again next time
    throw e;
  });
  return setsPromise;
}

/** A set by code, if the list has loaded. */
export function setByCode(code) {
  return setsByCode?.get(String(code).toLowerCase()) ?? null;
}

/** True if Scryfall knows this set code (once the list has loaded). */
export function isMagicSetCode(token) {
  const set = setsByCode?.get(String(token).toLowerCase());
  return Boolean(set && !set.digital);   // Arena/MTGO-only sets can't be bought over the counter
}

let namesPromise = null;
/**
 * Every card name, for typo correction. localStorage for 7 days (Audit Tool's
 * CARD_NAMES_MAX_AGE_DAYS), downloaded at low priority.
 * @returns {Promise<string[]>}
 */
export function loadNames() {
  namesPromise ??= storedOrDownload('pug.scryfall.names', 7 * DAY, async () => {
    const data = await transport.getJson(`${API}/catalog/card-names`, { priority: 'low' });
    return data.data;
  }).catch((e) => {
    namesPromise = null;
    throw e;
  });
  return namesPromise;
}

/** Each word of a name as a quoted Scryfall term, so "or", "-" etc. are never syntax. */
function nameTerms(name) {
  return String(name ?? '')
    .split(/\s+/)
    .map((w) => w.replace(/"/g, ''))
    .filter((w) => /[\p{L}\p{N}]/u.test(w))    // drops "//" and other bare punctuation
    .map((w) => `"${w}"`);
}

/**
 * The collector-number term. A plain number also finds its promo pack
 * printing, numbered with a "p" in the set's promos ("High Perfect 229":
 * Lorwyn Eclipsed 229 and its Promos' 229p; owner, 2026-10-13).
 */
export function numberTerm(number) {
  const n = String(number ?? '').replace(/"/g, '').trim();
  if (!n) return null;
  return /^\d+$/.test(n) ? `(cn:"${n}" or cn:"${n}p")` : `cn:"${n}"`;
}

/**
 * The languages a Magic search keeps (owner, 2026-10-16). Searched with no
 * language, Scryfall gives one card per printing: English where there is
 * one, else the printing's own language. So the Japanese printings English
 * packs carry (Mystical Archive's Japanese alternate art: "Cyclonic Rift SOA
 * 79") come up in a plain English search, the Japanese copies of English
 * cards don't, and other languages' own printings are left out.
 */
export const keptLanguage = (card) => card.lang === 'en' || card.lang === 'ja';

/**
 * Candidate printings for a query: `cards/search` with unique=prints, newest
 * first. First page only (up to 175).
 * @param {{ name: string, number: string|null, setCode: string|null }} q
 *   setCode only when it's a Magic set code
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ cards: any[], total: number, hasMore: boolean }>}
 */
export async function searchPrints(q, signal) {
  const parts = nameTerms(q.name);
  const number = numberTerm(q.number);
  if (number) parts.push(number);
  if (q.setCode) parts.push(`set:${q.setCode.toLowerCase()}`);
  if (!parts.length) return { cards: [], total: 0, hasMore: false };
  // Paper only: Arena-only cards (e.g. Arena Anthology 3) can't be bought.
  // English, and Japanese-only printings (keptLanguage), so no lang: term.
  // No extras (tokens, emblems, art cards…; spec 1.4): Scryfall leaves them out
  // of a plain name search by itself, but a cn: or set: brings them back
  // ("2/184 S8b" found tokens and art cards, owner 2026-09-29), so say so.
  parts.push('game:paper', '-is:extra');

  // Newest first, or oldest first with the suggestions' sort toggle
  // (q.oldest): Scryfall sorts, so the first page is the right end of the list.
  const params = new URLSearchParams({
    q: parts.join(' '), unique: 'prints', order: 'released', dir: q.oldest ? 'asc' : 'desc',
  });
  const data = await searchJson(`${API}/cards/search?${params}`, { signal });
  if (!data) return { cards: [], total: 0, hasMore: false };   // 404: nothing matched
  return { cards: data.data.filter(keptLanguage), total: data.total_cards, hasMore: data.has_more };
}

/**
 * Every printing a search finds (unique=prints), page after page up to
 * `maxPages` (175 a page): Import Collection's lookups (importCollection.js).
 * @param {string} q  a Scryfall query
 * @param {{ maxPages?: number }} [opts]
 * @returns {Promise<any[]>}  Scryfall cards, newest first; none when nothing matched
 */
export async function searchAll(q, { maxPages = 10 } = {}) {
  const params = new URLSearchParams({ q, unique: 'prints', order: 'released', dir: 'desc' });
  let url = `${API}/cards/search?${params}`;
  const cards = [];
  for (let page = 0; url && page < maxPages; page++) {
    const data = await searchJson(url, { via: bulkSearches });
    if (!data) break;                      // 404: nothing matched; 400: a query Scryfall can't read
    cards.push(...(data.data ?? []));
    url = data.has_more ? data.next_page : null;
  }
  return cards;
}

// /cards/tcgplayer/:id is under Scryfall's general limit, 10 requests a
// second (scryfall.com/docs/api/rate-limits, read 2026-10-09; a 429 locks the
// app out for 30 seconds). Requests start 120 ms apart, a few at once,
// rather than each waiting for the last one's answer.
const PRODUCT_GAP = 120;
const PRODUCT_IN_FLIGHT = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The printings TCGplayer sells as these products (TCGplayer-format
 * imports): product ID → Scryfall card, or null when Scryfall doesn't know
 * it. A 429 holds every request for 31 seconds, as Scryfall asks.
 * @param {(string|number)[]} ids  TCGplayer product IDs
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<Map<string, object|null>>}
 */
export async function cardsByTcgplayerIds(ids, onProgress) {
  const queue = [...new Set(ids.map(String))];
  const total = queue.length;
  const out = new Map();
  let slot = 0;     // when the next request may start
  let pause = 0;    // after a 429: nothing before this
  let done = 0;
  const takeSlot = async () => {
    for (;;) {
      const start = Math.max(slot, pause, Date.now());
      slot = start + PRODUCT_GAP;
      await sleep(start - Date.now());
      if (Date.now() >= pause) return;
    }
  };
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      let card = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        await takeSlot();
        let res = null;
        try {
          res = await fetch(`${API}/cards/tcgplayer/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } });
        } catch {
          res = null;               // a network hiccup: try again in a later slot
        }
        if (res && (res.status === 429 || res.status === 503)) {
          pause = Date.now() + 31_000;
          continue;
        }
        if (!res) continue;
        if (res.ok) card = await res.json();
        break;                      // found, or 404: Scryfall doesn't know it
      }
      out.set(id, card);
      done += 1;
      onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PRODUCT_IN_FLIGHT, total) }, worker));
  return out;
}

const siblingCache = memoryCache(DAY);
/**
 * Every printing of a card in its set, English or Japanese-only
 * (keptLanguage), extras and variations included (spec 5.1): the siblings
 * the details panel moves between.
 * Reversible cards carry their oracle ID on the faces; failing that, the name.
 * @returns {Promise<any[]>} Scryfall cards, the given one among them
 */
export function fetchSiblings(card, signal) {
  const oracle = card.oracle_id ?? card.card_faces?.[0]?.oracle_id;
  return siblingCache.get(`${oracle ?? card.name}:${card.set}`, async () => {
    const q = oracle
      ? `oracleid:${oracle} set:${card.set} game:paper`
      : `!"${card.name.replace(/"/g, '')}" set:${card.set} game:paper`;
    const params = new URLSearchParams({
      q, unique: 'prints', include_extras: 'true', include_variations: 'true', order: 'set',
    });
    const data = await searchJson(`${API}/cards/search?${params}`, { signal });
    const kept = (data?.data ?? []).filter(keptLanguage);
    return kept.length ? kept : [card];
  });
}

/**
 * A card image at a size ('small' | 'normal' | 'large'), for one face of a
 * double-faced card (front by default).
 */
export function cardImage(card, size, face = 0) {
  if (card.image_uris?.[size]) return card.image_uris[size];
  return card.card_faces?.[face]?.image_uris?.[size] ?? card.card_faces?.[0]?.image_uris?.[size] ?? null;
}

/** True for a card whose back face has its own image (transform, modal DFC…). */
export function hasBackFace(card) {
  return Boolean(!card.image_uris && card.card_faces?.[1]?.image_uris);
}

// ---------------------------------------------------------------- scanning

/**
 * The printing a phone's scan read off a card's collector line:
 * `/cards/<set>/<number>`, English, kept a day this page's life. Not a
 * search: Scryfall takes ten of these a second, against two searches, and
 * answers them faster (src/scan/resolve.js asks this first). Null when
 * Scryfall has no such card.
 * @param {string} set  set code, any case
 * @param {string} number  as printed: "125", "263s", "4★"
 * @returns {Promise<object|null>}  a Scryfall card
 */
const bySetNumberCache = memoryCache(DAY);
export function cardBySetNumber(set, number) {
  const code = String(set).toLowerCase();
  return bySetNumberCache.get(`${code}/${number}`,
    () => transport.getJson(`${API}/cards/${encodeURIComponent(code)}/${encodeURIComponent(number)}`));
}

const byIdCache = memoryCache(DAY / 4);
/**
 * A card by its Scryfall id (the computer pricing a scan, 8.3), kept for six
 * hours this page's life: Scryfall's prices change once a day.
 * @returns {Promise<object|null>}
 */
export function cardById(id) {
  return byIdCache.get(id, () => transport.getJson(`${API}/cards/${encodeURIComponent(id)}`));
}

const quickCache = memoryCache(DAY / 4);
/**
 * One page of a search (up to 175 printings), paper, English or Japanese-
 * only, kept six hours this page's life: the scanner's evidence searches
 * (src/scan/resolve.js), the same query asked again by the next look costs
 * nothing.
 * @param {string} q  a Scryfall query
 * @returns {Promise<object[]>}  Scryfall cards; none when nothing matched
 */
export function searchQuick(q) {
  return quickCache.get(q, async () => {
    const params = new URLSearchParams({ q: `${q} game:paper`, unique: 'prints', order: 'set' });
    const data = await searchJson(`${API}/cards/search?${params}`);
    return (data?.data ?? []).filter(keptLanguage);
  });
}
