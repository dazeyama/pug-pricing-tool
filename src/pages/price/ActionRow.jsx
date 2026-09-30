import GuardButton from '../../components/GuardButton.jsx';

/** A quantity 1–99, or null for anything else. */
export function parseQty(text) {
  const n = Number(String(text).trim());
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

/**
 * Qty · CLEAR · ADD CARD (spec 8.8), under Finish & Details. ADD CARD needs a
 * user (GuardButton), a card, a price and a connection; `blocked` is why not,
 * for its tooltip. Enter in the Qty box adds; Esc goes back to the search.
 */
export default function ActionRow({ qtyRef, qty, onQty, onClear, onAdd, blocked, busy, onDone }) {
  return (
    <div className="action-row">
      <label className="qty-box">
        <span>Qty</span>
        <input
          ref={qtyRef}
          type="number"
          min="1"
          max="99"
          inputMode="numeric"
          aria-label="Quantity"
          value={qty}
          onChange={(e) => onQty(e.target.value)}
          onBlur={() => onQty(String(parseQty(qty) ?? 1))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onDone();
            }
          }}
        />
      </label>
      <button type="button" className="btn clear-btn" title="Clear the card (Esc). The buy list stays." onClick={onClear}>
        CLEAR
      </button>
      <GuardButton
        className="btn add-btn"
        disabled={Boolean(blocked) || busy}
        title={blocked ?? (busy ? 'Saving…' : 'Add this card to the buy list (Enter)')}
        onClick={onAdd}
      >
        ADD CARD
      </GuardButton>
    </div>
  );
}
