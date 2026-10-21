// The header's global search (spec 13): what to ask the database, and how
// its lines group into results. Pure functions, so the tests run under Node.

import { storeDay } from './calendar.js';
import { nameKey } from './normalize.js';
import { normNumber, numericSize, parseQuery, withoutGuessedSetCode } from './query.js';
import { isStruck, movesOn } from './struck.js';

/** Typing under this many characters doesn't search. */
export const MIN_CHARS = 2;
/** The database returns at most this many lines. */
export const LINE_LIMIT = 200;
/** A phone number is this many digits or more once the punctuation is dropped; fewer is a collector number. */
export const PHONE_DIGITS = 7;
/** Customer matches shown at most, newest first. */
export const CUSTOMER_LIMIT = 20;

/**
 * What's typed as a customer lookup (owner, 2026-10-21; decision 424): a
 * phone number when it has no letters and PHONE_DIGITS digits or more
 * ("(555) 123-4567", "555-123-4567", "5551234567", "123-4567"; a leading 1
 * dropped from eleven), else a name, trimmed and single-spaced. Null under
 * MIN_CHARS, and for a short number ("117", "117/331": a collector number).
 * @returns {{ digits: string }|{ name: string }|null}
 */
export function customerQuery(text) {
  const input = String(text ?? '').trim();
  if (input.length < MIN_CHARS) return null;
  // No letter at all: a number of some kind, a phone's or a card's, never a name.
  if (!/\p{L}/u.test(input)) {
    let digits = input.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
    return digits.length >= PHONE_DIGITS ? { digits } : null;
  }
  return { name: input.replace(/\s+/g, ' ') };
}

/**
 * Buys and collections found by their customer (decision 424), as the
 * Customers section's panels: no card entries, the customer's name and phone,
 * and the cards counted. A walk-in buy is Completed once every card that
 * moves on is exported or marked done, both games (as walkInStatus reads one
 * game); `paidOurs` is what Paid/Ours only shows. A buy with cards in both
 * games opens on its Magic day.
 * @param {object[]} rows  buys rows with buy_lines(game, quantity, completed_at, struck_at, bulk_kind)
 */
export function customerPanels(rows) {
  return (rows ?? []).map((b) => {
    const lines = b.buy_lines ?? [];
    const walkIn = b.kind === 'walk_in';
    const game = !lines.length || lines.some((l) => l.game === 'mtg') ? 'mtg' : 'pokemon';
    const at = walkIn ? b.confirmed_at : b.created_at;
    const completed = walkIn
      ? lines.length > 0 && lines.every((l) => l.completed_at || !movesOn(l))
      : b.status === 'completed';
    return {
      key: `customer|${b.id}`,
      customer: true,
      buyId: b.id,
      kind: b.kind,
      game,
      status: b.status,
      paidMethod: b.paid_method,
      collectionKind: walkIn ? null : 'overnight',
      customerName: b.customer_name,
      phone: b.phone,
      confirmedBy: b.confirmed_by,
      number: b.number,
      at,
      day: storeDay(at),
      entries: [],
      lineIds: [],
      completed,
      cards: lines.reduce((n, l) => n + (l.quantity ?? 0), 0),
      paidOurs: walkIn ? !completed : b.status === 'paid',
    };
  });
}
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

/** `global_search`'s collection_kind as the screens say it: 'collection' is an overnight buy (decision 421). */
export const kindWord = (dbKind) => (dbKind === 'collection' ? 'overnight' : dbKind);

/** The pinned sections, in order (decision 421): each kind of collection under its own name. */
const PINNED = [['overnight', 'Overnight buys'], ['project', 'Projects'], ['system', 'System']];

/** One printing: game, language, set, number, finish, 1st Edition and treatments; a placeholder's name. */
export function printingKey(line) {
  return [
    line.game, line.lang ?? 'en', String(line.set_code).toLowerCase(), normNumber(line.collector_number),
    line.finish, line.first_edition ? '1' : '0', [...(line.treatments ?? [])].sort().join('+'),
    ...(line.bulk_kind ? [nameKey(line.name)] : []),
  ].join('|');
}

/**
 * Lines from `global_search` as results (owner, 2026-09-30): collections
 * pinned at the top (they sit in their own place in the store), a section
 * per kind (Overnight buys, Projects, System; decision 421), newest first;
 * then buys filed under the day they were
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
        // A collection's kind, for its section and colour: system, project or overnight (an overnight
        // buy, which the database still calls 'collection'; decision 421).
        collectionKind: l.kind === 'collection' ? kindWord(l.collection_kind ?? 'collection') : null,
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
    // A struck card (Show all only, decision 275) is an entry of its own, never added to the live copies.
    const struck = isStruck(l);
    const entryKey = `${printing}|${condition}${struck ? '|struck' : ''}`;
    let e = p.entries.get(entryKey);
    if (!e) {
      e = { key: entryKey, printing, condition, struck, line: l, qty: 0, lineIds: [], order: p.entries.size };
      p.entries.set(entryKey, e);
    }
    e.qty += l.quantity;
    e.lineIds.push(l.line_id);
    p.lineIds.push(l.line_id);
    if (!l.completed) p.completed = false;
  }

  const rank = (c) => (CONDITIONS.indexOf(c) + 1) || CONDITIONS.length + 1;
  const pinned = new Map(PINNED.map(([kind]) => [kind, []]));
  const days = new Map();
  for (const p of panels.values()) {
    // A printing's place is where it first came; its live copies before struck ones, conditions best first.
    const firstOf = new Map();
    for (const e of p.entries.values()) if (!firstOf.has(e.printing)) firstOf.set(e.printing, e.order);
    const entries = [...p.entries.values()].sort((a, b) =>
      firstOf.get(a.printing) - firstOf.get(b.printing) || a.struck - b.struck || rank(a.condition) - rank(b.condition));
    const panel = { ...p, entries };
    if (p.kind === 'collection') {
      (pinned.get(p.collectionKind) ?? pinned.get('overnight')).push(panel);
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
  const top = PINNED
    .filter(([kind]) => pinned.get(kind).length)
    .map(([kind, title]) => ({ key: kind, title, panels: pinned.get(kind).sort((a, b) => newest(a.at, b.at)) }));
  return [...top, ...dated];
}

/** Every panel in display order (the pinned kinds, then day by day), for ↑/↓. */
export function flatRows(sections) {
  return sections.flatMap((s) => s.panels);
}
