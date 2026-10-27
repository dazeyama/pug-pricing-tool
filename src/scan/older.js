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
import { listNumber, listPrintingOf } from './listMark.js';

// The most printings the pick list shows at first; View all shows the rest.
const PICK_MAX = 12;
// Pages of printings fetched (175 a page): every printing of nearly any card but a basic land.
const PRINTING_PAGES = 4;

const plainNumber = (n) => String(n ?? '').replace(/^0+(?=\d)/, '').toLowerCase();

/**
 * A card's paper printings in English, oldest first (Scryfall gives them newest first). `signal`: the
 * scanner's look, its pages dropped when the card's time is up (decision 550).
 */
export function printingsOf(name, signal = null) {
  // Kept for the page's life (decision 557): the scanner fetches a name's printings in the background
  // a look or two before the look that goes by the name, and that look takes them from here. A failed
  // or given-up fetch isn't kept.
  const hit = printingsKept.get(name);
  if (hit) return hit;
  const promise = scry.searchAll(`!"${name.replace(/"/g, '')}" game:paper`, { maxPages: PRINTING_PAGES, signal })
    .then((cards) => cards.filter((c) => c.lang === 'en').reverse());
  printingsKept.set(name, promise);
  promise.catch(() => {
    if (printingsKept.get(name) === promise) printingsKept.delete(name);
  });
  return promise;
}
const printingsKept = new Map();

/**
 * A picture by its address, ready to be drawn and read on a canvas
 * (Scryfall's card images and set symbols allow it). An SVG is given its
 * drawing area's size first: Scryfall's carry only a viewBox, and Safari
 * then doesn't know how big to draw one.
 */
async function loadPicture(url, signal = null) {
  if (signal?.aborted) throw new Error('The card\'s time is up');   // decision 550
  let src = url;
  if (/\.svg(\?|$)/i.test(url)) {
    const text = await (await fetch(url, { signal })).text();
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
 * Just the card's name, from its title (decision 551: read on every look, beside the collector
 * strip, by the second reader): the title where it's found on the card (decision 308), each likely
 * place as one line till one names a card; then the best as a block (it copes with a stray mark
 * better).
 * @param {{ card?: object, read?: (canvas: object, mode: string) => Promise<string> }} [opts]
 *   read: which reader (ocr.js readText, or readTitleText beside the strip's)
 * @returns {Promise<{ name: string, how: string }|{ name: null, guess: () => string }>}  how: which
 *   read named it (the run log): the usual line, the white letters, or the block; guess: the reader's
 *   closest name for the Which card? box (decision 311), worked out only when it's asked for
 */
export async function readTitleName(frame, { card = null, read = readText } = {}) {
  const names = await scry.loadNames();
  const reads = { line: (c) => read(c, PSM_LINE), block: (c) => read(c, PSM_BLOCK) };
  const readings = [];
  const how = {};
  const match = matchName(await findTitle(frame, reads, defaultCreateCanvas, (t) => matchName(t, names), { card, readings, how }), names);
  if (!match) return { name: null, guess: () => guessName(readings, names)?.name ?? '' };
  return { name: match.name, how: how.how ?? 'line' };
}

/**
 * Which of a few cards this one is, by its title (decision 327: an FNM promo's
 * year): the title read where it's found till a reading names one of them.
 * @param {(text: string, cards: object[]) => object|null} named  promo.js cardNamed
 * @returns {Promise<object|null>}  the card, or null when no reading named one
 */
export async function titleAmong(frame, cards, named, { card = null, read = readText } = {}) {
  const reads = { line: (c) => read(c, PSM_LINE), block: (c) => read(c, PSM_BLOCK) };
  let picked = null;
  const text = await findTitle(frame, reads, defaultCreateCanvas, (t) => (picked = named(t, cards)), { card });
  return picked ?? named(text, cards);
}

/**
 * An older card's printings once its name is known (read, or typed in the
 * Which card? box, decision 311): taken by its "123/350" when that fits one,
 * else ranked by how the card looks, best first. With no picture to go by
 * (`frame` null: the name typed over a printing list that had no frame,
 * decision 420), every printing, oldest first, to pick by the set symbol.
 * `onPrintings`: told the likely printings as soon as they're known, unranked (decision 551), so
 * the pick list at a card's 3 s has them even while their pictures are still being compared.
 * `read`: which card reader (ocr.js).
 * @returns {Promise<{ tier: 2|3, name: string, number: string|null, cards: object[], all: object[] }|null>}
 *   null: Scryfall has no printing of that name
 */
export async function printingsFor(name, frame, {
  texts = [], card = null, listMark = null, signal = null, read = readText, onPrintings = null,
} = {}) {
  const match = { name };
  const bottoms = [...texts];
  let old = bottoms.map(parseOldNumber).find(Boolean) ?? null;
  if (!old && frame) {
    bottoms.push(await readBottom(frame, (c) => read(c, PSM_BLOCK), defaultCreateCanvas, { card }));
    old = parseOldNumber(bottoms.at(-1));
  }
  const printings = await printingsOf(match.name, signal);
  if (!printings.length) return null;
  const sets = await scry.loadSets();

  let hits = [];
  if (old) {
    const sizeOf = (c) => sets.get(c.set)?.printed_size ?? sets.get(c.set)?.card_count ?? null;
    hits = printings.filter((c) => plainNumber(c.collector_number) === old.number
      && (sizeOf(c) == null || sizeOf(c) === old.size));
    // The number and the set's size fit one printing: that's it, or, with the List's mark seen,
    // the List's printing of it (decision 355: the mark used to count only when ranking).
    if (hits.length === 1) {
      const listed = listMark === true
        ? listPrintingOf(hits[0], printings) ?? await scry.cardBySetNumber('plst', listNumber(hits[0]), { signal }).catch(() => null)
        : null;
      return { tier: 2, name: match.name, number: old.number, cards: [listed ?? hits[0]], all: printings };
    }
  }
  const tier = hits.length ? 2 : 3;
  const number = hits.length ? old.number : null;
  const year = bottoms.map(parseCopyrightYear).find(Boolean) ?? null;
  // Unranked: those with the number read, or of the copyright line's year (or the one before).
  const thatYear = year
    ? printings.filter((c) => {
      const y = Number((c.released_at ?? '').slice(0, 4));
      return y === year || y === year - 1;
    })
    : [];
  const likely = hits.length ? hits : thatYear.length ? thatYear : printings;
  onPrintings?.(likely.slice(0, PICK_MAX), { tier });
  // Every printing ranked by how the card looks; one clearly ahead is taken.
  if (frame) try {
    const { ranked, winner } = await rankPrintings(frame, card ?? guideRect(frame.width, frame.height), printings, {
      text: bottoms.join(' '),
      year,
      number,
      older: true,
      listMark,
      setIcon: (code) => sets.get(code)?.icon_svg_uri ?? null,
      setType: (code) => sets.get(code)?.set_type ?? null,
      loadImage: (url) => loadPicture(url, signal),
      createCanvas: defaultCreateCanvas,
    });
    if (winner) return { tier, name: match.name, number, cards: [winner], all: printings };
    return { tier, name: match.name, number, cards: ranked.slice(0, PICK_MAX).map((r) => r.card), all: printings };
  } catch (e) {
    if (!signal?.aborted) console.warn('Ranking the printings by look failed', e);
  }
  return { tier, name: match.name, number, cards: likely.slice(0, PICK_MAX), all: printings };
}
