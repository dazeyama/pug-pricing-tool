// The collector corner, found on each card and set straight (owner,
// 2026-10-16: "it's frequently going to need to be rotated a little, try to
// always make it have the text perfectly straight so it can be easily read.
// And have it move around more per card to match the zone it's supposed to
// be"). The card's view stays locked; within it, every look finds the
// collector line again in the card's bottom-left zone, measures how far its
// lines lean, and turns the cutout so they're level, then enlarges it and
// cleans it to black on white (mtgscan's threshold), which is what the
// person scanning sees and what's read first. If the line isn't found in the
// zone, the corner found when the view locked is used. DOM-free: the canvas
// maker is passed in.

import { binarizeCollectorText, locateCollectorTextBlocks, otsuThreshold } from './recognition/textLocator.js';
import { anchorBlock } from './lock.js';

// The bottom-left zone of a card where its collector line is, as fractions
// of the card, with room for a card landing a little off or turned, and for
// the card coming closer as the stack grows (decision 317: a card 30% bigger
// than the lock's outline has its line at about 1.07 down and -0.06 in; was
// left -0.04, bottom 1.03, which lost it past 15%). Measured on 48 modern
// cards grown past a stale outline: read right 28/7/0 (same, +15%, +30%) with
// the old zone and settings, 41/33/23 with these.
const ZONE = { left: -0.15, right: 0.66, top: 0.8, bottom: 1.18 };
// The locator ignores letters taller than 3% of its picture (it's made for
// whole photos): the zone is set on a taller dark canvas so its letters pass.
// `locatorLetters`: that canvas's height in the letters expected from the
// lock's card; `twoLines`: a collector line found alone is cut with room for
// the line above and below it (decision 317: as the stack grows the card
// comes closer, its letters outgrow the lock's, and the number line, the
// tallest, was dropped first, leaving "SNC ★ EN" alone and the number cut
// off). Tuned with the benchmark (scripts), so kept here together.
export const COLLECTOR_TUNING = { locatorLetters: 70, twoLines: true, zone: null };
// Room around the collector line in the cutout, in its letters' heights.
const MARGIN = 0.9;
// The letters are enlarged to about this tall, as mtgscan's reading likes them.
const LETTER_PX = 48;
// Tilts tried: up to 12° either way, half a degree apart.
const MAX_TILT = 12;
const TILT_STEP = 0.5;

/**
 * How far a block of text leans, in degrees (positive: running down to the
 * right): the tilt at which its text pixels fall into the sharpest rows.
 * Pure, for tests.
 * @param {ArrayLike<number>} gray  greys, row by row
 * @param {number} w
 * @param {number} h
 * @param {boolean} lightText  the letters are lighter than what's around them
 */
export function skewAngle(gray, w, h, lightText) {
  const t = otsuThreshold(gray);
  const xs = [];
  const ys = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = gray[y * w + x];
      if (lightText ? g > t : g < t) {
        xs.push(x - w / 2);
        ys.push(y - h / 2);
      }
    }
  }
  if (xs.length < 20) return 0;
  const size = Math.ceil(Math.hypot(w, h)) + 2;
  let best = 0;
  let bestScore = -1;
  for (let deg = -MAX_TILT; deg <= MAX_TILT + 1e-9; deg += TILT_STEP) {
    const a = (deg * Math.PI) / 180;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const rows = new Float64Array(size);
    for (let k = 0; k < xs.length; k++) {
      const r = Math.round(-xs[k] * sin + ys[k] * cos + size / 2);
      if (r >= 0 && r < size) rows[r] += 1;
    }
    let score = 0;
    for (const c of rows) score += c * c;
    // A level reading wins a tie.
    if (score > bestScore * 1.0001 || (Math.abs(score - bestScore) <= bestScore * 1e-4 && Math.abs(deg) < Math.abs(best))) {
      bestScore = score;
      best = deg;
    }
  }
  return best;
}

/** Greys of a canvas, and whether its middle is light (dark letters on a light border). */
function greysOf(canvas) {
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Float32Array(canvas.width * canvas.height);
  let sum = 0;
  for (let k = 0; k < gray.length; k++) {
    gray[k] = 0.299 * data[4 * k] + 0.587 * data[4 * k + 1] + 0.114 * data[4 * k + 2];
    sum += gray[k];
  }
  return { gray, light: sum / gray.length > 128 };
}

/**
 * How sharp the collector strip is (owner, 2026-10-16: the 1× lens is
 * "sometimes perfectly sharp", sometimes blurry): its steepest brightness
 * steps between neighbouring pixels (the 98th percentile) over its contrast
 * (the 98th less the 2nd percentile of brightness), times the letters'
 * height in px. A blur so many letter-heights wide reads the same at any
 * picture size; letters in focus have edges a pixel or two wide, out of
 * focus several. Pure, for tests.
 * @param {Float32Array} gray  brightness, row by row
 */
