// Finding the card in the camera's picture by its edges (owner, 2026-10-16:
// "after the first card is detected in a scan, use edge detection to crop the
// view to those edges"). In the store's holder the card lies on a light
// surface and almost every card has a dark border, so the card is the
// largest card-shaped patch of dark: the border, and the darker parts of
// the art joined to it. Looked for on a small copy of the picture (320px
// wide), so it's cheap enough for every look. DOM-free: the canvas maker is
// passed in (the browser's, or @napi-rs/canvas in tests).

import { otsuThreshold } from './recognition/textLocator.js';

/** The picture is looked at this wide. */
const WORK_WIDTH = 320;
/** A card's width ÷ height is 0.716; a slightly turned card's outline a little more. */
const RATIO = { min: 0.62, max: 0.84 };
/**
 * The card is at least this share of the picture's height, at most this. 10%: through an iPhone's
 * ultra-wide lens alone (camera.js) the card is about half as tall as through its default camera.
 */
const HEIGHT = { min: 0.1, max: 0.97 };
/** A patch of dark this small is nothing (a share of the picture). */
const MIN_SHARE = 0.004;
/** The border and dark art fill at least this share of their outline (a lone thin frame line doesn't). */
const MIN_FILL = 0.1;

/**
 * The card's outline in the picture, or null.
 * @param {{ width: number, height: number }} frame  a canvas
 * @param {(w: number, h: number) => object} createCanvas
 * @returns {{ x: number, y: number, width: number, height: number }|null}  in the picture's px
 */
export function findCard(frame, createCanvas) {
  const scale = Math.min(1, WORK_WIDTH / frame.width);
  const W = Math.max(1, Math.round(frame.width * scale));
  const H = Math.max(1, Math.round(frame.height * scale));
  const small = createCanvas(W, H);
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(frame, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  const n = W * H;
  const gray = new Float32Array(n);
  const histogram = new Uint32Array(256);
  for (let k = 0; k < n; k++) {
    const g = 0.299 * data[4 * k] + 0.587 * data[4 * k + 1] + 0.114 * data[4 * k + 2];
    gray[k] = g;
    histogram[Math.min(255, Math.round(g))] += 1;
  }
  // Dark is darker than both Otsu's split and about half the picture's middle
  // brightness: the holder's shaded walls stay light, the card's border doesn't.
  let seen = 0;
  let median = 128;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v];
    if (seen >= n / 2) {
      median = v;
      break;
    }
  }
  const threshold = Math.min(otsuThreshold(gray), median * 0.55);
  const dark = new Uint8Array(n);
  for (let k = 0; k < n; k++) dark[k] = gray[k] < threshold ? 1 : 0;

  // The dark patches (4-connected), each with its outline and size.
  const label = new Int32Array(n);
  const stack = [];
  let best = null;
  let id = 0;
  for (let start = 0; start < n; start++) {
    if (!dark[start] || label[start]) continue;
    id += 1;
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    let count = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const k = stack.pop();
      const x = k % W;
      const y = (k - x) / W;
      count += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && dark[k - 1] && !label[k - 1]) { label[k - 1] = id; stack.push(k - 1); }
      if (x < W - 1 && dark[k + 1] && !label[k + 1]) { label[k + 1] = id; stack.push(k + 1); }
      if (y > 0 && dark[k - W] && !label[k - W]) { label[k - W] = id; stack.push(k - W); }
      if (y < H - 1 && dark[k + W] && !label[k + W]) { label[k + W] = id; stack.push(k + W); }
    }
    if (count < n * MIN_SHARE) continue;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    // Dark running off the picture's edge is the room around the holder, not a card.
    if (x0 <= 1 || y0 <= 1 || x1 >= W - 2 || y1 >= H - 2) continue;
    if (w / h < RATIO.min || w / h > RATIO.max) continue;
    if (h < H * HEIGHT.min || h > H * HEIGHT.max) continue;
    if (count < w * h * MIN_FILL) continue;
    if (!best || w * h > best.w * best.h) best = { x0, y0, w, h };
  }
  if (!best) return null;
  return { x: best.x0 / scale, y: best.y0 / scale, width: best.w / scale, height: best.h / scale };
}
