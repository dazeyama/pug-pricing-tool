// Naming an older card's printing (docs/SCAN_FUNCTION.md 6.2):
//  - tier 2, 1998–2014: its title and its "123/350" → the printings of that
//    name with that number, in a set of that size (almost always one);
//  - tier 3, before 1998 (no number), or a number that couldn't be read:
//    its title → its printings, oldest first, narrowed to the year on its
//    copyright line when that was read, for staff to pick by the set symbol.
// Several printings left, and the phone lists them to pick from.

import * as scry from '../lib/scryfall.js';
import { defaultCreateCanvas } from './recognition/canvasUtil.js';
import { PSM_BLOCK, PSM_LINE, readText } from './ocr.js';
import { parseCopyrightYear, parseOldNumber, readBottom, readTitle } from './titles.js';
import { matchName } from './nameMatch.js';

// The most printings the pick list shows at first; View all shows the rest.
const PICK_MAX = 12;
// Pages of printings fetched (175 a page): every printing of nearly any card but a basic land.
const PRINTING_PAGES = 4;

const plainNumber = (n) => String(n ?? '').replace(/^0+(?=\d)/, '').toLowerCase();

/** A card's paper printings in English, oldest first (Scryfall gives them newest first). */
async function printingsOf(name) {
  const cards = await scry.searchAll(`!"${name.replace(/"/g, '')}" game:paper`, { maxPages: PRINTING_PAGES });
  return cards.filter((c) => c.lang === 'en').reverse();
}

/**
 * Read an older card in the frame: its name, and its number if it has one.
 * @param {object} frame  the camera's picture
 * @param {{ texts?: string[] }} [opts]  what the collector-line reading already read: on a
 *   black-bordered card it's the copyright line with the "123/350" in it, so no second read
 * @returns {Promise<{ tier: 2|3, name: string, number: string|null, cards: object[], all: object[] }|null>}
 *   null: the title couldn't be named clearly; cards: the likely ones, oldest first, one or more;
 *   all: every printing of that name, oldest first (the pick list's View all)
 */
export async function readOlderCard(frame, { texts = [], card = null } = {}) {
  const names = await scry.loadNames();
  // As one line first; if that names nothing clearly, as a block (it copes with a stray mark better).
  let match = matchName(await readTitle(frame, (c) => readText(c, PSM_LINE), defaultCreateCanvas, { card }), names);
  match ??= matchName(await readTitle(frame, (c) => readText(c, PSM_BLOCK), defaultCreateCanvas, { card }), names);
  if (!match) return null;
  const bottoms = [...texts];
  let old = bottoms.map(parseOldNumber).find(Boolean) ?? null;
  if (!old) {
    bottoms.push(await readBottom(frame, (c) => readText(c, PSM_BLOCK), defaultCreateCanvas, { card }));
    old = parseOldNumber(bottoms.at(-1));
  }
  const printings = await printingsOf(match.name);
  if (!printings.length) return null;

  if (old) {
    const sets = await scry.loadSets();
    const sizeOf = (c) => sets.get(c.set)?.printed_size ?? sets.get(c.set)?.card_count ?? null;
    const hits = printings.filter((c) => plainNumber(c.collector_number) === old.number
      && (sizeOf(c) == null || sizeOf(c) === old.size));
    if (hits.length) return { tier: 2, name: match.name, number: old.number, cards: hits.slice(0, PICK_MAX), all: printings };
  }
  // No number (before 1998), or none read: every printing, unless the
  // copyright line's year narrows them (printed that year or the one before).
  const year = bottoms.map(parseCopyrightYear).find(Boolean) ?? null;
  const thatYear = year
    ? printings.filter((c) => {
      const y = Number((c.released_at ?? '').slice(0, 4));
      return y === year || y === year - 1;
    })
    : [];
  return {
    tier: 3, name: match.name, number: null, cards: (thatYear.length ? thatYear : printings).slice(0, PICK_MAX), all: printings,
  };
}
