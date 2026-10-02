import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLiveTable } from '../lib/useLiveTable.js';
import { monthGrid, monthRange, monthTitle, parseMonth, shiftMonth, storeDay } from '../lib/calendar.js';
import { colorVar } from '../lib/palette.js';
import { formatDateTime } from '../lib/time.js';
import { withLoading } from '../lib/loading.js';
import {
  CASH_DOWNLOADED, cashBuysCsv, loadCashBuys, recordCashDownload, saveCashBuys,
} from '../lib/cashBuys.js';
import GuardButton from '../components/GuardButton.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConnection } from '../state/connection.jsx';
import { useDevice } from '../state/device.jsx';
import { useStaff } from '../state/staff.jsx';

const GAMES = [
  { game: 'mtg', name: 'Magic' },
  { game: 'pokemon', name: 'Pokémon' },
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Two rows of six dot spots (owner, 2026-09-30): up to 12 buys, a dot each;
// more, 11 dots and a plus in the 12th spot (drawn, so it's dead centre).
const DOT_SLOTS = 12;

/**
 * The Calendar tab (spec 10.1): Magic and Pokémon month grids side by side,
 * one month picker for both (kept in the URL, ?month=2026-08), weeks from
 * Sunday. Each day shows its confirmed walk-in buys: a count and a dot per
 * buy in the confirming user's colour. A buy with both games counts on both.
 * A day whose buys in that game are exported (Completed) is greyed and marked
 * "Exported" (owner, 2026-09-30). Only a finished day can be exported, so a
 * day's buys are all exported or none are.
 */
export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const month = parseMonth(params.get('month'));
  const go = (m) => setParams(m === storeDay().slice(0, 7) ? {} : { month: m });
  return (
    <>
      {/* Keyed by month: each month loads (and listens) afresh. */}
      <CalendarTop key={`top:${month}`} month={month} go={go} />
      <CalendarMonth key={month} month={month} />
    </>
  );
}

/**
 * A month's cash buys, live, and whether its file was ever downloaded
 * (null when that couldn't be read).
 */
function useCashBuys(month) {
  const rows = useLiveTable('buys', () => loadCashBuys(month));
  const seen = useLiveTable('events', () => supabase.from('events').select('at, staff_user_name')
    .eq('action', CASH_DOWNLOADED).eq('day', `${month}-01`)
    .order('at', { ascending: false }).limit(1));
  return {
    rows: rows.data ?? [],
    loaded: rows.loaded && seen.loaded,
    last: seen.error ? null : seen.data?.[0] ?? null,
    downloaded: seen.error ? null : (seen.data ?? []).length > 0,
  };
}

/**
 * The heading row: Calendar, the month picker, and Export Cash Buys (owner,
 * 2026-10-02): the month's buys paid in cash as a CSV, for records and taxes.
 * Under it, on a finished month whose file was never downloaded, a reminder
 * (only on that month: owner, 2026-10-02).
 */
function CalendarTop({ month, go }) {
  const current = storeDay().slice(0, 7);
  const cash = useCashBuys(month);
  const staff = useStaff();
  const { deviceId } = useDevice();
  const { offline } = useConnection();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  /** Fetch the month afresh, hand over the file, and log it. */
  async function download(m) {
    setBusy(true);
    const { data, error } = await withLoading(() => loadCashBuys(m));
    if (error || !data.length) {
      setBusy(false);
      toast(error ? `Couldn't load the cash buys: ${error.message}` : `No cash buys in ${monthTitle(m)}.`, 'err');
      return;
    }
    saveCashBuys(cashBuysCsv(data, staff.byId), m);
    const { error: logError } = await recordCashDownload(m, data, staff.current, deviceId);
    setBusy(false);
    if (logError) toast(`Downloaded, but the download couldn't be logged: ${logError.message}`, 'err');
    else toast(`Downloaded ${data.length} cash buy${data.length === 1 ? '' : 's'} for ${monthTitle(m)}.`, 'ok');
  }

  const n = cash.rows.length;
  const why = offline ? 'No connection' : busy ? 'Downloading…' : !cash.loaded ? 'Loading…'
    : !n ? `No cash buys in ${monthTitle(month)}` : null;
  const lastNote = cash.last
    ? ` Last downloaded ${formatDateTime(cash.last.at)}${cash.last.staff_user_name ? ` by ${cash.last.staff_user_name}` : ''}.`
    : cash.downloaded === false ? ' Never downloaded.' : '';
  // A finished month with cash buys whose file was never downloaded.
  const due = month < current && cash.loaded && n > 0 && cash.downloaded === false;

  return (
    <>
      <div className="panel-head cal-head">
        <div className="panel-title"><h2>Calendar</h2></div>
        <div className="cal-picker">
          <button type="button" className="btn cal-step" aria-label="Previous month" onClick={() => go(shiftMonth(month, -1))}>◀</button>
          <span className="cal-month">{monthTitle(month)}</span>
          <button type="button" className="btn cal-step" aria-label="Next month" onClick={() => go(shiftMonth(month, 1))}>▶</button>
          <button type="button" className="btn small cal-today" onClick={() => go(current)}>Today</button>
        </div>
        <GuardButton
          className="btn cash-export"
          disabled={Boolean(why)}
          title={why ?? `Download ${monthTitle(month)}'s cash buys as a CSV: walk-in buys and collections paid in cash, for records and taxes.${lastNote}`}
          onClick={() => download(month)}
        >
          Export Cash Buys ({cash.loaded ? n : '…'})
        </GuardButton>
      </div>
      {due && (
        <div className="banner warn banner-row cash-reminder" role="status">
          <span>
            <strong>{monthTitle(month)}</strong>'s cash buys file ({n} buy{n === 1 ? '' : 's'}) has never been
            downloaded. Download it for the store's records and taxes.
          </span>
          <GuardButton
            className="btn small cash-export"
            disabled={offline || busy}
            title={offline ? 'No connection' : busy ? 'Downloading…' : undefined}
            onClick={() => download(month)}
          >
            Download {monthTitle(month)}
          </GuardButton>
        </div>
      )}
    </>
  );
}

