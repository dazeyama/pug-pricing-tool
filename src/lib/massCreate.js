// The Mass Create file (docs/EXPORT_FUNCTION.md 4): the CSV CC's Mass Create
// takes, built from exported lines' stamps. Pure, so the tests run under Node.

import Papa from 'papaparse';
import { formatInTimeZone } from 'date-fns-tz';
import { STORE_TZ } from './time.js';

export const COLUMNS = ['Add Qty', 'Product Name', 'Category', 'Condition', 'Language', 'Sell Price', 'Custom SKU'];

/** CC's condition words, exactly as its help page writes them (spec 3.1). */
export const CONDITION_WORDS = {
  NM: 'Near Mint', LP: 'Light Play', MP: 'Moderate Play', HP: 'Heavy Play', DMG: 'Damaged',
};
const CONDITION_ORDER = Object.values(CONDITION_WORDS);

/**
 * The export's code (spec 4.4): the export's date in store time, month with
 * no leading zero, day always two digits, two-digit year: 06/17/26 → "61726",
 * 11/01/26 → "110126".
 */
export function customSkuFor(when = new Date()) {
  return formatInTimeZone(when, STORE_TZ, 'Mddyy');
}

/**
 * The file's rows from exported lines (each with its cc_* stamps and
 * quantity): lines with the same product, condition and Sell Price merge,
 * their quantities added; sorted by Category, Product Name, then condition.
 * @param {object[]} lines
 */
export function massCreateRows(lines) {
  const rows = new Map();
  for (const l of lines) {
    if (l.cc_status !== 'exported' || !l.cc_product_name) continue;
    const price = Number(l.cc_sell_price).toFixed(2);
    const key = [l.cc_product_name, l.cc_category, l.cc_condition, price].join('\u0000');
    const row = rows.get(key);
    if (row) row['Add Qty'] += l.quantity;
    else {
      rows.set(key, {
        'Add Qty': l.quantity,
        'Product Name': l.cc_product_name,
        Category: l.cc_category,
        Condition: l.cc_condition,
        Language: 'English',
        'Sell Price': price,
        'Custom SKU': l.cc_custom_sku ?? '',
      });
    }
  }
  return [...rows.values()].sort((a, b) => a.Category.localeCompare(b.Category)
    || a['Product Name'].localeCompare(b['Product Name'])
    || CONDITION_ORDER.indexOf(a.Condition) - CONDITION_ORDER.indexOf(b.Condition));
}

/** The CSV text: UTF-8, no byte-order mark, \n line endings, quotes only where needed (spec 4.3). */
export function massCreateCsv(rows) {
  return Papa.unparse({ fields: COLUMNS, data: rows.map((r) => COLUMNS.map((c) => r[c])) }, { newline: '\n' });
}

/** A file-safe piece of a name: "Jordan Reyes!" → "jordan-reyes". */
export const fileSafe = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'export';
