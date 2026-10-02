import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../components/Modal.jsx';
import ExportDialog from './export/ExportDialog.jsx';
import { fileStamp } from '../lib/time.js';
import { fileSafe } from '../lib/massCreate.js';
import { downloadMassCreate, saveExport } from '../lib/ccExport.js';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PricingScreen from './price/PricingScreen.jsx';
import CollectionDetails from './collections/CollectionDetails.jsx';
import { isClosed, statusLabel } from './collections/status.js';
import { ConfirmModal, DeleteCollectionModal } from './collections/CollectionModals.jsx';
import { OfferModal, PaidModal } from './collections/DealModals.jsx';
import { marketTotal } from './price/BuyList.jsx';
import { useCollection } from './collections/useCollection.js';
import { useCollectionLock } from './collections/useCollectionLock.js';
import ExportButton from '../components/ExportButton.jsx';
import { useSettings } from '../state/settings.jsx';
import { useDevice } from '../state/device.jsx';
import { useStaff } from '../state/staff.jsx';
import { useConnection } from '../state/connection.jsx';
import { useToast } from '../components/Toast.jsx';

// A collection's pricing screen (spec 9.4): the Price tab's screen with the
// collection's list in the sidebar and its details at the sidebar's foot,
// above the totals (owner, 2026-09-29). Every add and remove saves at once
// and is logged; there's no CONFIRM BUY, only EXPORT. One computer edits at
// a time (9.6); Paid/Ours and Completed lock it (9.5). Marking it Priced
// records the offer, Paid/Ours the price paid (owner, 2026-09-29).
export default function CollectionPage() {
  const { id } = useParams();
  // A fresh screen per collection: its search, toggles and lock start over.
  return <CollectionScreen key={id} id={id} />;
}

