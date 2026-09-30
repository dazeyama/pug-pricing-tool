// The info box's outside links (Scryfall/TCGdex, TCGplayer, Cardmarket) open
// in a small pop-up window instead of a new tab (owner, 2026-09-29). Each site
// gets one pop-up, reused for the next card, so after the first click it's
// already open, placed and warm. The link itself loads the page into it
// (target = the pop-up's name, no referrer), so a blocked pop-up still opens
// the page in a tab.

// Each site's pop-up sits a little down and right of the one before, so two
// open at once don't hide each other exactly.
const CASCADE = { scryfall: 0, tcgdex: 0, tcgplayer: 1, cardmarket: 2 };

/** The window name a site's links target, e.g. "pug-tcgplayer". */
export const popupName = (site) => `pug-${site}`;

/**
 * onClick for a link with target={popupName(site)}: makes sure the site's
 * pop-up exists (sized and centred over the app) and is in front before the
 * link loads into it. Ctrl/Shift/⌘/Alt-clicks are left to the browser.
 */
export function openPopup(event, site) {
  if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) return;
  const step = (CASCADE[site] ?? 0) * 32;
  const width = Math.min(1280, window.screen.availWidth - 120);
  const height = Math.min(1000, window.screen.availHeight - 120);
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2 + step);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2 + step);
  // An empty URL opens a blank pop-up, or returns the existing one untouched.
  const popup = window.open('', popupName(site), `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
  popup?.focus();
}
