import { catalogPath, parseProductName, totalQty } from './ccNames.js';
import { parseMoney } from './money.js';

// Ctrl+Click on Settings → Master Crystal Inventory's Download (decision 497,
// a secret like 285's): every Magic single in stock under $10, as a plain
// list, "1 <card name>" a line, for the owner's "PUG Under 10" collection in
// Collection Manager. Read from the stored CSV (cc_products has no price).
// Pure, for tests.

/** Below this Sell Price a product counts. */
export const UNDER_PRICE = 10;

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Is this CC product URL a Magic single's (its catalog path in a `magic_the_gathering_singles-…` category)? */
export const isMagicSingle = (url) => catalogPath(url).startsWith('magic_the_gathering_singles-');

/**
 * One inventory CSV row (PapaParse, header: true): its card name, without the
 * bracket, foil kind or variants ("A // B" as written), when it's a Magic
 * single with 1 or more in stock and a Sell Price under $10; otherwise null.
 * A blank or unreadable price is left out.
 * @returns {{ name: string, key: string }|null}
 */
export function underTenName(row) {
  if (!isMagicSingle(row?.URL)) return null;
  if (!((totalQty(row['Total Qty']) ?? 0) >= 1)) return null;
  const price = parseMoney(row['Sell Price']);
  if (price == null || price >= UNDER_PRICE) return null;
  const { base, baseKey } = parseProductName(row['Product Name']);
  return base ? { name: base, key: baseKey } : null;
}

/**
 * The list from the rows' names: once per name (the first spelling met), A to Z.
 * @param {Iterable<{ name: string, key: string }>} names
 * @returns {{ text: string, names: number }}
 */
export function underTenText(names) {
  const byKey = new Map();
  for (const n of names) if (n && !byKey.has(n.key)) byKey.set(n.key, n.name);
  const sorted = [...byKey.values()].sort(collator.compare);
  return { text: sorted.map((name) => `1 ${name}`).join('\n'), names: sorted.length };
}
