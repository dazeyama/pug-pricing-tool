import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markedByHand, struckByCompletion } from '../src/pages/day/dayRules.js';

const AT = '2026-10-19T08:00:00.123+00:00';

// Decision 340: undoing an export leaves the cards Mark as completed struck.
test('a card Mark as completed struck: struck and completed in the same moment', () => {
  assert.equal(struckByCompletion({ completed_at: AT, struck_at: AT }), true);
  assert.equal(struckByCompletion({ completed_at: AT, struck_at: null }), false, 'exported or completed, not struck');
  assert.equal(struckByCompletion({ completed_at: null, struck_at: AT }), false, 'struck by hand');
  assert.equal(struckByCompletion({ completed_at: AT, struck_at: '2026-10-19T09:00:00+00:00' }), false);
  assert.equal(struckByCompletion({ completed_at: null, struck_at: null }), false);
});

test('marked by hand: Completed without an export stamp', () => {
  assert.equal(markedByHand({ completed_at: AT, cc_status: null }), true);
  assert.equal(markedByHand({ completed_at: AT, cc_status: 'exported' }), false);
  assert.equal(markedByHand({ completed_at: null, cc_status: null }), false);
});
