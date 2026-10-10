// Past customers (owner, 2026-10-09; migration 0048): the `customers` table
// keeps every customer name used on a confirmed buy or a customer collection,
// with the phone number most recently recorded with it. The name fields of
// CONFIRM BUY and + Price Collection suggest them as a name is typed, the way
// card search suggests card names. No ID numbers are kept. Pure, so the tests
// run under Node.

/** Typing under this many characters suggests nothing. */
export const MIN_CHARS = 2;
/** Suggestions shown at most. */
export const SHOW = 8;

/** A name's key, as the database makes it: trimmed, single spaces, lower case. */
export function customerKey(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Text for a LIKE pattern: %, _ and \ match only themselves. */
export function likeEscape(text) {
  return String(text ?? '').replace(/[%_\\]/g, (c) => `\\${c}`);
}

/**
 * Customers for what's typed, best first: names that start with it, then
 * names with a word that starts with it, then any that contain it; the most
 * recently seen first within each.
 * @param {{ name_key?: string, name: string, phone: string|null, last_used: string }[]} rows
 * @param {string} typed
 * @param {number} [limit]
 */
export function rankCustomers(rows, typed, limit = SHOW) {
  const q = customerKey(typed);
  if (q.length < MIN_CHARS) return [];
  const tier = (key) => {
    if (key.startsWith(q)) return 0;
    if (` ${key}`.includes(` ${q}`)) return 1;
    return key.includes(q) ? 2 : 3;
  };
  return (rows ?? [])
    .map((r) => ({ row: r, tier: tier(r.name_key ?? customerKey(r.name)), at: Date.parse(r.last_used) || 0 }))
    .filter((x) => x.tier < 3)
    .sort((a, b) => a.tier - b.tier || b.at - a.at)
    .slice(0, limit)
    .map((x) => x.row);
}
