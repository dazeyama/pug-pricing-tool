import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLiveTable } from '../lib/useLiveTable.js';
import { dayDate, dayRange, storeDay } from '../lib/calendar.js';
import { formatMoney } from '../lib/money.js';
import { STORE_TZ, formatTime } from '../lib/time.js';
import { headlineOf } from '../lib/changelog.js';
import { isValuedBulk } from '../lib/bulk.js';
import GuardButton from '../components/GuardButton.jsx';
import { colorVar } from '../lib/palette.js';
import { formatInTimeZone } from 'date-fns-tz';
import { useStaff } from '../state/staff.jsx';

// Home (owner, 2026-10-01): the first tab, and where the logo goes. What
// needs doing (days to export, Can't upload cards, collections and projects
// by step), quick actions, today's buys and the latest changelog lines, all
// live from data the other tabs already read. A warning bar shows only when
// JustTCG's daily allowance is running low. One panel, half the page wide and
// centered, that never scrolls (owner, 2026-10-01): each list shows its first
// few and "+N more" for the rest.

const DAY_MS = 86_400_000;
const STALE_PRICES_DAYS = 14;   // a project's oldest price this old is worth a REPRICE?
const USAGE_WARN = 0.8;         // JustTCG's day this used: say so
const SHOW = { rows: 3, events: 20 };  // collections rows shown; events fetched (as many as fit are shown)
// Days to export takes the panel's spare height (owner, 2026-10-01): as many
// rows as fit (each row 32px and a 6px gap, home.css).
const DAY_ROW_PX = 38;
const RECENT_DAYS = 6;    // exported days kept for "Recently exported"

const EVENT_ROW_PX = 22;   // Recent activity: 18px rows, a 4px gap

