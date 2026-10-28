import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BULK_CUT, bandWords, boughtAt, boughtPrice, bulkCutFrom, bulkWords, cutMoney, isBulkPrice, keptFileTag, keptTag, keptWords, priceTone,
} from '../src/lib/bulkCut.js';
import { settingSummary } from '../src/lib/settingText.js';
import { targetOf } from '../src/lib/changelog.js';

// Decision 416: the Export rates for bulk, red 1¢ to 50¢ and amber 51¢ to $1.49 by default.
test('the defaults, and a saved setting checked', () => {
  assert.deepEqual(DEFAULT_BULK_CUT, { red: 0.5, amber: 1.49 });
  assert.deepEqual(bulkCutFrom(null), DEFAULT_BULK_CUT);
  assert.deepEqual(bulkCutFrom({ red: 0.25, amber: 2 }), { red: 0.25, amber: 2 });
  assert.deepEqual(bulkCutFrom({ red: 1, amber: 1 }), DEFAULT_BULK_CUT, 'red must be below amber');
  assert.deepEqual(bulkCutFrom({ red: 0, amber: 1 }), DEFAULT_BULK_CUT, 'from 1¢');
  assert.deepEqual(bulkCutFrom({ red: 0.5, amber: 3.01 }), DEFAULT_BULK_CUT, 'to $3');
  assert.deepEqual(bulkCutFrom({ red: 0.499999, amber: 1.4900001 }), DEFAULT_BULK_CUT, 'whole cents');
});

test('bands and the cut, edges included', () => {
  const cut = { red: 0.25, amber: 2 };
  assert.equal(priceTone(0.25, cut), 'bulk');
  assert.equal(priceTone(0.26, cut), 'dollar');
  assert.equal(priceTone(2, cut), 'dollar');
  assert.equal(priceTone(2.01, cut), null);
  assert.equal(isBulkPrice(1.49), true);
  assert.equal(isBulkPrice(1.5), false);
  assert.equal(isBulkPrice(Infinity), false, 'no Sell Price: kept, as before');
});

test('Print MTG (>…) cuts on the market price bought at, today\'s only without one (decision 575)', () => {
  assert.equal(boughtPrice({ market_price: 2.1 }, 1.2), 2.1, 'bought over the cut, cheaper today: printed');
  assert.equal(boughtPrice({ market_price: '1.25' }, 3), 1.25, 'bought under the cut, dearer today: left off');
  assert.equal(boughtPrice({ market_price: 0 }, 3), 0);
  assert.equal(boughtPrice({ market_price: null }, 1.75), 1.75, 'no market price recorded: today\'s');
  assert.equal(boughtPrice({}, null), null);
  assert.equal(isBulkPrice(boughtPrice({ market_price: 2.1 }, 1.2)), false);
  // Export MTG csv (>…) the same (decision 576): a Sell Price of $1.50 today, bought at $1.20, is pulled.
  assert.equal(isBulkPrice(boughtPrice({ market_price: 1.2 }, 1.5)), true);
  assert.equal(boughtAt({ market_price: 1.2 }), 1.2);
  assert.equal(boughtAt({ market_price: null }), null);
  assert.equal(boughtAt({ market_price: 'x' }), null);
});

test('the words on buttons, titles, files and the printout key', () => {
  const cut = DEFAULT_BULK_CUT;
  assert.equal(cutMoney(0.5), '50¢');
  assert.equal(cutMoney(1), '$1');
  assert.equal(cutMoney(null), '—');
  assert.equal(keptTag(cut), '>$1.49');
  assert.equal(keptWords(cut), '$1.50 or more');
  assert.equal(bulkWords(cut), '$1.49 or under');
  assert.deepEqual(bandWords(cut), { red: '50¢ and under', amber: '51¢ to $1.49' });
  assert.equal(keptFileTag(cut), 'over-1.49');
  assert.equal(keptTag({ red: 0.5, amber: 0.99 }), '>99¢');
  assert.equal(keptWords({ red: 0.5, amber: 0.99 }), '$1 or more');
});

test('its Changelog entry: the sentence, and the name shown for its key', () => {
  assert.equal(settingSummary('bulk_export_rates', { red: 0.5, amber: 1.49 }, { red: 0.5, amber: 1.99 }),
    'Export rates for bulk: amber up to $1.49 → $1.99.');
  assert.equal(targetOf({ action: 'setting_changed', target_name: 'bulk_export_rates' }), 'Export rates for bulk');
  assert.equal(targetOf({ action: 'setting_changed', target_name: 'Bulk values' }), 'Bulk values');
  assert.equal(targetOf({ action: 'buy_confirmed', target_name: 'bulk_export_rates' }), 'bulk_export_rates');
});
