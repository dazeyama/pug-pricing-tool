// The header's global search (spec 13): what to ask the database, and how
// its lines group into results. Pure functions, so the tests run under Node.

import { storeDay } from './calendar.js';
import { nameKey } from './normalize.js';
import { normNumber, numericSize, parseQuery, withoutGuessedSetCode } from './query.js';

/** Typing under this many characters doesn't search. */
export const MIN_CHARS = 2;
/** The database returns at most this many lines. */
export const LINE_LIMIT = 200;
/** Conditions in their usual order, best first. */
const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];

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
 * Lines from `global_search` as results (owner, 2026-09-30): collections
 * pinned in a section of their own at the top (they sit in their own place
 * in the store), newest first; then buys filed under the day they were
 * confirmed, newest day first. Each section holds a panel per buy or
 * collection (per game, since a buy's day page is per game), newest first,
 * listing every matching card: one entry per printing and condition,
 * quantities added, in the order they were added, a printing's conditions
 * best first.
 * @returns {{ key: string, title?: string, day?: string, at?: string, panels: object[] }[]}
 */
export function groupResults(lines) {
  const panels = new Map();
  for (const l of lines ?? []) {
    const panelKey = `${l.buy_id}|${l.game}`;
    let p = panels.get(panelKey);
    if (!p) {
      const at = l.kind === 'walk_in' ? l.confirmed_at : l.created_at;
      p = {
        key: panelKey,
        buyId: l.buy_id,
        kind: l.kind,
        game: l.game,
        status: l.status,
        paidMethod: l.paid_method,
        // A collection's kind, for its colour: system, project or collection.
        collectionKind: l.collection_kind ?? (l.kind === 'collection' ? 'collection' : null),
        customerName: l.customer_name,
        confirmedBy: l.confirmed_by,
        number: l.buy_number,
        at,
        day: storeDay(at),
        entries: new Map(),
        lineIds: [],
        // An exported walk-in buy (shown with Show all): its cards in this game are Completed.
        completed: true,
      };
      panels.set(panelKey, p);
    }
    const printing = printingKey(l);
    const condition = l.condition ?? 'NM';
    const entryKey = `${printing}|${condition}`;
    let e = p.entries.get(entryKey);
    if (!e) {
      e = { key: entryKey, printing, condition, line: l, qty: 0, lineIds: [], order: p.entries.size };
      p.entries.set(entryKey, e);
    }
    e.qty += l.quantity;
    e.lineIds.push(l.line_id);
    p.lineIds.push(l.line_id);
    if (!l.completed) p.completed = false;
  }

  const rank = (c) => (CONDITIONS.indexOf(c) + 1) || CONDITIONS.length + 1;
  const collections = [];
  const days = new Map();
  for (const p of panels.values()) {
    // A printing's place is where it first came; its conditions best first.
    const firstOf = new Map();
    for (const e of p.entries.values()) if (!firstOf.has(e.printing)) firstOf.set(e.printing, e.order);
    const entries = [...p.entries.values()].sort((a, b) =>
      firstOf.get(a.printing) - firstOf.get(b.printing) || rank(a.condition) - rank(b.condition));
    const panel = { ...p, entries };
    if (p.kind === 'collection') {
      collections.push(panel);
      continue;
    }
    if (!days.has(p.day)) days.set(p.day, { key: p.day, day: p.day, at: p.at, panels: [] });
    days.get(p.day).panels.push(panel);
  }
  const newest = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
  const dated = [...days.values()]
    .map((d) => ({ ...d, panels: d.panels.sort((a, b) => newest(a.at, b.at)) }))
    .sort((a, b) => newest(a.day, b.day))
    .map((d) => ({ ...d, at: d.panels[0].at }));
  if (!collections.length) return dated;
  return [{ key: 'collections', title: 'Collections', panels: collections.sort((a, b) => newest(a.at, b.at)) }, ...dated];
}

/** Every panel in display order (collections, then day by day), for ↑/↓. */
export function flatRows(sections) {
  return sections.flatMap((s) => s.panels);
}
