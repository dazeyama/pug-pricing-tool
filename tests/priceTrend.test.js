import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceTrend, trendIcon, trendText } from '../src/lib/priceTrend.js';

test('a sharp move shows; a small one, or a few cents, does not', () => {
  // Sheoldred NM on 2026-10-14: −3.33% in 30 days. Nothing to show.
  assert.equal(priceTrend({ price: 98.63, priceChange7d: -2.42, priceChange30d: -3.33 }), null);
  // Up 40% this month.
  const up = priceTrend({ price: 14, priceChange7d: 5, priceChange30d: 40 });
  assert.equal(up.dir, 'up');
  assert.equal(up.days, 30);
  assert.equal(Math.round(up.from * 100) / 100, 10);
  assert.equal(trendIcon(up), '📈');
  assert.equal(trendText(up), 'Up 40% in 30 days on JustTCG ($10 → $14)');
  // A cheap card doubling is still under a dollar's move.
  assert.equal(priceTrend({ price: 0.3, priceChange7d: 100, priceChange30d: 100 }), null);
  // No figures (an old cached price), or no price.
  assert.equal(priceTrend({ price: 20 }), null);
  assert.equal(priceTrend({ price: null, priceChange30d: 80 }), null);
  assert.equal(priceTrend(null), null);
});

test("this week's move wins over the month's", () => {
  const t = priceTrend({ price: 30, priceChange7d: -25, priceChange30d: 60 });
  assert.equal(t.dir, 'down');
  assert.equal(t.days, 7);
  assert.equal(trendIcon(t), '📉');
  // A month's fall when the week is quiet.
  assert.equal(priceTrend({ price: 50, priceChange7d: -3, priceChange30d: -30 }).days, 30);
  // −100% can't be read back to a price: ignored.
  assert.equal(priceTrend({ price: 5, priceChange7d: -100 }), null);
});
