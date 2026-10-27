// Older cards (docs/SCAN_FUNCTION.md 6.2, tiers 2 and 3): a card printed
// before 2014 has no set code at the bottom, so it's named by its title,
// read from the top of the guide (the card filling it), and, from 1998 on,
// by the "123/350" at its bottom. DOM-free: the canvas maker is passed in
// (the browser's, or @napi-rs/canvas in the benchmark), and so is the OCR.

import { otsuThreshold } from './recognition/textLocator.js';
import { guideRect } from './guide.js';

// Where the title sits on a card, as fractions of the card: below the top
// border, left of the mana cost.
const TITLE = { top: 0.035, bottom: 0.105, left: 0.045, right: 0.78 };
// Where an old card's collector number sits: in the copyright line along
// the bottom border, in very small print.
const BOTTOM = { top: 0.925, bottom: 0.985, left: 0.03, right: 0.97 };
// The band is scaled to this height before it's read: the title's letters
// end up about 45px tall, the copyright line's about 30px.
const BAND_HEIGHT = { title: 72, bottom: 240 };

// Finding the title (owner, 2026-10-18: "Sometimes for older cards the name reading is misaligned …
// It detects the name too high (high most often, sometimes low)"; decision 308). The card's outline
// can sit a little off the card, and a fixed band then lands on the border or the art. So the band
// is looked for: down the top of the card, from a little above where the outline puts the top to a
// fifth of the way down, the place where a line of text sits, busy across its middle and calm above
// and below (a title bar's margins, or the border round an old card's name), the art and the
// border's edges being busy or calm all the way through.
const SEARCH = { from: -0.05, to: 0.2 };
const SEARCH_W = 320;            // the search is done on a copy this wide
const STEP_EDGE = 22;            // a change of brightness this big between neighbours is an edge
const APART = 0.02;              // two places to try are at least this far apart (of the card's height)

/**
 * White letters (decision 309): the pixels bright in every colour, where
 * `values` is each pixel's darkest channel; bright enough means past Otsu's
 * threshold and past 80% of the band's brightest (its top 1%), so it holds
 * in a dim photo as in a bright scan. Pure, for tests.
 * @param {Float32Array|number[]} values
 * @returns {number}  the threshold: brighter is a letter
 */
export function whiteThreshold(values) {
  const sorted = Float32Array.from(values).sort();
  const top = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] ?? 0;
  return Math.max(otsuThreshold(values), 0.8 * top);
}

/**
 * One band of the card, scaled, black text on white whichever way round it
 * was printed (dark on a light title bar, or light on a black border), with
 * a white margin: what Tesseract reads best. `white`: the letters taken as
 * the white ones (whiteThreshold), for the old frames' white titles with a
 * dark shadow (decision 309), which the usual way reads as hollow outlines
 * or with the frame's marbling round them.
 */
function band(frame, card, where, height, createCanvas, { white = false } = {}) {
  const x = card.x + card.width * where.left;
  const y = card.y + card.height * where.top;
  const w = card.width * (where.right - where.left);
  const h = card.height * (where.bottom - where.top);
  const scale = height / h;
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));
  const cut = createCanvas(outW, outH);
  const ctx = cut.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(frame, Math.round(x), Math.round(y), Math.round(w), Math.round(h), 0, 0, outW, outH);
  const image = ctx.getImageData(0, 0, outW, outH);
  const { data } = image;
  const gray = new Float32Array(outW * outH);
  const ink = new Uint8Array(gray.length);
  if (white) {
    for (let k = 0; k < gray.length; k++) gray[k] = Math.min(data[4 * k], data[4 * k + 1], data[4 * k + 2]);
    const t = whiteThreshold(gray);
    for (let k = 0; k < gray.length; k++) ink[k] = gray[k] > t ? 1 : 0;
  } else {
    for (let k = 0; k < gray.length; k++) gray[k] = 0.299 * data[4 * k] + 0.587 * data[4 * k + 1] + 0.114 * data[4 * k + 2];
    const t = otsuThreshold(gray);
    let light = 0;
    for (const g of gray) if (g > t) light += 1;
    // The text is the smaller class: on a light bar it's the dark pixels.
    const textIsDark = light > gray.length / 2;
    for (let k = 0; k < gray.length; k++) ink[k] = (textIsDark ? gray[k] <= t : gray[k] > t) ? 1 : 0;
  }
  // The title box's ruled edges and the card's border, long straight lines
  // of "ink", make Tesseract read nothing at all: white them out (a row
  // more than half ink, a column more than 60%).
  for (let y = 0; y < outH; y++) {
    let n = 0;
    for (let x = 0; x < outW; x++) n += ink[y * outW + x];
    if (n > outW * 0.5) for (let x = 0; x < outW; x++) ink[y * outW + x] = 0;
  }
  for (let x = 0; x < outW; x++) {
    let n = 0;
    for (let y = 0; y < outH; y++) n += ink[y * outW + x];
    if (n > outH * 0.6) for (let y = 0; y < outH; y++) ink[y * outW + x] = 0;
  }
  for (let k = 0; k < gray.length; k++) {
    const v = ink[k] ? 0 : 255;
    data[4 * k] = v;
    data[4 * k + 1] = v;
    data[4 * k + 2] = v;
    data[4 * k + 3] = 255;
  }
  const pad = Math.round(height * 0.3);
  const out = createCanvas(outW + 2 * pad, outH + 2 * pad);
  const octx = out.getContext('2d');
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.putImageData(image, pad, pad);
  return out;
}

