// Older cards (docs/SCAN_FUNCTION.md 6.2, tiers 2 and 3): a card printed
// before 2014 has no set code at the bottom, so it's named by its title,
// read from the top of the guide (the card filling it), and, from 1998 on,
// by the "123/350" at its bottom. DOM-free: the canvas maker is passed in
// (the browser's, or @napi-rs/canvas in the benchmark), and so is the OCR.

import { otsuThreshold } from './recognition/textLocator.js';
import { guideRect } from './guide.js';

// Where the title sits on a card, as fractions of the card: below the top
// border, left of the mana cost.
const TITLE = { top: 0.035, bottom: 0.105, left: 0.065, right: 0.78 };
// Where an old card's collector number sits: in the copyright line along
// the bottom border, in very small print.
const BOTTOM = { top: 0.925, bottom: 0.985, left: 0.03, right: 0.97 };
// The band is scaled to this height before it's read: the title's letters
// end up about 45px tall, the copyright line's about 30px.
const BAND_HEIGHT = { title: 72, bottom: 240 };

/**
 * One band of the card, scaled, black text on white whichever way round it
 * was printed (dark on a light title bar, or light on a black border), with
 * a white margin: what Tesseract reads best.
 */
function band(frame, card, where, height, createCanvas) {
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
  for (let k = 0; k < gray.length; k++) gray[k] = 0.299 * data[4 * k] + 0.587 * data[4 * k + 1] + 0.114 * data[4 * k + 2];
  const t = otsuThreshold(gray);
  let light = 0;
  for (const g of gray) if (g > t) light += 1;
  // The text is the smaller class: on a light bar it's the dark pixels.
  const textIsDark = light > gray.length / 2;
  const ink = new Uint8Array(gray.length);
  for (let k = 0; k < gray.length; k++) ink[k] = (textIsDark ? gray[k] <= t : gray[k] > t) ? 1 : 0;
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

/** The card's rectangle in the frame: the guide's, or the whole frame when the photo is the card. */
const cardIn = (frame, wholeFrame, card) => card ?? (wholeFrame
  ? { x: 0, y: 0, width: frame.width, height: frame.height }
  : guideRect(frame.width, frame.height));

/**
 * The text of the card's title (read as one line).
 * @param {object} frame  a canvas: the camera's picture
 * @param {(canvas: object) => Promise<string>} read  OCR, one line (PSM 7)
 * @param {(w: number, h: number) => object} createCanvas
 * @param {{ wholeFrame?: boolean, card?: { x: number, y: number, width: number, height: number } }} [opts]
 *   card: where the card is (the locked view's); else the guide's place, or the whole picture
 */
export function readTitle(frame, read, createCanvas, { wholeFrame = false, card = null } = {}) {
  return read(band(frame, cardIn(frame, wholeFrame, card), TITLE, BAND_HEIGHT.title, createCanvas));
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
