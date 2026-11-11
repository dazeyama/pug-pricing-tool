import { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import Modal from '../../components/Modal.jsx';
import { supabase } from '../../lib/supabase.js';
import { allPages } from '../../lib/inChunks.js';
import { useLiveTable } from '../../lib/useLiveTable.js';
import { dayRange, monthGrid, monthTitle, shiftMonth, storeDay } from '../../lib/calendar.js';
import { formatMoney } from '../../lib/money.js';
import {
  DEFAULT_PRESET, dailyRows, graphRows, longDay, presets, rangeText, shortDay, spanBefore, totalOf,
} from '../../lib/buysReport.js';
import '../../styles/buysReport.css';

// The Buys report (owner, 2026-11-10; decision 585), over Home, from its Today card: "modeled after the Square Sales
// Report page … pick any range of dates and get a trend graph for cash and credit (separately) for that range. …
// Default range is last 7 days", "2 lines on 1 graph", and "a way to optionally hide Mondays and Wednesdays from the
// graph". Recharts draws the graph; this file is loaded only when the report opens, so it isn't in Home's own load.

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A token's colour from the app's theme: an SVG attribute can't read a CSS variable. */
const token = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * The range's paid buys and the span's before, each with its store day; and the first day any buy was paid, so
 * the before-span is compared only when all of it is on record.
 */
function useReportBuys(from, to) {
  const before = spanBefore(from, to);
  const live = useLiveTable('buys', async () => {
    const start = dayRange(before.from).from.toISOString();
    const end = dayRange(to).to.toISOString();
    const [buys, first] = await Promise.all([
      allPages((a, b) => supabase.from('buys')
        .select('id, paid_at, paid_price, paid_method, cash_location, buy_lines(quantity, bulk_kind, struck_at)', { count: 'exact' })
        .in('status', ['confirmed', 'paid', 'completed'])
        .not('paid_price', 'is', null)
        .gte('paid_at', start)
        .lt('paid_at', end)
        .order('paid_at').order('id').range(a, b)),
      supabase.from('buys').select('paid_at').in('status', ['confirmed', 'paid', 'completed'])
        .not('paid_price', 'is', null).not('paid_at', 'is', null)
        .order('paid_at').limit(1).maybeSingle(),
    ]);
    const error = buys.error ?? first.error;
    if (error) return { data: null, error };
    return {
      data: {
        buys: buys.data.map((b) => ({ ...b, day: storeDay(new Date(b.paid_at)) })),
        firstDay: first.data ? storeDay(new Date(first.data.paid_at)) : null,
      },
      error: null,
    };
  });
  const { reload } = live;
  // A new range is a new read.
  useEffect(() => {
    reload();
  }, [from, to, reload]);
  return live;
}

/** Any two days, as Square's custom range: the first click starts it, the second ends it. */
function RangeCalendar({ from, to, today, onPick }) {
  const [month, setMonth] = useState(to.slice(0, 7));
  const [start, setStart] = useState(null);   // the first click, waiting for the second
  const weeks = monthGrid(month);
  const pick = (day) => {
    if (!start) {
      setStart(day);
      onPick(day, day);
    } else {
      setStart(null);
      onPick(day < start ? day : start, day < start ? start : day);
    }
  };
  return (
    <div className="br-cal" role="group" aria-label="Pick the first and the last day">
      <div className="br-cal-head">
        <button type="button" className="btn ghost small" aria-label="The month before" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <strong>{monthTitle(month)}</strong>
        <button
          type="button"
          className="btn ghost small"
          aria-label="The month after"
          disabled={month >= today.slice(0, 7)}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
      </div>
      <div className="br-cal-grid">
        {WEEKDAYS.map((w, i) => <span key={`w${i}`} className="br-cal-wd">{w}</span>)}
        {weeks.flat().map((day, i) => (day ? (
          <button
            key={day}
            type="button"
            className={`br-cal-day${day >= from && day <= to ? ' in' : ''}${day === from || day === to ? ' end' : ''}`}
            disabled={day > today}
            aria-pressed={day >= from && day <= to}
            aria-label={longDay(day)}
            onClick={() => pick(day)}
          >
            {Number(day.slice(8))}
          </button>
        ) : <span key={`e${i}`} />))}
      </div>
      <p className="hint br-cal-hint">
        {start ? `From ${shortDay(start)}: now click the last day.` : 'Click the first day, then the last.'}
      </p>
    </div>
  );
}

/** A day on the graph, pointed at: its cash, credit, buys and cards. */
function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="br-tip">
      <b>{longDay(r.day)}</b>
      <span className="is-cash">Cash {formatMoney(r.cash)}</span>
      <span className="is-credit">Credit {formatMoney(r.credit)}</span>
      <span>{r.buys} {r.buys === 1 ? 'buy' : 'buys'} · {r.cards} {r.cards === 1 ? 'card' : 'cards'}</span>
    </div>
  );
}

