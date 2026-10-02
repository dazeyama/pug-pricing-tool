import { useEffect, useRef, useState } from 'react';
import { formatMoney, payout } from '../../lib/money.js';
import PriceWarnings from './PriceWarnings.jsx';

/**
 * The price panel beside the card info (owner, 2026-09-29): the selected
 * condition's purchase price, big and green, with what the store would pay
 * in Credit and Cash under it. Display only: nothing here is saved, it's
 * worked out again from the price and the Master Buy Percentages.
 *
 * When JustTCG's price looks wrong, one amber line under the chips says so;
 * hovering it shows the reasons in a box floating over Finish & Details, and
 * clicking keeps the box open until the next click anywhere (owner: nothing
 * else may lose room to it).
 * @param {{ source: 'justtcg'|'fallback'|'cardmarket'|'manual'|null, warnings: string[] }} props
 */
export default function QuotePanel({
  candidate, loading, condition, price, source, cashPct, creditPct, warnings, onDone,
}) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const box = useRef(null);

  // A new card starts closed.
  useEffect(() => {
    setHover(false);
    setPinned(false);
  }, [candidate?.key]);

  // Pinned open: any click outside the panel closes it.
  useEffect(() => {
    if (!pinned) return undefined;
    const close = (e) => {
      if (!box.current?.contains(e.target)) setPinned(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pinned]);

  if (!candidate) {
    return (
      <aside className="area-quote">
        <div className="quote empty">Price appears here</div>
      </aside>
    );
  }

  // A fallback price is TCGplayer's (owner, 2026-10-02: say so).
  const tag = { manual: '✎ manual', fallback: 'TCGplayer', cardmarket: 'cardmarket' }[source] ?? null;
  const chip = (label, pct) => {
    const amount = price != null ? payout(price, pct) : null;
    const raw = price != null ? (price * pct) / 100 : null;
    let title = `${label}: ${pct}%`;
    if (amount != null) {
      title += ` of ${formatMoney(price)}`;
      if (Math.abs(raw - amount) >= 0.005) title += `, rounded down from ${formatMoney(raw)}`;
    }
    return (
      <span className={`quote-chip ${label.toLowerCase()}`} title={title}>
        <span className="quote-chip-label">{label}</span>
        <b>{loading ? '…' : formatMoney(amount)}</b>
      </span>
    );
  };
  const warned = !loading && warnings.length > 0;

  return (
    <aside className="area-quote" ref={box} onMouseLeave={() => setHover(false)}>
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
        {warned && (
          <button
            type="button"
            className={`quote-warn${pinned ? ' on' : ''}`}
            aria-expanded={hover || pinned}
            onMouseEnter={() => setHover(true)}
            onClick={() => {
              setPinned(!pinned);
              onDone();
            }}
          >
            ⚠️ Price may be wrong ({warnings.length})
          </button>
        )}
      </div>
      {warned && (hover || pinned) && (
        <div className="quote-pop">
          <PriceWarnings warnings={warnings} />
        </div>
      )}
    </aside>
  );
}
