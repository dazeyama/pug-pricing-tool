import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditOfferFor, parseMoney } from '../src/lib/money.js';

// A collection's offer (owner, 2026-09-29): credit follows the cash offer at the rates.
test('credit offer scales the cash offer by credit % / cash %', () => {
  assert.equal(creditOfferFor(120, 33, 66), 240);
  assert.equal(creditOfferFor(100, 40, 66), 165);
});

test('credit offer is rounded down by the price steps', () => {
  // 100 × 60 / 35 = 171.43 → $5 steps between $100 and $1,000.
  assert.equal(creditOfferFor(100, 35, 60), 170);
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
