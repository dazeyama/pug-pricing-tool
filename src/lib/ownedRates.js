// Owned copies and the rate they suggest (owner, 2026-10-22; decisions 448, 457). Pure functions, so the
// tests run under Node.
//
// The counter shows how many copies of a Magic card we likely own: of the printing in its finish, and of
// the card in every printing. Each copy of the card over 2 suggests 5% off the card's rate, as a percent of
// it (Credit 60% with 4 owned: 54%), up to 50% off; none of the printing suggests 5% more, and none of the
// card 5% more again (+10% for a card we've never had). Bonus and cut add up. Nothing is applied by itself:
// the worker clicks Apply, or checks Auto apply rates? for the buy.

/** Copies of a card the store owns before a lower rate is suggested (as shipped; Settings, decision 474). */
export const OWNED_FREE = 2;
/** Off the card's rate per copy over OWNED_FREE, in percent of the rate. */
export const OWNED_STEP = 5;
/** The most off the suggestion goes. */
export const OWNED_CAP = 50;

/**
 * Settings → Copies we own, as shipped (owner, 2026-10-23; decision 474): the counter on or off, the cut (copies
 * before it starts, per copy over that, the most), the first-copy bonuses, whether a low-end card gets them,
 * and whether a new walk-in buy starts with Auto apply rates? checked.
 */
export const DEFAULT_OWNED = Object.freeze({
  on: true,
  free: OWNED_FREE,
  step: OWNED_STEP,
  cap: OWNED_CAP,
  // The first of this printing we'd own (none of it, in its finish; decision 457), and more for the first of the
  // card in any printing ("on top of being first printing for a total bonus of +10%").
  first_printing: 5,
  first_card: 5,
  // A card on the low-end rate gets no bonus (decision 458).
  low_end_bonus: false,
  auto_default: false,
});

/**
 * The setting as saved (possibly partial, or from an older build), checked over the defaults: each number
 * a number in its range, each switch true or false. Pure.
 * @returns {typeof DEFAULT_OWNED}
 */
export function ownedFrom(value) {
  const v = value && typeof value === 'object' ? value : {};
  const num = (key, lo, hi) => {
    const n = Number(v[key]);
    return v[key] != null && v[key] !== '' && Number.isFinite(n) && n >= lo && n <= hi ? n : DEFAULT_OWNED[key];
  };
  const bool = (key) => (typeof v[key] === 'boolean' ? v[key] : DEFAULT_OWNED[key]);
  return {
    on: bool('on'),
    free: Math.floor(num('free', 0, 99)),
    step: num('step', 0, 100),
    cap: num('cap', 0, 100),
    first_printing: num('first_printing', 0, 100),
    first_card: num('first_card', 0, 100),
    low_end_bonus: bool('low_end_bonus'),
    auto_default: bool('auto_default'),
  };
}

/**
 * `owned_copies`' answer as the counter shows it: each count is the inventory's plus ours not in it yet.
 * A count is unsure when the inventory couldn't count its share (no inventory, an inventory uploaded before
 * 0008, or, for the printing, no clear CC product): what's shown is then only what could be counted.
 * @param {object|null} raw  { cc_printing, cc_card, ours_printing, ours_card, inventory_at, cc_match,
 *   cc_match_failed }
 * The lists say which printings those are (the owner: "it has to show specifically, which printings we own"):
 * the inventory's products by category and name, ours by set, number and finish, most first. `cc.match` is
 * the product the printing matched (owned.js), with copies or not; null when none clearly is it (decision 499).
 * @returns {{ printing: number, card: number, printingSure: boolean, cardSure: boolean,
 *   cc: { printing: number|null, card: number|null, list: { category: string, name: string, qty: number, this: boolean }[],
 *     match: { product_id: string, category: string, name: string }|null },
 *   ours: { printing: number, card: number,
 *     list: { set_code: string, set_name: string|null, number: string, finish: string, qty: number, this: boolean }[] },
 *   inventoryAt: string|null, known: boolean, matchFailed: boolean }}
 */
