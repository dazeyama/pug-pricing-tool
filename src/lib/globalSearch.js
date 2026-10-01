// The header's global search (spec 13): what to ask the database, and how
// its lines group into results. Pure functions, so the tests run under Node.

import { lineBody } from './lineFormat.js';
import { nameKey } from './normalize.js';
import { normNumber, numericSize, parseQuery, withoutGuessedSetCode } from './query.js';

/** Typing under this many characters doesn't search. */
export const MIN_CHARS = 2;
/** The database returns at most this many lines. */
export const LINE_LIMIT = 200;

/**
 * The query as `global_search` arguments, read like the main search (spec
 * 8.2): a trailing word is a set code only if a stored line uses it.
 * @param {string} text
 * @param {Set<string>} knownCodes  lower-case set codes
 * @returns {{ args: object, retry: object|null }|null}  null when there's nothing to search;
 *   `retry` is the reading without a guessed set code, for when the first finds nothing
 */
export function searchArgs(text, knownCodes) {
  const input = String(text ?? '').trim();
  if (input.length < MIN_CHARS) return null;
  const parsed = parseQuery(input, (token) => knownCodes.has(token.toLowerCase()));
  const toArgs = (p) => ({
    p_name: nameKey(p.name),
    p_number: p.number,
    p_size: numericSize(p.size),
    p_set: p.setCode,
  });
  const args = toArgs(parsed);
  if (!args.p_name && !args.p_number && !args.p_set) return null;
  const other = withoutGuessedSetCode(input, parsed);
  return { args, retry: other ? toArgs(other) : null };
}

/** One printing: game, language, set, number, finish, 1st Edition and treatments. */
export function printingKey(line) {
  return [
    line.game, line.lang ?? 'en', String(line.set_code).toLowerCase(), normNumber(line.collector_number),
    line.finish, line.first_edition ? '1' : '0', [...(line.treatments ?? [])].sort().join('+'),
  ].join('|');
}

/**
 * Lines from `global_search` as results: one group per printing, in the
 * order they first appear (newest first), each with a row per buy and per
 * collection holding it, quantities summed.
 * @returns {{ key: string, game: string, heading: string, buys: object[], collections: object[] }[]}
 */
export function groupResults(lines) {
  const groups = new Map();
  for (const l of lines ?? []) {
    const key = printingKey(l);
    let g = groups.get(key);
    if (!g) {
      // The printing without its condition: "Lightning Bolt (2X2) 161 *F*".
      g = { key, game: l.game, heading: lineBody({ ...l, condition: 'NM' }), image: l.image_url, rows: new Map() };
      groups.set(key, g);
    }
    let row = g.rows.get(l.buy_id);
    if (!row) {
      row = {
        key: `${key}|${l.buy_id}`,
        buyId: l.buy_id,
        kind: l.kind,
        status: l.status,
        paidMethod: l.paid_method,
        customerName: l.customer_name,
        confirmedAt: l.confirmed_at,
        confirmedBy: l.confirmed_by,
        number: l.buy_number,
        game: l.game,
        qty: 0,
        lineIds: [],
      };
      g.rows.set(l.buy_id, row);
    }
    row.qty += l.quantity;
    row.lineIds.push(l.line_id);
    if (!g.image && l.image_url) g.image = l.image_url;
  }
  return [...groups.values()].map(({ rows, ...g }) => {
    const all = [...rows.values()];
    return { ...g, buys: all.filter((r) => r.kind === 'walk_in'), collections: all.filter((r) => r.kind === 'collection') };
  });
}

/** Every row in display order (a group's buys, then its collections), for ↑/↓. */
export function flatRows(groups) {
  return groups.flatMap((g) => [...g.buys, ...g.collections]);
}
