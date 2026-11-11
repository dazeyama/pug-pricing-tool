import Papa from 'papaparse';
import { supabase } from './supabase.js';
import { totalQty } from './ccNames.js';

// The stale cards file (decision 581; its tables and load, decision 580):Crystal Commerce's inventory search of the cards with no sale in a window,
// exported to CSV, uploaded in Settings beside the Master Crystal Inventory (its twin). It has the inventory file's
// own columns, one row a product; the app keeps each product's id, name and Total Qty, and the window the search
// was made with, which the file doesn't say (the days box). Kept whole, one file at a time: `stale_file_load`
// replaces it in one call (migration 0016). A product in it with Total Qty over 0 is a stale card.

/** The columns the app reads from every row. */
export const STALE_COLUMNS = ['Product ID', 'Product Name', 'Total Qty'];
/** The most products one file may hold: `stale_file_load`'s own limit. */
export const MAX_STALE_ROWS = 20000;
/** The window, in days, when the box isn't changed (the owner's search: "In the past 180 days"). */
export const DEFAULT_STALE_DAYS = 180;
/** The CSV as picked: the search's file is small (503 products, 137 KB); the whole inventory is 40 MB and more. */
const MAX_BYTES = 20 * 1024 * 1024;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * The days box's text as a window: a whole number of days from 1 to 3650, else null.
 * @param {string|number} text
 * @returns {number|null}
 */
export function parseDays(text) {
  const s = String(text ?? '').trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 3650 ? n : null;
}

/**
 * The file's text, read and checked: its products as `stale_file_load` takes them (the first of a repeated
 * Product ID kept), how many, and how many are in stock (Total Qty over 0). Throws an Error with the panel's words
 * when it isn't the stale search's export.
 * @param {string} text  the CSV
 * @param {string} name  the file's name, for the messages
 * @returns {{ rows: { product_id: string, product_name: string, total_qty: number|null }[], products: number,
 *   inStock: number }}
 */
export function staleFromText(text, name) {
  // A byte-order mark before the header is dropped, so the first column is still "Product ID".
  const clean = String(text ?? '');
  const parsed = Papa.parse(clean.charCodeAt(0) === 0xfeff ? clean.slice(1) : clean, { header: true, skipEmptyLines: 'greedy' });
  if (parsed.errors.some((e) => e.type === 'Quotes')) {
    throw new Error(`"${name}" couldn't be read: a quote isn't closed.`);
  }
  const columns = (parsed.meta.fields ?? []).map((c) => String(c).trim());
  const missing = STALE_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length) {
    throw new Error(`"${name}" has no ${missing.join(', ')} column. It doesn't look like a Crystal Commerce inventory search export.`);
  }
  const seen = new Set();
  const rows = [];
  for (const raw of parsed.data) {
    const row = Object.fromEntries(Object.entries(raw).map(([k, v]) => [String(k).trim(), v]));
    const id = String(row['Product ID'] ?? '').trim();
    const productName = String(row['Product Name'] ?? '').trim();
    if (!id || !productName || seen.has(id)) continue;
    seen.add(id);
    rows.push({ product_id: id, product_name: productName, total_qty: totalQty(row['Total Qty']) });
  }
  if (!rows.length) throw new Error(`"${name}" has a header row but no products.`);
  if (rows.length > MAX_STALE_ROWS) {
    throw new Error(`"${name}" has ${rows.length.toLocaleString()} products; the limit is ${MAX_STALE_ROWS.toLocaleString()}. `
      + 'It looks like the whole inventory: upload that under Master Crystal Inventory, and here only the search for cards with no sale.');
  }
  return { rows, products: rows.length, inStock: rows.filter((r) => r.total_qty > 0).length };
}

/**
 * A picked file, checked and read (staleFromText).
 * @param {File} file
 */
export async function readStaleCsv(file) {
  if (!/\.csv$/i.test(file.name)) {
    throw new Error(`"${file.name}" isn't a .csv file. Export the search from Crystal Commerce as CSV.`);
  }
  if (file.size === 0) throw new Error(`"${file.name}" is empty.`);
  if (file.size > MAX_BYTES) {
    throw new Error(`"${file.name}" is ${mb(file.size)}, too big for the stale cards search (the limit is ${mb(MAX_BYTES)}). `
      + 'The whole inventory goes under Master Crystal Inventory.');
  }
  const text = await file.text();
  if (text.slice(0, 64 * 1024).includes('\u0000')) {
    throw new Error(`"${file.name}" looks like a spreadsheet or other binary file, not a CSV.`);
  }
  return staleFromText(text, file.name);
}

// The database's refusals in the panel's words.
const LOAD_ERRORS = {
  no_user: 'Pick a user first, then choose the file again.',
  bad_days: 'The days must be a whole number from 1 to 3650.',
  bad_batch: `The file has too many products (the limit is ${MAX_STALE_ROWS.toLocaleString()}).`,
};

/**
 * Save a read file as the current one, replacing the one before (`stale_file_load`; the Changelog has it under
 * the user).
 * @param {{ filename: string, days: number, rows: object[], userId: string }} p
 * @returns {Promise<{ uploaded_at: string, products: number, in_stock: number }>}
 */
export async function loadStaleFile({ filename, days, rows, userId }) {
  const { data, error } = await supabase.rpc('stale_file_load', {
    p_filename: filename, p_days: days, p_rows: rows, p_user: userId,
  });
  if (error) {
    const known = Object.keys(LOAD_ERRORS).find((code) => error.message?.includes(code));
    throw new Error(known ? LOAD_ERRORS[known] : `Saving the file failed: ${error.message}`);
  }
  return data;
}

/**
 * The current file's row, or null when none is up.
 * @returns {Promise<{ original_filename: string, days: number, products: number, in_stock: number,
 *   uploaded_by: string|null, uploaded_at: string }|null>}
 */
export async function currentStaleFile() {
  const { data, error } = await supabase.from('stale_files').select('*').maybeSingle();
  if (error) throw new Error(`Couldn't read the stale cards file: ${error.message}`);
  return data ?? null;
}
