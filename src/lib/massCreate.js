// The Mass Create file (docs/EXPORT_FUNCTION.md 4): the CSV CC's Mass Create
// takes, built from exported lines' stamps. Pure, so the tests run under Node.

import Papa from 'papaparse';
import { formatInTimeZone } from 'date-fns-tz';
import { STORE_TZ } from './time.js';

export const COLUMNS = ['Add Qty', 'Product Name', 'Category', 'Condition', 'Language', 'Sell Price', 'Custom SKU'];

/**
 * CC's condition words, exactly as the store's inventory writes them: CC
 * matches them letter for letter, and the help page's "Light Play"… didn't
 * update a thing (owner, 2026-10-09; migration 0046 stamps the same).
 */
export const CONDITION_WORDS = {
  NM: 'Near Mint', LP: 'Lightly Played', MP: 'Moderately Played', HP: 'Heavily Played', DMG: 'Damaged',
};
const CONDITION_ORDER = Object.values(CONDITION_WORDS);
const NEAR_MINT = CONDITION_WORDS.NM;

/** A product's key in the file: its name and category. */
export const productKey = (name, category) => `${name}\u0000${category}`;

/**
 * The Near Mint prices the file sets with a 0-quantity row (owner,
 * 2026-10-11; decision 598), by product (productKey): every product
 * with worse-condition cards and no Near Mint card in the file, at the
 * printing's Near Mint price fetched fresh at the export (sellPrice.js,
 * stamped as cc_sell_basis.nearMint), the highest of its cards'. Crystal
 * Commerce prices the worse conditions from it. A product with Near Mint
 * cards gets none: their own Sell Price sets NM. A product with no NM price
 * today (or exported before decision 598) gets none either: its cards
 * go in at the NM price Crystal Commerce already has.
 * @param {object[]} lines  exported lines (cc_* stamps)
 * @returns {Map<string, number>}  the NM price by product (productKey)
 */
export function nearMintPrices(lines) {
  const best = new Map();
  const withNearMint = new Set();
  for (const l of lines) {
    if (l.cc_status !== 'exported' || !l.cc_product_name) continue;
    const key = productKey(l.cc_product_name, l.cc_category);
    if (l.cc_condition === NEAR_MINT) {
      withNearMint.add(key);
      continue;
    }
    const price = Number(l.cc_sell_basis?.nearMint);
    if (price > 0 && !(best.get(key) >= price)) best.set(key, price);
  }
  for (const key of withNearMint) best.delete(key);
  return best;
}

/**
 * The export's code (spec 4.4): the export's date in store time, month with
 * no leading zero, day always two digits, two-digit year: 06/17/26 → "61726",
 * 11/01/26 → "110126".
 */
export function customSkuFor(when = new Date()) {
  return formatInTimeZone(when, STORE_TZ, 'Mddyy');
}

/**
 * The same code for a calendar day ("2026-10-16" → "101626"): a day page's
 * export is stamped with the day exported, not the day it's run (owner,
 * 2026-10-17; migration 0071). "Export single buy" adds the buy's number:
 * "101626-42".
 */
export function customSkuForDay(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  return `${m}${String(d).padStart(2, '0')}${String(y % 100).padStart(2, '0')}`;
}

/**
 * The Custom SKU the export dialog's Confirm step shows, as the server will stamp it: a day page's is
 * its day; a single buy's that day and the buy's number; a collection's or project's today and its
 * number of the day, given only when it saves (decision 511), so "102426-#"; Can't upload cards',
 * Bulk pulled from exports' and a file-only download's, today.
 * @param {{ kind: string, day?: string, number?: number }|null} target
 */
export function confirmSku(target, fileOnly = false, when = new Date()) {
  if (target?.kind === 'day') return customSkuForDay(target.day);
  if (target?.kind === 'buy' && target.day) return `${customSkuForDay(target.day)}-${target.number}`;
  if (target?.kind === 'collection' && !fileOnly) return `${customSkuFor(when)}-#`;
  return customSkuFor(when);
}

