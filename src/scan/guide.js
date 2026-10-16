// How the camera's picture is shown (docs/SCAN_FUNCTION.md 5.3), and the
// card-shaped guide older cards' titles are read from before the view is
// locked (6.2). Pure, for tests.

/** A Magic card's width ÷ height (63 × 88 mm). */
export const CARD_RATIO = 63 / 88;

/**
 * The guide in a picture `w` × `h`, centred: 86% of the height, or 92% of the
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

/**
 * Where the video goes so that one part of the picture fills a box: `cover`
 * (the whole picture, edges cut off: before the view is locked) or `contain`
 * (the locked card, all of it, as large as fits). The video's own box is the
 * picture's shape, sized and placed in px: an iPhone doesn't size a video
 * the way percentages and object-fit ask (docs/SCAN_LEARNINGS.md 2.3).
 * @param {{ width: number, height: number }} picture  the camera's picture
 * @param {{ x: number, y: number, width: number, height: number }} part  the part to show, in its px
 * @param {number} boxW
 * @param {number} boxH
 * @param {'cover'|'contain'} fit
 * @returns {{ scale: number, x: number, y: number, width: number, height: number }}
 *   the video's box in the box's px; a point (px, py) of the picture is at (x + px × scale, y + py × scale)
 */
export function showPart(picture, part, boxW, boxH, fit) {
  const sx = boxW / part.width;
  const sy = boxH / part.height;
  const scale = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  return {
    scale,
    x: boxW / 2 - (part.x + part.width / 2) * scale,
    y: boxH / 2 - (part.y + part.height / 2) * scale,
    width: picture.width * scale,
    height: picture.height * scale,
  };
}

/**
 * The video cut to the part of the picture shown (owner, 2026-10-16: "also
 * crop the left and right of the video feed to the detected card"): a CSS
 * clip-path inset, in the video box's own px.
 * @param {{ scale: number, width: number, height: number }} shown  showPart's
 * @param {{ x: number, y: number, width: number, height: number }} part  in the picture's px
 */
export function insetTo(shown, part) {
  const px = (v) => `${Math.max(0, Math.round(v))}px`;
  const top = part.y * shown.scale;
  const left = part.x * shown.scale;
  const bottom = shown.height - (part.y + part.height) * shown.scale;
  const right = shown.width - (part.x + part.width) * shown.scale;
  return `inset(${px(top)} ${px(right)} ${px(bottom)} ${px(left)})`;
}

/** A rectangle of the picture, where it lands in the box. */
export function onScreen(shown, r) {
  return { left: shown.x + r.x * shown.scale, top: shown.y + r.y * shown.scale, width: r.width * shown.scale, height: r.height * shown.scale };
}
