import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// A hovered card line's picture, at a search suggestion's size, level with the
// line and just outside its list: left of the Price sidebar (owner,
// 2026-09-29), beside a day page's buy panel (owner, 2026-09-30). A plain
// picture, no foil effects.

const WIDTH = 146;
const HEIGHT = 204;
const GAP = 12;

/**
 * Where the picture goes for a hovered row: level with it (kept on screen),
 * just outside `box` on `side`, switching sides when there's no room.
 * @returns {{ src: string, top: number, left: number }|null} null without a picture
 */
export function previewFor(src, row, box, side = 'left') {
  if (!src) return null;
  const r = row.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const top = Math.min(Math.max(8, r.top + r.height / 2 - HEIGHT / 2), window.innerHeight - HEIGHT - 8);
  const onLeft = b.left - GAP - WIDTH;
  const onRight = b.right + GAP;
  const fitsLeft = onLeft >= 8;
  const fitsRight = onRight + WIDTH <= window.innerWidth - 8;
  const left = side === 'left' ? (fitsLeft || !fitsRight ? onLeft : onRight)
    : (fitsRight || !fitsLeft ? onRight : onLeft);
  return { src, top, left };
}

/** The picture itself; it goes away when the page scrolls under it. */
export default function LinePreview({ preview, onHide }) {
  useEffect(() => {
    if (!preview) return undefined;
    window.addEventListener('scroll', onHide, true);
    return () => window.removeEventListener('scroll', onHide, true);
  }, [preview, onHide]);

  if (!preview) return null;
  return createPortal(
    <div className="line-preview" style={{ top: preview.top, left: preview.left }} aria-hidden="true">
      <img src={preview.src} alt="" />
    </div>,
    document.body,
  );
}
