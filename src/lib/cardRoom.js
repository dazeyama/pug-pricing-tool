// The selected card on a tall window (owner, 2026-10-14: at 1920 × 1080 it
// stopped at 336 × 468 and left about 135px empty under it). Its column
// widens to the card's width at the full height of its area, so the card
// fills it, up to GROW_MAX past the column's usual width (336px, 300px on a
// narrower window). Finish & Details give up to SIDE_MAX of that, the
// suggestions the rest. A short window (the laptops) leaves it alone: there
// the card is narrower than its column already.

export const CARD = {
  ratio: 488 / 680,   // a card's width / height
  around: 58,         // the label above (26px) and the finish line below (32px)
  growMax: 120,       // so 456 × 635 at the most
  sideMax: 40,
};

/**
 * How much wider the card's column should be, from its area as it is now:
 * `width` × `height` px, already `grow` wider than usual. The card's height
 * doesn't depend on its column's width, so this settles at once.
 * @returns {{ grow: number, side: number }}  px past the usual column; px Finish & Details give up
 */
export function cardRoom(width, height, grow = 0) {
  const want = (height - CARD.around) * CARD.ratio;
  const next = Math.round(Math.min(CARD.growMax, Math.max(0, want - (width - grow))));
  const settled = Math.abs(next - grow) >= 2 ? next : grow;
  return { grow: settled, side: Math.min(settled, CARD.sideMax) };
}
