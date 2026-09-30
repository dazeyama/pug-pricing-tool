import { useEffect, useRef, useState } from 'react';
import UserTag from '../../components/UserTag.jsx';
import GuardButton from '../../components/GuardButton.jsx';
import InlineEdit from './InlineEdit.jsx';
import { Totals, marketTotal } from '../price/BuyList.jsx';
import { formatPhone, phoneDigits, validPhone } from '../../lib/phone.js';
import { formatRecent, formatShortDate } from '../../lib/time.js';
import { PHONE_ERROR, cleanName, nameError } from './CollectionModals.jsx';

export const STATUSES = [
  { value: 'processing', label: 'Processing' },
  { value: 'priced', label: 'Priced' },
  { value: 'paid', label: 'Paid/Ours' },
];
export const statusLabel = (s) => STATUSES.find((x) => x.value === s)?.label ?? s;

/** "today 3:12 PM" in a sentence. */
const recent = (when) => formatRecent(when).replace(/^(Today|Yesterday)/, (m) => m.toLowerCase());

/** The ⋯ menu (spec 9.4): Delete collection…, kept away from everyday controls. */
function MoreMenu({ onDelete, deleteBlocked }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span className="more-menu" ref={wrap}>
      <button
        type="button"
        className="more-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More"
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div className="more-list" role="menu">
          <GuardButton
            role="menuitem"
            className="more-item danger"
            disabled={Boolean(deleteBlocked)}
            title={deleteBlocked ?? 'Delete this collection and every card in it'}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete collection…
          </GuardButton>
        </div>
      )}
    </span>
  );
}

/**
 * The collection header bar (spec 9.4): BACK; name, phone and notes edited in
 * place; the status dropdown and step button; who created and last edited it;
 * the totals with their custom-rate percentages; the ⋯ menu.
 */
export default function CollectionHeader({
  buy, lines, rates, master, byId, api, canChangeStatus, statusBlocked, deleteBlocked,
  onBack, onInfo, onStatus, onSaveRates, onDelete,
}) {
  const step = buy.status === 'processing' ? { to: 'priced', label: 'Mark as Priced →' }
    : buy.status === 'priced' ? { to: 'paid', label: 'Mark as Paid/Ours →' } : null;

  return (
    <div className="col-head">
      <button type="button" className="btn ghost back-btn" onClick={onBack}>‹ BACK</button>

      <div className="col-info">
        <div className="col-line col-main">
          <InlineEdit
            className="col-name"
            label="Name"
            value={buy.customer_name}
            maxLength={120}
            validate={(t) => nameError(t)}
            onSave={(t) => onInfo({ name: cleanName(t) })}
            canEdit={api.canEdit}
            editBlocked={api.editBlocked}
          />
          <span className="col-sep">·</span>
          <InlineEdit
            className="col-phone"
            label="Phone"
            value={buy.phone}
            display={formatPhone(buy.phone)}
            format={formatPhone}
            validate={(t) => (validPhone(t) ? null : PHONE_ERROR)}
            onSave={(t) => onInfo({ phone: phoneDigits(t) })}
            canEdit={api.canEdit}
            editBlocked={api.editBlocked}
          />
          <span className="col-sep">·</span>
          <select
            className={`status-select ${buy.status}`}
            aria-label="Status"
            value={buy.status}
            disabled={!canChangeStatus}
            title={canChangeStatus ? 'Status' : statusBlocked}
            onChange={(e) => onStatus(e.target.value)}
          >
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {step && (
            <GuardButton
              className="btn small step-btn"
              disabled={!canChangeStatus}
              title={canChangeStatus ? undefined : statusBlocked}
              onClick={() => onStatus(step.to)}
            >
              {step.label}
            </GuardButton>
          )}
        </div>

        <div className="col-line col-notes">
          <span className="col-label">Notes:</span>
          <InlineEdit
            label="Notes"
            value={buy.notes}
            multiline
            placeholder="none"
            onSave={(t) => onInfo({ notes: t.trim() })}
            canEdit={api.canEdit}
            editBlocked={api.editBlocked}
          />
        </div>

        <div className="col-line col-meta">
          <span>Created {formatShortDate(buy.created_at)} by <UserTag user={byId(buy.created_by)} /></span>
          <span className="col-sep">·</span>
          <span>Last edited {recent(buy.updated_at)} by <UserTag user={byId(buy.last_edited_by)} /></span>
          <MoreMenu onDelete={onDelete} deleteBlocked={deleteBlocked} />
        </div>
      </div>

      <Totals
        drop
        market={marketTotal(lines)}
        rates={rates}
        master={master}
        ratesTitle="Rates for this collection"
        canEdit={api.canEdit}
        editBlocked={api.editBlocked}
        onSaveRates={onSaveRates}
        onDone={api.focusSearch}
      />
    </div>
  );
}
