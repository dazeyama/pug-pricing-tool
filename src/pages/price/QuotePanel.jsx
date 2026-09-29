import { formatMoney, percentOf } from '../../lib/money.js';

/**
 * The price panel beside the card info (owner, 2026-09-29): the selected
 * condition's purchase price, big and green, with what the store would pay
 * in Credit and Cash under it. Display only: nothing here is saved, it's
 * worked out again from the price and the Master Buy Percentages.
 * @param {{ source: 'justtcg'|'fallback'|'manual'|null }} props
 */
export default function QuotePanel({ candidate, loading, condition, price, source, cashPct, creditPct }) {
  if (!candidate) {
    return (
      <aside className="area-quote">
        <div className="quote empty">Price appears here</div>
      </aside>
    );
  }

  const tag = source === 'manual' ? '✎ manual' : source === 'fallback' ? 'fallback' : null;
  const chip = (label, pct) => {
    const amount = price != null ? percentOf(price, pct) : null;
    return (
      <span
        className={`quote-chip ${label.toLowerCase()}`}
        title={amount != null ? `${label}: ${pct}% of ${formatMoney(price)}` : `${label}: ${pct}%`}
      >
        <span className="quote-chip-label">{label}</span>
        <b>{loading ? '…' : formatMoney(amount)}</b>
      </span>
    );
  };

  return (
    <aside className="area-quote">
      <div className="quote">
        <div className="quote-label">
          <span className={`quote-cond cond-${condition.toLowerCase()}`}>{condition}</span>
          price
          {tag && !loading && <span className={`quote-tag ${source}`}>{tag}</span>}
        </div>
        {loading ? (
          <div className="quote-price shimmer" aria-label="Loading price" />
        ) : (
          <div className={`quote-price${price == null ? ' none' : ''}`}>{formatMoney(price)}</div>
        )}
        <div className="quote-chips">
          {chip('Credit', creditPct)}
          {chip('Cash', cashPct)}
        </div>
      </div>
    </aside>
  );
}
