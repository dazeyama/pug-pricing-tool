import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { formatShortDate } from '../../lib/time.js';
import Modal from '../../components/Modal.jsx';
import UserTag from '../../components/UserTag.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';

// Settings → Crystal Commerce matching (docs/EXPORT_FUNCTION.md 11.2), a row
// of its own like Backups: on the left, staff's set → category choices; on
// the right, how many products are remembered (picked by staff, or matched
// alone and exported). There will be thousands of those, so they're browsed
// in a window of their own, searched by name, a page at a time (owner,
// 2026-10-01). Forget removes one at once; the next export works it out
// again. Settings changes aren't logged (spec 12).

const FINISHES = { nonfoil: 'non-foil', foil: 'foil', etched: 'etched' };
const PROMOS = { prerelease: 'prerelease promos', promopack: 'promo pack cards' };
const PAGE = 50;

export default function CcMatchingPanel() {
  const staff = useStaff();
  const { offline, epoch } = useConnection();
  const toast = useToast();
  const [sets, setSets] = useState(null);
  const [counts, setCounts] = useState(null);
  const [browsing, setBrowsing] = useState(false);

  const loadSets = useCallback(async () => {
    const { data, error } = await supabase.from('cc_set_map').select('*').order('updated_at', { ascending: false });
    if (error) toast(`Couldn't load the set choices: ${error.message}`, 'err');
    else setSets(data ?? []);
  }, [toast]);

  const loadCounts = useCallback(async () => {
    const count = (source) => supabase.from('cc_product_links').select('scryfall_id', { count: 'exact', head: true })
      .eq('source', source);
    const [staffPicked, auto] = await Promise.all([count('staff'), count('auto')]);
    if (!staffPicked.error && !auto.error) setCounts({ staff: staffPicked.count ?? 0, auto: auto.count ?? 0 });
  }, []);

  useEffect(() => {
    loadSets();
    loadCounts();
  }, [loadSets, loadCounts, epoch]);

  async function forgetSet(row) {
    const { error } = await supabase.from('cc_set_map').delete()
      .eq('scryfall_set', row.scryfall_set).eq('promo_kind', row.promo_kind);
    if (error) toast(`Couldn't forget it: ${error.message}`, 'err');
    else toast(`Forgot ${row.scryfall_set.toUpperCase()} → ${row.category}.`, 'ok');
    await loadSets();
  }

  const total = counts ? counts.staff + counts.auto : null;

  return (
    <section className="cardpanel settings-panel settings-wide">
      <div className="cardpanel-head"><strong>Crystal Commerce matching</strong></div>
      <div className="cardpanel-body backups ccm">
        <div className="backups-col">
          <h4 className="settings-sub">Sets</h4>
          <p className="hint">
            Sets whose Crystal Commerce category staff picked during an export, because the app couldn't work it out.
          </p>
          {sets == null ? (
            <p className="hint">Loading…</p>
          ) : !sets.length ? (
            <p className="hint">None yet.</p>
          ) : (
            <ul className="ccm-list">
              {sets.map((s) => (
                <li key={`${s.scryfall_set}|${s.promo_kind}`}>
                  <span className="ccm-what">
                    <strong>{s.scryfall_set.toUpperCase()}</strong>
                    {s.promo_kind && <span className="ccm-note"> {PROMOS[s.promo_kind] ?? s.promo_kind}</span>}
                    {' → '}{s.category}
                  </span>
                  <span className="ccm-who">
                    {formatShortDate(s.updated_at)}
                    {s.updated_by && <> · <UserTag user={staff.byId(s.updated_by)} /></>}
                  </span>
                  <ForgetButton offline={offline} what="this set choice" onClick={() => forgetSet(s)} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="backups-col restore-col">
          <h4 className="settings-sub">Products</h4>
          <p className="hint">
            Each card printing, in each finish, that has exported is remembered with its Crystal Commerce product
            (by Product ID), so the next export matches it straight away.
          </p>
          <table className="restore-table ccm-counts">
            <tbody>
              <tr><th scope="row">Picked by staff</th><td>{counts ? counts.staff.toLocaleString() : '…'}</td></tr>
              <tr><th scope="row">Matched by the app</th><td>{counts ? counts.auto.toLocaleString() : '…'}</td></tr>
              <tr><th scope="row">In all</th><td>{total != null ? total.toLocaleString() : '…'}</td></tr>
            </tbody>
          </table>
          <button type="button" className="btn" disabled={!total} onClick={() => setBrowsing(true)}>
            Browse remembered products…
          </button>
        </div>
      </div>
      {browsing && (
        <ProductsModal
          offline={offline}
          onChanged={loadCounts}
          onClose={() => setBrowsing(false)}
        />
      )}
    </section>
  );
}

function ForgetButton({ offline, what, onClick }) {
  return (
    <button
      type="button"
      className="btn small ghost ccm-forget"
      disabled={offline}
      title={offline ? 'No connection' : `Forget ${what}: the next export works it out again`}
      onClick={onClick}
    >
      Forget
    </button>
  );
}

/**
 * The remembered products, in a window of their own: the latest first, or a
 * search by Crystal Commerce product name, PAGE at a time with Show more.
 */
function ProductsModal({ offline, onChanged, onClose }) {
  const staff = useStaff();
  const toast = useToast();
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLimit(PAGE);
  }, [text]);

  useEffect(() => {
    let alive = true;
    const q = text.trim();
    const t = setTimeout(async () => {
      // One extra row says whether there's more.
      let query = supabase.from('cc_product_links').select('*').order('linked_at', { ascending: false }).limit(limit + 1);
      if (q) query = query.ilike('product_name', `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      const { data, error } = await query;
      if (!alive) return;
      if (error) {
        toast(`Couldn't load the remembered products: ${error.message}`, 'err');
        return;
      }
      setRows((data ?? []).slice(0, limit));
      setMore((data ?? []).length > limit);
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [text, limit, reload, toast]);

  async function forget(row) {
    const { error } = await supabase.from('cc_product_links').delete()
      .eq('scryfall_id', row.scryfall_id).eq('finish', row.finish);
    if (error) toast(`Couldn't forget it: ${error.message}`, 'err');
    else toast(`Forgot ${row.product_name}.`, 'ok');
    setReload((n) => n + 1);
    onChanged();
  }

  return (
    <Modal
      wide
      className="ccm-modal"
      title="Remembered Crystal Commerce products"
      onClose={onClose}
      footer={<button type="button" className="btn primary" onClick={onClose}>Close</button>}
    >
      <input
        type="search"
        className="ccm-search"
        placeholder="Find by product name…"
        aria-label="Find a remembered product by name"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {rows == null ? (
        <p className="hint">Loading…</p>
      ) : !rows.length ? (
        <p className="hint">{text.trim() ? 'Nothing found.' : 'None yet.'}</p>
      ) : (
        <>
          <p className="hint ccm-caption">
            {text.trim() ? 'Found' : 'The latest'}: {rows.length.toLocaleString()}{more ? ' shown' : ''}
          </p>
          <ul className="ccm-list">
            {rows.map((k) => (
              <li key={`${k.scryfall_id}|${k.finish}`}>
                <span className="ccm-what">
                  {k.product_name}
                  <span className="ccm-note"> · {k.category} · {FINISHES[k.finish] ?? k.finish}</span>
                  <span className={`xd-tag ccm-source ${k.source}`}>{k.source === 'staff' ? 'picked' : 'automatic'}</span>
                </span>
                <span className="ccm-who">
                  {formatShortDate(k.linked_at)}
                  {k.linked_by && <> · <UserTag user={staff.byId(k.linked_by)} /></>}
                </span>
                <ForgetButton offline={offline} what="this product" onClick={() => forget(k)} />
              </li>
            ))}
          </ul>
          {more && (
            <button type="button" className="btn small ccm-more" onClick={() => setLimit((n) => n + PAGE)}>
              Show {PAGE} more
            </button>
          )}
        </>
      )}
    </Modal>
  );
}
