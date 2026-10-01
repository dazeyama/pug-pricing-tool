import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLiveTable } from '../lib/useLiveTable.js';
import { monthGrid, monthRange, monthTitle, parseMonth, shiftMonth, storeDay } from '../lib/calendar.js';
import { colorVar } from '../lib/palette.js';
import { useStaff } from '../state/staff.jsx';

const GAMES = [
  { game: 'mtg', name: 'Magic' },
  { game: 'pokemon', name: 'Pokémon' },
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Two rows of six dot spots (owner, 2026-09-30): up to 12 buys, a dot each;
// more, 11 dots and "…" in the 12th spot.
const DOT_SLOTS = 12;

/**
 * The Calendar tab (spec 10.1): Magic and Pokémon month grids side by side,
 * one month picker for both (kept in the URL, ?month=2026-08), weeks from
 * Sunday. Each day shows its confirmed walk-in buys: a count and a dot per
 * buy in the confirming user's colour. A buy with both games counts on both.
 * A day whose buys in that game are all exported (Completed) is greyed and
 * marked "Exported"; some of them, "Part exported" (owner, 2026-09-30).
 */
export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const month = parseMonth(params.get('month'));
  const go = (m) => setParams(m === storeDay().slice(0, 7) ? {} : { month: m });
  return (
    <>
      <div className="panel-head cal-head">
        <div className="panel-title"><h2>Calendar</h2></div>
        <div className="cal-picker">
          <button type="button" className="btn cal-step" aria-label="Previous month" onClick={() => go(shiftMonth(month, -1))}>◀</button>
          <span className="cal-month">{monthTitle(month)}</span>
          <button type="button" className="btn cal-step" aria-label="Next month" onClick={() => go(shiftMonth(month, 1))}>▶</button>
          <button type="button" className="btn small cal-today" onClick={() => go(storeDay().slice(0, 7))}>Today</button>
        </div>
      </div>
      {/* Keyed by month: each month loads (and listens) afresh. */}
      <CalendarMonth key={month} month={month} />
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
                      {n > DOT_SLOTS && <span className="cal-more">…</span>}
                    </span>
                  )}
                  {/* At the cell's foot, under up to two rows of dots (owner, 2026-09-30). */}
                  {allExported && <span className="cal-exported">Exported</span>}
                  {exported > 0 && !allExported && (
                    <span className="cal-exported partial" title={`${n - exported} of ${n} not exported yet`}>Part exported</span>
                  )}
                </>
              );
              const cls = `cal-day${day === today ? ' today' : ''}${n ? ' has' : ''}${allExported ? ' exported' : ''}`;
              // Only days with buys open a day page.
              return n ? (
                <button
                  key={day}
                  type="button"
                  className={cls}
                  title={`${n} ${name} buy${n === 1 ? '' : 's'}${allExported ? ', exported' : exported ? `, ${exported} exported` : ''}`}
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
