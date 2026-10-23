import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchGeneration, matchesChanged } from '../src/lib/matchCache.js';

// Owner, 2026-10-23 (decision 473): a match forgotten in Settings shows on the Price screen without a refresh.
test('each change to matches moves the generation on, so counts kept from before are read again', () => {
  const before = matchGeneration();
  matchesChanged();
  assert.equal(matchGeneration(), before + 1);
  matchesChanged();
  assert.equal(matchGeneration(), before + 2);
});
