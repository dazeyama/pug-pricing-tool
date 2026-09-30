import { useEffect, useRef, useState } from 'react';
import GuardButton from './GuardButton.jsx';

/**
 * A ⋯ menu for actions kept away from everyday controls (Delete collection…,
 * Delete buy…). Each item needs a picked user (GuardButton); `blocked` is why
 * it can't run, for its tooltip. `up` opens it upward (near the window's foot).
 *
 * @param {{ items: { label: string, onClick: () => void, danger?: boolean,
 *   blocked?: string|null, title?: string }[], up?: boolean }} p
 */
export default function MoreMenu({ items, up = false }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
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
        <div className={`more-list${up ? ' up' : ''}`} role="menu">
          {items.map((item) => (
            <GuardButton
              key={item.label}
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
