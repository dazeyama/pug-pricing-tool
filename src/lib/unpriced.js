// Cards with no price (decision 513): a project that skips pricing takes its cards without one, so no JustTCG
// request is spent on them: price_source 'unpriced', at $0 (migration 0012). The list shows a dash, the totals
// say how many aren't priced, EXPORT works out their Sell Prices as for any card, and REPRICE? prices them once
// the switch is off. Only a project (and the system collections its export copies them into) holds one.

import { isStruck } from './struck.js';

export const UNPRICED = 'unpriced';

/** A card with no price's tooltip, where its price would be. */
export const NOT_PRICED_TIP = "Not priced: added while Skip pricing was on. EXPORT works out its Sell Price; REPRICE? prices it once Skip pricing is off.";

/** A card added with no price. */
export const isUnpriced = (line) => line?.price_source === UNPRICED;

/** A card that shows no price: one with none, unless an export has given it a Sell Price since. */
export const showsNoPrice = (line) => isUnpriced(line) && line.cc_sell_price == null;

/** How many cards (copies) in a list show no price, struck ones left out. */
export const unpricedCards = (lines) =>
  lines.reduce((n, l) => (showsNoPrice(l) && !isStruck(l) ? n + Number(l.quantity) : n), 0);

/** Whether a list has cards and none of them shows a price, so its totals are no figure at all. */
export const noneShowPrice = (lines) => {
  const live = lines.filter((l) => !isStruck(l));
  return live.length > 0 && live.every(showsNoPrice);
};
