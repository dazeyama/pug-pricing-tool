import { creditOfferFor, formatMoney, roundDownPrice } from './money.js';

// Individual rates (docs/TEAM_FEEDBACK.md 4, owner 2026-10-14): which Cash and
// Credit rate each card gets, and the totals from them. Every total in the
// app comes from here; the database works the same rule out in
// internal.line_pct (migration 0055), so the two agree.
//
// `rates` is what a list's page builds: { cash, credit, customCash,
// customCredit, tiers }. cash / credit are the list's base rates (its custom
// ones, else the Master Buy Percentages; a confirmed buy's or Paid/Ours
// collection's as kept), customCash / customCredit its custom rates or null,
// tiers the low-end and high-end rates (Settings).

/** Settings → Low-end and high-end rates, as shipped (4.2). */
export const DEFAULT_TIERS = Object.freeze({
  low: Object.freeze({ under: 3, credit: 50, cash: 25 }),
  high: Object.freeze({ over: 35, credit: 70, cash: 40 }),
});

/** The tiers from a saved setting (possibly partial), as numbers, over the defaults. */
export function tiersFrom(value) {
  const low = { ...DEFAULT_TIERS.low, ...(value?.low ?? {}) };
  const high = { ...DEFAULT_TIERS.high, ...(value?.high ?? {}) };
  return {
    low: { under: Number(low.under), credit: Number(low.credit), cash: Number(low.cash) },
    high: { over: Number(high.over), credit: Number(high.credit), cash: Number(high.cash) },
  };
}

const SIDES = ['cash', 'credit'];
const num = (v) => (v == null || v === '' ? null : Number(v));

/** The price a card counts at in a total: its Sell Price once exported (export spec 5.5), else its buy price. */
export const countedPrice = (l) => Number(l.cc_sell_price ?? l.unit_price ?? 0);

/** True when the list has custom rates: the low/high rules are off for all its cards (4.1). */
export const hasCustom = (rates) => rates?.customCash != null || rates?.customCredit != null;

/**
 * One card's Cash and Credit rate, and why (4.1), strongest first:
 *   fixed   kept on the card when its buy was confirmed (4.6)
 *   own     its own rate (Set Rate, 4.3)
 *   custom  the list's custom rates (the low/high rules are off)
 *   low     under the low-end threshold (strictly; its unit price, 4.2)
 *   high    over the high-end threshold (strictly)
 *   base    the list's base rate (the Master Buy Percentages, or as kept)
 * Each side on its own: an own Credit rate and no own Cash rate takes Cash
 * from the next step down. A fixed rate reads as its own rate, or as the step
 * that would give it today (low, high…), else 'fixed'.
 * @returns {{ cash: number, credit: number, why: { cash: string, credit: string } }}
 */
export function lineRate(line, rates) {
  const tiers = rates?.tiers ?? DEFAULT_TIERS;
  const price = Number(line?.unit_price ?? 0);
  const out = { why: {} };
  for (const side of SIDES) {
    const fixed = num(line?.[`${side}_pct`]);
    const own = num(line?.[`custom_${side}_pct`]);
    const base = Number(rates?.[side]);
    let pct;
    let why;
    if (fixed != null) {
      pct = fixed;
      if (own != null) why = 'own';
      else {
        const live = lineRate({ unit_price: line.unit_price }, rates);
        why = live[side] === fixed ? live.why[side] : 'fixed';
      }
    } else if (own != null) {
      pct = own;
      why = 'own';
    } else if (hasCustom(rates)) {
      pct = base;
      why = 'custom';
    } else if (price < Number(tiers.low.under)) {
      pct = Number(tiers.low[side]);
      why = 'low';
    } else if (price > Number(tiers.high.over)) {
      pct = Number(tiers.high[side]);
      why = 'high';
    } else {
      pct = base;
      why = 'base';
    }
    out[side] = pct;
    out.why[side] = why;
  }
  return out;
}

