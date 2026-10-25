import { useState } from 'react';
import UserTag from '../../components/UserTag.jsx';
import GuardButton from '../../components/GuardButton.jsx';
import MoreMenu from '../../components/MoreMenu.jsx';
import InlineEdit from './InlineEdit.jsx';
import CallChip from './CallChip.jsx';
import { STATUSES, isClosed, isPulled, statusText, statusTone } from './status.js';
import { formatMoney } from '../../lib/money.js';
import { PHONE_ERROR, formatPhone, phoneDigits, validPhone } from '../../lib/phone.js';
import { formatRecent, formatShortDate, formatTime } from '../../lib/time.js';
import { cleanLast4, cleanName, nameError } from './CollectionModals.jsx';

/** The fold button: the details down to their header bar, or back up. */
function FoldButton({ open, onToggle }) {
  return (
    <button
      type="button"
      className="cd-fold"
      aria-expanded={open}
      aria-label={open ? 'Minimize the details' : 'Expand the details'}
      title={open ? 'Minimize the details' : 'Expand the details'}
      onClick={onToggle}
    >
      <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
        <path
          d={open ? 'M3.5 6 8 10.5 12.5 6' : 'M3.5 10 8 5.5 12.5 10'}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * Can't upload cards (export spec 9.1): always Paid/Ours, its name and note
 * fixed, no phone, no status controls and no Delete. Cards only arrive from
 * exports; they can be removed as from any Paid/Ours collection. Bulk pulled
 * from exports reads Completed instead (decision 423), the same otherwise.
 */
function SystemDetails({ buy, open, onToggle, viewOnly, holder, onTakeOver }) {
  const pulled = isPulled(buy);
  return (
    <section className={`col-details system${open ? ' open' : ''} has-body`} aria-label="Collection details">
      <div className="cd-head">
        <button type="button" className="cd-toggle" aria-expanded={open} onClick={onToggle}>
          <span className="cd-name">{buy.customer_name}</span>
          <span className={`status-chip ${statusTone(buy)}`}>{statusText(buy)}</span>
          <span className="system-chip">System</span>
        </button>
        <FoldButton open={open} onToggle={onToggle} />
      </div>
      <div className="cd-body">
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
        {open && (
          <>
            <p className="cd-system-note">{buy.notes}</p>
            <p className="hint">
              {pulled
                ? 'Always Completed, and left out of the header search. Cards arrive here from Export MTG csv (>…), pulled as bulk, each saying where it came from; remove one with its × once it\'s put away. EXPORT sends them from here.'
                : 'Always Paid/Ours. Cards arrive here from exports, each saying where it came from; remove one with its × once it\'s dealt with. EXPORT tries them again.'}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

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

/** The price paid, green for cash or blue for credit, or TBD; Rejected paid nothing: $0 in red (owner, 2026-10-09). */
export function PaidText({ buy, withMethod = false }) {
  if (buy.status === 'rejected') return <span className="paid-none">$0</span>;
  if (!isClosed(buy.status) || buy.paid_price == null) return TBD;
  return (
    <span className={`is-${buy.paid_method}`}>
      {formatMoney(buy.paid_price)}{withMethod && ` ${buy.paid_method}`}
    </span>
  );
}

/**
 * A collection's details, at the foot of its sidebar above the totals
 * (owner, 2026-09-29: nothing may take height from the stage). The header
 * bar is always there: the name and status (click to fold the rest away),
 * the ⋯ menu and a large fold button, then the view-only / Paid/Ours
 * banners. Unfolded: name, phone, Last 4 ID and notes edited in place, the
 * status dropdown and step button, and who created and last edited it.
 * Always unfolded when a collection opens (owner, 2026-09-30); folding
 * lasts until it's closed. `folds` counts the cards added: each one folds
 * the details again, even if they were opened since (decision 509).
 */
export default function CollectionDetails({
  buy, byId, api, canChangeStatus, statusBlocked, deleteBlocked,
  viewOnly, holder, onTakeOver, onUnlock, onReopen, onUnreject, onInfo, onStatus, onDelete,
  convertBlocked = null, onConvert, printBlocked = null, onPrint, unexportBlocked = null, onUnexport,
  folds = 0, busy = false,
}) {
  const [open, setOpen] = useState(true);
  const [foldsSeen, setFoldsSeen] = useState(folds);
  if (folds !== foldsSeen) {
    setFoldsSeen(folds);
    setOpen(false);
  }
  const toggle = () => setOpen((o) => !o);
  if (buy.system_key) return <SystemDetails buy={buy} open={open} onToggle={toggle} viewOnly={viewOnly} holder={holder} onTakeOver={onTakeOver} />;
  // A project (owner, 2026-10-01): no phone, ID, offer or price paid, and
  // one status step, Paid/Ours to Completed (decision 294), Reopen after.
  const project = Boolean(buy.project);
  const hasBody = open || viewOnly || ['paid', 'completed', 'rejected'].includes(buy.status);
  const tone = statusTone(buy);
  const step = {
    processing: { to: 'priced', label: 'Mark as Priced →' },
    priced: { to: 'paid', label: 'Mark as Paid/Ours →' },
    // Paid/Ours → Completed by hand (owner, 2026-10-18; decision 294): EXPORT no longer does it.
    paid: { to: 'completed', label: 'Mark as Completed →' },
  }[buy.status] ?? null;
  // What the dropdown can't pick from here. Completed only from Paid/Ours
  // (decision 294). Rejected (owner, 2026-10-09): only from Processing
  // or Priced, and only reopened to one of those (Priced needs its offer).
  const optionOff = (value) => {
    if (value === 'completed') return buy.status !== 'paid';
    if (buy.status === 'rejected') return value === 'paid' || (value === 'priced' && buy.offer_cash == null);
    if (value === 'rejected') return buy.status !== 'processing' && buy.status !== 'priced';
    return false;
  };
  const reopensTo = buy.offer_cash != null ? 'Priced, its offer kept' : 'Processing';

  return (
    <section className={`col-details${open ? ' open' : ''}${hasBody ? ' has-body' : ''}`} aria-label="Collection details">
      <div className="cd-head">
        <button
          type="button"
          className="cd-toggle"
          aria-expanded={open}
          title={open ? 'Minimize the details' : 'Expand the details'}
          onClick={toggle}
        >
          <span className="cd-name">{buy.customer_name}</span>
          <span className={`status-chip ${tone}`}>{statusText(buy)}</span>
          {project && <span className="project-chip">Project</span>}
        </button>
        <MoreMenu
          up
          items={[
            // The same as a buy's ⋯ (owner, 2026-10-14): Print, then Convert, then Delete.
            // Print (docs/TEAM_FEEDBACK.md 3): its Magic cards by Crystal Commerce category.
            ...(onPrint ? [{
              label: project ? 'Print project' : 'Print overnight buy',
              needsUser: false,
              blocked: printBlocked,
              title: `A PDF of this ${project ? 'project' : 'overnight buy'}'s Magic cards by Crystal Commerce category, to check them by hand. Changes nothing.`,
              onClick: onPrint,
            }] : []),
            // Undo export… (owner, 2026-10-18; decision 298): the export's stamps off its cards,
            // their Can't-upload copies taken back; the status stays.
            ...(onUnexport ? [{
              label: 'Undo export…',
              blocked: unexportBlocked,
              title: "Take the export's stamps off this collection's exported Magic cards, so EXPORT offers them again, and bring their copies back out of Can't upload cards. The status and the file already downloaded stay as they are.",
              onClick: onUnexport,
            }] : []),
            // A project becomes a buy again (owner, 2026-10-10): the way back from Convert to project.
            ...(project ? [{
              label: 'Convert to buy',
              blocked: convertBlocked,
              title: "Move every card into a new buy on today's page, confirmed now, and delete the project",
              onClick: onConvert,
            }] : []),
            {
              label: project ? 'Delete project…' : 'Delete overnight buy…',
              danger: true,
              blocked: deleteBlocked,
              title: `Delete this ${project ? 'project' : 'overnight buy'} and every card in it`,
              onClick: onDelete,
            },
          ]}
        />
        {/* Folds the details down to this bar, or brings them back up. */}
        <button
          type="button"
          className="cd-fold"
          aria-expanded={open}
          aria-label={open ? 'Minimize the details' : 'Expand the details'}
          title={open ? 'Minimize the details' : 'Expand the details'}
          onClick={toggle}
        >
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
            <path
              d={open ? 'M3.5 6 8 10.5 12.5 6' : 'M3.5 10 8 5.5 12.5 10'}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {hasBody && (
        <div className="cd-body">
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
          {buy.status === 'paid' && project && (
            <div className={`cd-banner ${tone}`}>
              <span>
                {buy.skip_pricing
                  ? "Project, skipping pricing: cards go in with no price, and EXPORT works out their Sell Prices. Mark it Completed when it's done."
                  : "Project: the store's own cards. Add, price and remove them; mark it Completed when it's done."}
              </span>
              {/* Skip pricing (decision 513): on or off any time, in the banner so it shows folded too. */}
              <GuardButton
                className={`btn small ghost skip-pricing${buy.skip_pricing ? ' on' : ''}`}
                aria-pressed={Boolean(buy.skip_pricing)}
                disabled={busy}
                looksDisabled={!api.canEdit}
                title={buy.skip_pricing
                  ? 'Price cards again as they’re added. REPRICE? prices the ones added with no price'
                  : 'Add cards with no price: no price lookups, so nothing waits. EXPORT works out their Sell Prices'}
                onClick={() => (api.canEdit ? onInfo({ skip_pricing: !buy.skip_pricing }) : api.editBlocked())}
              >
                {buy.skip_pricing ? '⚡ Skip pricing: on' : 'Skip pricing: off'}
              </GuardButton>
            </div>
          )}
          {buy.status === 'paid' && !project && (
            <div className={`cd-banner ${tone}`}>
              <span>Paid/Ours — <PaidText buy={buy} withMethod />. Locked. Mark it Completed when it's done.</span>
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
          {buy.status === 'rejected' && (
            <div className="cd-banner tone-rejected">
              <span>
                Rejected{buy.rejected_at && <> {formatShortDate(buy.rejected_at)}</>}
                {buy.rejected_reason && <>: “{buy.rejected_reason}”</>}. Locked, and left out of search.
              </span>
              <GuardButton
                className="btn small ghost"
                disabled={!canChangeStatus}
                title={canChangeStatus ? `Reopen: back to ${reopensTo}` : statusBlocked}
                onClick={onUnreject}
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
              {!project && <>
              <dt>Phone</dt>
              {/* 📞 (n) on Priced collections (owner, 2026-10-02): calls about the offer. */}
              <dd className="cd-phone-row">
                <InlineEdit
                  className="cd-phone"
                  label="Phone"
                  value={buy.phone}
                  display={formatPhone(buy.phone)}
                  format={formatPhone}
                  placeholder="none"
                  validate={(t) => (validPhone(t) ? null : PHONE_ERROR)}
                  onSave={(t) => onInfo({ phone: phoneDigits(t) })}
                  canEdit={api.canEdit}
                  editBlocked={api.editBlocked}
                />
                {buy.status === 'priced' && <CallChip buy={buy} />}
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
              </>}
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
              {project ? (
                <dd className="cd-status">
                  <span className={`status-chip ${tone}`}>{statusText(buy)}</span>
                  {/* Paid/Ours → Completed by hand (decision 294): a project's one status step. */}
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
              ) : (
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
                    <option key={s.value} value={s.value} disabled={optionOff(s.value)}>
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
              )}
              {!project && <>
              <dt>Offer</dt>
              <dd><OfferText buy={buy} /></dd>
              <dt>Paid</dt>
              <dd><PaidText buy={buy} withMethod /></dd>
              </>}
              <dt>Created</dt>
              <dd>{formatShortDate(buy.created_at)} by <UserTag user={byId(buy.created_by)} /></dd>
              <dt>Edited</dt>
              <dd>{recent(buy.updated_at)} by <UserTag user={byId(buy.last_edited_by)} /></dd>
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