export function sharpness(gray, w, h, charHeight) {
  if (w < 3 || h < 3) return 0;
  const steps = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const k = y * w + x;
      steps.push(Math.max(Math.abs(gray[k + 1] - gray[k]), Math.abs(gray[k + w] - gray[k])));
    }
  }
  steps.sort((a, b) => a - b);
  const levels = Float32Array.from(gray).sort();
  const contrast = levels[Math.floor(levels.length * 0.98)] - levels[Math.floor(levels.length * 0.02)];
  if (contrast < 20) return 0;   // a blank patch: nothing to judge
  return (steps[Math.floor(steps.length * 0.98)] / contrast) * charHeight;
}

/**
 * This card's collector line, found in its bottom-left zone: { bounds,
 * charHeight } in the picture's px, or null.
 * @param {object} frame  the camera's picture (a canvas)
 * @param {{ card: { x: number, y: number, width: number, height: number } }} lock
 */
export function findCollector(frame, lock, createCanvas) {
  const { card } = lock;
  const Z = COLLECTOR_TUNING.zone ?? ZONE;
  const zx = Math.max(0, Math.floor(card.x + card.width * Z.left));
  const zy = Math.max(0, Math.floor(card.y + card.height * Z.top));
  const zw = Math.min(frame.width, Math.ceil(card.x + card.width * Z.right)) - zx;
  const zh = Math.min(frame.height, Math.ceil(card.y + card.height * Z.bottom)) - zy;
  if (zw < 20 || zh < 10) return null;
  // Letters are about 1.15% of the card's height: the canvas is made tall enough for the locator.
  const letter = card.height * 0.0115;
  const tall = Math.max(zh, Math.ceil(letter * COLLECTOR_TUNING.locatorLetters));
  const zone = createCanvas(zw, tall);
  const ctx = zone.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, zw, tall);
  ctx.drawImage(frame, zx, zy, zw, zh, 0, tall - zh, zw, zh);
  const block = anchorBlock(locateCollectorTextBlocks(zone, { maxCandidates: 3 }, createCanvas));
  if (!block) return null;
  return {
    bounds: { x: zx + block.bounds.x, y: zy + block.bounds.y - (tall - zh), width: block.bounds.width, height: block.bounds.height },
    charHeight: block.charHeight,
  };
}

/**
 * The collector corner, level, enlarged and cleaned to black on white.
 * @param {object} frame  the camera's picture (a canvas)
 * @param {{ card: object, collector: object, charHeight: number }} lock
 * @returns {{ canvas: object, tilt: number, found: boolean }}
 *   tilt: how far it leaned (degrees); found: the line was found on this card (else the locked corner)
 */
export function straightCutout(frame, lock, createCanvas) {
  const hit = findCollector(frame, lock, createCanvas);
  const charHeight = hit?.charHeight ?? lock.charHeight;
  let b = hit?.bounds ?? lock.collector;
  // One line found where a card's collector info is two (the number over the set code): room for
  // the other, above or below (decision 317).
  if (COLLECTOR_TUNING.twoLines && b.height < charHeight * 1.8) {
    b = { ...b, y: b.y - charHeight * 1.5, height: b.height + charHeight * 3 };
  }
  const pad = charHeight * MARGIN;
  const region = {
    x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad),
    width: Math.min(frame.width, b.x + b.width + pad) - Math.max(0, b.x - pad),
    height: Math.min(frame.height, b.y + b.height + pad) - Math.max(0, b.y - pad),
  };

  // How far it leans, measured on the region itself.
  const raw = createCanvas(Math.max(1, Math.round(region.width)), Math.max(1, Math.round(region.height)));
  raw.getContext('2d', { willReadFrequently: true }).drawImage(frame, region.x, region.y, region.width, region.height, 0, 0, raw.width, raw.height);
  const { gray, light } = greysOf(raw);
  const tilt = skewAngle(gray, raw.width, raw.height, !light);

  // Turned level about its middle, enlarged so its letters are ~48px; the
  // corners the turn uncovers filled with the border's own shade.
  const scale = Math.min(6, Math.max(0.5, LETTER_PX / charHeight));
  const a = (tilt * Math.PI) / 180;
  const outW = Math.max(1, Math.round(region.width * scale));
  const outH = Math.max(1, Math.round(region.height * scale));
  const level = createCanvas(outW, outH);
  const ctx = level.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = light ? '#fff' : '#000';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.translate(outW / 2, outH / 2);
  ctx.scale(scale, scale);
  ctx.rotate(-a);
  ctx.drawImage(frame, -(region.x + region.width / 2), -(region.y + region.height / 2));
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // mtgscan's cleaning reads light letters on dark: a light corner is turned round first.
  if (light) {
    const image = ctx.getImageData(0, 0, outW, outH);
    const { data } = image;
    for (let k = 0; k < data.length; k += 4) {
      data[k] = 255 - data[k];
      data[k + 1] = 255 - data[k + 1];
      data[k + 2] = 255 - data[k + 2];
    }
    ctx.putImageData(image, 0, 0);
  }
  return {
    canvas: binarizeCollectorText(level, createCanvas),
    tilt,
    found: Boolean(hit),
    sharpness: sharpness(gray, raw.width, raw.height, charHeight),
  };
}