/** The rate a card would get without its own rate: what Set Rate is measured against (4.5). */
export function otherRate(line, rates) {
  return lineRate({ ...line, custom_cash_pct: null, custom_credit_pct: null, cash_pct: null, credit_pct: null }, rates);
}

/** A card has its own rate (Set Rate) on either side. */
export const hasOwnRate = (line) => line?.custom_cash_pct != null || line?.custom_credit_pct != null;

/**
 * Market, Cash and Credit for a list (4.4): each card's price times its own
 * rate, added up, then rounded down once like any payout. Cards are added up
 * rate by rate, so with every card on one rate it's exactly payout(market,
 * rate), as before. `off` counts the cards (copies) not on the base rate, by
 * why (`off.own`: the CUSTOM chip); `mixed`, any card off the base rate.
 * @param {object[]} lines
 * @param {object} rates
 * @param {(l: object) => number} [priceOf]
 * @returns {{ market: number, cash: number, credit: number, mixed: boolean,
 *   off: { own: number, low: number, high: number, fixed: number } }}
 */
export function rateTotals(lines, rates, priceOf = countedPrice) {
  const groups = { cash: new Map(), credit: new Map() };
  const off = { own: 0, low: 0, high: 0, fixed: 0 };
  let sum = 0;
  for (const l of lines) {
    const amount = priceOf(l) * l.quantity;
    sum += amount;
    const r = lineRate(l, rates);
    let away = null;
    for (const side of SIDES) {
      groups[side].set(r[side], (groups[side].get(r[side]) ?? 0) + amount);
      if (r[side] !== Number(rates?.[side])) away ??= r.why[side];
    }
    if (away) off[away] += l.quantity;
  }
  // Rate by rate: one rate is market × rate, rounded down, exactly as before.
  const total = (side) => {
    let raw = 0;
    for (const [pct, amount] of groups[side]) raw += ((Math.round(amount * 100) / 100) * pct) / 100;
    return roundDownPrice(raw);
  };
  return {
    market: Math.round(sum * 100) / 100,
    cash: total('cash'),
    credit: total('credit'),
    mixed: off.own + off.low + off.high + off.fixed > 0,
    off,
  };
}

/** The CUSTOM chip's tooltip: "2 cards have their own rates (Set Rate)." */
export function customNote(off) {
  const n = off.own;
  return n === 1 ? '1 card has its own rate (Set Rate).' : `${n} cards have their own rates (Set Rate).`;
}

/** Why a card has its rate, for a tooltip: "high end: cards over $35". */
export function whyText(why, rates) {
  const tiers = rates?.tiers ?? DEFAULT_TIERS;
  return {
    own: 'its own rate',
    fixed: 'as kept when confirmed',
    custom: 'the custom rate',
    low: `low end: cards under ${formatMoney(tiers.low.under)}`,
    high: `high end: cards over ${formatMoney(tiers.high.over)}`,
    base: 'the master rate',
  }[why] ?? '';
}

/**
 * The credit offer that goes with a typed cash offer (owner, 2026-09-29): the
 * same deal at the list's rates. With every card on the base rates that's
 * cash × credit % ÷ cash %, as before; with mixed rates, cash × the cards'
 * Credit ÷ their Cash (before rounding), so it's still the same deal.
 */
export function creditOfferForLines(cash, lines, rates, priceOf = countedPrice) {
  if (cash == null) return null;
  let rawCash = 0;
  let rawCredit = 0;
  let uniform = true;
  for (const l of lines) {
    const r = lineRate(l, rates);
    const amount = priceOf(l) * l.quantity;
    rawCash += amount * r.cash;
    rawCredit += amount * r.credit;
    if (r.cash !== Number(rates.cash) || r.credit !== Number(rates.credit)) uniform = false;
  }
  if (uniform || !rawCash) return creditOfferFor(cash, rates.cash, rates.credit);
  return roundDownPrice((Number(cash) * rawCredit) / rawCash);
}
