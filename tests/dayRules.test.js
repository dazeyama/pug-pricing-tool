import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayExportLines, markedByHand, struckByCompletion } from '../src/pages/day/dayRules.js';

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

// Decision 361: "Download the same file again" on a day is that day's export only.
test("the day's file again: the cards stamped with the day's Custom SKU", () => {
  const line = (id, sku, status = 'exported') => ({ id, cc_status: status, cc_custom_sku: sku });
  const lines = [
    line(1, '101626'),
    line(2, '101626-42'),                  // Export single buy
    line(3, '101826'),                     // restamped by a later Can't upload export
    line(4, '101626', 'cant_upload'),
    line(5, null, null),                   // marked Completed by hand
  ];
  const got = dayExportLines(lines, '2026-10-16');
  assert.deepEqual(got.lines.map((l) => l.id), [1]);
  assert.deepEqual(got.skus, ['101626']);
});

test("the day's file again: a day exported before 0071, stamped the day it ran", () => {
  const lines = [
    { id: 1, cc_status: 'exported', cc_custom_sku: '101226' },
    { id: 2, cc_status: 'exported', cc_custom_sku: '101226' },
  ];
  const got = dayExportLines(lines, '2026-10-11');
  assert.deepEqual(got.lines.map((l) => l.id), [1, 2]);
  assert.deepEqual(got.skus, ['101226']);
});

test("the day's file again: single buys only is no day file", () => {
  const got = dayExportLines([{ id: 1, cc_status: 'exported', cc_custom_sku: '101626-42' }], '2026-10-16');
  assert.deepEqual(got.lines, []);
});
