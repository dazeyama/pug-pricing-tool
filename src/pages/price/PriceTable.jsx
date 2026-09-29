import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONDITIONS } from '../../lib/prices.js';
import { formatMoney, parseMoney, roundDownPrice } from '../../lib/money.js';
import { timeAgo } from '../../lib/time.js';

/** Big prices, stepping down so "$1,234.56" still fits a button. */
function priceStyle(text) {
  const n = text.length;
  return { '--pc-size': n <= 6 ? '18px' : n === 7 ? '16px' : n === 8 ? '14px' : '12.5px' };
}

/**
 * The condition / price table under the selected card (spec 8.7): five big
 * buttons, NM to DMG. Each shows its entry from the price ladder (lib/prices
 * priceLadder): JustTCG's price, or a fallback tagged "fallback", rounded
 * down; "—" when there's neither. ⚠️ on NM when JustTCG and the fallback
 * disagree or look wrong (warnings, lib/prices priceWarnings). Under them: Use Fallback (every price from
 * Scryfall/TCGdex and the fallback percentages instead of JustTCG) and ✎ Manual price (overrides the purchase price),
 * then the caption.
 */
export default function PriceTable({
  candidate, prices, ladder, pct, market, fallback, warnings, fallbackOn, onUseFallback,
  fetchedAt, condition, onCondition, manual, onManual, manualOpen, setManualOpen, onDone,
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

  function apply() {
    const value = parseMoney(text);
    if (text.trim() === '') onManual(null);
    else if (value != null) onManual(value);
    setManualOpen(false);
    onDone();
  }

  /** The button's tooltip: where the price came from, any rounding, and the hotkey. */
  const tooltip = (code, i) => {
    const key = `Alt+${i + 1}`;
    if (!candidate || loading) return `${code} · ${key}`;
    const e = ladder[code];
    const rounded = e.raw != null && e.raw !== e.price ? `, rounded down from ${formatMoney(e.raw)}` : '';
    let about = 'no price: enter a manual price';
    if (e.source === 'justtcg') about = `JustTCG ${formatMoney(e.price)}${rounded}`;
    else if (e.source === 'fallback') {
      about = e.cap
        ? `fallback ${formatMoney(e.price)}: `
          + (e.cap.quarter
            ? `a quarter below ${e.cap.code}'s ${formatMoney(ladder[e.cap.code].price)} (${e.cap.pct}% below would show the same price)`
            : `${e.cap.pct}% below ${e.cap.code}'s ${formatMoney(e.cap.from)}`)
          + ` (${e.base.from}'s ${formatMoney(e.base.price)} × ${pct[code]}% = ${formatMoney(e.cap.was)} wasn't below ${e.cap.code})`
        : `fallback ${formatMoney(e.price)}: ${e.base.from}'s ${formatMoney(e.base.price)} × ${pct[code]}%`;
      about += rounded;
      if (e.thrownOut != null) about += ` (JustTCG's ${formatMoney(e.thrownOut)} was higher than a better condition, so it was thrown out)`;
      if (fallbackOn) about += ' (Use Fallback is on)';
    }
    if (manual != null && code === condition) about = `manual ${formatMoney(manual)} (market: ${about})`;
    const warn = code === 'NM' && warnings.length
      ? ` · ${warnings.map((w) => `⚠️ ${w}`).join(' · ')}. Check before buying`
      : '';
    return `${code} · ${about}${warn} · ${key}`;
  };

  // Use Fallback: every price from Scryfall/TCGdex (NM) and the fallback
  // percentages, as if JustTCG had no prices at all.
  const fbFrom = candidate?.game === 'mtg' ? 'Scryfall' : 'TCGdex';
  const fbNM = fallback && pct?.NM != null ? roundDownPrice((fallback.price * Number(pct.NM)) / 100) : null;
  let fbTitle = 'Price every condition from the fallback instead of JustTCG';
  let fbUsable = false;
  if (candidate && !loading) {
    if (!CONDITIONS.some((c) => market?.[c] != null)) fbTitle = 'Prices already come from the fallback: JustTCG has none for this printing';
    else if (fbNM == null) fbTitle = `No ${fbFrom} price for this printing`;
    else {
      fbUsable = true;
      fbTitle = fallbackOn
        ? `Prices are from ${fbFrom}'s ${formatMoney(fbNM)} NM and the fallback percentages. Click to go back to JustTCG`
        : `Use ${fbFrom}'s ${formatMoney(fbNM)} for NM, and the fallback percentages for the other conditions, instead of JustTCG's prices`;
    }
  }

  const cell = (code) => {
    if (!candidate) return <span className="pc-price muted">—</span>;
    if (loading) return <span className="pc-price shimmer" aria-label="Loading price" />;
    const { price, source } = ladder[code];
    if (manual != null && code === condition) {
      return (
        <span className="pc-price manual" style={priceStyle(`✎${formatMoney(manual)}`)}>
          <b>✎{formatMoney(manual)}</b>
          {price != null && <s>{formatMoney(price)}</s>}
        </span>
      );
    }
    if (source === 'justtcg') {
      return <span className="pc-price" style={priceStyle(formatMoney(price))}>{formatMoney(price)}</span>;
    }
    if (source === 'fallback') {
      return (
        <span className="pc-price" style={priceStyle(formatMoney(price))}>
          {formatMoney(price)}
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
            title={tooltip(code, i)}
            onClick={() => {
              onCondition(code);
              onDone();
            }}
          >
            <span className="pc-cond">
              {code === 'NM' && warnings.length > 0 && <span className="pc-warn" aria-label="Price warning">⚠️</span>}
              {code}
            </span>
            {cell(code)}
          </button>
        ))}
      </div>
      <div className="price-foot">
        <div className="price-tools">
          <button
            type="button"
            className={`btn small fallback-btn${fallbackOn ? ' on' : ''}`}
            disabled={!fbUsable}
            title={fbTitle}
            aria-pressed={fallbackOn}
            onClick={() => {
              onUseFallback(!fallbackOn);
              onDone();
            }}
          >
            Use Fallback
          </button>
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
        </div>
        <div className="price-caption">{caption}</div>
      </div>
    </div>
  );
}
