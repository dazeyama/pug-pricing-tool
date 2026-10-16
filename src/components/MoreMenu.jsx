import { useLayoutEffect, useRef, useState } from 'react';
import GuardButton from './GuardButton.jsx';
import { useDismiss } from '../lib/useDismiss.js';

/**
 * A ⋯ menu for actions kept away from everyday controls (Delete collection…,
 * Delete buy…). Each item needs a picked user (GuardButton); `blocked` is why
 * it can't run, for its tooltip. `up` opens it upward (near the window's foot).
 * `float` places it over the page instead (a table row, whose table clips
 * what spills out of it): below the button, or above when there's no room;
 * scrolling closes it.
 *
 * `needsUser: false` on an item that changes nothing (Print buy).
 *
 * @param {{ items: { label: string, onClick: () => void, danger?: boolean,
 *   blocked?: string|null, title?: string, needsUser?: boolean }[], up?: boolean, float?: boolean }} p
 */
export default function MoreMenu({ items, up = false, float = false }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);   // float: where the list goes, once measured
  const wrap = useRef(null);
  const list = useRef(null);
  useLayoutEffect(() => {
    if (!open || !float) return undefined;
    const button = wrap.current?.querySelector('.more-btn')?.getBoundingClientRect();
    if (button) {
      // On the screen, in px, then in the zoomed app's own px (lib/uiScale.js):
      // a fixed place inside it is drawn at `zoom` times its size.
      // The page's width without its scrollbar: a fixed right edge is measured from there.
      const zoom = wrap.current.currentCSSZoom ?? 1;
      const height = (list.current?.offsetHeight ?? 0) * zoom;
      const below = button.bottom + 6 + height <= window.innerHeight - 8;
      setPlace({
        right: (document.documentElement.clientWidth - button.right) / zoom,
        ...(below ? { top: (button.bottom + 6) / zoom } : { bottom: (window.innerHeight - button.top + 6) / zoom }),
      });
    }
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      setPlace(null);
    };
  }, [open, float]);
  useDismiss(() => setOpen(false), { ref: wrap, when: open });
  return (
    <span className="more-menu" ref={wrap}>
      <button
        type="button"
        className="more-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More"
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div
          ref={list}
          className={`more-list${up && !float ? ' up' : ''}`}
          role="menu"
          style={float ? {
            position: 'fixed',
            right: place?.right ?? 0,
            top: place?.top ?? 'auto',
            bottom: place?.bottom ?? 'auto',
            visibility: place ? 'visible' : 'hidden',
          } : undefined}
        >
          {items.map((item) => (
            <GuardButton
              key={item.label}
              needsUser={item.needsUser ?? true}
              role="menuitem"
              className={`more-item${item.danger ? ' danger' : ''}`}
              disabled={Boolean(item.blocked)}
              title={item.blocked ?? item.title}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </GuardButton>
          ))}
        </div>
      )}
    </span>
  );
}
