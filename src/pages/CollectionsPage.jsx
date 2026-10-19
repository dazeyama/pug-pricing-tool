import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { allPages } from '../lib/inChunks.js';
import { useLiveTable } from '../lib/useLiveTable.js';
import { nameKey } from '../lib/normalize.js';
import { formatPhone } from '../lib/phone.js';
import { formatRecent, formatShortDate } from '../lib/time.js';
import { withLoading } from '../lib/loading.js';
import GuardButton from '../components/GuardButton.jsx';
import UserTag from '../components/UserTag.jsx';
import CardCountsName from '../components/CardCountsName.jsx';
import { NewCollectionModal, NewProjectModal } from './collections/CollectionModals.jsx';
import ImportDialog from './collections/ImportDialog.jsx';
import RowAction from './collections/RowAction.jsx';
import MoreMenu from '../components/MoreMenu.jsx';
import { useConnection } from '../state/connection.jsx';
import { FILTERS, isClosed, statusText, statusTone } from './collections/status.js';
import { OfferText, PaidText } from './collections/CollectionDetails.jsx';
import { errorMessage } from './collections/useCollection.js';
import { useDevice } from '../state/device.jsx';
import { useStaff } from '../state/staff.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuditPrint } from './export/useAuditPrint.js';
import { fileSafe } from '../lib/massCreate.js';

const STALE_MS = 60_000;   // a lock without a heartbeat for 60s is stale (spec 9.6)
const STATUS_ORDER = { processing: 0, priced: 1, paid: 2, completed: 3, rejected: 4 };

// The table's columns (spec 9.1), in order: the value each sorts by and its
// cell. Offer and Paid come last, after Notes, Paid the very last (owner,
// 2026-09-29), then the ⋯ menu (owner, 2026-10-11). `by` looks up a staff
// user (Last edited by); `elsewhere` is where a row is open on another
// computer ("Front Counter (Dana)"); `menu` is a row's ⋯ items. An offer or
// price not set yet (TBD) sorts as -1.
const columns = (by, menu) => [
  {
    key: 'name',
    label: 'Name',
    value: (c) => nameKey(c.customer_name),
    cell: (c, elsewhere) => (
      <td key="name" className="col-name">
        {/* Pointing at the name shows its cards by game (decision 276). */}
        <CardCountsName lines={c.buy_lines}>{c.customer_name}</CardCountsName>
        {elsewhere && <span className="lock-line">✎ open on {elsewhere}</span>}
      </td>
    ),
  },
  {
    key: 'phone', label: 'Phone', value: (c) => c.phone,
    cell: (c) => (
      <td key="phone" className="col-phone">
        {/* It has no phone: its System chip sits here, where there's room (owner, 2026-10-01). */}
        {c.system_key
          ? <span className="system-chip" title="Made by the app: holds the cards exports couldn't upload">System</span>
          : c.project
            ? <span className="project-chip" title="The store's own cards, priced for an export">Project</span>
            : formatPhone(c.phone)}
      </td>
    ),
  },
  {
    key: 'status', label: 'Status', value: (c) => STATUS_ORDER[c.status],
    cell: (c) => <td key="status"><span className={`status-chip ${statusTone(c)}`}>{statusText(c)}</span></td>,
  },
  {
    key: 'created', label: 'Created', value: (c) => c.created_at,
    cell: (c) => <td key="created" className="col-date">{formatShortDate(c.created_at)}</td>,
  },
  {
    key: 'edited', label: 'Last edited', value: (c) => c.updated_at,
    cell: (c) => <td key="edited" className="col-date">{formatRecent(c.updated_at)}</td>,
  },
  {
    key: 'editor',
    label: 'Last edited by',
    value: (c) => nameKey(by(c.last_edited_by)?.name ?? ''),
    cell: (c) => <td key="editor" className="col-editor"><UserTag user={by(c.last_edited_by)} /></td>,
  },
  {
    key: 'notes', label: 'Notes', value: (c) => nameKey(c.notes),
    cell: (c) => <td key="notes" className="col-notes" title={c.notes || undefined}>{c.notes}</td>,
  },
  {
    key: 'offer',
    label: 'Offer',
    value: (c) => (c.status === 'processing' || c.offer_cash == null ? -1 : Number(c.offer_cash)),
    cell: (c) => <td key="offer" className="col-money">{c.system_key || c.project ? '—' : <OfferText buy={c} />}</td>,
  },
  {
    key: 'paid',
    label: 'Paid',
    value: (c) => {
      if (c.status === 'rejected') return 0;   // $0 (owner, 2026-10-09)
      return isClosed(c.status) && c.paid_price != null ? Number(c.paid_price) : -1;
    },
    cell: (c) => <td key="paid" className="col-money">{c.system_key || c.project ? '—' : <PaidText buy={c} />}</td>,
  },
  {
    // The menu a collection's details have (Delete collection…, a project's
    // Convert to buy…), without opening it. Can't upload cards has none.
    key: 'more',
    label: '',
    sortable: false,
    value: () => 0,
    cell: (c, elsewhere) => (
      // Its clicks and keys stay here: the row itself opens the collection.
      <td key="more" className="col-more" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
        if (e.key === 'Enter') e.stopPropagation();
      }}>
        {!c.system_key && <MoreMenu float items={menu(c, elsewhere)} />}
      </td>
    ),
  },
];

