import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import UserTag from '../../components/UserTag.jsx';
import { formatMoney, parseMoney, payout } from '../../lib/money.js';
import { PHONE_ERROR, formatPhone, phoneDigits, validPhone } from '../../lib/phone.js';
import { MoneyInput, PayMethod } from '../collections/DealModals.jsx';

/**
 * CONFIRM BUY's dialog (spec 8.10): the count and totals (custom rates
 * marked ✎), the customer's name and phone number, the purchase price, notes,
 * and who's confirming. The phone works as on a collection (spec 9.3):
 * formatted as it's typed, 10 digits. The purchase price is asked for as a
 * collection's is before Paid/Ours (owner, 2026-09-30): Cash or Credit as
 * chips in their colours, then what was paid, always typed in by hand (nothing
 * is filled in). Name, phone and price are all required.
 */
export default function ConfirmBuyModal({ count, market, rates, user, busy, onConfirm, onClose }) {
  const [customer, setCustomer] = useState('');
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState(null);
  const [priceText, setPriceText] = useState('');
  const [tried, setTried] = useState(false);        // Confirm pressed: show what's missing
  const [phoneTouched, setPhoneTouched] = useState(false);

  const price = parseMoney(priceText);
  const problems = {
    name: !customer.trim() ? "Enter the customer's name." : null,
    phone: !phone.trim() ? 'Enter a phone number.' : !validPhone(phone) ? PHONE_ERROR : null,
    method: !method ? 'Choose Cash or Credit.' : null,
    price: price == null ? 'Enter the purchase price.' : null,
  };
  const missing = Object.values(problems).filter(Boolean);
  const show = (key) => (tried || (key === 'phone' && phoneTouched)) && problems[key];

  const submit = () => {
    setTried(true);
    if (missing.length || busy) return;
    onConfirm({ customerName: customer.trim(), phone: phoneDigits(phone), notes, paidPrice: price, paidMethod: method });
  };
  const rate = (label, which, custom) => (
    <div className={`total-row ${which}`}>
      <span>{label} ({Number(rates[which])}%{custom != null && <span className="custom-mark"> ✎</span>})</span>
      <strong>{formatMoney(payout(market, rates[which]))}</strong>
    </div>
  );
  const enter = (e) => {
    if (e.key === 'Enter') submit();
  };

  return (
    <Modal
      title={`Confirm buy — ${count} card${count === 1 ? '' : 's'}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={`btn confirm-btn small-confirm${missing.length ? ' is-disabled' : ''}`}
            disabled={busy}
            aria-disabled={missing.length ? true : undefined}
            title={missing.length ? missing.join(' ') : undefined}
            onClick={submit}
          >
            {busy ? 'Confirming…' : 'Confirm buy'}
          </button>
        </>
      )}
    >
      <div className="confirm-totals">
        <div className="total-row"><span>Market</span><strong>{formatMoney(market)}</strong></div>
        {rate('Cash', 'cash', rates.customCash)}
        {rate('Credit', 'credit', rates.customCredit)}
      </div>
      <label className="confirm-field">
        <span>Customer name</span>
        <input
          type="text"
          value={customer}
          autoFocus
          maxLength={120}
          onChange={(e) => setCustomer(e.target.value)}
          onKeyDown={enter}
        />
        {show('name') && <span className="field-error">{problems.name}</span>}
      </label>
      <label className="confirm-field">
        <span>Phone number</span>
        <input
          type="text"
          inputMode="tel"
          placeholder="(555) 123-4567"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          onBlur={() => setPhoneTouched(true)}
          onKeyDown={enter}
        />
        {show('phone') && <span className="field-error">{problems.phone}</span>}
      </label>
      <div className="confirm-field confirm-paid">
        <span>Purchase price</span>
        <PayMethod method={method} onChoose={setMethod} />
        <MoneyInput label="Paid" value={priceText} onChange={setPriceText} onEnter={submit} />
        {show('method') && <span className="field-error">{problems.method}</span>}
        {!show('method') && show('price') && <span className="field-error">{problems.price}</span>}
      </div>
      <label className="confirm-field">
        <span>Notes <em>(optional)</em></span>
        <textarea rows={2} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <p className="confirm-user">Confirming as <UserTag user={user} /></p>
    </Modal>
  );
}
