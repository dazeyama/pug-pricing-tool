// The suggestions' grid (price/suggestions.css .thumbs): a thumbnail is at most
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

/**
 * The suggestions' columns, and the width the Buy list takes from them
 * (price/useStageRoom.js useListRoom: the list gets what the thumbnails don't use,
 * up to `max`), from their area as it is now, `width` × `height` px, with
 * `extra` already given to the list. The columns are chosen from the area's
 * width with nothing given away (`width + extra`): chosen from what's left,
 * 4 across let the list take the room 5 needed, and then 4 looked best
 * again (owner's bug, 2026-10-14: a 1080p screen showed 2 rows of 4).
 * @returns {{ cols: number, extra: number }}
 */
export function suggestionRoom(width, height, extra, max) {
  const cols = suggestionColumns(width + extra, height);
  // As wide as the rows' height allows: what's past that goes to the list.
  const tall = Math.min(THUMB.max, ((height - THUMB.head - THUMB.gapY - 2 * THUMB.label) / 2) * THUMB.ratio);
  const spare = width - (cols * tall + (cols - 1) * THUMB.gapX);
  const next = Math.round(Math.min(max, Math.max(0, extra + spare)));
  return { cols, extra: Math.abs(next - extra) >= 2 ? next : extra };
}
