import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settingSummary } from '../src/lib/settingText.js';
import { formatMoney } from '../src/lib/money.js';

// A Settings change in words, for the Changelog (decision 412).

test('a rate, a fallback percentage, a bulk value, a tier', () => {
  assert.equal(settingSummary('cash_pct', 33.34, 35), 'Master Buy Percentages: Cash 33.34% → 35%.');
  assert.equal(settingSummary('fallback_pct_mtg', { NM: 100, LP: 90 }, { NM: 100, LP: 85 }),
    'Master Fallback Percentages (Magic): LP 90% → 85%.');
  assert.equal(settingSummary('bulk_values', { mtg_100_rare: 2.4, pkm_100: 0.75 }, { mtg_100_rare: 24, pkm_100: 0.75 }),
    'Bulk values: MTG 100 Bulk rares/mythics $2.40 → $24.');
  assert.equal(settingSummary('rate_tiers',
    { low: { under: 3, cash: 25, credit: 50 }, high: { over: 35, cash: 40, credit: 70 } },
    { low: { under: 4, cash: 25, credit: 50 }, high: { over: 35, cash: 40, credit: 70 } }),
  `Low-end and high-end rates: low-end under ${formatMoney(3)} → ${formatMoney(4)}.`);
});

test('a first save shows the default as gone before, and an unchanged save says so', () => {
  assert.equal(settingSummary('credit_pct', null, 66.68), 'Master Buy Percentages: Credit — → 66.68%.');
  assert.equal(settingSummary('cash_pct', 35, 35), 'Master Buy Percentages: saved, nothing changed.');
});
