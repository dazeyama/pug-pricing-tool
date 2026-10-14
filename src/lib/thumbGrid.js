// The suggestions' grid (price.css .thumbs): a thumbnail is at most
// Scryfall's small image, 146 px wide, and shrinks to fit its columns across
// and two rows down, with 36 px for the line above, 16 px between the rows,
// 14 px between the columns and 22 px under each for its label.
export const THUMB = { max: 146, gapX: 14, gapY: 16, head: 36, label: 22, ratio: 488 / 680 };

/** A thumbnail's width, `cols` across and two rows down, in an area `width` × `height` px. */
export function thumbWidth(width, height, cols) {
  const across = (width - (cols - 1) * THUMB.gapX) / cols;
  const down = ((height - THUMB.head - THUMB.gapY - 2 * THUMB.label) / 2) * THUMB.ratio;
  return Math.max(0, Math.min(THUMB.max, across, down));
}

/**
 * 5 across, or 4 where that makes them at least 15% bigger (owner,
 * 2026-10-14: on a laptop's window the column is narrow but tall, and two
 * rows of 4 fill it better than two rows of 5).
 */
export function suggestionColumns(width, height) {
  return thumbWidth(width, height, 4) >= 1.15 * thumbWidth(width, height, 5) ? 4 : 5;
}
