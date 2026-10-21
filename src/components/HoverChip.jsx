import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The chip's widest likely size, to keep it on screen near the right edge,
// and its tallest, to fit it above what's pointed at.
const CHIP_ROOM = 340;
const CHIP_HEIGHT = 90;

/**
 * Something that shows a chip while pointed at (decision 276, first for a
 * collection's cards by game; a note's * since decision 433). The chip sits
 * just above it, where the pointer doesn't cover it (owner, 2026-10-16), or
 * below it when there's no room above. It floats above the page, as a line's
 * picture does (LinePreview), so a table can't clip it.
 * @param {{ chip: () => import('react').ReactNode, chipClass?: string, height?: number, className?: string,
 *   children: import('react').ReactNode }} props
 *   chip: the chip's contents, worked out only while it shows; height: its tallest likely size
 */
export default function HoverChip({ chip, chipClass = '', height = CHIP_HEIGHT, className = '', children, ...rest }) {
  const ref = useRef(null);
  const [at, setAt] = useState(null);   // { top, left, above } while pointed at
  const hide = useCallback(() => setAt(null), []);
  // It goes away when the page scrolls under it.
  useEffect(() => {
    if (!at) return undefined;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [at, hide]);

  function show() {
    const r = ref.current.getBoundingClientRect();
    const above = r.top > height + 16;
    setAt({
      top: above ? r.top - 8 : r.bottom + 8,
      left: Math.max(8, Math.min(r.left, window.innerWidth - CHIP_ROOM)),
      above,
    });
  }

  return (
    <span ref={ref} className={className} onMouseEnter={show} onMouseLeave={hide} {...rest}>
      {children}
      {at && createPortal(
        <span className={`counts-chip${chipClass ? ` ${chipClass}` : ''}${at.above ? ' above' : ''}`} role="tooltip"
          style={{ top: at.top, left: at.left }}>
          {chip()}
        </span>,
        document.body,
      )}
    </span>
  );
}
