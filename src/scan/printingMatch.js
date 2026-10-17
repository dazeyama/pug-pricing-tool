// Choosing an older card's printing by how it looks (owner, 2026-10-16:
// "Build all of this. I want to get older cards to a state where they are
// sometimes automatically accepted like newer ones to the best of our
// abilities"). The title names an older card; which printing it is, the card
// in the holder shows. Each printing of that name is scored, against
// Scryfall's own picture of it and its set's symbol, on:
//  - its art: reprints often have new art (a small colour fingerprint of the
//    middle of the art box, each colour evened out, a cell's shift allowed);
//  - its border: black or white (the band just inside the card's edge);
//  - its frame: a printing in today's frame (2015 on) has its set code at the
//    bottom, which would have been read, so it's unlikely here;
//  - the artist credited at its bottom (the text already read there);
//  - its set symbol: the shape at the type line's right end against the
//    set's (Alpha to Fifth Edition have none);
//  - the copyright year and "123/350" read at its bottom, when they were.
// A printing clearly ahead is taken; otherwise they're offered best first.
// DOM-free: the canvas maker and the image loader are passed in.

import { editDistance } from './resolve.js';

/** The middle of the art box, as fractions of the card: inside every frame's art box (1993 to today's). */
const ART = { left: 0.14, right: 0.86, top: 0.15, bottom: 0.5 };
const GRID_W = 10;
const GRID_H = 7;
/** Where the set symbol is looked for: the type line's right end, every frame. */
const SYMBOL = { left: 0.8, right: 0.97, top: 0.53, bottom: 0.63 };
/** The border sampled between these shares of the card's width inside its edge. */
const RING = { outer: 0.008, inner: 0.03 };
/**
 * A symbol fits this well or better somewhere, and the card shows one. Its shape tells sets apart
 * only a little (at ~25px, a little blurred, most symbols fit most outlines 0.8–0.95, and a blank
 * type line's edges up to ~0.7), so it mostly says whether there's a symbol at all (Alpha to Fifth
 * Edition have none).
 */
export const SYMBOL_SEEN = 0.75;
/** Kinds of set whose symbol is a generic one (a promo's): not compared. */
const PROMO_TYPES = new Set(['promo', 'memorabilia', 'token', 'minigame']);
/** Sets printed with no symbol on their cards. */
const NO_SYMBOL = new Set(['lea', 'leb', '2ed', '3ed', '4ed', '5ed', 'sum', 'ced', 'cei', 'fbb', '4bb']);

/**
 * What each clue adds to a printing's score (calibrated on Scryfall's scans
 * of 18 much-reprinted cards' printings laid in a simulated holder:
 * docs/SCAN_FUNCTION.md 17).
 */
export const WEIGHTS = {
  art: 3, // × from +1 (the same art) to −1 (clearly other art)
  border: { match: 1, miss: -2 },
  frame: -1.5, // today's frame
  symbol: 1.5, // none seen and none printed (+), or seen and none printed (−)
  symbolShape: 0.5, // × from +1 (the best fit) to −1 (well under it)
  artist: 1.5,
  year: 1,
  number: 2.5,
};
/** A printing is taken at this score or more, this far ahead of the next. */
export const TAKE = { score: 4, lead: 2 };

/** The rectangle `where` (fractions) of `card`, in its picture's px. */
const part = (card, where) => ({
  x: card.x + card.width * where.left,
  y: card.y + card.height * where.top,
  w: card.width * (where.right - where.left),
  h: card.height * (where.bottom - where.top),
});

/**
 * A region as a small colour fingerprint: GRID_W × GRID_H true averages of
 * each of red, green and blue, each evened out (mean 0, spread 1), so the
 * camera's light and white balance count for little.
 * @param {object} source  a picture (canvas or image)
 * @param {{ x: number, y: number, width: number, height: number }} card  the card in it
 * @returns {Float32Array}  3 × GRID_W × GRID_H
 */
