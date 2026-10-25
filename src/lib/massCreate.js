// The Mass Create file (docs/EXPORT_FUNCTION.md 4): the CSV CC's Mass Create
// takes, built from exported lines' stamps. Pure, so the tests run under Node.

import Papa from 'papaparse';
import { formatInTimeZone } from 'date-fns-tz';
import { STORE_TZ } from './time.js';
import { SELL_FLOOR, roundUpPrice } from './money.js';

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
const CONDITION_CODES = Object.fromEntries(Object.entries(CONDITION_WORDS).map(([code, word]) => [word, code]));
const NEAR_MINT = CONDITION_WORDS.NM;

/** A product's key in the file: its name and category. */
export const productKey = (name, category) => `${name}\u0000${category}`;

/**
 * The Near Mint price a worse condition's Sell Price stands for (owner,
 * 2026-10-11): CC prices every condition from Near Mint, so a card added in
 * MP sets NM to its Sell Price ÷ MP's Master Fallback Percentage, rounded up
 * by the store's steps, at least $0.40. $87 at 80% → $108.75 → $109.
 * @returns {number|null}  null without a percentage to divide by
 */
export function nearMintPrice(sell, conditionPct) {
  const pct = Number(conditionPct);
  if (sell == null || !(pct > 0)) return null;
  return Math.max(SELL_FLOOR, roundUpPrice((Number(sell) * 100) / pct));
}

/**
 * The Near Mint prices the file sets with a 0-quantity row (owner,
 * 2026-10-11), by product (productKey): every product with worse-condition
 * cards and no Near Mint card in the file, priced from the best worse
 * condition there (LP before MP…), its highest Sell Price. A product with
 * Near Mint cards gets none: their own Sell Price sets NM. Each line's
 * percentage is the one stamped at its export (cc_sell_basis.conditionPct),
 * else `pct`'s.
 * @param {object[]} lines  exported lines (cc_* stamps)
 * @param {Record<string, number>} pct  Master Fallback Percentages (Magic)
 * @returns {Map<string, { price: number, from: string, sell: number, pct: number,
 *   name: string, category: string, sku: string }>}
 */
export function nearMintPrices(lines, pct) {
  const best = new Map();
  const withNearMint = new Set();
  for (const l of lines) {
    if (l.cc_status !== 'exported' || !l.cc_product_name) continue;
    const key = productKey(l.cc_product_name, l.cc_category);
    if (l.cc_condition === NEAR_MINT) {
      withNearMint.add(key);
      continue;
    }
    const code = CONDITION_CODES[l.cc_condition] ?? null;
    const rank = code ? CONDITION_ORDER.indexOf(l.cc_condition) : CONDITION_ORDER.length;
    const sell = Number(l.cc_sell_price);
    const was = best.get(key);
    if (!was || rank < was.rank || (rank === was.rank && sell > was.sell)) {
      best.set(key, { rank, code, sell, pct: l.cc_sell_basis?.conditionPct ?? pct?.[code], line: l });
    }
  }
  const out = new Map();
  for (const [key, b] of best) {
    if (withNearMint.has(key)) continue;
    const price = nearMintPrice(b.sell, b.pct);
    if (price == null) continue;
    out.set(key, {
      price, from: b.code, sell: b.sell, pct: Number(b.pct),
      name: b.line.cc_product_name, category: b.line.cc_category, sku: b.line.cc_custom_sku ?? '',
    });
  }
  return out;
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
 * The file's rows from exported lines (each with its cc_* stamps and
 * quantity): lines with the same product, condition and Sell Price merge,
 * their quantities added; sorted by Category, Product Name, then condition.
 * Only Near Mint rows carry a price (owner, 2026-10-11): CC works out every
 * other condition from NM, so worse-condition rows leave Sell Price blank
 * (adding cards without touching the price), and a product with no Near
 * Mint card gets a 0-quantity NM row priced from them (nearMintPrices).
 * @param {object[]} lines
 * @param {Record<string, number>} pct  Master Fallback Percentages (Magic)
 */
export function massCreateRows(lines, pct) {
  const rows = new Map();
  for (const l of lines) {
    if (l.cc_status !== 'exported' || !l.cc_product_name) continue;
    const price = l.cc_condition === NEAR_MINT ? Number(l.cc_sell_price).toFixed(2) : '';
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
  for (const [key, nm] of nearMintPrices(lines, pct)) {
    rows.set(`nm\u0000${key}`, {
      'Add Qty': 0,
      'Product Name': nm.name,
      Category: nm.category,
      Condition: NEAR_MINT,
      Language: 'English',
      'Sell Price': nm.price.toFixed(2),
      'Custom SKU': nm.sku,
    });
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
