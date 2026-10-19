import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import CustomerNameInput from '../../components/CustomerNameInput.jsx';
import { PHONE_ERROR, formatPhone, phoneDigits, validPhone } from '../../lib/phone.js';
import ConfirmBuyModal from '../price/ConfirmBuyModal.jsx';
import { cardCounts, countText } from '../../lib/bulk.js';

/**
 * Convert to buy (owner, 2026-10-10): CONFIRM BUY's questions for a project,
 * starting from what it has: a project made from a buy kept its phone, price
 * paid and notes, and its name started as the customer's. From the
 * project's ⋯ menu, on its screen or on the Collections tab.
 */
export function ConvertToBuyModal({ buy, lines, rates, user, busy, onConvert, onClose }) {
  return (
    <ConfirmBuyModal
      lines={lines}
      rates={rates}
      user={user}
      busy={busy}
      title={`Convert to buy — ${countText(cardCounts(lines))}`}
      intro={(
        <>
          Every card in <strong>{buy.customer_name}</strong> moves to a new buy on today's page, confirmed now
          at the prices it has, and the project is deleted.
        </>
      )}
      initial={{
        customer: buy.phone ? buy.customer_name : '',
        phone: buy.phone ?? '',
        method: buy.paid_method ?? null,
        price: buy.paid_price,
        notes: buy.notes ?? '',
      }}
      confirmLabel="Convert to buy"
      busyLabel="Converting…"
      // The buy it makes is confirmed here: it can be flagged, as at CONFIRM BUY (owner, 2026-10-14).
      flagOption
      onClose={onClose}
      onConfirm={onConvert}
    />
  );
}


/** A name as saved: trimmed, single spaces. */
export const cleanName = (text) => text.trim().replace(/\s+/g, ' ');

/** "Last 4 ID" as typed (owner, 2026-09-29): letters and digits only, capitals, at most 4. */
export const cleanLast4 = (text) => String(text ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4);

/** Why a name can't be saved (1–80 characters, spec 9.2), or null. */
export function nameError(text) {
  const n = cleanName(text).length;
  if (!n) return 'Type a name';
  if (n > 80) return 'Keep the name to 80 characters';
  return null;
}

/**
 * + Start Project (owner, 2026-10-01): a box of cards the store already
 * owns, priced for an export. Just a name and notes: no phone, no ID.
 */
export function NewProjectModal({ busy, onCreate, onClose }) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const nameProblem = nameError(name);
  const ready = !nameProblem && !busy;
  const submit = () => {
    setTouched(true);
    if (ready) onCreate({ name: cleanName(name), notes: notes.trim() });
  };

  return (
    <Modal
      title="Start a project"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!ready} onClick={submit}>Start</button>
        </>
      )}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="hint">
          For pricing cards the store already owns (a box from the back, not from any buy). It stays
          Paid/Ours while it's exported in parts; a card exported can't be changed after.
        </p>
        <label className="field">
          <span>Name</span>
          <input
            type="text"
            autoFocus
            value={name}
            maxLength={120}
            placeholder="Back room binder box"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          {touched && nameProblem && <span className="field-error">{nameProblem}</span>}
        </label>
        <label className="field">
          <span>Notes <em>(optional)</em></span>
          <textarea
            rows={3}
            value={notes}
            placeholder="Shelf 3, unsorted 2000s rares"
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </label>
      </form>
    </Modal>
  );
}

/**
 * + Price Collection (spec 9.2): name, phone (formatted as typed), Last 4 ID
 * (required since 2026-10-09), notes. Create looks disabled until the name,
 * a 10-digit phone number and the Last 4 ID are in. Ctrl+click on Create
 * creates it without the phone or the ID (owner, 2026-10-09: an admin
 * shortcut, deliberately unexplained); the name is always needed, and a
 * part-typed phone still has to be finished or cleared. The name suggests
 * past customers; picking one fills in their last phone number, never the
 * Last 4 ID (owner, 2026-10-09).
 */
