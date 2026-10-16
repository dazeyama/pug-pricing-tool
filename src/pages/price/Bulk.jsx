import { useEffect, useState } from 'react';
import GameBadge from '../../components/GameBadge.jsx';
import { POKEMON_CARD_BACK } from '../../lib/pokemonImages.js';
import { formatMoney, payout } from '../../lib/money.js';
import { PLACEHOLDER_NAME, perText, shortName } from '../../lib/bulk.js';
import { GAME_NAMES } from '../../lib/games.js';

// Bulk on the Price screen (docs/TEAM_FEEDBACK.md 5.4, Phase T3): a bulk item
// is drawn as a stack of its game's card backs with a short label, priced
// with one price ("$1.50 per 100"), no condition, finish or versions.
// A placeholder (owner, 2026-10-16) is one card back: its name is typed in
// on the stage, and its price always.

// Scryfall's card back for Magic (every card's `card_back_id`), served from
// its image host like the cards' own pictures.
const MAGIC_CARD_BACK = 'https://backs.scryfall.io/normal/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg';

/** Three card backs, offset, with "100 · Commons & Uncommons" on them. Fills its card-shaped box. */
export function BulkStack({ item }) {
  const [broken, setBroken] = useState(false);
  const back = item.game === 'pokemon' ? POKEMON_CARD_BACK : MAGIC_CARD_BACK;
  return (
    <span className={`bulk-stack ${item.game}${broken ? ' no-image' : ''}`} aria-hidden="true">
      {(item.placeholder ? [1] : [0, 1, 2]).map((i) => (
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
      title={c.item.placeholder ? `${c.name}: for a card the search can't find. Name it and type its price.`
        : `${c.name} · ${perText(c.item, c.value)}`}
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

/**
 * A placeholder's name (owner, 2026-10-16), clearly clickable: typed over
 * like a card's name could read ("Team Rocket's, Meowth 117"); empty, it's
 * "Placeholder". Enter goes on to the price.
 */
function PlaceholderName({ value, onChange }) {
  return (
    <label className="placeholder-name" title="Click to name it: what the card is, e.g. Team Rocket's, Meowth 117">
      <input
        type="text"
        value={value}
        maxLength={150}
        placeholder={PLACEHOLDER_NAME}
        aria-label="The placeholder's name"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.closest('.stage-body')?.querySelector('.bulk-price-input input')?.focus();
          }
        }}
      />
      <span className="placeholder-name-pen" aria-hidden="true">✎</span>
    </label>
  );
}

/** The selected card's area and its details, for a bulk item (a placeholder: its name, typed in). */
export function BulkSelected({ c, name = '', onName }) {
  const placeholder = Boolean(c.item.placeholder);
  const tag = placeholder ? '✦ PLACEHOLDER' : '✦ BULK';
  const game = GAME_NAMES[c.game];
  return (
    <>
      <div className="area-card">
        <div className="stage-label">Selected card</div>
        <div className="card-box">
          <div className="card-wrap bulk-wrap"><BulkStack item={c.item} /></div>
        </div>
        <div className="finish-line" style={{ '--tag-len': tag.length }}><span className="finish-tag">{tag}</span></div>
      </div>
      <aside className="area-info">
        {placeholder ? (
          <div className="card-info">
            <PlaceholderName value={name} onChange={onName} />
            <p className="info-set"><span className="info-set-name">A {game} card the search can&apos;t find yet</span></p>
            <p className="info-number">Name it above, type its price below</p>
            <p className="info-tags">
              <GameBadge game={c.game} />
              <span>Placeholder: priced like a card, never exported</span>
            </p>
          </div>
        ) : (
        <div className="card-info">
          <h2 className="info-name" title={c.name}>{c.name}</h2>
          <p className="info-set">
            <span className="info-set-name">{c.item.per} {GAME_NAMES[c.game]} cards per item</span>
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
        )}
      </aside>
    </>
  );
}

/** Finish & Details for a bulk item. */
export function BulkFinish({ c }) {
  return (
    <div className="finish-panel bulk-finish">
      <div className="stage-label">Finish</div>
      <p className="details-note">
        {c?.item.placeholder
          ? 'Placeholder: no finish or condition. Write them into its name if they matter (holo, LP…).'
          : 'Bulk: no finish or condition.'}
      </p>
    </div>
  );
}

const VALID_MONEY = /^\d{1,6}(\.\d{1,2})?$/;

/**
 * The prices for a bulk item: its market price per item, in a box that can be
 * typed over (owner, 2026-10-15): a value other than Settings' is the line's
 * own (Set value, `manual`), the Settings value typed back clears it. Under
 * it, the Cash and Credit rates it's paid at (`rate`), with a tooltip.
 * A placeholder (owner, 2026-10-16): the box starts empty and must be typed
 * in; its rates are a card's at that price (`rateFor`).
 */
export function BulkPrice({ c, manual = null, onManual, rate, rateFor = null, onDone }) {
  const placeholder = Boolean(c.item.placeholder);
  const value = manual ?? c.value;
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => setText(value == null ? '' : String(value)), [value]);
  // The price as typed, for the Cash and Credit under it; the saved one while it isn't a price.
  const typed = text.trim().replace(/^\$/, '');
  const live = VALID_MONEY.test(typed) ? Number(typed) : value;
  const paid = rateFor && live != null ? rateFor(live) : rate;

  function commit() {
    const raw = text.trim().replace(/^\$/, '');
    if (placeholder && !raw) {
      if (manual != null) onManual(null);
      return;
    }
    if (!VALID_MONEY.test(raw)) {
      setText(value == null ? '' : String(value));
      return;
    }
    const next = Number(raw);
    if (next !== value) onManual(next === c.value ? null : next);
  }

  return (
    <div className="price-table bulk-price">
      <label className="bulk-price-one">
        <span className="bulk-price-label">{placeholder ? "The card's market price" : 'Full market price'}</span>
        <span className="bulk-price-input">
          <span className="money-sign" aria-hidden="true">$</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label={placeholder ? "The placeholder card's market price" : `Market price per ${c.item.per} cards`}
            placeholder={placeholder ? 'type it' : undefined}
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
        <span className="bulk-price-per">{placeholder ? 'each' : `per ${c.item.per}`}</span>
        {manual != null && !placeholder && (
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
      {live == null ? (
        <p className="bulk-rates">Type its price: a placeholder has none of its own.</p>
      ) : (
      <p
        className="bulk-rates"
        title={placeholder
          ? `Credit ${paid.credit}% and Cash ${paid.cash}% of its market price, rounded down: a card's rates at this `
            + "price (the low end or high end where it's one, else this buy's)."
          : `Credit ${rate.credit}% and Cash ${rate.cash}% of the full market price, rounded down: this buy's rates `
            + '(the Master Buy Percentages, or its custom ones). Bulk never takes the low-end or high-end rates.'}
      >
        Pays <span className="is-credit">Credit <strong>{formatMoney(payout(live, paid.credit))}</strong></span>
        {' · '}
        <span className="is-cash">Cash <strong>{formatMoney(payout(live, paid.cash))}</strong></span>
        {' '}{placeholder ? 'each' : `per ${c.item.per}`}
        <span className="bulk-rates-q" aria-hidden="true">ⓘ</span>
      </p>
      )}
      <p className="hint">
        {placeholder
          ? "For a card the search can't find: always priced by hand. Qty counts cards. Never exported."
          : <>Settings → Bulk values: {formatMoney(c.value)} per {c.item.per}. Another price here is this line&apos;s own
            value. Qty counts items: 10 is {(10 * c.item.per).toLocaleString('en-US')} cards.</>}
      </p>
    </div>
  );
}
