import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import UserTag from '../../components/UserTag.jsx';
import { formatMoney, payout } from '../../lib/money.js';
import { PHONE_ERROR, formatPhone, phoneDigits, validPhone } from '../../lib/phone.js';

/**
 * CONFIRM BUY's dialog (spec 8.10): the count and totals (custom rates
 * marked ✎), an optional customer name, phone number and notes, and who's
 * confirming. The phone works as on a collection (spec 9.3): formatted as
 * it's typed, 10 digits or left blank.
 */
export default function ConfirmBuyModal({ count, market, rates, user, busy, onConfirm, onClose }) {
  const [customer, setCustomer] = useState('');
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const phoneProblem = phone && !validPhone(phone) ? PHONE_ERROR : null;
  const submit = () => {
    if (phoneProblem) {
      setPhoneTouched(true);
      return;
    }
    if (!busy) onConfirm({ customerName: customer, phone: phoneDigits(phone), notes });
  };
  const rate = (label, which, custom) => (
    <div className={`total-row ${which}`}>
      <span>{label} ({Number(rates[which])}%{custom != null && <span className="custom-mark"> ✎</span>})</span>
      <strong>{formatMoney(payout(market, rates[which]))}</strong>
    </div>
  );

  return (
    <Modal
      title={`Confirm buy — ${count} card${count === 1 ? '' : 's'}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn confirm-btn small-confirm"
            disabled={busy || Boolean(phoneProblem)}
            title={phoneProblem ?? undefined}
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
        <span>Customer name <em>(optional)</em></span>
        <input
          type="text"
          value={customer}
          autoFocus
          maxLength={120}
          onChange={(e) => setCustomer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </label>
      <label className="confirm-field">
        <span>Phone number <em>(optional)</em></span>
        <input
          type="text"
          inputMode="tel"
          placeholder="(555) 123-4567"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          onBlur={() => setPhoneTouched(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        {phoneTouched && phoneProblem && <span className="field-error">{phoneProblem}</span>}
      </label>
      <label className="confirm-field">
        <span>Notes <em>(optional)</em></span>
        <textarea rows={2} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <p className="confirm-user">Confirming as <UserTag user={user} /></p>
    </Modal>
  );
}
