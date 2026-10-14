/**
 * The app's size on a small screen (owner, 2026-10-14: the work laptops'
 * windows are as small as 1200 × 650): everything is drawn smaller, down to
 * 80%, so more fits at once. Full size from 1500 × 812 up; 80% at 1200 × 650,
 * the smallest window the app takes (spec 7.10), and below; in between, the
 * tighter of the width and the height decides. Applied as CSS zoom (--ui-zoom
 * on <html>; price.css .shell, panels.css .modal-box and .toast-stack), so
 * every size inside shrinks alike. A window 1200 × 650 is then laid out like
 * one 1500 × 812 at full size.
 */
export const UI_FULL = { width: 1500, height: 812.5 };
export const UI_MIN = 0.8;

/** The zoom for a window `width` × `height` (CSS px), to two decimals. */
export function uiZoom(width, height) {
  const fit = Math.min(width / UI_FULL.width, height / UI_FULL.height);
  return Math.round(Math.min(1, Math.max(UI_MIN, fit)) * 100) / 100;
}

/** Keeps --ui-zoom on <html> right for the window, as it's resized. */
export function watchUiZoom(root = document.documentElement) {
  const apply = () => root.style.setProperty('--ui-zoom', String(uiZoom(window.innerWidth, window.innerHeight)));
  apply();
  window.addEventListener('resize', apply);
  return () => window.removeEventListener('resize', apply);
}
