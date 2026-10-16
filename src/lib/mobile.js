// Phones get the scanner, not the desktop app (docs/SCAN_FUNCTION.md 5.1).
// A phone is a touch-first screen whose shorter side is under 900 CSS px:
// store computers (a mouse, even a touch laptop's) and wide tablets keep the
// desktop app. The scanner's page, #/scan, also opens on any device, so a
// laptop's webcam can stand in for a phone while testing.

/** Shorter than this (CSS px) on its shorter side, a touch-first screen is a phone. */
export const PHONE_MAX_SIDE = 900;

/**
 * Is this screen a phone's? Pure, for tests.
 * @param {{ coarse: boolean, width: number, height: number }} screen
 *   coarse: the main pointer is a finger (`(pointer: coarse)`); width × height: the screen's CSS px
 */
export function isPhoneLike({ coarse, width, height }) {
  return Boolean(coarse) && Math.min(width, height) < PHONE_MAX_SIDE;
}

/** This device: a phone? */
export function isPhone() {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return isPhoneLike({ coarse, width: window.screen?.width ?? window.innerWidth, height: window.screen?.height ?? window.innerHeight });
}

/**
 * Safari on an iPhone or iPad, not as a home-screen app: its toolbar floats
 * over the bottom of the page (iOS 26), so a page that must show everything
 * keeps that much room free (styles/scan.css .ios-bar).
 */
export function hasFloatingToolbar() {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !navigator.standalone;
}

/** Is the page on the scanner (a phone anywhere, or #/scan on any device)? */
export function inScanMode(hash = typeof window === 'undefined' ? '' : window.location.hash) {
  return isPhone() || /^#\/scan(\/|$|\?)/.test(hash);
}

/**
 * Keeps `data-scan` on <html> while the page is the scanner's: it turns off
 * the desktop-only notice and the laptop zoom (styles/scan.css).
 */
export function watchScanMode(root = document.documentElement) {
  const apply = () => {
    if (inScanMode()) root.dataset.scan = '';
    else delete root.dataset.scan;
  };
  apply();
  window.addEventListener('hashchange', apply);
  return () => window.removeEventListener('hashchange', apply);
}
