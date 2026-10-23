import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditOfferFor, parseMoney, payout, roundDownPrice } from '../src/lib/money.js';

// The store's rounding, always down (owner, 2026-09-29). Expected values worked out by hand, not
// by the function, so a rounding bug can't move both sides of the check.
test('rounding down: each band and its edges', () => {
  const cases = [
    [0.999, 0.99], [0.07, 0.07], [0, 0],                       // under $1: to the cent
    [1.00, 1.00], [1.24, 1.00], [1.25, 1.25], [9.99, 9.75],   // $1–$10: to the quarter
    [10.00, 10.00], [10.49, 10.00], [10.99, 10.50], [99.99, 99.50], // $10–$100: to the 50 cents (decision 478)
    [100.00, 100.00], [104.99, 104.00], [999.99, 999.00],     // $100–$1,000: to the dollar (decision 478)
    [1000.00, 1000.00], [1009.99, 1000.00], [2345.67, 2340.00], // $1,000 and up: to the $10
  ];
  for (const [raw, down] of cases) assert.equal(roundDownPrice(raw), down, `${raw}`);
});

test('rounding down: float error never takes a cent', () => {
  assert.equal(roundDownPrice(0.29), 0.29);     // 0.29 × 100 = 28.999…
  assert.equal(roundDownPrice(1.15), 1.00);     // 114.999… cents, then the quarter
  assert.equal(roundDownPrice('4.5'), 4.50);    // typed text
  assert.equal(roundDownPrice(null), null);
  assert.equal(roundDownPrice('abc'), null);
});

test('payout: price × rate, then rounded down', () => {
  assert.equal(payout(10, 33), 3.25);       // $3.30
  assert.equal(payout(10, 66), 6.50);       // $6.60
  assert.equal(payout(2.89, 50), 1.25);     // $1.445
  assert.equal(payout(0.5, 33), 0.16);      // $0.165
  assert.equal(payout(150, 66), 99);        // $99.00
  assert.equal(payout(1600, 66), 1050);     // $1,056
  assert.equal(payout(29, 1), 0.29);        // $0.29, through the float trap
  assert.equal(payout(null, 33), null);
  assert.equal(payout(10, null), null);
});

// A collection's offer (owner, 2026-09-29): credit follows the cash offer at the rates.
test('credit offer scales the cash offer by credit % / cash %', () => {
  assert.equal(creditOfferFor(120, 33, 66), 240);
  assert.equal(creditOfferFor(100, 40, 66), 165);
});

test('credit offer is rounded down by the price steps', () => {
  // 100 × 60 / 35 = 171.43 → dollar steps between $100 and $1,000 (decision 478).
  assert.equal(creditOfferFor(100, 35, 60), 171);
  // 7 × 66 / 33 = 14 exactly; 3.10 × 66 / 33 = 6.20 → quarters under $10.
  assert.equal(creditOfferFor(7, 33, 66), 14);
  assert.equal(creditOfferFor(3.1, 33, 66), 6);
});

test('no credit offer without a cash offer or cash rate', () => {
  assert.equal(creditOfferFor(null, 33, 66), null);
  assert.equal(creditOfferFor(100, 0, 66), null);
});

test('offers are typed as money', () => {
  assert.equal(parseMoney('$1,250.50'), 1250.5);
  assert.equal(parseMoney('12.345'), null);
});