export function regionPrint(source, card, where, createCanvas) {
  const r = part(card, where);
  const K = 8;   // drawn at 8 px a cell, then averaged: true averages, little aliasing
  const c = createCanvas(GRID_W * K, GRID_H * K);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const n = GRID_W * GRID_H;
  const out = new Float32Array(3 * n);
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const sums = [0, 0, 0];
      for (let y = gy * K; y < (gy + 1) * K; y++) {
        for (let x = gx * K; x < (gx + 1) * K; x++) {
          const k = 4 * (y * c.width + x);
          sums[0] += data[k];
          sums[1] += data[k + 1];
          sums[2] += data[k + 2];
        }
      }
      for (let ch = 0; ch < 3; ch++) out[ch * n + gy * GRID_W + gx] = sums[ch] / (K * K);
    }
  }
  for (let ch = 0; ch < 3; ch++) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += out[ch * n + i];
    mean /= n;
    let sd = 0;
    for (let i = 0; i < n; i++) sd += (out[ch * n + i] - mean) ** 2;
    sd = Math.max(8, Math.sqrt(sd / n));
    for (let i = 0; i < n; i++) out[ch * n + i] = (out[ch * n + i] - mean) / sd;
  }
  return out;
}

/** How unlike two fingerprints are: the mean difference, the best of a cell's shift each way. 0 the same; ~1.1 unrelated. */
export function printDistance(a, b) {
  const n = GRID_W * GRID_H;
  let best = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      let sum = 0;
      let count = 0;
      for (let ch = 0; ch < 3; ch++) {
        for (let y = Math.max(0, -dy); y < Math.min(GRID_H, GRID_H - dy); y++) {
          for (let x = Math.max(0, -dx); x < Math.min(GRID_W, GRID_W - dx); x++) {
            sum += Math.abs(a[ch * n + y * GRID_W + x] - b[ch * n + (y + dy) * GRID_W + x + dx]);
            count += 1;
          }
        }
      }
      best = Math.min(best, sum / count);
    }
  }
  return best;
}

/** How bright the card's border is (0–255): the band just inside its edge, all four sides. */
export function borderTone(source, card, createCanvas) {
  const t0 = card.width * RING.outer;
  const t1 = card.width * RING.inner;
  const strips = [
    [card.x + t0, card.y + t1, t1 - t0, card.height - 2 * t1],                       // left
    [card.x + card.width - t1, card.y + t1, t1 - t0, card.height - 2 * t1],          // right
    [card.x + t1, card.y + t0, card.width - 2 * t1, t1 - t0],                        // top
    [card.x + t1, card.y + card.height - t1, card.width - 2 * t1, t1 - t0],          // bottom
  ];
  let sum = 0;
  let n = 0;
  const c = createCanvas(8, 32);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  for (const [x, y, w, h] of strips) {
    if (w <= 0 || h <= 0) continue;
    ctx.drawImage(source, x, y, w, h, 0, 0, 8, 32);
    const { data } = ctx.getImageData(0, 0, 8, 32);
    for (let k = 0; k < data.length; k += 4) {
      sum += 0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2];
      n += 1;
    }
  }
  return n ? sum / n : 128;
}

/** A border's brightness as 'dark', 'light', or null (between). */
export function borderKind(tone) {
  if (tone < 95) return 'dark';
  if (tone > 140) return 'light';
  return null;
}

/** The border a printing has, as borderKind says it: black (or none) dark, white light, silver or gold neither. */
const printedBorder = (p) => (p.border_color === 'black' || p.border_color === 'borderless'
  ? 'dark' : p.border_color === 'white' ? 'light' : null);

/** A mask grown by a pixel each way. */
function grow(mask, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      out[k] = mask[k] || (x > 0 && mask[k - 1]) || (x < w - 1 && mask[k + 1]) || (y > 0 && mask[k - w]) || (y < h - 1 && mask[k + w]) ? 1 : 0;
    }
  }
  return out;
}

// The set symbol, by its outline: each candidate set's symbol (Scryfall's SVG) drawn at a few
// sizes and slid over the edges at the type line's right end, scored by how well the outlines
// meet (a chamfer match: the share of the symbol's outline on an edge there, and the share of the
// edges in its box on its outline). It needs no clean cut-out, so a blurred or broken outline, a
// white, silver or gold symbol outlined in black, or a black one, light type line or dark, all do.

/** The symbol's own height on a card (its ink), as shares of the card's height, tried in turn. */
const SYMBOL_HEIGHTS = [0.022, 0.027, 0.032, 0.038, 0.044];
/** The card's width the region is looked at in (px): the symbol some 20–36px tall. */
const SYMBOL_CARD_W = 600;

