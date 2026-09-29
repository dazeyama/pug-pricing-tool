import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONDITIONS } from '../../lib/prices.js';
import { formatMoney, parseMoney } from '../../lib/money.js';
import { timeAgo } from '../../lib/time.js';

/** Big prices, stepping down so "$1,234.56" still fits a button. */
function priceStyle(text) {
  const n = text.length;
  return { '--pc-size': n <= 6 ? '18px' : n === 7 ? '16px' : n === 8 ? '14px' : '12.5px' };
}

/**
 * The condition / price table under the selected card (spec 8.7): five
 * buttons with JustTCG's price for the chosen printing, finish and
 * condition; NM falls back to Scryfall's or TCGdex's price, labelled; other
 * conditions show "—" and then need a manual price. ✎ Manual price
 * overrides the purchase price.
 */
export default function PriceTable({
  candidate, prices, market, fallback, fetchedAt, condition, onCondition,
  manual, onManual, manualOpen, setManualOpen, onDone,
}) {
  const [text, setText] = useState('');
  const input = useRef(null);
  useEffect(() => {
    if (manualOpen) {
      setText(manual != null ? String(manual) : '');
      requestAnimationFrame(() => input.current?.select());
    }
    // Only when it opens: typing mustn't be reset by later renders.
  }, [manualOpen]);

  const loading = prices.status === 'loading' || prices.status === 'waiting';
  const fallbackSource = fallback?.source === 'scryfall_fallback' ? 'Scryfall' : 'TCGdex';

  function apply() {
    const value = parseMoney(text);
    if (text.trim() === '') onManual(null);
    else if (value != null) onManual(value);
    setManualOpen(false);
    onDone();
  }

  const cell = (code) => {
    if (!candidate) return <span className="pc-price muted">—</span>;
    if (loading) return <span className="pc-price shimmer" aria-label="Loading price" />;
    const price = market[code];
    if (manual != null && code === condition) {
      return (
        <span className="pc-price manual" style={priceStyle(`✎${formatMoney(manual)}`)}>
          <b>✎{formatMoney(manual)}</b>
          {price != null && <s>{formatMoney(price)}</s>}
        </span>
      );
    }
    if (price != null) return <span className="pc-price" style={priceStyle(formatMoney(price))}>{formatMoney(price)}</span>;
    if (code === 'NM' && fallback) {
      return (
        <span
          className="pc-price"
          style={priceStyle(formatMoney(fallback.price))}
          title={`No JustTCG price — this is ${fallbackSource}'s market price`}
        >
          {formatMoney(fallback.price)}
          <span className="fb-tag">fallback</span>
        </span>
      );
    }
    return <span className="pc-price muted">—</span>;
  };

  let caption = null;
  if (!candidate) caption = <span className="muted">Prices appear when a card is selected.</span>;
  else if (prices.status === 'no-key') {
    caption = <span className="warn">No JustTCG key yet. <Link to="/settings">Add it in Settings</Link>.</span>;
  } else if (prices.status === 'quota') caption = <span className="warn">JustTCG limit reached: enter prices manually.</span>;
  else if (prices.status === 'error') {
    caption = (
      <span className="warn">
        Couldn’t load prices. <button type="button" className="link-btn" onClick={prices.retry}>Retry</button>
      </span>
    );
  } else if (loading) caption = <span className="muted">Loading prices…</span>;
  else if (fetchedAt) caption = <span className="muted">Prices via JustTCG · updated {timeAgo(fetchedAt)}</span>;
  else caption = <span className="muted">No JustTCG price for this printing.</span>;

  return (
    <div className="price-table">
      <div className="price-buttons" role="radiogroup" aria-label="Condition">
        {CONDITIONS.map((code, i) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={code === condition}
            className={`price-btn cond-${code.toLowerCase()}${code === condition ? ' on' : ''}`}
            disabled={!candidate}
            title={`${code} (Alt+${i + 1})`}
            onClick={() => {
              onCondition(code);
              onDone();
            }}
          >
            <span className="pc-cond">{code}</span>
            {cell(code)}
          </button>
        ))}
      </div>
      <div className="price-foot">
        {manualOpen ? (
          <span className="manual-edit">
            $
            <input
              ref={input}
              type="text"
              inputMode="decimal"
              aria-label="Manual price"
              placeholder="0.00"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={apply}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  apply();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setManualOpen(false);
                  onDone();
                }
              }}
            />
          </span>
        ) : (
          <button
            type="button"
            className={`btn small manual-btn${manual != null ? ' on' : ''}`}
            disabled={!candidate}
            title="Type a price for this card (Alt+M)"
            onClick={() => setManualOpen(true)}
          >
            ✎ Manual price
          </button>
        )}
        {manual != null && !manualOpen && (
          <button
            type="button"
            className="icon-btn"
            title="Clear the manual price"
            aria-label="Clear the manual price"
            onClick={() => {
              onManual(null);
              onDone();
            }}
          >
            ×
          </button>
        )}
        <span className="price-caption">{caption}</span>
      </div>
    </div>
  );
}
