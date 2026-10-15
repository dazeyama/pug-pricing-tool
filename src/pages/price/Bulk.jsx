import { useEffect, useState } from 'react';
import GameBadge from '../../components/GameBadge.jsx';
import { POKEMON_CARD_BACK } from '../../lib/pokemonImages.js';
import { formatMoney, payout } from '../../lib/money.js';
import { perText, shortName } from '../../lib/bulk.js';

// Bulk on the Price screen (docs/TEAM_FEEDBACK.md 5.4, Phase T3): a bulk item
// is drawn as a stack of its game's card backs with a short label, priced
// with one price ("$1.50 per 100"), no condition, finish or versions.

// Scryfall's card back for Magic (every card's `card_back_id`), served from
// its image host like the cards' own pictures.
const MAGIC_CARD_BACK = 'https://backs.scryfall.io/normal/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg';

/** Three card backs, offset, with "100 · Commons & Uncommons" on them. Fills its card-shaped box. */
export function BulkStack({ item }) {
  const [broken, setBroken] = useState(false);
  const back = item.game === 'pokemon' ? POKEMON_CARD_BACK : MAGIC_CARD_BACK;
  return (
    <span className={`bulk-stack ${item.game}${broken ? ' no-image' : ''}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`bulk-back b${i}`}>
          {!broken && <img src={back} alt="" onError={() => setBroken(true)} />}
        </span>
      ))}
      {/* Two lines: the count, then what it is (owner, 2026-10-15: larger, easier to read). */}
      <span className="bulk-label"><b>{item.per}</b><span>{item.label}</span></span>
    </span>
  );
}

/** A bulk item among the suggestions. */
export function BulkThumb({ c, highlighted, selected, onPick }) {
  return (
    <button
      type="button"
      className={`thumb bulk-thumb${highlighted ? ' highlight' : ''}${selected ? ' selected' : ''}`}
      title={`${c.name} · ${perText(c.item, c.value)}`}
      onClick={() => onPick(c)}
    >
      <span className="thumb-img"><BulkStack item={c.item} /></span>
      {/* "100 BULK c/u": short enough for the caption (owner, 2026-10-15). */}
      <span className="thumb-label">
        <GameBadge game={c.game} />
        <span className="thumb-label-text">{shortName(c.item)}</span>
      </span>
    </button>
  );
}

/** The selected card's area and its details, for a bulk item. */
export function BulkSelected({ c }) {
  return (
    <>
      <div className="area-card">
        <div className="stage-label">Selected card</div>
        <div className="card-box">
          <div className="card-wrap bulk-wrap"><BulkStack item={c.item} /></div>
        </div>
        <div className="finish-line" style={{ '--tag-len': 6 }}><span className="finish-tag">✦ BULK</span></div>
      </div>
      <aside className="area-info">
        <div className="card-info">
          <h2 className="info-name" title={c.name}>{c.name}</h2>
          <p className="info-set">
            <span className="info-set-name">{c.item.per} {c.game === 'mtg' ? 'Magic' : 'Pokémon'} cards per item</span>
          </p>
          <p className="info-number">
            {perText(c.item, c.value)}
            <span className="info-rarity"> · Settings → Bulk values</span>
          </p>
          <p className="info-tags">
            <GameBadge game={c.game} />
            <span>Bulk: helps price the buy, never exported</span>
          </p>
        </div>
      </aside>
    </>
  );
}

/** Finish & Details for a bulk item. */
export function BulkFinish() {
  return (
    <div className="finish-panel bulk-finish">
      <div className="stage-label">Finish</div>
      <p className="details-note">Bulk: no finish or condition.</p>
    </div>
  );
}

const VALID_MONEY = /^\d{1,6}(\.\d{1,2})?$/;

/**
 * The prices for a bulk item: its market price per item, in a box that can be
 * typed over (owner, 2026-10-15): a value other than Settings' is the line's
 * own (Set value, `manual`), the Settings value typed back clears it. Under
 * it, the Cash and Credit rates it's paid at (`rate`), with a tooltip.
 */
export function BulkPrice({ c, manual = null, onManual, rate, onDone }) {
  const value = manual ?? c.value;
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  // The price as typed, for the Cash and Credit under it; the saved one while it isn't a price.
  const typed = text.trim().replace(/^\$/, '');
  const live = VALID_MONEY.test(typed) ? Number(typed) : value;

  function commit() {
    const raw = text.trim().replace(/^\$/, '');
    if (!VALID_MONEY.test(raw)) {
      setText(String(value));
      return;
    }
    const next = Number(raw);
    if (next !== value) onManual(next === c.value ? null : next);
  }

  return (
    <div className="price-table bulk-price">
      <label className="bulk-price-one">
        <span className="bulk-price-label">Full market price</span>
        <span className="bulk-price-input">
          <span className="money-sign" aria-hidden="true">$</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`Market price per ${c.item.per} cards`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
                onDone?.();
              }
            }}
          />
        </span>
        <span className="bulk-price-per">per {c.item.per}</span>
        {manual != null && (
          // A chip that clears it (owner, 2026-10-15): × on hover, back to the Settings value.
          <button
            type="button"
            className="own-value-chip"
            title={`Clear: back to Settings → Bulk values, ${formatMoney(c.value)}`}
            onClick={() => {
              onManual(null);
              onDone?.();
            }}
          >
            ✎ own value <span className="own-value-x" aria-hidden="true">×</span>
          </button>
        )}
      </label>
      {/* What that pays, worked out as it's typed (owner, 2026-10-15): "Credit $0.99 · Cash $0.49 per 100". */}
      <p
        className="bulk-rates"
        title={`Credit ${rate.credit}% and Cash ${rate.cash}% of the full market price, rounded down: this buy's rates `
          + '(the Master Buy Percentages, or its custom ones). Bulk never takes the low-end or high-end rates.'}
      >
        Pays <span className="is-credit">Credit <strong>{formatMoney(payout(live, rate.credit))}</strong></span>
        {' · '}
        <span className="is-cash">Cash <strong>{formatMoney(payout(live, rate.cash))}</strong></span>
        {' '}per {c.item.per}
        <span className="bulk-rates-q" aria-hidden="true">ⓘ</span>
      </p>
      <p className="hint">
        Settings → Bulk values: {formatMoney(c.value)} per {c.item.per}. Another price here is this line&apos;s own
        value. Qty counts items: 10 is {(10 * c.item.per).toLocaleString('en-US')} cards.
      </p>
    </div>
  );
}
