// Stamped promos (owner, 2026-10-18: "In Magic stamped cards are an entirely
// different printing categorically, so this matters as much as set detection
// in a way"; decision 328). A promo pack card has the planeswalker stamp at
// its art's lower right; a prerelease card the gold year ("20★24") at its
// art's lower left. Their collector line is the plain card's, so the strip
// reads the plain one. On Scryfall they sit in the set's promo set ("p" and
// its code): the plain card's number with a "p" (promo pack) or an "s"
// (prerelease, foil only): DSK 223 → PDSK 223p, 223s.
//
// The check, for a card that has such printings: the camera's stamp spots
// against the plain card's own picture. A spot that doesn't match it has
// something printed there. Scryfall's pictures of the stamped printings
// aren't used: Aziza 174p's puts the stamp about 18 px higher (of 680) than
// the printed card has it. Measured on two cards from the camera (Aziza,
// Mage Tower Captain 174p, Nashi, Searcher in the Dark 223s), the card's
// outline off by up to 3% each way: a stamped spot 0.59 or more from the
// plain card, an unstamped one 0.47 or less.
// DOM-free but for the picture loader and the canvas maker, which are passed in.

import * as scry from '../lib/scryfall.js';
import { printDistance, regionPrint } from './printingMatch.js';

/** Where each stamp is looked for, as fractions of the card. */
export const STAMP_ZONES = {
  promopack: { left: 0.805, right: 0.92, top: 0.445, bottom: 0.54 },
  prerelease: { left: 0.07, right: 0.2, top: 0.455, bottom: 0.55 },
};
/** A spot this far from the plain card's (printDistance) has a stamp. */
export const STAMP_SEEN = 0.53;
// Each spot tried this far each way, in these steps, and its best match kept: the card's outline
// is a little off, and only a stamp keeps a spot unlike the plain card wherever it's tried.
const REACH = 0.02;
const STEP = 0.005;

const plainNumber = (n) => String(n ?? '').replace(/^0+(?=\d)/, '').toLowerCase();

/** A promo set's card's stamp, by its promo types: 'prerelease', 'promopack' or null. Pure. */
export function stampKind(card) {
  const types = card?.promo_types ?? [];
  if (types.includes('prerelease')) return 'prerelease';
  if (types.includes('promopack')) return 'promopack';
  return null;
}

/**
 * A promo set's stamped printings by the plain card's number (decision 328):
 * "223" → { promopack: PDSK 223p, prerelease: PDSK 223s }. Pure.
 * @param {object[]} cards  the promo set's promo pack and prerelease cards
 * @returns {Map<string, { promopack?: object, prerelease?: object }>}
 */
export function stampedByNumber(cards) {
  const out = new Map();
  for (const c of cards) {
    const kind = stampKind(c);
    const m = /^0*(\d+)([ps])$/i.exec(String(c.collector_number ?? ''));
    if (!kind || !m) continue;
    const entry = out.get(m[1]) ?? {};
    entry[kind] ??= c;
    out.set(m[1], entry);
  }
  return out;
}

// A set's stamped printings, fetched once a page's life; a failed fetch is tried again next card.
const lists = new Map();

/**
 * This card's stamped printings (decision 328), or null when it has none.
 * @param {object} card  a Scryfall card, the plain printing
 * @param {{ search?: (q: string) => Promise<object[]> }} [opts]  Scryfall's (tests pass their own)
 * @returns {Promise<{ promopack?: object, prerelease?: object }|null>}
 */
export async function stampedOf(card, { search = (q) => scry.searchAll(q, { maxPages: 3 }) } = {}) {
  const code = `p${String(card?.set ?? '').toLowerCase()}`;
  if (!lists.has(code)) {
    const list = search(`e:${code} (is:promopack or is:prerelease)`).then(stampedByNumber);
    lists.set(code, list);
    list.catch(() => lists.delete(code));
  }
  const found = (await lists.get(code)).get(plainNumber(card.collector_number));
  if (!found) return null;
  // The same card: a promo set's number can't be trusted to name it alone.
  const same = Object.fromEntries(Object.entries(found).filter(([, c]) => c.name === card.name));
  return Object.keys(same).length ? same : null;
}

/** Forget the fetched lists (tests). */
export function forgetStamped() {
  lists.clear();
}

/**
 * Which stamp the spots show (decision 328): the one spot unlike the plain
 * card, when the card has that printing. Both unlike it (glare, a hand, the
 * wrong outline), or neither: none. Pure.
 * @param {{ promopack?: number, prerelease?: number }} dists  each spot's distance from the plain card
 * @param {{ promopack?: object, prerelease?: object }} stamped  the card's stamped printings
 * @returns {'promopack'|'prerelease'|null}
 */
export function pickStamp(dists, stamped) {
  const seen = Object.keys(STAMP_ZONES).filter((k) => (dists[k] ?? 0) >= STAMP_SEEN);
  return seen.length === 1 && stamped?.[seen[0]] ? seen[0] : null;
}

const shifted = (w, dx, dy) => ({ left: w.left + dx, right: w.right + dx, top: w.top + dy, bottom: w.bottom + dy });

/** A spot of the card in the picture against the plain card's: its best match within REACH. */
function spotDistance(frame, rect, pic, where, createCanvas) {
  const theirs = regionPrint(pic, { x: 0, y: 0, width: pic.width, height: pic.height }, where, createCanvas);
  const n = Math.round(REACH / STEP);
  let best = Infinity;
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      best = Math.min(best, printDistance(regionPrint(frame, rect, shifted(where, i * STEP, j * STEP), createCanvas), theirs));
    }
  }
  return best;
}

const pictureOf = (card) => card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null;

/**
 * Is the card in the picture a stamped promo of this plain card (decision 328)?
 * @param {object} frame  the camera's picture
 * @param {{ x: number, y: number, width: number, height: number }} rect  the card in it
 * @param {object} card  the plain printing the strip named
 * @param {{ loadImage: (url: string) => Promise<object>, createCanvas: Function, search?: Function }} deps
 * @returns {Promise<{ stamped: object, dists: object|null, kind: string|null, card: object|null }|null>}
 *   null: the card has no stamped printing (nothing checked); card: the stamped printing to take
 */
export async function checkStamp(frame, rect, card, { loadImage, createCanvas, search }) {
  const stamped = await stampedOf(card, search ? { search } : undefined);
  if (!stamped) return null;
  const url = pictureOf(card);
  if (!url) return { stamped, dists: null, kind: null, card: null };
  const pic = await loadImage(url);
  const dists = {};
  for (const [kind, where] of Object.entries(STAMP_ZONES)) {
    dists[kind] = Math.round(spotDistance(frame, rect, pic, where, createCanvas) * 100) / 100;
  }
  const kind = pickStamp(dists, stamped);
  return { stamped, dists, kind, card: kind ? stamped[kind] : null };
}
