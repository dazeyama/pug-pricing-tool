import { formatInTimeZone } from 'date-fns-tz';
import { STORE_TZ } from './time.js';
import { roundDownPrice } from './money.js';

// The Changelog's rules (spec 12), kept apart from the page so they can be
// tested: which category an entry is in, what it's called, how runs of adds
// fold into one panel, and how the game filter trims an entry.

/**
 * The category buttons (spec 12.4). Status changes count as Collections
 * (owner, 2026-09-29: they carry the offer and price paid, so they show by
 * default); only detail edits are Actions.
 */
export const CATEGORIES = [
  {
    key: 'buys',
    label: 'Buys',
    // A day exported (its buys Completed), or put back to Paid/Ours (owner, 2026-09-30).
    actions: ['buy_confirmed', 'buy_cards_removed', 'buy_deleted', 'day_exported', 'day_unexported'],
  },
  {
    key: 'collections',
    label: 'Collections',
    actions: ['collection_created', 'collection_cards_added', 'collection_line_edited',
      'collection_cards_removed', 'collection_status_changed', 'collection_deleted'],
  },
  { key: 'actions', label: 'Actions', actions: ['collection_info_edited'] },
];
/** Milestones are always shown (a backup restore, Phase 10). */
export const MILESTONES = ['backup_restored'];
/** The opening state (spec 12.5): Buys only (owner, 2026-09-30). */
export const DEFAULT_CATEGORIES = ['buys'];

export const categoryOf = (action) => CATEGORIES.find((c) => c.actions.includes(action))?.key ?? null;

/** The actions a set of categories shows, milestones included. */
export function actionsFor(categories) {
  return [...CATEGORIES.filter((c) => categories.includes(c.key)).flatMap((c) => c.actions), ...MILESTONES];
}

export const HEADLINES = {
  buy_confirmed: 'Buy confirmed',
  buy_cards_removed: 'Cards removed from buy',
  buy_deleted: 'Buy deleted',
  day_exported: 'Day exported',
  day_unexported: 'Export undone',
  collection_created: 'Collection created',
  collection_cards_added: 'Cards added to collection',
  collection_line_edited: 'Card edited in collection',
  collection_cards_removed: 'Cards removed from collection',
  collection_info_edited: 'Collection details edited',
  collection_status_changed: 'Status changed',
  collection_deleted: 'Collection deleted',
  backup_restored: 'Backup restored',
};
/** Entries about a whole day (EXPORT on a day page), not one buy. */
export const DAY_ACTIONS = new Set(['day_exported', 'day_unexported']);
/** Landmarks: something made (big dot, green headline) or gone (red cross). */
export const MADE = new Set(['buy_confirmed', 'collection_created']);
export const GONE = new Set(['buy_deleted', 'collection_deleted']);

const FOLDS = new Set(['collection_cards_added', 'collection_cards_removed']);
export const FOLD_MS = 15 * 60 * 1000;

/**
 * Panels from entries, newest first (spec 12.6): a run of cards-added (or
 * removed) entries on one collection by one user, each within 15 minutes of
 * the one before, with no other entry for that collection in between, is one
 * panel. Card edits and everything else stand alone (owner, 2026-09-29).
 * @param {object[]} events  newest first
 * @returns {{ key: string, events: object[] }[]} each panel's entries newest first
 */
export function foldEvents(events) {
  const panels = [];
  const latest = new Map();   // target → its most recent panel so far
  for (const e of events) {
    const open = e.target_id ? latest.get(e.target_id) : null;
    if (open && FOLDS.has(e.action) && open.action === e.action && open.user === e.staff_user_id
        && new Date(open.events.at(-1).at) - new Date(e.at) <= FOLD_MS) {
      open.events.push(e);
      continue;
    }
    const panel = { key: String(e.seq), action: e.action, user: e.staff_user_id, events: [e] };
    panels.push(panel);
    if (e.target_id) latest.set(e.target_id, panel);
  }
  return panels;
}

/**
 * What a panel shows: its card rows (additions before removals), counts and
 * totals, summed for a folded run. Always the whole entry: the game filter
 * picks which entries show, and a mixed buy shows whole under either game
 * (owner, 2026-09-29, replacing the trim to one game's cards).
 */
export function panelView(panel) {
  const [first] = panel.events;
  const last = panel.events.at(-1);
  const lines = panel.events.flatMap((e) => e.lines ?? []);
  const rows = [...lines.filter((l) => l.sign === '+'), ...lines.filter((l) => l.sign !== '+')];
  const recount = panel.events.length > 1;
  const count = (sign) => rows.filter((l) => (sign === '+' ? l.sign === '+' : l.sign !== '+'))
    .reduce((n, l) => n + Number(l.qty), 0);
  const added = recount ? count('+') : Number(first.added ?? 0);
  const removed = recount ? count('-') : Number(first.removed ?? 0);

  let totals = first.totals ?? null;
  if (totals && recount) {
    const market = Math.round(rows.reduce((s, l) => s + Number(l.unit_price) * Number(l.qty), 0) * 100) / 100;
    const pct = (p) => (p == null ? null : roundDownPrice((market * Number(p)) / 100));
    totals = { ...totals, market, cash: pct(totals.cash_pct), credit: pct(totals.credit_pct) };
  }
  const games = [...new Set(panel.events.flatMap((e) => e.games ?? []))];
  return {
    first,
    newest: first.at,
    oldest: last.at,
    folded: panel.events.length > 1,
    rows,
    fields: first.fields ?? [],
    added,
    removed,
    totals,
    games,
  };
}

/** "Today" or "Yesterday" in the store's calendar, else null. */
export function relativeDay(at, now = new Date()) {
  const day = (d) => formatInTimeZone(d, STORE_TZ, 'yyyy-MM-dd');
  const d = day(at);
  if (d === day(now)) return 'Today';
  if (d === day(new Date(new Date(now).getTime() - 86_400_000))) return 'Yesterday';
  return null;
}

/**
 * A day's pill, as the header search writes its days (owner, 2026-09-30):
 * "Today · September 30, 2026", "Yesterday · September 29, 2026", else just
 * "August 17, 2026". No weekdays; Today and Yesterday are the only markers.
 */
export function dayHeading(at, now = new Date()) {
  const relative = relativeDay(at, now);
  const date = formatInTimeZone(at, STORE_TZ, 'MMMM d, yyyy');
  return relative ? `${relative} · ${date}` : date;
}

/** The day an entry is filed under (store time), for the day pills. */
export const entryDay = (at) => formatInTimeZone(at, STORE_TZ, 'yyyy-MM-dd');

/** "August 17, 2026 at 2:37 PM"; a folded run "August 17, 2026 · 2:04 – 2:41 PM". */
export function entryWhen(newest, oldest = newest) {
  if (entryDay(newest) === entryDay(oldest) && newest !== oldest) {
    return `${formatInTimeZone(oldest, STORE_TZ, 'MMMM d, yyyy')} · ${formatInTimeZone(oldest, STORE_TZ, 'h:mm')}`
      + ` – ${formatInTimeZone(newest, STORE_TZ, 'h:mm a')}`;
  }
  return formatInTimeZone(newest, STORE_TZ, "MMMM d, yyyy 'at' h:mm a");
}