/**
 * The edges at the type line's right end, ready to be matched: an edge map (the strongest steps,
 * long ruled lines taken out), it grown a pixel, and a running count of edges for any box's total.
 */
export function symbolArea(source, card, createCanvas) {
  const r = part(card, SYMBOL);
  const scale = SYMBOL_CARD_W / card.width;
  const w = Math.max(3, Math.round(r.w * scale));
  const h = Math.max(3, Math.round(r.h * scale));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let k = 0; k < gray.length; k++) gray[k] = 0.299 * data[4 * k] + 0.587 * data[4 * k + 1] + 0.114 * data[4 * k + 2];
  const step = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      step[k] = Math.abs(gray[k + 1] - gray[k - 1]) + Math.abs(gray[k + w] - gray[k - w]);
    }
  }
  const sorted = Float32Array.from(step).sort();
  const cut = Math.max(40, sorted[Math.floor(sorted.length * 0.8)]);
  const edges = new Uint8Array(w * h);
  for (let k = 0; k < step.length; k++) edges[k] = step[k] >= cut ? 1 : 0;
  // The type line's ruled edges and the card's frame: long straight lines, not the symbol. The
  // rows they're in say where the type line is: the pair 3–6% of the card's height apart nearest
  // its usual middle (57.5% down); else that usual middle.
  const ruled = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += edges[y * w + x];
    if (n > w * 0.6) {
      ruled.push(y);
      for (let x = 0; x < w; x++) edges[y * w + x] = 0;
    }
  }
  const cardH = card.height * scale;
  const usual = (0.575 - SYMBOL.top) * cardH;
  let lineMid = usual;
  let lineH = 0.045 * cardH;
  let bestGap = Infinity;
  for (const a of ruled) {
    for (const b of ruled) {
      const gap = b - a;
      if (gap < 0.03 * cardH || gap > 0.06 * cardH) continue;
      const off = Math.abs((a + b) / 2 - usual);
      if (off < bestGap && off < 0.03 * cardH) {
        bestGap = off;
        lineMid = (a + b) / 2;
        lineH = gap;
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) n += edges[y * w + x];
    if (n > h * 0.7) for (let y = 0; y < h; y++) edges[y * w + x] = 0;
  }
  const count = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += edges[y * w + x];
      count[(y + 1) * (w + 1) + x + 1] = count[y * (w + 1) + x + 1] + row;
    }
  }
  // Where a symbol's box may lie: its middle within a fifth of the type line's height of the line's
  // middle, its right side between 88% and 95.5% of the card's width.
  const toX = (share) => Math.round(((share - SYMBOL.left) / (SYMBOL.right - SYMBOL.left)) * w);
  return {
    w, h, edges, near: grow(edges, w, h), count, cardH,
    mid: { min: lineMid - lineH * 0.2, max: lineMid + lineH * 0.2 },
    right: { min: toX(0.88), max: toX(0.955) },
  };
}

/**
 * A set's symbol drawn at each height tried: its outline (inner edges too: the "10" in M10's) as
 * offsets, and that outline grown a pixel, in its own box.
 */
export function symbolTemplates(image, cardH, createCanvas) {
  // Drawn large once, and cut to its ink: an SVG's drawing area is often square round a wide symbol.
  const iw = image.width || image.naturalWidth || 100;
  const ih = image.height || image.naturalHeight || 100;
  const bigH = 256;
  const bigW = Math.max(1, Math.round((bigH * iw) / ih));
  const big = createCanvas(bigW, bigH);
  const bctx = big.getContext('2d', { willReadFrequently: true });
  bctx.drawImage(image, 0, 0, bigW, bigH);
  const bdata = bctx.getImageData(0, 0, bigW, bigH).data;
  let x0 = bigW;
  let y0 = bigH;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < bigH; y++) {
    for (let x = 0; x < bigW; x++) {
      if (bdata[4 * (y * bigW + x) + 3] > 128) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < 0) return [];
  const inkW = x1 - x0 + 1;
  const inkH = y1 - y0 + 1;
  return SYMBOL_HEIGHTS.map((share) => {
    const h = Math.max(6, Math.round(cardH * share));
    const w = Math.max(3, Math.round((h * inkW) / inkH));
    const W = w + 2;
    const H = h + 2;
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(big, x0, y0, inkW, inkH, 1, 1, w, h);
    const { data } = ctx.getImageData(0, 0, W, H);
    const ink = new Uint8Array(W * H);
    for (let k = 0; k < ink.length; k++) ink[k] = data[4 * k + 3] > 128 ? 1 : 0;
    const line = new Uint8Array(W * H);
    const points = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        const v = ink[k];
        const edge = (x > 0 && ink[k - 1] !== v) || (x < W - 1 && ink[k + 1] !== v)
          || (y > 0 && ink[k - W] !== v) || (y < H - 1 && ink[k + W] !== v);
        if (edge && v) {
          line[k] = 1;
          points.push(x, y);
        }
      }
    }
    return { w: W, h: H, points: Int16Array.from(points), near: grow(line, W, H) };
  });
}