/**
 * Each row's edges: how many neighbouring pixels across it differ by
 * STEP_EDGE or more. Pure, for tests.
 * @param {Float32Array|number[]} gray  w × h, row by row
 */
export function rowEdges(gray, w, h) {
  const out = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 1; x < w; x++) if (Math.abs(gray[y * w + x] - gray[y * w + x - 1]) >= STEP_EDGE) n += 1;
    out[y] = n / w;
  }
  return out;
}

/**
 * Where a line of text sits in a column of rows' edges: each place a band
 * `bandH` rows tall could start, scored by the edges across its middle 60%
 * less those in its top and bottom fifths; the best first, each at least
 * `apart` rows from those before it. Pure, for tests.
 * @returns {{ at: number, score: number }[]}
 */
export function textBands(edges, bandH, apart = 1) {
  const h = edges.length;
  const prefix = new Float64Array(h + 1);
  for (let y = 0; y < h; y++) prefix[y + 1] = prefix[y] + edges[y];
  const mean = (a, b) => (b > a ? (prefix[Math.min(h, b)] - prefix[Math.max(0, a)]) / (Math.min(h, b) - Math.max(0, a)) : 0);
  const edgeRows = Math.max(1, Math.round(bandH * 0.2));
  const all = [];
  for (let at = 0; at + bandH <= h; at++) {
    const middle = mean(at + edgeRows, at + bandH - edgeRows);
    const rim = (mean(at, at + edgeRows) + mean(at + bandH - edgeRows, at + bandH)) / 2;
    all.push({ at, score: middle - 1.5 * rim });
  }
  all.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const c of all) {
    if (c.score <= 0) break;
    if (picked.every((p) => Math.abs(p.at - c.at) >= apart)) picked.push(c);
    if (picked.length === 3) break;
  }
  return picked;
}

/**
 * Where the card's title is, as fractions of the card's height from its
 * outline's top (decision 308): the likeliest first, then the next ones
 * worth a try, and the fixed place last if none's near it.
 * @param {{ x: number, y: number, width: number, height: number }} card
 * @returns {number[]}  each a band's top, the band TITLE's height
 */
export function titleTops(frame, card, createCanvas) {
  const bandFrac = TITLE.bottom - TITLE.top;
  const x0 = Math.max(0, card.x + card.width * TITLE.left);
  const x1 = Math.min(frame.width, card.x + card.width * TITLE.right);
  const y0 = Math.max(0, card.y + card.height * SEARCH.from);
  const y1 = Math.min(frame.height, card.y + card.height * (SEARCH.to + bandFrac));
  const tops = [];
  if (x1 - x0 > 8 && y1 - y0 > 8) {
    const scale = SEARCH_W / (x1 - x0);
    const w = SEARCH_W;
    const h = Math.max(8, Math.round((y1 - y0) * scale));
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(frame, Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0), 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const gray = new Float32Array(w * h);
    for (let k = 0; k < gray.length; k++) gray[k] = 0.299 * data[4 * k] + 0.587 * data[4 * k + 1] + 0.114 * data[4 * k + 2];
    const bandH = Math.max(4, Math.round(card.height * bandFrac * scale));
    const apart = Math.max(1, Math.round(card.height * APART * scale));
    for (const { at } of textBands(rowEdges(gray, w, h), bandH, apart)) {
      tops.push((y0 + at / scale - card.y) / card.height);
    }
  }
  if (tops.every((t) => Math.abs(t - TITLE.top) >= APART)) tops.push(TITLE.top);
  return tops;
}

