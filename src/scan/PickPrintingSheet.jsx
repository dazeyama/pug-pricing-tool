import { cardImage } from '../lib/scryfall.js';

/**
 * An older card that could be several printings (docs/SCAN_FUNCTION.md 6.2,
 * tier 3; tier 2 when its number and set size fit more than one): its
 * printings, oldest first, to pick from by the set symbol on the card in
 * hand. Skip sends nothing.
 * @param {{ pick: { name: string, cards: object[] }, onPick: (card: object) => void, onSkip: () => void }} props
 */
export default function PickPrintingSheet({ pick, onPick, onSkip }) {
  return (
    <div className="scan-sheet pick" role="dialog" aria-label={`Which printing of ${pick.name}?`}>
      <strong className="scan-pick-title">Which {pick.name}? Match the set symbol.</strong>
      <div className="scan-pick-list">
        {pick.cards.map((card) => (
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
        <button type="button" className="btn ghost" onClick={onSkip}>Skip this card</button>
      </div>
    </div>
  );
}
