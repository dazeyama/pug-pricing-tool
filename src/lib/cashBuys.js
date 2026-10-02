import Papa from 'papaparse';
import { supabase } from './supabase.js';
import { monthRange, monthTitle, storeDay } from './calendar.js';
import { formatMoney } from './money.js';
import { formatPhone } from './phone.js';

// Cash buys (owner, 2026-10-02): one month's buys paid in cash, for the
// store's records and taxes. Walk-in buys confirmed that month and paid in
// cash, and collections (and projects) marked Paid/Ours in cash that month,
// by the day they were paid, oldest first. Each download is logged, so a
// finished month whose file was never downloaded can be pointed out.

/** The changelog entry a download leaves; `day` is the month's first day. */
export const CASH_DOWNLOADED = 'cash_buys_downloaded';

export const cashFileName = (month) => `cash-buys-${month}.csv`;

const market = (lines) => Math.round((lines ?? []).reduce((s, l) => s + Number(l.unit_price) * l.quantity, 0) * 100) / 100;

/**
 * The month's cash buys, oldest first.
 * @param {string} month  "2026-09"
 * @returns {Promise<{ data: object[]|null, error: any }>}
 */
export async function loadCashBuys(month) {
  const { from, to } = monthRange(month);
  const range = (q, column) => q.gte(column, from.toISOString()).lt(column, to.toISOString());
  const [walkIns, collections] = await Promise.all([
    range(supabase.from('buys')
      .select('id, confirmed_at, confirmed_by, customer_name, phone, paid_price, buy_lines(unit_price, quantity)')
      .eq('kind', 'walk_in').eq('status', 'confirmed').eq('paid_method', 'cash'), 'confirmed_at'),
    // Paid/Ours or Completed since: still paid. Can't upload cards is never paid.
    range(supabase.from('buys')
      .select('id, paid_at, created_by, project, customer_name, phone, paid_price, buy_lines(unit_price, quantity)')
      .eq('kind', 'collection').in('status', ['paid', 'completed']).eq('paid_method', 'cash')
      .is('system_key', null), 'paid_at'),
  ]);
  const error = walkIns.error ?? collections.error;
  if (error) return { data: null, error };

  // Who bought a collection: whoever last marked it Paid/Ours (its changelog
  // entry with the payment); else whoever made it (a project converted from
  // a walk-in buy keeps the buy's user there).
  const paidBy = new Map();
  const ids = collections.data.map((b) => b.id);
  if (ids.length) {
    const { data, error: e } = await supabase.from('events')
      .select('target_id, staff_user_id, staff_user_name')
      .eq('action', 'collection_status_changed')
      .in('target_id', ids)
      // As JSON text: an array here would be sent as a Postgres array.
      .contains('fields', JSON.stringify([{ field: 'paid' }]))
      .order('at', { ascending: false });
    if (e) return { data: null, error: e };
    for (const ev of data) if (!paidBy.has(ev.target_id)) paidBy.set(ev.target_id, ev);
  }

  const rows = [
    ...walkIns.data.map((b) => ({
      id: b.id, at: b.confirmed_at, userId: b.confirmed_by, userName: null, type: 'Walk-in buy',
      customer: b.customer_name, phone: b.phone, market: market(b.buy_lines), paid: Number(b.paid_price),
    })),
    ...collections.data.map((b) => {
      const ev = paidBy.get(b.id);
      return {
        id: b.id, at: b.paid_at, userId: ev?.staff_user_id ?? b.created_by, userName: ev?.staff_user_name ?? null,
        type: b.project ? 'Project' : 'Collection',
        // A project's name: a converted buy's customer, unless renamed.
        customer: b.customer_name, phone: b.phone, market: market(b.buy_lines), paid: Number(b.paid_price),
      };
    }),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
  return { data: rows, error: null };
}

/**
 * The file: User bought · Date bought · Customer · Phone · Type · Market
 * price · Paid in cash. Formula-looking text is escaped (a name typed as
 * "=…" stays text in a spreadsheet).
 * @param {object[]} rows  from loadCashBuys
 * @param {(id: string) => { name: string }|null} byId  staff lookup
 */
export function cashBuysCsv(rows, byId) {
  return Papa.unparse({
    fields: ['User bought', 'Date bought', 'Customer', 'Phone', 'Type', 'Market price', 'Paid in cash'],
    data: rows.map((r) => [
      byId(r.userId)?.name ?? r.userName ?? '',
      storeDay(new Date(r.at)),
      r.customer ?? '',
      r.phone ? formatPhone(r.phone) : '',
      r.type,
      r.market.toFixed(2),
      r.paid.toFixed(2),
    ]),
  }, { newline: '\r\n', escapeFormulae: true });
}

/** Hand the browser the file. */
export function saveCashBuys(csv, month) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = cashFileName(month);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Log a download (the Changelog's Buys), which also marks the month downloaded. */
export function recordCashDownload(month, rows, user, deviceId) {
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  return supabase.from('events').insert({
    staff_user_id: user.id,
    staff_user_name: user.name,
    staff_user_color: user.color,
    device_id: deviceId,
    kind: 'buy',
    action: CASH_DOWNLOADED,
    target_name: `Cash buys · ${monthTitle(month)}`,
    games: [],
    day: `${month}-01`,
    added: 0,
    removed: 0,
    lines: [],
    fields: [],
    summary: `Cash buys for ${monthTitle(month)} downloaded: ${rows.length} buy${rows.length === 1 ? '' : 's'}, ${formatMoney(paid)} paid in cash.`,
  });
}
