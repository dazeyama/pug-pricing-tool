import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import OwnRateAlert from '../../components/OwnRateAlert.jsx';
import { formatMoney, parseMoney } from '../../lib/money.js';
import { creditOfferForLines, listRates, rateTotals } from '../../lib/rates.js';
import CustomRateMark from '../../components/CustomRateMark.jsx';

// The deal (owner, 2026-09-29): prices are simple maths, but the price is
// agreed between two people. Marking a collection Priced records the offer
// made; marking it Paid/Ours records what was actually paid, in cash or
// credit. Both are typed in, never worked out alone.

/** A rate or a ratio to two decimals at most: 38.71, 33.34, 2. */
const twoPlaces = (n) => String(Math.round(n * 100) / 100);

/**
 * What the maths says: Market, and Cash / Credit with each card at its own
 * rate (docs/TEAM_FEEDBACK.md 4.4). The labels are the rates the list pays,
 * Cash and Credit over Market (decision 538), so their ratio is the one the
 * credit offer uses; with every card on the collection's rates, those rates.
 */
function Quote({ lines, rates }) {
  const t = rateTotals(lines, rates);
  const paid = listRates(lines, rates);
  const customChip = <CustomRateMark totals={t} />;
  return (
    <div className="confirm-totals">
      <div className="total-row"><span>Market</span><strong>{formatMoney(t.market)}</strong></div>
      <div className="total-row cash">
        <span>Cash ({twoPlaces(paid.cash)}%){customChip}</span><strong>{formatMoney(t.cash)}</strong>
      </div>
      <div className="total-row credit">
        <span>Credit ({twoPlaces(paid.credit)}%){customChip}</span><strong>{formatMoney(t.credit)}</strong>
      </div>
    </div>
  );
}

/** A money field: "$" and the typed amount; Enter submits. Also CONFIRM BUY's purchase price. */
export function MoneyInput({ label, value, onChange, onEnter, autoFocus }) {
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

/** Cash or Credit, as chips in their colours (green / blue). Also CONFIRM BUY's. */
export function PayMethod({ method, onChoose }) {
  return (
    <div className="pay-method" role="radiogroup" aria-label="Paid in">
      {['cash', 'credit'].map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={method === m}
          className={`pay-choice ${m}${method === m ? ' on' : ''}`}
          onClick={() => onChoose(m)}
        >
          {m === 'cash' ? 'Cash' : 'Credit'}
        </button>
      ))}
    </div>
  );
}

/**
 * Mark as Priced → "Set an offer": a cash figure for the whole collection,
 * with the credit offer worked out from it as it's typed.
 */
export function OfferModal({ lines, rates, current, busy, onSave, onClose }) {
  const [text, setText] = useState(current != null ? String(Number(current)) : '');
  const cash = parseMoney(text);
  const credit = creditOfferForLines(cash, lines, rates);
  const mixed = rateTotals(lines, rates).mixed;
  const paid = listRates(lines, rates);
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
      <Quote lines={lines} rates={rates} />
      <MoneyInput label="Set an offer (cash)" value={text} onChange={setText} onEnter={save} autoFocus />
      <div className="deal-result">
        <span className="is-cash">Cash offer <strong>{cash != null ? formatMoney(cash) : '—'}</strong></span>
        <span className="is-credit">
          Credit offer <strong>{credit != null ? formatMoney(credit) : '—'}</strong>
        </span>
      </div>
      {/* The ratio itself (decision 538): Credit ÷ Cash, the rates shown above. */}
      <p className="hint">
        {paid.ratio != null && <>The credit offer is the cash offer × {twoPlaces(paid.ratio)}, rounded down: </>}
        {mixed
          ? `the same deal at its cards' rates (${twoPlaces(paid.credit)}% credit ÷ ${twoPlaces(paid.cash)}% cash).`
          : `the same deal at this collection's rates (${twoPlaces(paid.credit)}% credit ÷ ${twoPlaces(paid.cash)}% cash).`}
      </p>
    </Modal>
  );
}

/**
 * Mark as Paid/Ours → "Set a final purchase price": what was actually paid,
 * and whether it was cash or credit, always typed in by hand: choosing one
 * fills nothing in (owner, 2026-09-30). "Mark as Rejected?" switches to the
 * Reject dialog instead (owner, 2026-10-09). Made from a buy that kept the payment
 * (`keptBuy`, its number), the price starts at $0 and says why: the buy's payment typed
 * here would count twice (decisions 341, 397).
 */
export function PaidModal({ lines, rates, offer, busy, keptBuy = null, onSave, onReject, onClose }) {
  const [text, setText] = useState(keptBuy != null ? '0' : '');
  const [method, setMethod] = useState(null);
  const price = parseMoney(text);
  const ready = price != null && method != null && !busy;
  const save = () => {
    if (ready) onSave({ price, method });
  };
  return (
    <Modal
      title="Mark as Paid/Ours"
      onClose={onClose}
      footer={(
        <>
          {onReject && (
            <button type="button" className="btn danger-ghost deal-reject" disabled={busy} onClick={onReject}>
              Mark as Rejected?
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!ready} onClick={save}>
            Mark Paid/Ours
          </button>
        </>
      )}
    >
      <OwnRateAlert lines={lines} rates={rates} />
      <Quote lines={lines} rates={rates} />
      {(offer.cash != null || offer.credit != null) && (
        <p className="deal-offer">
          Offered{' '}
          {offer.cash != null && <span className="is-cash">{formatMoney(offer.cash)} cash</span>}
          {offer.cash != null && offer.credit != null && ' / '}
          {offer.credit != null && <span className="is-credit">{formatMoney(offer.credit)} credit</span>}
        </p>
      )}
      <PayMethod method={method} onChoose={setMethod} />
      <MoneyInput label="Set a final purchase price" value={text} onChange={setText} onEnter={save} autoFocus />
      {keptBuy != null && (
        <p className="hint">The payment is on Buy {keptBuy}, which kept it: $0 here counts it once.</p>
      )}
      <p className="hint">The collection will be locked.</p>
    </Modal>
  );
}