export function NewCollectionModal({ busy, onCreate, onClose }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [last4, setLast4] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState({ name: false, phone: false, last4: false });
  const nameProblem = nameError(name);
  const phoneProblem = validPhone(phone) ? null : PHONE_ERROR;
  const last4Problem = last4 ? null : 'Type the last 4 of their ID';
  const ready = !nameProblem && !phoneProblem && !last4Problem && !busy;
  const submit = (bypass = false) => {
    setTouched({ name: true, phone: true, last4: true });
    const skipping = bypass && !nameProblem && !busy && (!phone || !phoneProblem);
    if (ready || skipping) {
      onCreate({ name: cleanName(name), phone: phone ? phoneDigits(phone) : null, idLast4: last4, notes: notes.trim() });
    }
  };

  return (
    <Modal
      title="Price a collection"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          {/* Stays clickable while it looks disabled: Ctrl+click skips the phone and ID. */}
          <button
            type="button"
            className={`btn primary${ready ? '' : ' is-disabled'}`}
            disabled={busy}
            aria-disabled={!ready}
            onClick={(e) => submit(e.ctrlKey || e.metaKey)}
          >
            Create
          </button>
        </>
      )}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span>Name</span>
          <CustomerNameInput
            autoFocus
            value={name}
            maxLength={120}
            placeholder="Jordan Reyes"
            onChange={setName}
            onPick={({ name: picked, phone: last }) => {
              setName(picked);
              if (last) setPhone(formatPhone(last));
            }}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          />
          {touched.name && nameProblem && <span className="field-error">{nameProblem}</span>}
        </label>
        <label className="field">
          <span>Phone number</span>
          <input
            type="text"
            value={phone}
            inputMode="tel"
            placeholder="(555) 123-4567"
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
          />
          {touched.phone && phoneProblem && <span className="field-error">{phoneProblem}</span>}
        </label>
        <label className="field">
          <span>Last 4 ID</span>
          <input
            type="text"
            className="last4-input"
            value={last4}
            placeholder="A1B2"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => setLast4(cleanLast4(e.target.value))}
            onBlur={() => setTouched((t) => ({ ...t, last4: true }))}
          />
          {touched.last4 && last4Problem && <span className="field-error">{last4Problem}</span>}
        </label>
        <label className="field">
          <span>Notes <em>(optional)</em></span>
          <textarea
            rows={3}
            value={notes}
            placeholder="2 binders + bulk box, wants credit"
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </label>
        {/* Enter in a one-line field submits. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

/**
 * Delete collection… (spec 9.7): a warning with the card count, then the
 * name typed to confirm. Delete forever only lights up on a match
 * (case-insensitive, trimmed); the server checks it again. A project says
 * "project" (smoke test 2026-10-11, F9).
 */
export function DeleteCollectionModal({ name, lines, busy, onDelete, onClose, project = false }) {
  // Cards and bulk counted apart (docs/TEAM_FEEDBACK.md 5.5).
  const counts = cardCounts(lines);
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const kind = project ? 'project' : 'collection';
  const title = project ? 'Delete project' : 'Delete collection';

  if (step === 1) {
    return (
      <Modal
        title={title}
        onClose={onClose}
        footer={(
          <>
            <button type="button" className="btn ghost" autoFocus onClick={onClose}>Cancel</button>
            <button type="button" className="btn danger-ghost" onClick={() => setStep(2)}>Continue</button>
          </>
        )}
      >
        <p>
          Delete <strong>{name}</strong>?{' '}
          {!counts.cards && !counts.bulk ? <>It has no cards.</> : counts.cards === 1 && !counts.bulk
            ? <>Its <strong>1 card</strong> will be permanently removed.</>
            : <>All <strong>{countText(counts)}</strong> in this {kind} will be permanently removed.</>}
        </p>
      </Modal>
    );
  }
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn danger" disabled={!matches || busy} onClick={() => onDelete(typed)}>
            Delete forever
          </button>
        </>
      )}
    >
      <label className="field">
        <span>Type the {kind}'s name to confirm:</span>
        <input
          type="text"
          autoFocus
          value={typed}
          placeholder={name}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches && !busy) onDelete(typed);
          }}
        />
      </label>
    </Modal>
  );
}

/** A yes/no question with its own wording (Paid/Ours, Unlock, Take over). */
/**
 * Reject (owner, 2026-10-09): the customer said no. An optional reason, kept
 * on the collection and in the Changelog.
 */
export function RejectModal({ busy, onReject, onClose }) {
  const [reason, setReason] = useState('');
  const submit = () => {
    if (!busy) onReject(reason.trim());
  };
  return (
    <Modal
      title="Reject this collection?"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn danger" disabled={busy} onClick={submit}>Reject</button>
        </>
      )}
    >
      <p>
        It's kept, with its prices and offer, until it's deleted: locked, and left out of the header search
        (Show all finds it). Reopen takes it back.
      </p>
      <label className="field">
        <span>Reason <em>(optional)</em></span>
        <input
          type="text"
          autoFocus
          maxLength={200}
          value={reason}
          placeholder="Wanted more cash"
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
      </label>
    </Modal>
  );
}

export function ConfirmModal({ title, children, yes, danger = false, onYes, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} autoFocus onClick={onYes}>{yes}</button>
        </>
      )}
    >
      {children}
    </Modal>
  );
}
