// The locked view (owner, 2026-10-16): once the first card is found, by its
// edges and a collector line where a card's is, the view is locked to that
// card. From then on the screen shows just the card, still; its collector
// corner, found again on each card and set straight (straighten.js), is shown
// enlarged under it and read first; and the card's art, always at the same
// place, tells a new card from the same one. The
// holder is snug, so each card lands where the last one did. If the camera
// shifts (an iPhone switches lenses by itself), the view is locked again
// once the card has clearly moved and stayed moved (owner's choice).
// DOM-free: the canvas maker is passed in.

import { findCard } from './cardEdges.js';

// On a modern card the collector block's left edge is 6.5% in and its top
// 93.6% down (measured on 17 cards, docs/SCAN_LEARNINGS.md 2.2): a block
// found near there, on the card, is its collector line.
const ON_CARD = { left: -0.03, right: 0.2, top: 0.85, bottom: 1.0 };
// The middle of the art box, as fractions of the card.
const ART = { left: 0.15, right: 0.85, top: 0.15, bottom: 0.5 };
// Room around the card on screen, and around the collector line in the
// cutout (in its letters' heights), for the next card landing a little off.
const VIEW_MARGIN = 0.03;
// A moved card is looked for this share of the locked card's size each side of it, no further.
const NEAR = 0.25;
const CUTOUT_MARGIN = 1.2;
// The art as a 16 × 10 thumbnail.
const AW = 16;
const AH = 10;

/** Below this the art is the same card's (a still picture: noise and the camera's exposure). */
export const ART_CHANGED = 12;
/** The card clearly elsewhere: its centre moved this share of its height, or its size this share. */
const MOVED = { centre: 0.06, size: 0.1 };
/** Two sightings of the card in one place: within these shares. */
const SAME_PLACE = { centre: 0.03, size: 0.05 };

/**
 * The block to take as the collector line: of the located blocks, the
 * left-most on the best one's row (not the copyright line to its right,
 * which sometimes ranks first).
 * @param {{ bounds: { x: number, y: number, width: number, height: number }, charHeight: number }[]} blocks  best first
 */
export function anchorBlock(blocks) {
  const best = blocks?.[0];
  if (!best) return null;
  const mid = (b) => b.bounds.y + b.bounds.height / 2;
  const row = blocks.filter((b) => Math.abs(mid(b) - mid(best)) <= best.bounds.height);
  return row.reduce((a, b) => (b.bounds.x < a.bounds.x ? b : a));
}

/** Is this block where a card's collector line is, on this card? */
export function blockOnCard(block, card) {
  if (!block || !card) return false;
  const rx = (block.bounds.x - card.x) / card.width;
  const ry = (block.bounds.y - card.y) / card.height;
  return rx >= ON_CARD.left && rx <= ON_CARD.right && ry >= ON_CARD.top && ry <= ON_CARD.bottom;
}

const clampTo = (r, w, h) => {
  const x = Math.max(0, r.x);
  const y = Math.max(0, r.y);
  return { x, y, width: Math.min(w, r.x + r.width) - x, height: Math.min(h, r.y + r.height) - y };
};

/**
 * Lock onto a card: where it is, where its collector line is, where its art
 * is, and what the screen shows (the card with a little room), all in the
 * picture's px.
 * @param {{ x: number, y: number, width: number, height: number }} card  findCard's outline
 * @param {{ bounds: object, charHeight: number }} block  its collector block
 * @param {{ width: number, height: number }} frame
 */
export function makeLock(card, block, frame) {
  const pad = block.charHeight * CUTOUT_MARGIN;
  return {
    card,
    collector: clampTo({
      x: block.bounds.x - pad, y: block.bounds.y - pad,
      width: block.bounds.width + 2 * pad, height: block.bounds.height + 2 * pad,
    }, frame.width, frame.height),
    charHeight: block.charHeight,
    art: {
      x: card.x + card.width * ART.left, y: card.y + card.height * ART.top,
      width: card.width * (ART.right - ART.left), height: card.height * (ART.bottom - ART.top),
    },
    view: clampTo({
      x: card.x - card.width * VIEW_MARGIN, y: card.y - card.height * VIEW_MARGIN,
      width: card.width * (1 + 2 * VIEW_MARGIN), height: card.height * (1 + 2 * VIEW_MARGIN),
    }, frame.width, frame.height),
    frame: { width: frame.width, height: frame.height },
  };
}

