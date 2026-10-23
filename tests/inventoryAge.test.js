import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventoryDue } from '../src/lib/inventoryAge.js';

// Owner, 2026-10-22 (decision 451): a banner like the backup's once the inventory is over a week old.
test('the inventory reminder: more than 7 days since the upload; none uploaded is the other banner', () => {
  const now = Date.parse('2026-09-30T20:00:00Z');
  assert.equal(inventoryDue(null, now), false);
  assert.equal(inventoryDue('2026-09-23T20:00:01Z', now), false);   // 6.99 days
  assert.equal(inventoryDue('2026-09-23T19:00:00Z', now), false);   // 7 days
  assert.equal(inventoryDue('2026-09-22T19:00:00Z', now), true);    // 8 days
});
