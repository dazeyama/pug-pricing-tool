import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLiveTable } from '../lib/useLiveTable.js';
import { nameKey } from '../lib/normalize.js';
import { formatPhone } from '../lib/phone.js';
import { formatRecent, formatShortDate } from '../lib/time.js';
import { withLoading } from '../lib/loading.js';
import GuardButton from '../components/GuardButton.jsx';
import UserTag from '../components/UserTag.jsx';
import { NewCollectionModal } from './collections/CollectionModals.jsx';
import { FILTERS, isClosed, statusLabel, statusTone } from './collections/status.js';
import { OfferText, PaidText } from './collections/CollectionDetails.jsx';
import { errorMessage } from './collections/useCollection.js';
import { useDevice } from '../state/device.jsx';
import { useStaff } from '../state/staff.jsx';
import { useToast } from '../components/Toast.jsx';

const STALE_MS = 60_000;   // a lock without a heartbeat for 60s is stale (spec 9.6)
const STATUS_ORDER = { processing: 0, priced: 1, paid: 2, completed: 3 };

// The table's columns (spec 9.1), in order: the value each sorts by and its
// cell. Status and Offer come last, after Notes (owner, 2026-09-29). `by`
// looks up a staff user (Last edited by); `elsewhere` is a row's "✎ open on"
// line. An offer or price not set yet (TBD) sorts as -1.
const columns = (by) => [
  {
    key: 'name',
    label: 'Name',
    value: (c) => nameKey(c.customer_name),
    cell: (c, elsewhere) => (
      <td key="name" className="col-name">
        {c.customer_name}
        {elsewhere && <span className="lock-line">{elsewhere}</span>}
      </td>
    ),
  },
  {
    key: 'phone', label: 'Phone', value: (c) => c.phone,
    cell: (c) => <td key="phone" className="col-phone">{formatPhone(c.phone)}</td>,
  },
  {
    key: 'paid',
    label: 'Paid',
    value: (c) => (isClosed(c.status) && c.paid_price != null ? Number(c.paid_price) : -1),
    cell: (c) => <td key="paid" className="col-money"><PaidText buy={c} /></td>,
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
    key: 'status', label: 'Status', value: (c) => STATUS_ORDER[c.status],
    cell: (c) => <td key="status"><span className={`status-chip ${statusTone(c)}`}>{statusLabel(c.status)}</span></td>,
  },
  {
    key: 'offer',
    label: 'Offer',
    value: (c) => (c.status === 'processing' || c.offer_cash == null ? -1 : Number(c.offer_cash)),
    cell: (c) => <td key="offer" className="col-money"><OfferText buy={c} /></td>,
  },
];

/**
 * The Collections tab (spec 9.1): every collection, live, with sort, a
 * status filter, a name/phone search and a line on the ones open on another
 * computer. + Price Collection starts a new one (9.2).
 */
export default function CollectionsPage() {
  const navigate = useNavigate();
  const { deviceId } = useDevice();
  const staff = useStaff();
  const toast = useToast();
  const { data, loaded } = useLiveTable('buys', () => supabase
    .from('buys')
    .select('id, customer_name, phone, status, notes, created_at, updated_at, last_edited_by, '
      + 'offer_cash, offer_credit, paid_price, paid_method')
    .eq('kind', 'collection'));
  const locks = useLiveTable('collection_locks', () => supabase
    .from('collection_locks')
    .select('buy_id, device_id, staff_user_id, heartbeat_at, devices(label)'));
  const [sort, setSort] = useState({ key: 'edited', dir: 'desc' });
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // Locks go stale without an event, so look again now and then.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const all = data ?? [];
  const COLUMNS = columns(staff.byId);
  const rows = useMemo(() => {
    const words = nameKey(query);
    const digits = query.replace(/\D/g, '');
    const column = COLUMNS.find((c) => c.key === sort.key);
    const filter = FILTERS.find((f) => f.value === status) ?? FILTERS[0];
    const dir = sort.dir === 'asc' ? 1 : -1;
    return all
      .filter(filter.match)
      .filter((c) => !words
        || nameKey(c.customer_name).includes(words)
        || (digits && c.phone?.includes(digits)))
      .sort((a, b) => {
        const x = column.value(a) ?? '';
        const y = column.value(b) ?? '';
        return (x < y ? -1 : x > y ? 1 : 0) * dir || (b.updated_at < a.updated_at ? -1 : 1);
      });
  }, [all, status, query, sort, staff.byId]);

  /** Open on another computer: "✎ open on Front Counter (Dana)". */
  function openElsewhere(id) {
    const lock = (locks.data ?? []).find((l) => l.buy_id === id);
    if (!lock || lock.device_id === deviceId) return null;
    if (now - new Date(lock.heartbeat_at).getTime() > STALE_MS) return null;
    const who = staff.byId(lock.staff_user_id)?.name;
    return `✎ open on ${lock.devices?.label ?? 'another computer'}${who ? ` (${who})` : ''}`;
  }

  function sortBy(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  async function create({ name, phone, idLast4, notes }) {
    setBusy(true);
    const { data: id, error } = await withLoading(() => supabase.rpc('collection_create', {
      p_name: name,
      p_phone: phone,
      p_notes: notes,
      p_user: staff.current?.id ?? null,
      p_device: deviceId,
      p_id_last4: idLast4 || null,
    }));
    setBusy(false);
    if (error) {
      toast(errorMessage(error, "Couldn't create the collection"), 'err');
      return;
    }
    setCreating(false);
    navigate(`/collections/${id}`);
  }

  return (
    <>
      <div className="panel-head col-table-head">
        <div className="panel-title">
          <h2>Collections</h2>
          <span className="count-badge">{all.length}</span>
        </div>
        <GuardButton className="btn primary big new-col-btn" onClick={() => setCreating(true)}>
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

      {/* The table is always drawn, its headings too, so nothing moves when
          it's empty (owner, 2026-09-29): the message is its only row. */}
      <table className="col-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
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
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows.length && (
            <tr className="col-empty-row">
              <td colSpan={COLUMNS.length} className="empty">
                {!loaded ? 'Loading…'
                  : !all.length ? 'No collections yet. Press + Price Collection to start one.'
                    : 'No collections match.'}
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

      {creating && (
        <NewCollectionModal busy={busy} onCreate={create} onClose={() => setCreating(false)} />
      )}
    </>
  );
}
