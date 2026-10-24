// A page opened before a push (decision 507): each push replaces the site's files, so a tab still running the
// build before it asks for a part loaded only when needed (the printouts' PDF maker, the stickers', the scanner's
// reader…) by a name that's gone, and the browser's own words ("Failed to fetch dynamically imported module: …")
// tell the worker nothing. The page isn't reloaded for them: that would lose what's open, an export's picks or a
// typed search. Pure, for tests; main.jsx listens for Vite's `vite:preloadError` and puts these words in.

export const STALE_BUILD = 'The app was updated since this page was opened: reload the page (F5) and try again.';

// What each browser says when a module or its CSS can't be fetched.
const MISSING_PART = [
  /Failed to fetch dynamically imported module/i,   // Chrome, Edge
  /error loading dynamically imported module/i,     // Firefox
  /Importing a module script failed/i,              // Safari
  /Unable to preload CSS/i,                         // Vite's own, for a part's stylesheet
];

/**
 * Is this the error a page from an older build gets for a part that's no longer on the site?
 * @param {unknown} error
 * @returns {boolean}
 */
export function isStaleBuild(error) {
  const message = String(/** @type {any} */ (error)?.message ?? '');
  return MISSING_PART.some((re) => re.test(message));
}

/**
 * Put the plain words on such an error, so every "Couldn't print: …" toast says what to do. Nothing else is
 * changed. Errors whose message can't be written are left as they are.
 * @param {unknown} error
 * @returns {boolean} whether the words were put in
 */
export function explainStaleBuild(error) {
  if (!isStaleBuild(error)) return false;
  try {
    /** @type {any} */ (error).message = STALE_BUILD;
    return /** @type {any} */ (error).message === STALE_BUILD;
  } catch {
    return false;
  }
}
