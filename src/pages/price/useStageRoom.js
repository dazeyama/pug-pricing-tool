import { useEffect, useRef, useState } from 'react';
import { suggestionRoom } from '../../lib/thumbGrid.js';
import { cardRoom } from '../../lib/cardRoom.js';

// How the pricing screen shares its width (PricingScreen; FABLE_REPORT C1):
// measured, since the thumbnails' and the card's sizes depend on their areas.

// The list takes the width the suggestions don't use (owner, 2026-09-29).
// A thumbnail is at most 146px wide and also limited by the area's height
// (price.css .thumbs); on a wide screen that leaves empty space between the
// thumbnails and Finish & Details, which goes to the sidebar instead, up to
// LIST_EXTRA_MAX. Measured, since the thumbnails' size depends on their column.
const LIST_EXTRA_MAX = 220;

// It also picks the suggestions' columns: 5, or 4 on a laptop's window,
// where the column is narrow but tall (lib/thumbGrid.js; owner, 2026-10-14).
export function useListRoom(screen) {
  const [room, setRoom] = useState({ extra: 0, cols: 5 });
  const current = useRef(0);
  useEffect(() => {
    const area = screen.current?.querySelector('.area-thumbs');
    if (!area) return undefined;
    const measure = () => {
      // The same sums as .thumbs' --thumb-w (thumbGrid.js).
      const { cols, extra } = suggestionRoom(area.clientWidth, area.clientHeight, current.current, LIST_EXTRA_MAX);
      current.current = extra;
      setRoom((r) => (r.extra === extra && r.cols === cols ? r : { extra, cols }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [screen]);
  return room;
}

// The selected card fills its area's height on a tall window: its column
// widens, Finish & Details and the suggestions narrowing (lib/cardRoom.js;
// owner, 2026-10-14). Measured, like the list's room.
export function useCardRoom(screen) {
  const [room, setRoom] = useState({ grow: 0, side: 0 });
  const current = useRef(0);
  useEffect(() => {
    const area = screen.current?.querySelector('.area-card');
    if (!area) return undefined;
    const measure = () => {
      const next = cardRoom(area.clientWidth, area.clientHeight, current.current);
      current.current = next.grow;
      setRoom((r) => (r.grow === next.grow ? r : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [screen]);
  return room;
}
