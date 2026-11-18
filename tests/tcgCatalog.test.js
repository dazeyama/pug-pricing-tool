import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogSummary } from '../src/lib/tcgCatalog.js';

// Decision 588, phase 1: what Settings → Crystal Commerce matching says about the stored TCGplayer catalog.
test('the catalog as stored: its sets, its products, when a pass last finished; nothing before the first', () => {
  assert.equal(catalogSummary([]), null);
  assert.equal(catalogSummary(null), null);
  assert.deepEqual(catalogSummary([
    { group_id: 1, products: 398, checked_at: '2026-11-18T20:05:00+00:00' },
    { group_id: 2, products: '5794', checked_at: '2026-11-18T20:06:30+00:00' },
    { group_id: 3, products: 0, checked_at: '2026-11-17T20:00:00+00:00' },
  ]), { groups: 3, products: 6192, checkedAt: '2026-11-18T20:06:30+00:00' });
  // A first fill cut short: its sets are loaded but no pass has finished, so there's no time to show.
  assert.deepEqual(catalogSummary([
    { group_id: 1, products: 398, checked_at: null },
    { group_id: 4, products: 2, checked_at: null },
  ]), { groups: 2, products: 400, checkedAt: null });
  // A set new since the last pass doesn't hide when that pass finished.
  assert.equal(catalogSummary([
    { group_id: 1, products: 1, checked_at: '2026-11-17T20:00:00+00:00' },
    { group_id: 5, products: 1, checked_at: null },
  ]).checkedAt, '2026-11-17T20:00:00+00:00');
});
