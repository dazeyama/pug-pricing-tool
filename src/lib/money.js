// Money (spec 4.9, 7.8): USD, shown as $1,234.56, and whole dollars without
// ".00" ($12, $1,230; owner, 2026-09-29). Totals round the sum, not each
// line (Phase 6 adds the totals).
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** $1,234.56, $12 (never $12.00), or '—' for no amount. */
export function formatMoney(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const n = Number(amount);
  return Math.round(n * 100) % 100 === 0 ? usdWhole.format(n) : usd.format(n);
}

/**
 * Store rounding for market and fallback prices (owner, 2026-09-29), always
 * down: under $1 to the cent; $1–$10 to the quarter; $10–$50 to the dollar;
 * $50–$1,000 to the $5; $1,000 and up to the $10. Done in whole cents so
 * float error can't push a price across a step. Manual prices aren't rounded.
 * @returns {number|null}
 */
export function roundDownPrice(price) {
  if (price == null || Number.isNaN(Number(price))) return null;
  const cents = Math.round(Number(price) * 100);
  const step = cents >= 100_000 ? 1000 : cents >= 5000 ? 500 : cents >= 1000 ? 100 : cents >= 100 ? 25 : 1;
  return (Math.floor(cents / step) * step) / 100;
}

/** "12.5" / "$12.50" / "12" → 12.5; null for anything that isn't a price ≥ 0 with ≤ 2 decimals. */
export function parseMoney(text) {
  const clean = String(text ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Number(clean);
}
