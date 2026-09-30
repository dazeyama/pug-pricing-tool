import { useState } from 'react';
import UserTag from '../../components/UserTag.jsx';
import GuardButton from '../../components/GuardButton.jsx';
import MoreMenu from '../../components/MoreMenu.jsx';
import InlineEdit from './InlineEdit.jsx';
import { STATUSES, isClosed, statusLabel, statusTone } from './status.js';
import { formatMoney } from '../../lib/money.js';
import { PHONE_ERROR, formatPhone, phoneDigits, validPhone } from '../../lib/phone.js';
import { formatRecent, formatShortDate, formatTime } from '../../lib/time.js';
import { readLocal, writeLocal } from '../../lib/local.js';
import { cleanLast4, cleanName, nameError } from './CollectionModals.jsx';

const OPEN_KEY = 'pug.collectionDetailsOpen';

/** "today 3:12 PM" in a sentence. */
const recent = (when) => formatRecent(when).replace(/^(Today|Yesterday)/, (m) => m.toLowerCase());

/** "TBD" in amber until there's a figure (owner, 2026-09-29). */
const TBD = <span className="tbd">TBD</span>;

/** The offer as "$120 cash / $240 credit", or TBD (always TBD while Processing). */
export function OfferText({ buy }) {
  if (buy.status === 'processing' || (buy.offer_cash == null && buy.offer_credit == null)) return TBD;
  return (
    <span className="deal-pair">
      {buy.offer_cash != null && <span className="is-cash">{formatMoney(buy.offer_cash)}</span>}
      {buy.offer_cash != null && buy.offer_credit != null && <span className="deal-slash"> / </span>}
      {buy.offer_credit != null && <span className="is-credit">{formatMoney(buy.offer_credit)}</span>}
    </span>
  );
}

/** The price paid, green for cash or blue for credit, or TBD. */
export function PaidText({ buy, withMethod = false }) {
  if (!isClosed(buy.status) || buy.paid_price == null) return TBD;
  return (
    <span className={`is-${buy.paid_method}`}>
      {formatMoney(buy.paid_price)}{withMethod && ` ${buy.paid_method}`}
    </span>
  );
}

/**
 * A collection's details, at the foot of its sidebar above the totals
 * (owner, 2026-09-29: nothing may take height from the stage). The top line
 * is always there: the name and status (click to fold the rest away), the
 * ⋯ menu, and the view-only / Paid/Ours banners. Unfolded: name, phone,
 * Last 4 ID and notes edited in place, the status dropdown and step button, and who
 * created and last edited it.
 */
export default function CollectionDetails({
  buy, byId, api, canChangeStatus, statusBlocked, deleteBlocked,
  viewOnly, holder, onTakeOver, onUnlock, onReopen, onInfo, onStatus, onDelete,
}) {
  const [open, setOpen] = useState(() => readLocal(OPEN_KEY) !== 'no');
  const toggle = () => {
    setOpen((o) => {
      writeLocal(OPEN_KEY, o ? 'no' : 'yes');
      return !o;
    });
  };
  const tone = statusTone(buy);
  const step = {
    processing: { to: 'priced', label: 'Mark as Priced →' },
    priced: { to: 'paid', label: 'Mark as Paid/Ours →' },
    paid: { to: 'completed', label: 'Mark as Completed →' },
  }[buy.status] ?? null;

  return (
    <section className={`col-details${open ? ' open' : ''}`} aria-label="Collection details">
      <div className="cd-head">
        <button
          type="button"
          className="cd-toggle"
          aria-expanded={open}
          title={open ? 'Hide the details' : 'Show the details'}
          onClick={toggle}
        >
          <span className="cd-name">{buy.customer_name}</span>
          <span className={`status-chip ${tone}`}>{statusLabel(buy.status)}</span>
          <span className="cd-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
        <MoreMenu
          up
          items={[{
            label: 'Delete collection…',
            danger: true,
            blocked: deleteBlocked,
            title: 'Delete this collection and every card in it',
            onClick: onDelete,
          }]}
        />
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
      {buy.status === 'paid' && (
        <div className={`cd-banner ${tone}`}>
          <span>Paid/Ours — <PaidText buy={buy} withMethod />. Locked.</span>
          <GuardButton
            className="btn small ghost"
            disabled={!canChangeStatus}
            title={canChangeStatus ? 'Unlock: back to Priced, and editable' : statusBlocked}
            onClick={onUnlock}
          >
            🔒 Unlock
          </GuardButton>
        </div>
      )}
      {buy.status === 'completed' && (
        <div className="cd-banner tone-completed">
          <span>Completed — locked, and left out of search.</span>
          <GuardButton
            className="btn small ghost"
            disabled={!canChangeStatus}
            title={canChangeStatus ? 'Reopen: back to Paid/Ours, still locked' : statusBlocked}
            onClick={onReopen}
          >
            Reopen
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
          <dt>Last 4 ID</dt>
          <dd>
            <InlineEdit
              className="cd-last4"
              label="Last 4 ID"
              value={buy.id_last4 ?? ''}
              format={cleanLast4}
              placeholder="none"
              onSave={(t) => onInfo({ id_last4: cleanLast4(t) })}
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
              className={`status-select ${tone}`}
              aria-label="Status"
              value={buy.status}
              disabled={!canChangeStatus}
              title={canChangeStatus ? 'Status' : statusBlocked}
              onChange={(e) => onStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                // Completed only follows Paid/Ours.
                <option key={s.value} value={s.value} disabled={s.value === 'completed' && !isClosed(buy.status)}>
                  {s.label}
                </option>
              ))}
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
          <dt>Offer</dt>
          <dd><OfferText buy={buy} /></dd>
          <dt>Paid</dt>
          <dd><PaidText buy={buy} withMethod /></dd>
          <dt>Created</dt>
          <dd>{formatShortDate(buy.created_at)} by <UserTag user={byId(buy.created_by)} /></dd>
          <dt>Edited</dt>
          <dd>{recent(buy.updated_at)} by <UserTag user={byId(buy.last_edited_by)} /></dd>
        </dl>
      )}
    </section>
  );
}