/**
 * How well a set's symbol fits the edges there: the best, over its sizes and places, of the
 * balance (F1) between its outline found on edges and the edges in its box found on its outline.
 * 0–1; ~0.6 and up a fit.
 */
export function symbolFit(area, templates) {
  let best = 0;
  const { w, h, near, edges, count, mid, right } = area;
  for (const t of templates) {
    if (t.w > w || t.h > h) continue;
    const n = t.points.length / 2;
    if (n < 8) continue;
    // Only where a symbol can be: on the type line's middle, at its right end.
    const oyMin = Math.max(0, Math.ceil(mid.min - t.h / 2));
    const oyMax = Math.min(h - t.h, Math.floor(mid.max - t.h / 2));
    const oxMin = Math.max(0, right.min - t.w);
    const oxMax = Math.min(w - t.w, right.max - t.w);
    for (let oy = oyMin; oy <= oyMax; oy++) {
      for (let ox = oxMin; ox <= oxMax; ox++) {
        // Edges in its box, from the running count; too few, nothing there to fit.
        const inBox = count[(oy + t.h) * (w + 1) + ox + t.w] - count[oy * (w + 1) + ox + t.w]
          - count[(oy + t.h) * (w + 1) + ox] + count[oy * (w + 1) + ox];
        if (inBox < n * 0.4) continue;
        let found = 0;
        for (let i = 0; i < t.points.length; i += 2) found += near[(oy + t.points[i + 1]) * w + ox + t.points[i]];
        const recall = found / n;
        if (recall < 0.3) continue;
        let onLine = 0;
        for (let y = 0; y < t.h; y++) {
          for (let x = 0; x < t.w; x++) if (edges[(oy + y) * w + ox + x] && t.near[y * t.w + x]) onLine += 1;
        }
        const precision = onLine / inBox;
        const f = (2 * recall * precision) / (recall + precision || 1);
        if (f > best) best = f;
      }
    }
  }
  return best;
}

/** Digits read where letters were meant, in a name. */
const AS_LETTER = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 6: 'G', 2: 'Z' };
const letters = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  .replace(/[0-9]/g, (d) => AS_LETTER[d] ?? ' ').split(/[^A-Z]+/).filter(Boolean);

/** How much of an artist's name is in text read off a card (fuzzy, word by word), 0–1. */
export function artistIn(text, artist) {
  const read = letters(text).filter((w) => w.length >= 3);
  const theirs = letters(artist).filter((w) => w.length >= 2);
  if (!read.length || !theirs.length) return 0;
  let matched = 0;
  let total = 0;
  for (const t of theirs) {
    total += t.length;
    if (read.some((w) => 1 - editDistance(w, t) / Math.max(w.length, t.length) >= 0.7)) matched += t.length;
  }
  return matched / total;
}

const clamp = (v) => Math.max(-1, Math.min(1, v));
const plainNumber = (n) => String(n ?? '').replace(/^0+(?=\d)/, '').toLowerCase();

/**
 * One printing's score from the clues. Pure, for tests.
 * @param {object} p  a Scryfall card
 * @param {{ art?: number|null, symbol?: number|null, symbolBest?: number, symbolSeen: boolean,
 *   border: 'dark'|'light'|null, artist: number, year: number|null, number: string|null, older: boolean }} c
 *   art: the fingerprints' distance; symbol: how well the set's symbol fits (null: none to compare,
 *   a promo's); symbolBest: the best any candidate set's fits
 */
