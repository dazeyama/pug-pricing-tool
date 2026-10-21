import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditOfferFor, payout } from '../src/lib/money.js';
import {
  DEFAULT_TIERS, creditOfferForLines, customNote, lineRate, mixedRateLines, otherRate, rateTotals, tiersFrom,
} from '../src/lib/rates.js';

// Individual rates (docs/TEAM_FEEDBACK.md 4, owner 2026-10-14).
const tiers = tiersFrom(null);
const master = { cash: 33, credit: 66, customCash: null, customCredit: null, tiers };
const line = (unit, extra = {}) => ({ unit_price: unit, quantity: 1, ...extra });

// Decision 413: the mixed rates in bullets.
test('mixed rates: low end, high end, own rate, the rest at the master rate', () => {
  const lines = [
    line(1, { quantity: 12 }), line(50, { quantity: 3 }), line(10, { quantity: 20 }),
    line(10, { quantity: 2, custom_cash_pct: 45, custom_credit_pct: 70 }),
  ];
  assert.deepEqual(mixedRateLines(lines, master), [
    '12 low-end (under $3) cards at Cash 25% / Credit 50%',
    '3 high-end (over $35) cards at Cash 40% / Credit 70%',
    '2 cards with their own rate (Set Rate) at Cash 45% / Credit 70%',
    '20 cards at the master rate at Cash 33% / Credit 66%',
  ]);
  assert.deepEqual(mixedRateLines([line(10, { quantity: 4 })], master), [], 'every card on the master rate: none');
  const custom = { ...master, customCash: 40, customCredit: 70 };
  assert.deepEqual(mixedRateLines([line(10, { quantity: 4 }), line(20)], custom), [], 'every card at one custom rate: none');
});

test('the shipped tiers: under $3 at 50/25, over $35 at 70/40', () => {
  assert.deepEqual(tiers, {
    low: { under: 3, credit: 50, cash: 25 },
    high: { over: 35, credit: 70, cash: 40 },
  });
  assert.deepEqual(tiersFrom({ low: { under: '2.5' } }).low, { under: 2.5, credit: 50, cash: 25 });
  assert.equal(DEFAULT_TIERS.high.over, 35);
});

test('thresholds are strict and use the unit price (4.2)', () => {
  assert.deepEqual(lineRate(line(2.99), master), { cash: 25, credit: 50, why: { cash: 'low', credit: 'low' } });
  assert.deepEqual(lineRate(line(3), master), { cash: 33, credit: 66, why: { cash: 'base', credit: 'base' } });
  assert.deepEqual(lineRate(line(35), master), { cash: 33, credit: 66, why: { cash: 'base', credit: 'base' } });
  assert.deepEqual(lineRate(line(35.01), master), { cash: 40, credit: 70, why: { cash: 'high', credit: 'high' } });
  // A Sell Price doesn't move a card between tiers: its unit price decides.
  assert.equal(lineRate(line(2, { cc_sell_price: 50 }), master).cash, 25);
});

test('bulk never takes the low-end or high-end rates (5.6)', () => {
  assert.deepEqual(lineRate(line(0.75, { bulk_kind: 'pkm_100' }), master).why, { cash: 'base', credit: 'base' });
  assert.equal(lineRate(line(80, { bulk_kind: 'mtg_10_dollar' }), master).credit, 66);
});

test('custom rates on the list turn the low/high rules off (4.1)', () => {
  const custom = { ...master, credit: 70, customCredit: 70 };
  // Credit custom, Cash not: Cash takes the base (master), still no tiers.
  assert.deepEqual(lineRate(line(1), custom), { cash: 33, credit: 70, why: { cash: 'custom', credit: 'custom' } });
  assert.deepEqual(lineRate(line(100), custom), { cash: 33, credit: 70, why: { cash: 'custom', credit: 'custom' } });
});

