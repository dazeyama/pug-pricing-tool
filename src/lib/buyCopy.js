// The copy button's row (decision 580): one buy, as the store's Google Sheet of buys keeps it. Ten cells,
// tab-separated, so each pastes into its own cell (the owner: "make them paste into unique cells"):
// who took the buy, when, the customer, the phone, the ID's last four, Cash or Credit, who paid, when, the amount,
// and where the cash went. Used by BUY COMPLETE (Buy tab), a single buy's ⋯ and a paid overnight buy's ⋯.

import { formatInTimeZone } from 'date-fns-tz';
import { STORE_TZ } from './time.js';
import { formatPhone } from './phone.js';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** "11/10/2026", the store's day; '' for none. */
export function sheetDate(when) {
  if (!when) return '';
  const d = new Date(when);
  return Number.isNaN(d.getTime()) ? '' : formatInTimeZone(d, STORE_TZ, 'MM/dd/yyyy');
}

/** "$90.00", always two decimals; '' for none. */
export function sheetMoney(amount) {
  if (amount == null || amount === '' || Number.isNaN(Number(amount))) return '';
  return usd.format(Number(amount));
}

/** Where the cash went, as the sheet says it: Till, Backroom, NA on credit, '' for a cash buy with none kept. */
export function sheetLocation(method, location) {
  if (method === 'credit') return 'NA';
  if (location === 'till') return 'Till';
  if (location === 'backroom') return 'Backroom';
  return '';
}

/** What a Copy item's tooltip says it copies. */
export const COPY_TITLE = 'Copy this buy for the buys sheet, each in its own cell: worker, date, customer, phone, '
  + 'ID, Cash or Credit, who paid, date paid, amount, cash location. Changes nothing.';

/**
 * Copies the buy's row to the clipboard, and says so: the toast's text and kind.
 * @returns {Promise<[string, 'ok'|'err']>}
 */
export async function copyBuyRow(buy, staffName, what = 'this buy') {
  try {
    await navigator.clipboard.writeText(buyCopyRow(buy, staffName));
    return [`Copied ${what} for the buys sheet: paste it into the first cell of a row.`, 'ok'];
  } catch {
    return ["Couldn't copy to the clipboard. Keep this window in front, then try again.", 'err'];
  }
}

/** A cell's text: a tab or a line break would split it, so each becomes a space. */
const cell = (value) => String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();

/**
 * The buy's row, ten cells joined by tabs. A walk-in was taken by whoever confirmed it, when; an overnight buy,
 * by whoever started it, when. Who paid is `paid_by`, kept since decision 580: a buy paid before has none, so
 * that cell is empty (as is the cash location of a cash buy confirmed before).
 * @param {object} buy  a `buys` row: kind, confirmed_by, confirmed_at, created_by, created_at, customer_name,
 *   phone, id_last4, paid_method, paid_by, paid_at, paid_price, cash_location
 * @param {(id: string) => string|null|undefined} staffName  a staff user's name by id
 * @returns {string}
 */
export function buyCopyRow(buy, staffName = () => '') {
  const walkIn = buy.kind === 'walk_in';
  const takenBy = walkIn ? buy.confirmed_by ?? buy.created_by : buy.created_by;
  const takenAt = walkIn ? buy.confirmed_at ?? buy.created_at : buy.created_at;
  const name = (id) => (id ? staffName(id) ?? '' : '');
  const method = buy.paid_method === 'cash' ? 'Cash' : buy.paid_method === 'credit' ? 'Credit' : '';
  return [
    name(takenBy),
    sheetDate(takenAt),
    buy.customer_name,
    buy.phone ? formatPhone(buy.phone) : '',
    buy.id_last4 ?? '',
    method,
    name(buy.paid_by),
    sheetDate(buy.paid_at),
    sheetMoney(buy.paid_price),
    buy.paid_method ? sheetLocation(buy.paid_method, buy.cash_location) : '',
  ].map(cell).join('\t');
}
