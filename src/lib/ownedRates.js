// Owned copies and the lower rate they suggest (owner, 2026-10-22; decision 448). Pure functions, so the
// tests run under Node.
//
// The counter shows how many copies of a Magic card we likely own: of the printing in its finish, and of
// the card in every printing. Each copy of the card over 2 suggests 5% off the card's rate, as a percent of
// it (Credit 60% with 4 owned: 54%), up to 50% off. Nothing is applied by itself: the worker clicks Apply,
// or checks Auto apply rates? for the buy.

/** Copies of a card the store owns before a lower rate is suggested. */
export const OWNED_FREE = 2;
/** Off the card's rate per copy over OWNED_FREE, in percent of the rate. */
export const OWNED_STEP = 5;
/** The most off the suggestion goes. */
export const OWNED_CAP = 50;

/**
 * `owned_copies`' answer as the counter shows it: each count is the inventory's plus ours not in it yet.
 * A count is unsure when the inventory couldn't count its share (no inventory, an inventory uploaded before
 * 0008, or, for the printing, no clear CC product): what's shown is then only what could be counted.
 * @param {object|null} raw  { cc_printing, cc_card, ours_printing, ours_card, inventory_at }
 * @returns {{ printing: number, card: number, printingSure: boolean, cardSure: boolean,
 *   cc: { printing: number|null, card: number|null }, ours: { printing: number, card: number },
 *   inventoryAt: string|null }}
 */
export function ownedCounts(raw) {
  const n = (v) => (v == null ? null : Number(v));
  const cc = { printing: n(raw?.cc_printing), card: n(raw?.cc_card) };
  const ours = { printing: n(raw?.ours_printing) ?? 0, card: n(raw?.ours_card) ?? 0 };
  return {
    printing: (cc.printing ?? 0) + ours.printing,
    card: (cc.card ?? 0) + ours.card,
    printingSure: cc.printing != null,
    cardSure: cc.card != null,
    cc,
    ours,
    inventoryAt: raw?.inventory_at ?? null,
  };
}

/**
 * Percent off the card's rate for this many copies of the card owned: 0 up to 2, then 5 a copy, 50 at most.
 * @param {number} cardCount
 */
export function ownedCut(cardCount) {
  const over = Math.max(0, Math.floor(Number(cardCount) || 0) - OWNED_FREE);
  return Math.min(OWNED_CAP, over * OWNED_STEP);
}

/** A rate lowered by `cut` percent of itself, to the cent of a percent: 60 at 10 → 54; 65 at 5 → 61.75. */
export const cutRate = (pct, cut) => Math.round(Number(pct) * (100 - cut)) / 100;

/**
 * The card's own rates to suggest: its rate now (lineRate's), each side lowered by the cut; null when
 * nothing's off.
 * @param {{ cash: number, credit: number }} rate
 * @param {number} cut
 * @returns {{ cash: number, credit: number, cut: number }|null}
 */
export function ownedRates(rate, cut) {
  if (!(cut > 0) || !rate) return null;
  return { cash: cutRate(rate.cash, cut), credit: cutRate(rate.credit, cut), cut };
}