function CollectionScreen({ id }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Opened from a header search result (spec 13): the lines it matched, flashed in the list.
  const hitIds = location.state?.hits;
  const hits = useMemo(() => (hitIds?.length ? { ids: hitIds, key: location.key } : null), [hitIds, location.key]);
  const { deviceId } = useDevice();
  const staff = useStaff();
  const user = staff.current;
  const { offline } = useConnection();
  const toast = useToast();
  const { values } = useSettings();
  const lock = useCollectionLock(id, { deviceId, userId: user?.id });
  const col = useCollection(id, { deviceId, onLockLost: lock.recheck });
  // 'offer' | 'paid' | 'reopen' | 'unlock' | 'takeover' | 'delete'
  const [asking, setAsking] = useState(null);
  const [unlockTo, setUnlockTo] = useState('priced');
  const seen = useRef(false);
  const deleting = useRef(false);   // our own delete: no "deleted on another computer"

  const buy = col.buy;
  const system = Boolean(buy?.system_key);   // Can't upload cards (export spec 9)
  const [exportStep, setExportStep] = useState(null);   // 'warn' | 'dialog' | 'pokemon'
  const back = () => navigate('/collections');

  // Deleted on another computer while open: say so and go back to the table.
  useEffect(() => {
    if (buy) seen.current = true;
    if (seen.current && col.missing && !deleting.current) {
      toast('This collection was deleted on another computer.', 'err');
      back();
    }
  }, [buy, col.missing]);

  // Rates (spec 8.9.1, 9.4): the Paid/Ours snapshot (kept while Completed),
  // else the collection's custom rates where set, else the Master Buy
  // Percentages.
  const master = { cash: Number(values.cash_pct), credit: Number(values.credit_pct) };
  const customCash = buy?.custom_cash_pct != null ? Number(buy.custom_cash_pct) : null;
  const customCredit = buy?.custom_credit_pct != null ? Number(buy.custom_credit_pct) : null;
  const closed = Boolean(buy) && isClosed(buy.status);
  const rates = closed && buy.cash_pct != null
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
  else if (system) locked = 'Cards arrive here from exports';
  // A project stays editable while Paid/Ours (owner, 2026-10-01).
  else if (buy.status === 'paid' && !buy.project) locked = 'Paid/Ours: unlock it to edit';
  else if (buy.status === 'completed') locked = 'Completed: reopen it to edit';
  // Cards can still be removed from a Paid/Ours collection, not a Completed
  // one (owner, 2026-09-29); adding and editing stay locked.
  const removeLocked = buy?.status === 'paid' && lock.status === 'held' ? null : locked;

  // What the export wrote (export spec 4.4, 5.5): its Custom SKU, for the details' chip.
  const skus = [...new Set(col.lines.map((l) => l.cc_custom_sku).filter(Boolean))];
  const exportedAt = col.lines.find((l) => l.cc_exported_at)?.cc_exported_at ?? null;

  /**
   * EXPORT (export spec 8.2). Paid/Ours: the export dialog for its Magic
   * cards, then Completed (only Pokémon cards: Completed with no file, after
   * asking). Completed: the same file again from the stamps. Processing or
   * Priced: blocked. Can't upload cards (9.3): a warning, then the dialog.
   */
  function startExport() {
    if (buy && !system && buy.status === 'completed') {
      const stamped = col.lines.filter((l) => l.cc_status === 'exported');
      if (!stamped.length) {
        toast(col.lines.some((l) => l.cc_status === 'cant_upload')
          ? "Nothing here could be uploaded: there's no file."
          : 'This collection was marked Completed before EXPORT did that: reopen it (back to Paid/Ours), then EXPORT.', 'err');
        return;
      }
      const rows = downloadMassCreate(stamped, `cc-mass-create-${fileSafe(buy.customer_name)}-${fileStamp(new Date(exportedAt))}.csv`);
      toast(`Downloaded the same file again: ${rows} row${rows === 1 ? '' : 's'}, Custom SKU ${skus.join(', ')}.`, 'ok');
      return;
    }
    if (buy && !system && buy.status !== 'paid') {
      toast('Mark it Paid/Ours first.', 'err');
      return;
    }
    if (!user) {
      staff.pulse();
      return;
    }
    if (offline) {
      toast('No connection: nothing can change until it comes back.', 'err');
      return;
    }
    if (viewOnly || lock.status !== 'held') {
      toast(viewOnly ? `${holderLabel} is editing this collection: take over to export.` : 'Checking who is editing this collection.', 'err');
      return;
    }
    const magic = col.lines.some((l) => l.game === 'mtg');
    if (system) {
      if (!magic) toast('No cards here to export.', 'err');
      else setExportStep('warn');
      return;
    }
    // Pokémon cards are left out entirely (owner, 2026-09-30).
    setExportStep(magic ? 'dialog' : 'pokemon');
  }

  async function exported(result) {
    setExportStep(null);
    const rows = `${result.rows} row${result.rows === 1 ? '' : 's'}`;
    const cards = `${result.cards} card${result.cards === 1 ? '' : 's'}`;
    if (system) {
      const stay = result.cant > 0 ? ` ${result.cant} still can't upload and stay here.` : '';
      toast(result.cards > 0
        ? `Exported ${cards} (${rows}), Custom SKU ${result.sku}: they've left this collection.${stay}`
        : 'Nothing matched: every card stays here.', 'ok');
    } else {
      const cant = result.cant > 0 ? ` ${result.cant} can't upload: copied to Can't upload cards.` : '';
      toast(result.cards > 0
        ? `Exported ${cards} (${rows}), Custom SKU ${result.sku}. Marked Completed.${cant}`
        : `Nothing matched, so there's no file. Marked Completed.${cant}`, 'ok');
    }
    await col.reload();
  }

  /** Only Pokémon cards: Completed with nothing exported (export spec 8.5). */
  async function completePokemonOnly() {
    try {
      await saveExport({
        target: { kind: 'collection', buy_id: buy.id, version: buy.version },
        matches: [],
        cant: [],
        setMaps: [],
        userId: user.id,
        deviceId,
      });
      toast('No Magic cards to export: marked Completed.', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
    setExportStep(null);
    await col.reload();
  }

  // The status can change while locked (that's how it unlocks), not while view-only.
  const canChangeStatus = Boolean(user) && !offline && lock.status === 'held' && Boolean(buy);
  let statusBlocked = null;
  if (!user) statusBlocked = 'Pick a user first';
  else if (offline) statusBlocked = 'No connection';
  else if (viewOnly) statusBlocked = 'View only: take over to change the status';
  else if (lock.status !== 'held') statusBlocked = 'Checking who is editing this collection';
  const deleteBlocked = viewOnly ? `${holderLabel} is editing this collection: take over first`
    : offline ? 'No connection' : null;

  /**
   * Status changes (spec 9.5): Priced asks for the offer, Paid/Ours for the
   * price paid, Completed and leaving a locked status ask first; only
   * Priced → Processing just happens.
   */
  function changeStatus(next) {
    if (!canChangeStatus || next === buy.status) return;
    if (next === 'priced' && buy.status === 'processing') setAsking('offer');
    else if (next === 'paid' && buy.status === 'completed') setAsking('reopen');
    else if (next === 'paid') setAsking('paid');
    else if (next === 'completed') return;   // only EXPORT completes it (owner, 2026-10-01)
    else if (closed) {
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
      removeLocked={removeLocked}
      // Highlighted in its kind's colour (owner, 2026-10-01): System, Projects or Collections.
      className={`collection-screen kind-${system ? 'system' : buy?.project ? 'project' : 'collection'}`}
      hits={hits}
      listTitle="Collection list"
      ratesTitle="Rates for this collection"
      searchBlocked={system ? "Cards arrive here from exports: they can't be added by hand" : null}
      // The export's code, labelled very clearly (export spec 4.4), in the list's heading (owner, 2026-10-01).
      listBadge={buy?.status === 'completed' && skus.length > 0 ? (
        <span className="sku-chip compact list-sku" title="The Custom SKU written on every row of this collection's Mass Create file">
          Custom SKU <strong>{skus.join(', ')}</strong>
        </span>
      ) : null}
      // Back to the table: big and bold, top left, before the search bar (owner, 2026-09-29).
      searchLead={(
        <button type="button" className="btn search-back" title="Back to Collections" onClick={back}>
          &lt; BACK
        </button>
      )}
      renderListDetails={(api) => (
        <>
          {buy ? (
            <CollectionDetails
              key={buy.id}
              buy={buy}
              byId={staff.byId}
              api={api}
              canChangeStatus={canChangeStatus}
              statusBlocked={statusBlocked}
              deleteBlocked={deleteBlocked}
              viewOnly={viewOnly}
              holder={{ label: holderLabel, user: holderUser, since: lock.holder?.since }}
              onTakeOver={() => setAsking('takeover')}
              onUnlock={() => {
                setUnlockTo('priced');
                setAsking('unlock');
              }}
              onReopen={() => setAsking('reopen')}
              onInfo={(fields) => col.updateInfo(fields, user?.id)}
              onStatus={changeStatus}
              onDelete={() => setAsking('delete')}
            />
          ) : (
            <div className="col-details">
              <div className="cd-head">
                <span className="muted-text">Loading…</span>
              </div>
            </div>
          )}

          {asking === 'offer' && (
            <OfferModal
              market={marketTotal(col.lines)}
              rates={rates}
              current={buy.offer_cash}
              busy={col.busy}
              onClose={() => {
                setAsking(null);
                api.focusSearch();
              }}
              onSave={async ({ cash, credit }) => {
                if (await col.setStatus('priced', user?.id, master, { offerCash: cash, offerCredit: credit })) {
                  setAsking(null);
                  api.focusSearch();
                }
              }}
            />
          )}
          {asking === 'paid' && (
            <PaidModal
              market={marketTotal(col.lines)}
              rates={rates}
              offer={{
                cash: buy.status === 'processing' ? null : buy.offer_cash,
                credit: buy.status === 'processing' ? null : buy.offer_credit,
              }}
              busy={col.busy}
              onClose={() => {
                setAsking(null);
                api.focusSearch();
              }}
              onSave={async ({ price, method }) => {
                if (await col.setStatus('paid', user?.id, master, { paidPrice: price, paidMethod: method })) {
                  setAsking(null);
                  api.focusSearch();
                }
              }}
            />
          )}
          {asking === 'reopen' && (
            <ConfirmModal
              title="Reopen this collection?"
              yes="Reopen"
              onClose={() => setAsking(null)}
              onYes={async () => {
                setAsking(null);
                await col.setStatus('paid', user?.id, master);
                api.focusSearch();
              }}
            >
              <p>It will go back to Paid/Ours, still locked, with the price paid kept.</p>
              {col.lines.some((l) => l.cc_status) && (
                <p>
                  Its export is undone: the Sell Prices go (the buy prices show again), and any cards copied to
                  Can't upload cards come back out. The downloaded file isn't undone: if it was uploaded to Crystal
                  Commerce, fix the stock there by hand.
                </p>
              )}
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
              <p>
                It will go back to {statusLabel(unlockTo)} and can be edited. The price paid is cleared
                {unlockTo === 'priced' ? '; the offer stays' : ''}.
              </p>
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
          <ExportButton onClick={startExport} />
          {exportStep === 'pokemon' && (
            <Modal
              title="No Magic cards to export"
              onClose={() => setExportStep(null)}
              footer={(
                <>
                  <button type="button" className="btn ghost" onClick={() => setExportStep(null)}>Cancel</button>
                  <button type="button" className="btn primary" autoFocus onClick={completePokemonOnly}>Mark Completed</button>
                </>
              )}
            >
              <p>
                This collection only has Pokémon cards, which can't be exported yet. Exporting it just marks it
                <strong> Completed</strong>, with no file.
              </p>
            </Modal>
          )}
          {exportStep === 'dialog' && !system && (
            <ExportDialog
              mode="export"
              title={`Export ${buy.customer_name} to Crystal Commerce`}
              items={col.lines.filter((l) => l.game === 'mtg').map((line) => ({ line, where: '' }))}
              target={{ kind: 'collection', buy_id: buy.id, version: buy.version }}
              fileName={`cc-mass-create-${fileSafe(buy.customer_name)}-${fileStamp(new Date())}.csv`}
              onExported={exported}
              onClose={() => {
                setExportStep(null);
                col.reload();
                focusSearch();
              }}
            />
          )}
          {exportStep === 'warn' && (
            <Modal
              title="Export Can't upload cards?"
              onClose={() => setExportStep(null)}
              footer={(
                <>
                  <button type="button" className="btn ghost" onClick={() => setExportStep(null)}>Cancel</button>
                  <button type="button" className="btn primary" autoFocus onClick={() => setExportStep('dialog')}>Try anyway</button>
                </>
              )}
            >
              <p>
                These cards couldn't be matched before. Exporting them again is unlikely to work, unless the Master
                Crystal Inventory has changed or you can pick their products by hand.
              </p>
            </Modal>
          )}
          {exportStep === 'dialog' && system && (
            <ExportDialog
              mode="export"
              pullOut={false}
              title="Export Can't upload cards to Crystal Commerce"
              items={col.lines.filter((l) => l.game === 'mtg').map((line) => ({ line, where: line.source_note ?? '' }))}
              target={{ kind: 'cant_upload', version: buy.version }}
              fileName={`cc-mass-create-cant-upload-${fileStamp(new Date())}.csv`}
              onExported={exported}
              onClose={() => {
                setExportStep(null);
                col.reload();
                focusSearch();
              }}
            />
          )}
        </div>
      )}
    />
  );
}