export function ownedCounts(raw) {
  const n = (v) => (v == null ? null : Number(v));
  const list = (rows) => (Array.isArray(rows) ? rows.map((r) => ({ ...r, qty: Number(r.qty), this: Boolean(r.this) })) : []);
  const card = n(raw?.cc_card);
  // None of the card in the inventory at all (a card never stocked, which no product can match): none of
  // the printing either, a count as known as the card's (decision 467).
  const printing = n(raw?.cc_printing) ?? (card === 0 ? 0 : null);
  const m = raw?.cc_match;
  const match = m?.name ? { product_id: m.product_id ?? null, category: m.category ?? '', name: m.name } : null;
  const cc = { printing, card, list: list(raw?.cc_list), match };
  const ours = { printing: n(raw?.ours_printing) ?? 0, card: n(raw?.ours_card) ?? 0, list: list(raw?.ours_list) };
  return {
    printing: (cc.printing ?? 0) + ours.printing,
    card: (cc.card ?? 0) + ours.card,
    printingSure: cc.printing != null,
    cardSure: cc.card != null,
    // Both counts known: the inventory could say which of its products is this printing (owner, 2026-10-23:
    // "when crystal can't match we should just show n/a in both box, fade the element out, and show no
    // stamp"; decision 467). Not known: no product clearly this printing, no inventory, or none with quantities.
    known: cc.printing != null && cc.card != null,
    // Not known because the match didn't go through (a request failed), not because no product is clearly it:
    // the box says so and offers to try again, never a match by hand (decision 500).
    matchFailed: Boolean(raw?.cc_match_failed) && !(cc.printing != null && cc.card != null),
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
 * The printings we own as one list (decision 518): the inventory's products and ours not in it yet together, this
 * printing first, then most first. Where the inventory could count, the product this printing matched is a row of
 * its own even with none of it (×0): it says which product the printing is. Ours are `ours` ("not in CC yet").
 * @param {ReturnType<typeof ownedCounts>|null} c
 * @returns {{ key: string, text: string, title: string|null, qty: number, this: boolean, ours: boolean }[]}
 */
export function ownedRows(c) {
  if (!c) return [];
  // This printing's row by its product's full name, to be checked here ("Wrath of God · Fourth Edition", as the
  // match line said; decision 519); the others by what tells them apart (ccRowText).
  const product = (p, qty, mine) => ({
    key: `cc:${p.product_id ?? `${p.category}|${p.name}`}`, text: mine ? `${p.name} · ${p.category}` : ccRowText(p),
    title: `${p.category} · ${p.name}`, qty, this: mine, ours: false,
  });
  const rows = c.cc.list.map((p) => product(p, p.qty, p.this));
  const m = c.cc.match;
  if (m && c.cc.card != null && !c.cc.list.some((p) => p.this)) rows.push(product(m, 0, true));
  for (const p of c.ours.list) {
    rows.push({
      key: `ours:${p.scryfall_id}|${p.set_code}|${p.number}|${p.finish}`,
      text: `${p.set_code} #${p.number}${p.set_name ? ` ${p.set_name}` : ''}${finishWord(p.finish) ? ` · ${finishWord(p.finish)}` : ''}`,
      title: null, qty: p.qty, this: p.this, ours: true,
    });
  }
  return rows.map((r, i) => ({ r, i }))
    .sort((a, b) => Number(b.r.this) - Number(a.r.this) || b.r.qty - a.r.qty || a.i - b.i)
    .map(({ r }) => r);
}

/**
 * Why the copies we own change the card's rate, in one line (decision 518): "4 copies over 2, at 5% each",
 * "First of this printing (+5%) and of this card (+5%)"; with nothing to change, why not.
 * @param {ReturnType<typeof ownedAdjust>|null} adjust
 * @param {{ lowEndWhy?: string, finish?: string|null }} [o]  lowEndWhy: "low end: cards under $3"
 */
export function ownedReason(adjust, { lowEndWhy = '', finish = null } = {}) {
  if (!adjust) return '';
  const { cfg } = adjust;
  const parts = [];
  const printing = `first of this printing${finishWord(finish) ? ` in ${finishWord(finish)}` : ''} (+${cfg.first_printing}%)`;
  if (adjust.firstPrinting && adjust.firstCard) parts.push(`${printing} and of this card (+${cfg.first_card}%)`);
  else if (adjust.firstPrinting) parts.push(printing);
  else if (adjust.firstCard) parts.push(`first of this card (+${cfg.first_card}%)`);
  if (adjust.cut > 0) {
    const capped = adjust.over * cfg.step > cfg.cap ? `, ${cfg.cap}% at most` : '';
    parts.push(`${adjust.over} ${adjust.over === 1 ? 'copy' : 'copies'} over ${cfg.free}, at ${cfg.step}% each${capped}`);
  }
  if (adjust.lowEndNoBonus) parts.push(`no first-copy bonus on a low-end card${lowEndWhy ? ` (${lowEndWhy})` : ''}`);
  let text = parts.length ? parts.join('; ') : `we have this printing, and ${cfg.free} or fewer of the card`;
  if (adjust.bonus > 0 && adjust.cut > 0 && adjust.net === 0) text += ': they cancel out';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Percent off the card's rate for this many copies of the card owned: as shipped, 0 up to 2, then 5 a copy,
 * 50 at most (Settings → Copies we own, decision 474).
 * @param {number} cardCount
 * @param {typeof DEFAULT_OWNED} [cfg]  ownedFrom's
 */
export function ownedCut(cardCount, cfg = DEFAULT_OWNED) {
  const over = Math.max(0, Math.floor(Number(cardCount) || 0) - cfg.free);
  return Math.min(cfg.cap, over * cfg.step);
}

/**
 * What changes the card's rate, and by how much in all (decision 457): the bonuses for a first copy and the
 * cut for copies over 2, added together ("Make bonus and negatives stack"). A bonus is given only on a count
 * the inventory could make: one it couldn't (no inventory, none with quantities, no clear product for the
 * printing) might be a card we have.
 * A card on the low-end rate gets no bonus (owner, 2026-10-23: "First bonuses do not apply to cards of low end
 * rates"; decision 458); the cut still applies. `lowEndNoBonus` says a bonus was left out for that.
 * The numbers, and whether a low-end card gets the bonuses, are Settings → Copies we own's (decision 474): `cfg`
 * (ownedFrom's), which comes back with the answer so its explanation says the same numbers.
 * @param {ReturnType<typeof ownedCounts>|null} counts
 * @param {{ lowEnd?: boolean, cfg?: typeof DEFAULT_OWNED }} [o]  lowEnd: the card's rate is the low-end one
 *   (lineRate's why 'low')
 * @returns {{ bonus: number, cut: number, net: number, firstPrinting: boolean, firstCard: boolean, over: number,
 *   lowEndNoBonus: boolean, cfg: typeof DEFAULT_OWNED }}
 */
export function ownedAdjust(counts, { lowEnd = false, cfg = DEFAULT_OWNED } = {}) {
  const none = {
    bonus: 0, cut: 0, net: 0, firstPrinting: false, firstCard: false, over: 0, lowEndNoBonus: false, cfg,
  };
  // Counts the inventory couldn't make change nothing: no bonus, no cut (decision 467).
  if (!counts || counts.known === false) return none;
  const firstCardCount = counts.cardSure && counts.card === 0;
  // None of the card is none of the printing, whatever the printing's own count could tell.
  const firstPrintingCount = firstCardCount || (counts.printingSure && counts.printing === 0);
  const noBonus = lowEnd && !cfg.low_end_bonus;
  // A bonus set to 0 is no bonus at all, so the box doesn't explain a "+0%".
  const firstCard = firstCardCount && !noBonus && cfg.first_card > 0;
  const firstPrinting = firstPrintingCount && !noBonus && cfg.first_printing > 0;
  const bonus = (firstPrinting ? cfg.first_printing : 0) + (firstCard ? cfg.first_card : 0);
  const cut = ownedCut(counts.card, cfg);
  return {
    bonus, cut, net: bonus - cut, firstPrinting, firstCard, over: Math.max(0, counts.card - cfg.free),
    lowEndNoBonus: noBonus && firstPrintingCount && (cfg.first_printing > 0 || cfg.first_card > 0),
    cfg,
  };
}

/** A card's rate is the low-end one (lineRate's why), either side: no first-copy bonus for it (decision 458). */
export const isLowEnd = (rate) => rate?.why?.cash === 'low' || rate?.why?.credit === 'low';

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
