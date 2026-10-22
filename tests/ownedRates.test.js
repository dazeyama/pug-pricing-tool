import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutRate, ownedCounts, ownedCut, ownedRates } from '../src/lib/ownedRates.js';

// Owner, 2026-10-22 (decision 448): 5% per copy of the card over 2, as a percent of the rate, up to 50%.
test('the cut: nothing up to 2 copies, then 5% a copy, 50% at most', () => {
  assert.equal(ownedCut(0), 0);
  assert.equal(ownedCut(2), 0);
  assert.equal(ownedCut(3), 5);
  assert.equal(ownedCut(4), 10);
  assert.equal(ownedCut(6), 20);
  assert.equal(ownedCut(12), 50);
  assert.equal(ownedCut(40), 50);
  assert.equal(ownedCut(null), 0);
});

test('a rate lowered as a percent of itself, kept to the cent of a percent', () => {
  // The owner's examples: Credit 60% / Cash 40% with 4 owned; Force of Will on the high end (70 / 40).
  assert.equal(cutRate(60, 10), 54);
  assert.equal(cutRate(40, 10), 36);
  assert.equal(cutRate(70, 10), 63);
  assert.equal(cutRate(65, 5), 61.75);
  assert.equal(cutRate(45, 5), 42.75);
  assert.equal(cutRate(60, 50), 30);
  assert.deepEqual(ownedRates({ cash: 40, credit: 60 }, 20), { cash: 32, credit: 48, cut: 20 });
  assert.equal(ownedRates({ cash: 40, credit: 60 }, 0), null);
});

test("the counts: the inventory's plus ours, unsure where the inventory couldn't count", () => {
  const c = ownedCounts({ cc_printing: 2, cc_card: 5, ours_printing: 1, ours_card: 3, inventory_at: 'x' });
  assert.equal(c.printing, 3);
  assert.equal(c.card, 8);
  assert.equal(c.printingSure && c.cardSure, true);
  const none = ownedCounts({ cc_printing: null, cc_card: null, ours_printing: 1, ours_card: 2, inventory_at: null });
  assert.equal(none.printing, 1);
  assert.equal(none.card, 2);
  assert.equal(none.printingSure || none.cardSure, false);
  assert.equal(ownedCounts(null).card, 0);
});
