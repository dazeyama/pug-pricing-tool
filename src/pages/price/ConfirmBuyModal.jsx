import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import UserTag from '../../components/UserTag.jsx';
import CustomerNameInput from '../../components/CustomerNameInput.jsx';
import OwnRateAlert from '../../components/OwnRateAlert.jsx';
import { formatMoney, parseMoney } from '../../lib/money.js';
import { rateTotals } from '../../lib/rates.js';
import { cardCounts, countText } from '../../lib/bulk.js';
import CustomRateMark from '../../components/CustomRateMark.jsx';
import { PHONE_ERROR, formatPhone, phoneDigits, validPhone } from '../../lib/phone.js';
import { MoneyInput, PayMethod } from '../collections/DealModals.jsx';

/**
 * CONFIRM BUY's dialog (spec 8.10): the count and totals (custom rates
 * marked ✎), the customer's name and phone number, the purchase price, notes,
 * and who's confirming. The phone works as on a collection (spec 9.3):
 * formatted as it's typed, 10 digits. The purchase price is asked for as a
 * collection's is before Paid/Ours (owner, 2026-09-30): Cash or Credit as
 * chips in their colours, then what was paid, always typed in by hand (nothing
 * is filled in). Name, phone and price are all required. The name suggests
 * past customers; picking one fills in their last phone number, which can
 * still be changed (owner, 2026-10-09).
 *
 * A project's Convert to buy… asks the same (owner, 2026-10-10), with its own
 * title, `intro` and button, starting from what the project already has
 * (`initial`: customer, phone, method, price, notes).
 *
 * `flagOption` (CONFIRM BUY; owner, 2026-10-14): a 🚩 "Flag check for
 * condition" box; ticked, the buy is flagged on its day page to have its
 * cards' condition checked before export (`flagCondition` in onConfirm).
 *
 * The totals are each card at its own rate (docs/TEAM_FEEDBACK.md 4.4), from
 * `lines`; cards with their own rate (Set Rate) are listed above them with
 * what they change (4.5).
 */
export default function ConfirmBuyModal({
  lines, rates, user, busy, onConfirm, onClose,
  // Cards and bulk counted apart (docs/TEAM_FEEDBACK.md 5.5): "Confirm buy — 42 cards + 1,000 bulk".
  title = `Confirm buy — ${countText(cardCounts(lines))}`, intro = null, initial = {},
  confirmLabel = 'Confirm buy', busyLabel = 'Confirming…', flagOption = false,
}) {
  const [flag, setFlag] = useState(false);
  const [customer, setCustomer] = useState(initial.customer ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [phone, setPhone] = useState(initial.phone ? formatPhone(initial.phone) : '');
  const [method, setMethod] = useState(initial.method ?? null);
  const [priceText, setPriceText] = useState(initial.price != null ? String(Number(initial.price)) : '');
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
    onConfirm({
      customerName: customer.trim(), phone: phoneDigits(phone), notes, paidPrice: price, paidMethod: method,
      flagCondition: flagOption && flag,
    });
  };
  const totals = rateTotals(lines, rates);
  const rate = (label, which, custom) => (
    <div className={`total-row ${which}`}>
      <span>
        {label} ({Number(rates[which])}%{custom != null && <span className="custom-mark"> ✎</span>})
        <CustomRateMark totals={totals} />
      </span>
      <strong>{formatMoney(totals[which])}</strong>
    </div>
  );
  const enter = (e) => {
    if (e.key === 'Enter') submit();
  };

  return (
    <Modal
      title={title}
      // Taller than other dialogs: room for an own-rate alert's card without a scrollbar (owner, 2026-10-15).
      className="confirm-modal"
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
            {busy ? busyLabel : confirmLabel}
          </button>
        </>
      )}
    >
      {intro && <p className="confirm-intro">{intro}</p>}
      <OwnRateAlert lines={lines} rates={rates} />
      <div className="confirm-totals">
        <div className="total-row"><span>Market</span><strong>{formatMoney(totals.market)}</strong></div>
        {rate('Cash', 'cash', rates.customCash)}
        {rate('Credit', 'credit', rates.customCredit)}
      </div>
      <label className="confirm-field">
        <span>Customer name</span>
        {/* 80, as every name in the database: longer couldn't convert (decision 337). */}
        <CustomerNameInput
          value={customer}
          autoFocus
          maxLength={80}
          onChange={setCustomer}
          onPick={({ name, phone: last }) => {
            setCustomer(name);
            if (last) {
              setPhone(formatPhone(last));
              setPhoneTouched(true);
            }
          }}
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
      {flagOption && (
        <label className={`confirm-flag${flag ? ' on' : ''}`}>
          <input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} />
          {/* Two lines: the flag and its name, then what it does. */}
          <span className="confirm-flag-text">
            <span><span aria-hidden="true">🚩</span> Flag check for condition</span>
            <em>Its day page warns to check the cards' condition before export.</em>
          </span>
        </label>
      )}
      <p className="confirm-user">Confirming as <UserTag user={user} /></p>
    </Modal>
  );
}