/** The title band starting `top` of the way down the card (TITLE's height and sides). */
const titleAt = (top) => ({ ...TITLE, top, bottom: top + (TITLE.bottom - TITLE.top) });

/**
 * The card's title as the reader sees it (black on white, its box's ruled
 * lines taken out), for the info box under the card when it's an older
 * card (owner, 2026-10-16: "focus the info box on the card name instead"),
 * where it was found (decision 308).
 * @param {{ x: number, y: number, width: number, height: number }} card  where the card is
 */
export function titleCutout(frame, card, createCanvas) {
  return band(frame, card, titleAt(titleTops(frame, card, createCanvas)[0]), BAND_HEIGHT.title, createCanvas);
}

/**
 * Where the card's name is in a title band (owner, 2026-10-26: "Make the name one crop in closer so the
 * name is larger and actually fills the box"; decision 553): for the box above the camera only, the
 * reader still reads the whole band. The band's columns with letter strokes in its middle rows, runs of
 * them joined across word gaps; the name is the first such run from the left at least as wide as the
 * band is high and dense like letters, not a thin rule (the mana cost is to its right, a stray mark at
 * the band's edge narrower). Then its rows, leaving out a rule that runs the run's whole width. Pure, for
 * tests.
 * @param {ArrayLike<number>} ink  1 for ink, 0 for paper, row by row
 * @returns {{ x0: number, x1: number, y0: number, y1: number }|null}  inclusive; null: no name found
 */
export function nameSpan(ink, w, h) {
  const top = Math.floor(h * 0.15);
  const bottom = Math.ceil(h * 0.85);
  const rows = Math.max(1, bottom - top);
  const col = new Array(w).fill(0);
  for (let y = top; y < bottom; y++) for (let x = 0; x < w; x++) col[x] += ink[y * w + x];
  // Runs of inked columns, joined across gaps narrower than half the band's height (a word gap).
  const runs = [];
  const gapMax = h * 0.5;
  let run = null;
  for (let x = 0; x < w; x++) {
    if (col[x] < 2) continue;
    if (run && x - run.x1 - 1 <= gapMax) run.x1 = x;
    else runs.push(run = { x0: x, x1: x });
  }
  const name = runs.find((r) => {
    const width = r.x1 - r.x0 + 1;
    if (width < h) return false;
    let sum = 0;
    for (let x = r.x0; x <= r.x1; x++) sum += col[x];
    return sum / width / rows >= 0.1;   // letters, not a thin rule (a few rows deep)
  });
  if (!name) return null;
  const width = name.x1 - name.x0 + 1;
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = name.x0; x <= name.x1; x++) n += ink[y * w + x];
    if (n >= width * 0.02 && n <= width * 0.7) {
      if (y0 < 0) y0 = y;
      y1 = y;
    }
  }
  return y0 < 0 ? null : { x0: name.x0, x1: name.x1, y0, y1 };
}

/**
 * The name cut out of a title band (titleCutout's), a little room around it, for the box above the
 * camera (decision 553); the whole band when no name is found in it.
 */
export function nameCutout(bandCanvas, createCanvas) {
  const { width: w, height: h } = bandCanvas;
  const { data } = bandCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
  const ink = new Uint8Array(w * h);
  for (let k = 0; k < ink.length; k++) ink[k] = data[4 * k] < 128 ? 1 : 0;
  const span = nameSpan(ink, w, h);
  if (!span) return bandCanvas;
  const pad = Math.round((span.y1 - span.y0 + 1) * 0.15);
  const x0 = Math.max(0, span.x0 - pad);
  const y0 = Math.max(0, span.y0 - pad);
  const cw = Math.min(w, span.x1 + pad + 1) - x0;
  const ch = Math.min(h, span.y1 + pad + 1) - y0;
  const out = createCanvas(cw, ch);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(bandCanvas, x0, y0, cw, ch, 0, 0, cw, ch);
  return out;
}

/** The share of a black-on-white canvas that's ink: next to none, the band's blank. */
export function inkShare(canvas) {
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  let ink = 0;
  for (let k = 0; k < data.length; k += 4) if (data[k] < 128) ink += 1;
  return ink / (data.length / 4);
}

/** The card's rectangle in the frame: the guide's, or the whole frame when the photo is the card. */
const cardIn = (frame, wholeFrame, card) => card ?? (wholeFrame
  ? { x: 0, y: 0, width: frame.width, height: frame.height }
  : guideRect(frame.width, frame.height));

