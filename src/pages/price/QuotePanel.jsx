import { useEffect, useRef, useState } from 'react';
import { formatMoney, payout } from '../../lib/money.js';
import PriceWarnings from './PriceWarnings.jsx';
import PriceTrendBox from './PriceTrendBox.jsx';
import { trendIcon, trendText } from '../../lib/priceTrend.js';
import { useDismiss } from '../../lib/useDismiss.js';

/**
 * The price panel beside the card info (owner, 2026-09-29): the selected
 * condition's purchase price, big and green, with what the store would pay
 * in Credit and Cash under it. Display only: nothing here is saved, it's
 * worked out again from the price and the Master Buy Percentages.
 *
 * When JustTCG's price looks wrong, one amber line under the chips says so;
 * hovering it shows the reasons in a box floating over Finish & Details, and
 * clicking keeps the box open until the next click anywhere (owner: nothing
 * else may lose room to it). The 📈 / 📉 beside the price opens its own box
 * the same way (owner, 2026-10-14).
 * A project's Skip pricing (`skipped`, decision 514): with no price typed, "Not priced" and why, no chips.
 * @param {{ source: 'justtcg'|'fallback'|'tcgplayer'|'cardmarket'|'manual'|null, warnings: string[] }} props
 */
export default function QuotePanel({
  candidate, loading, condition, price, source, cashPct, creditPct, cashWhy = '', creditWhy = '', warnings, trend = null, onDone,
  bulkPer = null, placeholder = false, adjusted = 0, skipped = false,
}) {
  // Which box floats over Finish & Details: 'warn' (the warnings) or 'trend'
  // (the 📈 / 📉), while hovered, or clicked to keep it open.
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);
  const box = useRef(null);

  // A new card starts closed.
  useEffect(() => {
    setHover(null);
    setPinned(null);
  }, [candidate?.key]);

  // Pinned open: any click outside the panel closes it.
  useDismiss(() => setPinned(null), { ref: box, when: Boolean(pinned), escape: false });

  if (!candidate) {
    return (
      <aside className="area-quote">
        <div className="quote empty">Price appears here</div>
      </aside>
    );
  }

  // 'tcgplayer': the price is TCGplayer's Market Price itself (owner, 2026-10-02).
  const tag = { manual: '✎ manual', fallback: 'fallback', cardmarket: 'cardmarket', tcgplayer: 'TCGplayer' }[source] ?? null;
  // Each at this card's rate, and why (docs/TEAM_FEEDBACK.md 4.4): "Credit: 70% (high end: cards over $35)".
  const chip = (label, pct, why) => {
    const amount = price != null ? payout(price, pct) : null;
    const raw = price != null ? (price * pct) / 100 : null;
    let title = `${label}: ${pct}%${why ? ` (${why})` : ''}`;
    if (amount != null) {
      title += ` of ${formatMoney(price)}`;
      if (Math.abs(raw - amount) >= 0.005) title += `, rounded down from ${formatMoney(raw)}`;
    }
    // ↑ / ↓: the rate for the copies we own, applied (decisions 448, 457): raised by a first-copy bonus,
    // lowered by the cut for copies over 2.
    const way = adjusted > 0 ? ' raised' : adjusted < 0 ? ' lowered' : '';
    return (
      <span className={`quote-chip ${label.toLowerCase()}${way}`} title={title}>
        <span className="quote-chip-label">{adjusted > 0 && '↑ '}{adjusted < 0 && '↓ '}{label}</span>
        <b>{loading ? '…' : formatMoney(amount)}</b>
      </span>
    );
  };
  const warned = !loading && warnings.length > 0;
  const trended = !loading && trend != null;
  // Skip pricing, no price typed: nothing to show but that (decision 514).
  const notPriced = skipped && price == null;
  const pin = (kind) => {
    setPinned((p) => (p === kind ? null : kind));
    onDone();
  };
  const open = hover ?? pinned;

  return (
    <aside className="area-quote" ref={box} onMouseLeave={() => setHover(null)}>
      <div className="quote">
        <div className="quote-label">
          {/* Bulk (docs/TEAM_FEEDBACK.md 5.4): no condition, a price per item. */}
          {/* A placeholder (owner, 2026-10-16): no condition either. */}
          {placeholder ? <><span className="quote-cond cond-bulk">PLACEHOLDER</span> price</>
            : bulkPer
              ? <><span className="quote-cond cond-bulk">BULK</span> price per {bulkPer}</>
              : <><span className={`quote-cond cond-${condition.toLowerCase()}`}>{condition}</span> price</>}
          {tag && !loading && <span className={`quote-tag ${source}`}>{tag}</span>}
        </div>
        {notPriced ? (
          <>
            <div className="quote-price none not-priced">Not priced</div>
            <p className="quote-skip">⚡ Skip pricing is on: cards go in with no price.</p>
          </>
        ) : loading ? (
          <div className="quote-price shimmer" aria-label="Loading price" />
        ) : (
          <div className={`quote-price${price == null ? ' none' : ''}`}>
            {formatMoney(price)}
            {/* 📈 / 📉 beside the price: it rose or fell sharply lately (owner, 2026-10-14; only here). */}
            {trended && (
              <button
                type="button"
                className={`quote-trend ${trend.dir}${pinned === 'trend' ? ' on' : ''}`}
                aria-label={trendText(trend)}
                aria-expanded={open === 'trend'}
                onMouseEnter={() => setHover('trend')}
                onClick={() => pin('trend')}
              >
                {trendIcon(trend)}
              </button>
            )}
          </div>
        )}
        {!notPriced && (
          <div className="quote-chips">
            {chip('Credit', creditPct, creditWhy)}
            {chip('Cash', cashPct, cashWhy)}
          </div>
        )}
        {warned && (
          <button
            type="button"
            className={`quote-warn${pinned === 'warn' ? ' on' : ''}`}
            aria-expanded={open === 'warn'}
            onMouseEnter={() => setHover('warn')}
            onClick={() => pin('warn')}
          >
            ⚠️ Price may be wrong ({warnings.length})
          </button>
        )}
      </div>
      {warned && open === 'warn' && (
        <div className="quote-pop">
          <PriceWarnings warnings={warnings} />
        </div>
      )}
      {trended && open === 'trend' && (
        <div className="quote-pop">
          <PriceTrendBox trend={trend} />
        </div>
      )}
    </aside>
  );
}