/** How many rows (rowPx each, gap included) fit in an element, kept up to date as it resizes. */
function useRowsThatFit(rowPx = DAY_ROW_PX, gap = 6) {
  const [el, setEl] = useState(null);
  const [fit, setFit] = useState(3);
  useEffect(() => {
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setFit(Math.max(1, Math.floor((entry.contentRect.height + gap) / rowPx)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, rowPx, gap]);
  return [setEl, fit];
}

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
const dayOf = (when) => formatInTimeZone(new Date(when), STORE_TZ, 'yyyy-MM-dd');
const marketOf = (lines) => lines.reduce((s, l) => s + Number(l.cc_sell_price ?? l.unit_price) * l.quantity, 0);
// Real cards only: bulk is counted on its own, and only where it's priced (docs/TEAM_FEEDBACK.md 5.5);
// struck cards are gone (lib/struck.js); a placeholder is a card (owner, 2026-10-16).
const cardsIn = (lines) => lines.reduce((n, l) => n + (isValuedBulk(l) || l.struck_at ? 0 : l.quantity), 0);

/** The store's date, kept current while the page stays open: checked each minute. */
function useStoreDay() {
  const [day, setDay] = useState(storeDay);
  useEffect(() => {
    const timer = setInterval(() => setDay(storeDay()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return day;
}

/**
 * Home, loaded afresh when the store's day changes (smoke test 2026-10-02 #6): Today and
 * Days to export were worked out for the day the page opened, so a page left
 * open overnight kept yesterday's numbers until the next buy.
 */
export default function HomePage() {
  const today = useStoreDay();
  return <HomeScreen key={today} today={today} />;
}

function HomeScreen({ today }) {
  const navigate = useNavigate();
  const user = useStaff().current;
  const [daysRef, daysFit] = useRowsThatFit();
  const [eventsRef, eventsFit] = useRowsThatFit(EVENT_ROW_PX, 4);
  const { from, to } = dayRange(today);

  // Magic cards in confirmed buys not exported yet (Pokémon can't be exported yet).
  const pending = useLiveTable('buys', () => supabase
    .from('buy_lines')
    .select('quantity, buy_id, buys!inner(kind, status, confirmed_at)')
    .eq('game', 'mtg')
    .is('completed_at', null)
    .is('bulk_kind', null)   // bulk never waits to be exported
    .is('struck_at', null)   // nor a struck card
    .eq('buys.kind', 'walk_in')
    .eq('buys.status', 'confirmed'));
  const todays = useLiveTable('buys', () => supabase
    .from('buys')
    .select('id, paid_price, paid_method, buy_lines(game, quantity, bulk_kind, struck_at)')
    .eq('kind', 'walk_in')
    .eq('status', 'confirmed')
    .gte('confirmed_at', from.toISOString())
    .lt('confirmed_at', to.toISOString()));
  const open = useLiveTable('buys', () => supabase
    .from('buys')
    .select('id, customer_name, status, project, system_key, updated_at, buy_lines(quantity, unit_price, cc_sell_price, priced_at, created_at, bulk_kind, struck_at)')
    .eq('kind', 'collection')
    .not('status', 'in', '(completed,rejected)'));
  const events = useLiveTable('events', () => supabase
    .from('events')
    .select('seq, at, action, target_name, staff_user_name, staff_user_color, summary')
    .order('seq', { ascending: false })
    .limit(SHOW.events));
  // Magic days already exported, newest first, for "Recently exported": cards
  // with export stamps, not ones only marked Completed by hand (smoke test 2026-10-02 #5).
  const exported = useLiveTable('buys', () => supabase
    .from('buy_lines')
    .select('quantity, completed_at, cc_custom_sku, buy_id, buys!inner(kind, status, confirmed_at)')
    .eq('game', 'mtg')
    .not('completed_at', 'is', null)
    .not('cc_status', 'is', null)
    .eq('buys.kind', 'walk_in')
    .eq('buys.status', 'confirmed')
    .order('completed_at', { ascending: false })
    .limit(400));
  const usage = useLiveTable('api_usage', () => supabase.from('api_usage').select('*').eq('id', 1).maybeSingle());

  // ---- days to export: past days with Magic cards still Paid/Ours, oldest first
  const days = new Map();
  for (const l of pending.data ?? []) {
    const day = dayOf(l.buys.confirmed_at);
    if (day >= today) continue;               // today can't be exported yet
    const d = days.get(day) ?? { day, buys: new Set(), cards: 0 };
    d.buys.add(l.buy_id);
    d.cards += l.quantity;
    days.set(day, d);
  }
  const toExport = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  const recent = new Map();
  for (const l of exported.data ?? []) {
    const day = dayOf(l.buys.confirmed_at);
    const d = recent.get(day) ?? { day, cards: 0, skus: new Set() };
    d.cards += l.quantity;
    if (l.cc_custom_sku) d.skus.add(l.cc_custom_sku);
    recent.set(day, d);
  }
  const recentDays = [...recent.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, RECENT_DAYS);
  // The panel's rows, filled in order (owner, 2026-10-01): every waiting day
  // (or "+N more" for the rest), then as many recently exported days as fit
  // under their own heading row.
  const waitingRows = Math.max(1, toExport.length);           // the empty message is a row too
  let daysShown = toExport.length;
  let recentShown = 0;
  if (waitingRows > daysFit) {
    // Room for "+N more" under the days, unless only one row fits: then the
    // oldest day itself (smoke test 2026-10-02 #1), and the heading's "N waiting" says the rest.
    daysShown = Math.max(1, daysFit - 1);
  } else {
    const left = daysFit - waitingRows;
    recentShown = left >= 2 ? Math.min(recentDays.length, left - 1) : 0;
  }

  // ---- collections and projects
  const collections = open.data ?? [];
  const cantUpload = collections.find((c) => c.system_key);
  const cantCards = cardsIn(cantUpload?.buy_lines ?? []);
  const customer = collections.filter((c) => !c.system_key && !c.project);
  const projects = collections.filter((c) => c.project);
  const count = (status) => customer.filter((c) => c.status === status).length;
  const rows = [
    ...projects.map((c) => {
      const oldest = c.buy_lines.reduce((a, l) => (l.priced_at && (!a || l.priced_at < a) ? l.priced_at : a), null);
      const age = oldest ? Math.floor((Date.now() - Date.parse(oldest)) / DAY_MS) : null;
      return { c, kind: 'project', note: age == null ? 'no cards yet' : age < 1 ? 'prices from today' : `oldest price ${plural(age, 'day')} old`, warn: age != null && age >= STALE_PRICES_DAYS };
    }),
    ...customer.filter((c) => c.status === 'paid').map((c) => ({ c, kind: 'collection', note: 'ready to export', warn: false })),
  ];

  // ---- today
  const buys = todays.data ?? [];
  const todayCards = buys.flatMap((b) => b.buy_lines ?? []);
  const paid = (method) => buys.filter((b) => b.paid_method === method).reduce((s, b) => s + Number(b.paid_price ?? 0), 0);
  const cash = paid('cash');
  const credit = paid('credit');
  const byGame = (game) => cardsIn(todayCards.filter((l) => l.game === game));

  const u = usage.data;
  const usageHigh = u?.daily_limit && u.daily_used >= u.daily_limit * USAGE_WARN;

  const go = (path, state) => navigate(path, state ? { state } : undefined);

  return (
    // The band behind the panels takes the picked user's colour, faintly
    // (owner, 2026-10-02; home.css); the accent with no one picked.
    <div className="home-screen" style={user ? { '--home-tint': colorVar(user.color) } : undefined}>
    <div className="home">
      {usageHigh && (
        <div className="banner warn home-warn">
          JustTCG: {u.daily_used.toLocaleString()} of {u.daily_limit.toLocaleString()} requests used today. A big export
          or REPRICE? may hit the limit.
        </div>
      )}

      {/* Today and the quick actions first, Collections and projects (Can't upload
          cards its fifth tile) in the middle, then Days to export beside Recent activity, taking
          the spare height (owner, 2026-10-01). */}
      <div className="home-row home-first">
        <section className="home-card">
          <div className="home-card-head"><h3>Today</h3></div>
          <div className="home-stats two">
            <div className="home-stat"><span className="home-label">Buys</span><strong>{buys.length}</strong><span className="home-muted">{plural(cardsIn(todayCards), 'card')}</span></div>
            <div className="home-stat">
              <span className="home-label">Paid out</span>
              <strong>{formatMoney(cash + credit)}</strong>
              <span className="home-muted"><span className="is-cash">{formatMoney(cash)} cash</span> · <span className="is-credit">{formatMoney(credit)} credit</span></span>
            </div>
          </div>
          <div className="home-games">
            <span className="home-dot game-mtg">Magic {byGame('mtg')}</span>
            <span className="home-dot game-pokemon">Pokémon {byGame('pokemon')}</span>
          </div>
        </section>
        <section className="home-card home-quick">
          <div className="home-card-head"><h3>Quick actions</h3></div>
          <div className="home-actions" role="group" aria-label="Quick actions">
            <button type="button" className="btn" onClick={() => go('/price')}>Buy cards</button>
            <button type="button" className="btn" onClick={() => go(`/calendar/mtg/${today}`)}>Today's day</button>
            {/* They make something, so they need a user like the Collections tab's (smoke test 2026-10-11, F1). */}
            <GuardButton className="btn" onClick={() => go('/collections', { create: 'project' })}>+ Start Project</GuardButton>
            <GuardButton className="btn" onClick={() => go('/collections', { create: 'collection' })}>+ Price Collection</GuardButton>
          </div>
        </section>
      </div>

      <section className="home-card">
        <div className="home-card-head">
          <h3>Collections and projects</h3>
          <button type="button" className="home-link" onClick={() => go('/collections')}>Collections →</button>
        </div>
        <div className="home-stats">
          <div className="home-stat"><span className="home-label">To price</span><strong>{count('processing')}</strong><span className="home-muted">Processing</span></div>
          <div className="home-stat"><span className="home-label">Offer out</span><strong>{count('priced')}</strong><span className="home-muted">Priced</span></div>
          <div className="home-stat"><span className="home-label">To export</span><strong>{count('paid')}</strong><span className="home-muted">Paid/Ours</span></div>
          <div className="home-stat"><span className="home-label">Projects open</span><strong>{projects.length}</strong><span className="home-muted">Ours</span></div>
          {/* Can't upload cards, the fifth (owner, 2026-10-09): Recent activity has the column to itself. */}
          <button
            type="button"
            className="home-stat home-stat-cant kind-system"
            disabled={!cantUpload}
            onClick={() => cantUpload && go(`/collections/${cantUpload.id}`)}
          >
            <span className="home-label">Can't upload</span>
            <strong>{cantCards}</strong>
            <span className="home-muted">{cantCards === 1 ? 'card' : 'cards'} waiting</span>
          </button>
        </div>
        {rows.length > 0 && (
          <div className="home-list">
            {rows.slice(0, SHOW.rows).map(({ c, kind, note, warn }) => (
              <button key={c.id} type="button" className={`home-item kind-${kind}`} onClick={() => go(`/collections/${c.id}`)}>
                <strong>{c.customer_name}</strong>
                <span className="home-muted">
                  {kind === 'project' ? 'Project' : 'Paid/Ours'} · {plural(cardsIn(c.buy_lines), 'card')} · {formatMoney(marketOf(c.buy_lines))}
                </span>
                <span className={`home-age${warn ? ' stale' : ''}`}>{note}</span>
              </button>
            ))}
            {rows.length > SHOW.rows && (
              <button type="button" className="home-more" onClick={() => go('/collections')}>
                +{rows.length - SHOW.rows} more on Collections
              </button>
            )}
          </div>
        )}
      </section>

      <div className="home-row home-top">
        <section className="home-card home-export">
          <div className="home-card-head">
            <h3>Days to export</h3>
            {toExport.length > 0 && <span className="home-count due">{toExport.length} waiting</span>}
          </div>
          {!pending.loaded ? (
            <p className="hint">Loading…</p>
          ) : (
            <div className="home-list home-days" ref={daysRef}>
              {/* All clear (owner, 2026-10-01): green, not grey. */}
              {!toExport.length && <p className="home-clear home-row-line">✓ Everything's exported</p>}
              {toExport.slice(0, daysShown).map((d) => {
                const age = daysBetween(d.day, today);
                return (
                  <button key={d.day} type="button" className="home-item game-mtg" onClick={() => go(`/calendar/mtg/${d.day}`)}>
                    <strong>{dayDate(d.day)}</strong>
                    <span className="home-muted">Magic · {plural(d.buys.size, 'buy')} · {plural(d.cards, 'card')}</span>
                    <span className={`home-age${age >= 3 ? ' late' : ''}`}>{age === 1 ? 'yesterday' : `${age} days old`}</span>
                  </button>
                );
              })}
              {toExport.length > daysShown && daysFit > 1 && (
                <button type="button" className="home-more" onClick={() => go('/calendar')}>
                  +{toExport.length - daysShown} more on the Calendar
                </button>
              )}
              {recentShown > 0 && (
                <>
                  <span className="home-subhead home-row-line">Recently exported</span>
                  {recentDays.slice(0, recentShown).map((d) => (
                    <button key={d.day} type="button" className="home-item game-mtg is-done" onClick={() => go(`/calendar/mtg/${d.day}`)}>
                      <strong>{dayDate(d.day)}</strong>
                      <span className="home-muted">Magic · {plural(d.cards, 'card')}</span>
                      {d.skus.size > 0 && <span className="sku-chip compact home-sku">SKU <strong>{[...d.skus].join(', ')}</strong></span>}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </section>

        <div className="home-side">
          <section className="home-card home-recent">
            <div className="home-card-head">
              <h3>Recent activity</h3>
              <button type="button" className="home-link" onClick={() => go('/changelog')}>Changelog →</button>
            </div>
            <div className="home-activity" ref={eventsRef}>
              {(events.data ?? []).slice(0, eventsFit).map((e) => (
                <div key={e.seq} className="home-event">
                  <span className="home-time">{formatTime(e.at)}</span>
                  <span>
                    {headlineOf(e)}{e.target_name ? `: ${e.target_name}` : ''}
                    {e.staff_user_name && (
                      <span className="home-who" style={{ '--c': colorVar(e.staff_user_color ?? 'pal-slate') }}> · {e.staff_user_name}</span>
                    )}
                  </span>
                </div>
              ))}
              {events.loaded && !(events.data ?? []).length && <p className="home-empty">Nothing yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
    </div>
  );
}