function CalendarMonth({ month }) {
  const navigate = useNavigate();
  const { byId } = useStaff();
  const { from, to } = monthRange(month);
  // Live (spec 10.1): any change to buys reloads the month.
  const { data, loaded } = useLiveTable('buys', () => supabase.rpc('buys_in_range', {
    p_from: from.toISOString(), p_to: to.toISOString(),
  }));

  // Per game: day → the buys confirmed that day (store time), in order.
  const days = useMemo(() => {
    const out = { mtg: new Map(), pokemon: new Map() };
    for (const b of data ?? []) {
      const day = storeDay(new Date(b.confirmed_at));
      for (const g of b.games ?? []) {
        if (!out[g]) continue;
        if (!out[g].has(day)) out[g].set(day, []);
        out[g].get(day).push(b);
      }
    }
    return out;
  }, [data]);

  const weeks = monthGrid(month);
  const today = storeDay();

  return (
    <div className="cal-grid">
      {GAMES.map(({ game, name }) => (
        <section key={game} className={`cal-game ${game}`} aria-label={`${name} buys`}>
          <div className="cal-game-head">
            <span className={`group-chip ${game}`}>{name}</span>
            {/* In the heading, so loading never changes the panel's height. */}
            {!loaded && <span className="cal-loading">Loading…</span>}
          </div>
          <div className="cal-weekdays">
            {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="cal-days">
            {weeks.flat().map((day, i) => {
              if (!day) return <span key={`blank-${i}`} className="cal-day blank" />;
              const buys = days[game].get(day) ?? [];
              const n = buys.length;
              // Exported: every buy's cards in this game Completed (owner, 2026-09-30).
              const exported = buys.filter((b) => (b.completed_games ?? []).includes(game)).length;
              const allExported = n > 0 && exported === n;
              const inner = (
                <>
                  <span className="cal-date">{Number(day.slice(8))}</span>
                  {n > 0 && <span className="cal-count">{n} buy{n === 1 ? '' : 's'}</span>}
                  {n > 0 && (
                    <span className="cal-dots" aria-hidden="true">
                      {buys.slice(0, n > DOT_SLOTS ? DOT_SLOTS - 1 : DOT_SLOTS).map((b) => (
                        <span
                          key={b.id}
                          className="cal-dot"
                          style={{ '--c': colorVar(byId(b.confirmed_by)?.color ?? 'pal-slate') }}
                        />
                      ))}
                      {n > DOT_SLOTS && <span className="cal-more" />}
                    </span>
                  )}
                  {/* At the cell's foot, under up to two rows of dots (owner, 2026-09-30). */}
                  {allExported && <span className="cal-exported">Exported</span>}
                </>
              );
              const cls = `cal-day${day === today ? ' today' : ''}${n ? ' has' : ''}${allExported ? ' exported' : ''}`;
              // Only days with buys open a day page.
              return n ? (
                <button
                  key={day}
                  type="button"
                  className={cls}
                  title={`${n} ${name} buy${n === 1 ? '' : 's'}${allExported ? ', exported' : ''}`}
                  onClick={() => navigate(`/calendar/${game}/${day}`)}
                >
                  {inner}
                </button>
              ) : (
                <span key={day} className={cls}>{inner}</span>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
