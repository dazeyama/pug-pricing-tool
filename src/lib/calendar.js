import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { STORE_TZ } from './time.js';

// The Calendar's dates (spec 10): plain "2026-08" months and "2026-08-17"
// days on the store's calendar. Buys are stored as UTC instants; a day or a
// month is turned into a pair of instants (from ≤ t < to) to query them.

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "2026-08-17": the store's calendar day of an instant. */
export function storeDay(when = new Date()) {
  return formatInTimeZone(when, STORE_TZ, 'yyyy-MM-dd');
}

/** "2026-08": a valid month from the URL, else the store's current month. */
export function parseMonth(text, now = new Date()) {
  return MONTH.test(String(text ?? '')) ? text : storeDay(now).slice(0, 7);
}

/** A valid "2026-08-17" (a real date), or null. */
export function parseDay(text) {
  const m = DAY.exec(String(text ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDate() === Number(m[3]) ? text : null;
}

/** "2026-08" moved by n months: shiftMonth("2026-01", -1) → "2025-12". */
export function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "August 2026" */
export function monthTitle(month) {
  const [y, m] = month.split('-').map(Number);
  return formatInTimeZone(new Date(Date.UTC(y, m - 1, 15)), 'UTC', 'MMMM yyyy');
}

/** "Saturday, August 17, 2026" */
export function dayTitle(day) {
  const [y, m, d] = day.split('-').map(Number);
  return formatInTimeZone(new Date(Date.UTC(y, m - 1, d, 12)), 'UTC', 'EEEE, MMMM d, yyyy');
}

/**
 * A month's weeks, Sunday first (owner's decision): each week 7 cells, a day
 * ("2026-08-01") or null for the days of the months either side. Always 6
 * weeks, the most a month can span, so the Calendar is the same size every
 * month (owner, 2026-09-29).
 * @returns {(string|null)[][]}
 */
export function monthGrid(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  while (weeks.length < 6) weeks.push(Array.from({ length: 7 }, () => null));
  return weeks;
}

/** The instants a store month spans: { from, to } with from ≤ t < to. */
export function monthRange(month) {
  return {
    from: fromZonedTime(`${month}-01T00:00:00`, STORE_TZ),
    to: fromZonedTime(`${shiftMonth(month, 1)}-01T00:00:00`, STORE_TZ),
  };
}

/** The instants a store day spans (23 or 25 hours on a clock change). */
export function dayRange(day) {
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextDay = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  return {
    from: fromZonedTime(`${day}T00:00:00`, STORE_TZ),
    to: fromZonedTime(`${nextDay}T00:00:00`, STORE_TZ),
  };
}
