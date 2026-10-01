import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { formatShortDate } from '../../lib/time.js';
import UserTag from '../../components/UserTag.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';

// Settings → Crystal Commerce matching (docs/EXPORT_FUNCTION.md 11.2), a row
// of its own like Backups: on the left, staff's set → category choices; on
// the right, the remembered products (picked by staff, or matched alone and
// exported), searchable. Forget removes one at once; the next export works it
// out again. Settings changes aren't logged (spec 12).

const FINISHES = { nonfoil: 'non-foil', foil: 'foil', etched: 'etched' };
const PROMOS = { prerelease: 'prerelease promos', promopack: 'promo pack cards' };
const RECENT = 20;

export default function CcMatchingPanel() {
  const staff = useStaff();
  const { offline, epoch } = useConnection();
  const toast = useToast();
  const [sets, setSets] = useState(null);
  const [counts, setCounts] = useState(null);
  const [text, setText] = useState('');
  const [links, setLinks] = useState(null);

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

  // The products: what the search finds by name, else the latest remembered.
  useEffect(() => {
    let alive = true;
    const q = text.trim();
    const t = setTimeout(async () => {
      let query = supabase.from('cc_product_links').select('*').order('linked_at', { ascending: false }).limit(q ? 50 : RECENT);
      if (q) query = query.ilike('product_name', `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      const { data, error } = await query;
      if (!alive) return;
      if (error) toast(`Couldn't load the remembered products: ${error.message}`, 'err');
      else setLinks(data ?? []);
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [text, toast, epoch, counts]);

  async function forgetSet(row) {
    const { error } = await supabase.from('cc_set_map').delete()
      .eq('scryfall_set', row.scryfall_set).eq('promo_kind', row.promo_kind);
    if (error) toast(`Couldn't forget it: ${error.message}`, 'err');
    else toast(`Forgot ${row.scryfall_set.toUpperCase()} → ${row.category}.`, 'ok');
    await loadSets();
  }

  async function forgetLink(row) {
    const { error } = await supabase.from('cc_product_links').delete()
      .eq('scryfall_id', row.scryfall_id).eq('finish', row.finish);
    if (error) toast(`Couldn't forget it: ${error.message}`, 'err');
    else toast(`Forgot ${row.product_name}.`, 'ok');
    await loadCounts();
  }

  const forgetButton = (onClick, what) => (
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
                  {forgetButton(() => forgetSet(s), 'this set choice')}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="backups-col restore-col">
          <h4 className="settings-sub">Products</h4>
          <p className="hint">
            {counts
              ? <>{counts.staff} picked by staff, {counts.auto} matched by the app and exported. </>
              : null}
            Each is one printing in one finish, remembered by Crystal Commerce's Product ID.
          </p>
          <input
            type="search"
            className="ccm-search"
            placeholder="Find by product name…"
            aria-label="Find a remembered product by name"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {links == null ? (
            <p className="hint">Loading…</p>
          ) : !links.length ? (
            <p className="hint">{text.trim() ? 'Nothing found.' : 'None yet.'}</p>
          ) : (
            <ul className="ccm-list">
              {!text.trim() && <li className="ccm-caption">The latest {Math.min(RECENT, links.length)}:</li>}
              {links.map((k) => (
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
                  {forgetButton(() => forgetLink(k), 'this product')}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
