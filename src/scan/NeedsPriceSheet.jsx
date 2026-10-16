import { useState } from 'react';
import { formatMoney, parseMoney } from '../lib/money.js';
import { scanText } from '../lib/scanPrice.js';

// A small picture of the card, straight from Scryfall's image redirect.
const imageOf = (scryfallId) => `https://api.scryfall.com/cards/${encodeURIComponent(scryfallId)}?format=image&version=small`;

/**
 * A scanned card no price source has (docs/SCAN_FUNCTION.md 7.3): the phone
 * stops and asks. A price sends it to the computer as a manual price; Skip
 * adds nothing (set the card aside). It can't be scanned past.
 * @param {{ scan: object, onAnswer: (price: number|null) => Promise<string|null> }} props
 *   onAnswer: an error message, or null
 */
export default function NeedsPriceSheet({ scan, onAnswer }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const price = parseMoney(text);
  const valid = price != null && price >= 0.01;

  async function answer(value) {
    setBusy(true);
    setError(null);
    const e = await onAnswer(value);
    setBusy(false);
    if (e) setError(e === 'bad_price' ? 'Type a price of at least $0.01.' : `Couldn't send it: ${e}`);
  }

  return (
    <div className="scan-sheet" role="dialog" aria-label="This card needs a price">
      <div className="scan-sheet-card">
        <img src={imageOf(scan.scryfall_id)} alt="" width="73" height="102" />
        <div>
          <strong>{scanText(scan)}</strong>
          <span>No price found on TCGplayer, JustTCG or Cardmarket. Type one, or skip it and set the card aside.</span>
        </div>
      </div>
      <form
        className="scan-price-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) answer(price);
        }}
      >
        <span aria-hidden="true">$</span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          aria-label="Price per card"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={!valid || busy}>
          {valid ? `Add at ${formatMoney(price)}` : 'Add at this price'}
        </button>
      </form>
      {error && <p className="scan-sheet-error" role="alert">{error}</p>}
      <div className="scan-sheet-foot">
        <button type="button" className="btn ghost" disabled={busy} onClick={() => answer(null)}>Skip this card</button>
      </div>
    </div>
  );
}
