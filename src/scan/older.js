// Naming an older card's printing (docs/SCAN_FUNCTION.md 6.2):
//  - tier 2, 1998–2014: its title and its "123/350" → the printings of that
//    name with that number, in a set of that size (almost always one);
//  - tier 3, before 1998 (no number), or a number that couldn't be read:
//    its title → its printings.
// Several printings left, they're ranked by how the card looks
// (printingMatch.js: its art, border, frame, artist, set symbol, year and
// number); one clearly ahead is taken, else the phone lists them, best
// first, to pick from (owner, 2026-10-16: "sometimes automatically accepted
// like newer ones").

import * as scry from '../lib/scryfall.js';
import { defaultCreateCanvas } from './recognition/canvasUtil.js';
import { PSM_BLOCK, PSM_LINE, readText } from './ocr.js';
import { findTitle, parseCopyrightYear, parseOldNumber, readBottom } from './titles.js';
import { guessName, matchName } from './nameMatch.js';
import { guideRect } from './guide.js';
import { rankPrintings } from './printingMatch.js';

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
 * A picture by its address, ready to be drawn and read on a canvas
 * (Scryfall's card images and set symbols allow it). An SVG is given its
 * drawing area's size first: Scryfall's carry only a viewBox, and Safari
 * then doesn't know how big to draw one.
 */
async function loadPicture(url) {
  let src = url;
  if (/\.svg(\?|$)/i.test(url)) {
    const text = await (await fetch(url)).text();
    const box = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(text);
    const sized = box && !/<svg[^>]*\swidth=/.test(text) ? text.replace('<svg', `<svg width="${box[1]}" height="${box[2]}"`) : text;
    src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No picture at ${url}`));
    img.src = src;
  });
}

/**
 * Read an older card in the frame: its name, and its number if it has one.
 * @param {object} frame  the camera's picture
 * @param {{ texts?: string[], card?: object, listMark?: boolean|null }} [opts]  listMark: The List's
 *   mark seen at the card's corner (listMark.js); texts: what the collector-line reading already read: on a
 *   black-bordered card it's the copyright line with the "123/350" in it, so no second read
 * @returns {Promise<{ tier: 2|3, name: string, number: string|null, cards: object[], all: object[] }
 *   |{ name: null, guess: string }|null>}  { name: null, guess }: the title couldn't be named clearly,
 *   guess the reader's closest name ('' for none), for the Which card? box (decision 311); null: no
 *   printing of the name found; cards: one (the printing to take), or the likely ones, best first;
 *   all: every printing of that name, oldest first (the pick list's View all)
 */
export async function readOlderCard(frame, { texts = [], card = null, listMark = null } = {}) {
  const names = await scry.loadNames();
  // The title where it's found on the card (decision 308), each likely place as one line till one
  // names a card; then the best as a block (it copes with a stray mark better).
  const reads = { line: (c) => readText(c, PSM_LINE), block: (c) => readText(c, PSM_BLOCK) };
  const readings = [];
  const how = {};
  const match = matchName(await findTitle(frame, reads, defaultCreateCanvas, (t) => matchName(t, names), { card, readings, how }), names);
  if (!match) return { name: null, guess: guessName(readings, names)?.name ?? '' };
  const found = await printingsFor(match.name, frame, { texts, card, listMark });
  // Which read named it (the run log): the usual line, the white letters, or the block.
  return found && { ...found, how: how.how ?? 'line' };
}

/**
 * An older card's printings once its name is known (read, or typed in the
 * Which card? box, decision 311): taken by its "123/350" when that fits one,
 * else ranked by how the card looks, best first.
 * @returns {Promise<{ tier: 2|3, name: string, number: string|null, cards: object[], all: object[] }|null>}
 *   null: Scryfall has no printing of that name
 */
export async function printingsFor(name, frame, { texts = [], card = null, listMark = null } = {}) {
  const match = { name };
  const bottoms = [...texts];
  let old = bottoms.map(parseOldNumber).find(Boolean) ?? null;
  if (!old) {
    bottoms.push(await readBottom(frame, (c) => readText(c, PSM_BLOCK), defaultCreateCanvas, { card }));
    old = parseOldNumber(bottoms.at(-1));
  }
  const printings = await printingsOf(match.name);
  if (!printings.length) return null;
  const sets = await scry.loadSets();

  let hits = [];
  if (old) {
    const sizeOf = (c) => sets.get(c.set)?.printed_size ?? sets.get(c.set)?.card_count ?? null;
    hits = printings.filter((c) => plainNumber(c.collector_number) === old.number
      && (sizeOf(c) == null || sizeOf(c) === old.size));
    // The number and the set's size fit one printing: that's it.
    if (hits.length === 1) return { tier: 2, name: match.name, number: old.number, cards: hits, all: printings };
  }
  const tier = hits.length ? 2 : 3;
  const number = hits.length ? old.number : null;
  const year = bottoms.map(parseCopyrightYear).find(Boolean) ?? null;
  // Every printing ranked by how the card looks; one clearly ahead is taken.
  try {
    const { ranked, winner } = await rankPrintings(frame, card ?? guideRect(frame.width, frame.height), printings, {
      text: bottoms.join(' '),
      year,
      number,
      older: true,
      listMark,
      setIcon: (code) => sets.get(code)?.icon_svg_uri ?? null,
      setType: (code) => sets.get(code)?.set_type ?? null,
      loadImage: loadPicture,
      createCanvas: defaultCreateCanvas,
    });
    if (winner) return { tier, name: match.name, number, cards: [winner], all: printings };
    return { tier, name: match.name, number, cards: ranked.slice(0, PICK_MAX).map((r) => r.card), all: printings };
  } catch (e) {
    console.warn('Ranking the printings by look failed', e);
  }
  // Unranked: those with the number read, or of the copyright line's year (or the one before).
  const thatYear = year
    ? printings.filter((c) => {
      const y = Number((c.released_at ?? '').slice(0, 4));
      return y === year || y === year - 1;
    })
    : [];
  const likely = hits.length ? hits : thatYear.length ? thatYear : printings;
  return { tier, name: match.name, number, cards: likely.slice(0, PICK_MAX), all: printings };
}
