import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../components/Modal.jsx';
import ImportDialog from './collections/ImportDialog.jsx';
import ExportDialog from './export/ExportDialog.jsx';
import { useAuditPrint } from './export/useAuditPrint.js';
import RepriceModal from './collections/RepriceModal.jsx';
import { formatMoney } from '../lib/money.js';
import { fileStamp } from '../lib/time.js';
import { fileSafe } from '../lib/massCreate.js';
import { downloadMassCreate, saveExport } from '../lib/ccExport.js';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PricingScreen from './price/PricingScreen.jsx';
import CollectionDetails from './collections/CollectionDetails.jsx';
import { collectionRates, isClosed, statusLabel } from './collections/status.js';
import { tiersFrom } from '../lib/rates.js';
import { isStruck, movesOn } from '../lib/struck.js';
import { ConfirmModal, ConvertToBuyModal, DeleteCollectionModal, RejectModal } from './collections/CollectionModals.jsx';
import { OfferModal, PaidModal } from './collections/DealModals.jsx';
import { useCollection } from './collections/useCollection.js';
import { useCollectionLock } from './collections/useCollectionLock.js';
import ExportButton from '../components/ExportButton.jsx';
import { useSettings } from '../state/settings.jsx';
import { useDevice } from '../state/device.jsx';
import { useStaff } from '../state/staff.jsx';
import { useConnection } from '../state/connection.jsx';
import { useToast } from '../components/Toast.jsx';
import { firstReason } from '../lib/blocked.js';