/**
 * The Mass Create file's name (decision 600): its prefix and the Custom SKU on its rows in place of the
 * date, "cc-mass-create-magic-112126.csv", a single buy's "cc-mass-create-magic-112126-42.csv", a
 * collection's "cc-mass-create-jordan-reyes-112126-3.csv". The same file again from cards stamped by more
 * than one export (a day exported before migration 0071) names them all, "-110126_110226".
 * @param {string} prefix  "cc-mass-create-magic", "cc-mass-create-<customer>", "cc-mass-create-cant-upload"
 * @param {string|string[]} skus
 */
export function massCreateFileName(prefix, skus) {
  const list = [...new Set([skus].flat().filter(Boolean))].sort();
  return `${prefix}${list.length ? `-${list.join('_')}` : ''}.csv`;
}

/**
 * A line's Custom SKU in the file (decision 603): its stamp, with a "u" when staff gave it its product at the
 * export, a card the printout put under Unmatched (Needs a choice, or no product): "112126u", "112126-42u",
 * "112126-3u", so it can be searched for by the printout's SKU (decision 602). The mark is in its Sell Price
 * basis (`cc_sell_basis.chosen`, saved with the export), so the same file again carries it; the stamped
 * `cc_custom_sku` itself stays the export's own.
 */
export const fileSku = (l) => (l.cc_custom_sku ? `${l.cc_custom_sku}${l.cc_sell_basis?.chosen ? 'u' : ''}` : '');

/**
 * The file's rows from exported lines (each with its cc_* stamps and
 * quantity): lines with the same product, condition, Sell Price and Custom SKU (fileSku) merge,
 * their quantities added; sorted by Category, Product Name, then condition.
 * Only Near Mint rows carry a price (owner, 2026-10-11): CC works out every
 * other condition from NM, so worse-condition rows leave Sell Price blank
 * (adding cards without touching the price), and a product with no Near
 * Mint card gets a 0-quantity NM row at today's NM price (nearMintPrices;
 * decision 598).
 * @param {object[]} lines
 * @param {Map<string, number>} [nearMint]  the NM prices by product, when the lines don't carry their
 *   Sell Price basis (export_lines' answer: the export dialog gives its own); else read from it
 */
export function massCreateRows(lines, nearMint = nearMintPrices(lines)) {
  const rows = new Map();
  for (const l of lines) {
    if (l.cc_status !== 'exported' || !l.cc_product_name) continue;
    // A product the file sets NM for: its 0-quantity row, once, with the first such card's Custom SKU.
    const nmKey = productKey(l.cc_product_name, l.cc_category);
    const nm = l.cc_condition !== NEAR_MINT ? nearMint.get(nmKey) : null;
    if (nm != null && !rows.has(`nm\u0000${nmKey}`)) {
      rows.set(`nm\u0000${nmKey}`, {
        'Add Qty': 0,
        'Product Name': l.cc_product_name,
        Category: l.cc_category,
        Condition: NEAR_MINT,
        Language: 'English',
        'Sell Price': Number(nm).toFixed(2),
        'Custom SKU': fileSku(l),
      });
    }
    const price = l.cc_condition === NEAR_MINT ? Number(l.cc_sell_price).toFixed(2) : '';
    const key = [l.cc_product_name, l.cc_category, l.cc_condition, price, fileSku(l)].join('\u0000');
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
        'Custom SKU': fileSku(l),
      });
    }
  }
  return [...rows.values()].sort((a, b) => a.Category.localeCompare(b.Category)
    || a['Product Name'].localeCompare(b['Product Name'])
    || CONDITION_ORDER.indexOf(a.Condition) - CONDITION_ORDER.indexOf(b.Condition));
}

/**
 * The exported cards a page's own export stamped, for "Download the same file again" (decision
 * 372): not those a later Can't upload cards export stamped, which went in that export's file.
 * @param {object[]} lines
 * @param {Set<string>} restamped  stamp times of Can't upload cards exports (ccExport.js restampTimes)
 */
export const withoutRestamps = (lines, restamped) => lines
  .filter((l) => l.cc_status === 'exported' && !restamped.has(l.cc_exported_at));

/** The CSV text: UTF-8, no byte-order mark, \n line endings, quotes only where needed (spec 4.3). */
export function massCreateCsv(rows) {
  return Papa.unparse({ fields: COLUMNS, data: rows.map((r) => COLUMNS.map((c) => r[c])) }, { newline: '\n' });
}

/** A file-safe piece of a name: "Jordan Reyes!" → "jordan-reyes". */
export const fileSafe = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'export';
