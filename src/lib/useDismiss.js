import { useEffect, useRef } from 'react';

/**
 * Close something floating (a menu, a panel, a popover) when the mouse goes
 * down outside it or Escape is pressed (FABLE_REPORT B4). Outside means
 * outside `ref`'s element and outside anything matching `inside`, a selector:
 * the menu's own class, or the button that opens it.
 *
 * `onClose` can be a new function every render: the latest one is called.
 * @param {() => void} onClose
 * @param {object} [o]
 * @param {{ current: Element|null }|null} [o.ref]
 * @param {string|null} [o.inside]
 * @param {boolean} [o.when]  listen only while it's open
 * @param {boolean} [o.escape]  Escape closes it too
 * @param {boolean} [o.scroll]  any scroll closes it (a menu placed at the cursor)
 * @param {boolean} [o.blurFirst]  a click outside first blurs a field inside, so its blur saves what's typed
 */
export function useDismiss(onClose, {
  ref = null, inside = null, when = true, escape = true, scroll = false, blurFirst = false,
} = {}) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!when) return undefined;
    const within = (el) => Boolean(ref?.current?.contains(el) || (inside && el?.closest?.(inside)));
    const onDown = (e) => {
      if (within(e.target)) return;
      if (blurFirst && ref?.current?.contains(document.activeElement)) document.activeElement.blur();
      close.current();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close.current();
    };
    const onScroll = () => close.current();
    document.addEventListener('mousedown', onDown);
    if (escape) window.addEventListener('keydown', onKey);
    if (scroll) window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [ref, inside, when, escape, scroll, blurFirst]);
}
