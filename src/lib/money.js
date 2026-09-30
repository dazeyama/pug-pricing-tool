// Money (spec 4.9, 7.8): USD, shown as $1,234.56, and whole dollars without
// ".00" ($12, $1,230; owner, 2026-09-29). Cash / Credit round down by the
// price steps, and totals from the sum, not each line (Phase 6 adds totals).
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const eur = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' });
const eurWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** $1,234.56, $12 (never $12.00), or '—' for no amount. */
export function formatMoney(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const n = Number(amount);
  return Math.round(n * 100) % 100 === 0 ? usdWhole.format(n) : usd.format(n);
}

/** €2,478.82, €7 (Cardmarket prices, shown only in warnings). */
export function formatEur(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const n = Number(amount);
  return Math.round(n * 100) % 100 === 0 ? eurWhole.format(n) : eur.format(n);
}

/**
 * Store rounding for market and fallback prices, and the Cash / Credit they
 * pay (owner, 2026-09-29), always down: under $1 to the cent; $1–$10 to the
 * quarter; $10–$100 to the dollar; $100–$1,000 to the $5; $1,000 and up to
 * the $10. Done in whole cents, trimmed to 6 places first so float error
 * (0.29 × 100 = 28.999…) can't knock a price down a cent. Manual prices
 * aren't rounded.
 * @returns {number|null}
 */
export function roundDownPrice(price) {
  if (price == null || Number.isNaN(Number(price))) return null;
  const cents = Math.floor(Number((Number(price) * 100).toFixed(6)));
  const step = cents >= 100_000 ? 1000 : cents >= 10_000 ? 500 : cents >= 1000 ? 100 : cents >= 100 ? 25 : 1;
  return (Math.floor(cents / step) * step) / 100;
}

/**
 * What the store pays for one card in Cash or Credit: price × pct%, rounded
 * down by the same steps as prices (owner, 2026-09-29).
 * @returns {number|null}
 */
export function payout(price, pct) {
  if (price == null || pct == null || Number.isNaN(Number(price)) || Number.isNaN(Number(pct))) return null;
  return roundDownPrice((Number(price) * Number(pct)) / 100);
}

/** "12.5" / "$12.50" / "12" → 12.5; null for anything that isn't a price ≥ 0 with ≤ 2 decimals. */
export function parseMoney(text) {
  const clean = String(text ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Number(clean);
}

/**
 * The credit offer that goes with a cash offer (owner, 2026-09-29): the same
 * deal at the collection's rates (cash × credit % ÷ cash %), rounded down by
 * the price steps like every payout. Null with no cash rate to scale by.
 */
export function creditOfferFor(cash, cashPct, creditPct) {
  if (cash == null || !Number(cashPct)) return null;
  return roundDownPrice((Number(cash) * Number(creditPct)) / Number(cashPct));
}
