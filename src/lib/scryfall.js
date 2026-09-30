// Scryfall: Magic card data (spec 5.1). Public and keyless; every call goes
// through one serialized queue. English printings only.
import { createTransport } from './transport.js';
import { DAY, memoryCache, storedOrDownload } from './cache.js';

const API = 'https://api.scryfall.com';
const transport = createTransport({ spacingMs: 100 });

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
  // .v2: adds `digital`, so Arena-only set codes aren't treated as sets.
  try {
    localStorage.removeItem('pug.scryfall.sets');   // the old copy, without it
  } catch {
    // storage blocked: nothing to clean up
  }
  setsPromise ??= storedOrDownload('pug.scryfall.sets.v2', DAY, async () => {
    const data = await transport.getJson(`${API}/sets`);
    return data.data.map((s) => ({
      code: s.code,
      name: s.name,
      printed_size: s.printed_size ?? null,
      released_at: s.released_at ?? null,
      set_type: s.set_type,
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
 * Candidate printings for a query: `cards/search` with unique=prints, newest
 * first. First page only (up to 175).
 * @param {{ name: string, number: string|null, setCode: string|null }} q
 *   setCode only when it's a Magic set code
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ cards: any[], total: number, hasMore: boolean }>}
 */
export async function searchPrints(q, signal) {
  const parts = nameTerms(q.name);
  if (q.number) parts.push(`cn:"${q.number.replace(/"/g, '')}"`);
  if (q.setCode) parts.push(`set:${q.setCode.toLowerCase()}`);
  if (!parts.length) return { cards: [], total: 0, hasMore: false };
  // English, paper only: Arena-only cards (e.g. Arena Anthology 3) can't be bought.
  // No extras (tokens, emblems, art cards…; spec 1.4): Scryfall leaves them out
  // of a plain name search by itself, but a cn: or set: brings them back
  // ("2/184 S8b" found tokens and art cards, owner 2026-09-29), so say so.
  parts.push('lang:en', 'game:paper', '-is:extra');

  // Newest first, or oldest first with the suggestions' sort toggle
  // (q.oldest): Scryfall sorts, so the first page is the right end of the list.
  const params = new URLSearchParams({
    q: parts.join(' '), unique: 'prints', order: 'released', dir: q.oldest ? 'asc' : 'desc',
  });
  const data = await transport.getJson(`${API}/cards/search?${params}`, { signal });
  if (!data) return { cards: [], total: 0, hasMore: false };   // 404: nothing matched
  return { cards: data.data, total: data.total_cards, hasMore: data.has_more };
}

const siblingCache = memoryCache(DAY);
/**
 * Every English printing of a card in its set, extras and variations
 * included (spec 5.1): the siblings the details panel moves between.
 * Reversible cards carry their oracle ID on the faces; failing that, the name.
 * @returns {Promise<any[]>} Scryfall cards, the given one among them
 */
export function fetchSiblings(card, signal) {
  const oracle = card.oracle_id ?? card.card_faces?.[0]?.oracle_id;
  return siblingCache.get(`${oracle ?? card.name}:${card.set}`, async () => {
    const q = oracle
      ? `oracleid:${oracle} set:${card.set} lang:en game:paper`
      : `!"${card.name.replace(/"/g, '')}" set:${card.set} lang:en game:paper`;
    const params = new URLSearchParams({
      q, unique: 'prints', include_extras: 'true', include_variations: 'true', order: 'set',
    });
    const data = await transport.getJson(`${API}/cards/search?${params}`, { signal });
    return data?.data?.length ? data.data : [card];
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