/**
 * One of the range's totals, beside the same span before when all of it is on record: one line, "▲ $0 before",
 * as the line above the tiles says which span that is (so the panel fits with no scrollbar, the owner).
 */
function Tile({ label, tone, value, before, money, span }) {
  const show = (n) => (money ? formatMoney(n) : n.toLocaleString());
  const diff = before == null ? 0 : value - before;
  return (
    <div className="br-tile">
      <span className={`br-tile-label${tone ? ` is-${tone}` : ''}`}>{label}</span>
      <strong>{show(value)}</strong>
      {before != null && (
        <span className="br-was" title={`${show(before)} the ${span} before`}>
          <span className={diff > 0 ? 'br-up' : diff < 0 ? 'br-down' : ''}>{diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : ''}</span>
          {show(before)} before
        </span>
      )}
    </div>
  );
}

export default function BuysReport({ onClose }) {
  const today = storeDay();
  const PRESETS = useMemo(() => presets(today), [today]);
  const [preset, setPreset] = useState(DEFAULT_PRESET);
  const [range, setRange] = useState(() => {
    const p = PRESETS.find((x) => x.key === DEFAULT_PRESET);
    return { from: p.from, to: p.to };
  });
  const [view, setView] = useState('line');
  const [hideClosed, setHideClosed] = useState(true);
  const live = useReportBuys(range.from, range.to);

  const rows = useMemo(() => dailyRows(live.data?.buys ?? [], range.from, range.to), [live.data, range]);
  const total = totalOf(rows);
  const before = spanBefore(range.from, range.to);
  const firstDay = live.data?.firstDay;
  const beforeTotal = firstDay && before.from >= firstDay
    ? totalOf(dailyRows(live.data.buys, before.from, before.to)) : null;
  const span = rows.length === 1 ? 'day' : `${rows.length} days`;
  const graphed = graphRows(rows, hideClosed).map((r) => ({ ...r, label: shortDay(r.day) }));
  const leftOff = rows.length - graphed.length;

  const colours = useMemo(() => ({
    cash: token('--cash', '#3ecf8e'), credit: token('--credit', '#6c8cff'),
    muted: token('--muted', '#9aa1bd'), line: token('--border', '#2c3350'),
  }), []);
  const axis = { fill: colours.muted, fontSize: 12 };
  const parts = [
    <CartesianGrid key="g" stroke={colours.line} strokeDasharray="3 3" vertical={false} />,
    <XAxis key="x" dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: colours.line }} minTickGap={18} />,
    <YAxis key="y" tick={axis} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `$${v}`} />,
    <Tooltip
      key="t"
      content={<Tip />}
      cursor={view === 'bar' ? { fill: 'rgba(255,255,255,0.04)' } : { stroke: colours.muted, strokeDasharray: '3 3' }}
    />,
  ];
  const margin = { top: 6, right: 16, bottom: 0, left: 4 };

  return (
    <Modal
      wide
      className="buys-report"
      title={`Buys report · ${rangeText(range.from, range.to)}`}
      onClose={onClose}
      footer={<button type="button" className="btn primary" onClick={onClose}>Close</button>}
    >
      <div className="br-controls">
        <div className="br-group" role="group" aria-label="Date range">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`br-chip${preset === p.key ? ' on' : ''}`}
              onClick={() => {
                setPreset(p.key);
                setRange({ from: p.from, to: p.to });
              }}
            >
              {p.label}
            </button>
          ))}
          <button type="button" className={`br-chip${preset === 'custom' ? ' on' : ''}`} onClick={() => setPreset('custom')}>
            Custom…
          </button>
        </div>
        <label className="br-check">
          <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
          Hide closed days (Mon, Wed)
        </label>
        <div className="br-group br-view" role="group" aria-label="Graph type">
          <button type="button" className={`br-chip${view === 'line' ? ' on' : ''}`} onClick={() => setView('line')}>Line</button>
          <button type="button" className={`br-chip${view === 'bar' ? ' on' : ''}`} onClick={() => setView('bar')}>Bars</button>
        </div>
      </div>

      {preset === 'custom' && (
        <RangeCalendar from={range.from} to={range.to} today={today} onPick={(from, to) => setRange({ from, to })} />
      )}

      {live.error && !live.data ? (
        <p className="hint br-fail">Couldn&apos;t read the buys: {live.error.message}. Trying again…</p>
      ) : !live.loaded ? (
        <p className="hint br-fail">Loading…</p>
      ) : (
        <>
          <div className="br-chart">
            <div className="br-legend">
              <span className="br-key is-cash"><i />Cash paid</span>
              <span className="br-key is-credit"><i />Credit paid</span>
              {hideClosed && leftOff > 0 && (
                <span className="br-left-off">
                  {leftOff} closed {leftOff === 1 ? 'day' : 'days'} left off the graph; the totals still count them
                </span>
              )}
            </div>
            {/* 200 px: with the tiles and a week's rows, the window fits a 900 px-high screen at zoom 1 with no
                scrollbar (measured on dev, the owner's ask). */}
            <ResponsiveContainer width="100%" height={200}>
              {view === 'line' ? (
                <LineChart data={graphed} margin={margin}>
                  {parts}
                  {/* Straight lines: a smoothed one dipped below $0 between days. */}
                  <Line type="linear" dataKey="cash" name="Cash" stroke={colours.cash} strokeWidth={2.5}
                    dot={{ r: 3, fill: colours.cash, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  <Line type="linear" dataKey="credit" name="Credit" stroke={colours.credit} strokeWidth={2.5}
                    dot={{ r: 3, fill: colours.credit, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                </LineChart>
              ) : (
                <BarChart data={graphed} margin={margin} barGap={2}>
                  {parts}
                  <Bar dataKey="cash" name="Cash" fill={colours.cash} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="credit" name="Credit" fill={colours.credit} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {beforeTotal && (
            <p className="hint br-compare">
              Totals for the range; “before” is the {span} just before ({rangeText(before.from, before.to)}).
            </p>
          )}
          <div className="br-tiles">
            <Tile label="Paid out" value={total.cash + total.credit} before={beforeTotal && beforeTotal.cash + beforeTotal.credit} money span={span} />
            <Tile label="Cash" tone="cash" value={total.cash} before={beforeTotal?.cash} money span={span} />
            <Tile label="Credit" tone="credit" value={total.credit} before={beforeTotal?.credit} money span={span} />
            <Tile label="Buys" value={total.buys} before={beforeTotal?.buys} span={span} />
            <Tile label="Cards" value={total.cards} before={beforeTotal?.cards} span={span} />
            <Tile label="From the Till" tone="cash" value={total.till} before={beforeTotal?.till} money span={span} />
            <Tile label="From the Backroom" tone="cash" value={total.backroom} before={beforeTotal?.backroom} money span={span} />
          </div>

          {/* The window never scrolls: a range longer than fits scrolls its day rows alone. */}
          <div className="br-days-wrap">
          <table className="br-days">
            <thead>
              <tr>
                {['Day', 'Buys', 'Cards', 'Cash', 'Credit', 'Paid out'].map((c) => <th key={c} scope="col">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.slice().reverse().map((r) => (
                <tr key={r.day} className={r.buys ? '' : 'none'}>
                  <td>{longDay(r.day)}</td>
                  <td>{r.buys}</td>
                  <td>{r.cards}</td>
                  <td className={r.cash ? 'is-cash' : ''}>{formatMoney(r.cash)}</td>
                  <td className={r.credit ? 'is-credit' : ''}>{formatMoney(r.credit)}</td>
                  <td>{formatMoney(r.cash + r.credit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{rows.length === 1 ? 'Total' : `Total, ${rows.length} days`}</td>
                <td>{total.buys}</td>
                <td>{total.cards}</td>
                <td className="is-cash">{formatMoney(total.cash)}</td>
                <td className="is-credit">{formatMoney(total.credit)}</td>
                <td>{formatMoney(total.cash + total.credit)}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </>
      )}
    </Modal>
  );
}
