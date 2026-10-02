import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLiveTable } from '../lib/useLiveTable.js';
import { dayDate, dayRange, storeDay } from '../lib/calendar.js';
import { formatMoney } from '../lib/money.js';
import { STORE_TZ, formatTime } from '../lib/time.js';
import { HEADLINES } from '../lib/changelog.js';
import { colorVar } from '../lib/palette.js';
import { lineText } from '../lib/lineFormat.js';
import { formatInTimeZone } from 'date-fns-tz';

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
const SHOW = { rows: 4, events: 5 };   // what fits without scrolling
// Days to export takes the panel's spare height (owner, 2026-10-01): as many
// rows as fit (each row 32px and a 6px gap, home.css).
const DAY_ROW_PX = 38;
const CANT_SHOWN = 3;     // Can't upload cards' lines listed under its count
const RECENT_DAYS = 6;    // exported days kept for "Recently exported"

/** How many 38px rows fit in an element, kept up to date as it resizes. */
function useRowsThatFit() {
  const [el, setEl] = useState(null);
  const [fit, setFit] = useState(3);
  useEffect(() => {
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setFit(Math.max(1, Math.floor((entry.contentRect.height + 6) / DAY_ROW_PX)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, fit];
}

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
const dayOf = (when) => formatInTimeZone(new Date(when), STORE_TZ, 'yyyy-MM-dd');
const marketOf = (lines) => lines.reduce((s, l) => s + Number(l.cc_sell_price ?? l.unit_price) * l.quantity, 0);
const cardsIn = (lines) => lines.reduce((n, l) => n + l.quantity, 0);

export default function HomePage() {
  const navigate = useNavigate();
  const [daysRef, daysFit] = useRowsThatFit();
  const today = storeDay();
  const { from, to } = dayRange(today);

  // Magic cards in confirmed buys not exported yet (Pokémon can't be exported yet).
  const pending = useLiveTable('buys', () => supabase
    .from('buy_lines')
    .select('quantity, buy_id, buys!inner(kind, status, confirmed_at)')
    .eq('game', 'mtg')
    .is('completed_at', null)
    .eq('buys.kind', 'walk_in')
    .eq('buys.status', 'confirmed'));
  const todays = useLiveTable('buys', () => supabase
    .from('buys')
    .select('id, paid_price, paid_method, buy_lines(game, quantity)')
    .eq('kind', 'walk_in')
    .eq('status', 'confirmed')
    .gte('confirmed_at', from.toISOString())
    .lt('confirmed_at', to.toISOString()));
  const open = useLiveTable('buys', () => supabase
    .from('buys')
    .select('id, customer_name, status, project, system_key, updated_at, buy_lines(quantity, unit_price, cc_sell_price, priced_at, created_at)')
    .eq('kind', 'collection')
    .neq('status', 'completed'));
  const events = useLiveTable('events', () => supabase
    .from('events')
    .select('seq, at, action, target_name, staff_user_name, staff_user_color, summary')
    .order('seq', { ascending: false })
    .limit(SHOW.events));
  // Magic days already exported, newest first, for "Recently exported".
  const exported = useLiveTable('buys', () => supabase
    .from('buy_lines')
    .select('quantity, completed_at, cc_custom_sku, buy_id, buys!inner(kind, status, confirmed_at)')
    .eq('game', 'mtg')
    .not('completed_at', 'is', null)
    .eq('buys.kind', 'walk_in')
    .eq('buys.status', 'confirmed')
    .order('completed_at', { ascending: false })
    .limit(400));
  // Can't upload cards' lines, to list what's waiting.
  const cant = useLiveTable('buys', () => supabase
    .from('buys')
    .select('id, buy_lines(*)')
    .eq('system_key', 'cant_upload')
    .maybeSingle());
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
    daysShown = Math.max(0, daysFit - 1);                     // room for "+N more"
  } else {
    const left = daysFit - waitingRows;
    recentShown = left >= 2 ? Math.min(recentDays.length, left - 1) : 0;
  }

  // ---- collections and projects
  const collections = open.data ?? [];
  const cantUpload = collections.find((c) => c.system_key);
  const cantLines = [...(cant.data?.buy_lines ?? cantUpload?.buy_lines ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const oldestCant = cantLines.reduce((a, l) => (!a || l.created_at < a ? l.created_at : a), null);
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
    <div className="home-screen">
    <div className="home">
      {usageHigh && (
        <div className="banner warn home-warn">
          JustTCG: {u.daily_used.toLocaleString()} of {u.daily_limit.toLocaleString()} requests used today. A big export
          or REPRICE? may hit the limit.
        </div>
      )}

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
              {!toExport.length && <p className="home-empty home-row-line">Every past Magic day is exported.</p>}
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
              {toExport.length > daysShown && (
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
          <button
            type="button"
            className="home-card home-cant kind-system"
            disabled={!cantUpload}
            onClick={() => cantUpload && go(`/collections/${cantUpload.id}`)}
          >
            <span className="home-card-head"><span className="home-h">Can't upload cards</span></span>
            <span className="home-cant-body">
              <span className="home-big">{cardsIn(cantLines)}<small>{cardsIn(cantLines) === 1 ? 'card' : 'cards'} waiting</small></span>
              <span className="home-muted">{oldestCant ? `Oldest from ${dayDate(dayOf(oldestCant))}` : 'Nothing waiting'}</span>
              {cantLines.length > 0 && (
                <span className="home-cant-lines">
                  {cantLines.slice(0, CANT_SHOWN).map((l) => <span key={l.id} className="home-cant-line">{lineText(l)}</span>)}
                  {cantLines.length > CANT_SHOWN && <span className="home-muted">+{cantLines.length - CANT_SHOWN} more</span>}
                </span>
              )}
            </span>
          </button>
          {/* Quick actions, 2×2, sharing the column with Can't upload cards (owner, 2026-10-01). */}
          <section className="home-card home-quick">
            <div className="home-card-head"><h3>Quick actions</h3></div>
            <div className="home-actions" role="group" aria-label="Quick actions">
              <button type="button" className="btn" onClick={() => go('/price')}>Buy cards</button>
              <button type="button" className="btn" onClick={() => go(`/calendar/mtg/${today}`)}>Today's day</button>
              <button type="button" className="btn" onClick={() => go('/collections', { create: 'project' })}>+ Start Project</button>
              <button type="button" className="btn" onClick={() => go('/collections', { create: 'collection' })}>+ Price Collection</button>
            </div>
          </section>
        </div>
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

      <div className="home-row">
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

        <section className="home-card">
          <div className="home-card-head">
            <h3>Recent activity</h3>
            <button type="button" className="home-link" onClick={() => go('/changelog')}>Changelog →</button>
          </div>
          <div className="home-activity">
            {(events.data ?? []).map((e) => (
              <div key={e.seq} className="home-event">
                <span className="home-time">{formatTime(e.at)}</span>
                <span>
                  {HEADLINES[e.action] ?? e.action}{e.target_name ? `: ${e.target_name}` : ''}
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
  );
}