export function scorePrinting(p, c) {
  const parts = {};
  if (c.art != null) parts.art = WEIGHTS.art * clamp((0.75 - c.art) / 0.3);
  const border = printedBorder(p);
  if (c.border && border) parts.border = c.border === border ? WEIGHTS.border.match : WEIGHTS.border.miss;
  if (c.older && p.frame === '2015') parts.frame = WEIGHTS.frame;
  // The symbol: none on the card and none printed, or the best fit among the sets (the best gains
  // in full, 0.05 under it nothing, 0.1 under it loses in full), or nothing to say.
  if (NO_SYMBOL.has(p.set)) parts.symbol = c.symbolSeen ? -WEIGHTS.symbol : WEIGHTS.symbol;
  else if (c.symbolSeen && c.symbol != null) parts.symbol = WEIGHTS.symbolShape * clamp((c.symbol - (c.symbolBest - 0.05)) / 0.05);
  if (c.artist >= 0.75) parts.artist = WEIGHTS.artist;
  const released = Number(String(p.released_at ?? '').slice(0, 4));
  if (c.year && (released === c.year || released === c.year - 1)) parts.year = WEIGHTS.year;
  if (c.number && plainNumber(p.collector_number) === c.number) parts.number = WEIGHTS.number;
  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  return { score, parts };
}

const images = new Map();   // url → Promise<image|null>, this page's life
const cached = (url, load) => {
  if (!url) return Promise.resolve(null);
  if (!images.has(url)) {
    images.set(url, load(url).catch((e) => {
      images.delete(url);
      console.warn('A picture for the printing match would not load', url, e);
      return null;
    }));
  }
  return images.get(url);
};

const smallImage = (p) => p.image_uris?.small ?? p.card_faces?.[0]?.image_uris?.small ?? null;

/**
 * Every printing of an older card's name, ranked by how well the card in
 * the picture fits it; and the one to take, if one's clearly ahead.
 * @param {object} frame  the camera's picture
 * @param {{ x: number, y: number, width: number, height: number }} card  where the card is in it
 * @param {object[]} printings  Scryfall cards, one name
 * @param {{ text?: string, year?: number|null, number?: string|null, older?: boolean,
 *   setIcon: (code: string) => string|null, setType?: (code: string) => string|null,
 *   loadImage: (url: string) => Promise<object>, createCanvas: (w: number, h: number) => object }} opts
 *   text: what was read off the card's bottom (the artist's name in it); setType: a set's kind
 *   (a promo's symbol is a generic one, not compared)
 * @returns {Promise<{ ranked: { card: object, score: number, parts: object }[], winner: object|null }>}
 */
export async function rankPrintings(frame, card, printings, {
  text = '', year = null, number = null, older = true, setIcon, setType = () => null, loadImage, createCanvas,
}) {
  const seenArt = regionPrint(frame, card, ART, createCanvas);
  const border = borderKind(borderTone(frame, card, createCanvas));
  const area = symbolArea(frame, card, createCanvas);
  const pics = await Promise.all(printings.map((p) => cached(smallImage(p), loadImage)));
  // Symbols compared only for the sets that printed it in an older frame (a 2015-frame printing
  // would have had its set code read).
  const codes = [...new Set(printings.filter((p) => !older || p.frame !== '2015').map((p) => p.set))];
  const fits = new Map(await Promise.all(codes.map(async (code) => {
    if (NO_SYMBOL.has(code) || PROMO_TYPES.has(setType(code))) return [code, null];
    const svg = await cached(setIcon(code), loadImage);
    return [code, svg ? symbolFit(area, symbolTemplates(svg, area.cardH, createCanvas)) : null];
  })));
  const symbolBest = Math.max(0, ...[...fits.values()].filter((v) => v != null));
  const ranked = printings.map((p, i) => {
    const pic = pics[i];
    const art = pic ? printDistance(seenArt, regionPrint(pic, { x: 0, y: 0, width: pic.width, height: pic.height }, ART, createCanvas)) : null;
    const { score, parts } = scorePrinting(p, {
      art,
      symbol: fits.get(p.set) ?? null,
      symbolBest,
      symbolSeen: symbolBest >= SYMBOL_SEEN,
      border,
      artist: artistIn(text, p.artist),
      year,
      number,
      older,
    });
    return { card: p, score, parts };
  }).sort((a, b) => b.score - a.score);
  const [best, next] = ranked;
  const winner = best && best.score >= TAKE.score && (!next || best.score - next.score >= TAKE.lead) ? best.card : null;
  return { ranked, winner };
}
