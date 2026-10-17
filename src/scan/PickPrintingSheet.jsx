import { useState } from 'react';
import { cardImage } from '../lib/scryfall.js';

// The pick list opens on one row of the likeliest printings, what fits over the camera unscrolled;
// View all shows the rest (owner, 2026-10-16: three shown, the other nine of Utopia Sprawl's twelve
// were out of sight in a list scrolling on its own).
const FIRST = 3;

/**
 * An older card that could be several printings (docs/SCAN_FUNCTION.md 6.2,
 * tier 3; tier 2 when its number and set size fit more than one): the
 * likely printings, oldest first, to pick from by the set symbol on the card
 * in hand; View all shows every printing of that name, oldest to newest
 * (owner, 2026-10-16: "doesn't offer enough options, there needs to be a
 * "view all" button"). Skip sends nothing.
 * @param {{ pick: { name: string, cards: object[], all?: object[] }, onPick: (card: object) => void,
 *   onSkip: () => void }} props
 */
export default function PickPrintingSheet({ pick, onPick, onSkip }) {
  const [viewAll, setViewAll] = useState(false);
  const all = pick.all ?? pick.cards;
  const likely = pick.cards.slice(0, FIRST);
  const more = all.length > likely.length;
  const shown = viewAll ? all : likely;
  return (
    <div className="scan-sheet pick" role="dialog" aria-label={`Which printing of ${pick.name}?`}>
      <strong className="scan-pick-title">Which {pick.name}? Match the set symbol.</strong>
      {viewAll && <span className="scan-pick-note">All {all.length} printings, oldest to newest.</span>}
      <div className="scan-pick-list">
        {shown.map((card) => (
          <button key={card.id} type="button" className="scan-pick" onClick={() => onPick(card)}>
            <img src={cardImage(card, 'small')} alt="" width="73" height="102" loading="lazy" />
            <span className="scan-pick-set">{card.set_name}</span>
            <span className="scan-pick-meta">
              {card.set.toUpperCase()} {card.collector_number} · {(card.released_at ?? '').slice(0, 4)}
            </span>
          </button>
        ))}
      </div>
      <div className="scan-sheet-foot">
        {more && (
          <button type="button" className="btn" onClick={() => setViewAll(!viewAll)}>
            {viewAll ? 'Fewer' : `View all (${all.length})`}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onSkip}>Skip this card</button>
      </div>
    </div>
  );
}