/**
 * The Collections tab (spec 9.1): every collection, live, in three tables
 * (owner, 2026-10-01): Collections (+ Price Collection, with the status
 * filter), Projects (the store's own cards, + Start Project) and System
 * (Can't upload cards), in that order since 2026-10-14 (owner). One
 * name/phone search and one sort for all three, and a line on the ones open
 * on another computer.
 */
export default function CollectionsPage() {
  const navigate = useNavigate();
  const { deviceId } = useDevice();
  const staff = useStaff();
  const toast = useToast();
  const { offline } = useConnection();
  // Print project / Print collection from a row's ⋯ (owner, 2026-10-14).
  const { print, printing } = useAuditPrint();
  // A row's ⋯ action, while its dialog is open: { id, action: 'delete' | 'convert' }.
  const [acting, setActing] = useState(null);
  // Every page (decision 365): the API returns at most 1,000 rows a request, and the store keeps
  // every collection ever made.
  const { data, loaded } = useLiveTable('buys', () => allPages((a, b) => supabase
    .from('buys')
    .select('id, customer_name, phone, status, notes, created_at, updated_at, last_edited_by, '
      + 'offer_cash, offer_credit, paid_price, paid_method, system_key, project, '
      // Its cards, counted by game for the name's chip (decision 276).
      + 'buy_lines(game, quantity, bulk_kind, struck_at)')
    .eq('kind', 'collection')
    .order('created_at').order('id').range(a, b)));
  const locks = useLiveTable('collection_locks', () => supabase
    .from('collection_locks')
    .select('buy_id, device_id, staff_user_id, heartbeat_at, devices(label)'));
  // Newest collections first by default (owner, 2026-09-29).
  const [sort, setSort] = useState({ key: 'created', dir: 'desc' });
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const location = useLocation();
  // Home's + Start Project / + Price Collection arrive with the window to open.
  const [creating, setCreating] = useState(() => {
    const want = location.state?.create;
    return want === 'project' || want === 'collection' ? want : null;
  });
  const [busy, setBusy] = useState(false);
  // Import Collection (owner, 2026-10-09): the CSV picked, while its dialog is open.
  const [importing, setImporting] = useState(null);
  const filePicker = useRef(null);

  // Locks go stale without an event, so look again now and then.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const all = data ?? [];

  /** A row's ⋯ items, blocked as they are on its own screen (owner, 2026-10-11). */
  const menu = (c, elsewhere) => {
    const busy = offline ? 'No connection' : elsewhere ? `${elsewhere} is editing it: open it and take over first` : null;
    const what = c.project ? 'project' : 'collection';
    return [
      // Print (owner, 2026-10-14; docs/TEAM_FEEDBACK.md 3), as on its screen: its cards
      // fetched once the printout's tab is open. Reading only, so another computer editing it doesn't matter.
      // In any status, as on its screen (team feedback, 2026-10-16: printing "should always" be allowed).
      {
        label: c.project ? 'Print project' : 'Print collection',
        needsUser: false,
        blocked: offline ? 'No connection' : printing ? 'Printing…' : null,
        title: `A PDF of this ${what}'s Magic cards by Crystal Commerce category, to check them by hand. Changes nothing.`,
        onClick: () => print({
          load: async () => {
            const { data: rows, error } = await allPages((a, b) => supabase.from('buy_lines').select('*')
              .eq('buy_id', c.id).order('position').order('id').range(a, b));   // over 1,000 cards too (decision 365)
            if (error) throw new Error(error.message);
            return rows ?? [];
          },
          title: `Audit — ${c.customer_name}`,
          fileName: `audit-${fileSafe(c.customer_name)}.pdf`,
        }),
      },
      ...(c.project ? [{
        label: 'Convert to buy',
        blocked: busy ?? (c.status === 'completed' ? 'Completed: open it and reopen it (back to Paid/Ours) first' : null),
        title: "Move every card into a new buy on today's page, confirmed now, and delete the project",
        onClick: () => setActing({ id: c.id, action: 'convert' }),
      }] : []),
      {
        label: c.project ? 'Delete project…' : 'Delete collection…',
        danger: true,
        blocked: busy,
        title: `Delete this ${c.project ? 'project' : 'collection'} and every card in it`,
        onClick: () => setActing({ id: c.id, action: 'delete' }),
      },
    ];
  };
  const COLUMNS = columns(staff.byId, menu);
  const kindOf = (c) => (c.system_key ? 'system' : c.project ? 'project' : 'collection');
  const tables = useMemo(() => {
    const words = nameKey(query);
    const digits = query.replace(/\D/g, '');
    const column = COLUMNS.find((c) => c.key === sort.key);
    const filter = FILTERS.find((f) => f.value === status) ?? FILTERS[0];
    const dir = sort.dir === 'asc' ? 1 : -1;
    const rows = all
      .filter((c) => !words
        || nameKey(c.customer_name).includes(words)
        || (digits && c.phone?.includes(digits)))
      .sort((a, b) => {
        const x = column.value(a) ?? '';
        const y = column.value(b) ?? '';
        return (x < y ? -1 : x > y ? 1 : 0) * dir || (b.updated_at < a.updated_at ? -1 : 1);
      });
    return {
      system: rows.filter((c) => kindOf(c) === 'system'),
      project: rows.filter((c) => kindOf(c) === 'project'),
      // The status filter is the customer collections' own.
      collection: rows.filter((c) => kindOf(c) === 'collection' && filter.match(c)),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- COLUMNS is rebuilt each render from staff.byId (listed) and menu, whose handlers the sort doesn't read
  }, [all, status, query, sort, staff.byId]);
  const totals = {
    system: all.filter((c) => kindOf(c) === 'system').length,
    project: all.filter((c) => kindOf(c) === 'project').length,
    collection: all.filter((c) => kindOf(c) === 'collection').length,
  };

  /** Open on another computer: where, "Front Counter (Dana)", or null. */
  function openElsewhere(id) {
    const lock = (locks.data ?? []).find((l) => l.buy_id === id);
    if (!lock || lock.device_id === deviceId) return null;
    if (now - new Date(lock.heartbeat_at).getTime() > STALE_MS) return null;
    const who = staff.byId(lock.staff_user_id)?.name;
    return `${lock.devices?.label ?? 'another computer'}${who ? ` (${who})` : ''}`;
  }

  function sortBy(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  /** + Price Collection, or + Start Project (just a name and notes). */
  async function create({ name, phone, idLast4, notes }) {
    const project = creating === 'project';
    setBusy(true);
    const { data: id, error } = await withLoading(() => (project
      ? supabase.rpc('project_create', {
        p_name: name,
        p_notes: notes,
        p_user: staff.current?.id ?? null,
        p_device: deviceId,
      })
      : supabase.rpc('collection_create', {
        p_name: name,
        p_phone: phone || null,   // none: Ctrl+click Create (migration 0045)
        p_notes: notes,
        p_user: staff.current?.id ?? null,
        p_device: deviceId,
        p_id_last4: idLast4 || null,
      })));
    setBusy(false);
    if (error) {
      toast(errorMessage(error, project ? "Couldn't start the project" : "Couldn't create the collection"), 'err');
      return;
    }
    setCreating(null);
    navigate(`/collections/${id}`);
  }

  /** One of the three tables: its heading (name, count), then the table. */
  const section = (kind, title, { filters = false, empty, noMatch }) => {
    const rows = tables[kind];
    return (
      <section className={`col-section ${kind}`} aria-label={title}>
        <div className="col-section-head">
          <h3>{title}</h3>
          <span className="count-badge">{totals[kind]}</span>
        </div>
        {filters && (
          <div className="status-filter" role="group" aria-label="Status">
            {FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`filter-pill tone-${s.value}${status === s.value ? ' active' : ''}`}
                aria-pressed={status === s.value}
                onClick={() => setStatus(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        {/* Always drawn, headings too, so nothing moves when it's empty (owner,
            2026-09-29); the three share column widths so they line up. */}
        <table className="col-table">
          <colgroup>
            {COLUMNS.map((c) => <col key={c.key} className={`col-w-${c.key}`} />)}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c) => (c.sortable === false ? <th key={c.key} className={`col-${c.key}`} aria-label="More" /> : (
                <th
                  key={c.key}
                  className={`col-${c.key}`}
                  aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button type="button" className="sort-btn" onClick={() => sortBy(c.key)}>
                    {c.label}
                    <span className="sort-mark" aria-hidden="true">
                      {sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </span>
                  </button>
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr className="col-empty-row">
                <td colSpan={COLUMNS.length} className="empty">
                  {!loaded ? 'Loading…' : !totals[kind] ? empty : noMatch}
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const elsewhere = openElsewhere(c.id);
              return (
                <tr
                  key={c.id}
                  className="col-row"
                  tabIndex={0}
                  onClick={() => navigate(`/collections/${c.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/collections/${c.id}`);
                  }}
                >
                  {COLUMNS.map((col) => col.cell(c, elsewhere))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    );
  };

  return (
    <>
      <div className="panel-head col-table-head">
        <div className="panel-title">
          {/* "Total": the Collections table below has its own heading (owner, 2026-10-01). */}
          <h2>Total</h2>
          <span className="count-badge">{all.length}</span>
        </div>
        {/* The buttons up here with the search, the same width (owner, 2026-10-01); Import
            Collection outlined, the others' colours reversed (owner, 2026-10-09). */}
        <GuardButton className="btn big new-col-btn import-col-btn" onClick={() => filePicker.current?.click()}>
          Import Collection
        </GuardButton>
        <input
          ref={filePicker}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';   // the same file can be picked again
            if (file) setImporting(file);
          }}
        />
        <GuardButton className="btn primary big new-col-btn" onClick={() => setCreating('project')}>
          + Start Project
        </GuardButton>
        <GuardButton className="btn primary big new-col-btn" onClick={() => setCreating('collection')}>
          + Price Collection
        </GuardButton>
        <input
          type="search"
          className="col-search"
          placeholder="Search name or phone…"
          aria-label="Search collections by name or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Collections, then Projects, then System last (owner, 2026-10-14). */}
      {section('collection', 'Collections', {
        filters: true,
        empty: 'No collections yet. Press + Price Collection to start one.',
        noMatch: 'No collections match.',
      })}
      {section('project', 'Projects', {
        empty: 'No projects yet. Press + Start Project to price a box of the store’s own cards.',
        noMatch: 'No projects match.',
      })}
      {section('system', 'System', {
        empty: "Can't upload cards appears here after the first export.",
        noMatch: 'Nothing here matches.',
      })}

      {creating === 'collection' && (
        <NewCollectionModal busy={busy} onCreate={create} onClose={() => setCreating(null)} />
      )}
      {creating === 'project' && (
        <NewProjectModal busy={busy} onCreate={create} onClose={() => setCreating(null)} />
      )}
      {acting && <RowAction key={`${acting.id}:${acting.action}`} {...acting} onClose={() => setActing(null)} />}
      {importing && (
        <ImportDialog
          file={importing}
          target={{ kind: 'project' }}
          onDone={(id) => {
            setImporting(null);
            navigate(`/collections/${id}`);
          }}
          onClose={() => setImporting(null)}
        />
      )}
    </>
  );
}
