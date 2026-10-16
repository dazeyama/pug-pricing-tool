// Why a button can't be used now (FABLE_REPORT B8): a page lists its reasons
// in order as [when, why] pairs, and the first that applies is the tooltip
// (and the toast when it's clicked anyway). One list per button, so a new
// reason is one more pair in the right place.

/**
 * The first reason that applies, or null when none does.
 * @param {Array<[unknown, string]|false|null|undefined>} reasons  falsy entries are skipped
 * @returns {string|null}
 */
export function firstReason(reasons) {
  for (const pair of reasons) {
    if (pair && pair[0]) return pair[1];
  }
  return null;
}