const centreGap = (a, b) => Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2));
const sizeGap = (a, b) => Math.abs(a.height - b.height) / a.height;

/** Is the card now clearly somewhere else than the locked one? */
export function movedFrom(locked, now) {
  return centreGap(locked, now) > locked.height * MOVED.centre || sizeGap(locked, now) > MOVED.size;
}

/** Two sightings of the card in one place (so a move has lasted)? */
export function samePlace(a, b) {
  return centreGap(a, b) <= a.height * SAME_PLACE.centre && sizeGap(a, b) <= SAME_PLACE.size;
}

/**
 * The card's art as a tiny thumbnail, each cell the true average of its
 * pixels, brightness and contrast evened out (the camera's exposure drifts).
 * The lock puts the art at the same place every time, so two of these say
 * whether the card in the holder is still the same one.
 * @returns {Float32Array}
 */
export function artPrint(frame, lock) {
  const r = clampTo(lock.art, frame.width, frame.height);
  const rx = Math.floor(r.x);
  const ry = Math.floor(r.y);
  const rw = Math.max(AW, Math.floor(r.width));
  const rh = Math.max(AH, Math.floor(r.height));
  const px = frame.getContext('2d', { willReadFrequently: true }).getImageData(rx, ry, rw, rh).data;
  const out = new Float32Array(AW * AH);
  const counts = new Uint32Array(AW * AH);
  for (let y = 0; y < rh; y++) {
    const cy = Math.min(AH - 1, Math.floor((y * AH) / rh));
    for (let x = 0; x < rw; x++) {
      const cx = Math.min(AW - 1, Math.floor((x * AW) / rw));
      const k = 4 * (y * rw + x);
      out[cy * AW + cx] += 0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2];
      counts[cy * AW + cx] += 1;
    }
  }
  let sum = 0;
  for (let k = 0; k < out.length; k++) {
    out[k] /= Math.max(1, counts[k]);
    sum += out[k];
  }
  const mean = sum / out.length;
  let spread = 0;
  for (const v of out) spread += (v - mean) ** 2;
  const scale = 32 / Math.max(1, Math.sqrt(spread / out.length));
  for (let k = 0; k < out.length; k++) out[k] = (out[k] - mean) * scale;
  return out;
}

/** How far apart two art thumbnails are: the average difference per cell, at the best of a one-cell shift. */
export function artDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let best = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      let d = 0;
      let n = 0;
      for (let y = Math.max(0, -dy); y < Math.min(AH, AH - dy); y++) {
        for (let x = Math.max(0, -dx); x < Math.min(AW, AW - dx); x++) {
          d += Math.abs(a[y * AW + x] - b[(y + dy) * AW + x + dx]);
          n += 1;
        }
      }
      best = Math.min(best, d / n);
    }
  }
  return best;
}

/** A part of the picture as a canvas of its own (the card, for finding its line when the corner misses). */
/**
 * The card, looked for only round where it's locked: the card and a
 * quarter of it each side (owner, 2026-10-16: the picture's sides "add
 * noise"), so whatever lies beside the holder can't be taken for it or set
 * the view moving. A card moved further than that: Reset view.
 * @param {{ width: number, height: number }} frame
 * @param {{ x: number, y: number, width: number, height: number }} locked  the locked card
 * @param {(w: number, h: number) => object} createCanvas
 * @returns {{ x: number, y: number, width: number, height: number }|null}  in the picture's px
 */
export function findCardNear(frame, locked, createCanvas) {
  const r = clampTo({
    x: locked.x - locked.width * NEAR, y: locked.y - locked.height * NEAR,
    width: locked.width * (1 + 2 * NEAR), height: locked.height * (1 + 2 * NEAR),
  }, frame.width, frame.height);
  const found = findCard(cropTo(frame, r, createCanvas), createCanvas);
  return found && { x: found.x + r.x, y: found.y + r.y, width: found.width, height: found.height };
}

export function cropTo(frame, r, createCanvas) {
  const c = clampTo(r, frame.width, frame.height);
  const out = createCanvas(Math.max(1, Math.round(c.width)), Math.max(1, Math.round(c.height)));
  out.getContext('2d', { willReadFrequently: true }).drawImage(frame, c.x, c.y, c.width, c.height, 0, 0, out.width, out.height);
  return out;
}