test("a card's own rate is strongest, each side on its own", () => {
  const own = line(1, { custom_credit_pct: 75 });
  assert.deepEqual(lineRate(own, master), { cash: 25, credit: 75, why: { cash: 'low', credit: 'own' } });
  const custom = { ...master, cash: 40, customCash: 40 };
  assert.deepEqual(lineRate(line(1, { custom_cash_pct: 45 }), custom),
    { cash: 45, credit: 66, why: { cash: 'own', credit: 'custom' } });
  assert.deepEqual(otherRate(own, master), { cash: 25, credit: 50, why: { cash: 'low', credit: 'low' } });
});

test('a fixed rate wins, read as the step that gives it', () => {
  const kept = { ...master };
  assert.deepEqual(lineRate(line(1, { cash_pct: 25, credit_pct: 50 }), kept).why, { cash: 'low', credit: 'low' });
  assert.deepEqual(lineRate(line(1, { cash_pct: 33, credit_pct: 66 }), kept),
    { cash: 33, credit: 66, why: { cash: 'fixed', credit: 'fixed' } });
  assert.deepEqual(lineRate(line(1, { cash_pct: 45, credit_pct: 50, custom_cash_pct: 45 }), kept).why,
    { cash: 'own', credit: 'low' });
});

test('every card on one rate: exactly the old payout (4.4)', () => {
  const custom = { ...master, cash: 40, credit: 70, customCash: 40, customCredit: 70 };
  const lines = [line(1.37, { quantity: 3 }), line(12.5), line(240), line(0.29, { quantity: 7 })];
  const market = Math.round(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0) * 100) / 100;
  const t = rateTotals(lines, custom);
  assert.equal(t.market, market);
  assert.equal(t.cash, payout(market, 40));
  assert.equal(t.credit, payout(market, 70));
  assert.equal(t.mixed, false);
  assert.deepEqual(rateTotals([], master), { market: 0, cash: 0, credit: 0, mixed: false, off: { own: 0, low: 0, high: 0, fixed: 0 } });
});

test('mixed rates: each card at its rate, added up, rounded down once', () => {
  const lines = [line(1, { quantity: 8 }), line(10), line(40), line(20, { custom_credit_pct: 80 })];
  const t = rateTotals(lines, master);
  assert.equal(t.market, 78);
  // Cash: 8 × 25% + 10 × 33% + 40 × 40% + 20 × 33% = 2 + 3.30 + 16 + 6.60 = 27.90 → $27
  assert.equal(t.cash, 27);
  // Credit: 8 × 50% + 10 × 66% + 40 × 70% + 20 × 80% = 4 + 6.60 + 28 + 16 = 54.60 → $54
  assert.equal(t.credit, 54);
  assert.equal(t.mixed, true);
  assert.deepEqual(t.off, { own: 1, low: 8, high: 1, fixed: 0 });
  // The CUSTOM chip counts only cards with their own rate (owner, 2026-10-15).
  assert.equal(customNote(t.off), '1 card has its own rate (Set Rate).');
  assert.equal(customNote({ own: 3 }), '3 cards have their own rates (Set Rate).');
});

test('an exported card counts at its Sell Price', () => {
  const t = rateTotals([line(10, { cc_sell_price: 12 })], master);
  assert.equal(t.market, 12);
  assert.equal(t.cash, payout(12, 33));
});

test('credit offers: as before on one rate, the same deal on mixed rates', () => {
  const custom = { ...master, customCash: 33, customCredit: 66 };
  assert.equal(creditOfferForLines(120, [line(1), line(50)], custom), creditOfferFor(120, 33, 66));
  assert.equal(creditOfferForLines(100, [], master), creditOfferFor(100, 33, 66));
  // $10 at 33/66 and $40 at 40/70: Cash 3.30 + 16 = 19.30, Credit 6.60 + 28 = 34.60.
  assert.equal(creditOfferForLines(100, [line(10), line(40)], master), 175);   // 179.27 → $5 steps
  assert.equal(creditOfferForLines(null, [line(10)], master), null);
});
