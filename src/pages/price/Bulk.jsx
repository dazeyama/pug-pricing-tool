import { useState } from 'react';
import GameBadge from '../../components/GameBadge.jsx';
import { POKEMON_CARD_BACK } from '../../lib/pokemonImages.js';
import { formatMoney } from '../../lib/money.js';
import { perText } from '../../lib/bulk.js';

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
      <span className="bulk-label"><b>{item.per}</b> · {item.label}</span>
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
      <span className="thumb-label">
        <GameBadge game={c.game} />
        <span className="thumb-label-text">BULK · {perText(c.item, c.value)}</span>
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

/** The prices for a bulk item: one price, per item (5.4). `manual`: a value of its own (Set value). */
export function BulkPrice({ c, manual = null }) {
  const value = manual ?? c.value;
  return (
    <div className="price-table bulk-price">
      <div className="bulk-price-one">
        <strong>{formatMoney(value)}</strong> <span>per {c.item.per}</span>
        {manual != null && <span className="quote-tag manual" title={`Settings: ${formatMoney(c.value)}`}>✎ set value</span>}
      </div>
      <p className="hint">
        Qty counts items: 10 is {(10 * c.item.per).toLocaleString('en-US')} cards. The value is in
        Settings → Bulk values; a line&apos;s own value is set from the list (right-click → Set value).
      </p>
    </div>
  );
}
