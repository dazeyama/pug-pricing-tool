// The Buys report (decision 585), opened from Home's Today card and modelled on Square's Sales report (the owner,
// 2026-11-10): any range of days, cash and credit paid a day on one graph, the range's totals beside the same span
// before, and a row a day. Every paid buy counts on the store's day it was paid (`paid_at`): walk-ins, overnight
// buys marked Paid/Ours and projects made buys, as Home's From the Till does (decision 584). Pure, for the tests.

import { isValuedBulk } from './bulk.js';

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The days the store is closed, which spike the graph (the owner: "those are days we're closed on"): Mon, Wed. */
export const CLOSED_DAYS = [1, 3];

const parts = (day) => day.split('-').map(Number);
const utc = (day) => {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d));
};

/** "2026-11-10" moved by n days. */
export function shiftDay(day, n) {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, both counted, oldest first. */
export function daysIn(from, to) {
  const out = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d);
  return out;
}

/** A Monday or a Wednesday. */
export const isClosedDay = (day) => CLOSED_DAYS.includes(utc(day).getUTCDay());

/** "Nov 10" */
export const shortDay = (day) => `${MONTHS[parts(day)[1] - 1]} ${parts(day)[2]}`;
/** "Tue, Nov 10" */
export const longDay = (day) => `${WEEK[utc(day).getUTCDay()]}, ${shortDay(day)}`;

/** The header's range: "Tue, Nov 10" for one day, else "Nov 4 to Nov 10, 2026". */
export function rangeText(from, to) {
  return from === to ? longDay(from) : `${shortDay(from)} to ${shortDay(to)}, ${parts(to)[0]}`;
}

/** The presets, as Square's: Today, the last 7 and 14 days, and this month so far. Last 7 days opens it. */
export function presets(today) {
  return [
    { key: 'today', label: 'Today', from: today, to: today },
    { key: '7', label: 'Last 7 days', from: shiftDay(today, -6), to: today },
    { key: '14', label: 'Last 14 days', from: shiftDay(today, -13), to: today },
    { key: 'month', label: 'This month', from: `${today.slice(0, 8)}01`, to: today },
  ];
}
export const DEFAULT_PRESET = '7';

/** The same number of days just before the range. */
export function spanBefore(from, to) {
  const n = daysIn(from, to).length;
  return { from: shiftDay(from, -n), to: shiftDay(from, -1) };
}

/** A card count as Home's Today card counts it: valued bulk on its own, struck cards gone, a placeholder a card. */
export const cardsIn = (lines) => (lines ?? []).reduce((n, l) => n + (isValuedBulk(l) || l.struck_at ? 0 : Number(l.quantity) || 0), 0);

const EMPTY = { cash: 0, credit: 0, buys: 0, cards: 0, till: 0, backroom: 0 };

/**
 * A row a day from `from` to `to`, oldest first, every day there even with no buys.
 * @param {{ day: string, paid_price: number|string, paid_method: string, cash_location: string|null,
 *   buy_lines?: object[] }[]} buys  paid buys, each with the store's day it was paid (`day`)
 * @returns {{ day: string, cash: number, credit: number, buys: number, cards: number, till: number,
 *   backroom: number }[]}
 */
export function dailyRows(buys, from, to) {
  const rows = new Map(daysIn(from, to).map((day) => [day, { day, ...EMPTY }]));
  for (const b of buys) {
    const row = rows.get(b.day);
    if (!row) continue;
    const paid = Number(b.paid_price) || 0;
    if (b.paid_method === 'cash') row.cash += paid;
    else if (b.paid_method === 'credit') row.credit += paid;
    if (b.paid_method === 'cash' && b.cash_location === 'till') row.till += paid;
    if (b.paid_method === 'cash' && b.cash_location === 'backroom') row.backroom += paid;
    row.buys += 1;
    row.cards += cardsIn(b.buy_lines);
  }
  // To the cent: sums of money in floating point drift (0.1 + 0.2).
  const cents = (n) => Math.round(n * 100) / 100;
  return [...rows.values()].map((r) => ({
    ...r, cash: cents(r.cash), credit: cents(r.credit), till: cents(r.till), backroom: cents(r.backroom),
  }));
}

/** The rows added up. */
export function totalOf(rows) {
  const t = rows.reduce((s, r) => ({
    cash: s.cash + r.cash, credit: s.credit + r.credit, buys: s.buys + r.buys, cards: s.cards + r.cards,
    till: s.till + r.till, backroom: s.backroom + r.backroom,
  }), { ...EMPTY });
  const cents = (n) => Math.round(n * 100) / 100;
  return { ...t, cash: cents(t.cash), credit: cents(t.credit), till: cents(t.till), backroom: cents(t.backroom) };
}

/** The graph's days: the closed ones left off when asked (the totals and the day rows still count them). */
export const graphRows = (rows, hideClosed) => (hideClosed ? rows.filter((r) => !isClosedDay(r.day)) : rows);
