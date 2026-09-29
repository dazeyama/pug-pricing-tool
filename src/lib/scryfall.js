// Scryfall: Magic card data (spec 5.1). Public and keyless; every call goes
// through one serialized queue. English printings only.
import { createTransport } from './transport.js';
import { DAY, storedOrDownload } from './cache.js';

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
  setsPromise ??= storedOrDownload('pug.scryfall.sets', DAY, async () => {
    const data = await transport.getJson(`${API}/sets`);
    return data.data.map((s) => ({
      code: s.code,
      name: s.name,
      printed_size: s.printed_size ?? null,
      released_at: s.released_at ?? null,
      set_type: s.set_type,
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
  return Boolean(setsByCode?.has(String(token).toLowerCase()));
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
  parts.push('lang:en');

  const params = new URLSearchParams({
    q: parts.join(' '), unique: 'prints', order: 'released', dir: 'desc',
  });
  const data = await transport.getJson(`${API}/cards/search?${params}`, { signal });
  if (!data) return { cards: [], total: 0, hasMore: false };   // 404: nothing matched
  return { cards: data.data, total: data.total_cards, hasMore: data.has_more };
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
