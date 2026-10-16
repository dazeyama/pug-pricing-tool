// Copied from https://github.com/GrimbiXcode/mtgscan (src/recognition/canvasUtil.js,
// commit 84b62c6ef0436a288c58ac8d84fedff017faf420, GPL-3.0) on 2026-10-16;
// changed: nothing. The PUG Pricing Tool is GPL-3.0 because of it (LICENSE;
// docs/SCAN_FUNCTION.md 10). Kept as it is so a later mtgscan can be compared.

// Canvas creation helper shared by all recognition modules.
// Browsers get a real <canvas> element; Node (the benchmark harness) injects
// the `canvas` npm package's createCanvas instead, so the exact same
// detection/binarization code runs in both environments unmodified.

export function defaultCreateCanvas(width, height) {
  if (typeof document === 'undefined') {
    throw new Error('No canvas implementation available; pass a createCanvas(width, height) function.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
