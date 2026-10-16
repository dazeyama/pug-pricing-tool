// The card-shaped guide over the camera (docs/SCAN_FUNCTION.md 5.3): drawn
// from this rectangle as percentages of the picture, and the same rectangle
// in a captured frame's pixels, where tiers 2 and 3 read a card's title
// (6.2). Pure, for tests.

/** A Magic card's width ÷ height (63 × 88 mm). */
export const CARD_RATIO = 63 / 88;

/**
 * The guide in a frame `w` × `h`, centred: 86% of the height, or 92% of the
 * width when that's tighter (a portrait picture).
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function guideRect(w, h) {
  let height = h * 0.86;
  let width = height * CARD_RATIO;
  if (width > w * 0.92) {
    width = w * 0.92;
    height = width / CARD_RATIO;
  }
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}

/** The guide as CSS percentages of the picture. */
export function guideStyle(w, h) {
  const r = guideRect(w, h);
  const pc = (v, of) => `${(v / of) * 100}%`;
  return { left: pc(r.x, w), top: pc(r.y, h), width: pc(r.width, w), height: pc(r.height, h) };
}
