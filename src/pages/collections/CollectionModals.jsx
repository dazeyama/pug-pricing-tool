import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { PHONE_ERROR, formatPhone, phoneDigits, validPhone } from '../../lib/phone.js';


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
 * + Price Collection (spec 9.2): name, phone (formatted as typed), an
 * optional Last 4 ID (owner, 2026-09-29), notes. Create stays disabled until
 * the name and a 10-digit phone number are in.
 */
export function NewCollectionModal({ busy, onCreate, onClose }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [last4, setLast4] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState({ name: false, phone: false });
  const nameProblem = nameError(name);
  const phoneProblem = validPhone(phone) ? null : PHONE_ERROR;
  const ready = !nameProblem && !phoneProblem && !busy;
  const submit = () => {
    setTouched({ name: true, phone: true });
    if (ready) onCreate({ name: cleanName(name), phone: phoneDigits(phone), idLast4: last4, notes: notes.trim() });
  };

  return (
    <Modal
      title="Price a collection"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!ready} onClick={submit}>Create</button>
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
          <input
            type="text"
            autoFocus
            value={name}
            maxLength={120}
            placeholder="Jordan Reyes"
            onChange={(e) => setName(e.target.value)}
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
          <span>Last 4 ID <em>(optional)</em></span>
          <input
            type="text"
            className="last4-input"
            value={last4}
            placeholder="A1B2"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => setLast4(cleanLast4(e.target.value))}
          />
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
 * (case-insensitive, trimmed); the server checks it again.
 */
export function DeleteCollectionModal({ name, count, busy, onDelete, onClose }) {
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  if (step === 1) {
    return (
      <Modal
        title="Delete collection"
        onClose={onClose}
        footer={(
          <>
            <button type="button" className="btn ghost" autoFocus onClick={onClose}>Cancel</button>
            <button type="button" className="btn danger-ghost" onClick={() => setStep(2)}>Continue</button>
          </>
        )}
      >
        <p>
          Delete <strong>{name}</strong>? All <strong>{count} card{count === 1 ? '' : 's'}</strong> in this
          collection will be permanently removed.
        </p>
      </Modal>
    );
  }
  return (
    <Modal
      title="Delete collection"
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
        <span>Type the collection's name to confirm:</span>
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
