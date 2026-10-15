import { useEffect, useRef, useState } from 'react';
import { formatMoney, payout } from '../../lib/money.js';
import PriceWarnings from './PriceWarnings.jsx';
import PriceTrendBox from './PriceTrendBox.jsx';
import { trendIcon, trendText } from '../../lib/priceTrend.js';

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
 * @param {{ source: 'justtcg'|'fallback'|'tcgplayer'|'cardmarket'|'manual'|null, warnings: string[] }} props
 */
export default function QuotePanel({
  candidate, loading, condition, price, source, cashPct, creditPct, cashWhy = '', creditWhy = '', warnings, trend = null, onDone,
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
  useEffect(() => {
    if (!pinned) return undefined;
    const close = (e) => {
      if (!box.current?.contains(e.target)) setPinned(null);
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
    return (
      <span className={`quote-chip ${label.toLowerCase()}`} title={title}>
        <span className="quote-chip-label">{label}</span>
        <b>{loading ? '…' : formatMoney(amount)}</b>
      </span>
    );
  };
  const warned = !loading && warnings.length > 0;
  const trended = !loading && trend != null;
  const pin = (kind) => {
    setPinned((p) => (p === kind ? null : kind));
    onDone();
  };
  const open = hover ?? pinned;

  return (
    <aside className="area-quote" ref={box} onMouseLeave={() => setHover(null)}>
      <div className="quote">
        <div className="quote-label">
          <span className={`quote-cond cond-${condition.toLowerCase()}`}>{condition}</span>
          price
          {tag && !loading && <span className={`quote-tag ${source}`}>{tag}</span>}
        </div>
        {loading ? (
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
        <div className="quote-chips">
          {chip('Credit', creditPct, creditWhy)}
          {chip('Cash', cashPct, cashWhy)}
        </div>
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