// A collection's pricing screen (spec 9.4): the Price tab's screen with the
// collection's list in the sidebar and its details at the sidebar's foot,
// above the totals (owner, 2026-09-29). Every add and remove saves at once
// and is logged; there's no CONFIRM BUY, only EXPORT. One computer edits at
// a time (9.6); Paid/Ours, Completed and Rejected lock it (9.5). Marking it
// Priced records the offer, Paid/Ours the price paid (owner, 2026-09-29),
// Rejected an optional reason (owner, 2026-10-09).
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
  // Print? (docs/TEAM_FEEDBACK.md 3): the audit printout, changing nothing.
  const { print, printing } = useAuditPrint();
  const { values } = useSettings();
  const lock = useCollectionLock(id, { deviceId, userId: user?.id });
  const col = useCollection(id, { deviceId, onLockLost: lock.recheck });
  // 'offer' | 'paid' | 'reopen' | 'unlock' | 'reject' | 'unreject' | 'takeover' | 'delete' | 'convert'
  const [asking, setAsking] = useState(null);
  const [unlockTo, setUnlockTo] = useState('priced');
  const seen = useRef(false);
  const deleting = useRef(false);   // our own delete: no "deleted on another computer"

  const buy = col.buy;
  const system = Boolean(buy?.system_key);   // Can't upload cards (export spec 9)
  const [exportStep, setExportStep] = useState(null);   // 'warn' | 'dialog' | 'pokemon'
  const [repricing, setRepricing] = useState(false);    // REPRICE? (owner, 2026-10-01)
  const [dragging, setDragging] = useState(false);      // a file held over the window
  const [dropped, setDropped] = useState(null);         // the CSV dropped, while its import dialog is open
  const back = () => navigate('/collections');

  // Deleted on another computer while open: say so and go back to the table.
  useEffect(() => {
    if (buy) seen.current = true;
    if (seen.current && col.missing && !deleting.current) {
      toast('This collection was deleted on another computer.', 'err');
      back();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the collection loads or goes; back and toast don't change what it does
  }, [buy, col.missing]);

  // Rates (spec 8.9.1, 9.4): the Paid/Ours snapshot (kept while Completed),
  // or Rejected's (migration 0044), else the collection's custom rates where
  // set, else the Master Buy Percentages.
  const master = { cash: Number(values.cash_pct), credit: Number(values.credit_pct), tiers: tiersFrom(values.rate_tiers) };
  const closed = Boolean(buy) && isClosed(buy.status);
  const rates = collectionRates(buy, master);

  const holderUser = lock.holder ? staff.byId(lock.holder.userId) : null;
  const holderLabel = lock.holder?.label ?? 'another computer';
  const viewOnly = lock.status === 'other';

  // Why a button can't be used now, as [when, why] in order (lib/blocked.js);
  // these two start several of the lists below.
  const NO_USER = [!user, 'Pick a user first'];
  const NO_CONNECTION = [offline, 'No connection'];

  // Why nothing in the list can change here (spec 9.5, 9.6), or null.
  const locked = firstReason([
    [!buy, 'Loading the collection'],
    [lock.status === 'checking', 'Checking who is editing this collection'],
    [viewOnly, `View only: ${holderLabel} is editing this collection. Take over to edit`],
    [system, 'Cards arrive here from exports'],
    // A project stays editable while Paid/Ours (owner, 2026-10-01).
    [buy?.status === 'paid' && !buy.project, 'Paid/Ours: unlock it to edit'],
    [buy?.status === 'completed', 'Completed: reopen it to edit'],
    [buy?.status === 'rejected', 'Rejected: reopen it to edit'],
  ]);
  // Cards can still be removed from a Paid/Ours collection, not a Completed
  // one (owner, 2026-09-29); adding and editing stay locked.
  const removeLocked = buy?.status === 'paid' && lock.status === 'held' ? null : locked;

  // REPRICE? works where cards could be edited anyway (a project, Processing,
  // Priced), and on Can't upload cards beside its own EXPORT (owner,
  // 2026-10-01): why not now, or null.
  const repriceBlocked = firstReason([
    NO_USER,
    NO_CONNECTION,
    [viewOnly, `View only: ${holderLabel} is editing this collection. Take over to reprice`],
    [lock.status !== 'held', 'Checking who is editing this collection'],
    [locked && !system, locked],
    [!col.lines.some((l) => !isStruck(l)), 'No cards to reprice'],
  ]);

  // A CSV dropped on an empty collection or project imports into it (owner,
  // 2026-10-09; Import Collection's dialog): only one with no cards at all,
  // that this computer can edit. Why not here, or null.
  const importBlocked = firstReason([
    NO_USER,
    NO_CONNECTION,
    [system, "Can't upload cards only takes cards from exports"],
    [locked, locked],
    [!col.loaded, 'Loading the collection'],
    [col.lines.length, 'It already has cards: a file only goes into an empty collection or project'],
  ]);

  useEffect(() => {
    const files = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    let depth = 0;   // dragenter / dragleave fire for every element crossed
    const enter = (e) => {
      if (!files(e)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const over = (e) => {
      if (files(e)) e.preventDefault();   // never let the browser open the file instead
    };
    const leave = (e) => {
      if (!files(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e) => {
      if (!files(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (importBlocked) toast(`${importBlocked}.`, 'err');
      else if (!/\.csv$/i.test(file.name)) toast('Drop a .csv file: a Mass Create file, as Import Collection takes.', 'err');
      else setDropped(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [importBlocked, toast]);

  async function reprice(updates, counts) {
    const result = await col.reprice(updates, user.id);
    if (!result) return false;
    const bits = [`${counts.changed} price${counts.changed === 1 ? '' : 's'} changed`];
    if (counts.manual) bits.push(`${counts.manual} manual kept`);
    if (counts.noPrice) bits.push(`${counts.noPrice} with no price today kept`);
    toast(`Repriced: ${bits.join(', ')}. Market ${formatMoney(Number(result.before))} → ${formatMoney(Number(result.after))}.`, 'ok');
    return true;
  }

  // What the export wrote (export spec 4.4, 5.5): its Custom SKU, for the details' chip.
  const skus = [...new Set(col.lines.map((l) => l.cc_custom_sku).filter(Boolean))];
  const exportedAt = col.lines.find((l) => l.cc_exported_at)?.cc_exported_at ?? null;

  /**
   * EXPORT (export spec 8.2). Paid/Ours: the export dialog for its Magic
   * cards, then Completed (only Pokémon cards: Completed with no file, after
   * asking). Completed: the same file again from the stamps. Processing,
   * Priced or Rejected (team feedback, 2026-10-16: export "should always" be
   * allowed; the owner: "File only, change nothing"): the dialog, which only
   * downloads the file, saving nothing. Can't upload cards (9.3): a warning,
   * then the dialog.
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
      const rows = downloadMassCreate(stamped, `cc-mass-create-${fileSafe(buy.customer_name)}-${fileStamp(new Date(exportedAt))}.csv`,
        values.fallback_pct_mtg);
      toast(`Downloaded the same file again: ${rows} row${rows === 1 ? '' : 's'}, Custom SKU ${skus.join(', ')}.`, 'ok');
      return;
    }
    if (buy && !system && buy.status !== 'paid') {
      // The file only: nothing's saved, so no user or edit lock is needed.
      if (offline) {
        toast('No connection: the export needs it to match Crystal Commerce products.', 'err');
        return;
      }
      if (!col.lines.some((l) => l.game === 'mtg' && movesOn(l))) toast('No Magic cards here to export.', 'err');
      else setExportStep('file');
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
    // Bulk and struck cards are never exported (lib/struck.js).
    const magic = col.lines.some((l) => l.game === 'mtg' && movesOn(l));
    if (system) {
      if (!magic) toast('No cards here to export.', 'err');
      else setExportStep('warn');
      return;
    }
    // Pokémon cards are left out entirely (owner, 2026-09-30).
    setExportStep(magic ? 'dialog' : 'pokemon');
  }

  // Why Print can't run now (its ⋯ shows it; printCollection says it too). Any status (team
  // feedback, 2026-10-16: printing "should always" be allowed, in every state).
  const printBlockedWhy = firstReason([
    NO_CONNECTION,
    [printing, 'Printing…'],
    [!col.lines.some((l) => l.game === 'mtg' && movesOn(l)), 'No Magic cards here'],
  ]);

  /**
   * EXPORT ▾ → Print? (docs/TEAM_FEEDBACK.md 3.1): its Magic cards by Crystal
   * Commerce category; once Completed, what it exported. In any status (team
   * feedback, 2026-10-16), and it needs no user or edit lock: it changes nothing.
   */
  function printCollection() {
    if (offline) {
      toast('No connection: printing needs it to find the Crystal Commerce categories.', 'err');
      return;
    }
    const name = system ? "Can't upload cards" : buy.customer_name;
    print({ lines: col.lines, title: `Audit — ${name}`, fileName: `audit-${fileSafe(name)}.pdf` });
  }

  async function exported(result) {
    setExportStep(null);
    if (result.fileOnly) {
      toast(result.rows > 0
        ? `Downloaded the file: ${result.rows} row${result.rows === 1 ? '' : 's'}, Custom SKU ${result.sku}. Nothing was saved: it stays ${statusLabel(buy.status)}.`
        : 'Nothing matched, so there was no file. Nothing was saved.', 'ok');
      return;
    }
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
  const statusBlocked = firstReason([
    NO_USER,
    NO_CONNECTION,
    [viewOnly, 'View only: take over to change the status'],
    [lock.status !== 'held', 'Checking who is editing this collection'],
  ]);
  // Who's editing comes first here: deleting needs this computer to hold it.
  const deleteBlocked = firstReason([
    [viewOnly, `${holderLabel} is editing this collection: take over first`],
    NO_CONNECTION,
  ]);
  // Convert to buy… (owner, 2026-10-10): a project's cards, none exported yet.
  const convertBlocked = firstReason([
    NO_CONNECTION,
    [viewOnly, `${holderLabel} is editing this project: take over first`],
    [lock.status !== 'held', 'Checking who is editing this project'],
    [buy?.status === 'completed', "Completed: its cards were exported, so it can't become a buy"],
    [!col.lines.length, 'No cards to convert'],
  ]);

  /**
   * Status changes (spec 9.5): Priced asks for the offer, Paid/Ours for the
   * price paid, Rejected for an optional reason, Completed and leaving a
   * locked status ask first; only Priced → Processing just happens.
   */
  function changeStatus(next) {
    if (!canChangeStatus || next === buy.status) return;
    if (next === 'rejected') {
      if (buy.status === 'processing' || buy.status === 'priced') setAsking('reject');
    } else if (buy.status === 'rejected') {
      // Reopened (owner, 2026-10-09): to Priced, its offer kept, or Processing.
      if (next !== 'processing' && next !== 'priced') return;
      setUnlockTo(next);
      setAsking('unreject');
    } else if (next === 'priced' && buy.status === 'processing') setAsking('offer');
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
    // Struck cards (owner, 2026-10-16): a Paid/Ours collection's × strikes
    // first; not a project's or Can't upload cards' (× removes at once).
    // Restore wherever a struck card could be removed.
    strike: buy?.status === 'paid' && !system && !buy?.project ? col.strike : null,
    restore: col.restore,
    // A project has no rate controls (owner, 2026-10-15): it's the store's own cards.
    setRates: buy?.project ? null : col.setRates,
    setLineRate: buy?.project ? null : col.setLineRate,
  };

  if (col.loaded && col.missing && !seen.current && !deleting.current) {
    return (
      <div className="col-missing">
        <p className="empty">This collection doesn't exist. It may have been deleted.</p>
        <button type="button" className="btn" onClick={back}>‹ Back to Collections</button>
      </div>
    );
  }

  return (
    <PricingScreen
      list={list}
      rates={rates}
      master={master}
      locked={locked}
      removeLocked={removeLocked}
      // Highlighted in its kind's colour (owner, 2026-10-01): System, Projects or Collections.
      className={`collection-screen kind-${system ? 'system' : buy?.project ? 'project' : 'collection'}`}
      // A project's prices round up, like an export (owner, 2026-10-10).
      roundUp={Boolean(buy?.project)}
      hits={hits}
      listTitle="Collection list"
      ratesTitle="Rates for this collection"
      // A phone can scan into it (docs/SCAN_FUNCTION.md), but not into Can't upload cards.
      scanTarget={buy && !system ? { kind: 'collection', buyId: buy.id, name: buy.customer_name ?? '' } : null}
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
              onUnreject={() => {
                setUnlockTo(buy.offer_cash != null ? 'priced' : 'processing');
                setAsking('unreject');
              }}
              onInfo={(fields) => col.updateInfo(fields, user?.id)}
              onStatus={changeStatus}
              onDelete={() => setAsking('delete')}
              convertBlocked={convertBlocked}
              onConvert={() => setAsking('convert')}
              onPrint={printCollection}
              printBlocked={printBlockedWhy}
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
              lines={col.lines}
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
              lines={col.lines}
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
              // The customer said no after all (owner, 2026-10-09): the Reject dialog instead.
              onReject={buy.status === 'processing' || buy.status === 'priced' ? () => setAsking('reject') : null}
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
          {asking === 'reject' && (
            <RejectModal
              busy={col.busy}
              onClose={() => {
                setAsking(null);
                api.focusSearch();
              }}
              onReject={async (reason) => {
                if (await col.setStatus('rejected', user?.id, master, { reason })) {
                  setAsking(null);
                  api.focusSearch();
                }
              }}
            />
          )}
          {asking === 'unreject' && (
            <ConfirmModal
              title="Reopen this collection?"
              yes="Reopen"
              onClose={() => setAsking(null)}
              onYes={async () => {
                setAsking(null);
                await col.setStatus(unlockTo, user?.id, master);
                api.focusSearch();
              }}
            >
              <p>
                It will go back to {statusLabel(unlockTo)} and can be edited
                {unlockTo === 'priced' ? ', its offer kept' : ''}. The reason stays in the Changelog.
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
          {dragging && createPortal(
            <div className={`drop-overlay${importBlocked ? ' blocked' : ''}`} aria-hidden="true">
              <div className="drop-card">
                {importBlocked ? (
                  <>
                    <strong>Can't import here</strong>
                    <span>{importBlocked}.</span>
                  </>
                ) : (
                  <>
                    <strong>Drop the CSV to import it</strong>
                    <span>Into {buy?.customer_name}, matched card by card, as Import Collection does.</span>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )}
          {dropped && buy && (
            <ImportDialog
              file={dropped}
              target={{ kind: 'into', buyId: buy.id, version: buy.version, name: buy.customer_name }}
              onDone={async () => {
                setDropped(null);
                await col.reload();
                api.focusSearch();
              }}
              onClose={() => setDropped(null)}
            />
          )}
          {asking === 'convert' && buy && (
            <ConvertToBuyModal
              buy={buy}
              lines={col.lines}
              rates={rates}
              user={user}
              busy={col.busy}
              onClose={() => {
                setAsking(null);
                api.focusSearch();
              }}
              onConvert={async (deal) => {
                if (!user) {
                  staff.pulse();
                  return;
                }
                deleting.current = true;
                const made = await col.toBuy(deal, rates, user.id);
                if (!made) {
                  deleting.current = false;
                  return;
                }
                setAsking(null);
                toast(`${buy.customer_name} is now Buy ${made.number} on today's page.${made.flagged ? ' 🚩 Flagged: check its condition before export.' : ''}`, 'ok');
                navigate(`/calendar/${made.games?.[0] ?? 'mtg'}/${made.day}`);
              }}
            />
          )}
          {asking === 'delete' && buy && (
            <DeleteCollectionModal
              name={buy.customer_name}
              project={Boolean(buy.project)}
              lines={col.lines}
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
          {/* REPRICE?: today's buy prices for every card (owner, 2026-10-01); smaller, beside
              EXPORT, Can't upload cards' included. */}
          <button
            type="button"
            className={`btn reprice-btn${repriceBlocked ? ' is-disabled' : ''}`}
            aria-disabled={repriceBlocked ? true : undefined}
            title={repriceBlocked ?? 'Bring every card’s buy price up to today’s prices'}
            onClick={() => {
              if (!user) staff.pulse();
              else if (repriceBlocked) toast(`${repriceBlocked}.`, 'err');
              else setRepricing(true);
            }}
          >
            REPRICE?
          </button>
          <ExportButton onClick={startExport} onPrint={printCollection} printing={printing} up />
          {repricing && (
            <RepriceModal
              lines={col.lines}
              roundUp={Boolean(buy?.project)}
              onReprice={reprice}
              onClose={() => {
                setRepricing(false);
                focusSearch();
              }}
            />
          )}
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
                This collection has no Magic cards to export: Pokémon cards can't be exported yet, and bulk and
                struck cards never are. Exporting it just marks it <strong>Completed</strong>, with no file.
              </p>
            </Modal>
          )}
          {exportStep === 'dialog' && !system && (
            <ExportDialog
              mode="export"
              title={`Export ${buy.customer_name} to Crystal Commerce`}
              items={col.lines.filter((l) => l.game === 'mtg' && movesOn(l)).map((line) => ({ line, where: '' }))}
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
          {exportStep === 'file' && !system && (
            <ExportDialog
              mode="export"
              fileOnly={statusLabel(buy.status)}
              title={`Export ${buy.customer_name} to Crystal Commerce (file only)`}
              items={col.lines.filter((l) => l.game === 'mtg' && movesOn(l)).map((line) => ({ line, where: '' }))}
              target={{ kind: 'collection', buy_id: buy.id, version: buy.version }}
              fileName={`cc-mass-create-${fileSafe(buy.customer_name)}-${fileStamp(new Date())}.csv`}
              onExported={exported}
              onClose={() => {
                setExportStep(null);
                focusSearch();
              }}
            />
          )}
          {exportStep === 'dialog' && system && (
            <ExportDialog
              mode="export"
              pullOut={false}
              title="Export Can't upload cards to Crystal Commerce"
              items={col.lines.filter((l) => l.game === 'mtg' && movesOn(l)).map((line) => ({ line, where: line.source_note ?? '' }))}
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
