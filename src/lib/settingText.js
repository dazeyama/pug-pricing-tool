// A Settings change in words, for its Changelog entry (decision 412): which setting, and each part
// of it that changed, before → after. Pure: the database stores it with the entry.
import { formatMoney } from './money.js';
import { bulkItem } from './bulk.js';
import { cutMoney } from './bulkCut.js';

const pct = (v) => (v == null ? '—' : `${Number(v)}%`);
const money = (v) => (v == null ? '—' : formatMoney(Number(v)));

/** A change of one part, "LP 90% → 85%", or null when it didn't change. */
const part = (label, before, after, show) => (String(before ?? '') === String(after ?? '')
  ? null : `${label} ${show(before)} → ${show(after)}`);

const TIER_PARTS = [
  ['low', 'under', 'low-end under', money], ['low', 'cash', 'low-end Cash', pct], ['low', 'credit', 'low-end Credit', pct],
  ['high', 'over', 'high-end over', money], ['high', 'cash', 'high-end Cash', pct], ['high', 'credit', 'high-end Credit', pct],
];

/**
 * @param {string} key  the setting's key
 * @param {any} before  its value before (null: never saved, the built-in default stood)
 * @param {any} after  its value now
 * @returns {string}
 */
export function settingSummary(key, before, after) {
  let name = key;
  let parts = [];
  if (key === 'cash_pct' || key === 'credit_pct') {
    name = 'Master Buy Percentages';
    parts = [part(key === 'cash_pct' ? 'Cash' : 'Credit', before, after, pct)];
  } else if (key === 'fallback_pct_mtg' || key === 'fallback_pct_pokemon') {
    name = `Master Fallback Percentages (${key === 'fallback_pct_mtg' ? 'Magic' : 'Pokémon'})`;
    parts = Object.keys(after ?? {}).map((c) => part(c, before?.[c], after[c], pct));
  } else if (key === 'rate_tiers') {
    name = 'Low-end and high-end rates';
    parts = TIER_PARTS.map(([tier, field, label, show]) => part(label, before?.[tier]?.[field], after?.[tier]?.[field], show));
  } else if (key === 'bulk_values') {
    name = 'Bulk values';
    parts = Object.keys(after ?? {}).map((kind) => part(bulkItem(kind)?.name ?? kind, before?.[kind], after[kind], money));
  } else if (key === 'bulk_export_rates') {
    name = 'Bulk export rates';
    parts = [part('red up to', before?.red, after?.red, cutMoney), part('amber up to', before?.amber, after?.amber, cutMoney)];
  } else {
    parts = [part('', before, after, (v) => JSON.stringify(v ?? null))];
  }
  const changed = parts.filter(Boolean);
  return `${name}: ${changed.length ? changed.join('; ') : 'saved, nothing changed'}.`;
}
