import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PricingScreen from './price/PricingScreen.jsx';
import CollectionHeader, { statusLabel } from './collections/CollectionHeader.jsx';
import { ConfirmModal, DeleteCollectionModal } from './collections/CollectionModals.jsx';
import { useCollection } from './collections/useCollection.js';
import { useCollectionLock } from './collections/useCollectionLock.js';
import ExportButton from '../components/ExportButton.jsx';
import GuardButton from '../components/GuardButton.jsx';
import UserTag from '../components/UserTag.jsx';
import { formatTime } from '../lib/time.js';
import { useSettings } from '../state/settings.jsx';
import { useDevice } from '../state/device.jsx';
import { useStaff } from '../state/staff.jsx';
import { useConnection } from '../state/connection.jsx';
import { useToast } from '../components/Toast.jsx';

// A collection's pricing screen (spec 9.4): the Price tab's screen with the
// collection's header bar on top and its list in the sidebar. Every add and
// remove saves at once and is logged; there's no CONFIRM BUY, only EXPORT.
// One computer edits at a time (9.6); Paid/Ours locks it (9.5).
export default function CollectionPage() {
  const { id } = useParams();
  // A fresh screen per collection: its search, toggles and lock start over.
  return <CollectionScreen key={id} id={id} />;
}

function CollectionScreen({ id }) {
  const navigate = useNavigate();
  const { deviceId } = useDevice();
  const staff = useStaff();
  const user = staff.current;
  const { offline } = useConnection();
  const toast = useToast();
  const { values } = useSettings();
  const lock = useCollectionLock(id, { deviceId, userId: user?.id });
  const col = useCollection(id, { deviceId, onLockLost: lock.recheck });
  const [asking, setAsking] = useState(null);   // 'paid' | 'unlock' | 'takeover' | 'delete'
  const [unlockTo, setUnlockTo] = useState('priced');
  const seen = useRef(false);
  const deleting = useRef(false);   // our own delete: no "deleted on another computer"

  const buy = col.buy;
  const back = () => navigate('/collections');

  // Deleted on another computer while open: say so and go back to the table.
  useEffect(() => {
    if (buy) seen.current = true;
    if (seen.current && col.missing && !deleting.current) {
      toast('This collection was deleted on another computer.', 'err');
      back();
    }
  }, [buy, col.missing]);

  // Rates (spec 8.9.1, 9.4): the Paid/Ours snapshot, else the collection's
  // custom rates where set, else the Master Buy Percentages.
  const master = { cash: Number(values.cash_pct), credit: Number(values.credit_pct) };
  const customCash = buy?.custom_cash_pct != null ? Number(buy.custom_cash_pct) : null;
  const customCredit = buy?.custom_credit_pct != null ? Number(buy.custom_credit_pct) : null;
  const paid = buy?.status === 'paid';
  const rates = paid && buy.cash_pct != null
    ? { cash: Number(buy.cash_pct), credit: Number(buy.credit_pct), customCash, customCredit }
    : { cash: customCash ?? master.cash, credit: customCredit ?? master.credit, customCash, customCredit };

  const holderUser = lock.holder ? staff.byId(lock.holder.userId) : null;
  const holderLabel = lock.holder?.label ?? 'another computer';
  const viewOnly = lock.status === 'other';

  // Why nothing in the list can change here (spec 9.5, 9.6), or null.
  let locked = null;
  if (!buy) locked = 'Loading the collection';
  else if (lock.status === 'checking') locked = 'Checking who is editing this collection';
  else if (viewOnly) locked = `View only: ${holderLabel} is editing this collection. Take over to edit`;
  else if (paid) locked = 'Paid/Ours: unlock it to edit';

  // The status can change while Paid/Ours (that's how it unlocks), not while view-only.
  const canChangeStatus = Boolean(user) && !offline && lock.status === 'held' && Boolean(buy);
  let statusBlocked = null;
  if (!user) statusBlocked = 'Pick a user first';
  else if (offline) statusBlocked = 'No connection';
  else if (viewOnly) statusBlocked = 'View only: take over to change the status';
  else if (lock.status !== 'held') statusBlocked = 'Checking who is editing this collection';
  const deleteBlocked = viewOnly ? `${holderLabel} is editing this collection: take over first`
    : offline ? 'No connection' : null;

  /** Status changes: Paid/Ours and leaving it ask first (spec 9.5). */
  function changeStatus(next) {
    if (!canChangeStatus || next === buy.status) return;
    if (next === 'paid') setAsking('paid');
    else if (paid) {
      setUnlockTo(next);
      setAsking('unlock');
    } else {
      col.setStatus(next, user.id, master);
    }
  }

  const list = {
    lines: col.lines,
    loaded: col.loaded,
    busy: col.busy,
    add: col.add,
    update: col.update,
    remove: col.remove,
    setRates: col.setRates,
  };

  if (col.loaded && col.missing && !seen.current && !deleting.current) {
    return (
      <div className="col-missing">
        <p className="empty">This collection doesn't exist. It may have been deleted.</p>
        <button type="button" className="btn" onClick={back}>‹ Back to Collections</button>
      </div>
    );
  }

  const count = col.lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <PricingScreen
      list={list}
      rates={rates}
      master={master}
      locked={locked}
      listTitle="Collection list"
      ratesTitle="Rates for this collection"
      listTotals={false}
      renderTop={(api) => (
        <>
          {buy ? (
            <CollectionHeader
              buy={buy}
              lines={col.lines}
              rates={rates}
              master={master}
              byId={staff.byId}
              api={api}
              canChangeStatus={canChangeStatus}
              statusBlocked={statusBlocked}
              deleteBlocked={deleteBlocked}
              onBack={back}
              onInfo={(fields) => col.updateInfo(fields, user?.id)}
              onStatus={changeStatus}
              onSaveRates={(cash, credit) => col.setRates(cash, credit, user?.id)}
              onDelete={() => setAsking('delete')}
            />
          ) : (
            <div className="col-head loading">
              <button type="button" className="btn ghost back-btn" onClick={back}>‹ BACK</button>
              <span className="muted-text">Loading…</span>
            </div>
          )}

          {viewOnly && (
            <div className="col-banner view-only">
              <span>
                ✎ Being edited on <strong>{holderLabel}</strong>
                {holderUser && <> by <UserTag user={holderUser} /></>}
                {lock.holder?.since && <> since {formatTime(lock.holder.since)}</>}.
              </span>
              <GuardButton className="btn small" onClick={() => setAsking('takeover')}>Take over</GuardButton>
            </div>
          )}
          {paid && (
            <div className="col-banner paid">
              <span>Paid/Ours — locked.</span>
              <GuardButton
                className="btn small good-ghost"
                disabled={!canChangeStatus}
                title={canChangeStatus ? 'Unlock: back to Priced, and editable' : statusBlocked}
                onClick={() => {
                  setUnlockTo('priced');
                  setAsking('unlock');
                }}
              >
                🔒 Unlock
              </GuardButton>
            </div>
          )}

          {asking === 'paid' && (
            <ConfirmModal
              title="Mark as Paid/Ours?"
              yes="Mark Paid/Ours"
              onClose={() => {
                setAsking(null);
                api.focusSearch();
              }}
              onYes={async () => {
                setAsking(null);
                await col.setStatus('paid', user?.id, master);
                api.focusSearch();
              }}
            >
              <p>The collection will be locked.</p>
            </ConfirmModal>
          )}
          {asking === 'unlock' && (
            <ConfirmModal
              title="Unlock this collection?"
              yes="Unlock"
              onClose={() => setAsking(null)}
              onYes={async () => {
                setAsking(null);
                await col.setStatus(unlockTo, user?.id, master);
                api.focusSearch();
              }}
            >
              <p>It will go back to {statusLabel(unlockTo)} and can be edited.</p>
            </ConfirmModal>
          )}
          {asking === 'takeover' && (
            <ConfirmModal
              title="Take over editing?"
              yes="Take over"
              onClose={() => setAsking(null)}
              onYes={async () => {
                setAsking(null);
                if (await lock.takeOver()) {
                  toast('You are editing this collection now.', 'ok');
                  await col.reload();
                }
                api.focusSearch();
              }}
            >
              <p>{holderLabel} will switch to view-only.</p>
            </ConfirmModal>
          )}
          {asking === 'delete' && buy && (
            <DeleteCollectionModal
              name={buy.customer_name}
              count={count}
              busy={col.busy}
              onClose={() => setAsking(null)}
              onDelete={async (typed) => {
                if (!user) {
                  staff.pulse();
                  return;
                }
                deleting.current = true;
                if (await col.destroy(typed, user.id)) {
                  setAsking(null);
                  toast(`Deleted ${buy.customer_name}.`, 'ok');
                  back();
                } else {
                  deleting.current = false;
                }
              }}
            />
          )}
        </>
      )}
      renderListFooter={({ focusSearch }) => (
        <div className="list-buttons">
          <ExportButton onDone={focusSearch} />
        </div>
      )}
    />
  );
}
