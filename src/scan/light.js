// Too dark to read well (owner, 2026-10-18: "fix", to "No hint in dim
// light"; decision 306). A phone's camera brightens a dim picture by itself,
// and a black-bordered card is dark in any light, so the average says little;
// how bright the brightest part gets says more: in good light a card's white
// text and the art's highlights come out near white, in dim light nothing
// does.

/** The picture's brightest part this dark or darker (0–255, the top 5% of a small copy): too dark. */
export const DARK_HIGH = 90;

/**
 * How bright a picture is, from its pixels (RGBA, as getImageData gives):
 * `mean` and `high` (the 95th percentile), each 0–255. Pure, for tests.
 * @param {Uint8ClampedArray|number[]} data
 */
export function lightOf(data) {
  const lumas = [];
  for (let i = 0; i + 2 < data.length; i += 4) {
    lumas.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  if (!lumas.length) return { mean: 0, high: 0 };
  const mean = lumas.reduce((a, b) => a + b, 0) / lumas.length;
  lumas.sort((a, b) => a - b);
  const high = lumas[Math.min(lumas.length - 1, Math.floor(lumas.length * 0.95))];
  return { mean, high };
}

/** Too dark to read well. */
export const isDark = (light) => light.high < DARK_HIGH;

/**
 * The light in a camera picture, or in part of it (`rect`, the locked
 * card's view), from a 48 × 48 copy: cheap enough for every look.
 * @param {HTMLCanvasElement} canvas
 * @param {{ x: number, y: number, width: number, height: number }|null} [rect]
 */
export function lightIn(canvas, rect = null) {
  const x = Math.max(0, Math.min(canvas.width - 1, Math.round(rect?.x ?? 0)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.round(rect?.y ?? 0)));
  const w = Math.max(1, Math.min(canvas.width - x, Math.round(rect?.width ?? canvas.width)));
  const h = Math.max(1, Math.min(canvas.height - y, Math.round(rect?.height ?? canvas.height)));
  const small = document.createElement('canvas');
  small.width = 48;
  small.height = 48;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, x, y, w, h, 0, 0, 48, 48);
  return lightOf(ctx.getImageData(0, 0, 48, 48).data);
}