/**
 * The text of the card's title (read as one line).
 * @param {object} frame  a canvas: the camera's picture
 * @param {(canvas: object) => Promise<string>} read  OCR, one line (PSM 7)
 * @param {(w: number, h: number) => object} createCanvas
 * @param {{ wholeFrame?: boolean, card?: { x: number, y: number, width: number, height: number },
 *   top?: number }} [opts]  card: where the card is (the locked view's); else the guide's place, or
 *   the whole picture; top: where its title starts (titleTops), else the fixed place
 */
export function readTitle(frame, read, createCanvas, { wholeFrame = false, card = null, top = TITLE.top } = {}) {
  return read(band(frame, cardIn(frame, wholeFrame, card), titleAt(top), BAND_HEIGHT.title, createCanvas));
}

/**
 * Read the card's title where it's found (decision 308), till `accept` takes
 * a reading: at the likeliest place as one line, then its white letters
 * (decision 309: the old frames' white titles, measured on 32 older cards,
 * clean and dimmed, 26–27 named before, 30 with this read after it); the
 * same at the next place; the usual read at the third; then the best place
 * as a block. Six reads at most, on a card that keeps failing. The reading
 * taken, or the last one.
 * @param {(text: string) => unknown} accept  a reading that names a card
 * @param {{ line: (c: object) => Promise<string>, block: (c: object) => Promise<string> }} reads  OCR
 * @param {{ wholeFrame?: boolean, card?: object, readings?: string[], how?: object }} [opts]  readings:
 *   each reading is added to it (the Which card? box's guess, decision 311); how: its `how` set to the
 *   read that was taken ('line', 'white' or 'block'), for the run log
 */
export async function findTitle(frame, reads, createCanvas, accept, {
  wholeFrame = false, card = null, readings = null, how = null,
} = {}) {
  const rect = cardIn(frame, wholeFrame, card);
  const tops = titleTops(frame, rect, createCanvas);
  const at = (top, white = false) => band(frame, rect, titleAt(top), BAND_HEIGHT.title, createCanvas, { white });
  const tries = [];
  tops.slice(0, 2).forEach((top) => tries.push([top, false], [top, true]));
  if (tops[2] != null) tries.push([tops[2], false]);
  let text = '';
  for (const [top, white] of tries) {
    text = await reads.line(at(top, white));
    readings?.push(text);
    if (accept(text)) {
      if (how) how.how = white ? 'white' : 'line';
      return text;
    }
  }
  text = await reads.block(at(tops[0]));
  readings?.push(text);
  if (how) how.how = 'block';
  return text;
}

/**
 * The text along the card's bottom border, where 1998–2014 cards print "123/350".
 * @param {(canvas: object) => Promise<string>} read  OCR, a block (PSM 6)
 */
export function readBottom(frame, read, createCanvas, { wholeFrame = false, card = null } = {}) {
  return read(band(frame, cardIn(frame, wholeFrame, card), BOTTOM, BAND_HEIGHT.bottom, createCanvas));
}

/**
 * The year a card was printed, from its copyright line ("© 1993–2007
 * Wizards", "Illus. & © 1995 Wizards"): the last year there, or null.
 * Pure, for tests.
 */
export function parseCopyrightYear(text) {
  const t = String(text ?? '');
  const range = /\b(19[89]\d|20[0-4]\d)\s*[-–—~]\s*(19[89]\d|20[0-4]\d)\b/.exec(t);
  if (range) return Number(range[2]);
  const one = /(?:©|\(c\)|\bc)\s*(19[89]\d|20[0-4]\d)\b/i.exec(t) ?? /\b(199\d|200\d|201[0-4])\s+Wizards/i.exec(t);
  return one ? Number(one[1]) : null;
}

/**
 * "123/350" in text read off a card's bottom: { number: '123', size: 350 },
 * or null. Pure, for tests. Leading zeros go, as Scryfall's numbers have none.
 */
export function parseOldNumber(text) {
  const m = /(?<![\d/])(\d{1,3})\s*\/\s*(\d{2,3})(?![\d/])/.exec(String(text ?? ''));
  if (!m) return null;
  const number = m[1].replace(/^0+(?=\d)/, '');
  const size = Number(m[2]);
  if (!size || Number(number) > size + 40) return null;   // 300/150: not a number of this card's set
  return { number, size };
}
