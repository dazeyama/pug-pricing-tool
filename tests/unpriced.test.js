import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUnpriced, noneShowPrice, showsNoPrice, unpricedCards } from '../src/lib/unpriced.js';
import { rateTotals } from '../src/lib/rates.js';

// Projects that skip pricing (decision 513): a card added with no price, 'unpriced' at $0.
const none = { price_source: 'unpriced', unit_price: 0, quantity: 2 };
const priced = { price_source: 'justtcg', unit_price: 1.5, quantity: 1 };

test('a card added with no price shows none until an export gives it a Sell Price', () => {
  assert.equal(isUnpriced(none), true);
  assert.equal(isUnpriced(priced), false);
  assert.equal(showsNoPrice(none), true);
  assert.equal(showsNoPrice({ ...none, cc_sell_price: 2.5 }), false);
});

test('the cards not priced are counted by the copy, struck and exported ones left out', () => {
  assert.equal(unpricedCards([none, priced, { ...none, quantity: 3 }]), 5);
  assert.equal(unpricedCards([{ ...none, struck_at: '2026-10-24T18:00:00Z' }, { ...none, cc_sell_price: 2 }]), 0);
  assert.equal(unpricedCards([]), 0);
});

test('totals are no figure only when no card shows a price', () => {
  assert.equal(noneShowPrice([none]), true);
  assert.equal(noneShowPrice([none, priced]), false);
  assert.equal(noneShowPrice([]), false);
});

test('a card with no price adds nothing to the market', () => {
  const rates = { cash: 50, credit: 65 };
  assert.equal(rateTotals([none, priced], rates).market, rateTotals([priced], rates).market);
  // At $0 it would read as low-end: the list's totals leave it out (BuyList's Totals).
  assert.equal(rateTotals([none], rates).off.low, 2);
});
