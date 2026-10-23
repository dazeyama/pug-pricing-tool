// Owned copies and the rate they suggest (owner, 2026-10-22; decisions 448, 457). Pure functions, so the
// tests run under Node.
//
// The counter shows how many copies of a Magic card we likely own: of the printing in its finish, and of
// the card in every printing. Each copy of the card over 2 suggests 5% off the card's rate, as a percent of
// it (Credit 60% with 4 owned: 54%), up to 50% off; none of the printing suggests 5% more, and none of the
// card 5% more again (+10% for a card we've never had). Bonus and cut add up. Nothing is applied by itself:
// the worker clicks Apply, or checks Auto apply rates? for the buy.

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
 * The lists say which printings those are (the owner: "it has to show specifically, which printings we own"):
 * the inventory's products by category and name, ours by set, number and finish, most first.
 * @returns {{ printing: number, card: number, printingSure: boolean, cardSure: boolean,
 *   cc: { printing: number|null, card: number|null, list: { category: string, name: string, qty: number, this: boolean }[] },
 *   ours: { printing: number, card: number,
 *     list: { set_code: string, set_name: string|null, number: string, finish: string, qty: number, this: boolean }[] },
 *   inventoryAt: string|null }}
 */
export function ownedCounts(raw) {
  const n = (v) => (v == null ? null : Number(v));
  const list = (rows) => (Array.isArray(rows) ? rows.map((r) => ({ ...r, qty: Number(r.qty), this: Boolean(r.this) })) : []);
  const cc = { printing: n(raw?.cc_printing), card: n(raw?.cc_card), list: list(raw?.cc_list) };
  const ours = { printing: n(raw?.ours_printing) ?? 0, card: n(raw?.ours_card) ?? 0, list: list(raw?.ours_list) };
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
 * An inventory product as the list of printings says it: its category, then what sets it apart from the
 * card's other products, without the card's own name ("Force of Will - Foil - Borderless" in Double Masters
 * → "Double Masters · Foil - Borderless"; "Fabricate (2090) - Rainbow Foil" → "… · #2090 · Rainbow Foil").
 * @param {{ category: string, name: string }} p
 */
export function ccRowText(p) {
  const [base, ...rest] = String(p.name ?? '').split(' - ');
  const bracket = /\(([^)]+)\)\s*$/.exec(base)?.[1];
  return [p.category, bracket && `#${bracket}`, rest.join(' - ').trim()].filter(Boolean).join(' · ');
}

/** A finish as the list says it: nonfoil → "", foil → "foil", etched → "etched". */
export const finishWord = (finish) => (finish && finish !== 'nonfoil' ? finish : '');

/**
 * Percent off the card's rate for this many copies of the card owned: 0 up to 2, then 5 a copy, 50 at most.
 * @param {number} cardCount
 */
export function ownedCut(cardCount) {
  const over = Math.max(0, Math.floor(Number(cardCount) || 0) - OWNED_FREE);
  return Math.min(OWNED_CAP, over * OWNED_STEP);
}

/** A bonus for the first of this printing we'd own (none of it, in its finish; owner, 2026-10-23; decision 457). */
export const FIRST_PRINTING_BONUS = 5;
/** And more for the first of the card in any printing ("on top of being first printing for a total bonus of +10%"). */
export const FIRST_CARD_BONUS = 5;

/**
 * What changes the card's rate, and by how much in all (decision 457): the bonuses for a first copy and the
 * cut for copies over 2, added together ("Make bonus and negatives stack"). A bonus is given only on a count
 * the inventory could make: one it couldn't (no inventory, none with quantities, no clear product for the
 * printing) might be a card we have.
 * @param {ReturnType<typeof ownedCounts>|null} counts
 * @returns {{ bonus: number, cut: number, net: number, firstPrinting: boolean, firstCard: boolean, over: number }}
 */
export function ownedAdjust(counts) {
  const none = { bonus: 0, cut: 0, net: 0, firstPrinting: false, firstCard: false, over: 0 };
  if (!counts) return none;
  const firstCard = counts.cardSure && counts.card === 0;
  // None of the card is none of the printing, whatever the printing's own count could tell.
  const firstPrinting = firstCard || (counts.printingSure && counts.printing === 0);
  const bonus = (firstPrinting ? FIRST_PRINTING_BONUS : 0) + (firstCard ? FIRST_CARD_BONUS : 0);
  const cut = ownedCut(counts.card);
  return { bonus, cut, net: bonus - cut, firstPrinting, firstCard, over: Math.max(0, counts.card - OWNED_FREE) };
}

/**
 * A rate changed by `net` percent of itself, to the cent of a percent, never past 100: 60 at −10 → 54;
 * 65 at −5 → 61.75; 60 at +10 → 66.
 */
export const adjustRate = (pct, net) => Math.min(100, Math.round(Number(pct) * (100 + net)) / 100);

/**
 * The card's own rates to suggest: its rate now (lineRate's), each side changed by the net; null when the
 * net is nothing (no change, or a bonus and a cut that cancel out).
 * @param {{ cash: number, credit: number }} rate
 * @param {ReturnType<typeof ownedAdjust>} adjust
 * @returns {{ cash: number, credit: number, net: number, adjust: object }|null}
 */
export function ownedRates(rate, adjust) {
  if (!rate || !adjust?.net) return null;
  return { cash: adjustRate(rate.cash, adjust.net), credit: adjustRate(rate.credit, adjust.net), net: adjust.net, adjust };
}

/** A percent with its sign, as the chips and the box say it: +10%, −5%. */
export const signedPct = (n) => `${n > 0 ? '+' : '−'}${Math.abs(n)}%`;
