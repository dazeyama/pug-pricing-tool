// Scryfall: Magic card data (spec 5.1). Public and keyless; every call goes
// through one serialized queue. English printings only.
import { createTransport } from './transport.js';
import { DAY, memoryCache, storedOrDownload } from './cache.js';

const API = 'https://api.scryfall.com';
const transport = createTransport({ spacingMs: 100 });
// Many searches in a row (Import Collection) go slower: Scryfall allows about
// two searches a second, and answers faster ones with a minute's 429.
const bulkSearches = createTransport({ spacingMs: 550 });

/**
 * @typedef {{ code: string, name: string, printed_size: number|null,
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
  // .v3: adds `parent_set_code` (a promo set's main set, for the export's
  // categories, export spec 7.3); .v2 added `digital`, so Arena-only set codes
  // aren't treated as sets.
  try {
    localStorage.removeItem('pug.scryfall.sets');   // the older copies
    localStorage.removeItem('pug.scryfall.sets.v2');
  } catch {
    // storage blocked: nothing to clean up
  }
  setsPromise ??= storedOrDownload('pug.scryfall.sets.v3', DAY, async () => {
    const data = await transport.getJson(`${API}/sets`);
    return data.data.map((s) => ({
      code: s.code,
      name: s.name,
      printed_size: s.printed_size ?? null,
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
  const data = await transport.getJson(`${API}/cards/search?${params}`, { signal });
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
    const data = await bulkSearches.getJson(url);
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
    const data = await transport.getJson(`${API}/cards/search?${params}`, { signal });
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
