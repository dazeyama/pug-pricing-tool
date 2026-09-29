// Money (spec 4.9, 7.8): USD, shown as $1,234.56. Totals round the sum, not
// each line (Phase 6 adds the totals).
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** $1,234.56, or '—' for no amount. */
export function formatMoney(amount) {
  return amount == null || Number.isNaN(Number(amount)) ? '—' : usd.format(Number(amount));
}

/** "12.5" / "$12.50" / "12" → 12.5; null for anything that isn't a price ≥ 0 with ≤ 2 decimals. */
export function parseMoney(text) {
  const clean = String(text ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Number(clean);
}
