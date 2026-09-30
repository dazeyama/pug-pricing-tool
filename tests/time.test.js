import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRecent, formatShortDate } from '../src/lib/time.js';

// The store's calendar is Pacific time (spec 4.9): 2026-09-29 20:00 UTC is 1 PM there.
const NOW = new Date('2026-09-29T20:00:00Z');

test('today and yesterday by the store clock', () => {
  assert.equal(formatRecent('2026-09-29T16:05:00Z', NOW), 'Today 9:05 AM');
  assert.equal(formatRecent('2026-09-28T22:12:00Z', NOW), 'Yesterday 3:12 PM');
  // 02:00 UTC on the 29th is still the 28th in Pacific time.
  assert.equal(formatRecent('2026-09-29T02:00:00Z', NOW), 'Yesterday 7:00 PM');
});

test('older dates are just the date', () => {
  assert.equal(formatRecent('2026-08-14T19:00:00Z', NOW), 'Aug 14, 2026');
  assert.equal(formatShortDate('2026-08-14T19:00:00Z'), 'Aug 14, 2026');
});
