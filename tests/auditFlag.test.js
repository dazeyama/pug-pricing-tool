import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagBanner, flaggedBuys } from '../src/lib/auditPrint.js';

// Flagged buys on the printout (owner, 2026-10-18; decision 301): a red banner naming them.

test('the banner names the flagged buys, in order', () => {
  assert.deepEqual(flaggedBuys([null, 'Buy 45', 'Buy 42', 'Buy 45']), ['Buy 42', 'Buy 45']);
  assert.deepEqual(flaggedBuys(['Buy 10', 'Buy 9']), ['Buy 9', 'Buy 10']);
  assert.equal(flagBanner([]), null);
  assert.equal(flagBanner(['Buy 42']), 'CHECK CONDITION: Buy 42 is flagged. Check its cards before export.');
  assert.equal(flagBanner(['Buy 42', 'Buy 45']), 'CHECK CONDITION: Buys 42 and 45 are flagged. Check their cards before export.');
  assert.equal(flagBanner(['Buy 9', 'Buy 10', 'Buy 11']),
    'CHECK CONDITION: Buys 9, 10 and 11 are flagged. Check their cards before export.');
});
