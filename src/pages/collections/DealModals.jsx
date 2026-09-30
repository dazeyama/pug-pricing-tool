import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { creditOfferFor, formatMoney, parseMoney, payout } from '../../lib/money.js';

// The deal (owner, 2026-09-29): prices are simple maths, but the price is
// agreed between two people. Marking a collection Priced records the offer
// made; marking it Paid/Ours records what was actually paid, in cash or
// credit. Both are typed in, never worked out alone.

/** What the maths says: Market, and Cash / Credit at the collection's rates. */
function Quote({ market, rates }) {
  return (
    <div className="confirm-totals">
      <div className="total-row"><span>Market</span><strong>{formatMoney(market)}</strong></div>
      <div className="total-row cash">
        <span>Cash ({Number(rates.cash)}%)</span><strong>{formatMoney(payout(market, rates.cash))}</strong>
      </div>
      <div className="total-row credit">
        <span>Credit ({Number(rates.credit)}%)</span><strong>{formatMoney(payout(market, rates.credit))}</strong>
      </div>
    </div>
  );
}

/** A money field: "$" and the typed amount; Enter submits. */
function MoneyInput({ label, value, onChange, onEnter, autoFocus }) {
  return (
    <label className="confirm-field deal-field">
      <span>{label}</span>
      <span className="money-input">
        <span className="money-sign" aria-hidden="true">$</span>
        <input
          type="text"
          inputMode="decimal"
          autoFocus={autoFocus}
          value={value}
          placeholder="0.00"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter();
          }}
        />
      </span>
    </label>
  );
}

/**
 * Mark as Priced → "Set an offer": a cash figure for the whole collection,
 * with the credit offer worked out from it as it's typed.
 */
export function OfferModal({ market, rates, current, busy, onSave, onClose }) {
  const [text, setText] = useState(current != null ? String(Number(current)) : '');
  const cash = parseMoney(text);
  const credit = creditOfferFor(cash, rates.cash, rates.credit);
  const ready = cash != null && !busy;
  const save = () => {
    if (ready) onSave({ cash, credit });
  };
  return (
    <Modal
      title="Mark as Priced"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!ready} onClick={save}>Save offer</button>
        </>
      )}
    >
      <Quote market={market} rates={rates} />
      <MoneyInput label="Set an offer (cash)" value={text} onChange={setText} onEnter={save} autoFocus />
      <div className="deal-result">
        <span className="is-cash">Cash offer <strong>{cash != null ? formatMoney(cash) : '—'}</strong></span>
        <span className="is-credit">
          Credit offer <strong>{credit != null ? formatMoney(credit) : '—'}</strong>
        </span>
      </div>
      <p className="hint">
        The credit offer is the same deal at this collection's rates
        ({Number(rates.cash)}% cash, {Number(rates.credit)}% credit), rounded down.
      </p>
    </Modal>
  );
}

/**
 * Mark as Paid/Ours → "Set a final purchase price": what was actually paid,
 * and whether it was cash or credit. Choosing one fills in its offer when
 * nothing's typed yet.
 */
export function PaidModal({ market, rates, offer, busy, onSave, onClose }) {
  const [text, setText] = useState('');
  const [method, setMethod] = useState(null);
  const price = parseMoney(text);
  const ready = price != null && method != null && !busy;
  const save = () => {
    if (ready) onSave({ price, method });
  };
  const choose = (m) => {
    setMethod(m);
    const fill = m === 'cash' ? offer.cash : offer.credit;
    if (!text.trim() && fill != null) setText(String(Number(fill)));
  };
  return (
    <Modal
      title="Mark as Paid/Ours"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!ready} onClick={save}>
            Mark Paid/Ours
          </button>
        </>
      )}
    >
      <Quote market={market} rates={rates} />
      {(offer.cash != null || offer.credit != null) && (
        <p className="deal-offer">
          Offered{' '}
          {offer.cash != null && <span className="is-cash">{formatMoney(offer.cash)} cash</span>}
          {offer.cash != null && offer.credit != null && ' / '}
          {offer.credit != null && <span className="is-credit">{formatMoney(offer.credit)} credit</span>}
        </p>
      )}
      <div className="pay-method" role="radiogroup" aria-label="Paid in">
        {['cash', 'credit'].map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            className={`pay-choice ${m}${method === m ? ' on' : ''}`}
            onClick={() => choose(m)}
          >
            {m === 'cash' ? 'Cash' : 'Credit'}
          </button>
        ))}
      </div>
      <MoneyInput label="Set a final purchase price" value={text} onChange={setText} onEnter={save} autoFocus />
      <p className="hint">The collection will be locked.</p>
    </Modal>
  );
}
