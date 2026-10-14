import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LENS, lensTransforms } from '../../lib/cardZoom.js';

/**
 * The selected card, large (owner, 2026-10-14): clicked on the pricing
 * screen, it opens in a panel in the middle of the dimmed screen with its
 * name in bold above it, and the cursor becomes a magnifying glass showing
 * the card at 2× under it (a collector number, a set symbol), with a faint
 * glassy sheen and a thick clear rim. `children` is the card's picture as
 * SelectedCard draws it (the foil sheen, the 1st Edition stamp, Base Set's
 * shadow, the badges), drawn twice: in the panel, and in the glass, where
 * it's a copy of the whole panel at twice the size, moved so the point under
 * the cursor sits in the middle (lib/cardZoom.js). Any click, or Esc, closes
 * it. `at` is where the click that opened it was, so the glass starts there.
 */
export default function CardZoom({ name, subtitle, children, at, onClose }) {
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const lensRef = useRef(null);
  const viewRef = useRef(null);
  const pointer = useRef(at);
  const frame = useRef(0);
  const close = useRef(onClose);
  close.current = onClose;

  // The glass to the cursor; hidden while the cursor is out of the window.
  const place = useCallback(() => {
    frame.current = 0;
    const panel = panelRef.current;
    const lens = lensRef.current;
    const view = viewRef.current;
    if (!panel || !lens || !view) return;
    if (!pointer.current) {
      lens.style.visibility = 'hidden';
      return;
    }
    const t = lensTransforms(pointer.current, panel.getBoundingClientRect());
    lens.style.transform = t.lens;
    view.style.transform = t.view;
    lens.style.visibility = 'visible';
  }, []);
  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(place);
  }, [place]);

  useLayoutEffect(place, [place]);

  useEffect(() => {
    // Keys stay here while it's open (not in the search bar behind it); Esc
    // closes it before anything else hears it.
    const before = document.activeElement;
    rootRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      } else if (e.key === 'Tab') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      before?.focus?.({ preventScroll: true });
    };
  }, [schedule]);

  const panel = (ref) => (
    <div className="cz-panel" ref={ref}>
      <h2 className="cz-name">
        {name}
        {subtitle && <span className="cz-sub">{subtitle}</span>}
      </h2>
      <div className="cz-card">{children}</div>
    </div>
  );

  return createPortal(
    <div
      ref={rootRef}
      className="card-zoom"
      role="dialog"
      aria-modal="true"
      aria-label={`${name}, enlarged`}
      tabIndex={-1}
      onClick={() => close.current()}
      onPointerMove={(e) => {
        // A finger has no cursor to replace: no glass for touch.
        pointer.current = e.pointerType === 'touch' ? null : { x: e.clientX, y: e.clientY };
        schedule();
      }}
      onPointerLeave={() => {
        pointer.current = null;
        schedule();
      }}
    >
      {panel(panelRef)}
      <div
        className="cz-lens"
        ref={lensRef}
        style={{ width: LENS.size, height: LENS.size, '--cz-rim': `${LENS.rim}px` }}
        aria-hidden="true"
      >
        <div className="cz-lens-zoom">
          <div className="cz-lens-view" ref={viewRef}>{panel(null)}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
