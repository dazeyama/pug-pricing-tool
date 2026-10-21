import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import GuardButton from './GuardButton.jsx';
import { flattenGroups } from '../lib/menuGroups.js';

/**
 * The items of a ⋯ or EXPORT menu, one level of groups deep (owner,
 * 2026-10-21; decision 422: "Print ▸", "Export ▸", "Convert ▸" instead of eight
 * flat lines). An item is a leaf or a group:
 *
 * - a leaf: `{ label, onClick, title?, blocked?, danger?, needsUser?, saysWhy? }`.
 *   `blocked` is why it can't run, for its tooltip; it's greyed and inert
 *   unless `saysWhy`, when it still runs (EXPORT's items toast the reason).
 * - a group: `{ label, items }`. It ends in ▸ and opens its items in a flyout
 *   beside it, on hover (the way a Windows menu does) or a click; → opens it
 *   from the keyboard, ← closes it. It opens to the left when the window's
 *   edge is near, and upward when the foot is.
 *
 * A group with one item is shown as that item, on the root (owner: nothing
 * hides behind an arrow alone); one with none is left out (lib/menuGroups.js).
 *
 * `onPick(item)` runs a leaf: the menu closes itself there, then calls the
 * item's `onClick`. `needsUser` is the default for leaves that don't say.
 */

const HOVER_MS = 120;   // a pointer passing over a group doesn't open it

export default function MenuItems({ items, onPick, needsUser = true }) {
  const shown = flattenGroups(items);
  const [openGroup, setOpenGroup] = useState(null);   // the open group's label
  const timer = useRef(null);
  const hover = (label) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpenGroup(label), HOVER_MS);
  };
  const toggle = (label, open) => {
    clearTimeout(timer.current);
    setOpenGroup(open ? label : null);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return shown.map((item) => (item.items ? (
    <GroupRow
      key={item.label}
      item={item}
      open={openGroup === item.label}
      onHover={() => hover(item.label)}
      onToggle={(open) => toggle(item.label, open)}
      onPick={onPick}
      needsUser={needsUser}
    />
  ) : (
    <Leaf key={item.label} item={item} onPick={onPick} needsUser={needsUser} onHover={() => hover(null)} />
  )));
}

function Leaf({ item, onPick, needsUser, onHover }) {
  const blocked = Boolean(item.blocked);
  return (
    <GuardButton
      needsUser={item.needsUser ?? needsUser}
      role="menuitem"
      className={`more-item${item.danger ? ' danger' : ''}`}
      disabled={blocked && !item.saysWhy}
      looksDisabled={blocked}
      title={item.blocked ?? item.title}
      onMouseEnter={onHover}
      onClick={() => onPick(item)}
    >
      {item.label}
    </GuardButton>
  );
}

function GroupRow({ item, open, onHover, onToggle, onPick, needsUser }) {
  const row = useRef(null);
  const sub = useRef(null);
  const [place, setPlace] = useState({ left: false, up: false });
  // Where the flyout fits, once it's drawn: beside the item to the right, else to the left; down
  // from its top, else up from its foot. Measured on the screen, then in the zoomed app's own px
  // (lib/uiScale.js), as MoreMenu's float placement is.
  useLayoutEffect(() => {
    if (!open || !row.current || !sub.current) return;
    const r = row.current.getBoundingClientRect();
    const zoom = row.current.currentCSSZoom ?? 1;
    const w = sub.current.offsetWidth * zoom;
    const h = sub.current.offsetHeight * zoom;
    setPlace({
      left: r.right + 2 + w > document.documentElement.clientWidth - 8,
      up: r.top + h > window.innerHeight - 8,
    });
  }, [open]);
  return (
    <div className="menu-row" ref={row}>
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`more-item group${open ? ' open' : ''}`}
        title={item.title}
        onMouseEnter={onHover}
        onClick={() => onToggle(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            onToggle(true);
            setTimeout(() => sub.current?.querySelector('.more-item')?.focus(), 0);
          }
        }}
      >
        {item.label}
      </button>
      {open && (
        <div
          ref={sub}
          className={`more-list more-sub${place.left ? ' left' : ''}${place.up ? ' up' : ''}`}
          role="menu"
          aria-label={item.label}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              onToggle(false);
              row.current?.querySelector('.more-item')?.focus();
            }
          }}
        >
          {item.items.map((leaf) => (
            <Leaf key={leaf.label} item={leaf} onPick={onPick} needsUser={needsUser} onHover={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}
