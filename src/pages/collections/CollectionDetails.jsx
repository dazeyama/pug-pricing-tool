import { useEffect, useRef, useState } from 'react';
import UserTag from '../../components/UserTag.jsx';
import GuardButton from '../../components/GuardButton.jsx';
import InlineEdit from './InlineEdit.jsx';
import { STATUSES, statusLabel } from './status.js';
import { PHONE_ERROR, formatPhone, phoneDigits, validPhone } from '../../lib/phone.js';
import { formatRecent, formatShortDate, formatTime } from '../../lib/time.js';
import { readLocal, writeLocal } from '../../lib/local.js';
import { cleanName, nameError } from './CollectionModals.jsx';

const OPEN_KEY = 'pug.collectionDetailsOpen';

/** "today 3:12 PM" in a sentence. */
const recent = (when) => formatRecent(when).replace(/^(Today|Yesterday)/, (m) => m.toLowerCase());

/** The ⋯ menu: Delete collection…, kept away from everyday controls (spec 9.7). */
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
 * A collection's details, at the foot of its sidebar above the totals
 * (owner, 2026-09-29: nothing may take height from the stage). The top line
 * is always there: Back, the name and status (click to fold the rest away),
 * the ⋯ menu, and the view-only / Paid/Ours banners. Unfolded: name, phone
 * and notes edited in place, the status dropdown and step button, and who
 * created and last edited it.
 */
export default function CollectionDetails({
  buy, byId, api, canChangeStatus, statusBlocked, deleteBlocked,
  viewOnly, holder, onTakeOver, onUnlock, onBack, onInfo, onStatus, onDelete,
}) {
  const [open, setOpen] = useState(() => readLocal(OPEN_KEY) !== 'no');
  const toggle = () => {
    setOpen((o) => {
      writeLocal(OPEN_KEY, o ? 'no' : 'yes');
      return !o;
    });
  };
  const paid = buy.status === 'paid';
  const step = buy.status === 'processing' ? { to: 'priced', label: 'Mark as Priced →' }
    : buy.status === 'priced' ? { to: 'paid', label: 'Mark as Paid/Ours →' } : null;

  return (
    <section className={`col-details${open ? ' open' : ''}`} aria-label="Collection details">
      <div className="cd-head">
        <button type="button" className="cd-back" title="Back to Collections" onClick={onBack}>‹</button>
        <button
          type="button"
          className="cd-toggle"
          aria-expanded={open}
          title={open ? 'Hide the details' : 'Show the details'}
          onClick={toggle}
        >
          <span className="cd-name">{buy.customer_name}</span>
          <span className={`status-chip ${buy.status}`}>{statusLabel(buy.status)}</span>
          <span className="cd-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
        <MoreMenu onDelete={onDelete} deleteBlocked={deleteBlocked} />
      </div>

      {viewOnly && (
        <div className="cd-banner view-only">
          <span>
            ✎ Being edited on <strong>{holder.label}</strong>
            {holder.user && <> by <UserTag user={holder.user} /></>}
            {holder.since && <> since {formatTime(holder.since)}</>}.
          </span>
          <GuardButton className="btn small" onClick={onTakeOver}>Take over</GuardButton>
        </div>
      )}
      {paid && (
        <div className="cd-banner paid">
          <span>Paid/Ours — locked.</span>
          <GuardButton
            className="btn small good-ghost"
            disabled={!canChangeStatus}
            title={canChangeStatus ? 'Unlock: back to Priced, and editable' : statusBlocked}
            onClick={onUnlock}
          >
            🔒 Unlock
          </GuardButton>
        </div>
      )}

      {open && (
        <dl className="cd-fields">
          <dt>Name</dt>
          <dd>
            <InlineEdit
              className="cd-name-edit"
              label="Name"
              value={buy.customer_name}
              maxLength={120}
              validate={(t) => nameError(t)}
              onSave={(t) => onInfo({ name: cleanName(t) })}
              canEdit={api.canEdit}
              editBlocked={api.editBlocked}
            />
          </dd>
          <dt>Phone</dt>
          <dd>
            <InlineEdit
              className="cd-phone"
              label="Phone"
              value={buy.phone}
              display={formatPhone(buy.phone)}
              format={formatPhone}
              validate={(t) => (validPhone(t) ? null : PHONE_ERROR)}
              onSave={(t) => onInfo({ phone: phoneDigits(t) })}
              canEdit={api.canEdit}
              editBlocked={api.editBlocked}
            />
          </dd>
          <dt>Notes</dt>
          <dd>
            <InlineEdit
              className="cd-notes"
              label="Notes"
              value={buy.notes}
              multiline
              placeholder="none"
              onSave={(t) => onInfo({ notes: t.trim() })}
              canEdit={api.canEdit}
              editBlocked={api.editBlocked}
            />
          </dd>
          <dt>Status</dt>
          <dd className="cd-status">
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
          </dd>
          <dt>Created</dt>
          <dd>{formatShortDate(buy.created_at)} by <UserTag user={byId(buy.created_by)} /></dd>
          <dt>Edited</dt>
          <dd>{recent(buy.updated_at)} by <UserTag user={byId(buy.last_edited_by)} /></dd>
        </dl>
      )}
    </section>
  );
}
