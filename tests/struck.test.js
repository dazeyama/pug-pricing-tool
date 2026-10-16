import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStruck, movesOn } from '../src/lib/struck.js';
import { cardCounts, countText } from '../src/lib/bulk.js';
import { walkInStatus } from '../src/pages/collections/status.js';
import { rateTotals } from '../src/lib/rates.js';

// Struck cards (owner, 2026-10-16): kept on the list, crossed out; treated as
// gone by exports, COMPLETE and the counts, but still in the totals.
const struck = '2026-10-16T18:00:00Z';

test('a struck card never goes on with the rest, nor bulk', () => {
  assert.equal(isStruck({ struck_at: struck }), true);
  assert.equal(isStruck({ struck_at: null }), false);
  assert.equal(movesOn({ struck_at: null }), true);
  assert.equal(movesOn({ struck_at: struck }), false);
  assert.equal(movesOn({ bulk_kind: 'mtg_100_common' }), false);
});

test('struck cards are counted apart', () => {
  const lines = [
    { quantity: 3 }, { quantity: 2, struck_at: struck },
    { quantity: 10, bulk_kind: 'mtg_100_common' }, { quantity: 1, bulk_kind: 'mtg_10_dollar', struck_at: struck },
  ];
  assert.deepEqual(cardCounts(lines), { cards: 3, bulk: 1000, struck: 12 });
  assert.equal(countText(cardCounts(lines)), '3 cards + 1,000 bulk · 12 struck');
  assert.equal(countText(cardCounts([{ quantity: 1, struck_at: struck }])), '0 cards · 1 struck');
});

test('a buy is Completed once all its cards but the struck ones are', () => {
  const buy = { buy_lines: [
    { game: 'mtg', completed_at: '2026-10-16T20:00:00Z' },
    { game: 'mtg', completed_at: null, struck_at: struck },
  ] };
  assert.equal(walkInStatus(buy, 'mtg'), 'completed');
  buy.buy_lines[1].struck_at = null;
  assert.equal(walkInStatus(buy, 'mtg'), 'paid');
});

test('struck cards still count in the totals', () => {
  const rates = { cash: 50, credit: 65 };
  const live = [{ quantity: 2, unit_price: 10 }];
  const withStruck = [{ quantity: 1, unit_price: 10 }, { quantity: 1, unit_price: 10, struck_at: struck }];
  assert.deepEqual(
    [rateTotals(withStruck, rates).market, rateTotals(withStruck, rates).cash, rateTotals(withStruck, rates).credit],
    [rateTotals(live, rates).market, rateTotals(live, rates).cash, rateTotals(live, rates).credit],
  );
});
