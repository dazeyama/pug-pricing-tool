import { formatInTimeZone } from 'date-fns-tz';
import { STORE_TZ } from './time.js';
import { roundDownPrice } from './money.js';
import { countText } from './bulk.js';

// The Changelog's rules (spec 12), kept apart from the page so they can be
// tested: which category an entry is in, what it's called, how runs of adds
// fold into one panel, and how the game filter trims an entry.

/**
 * The category buttons (spec 12.4). Buys and Collections are only cards
 * coming in or going out (owner, 2026-10-02, replacing "status changes are
 * Collections"); everything else (status changes, exports and completions,
 * edits, repricing) is Actions. A collection made counts as Collections: it
 * shows the cards it starts with.
 */
export const CATEGORIES = [
  {
    key: 'buys',
    label: 'Buys',
    // A buy confirmed (cards in); cards removed, or the buy deleted (cards out);
    // a buy converted to a project, its cards added there (owner, 2026-10-02);
    // a project converted to a buy (owner, 2026-10-10); a buy's cards edited
    // in project view and saved (owner, 2026-10-13); flagged to have its
    // cards' condition checked before export, and checked (owner, 2026-10-14);
    // cards struck (moved elsewhere, kept crossed out) and restored (owner, 2026-10-16).
    actions: ['buy_confirmed', 'buy_cards_removed', 'buy_deleted', 'buy_converted', 'project_converted', 'buy_edited',
      'buy_flagged', 'buy_flag_cleared', 'buy_cards_struck', 'buy_cards_restored'],
  },
  {
    key: 'collections',
    label: 'Collections',
    actions: ['collection_created', 'collection_cards_added', 'collection_cards_removed',
      'collection_deleted',
      // A file's cards imported (Import Collection, owner, 2026-10-09).
      'collection_imported',
      // Can't upload cards (export spec 9, 12): copied in, exported out, taken back.
      'cant_upload_added', 'cant_upload_exported', 'cant_upload_returned',
      // Cards struck in a Paid/Ours collection or project, and restored (owner, 2026-10-16).
      'collection_cards_struck', 'collection_cards_restored'],
  },
  {
    key: 'actions',
    label: 'Actions',
    actions: ['collection_info_edited', 'collection_status_changed',
      'collection_line_edited', 'collection_repriced',
      // A card's own rate set or cleared (Set Rate, docs/TEAM_FEEDBACK.md 4.3).
      'collection_line_rate',
      // A day exported, put back, or marked Completed; one buy marked Completed or back;
      // a month's Cash buys file downloaded (owner, 2026-09-30 – 10-02); one buy
      // exported on its own, or its export undone (owner, 2026-10-09).
      'day_exported', 'day_unexported', 'day_completed', 'buy_completed', 'buy_uncompleted',
      'buy_exported', 'buy_unexported',
      'cash_buys_downloaded',
      // 📞 on a Priced collection (owner, 2026-10-02).
      'collection_called'],
  },
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
  buy_cards_struck: 'Cards struck in buy',
  buy_cards_restored: 'Struck cards restored to buy',
  buy_edited: 'Buy edited',
  buy_flagged: '🚩 Buy flagged: check condition',
  buy_flag_cleared: 'Buy condition checked',
  buy_deleted: 'Buy deleted',
  buy_completed: 'Buy marked Completed',
  buy_uncompleted: 'Buy marked Paid/Ours again',
  buy_converted: 'Buy converted to project',
  project_converted: 'Project converted to buy',
  buy_exported: 'Buy exported',
  buy_unexported: 'Buy export undone',
  cash_buys_downloaded: 'Cash buys downloaded',
  day_exported: 'Day exported',
  day_unexported: 'Export undone',
  day_completed: 'Day completed',
  collection_created: 'Collection created',
  collection_cards_added: 'Cards added to collection',
  collection_imported: 'Cards imported',
  collection_line_edited: 'Card edited in collection',
  collection_line_rate: 'Card rate set',
  collection_cards_removed: 'Cards removed from collection',
  collection_cards_struck: 'Cards struck in collection',
  collection_cards_restored: 'Struck cards restored to collection',
  collection_info_edited: 'Collection details edited',
  collection_status_changed: 'Status changed',
  collection_deleted: 'Collection deleted',
  collection_repriced: 'Collection repriced',
  collection_called: 'Customer called',
  cant_upload_added: "Cards can't upload",
  cant_upload_exported: "Exported from Can't upload",
  cant_upload_returned: 'Cards returned',
  backup_restored: 'Backup restored',
};
/**
 * An entry's headline: HEADLINES by its action, except a project made, which
 * reads "Project started" rather than "Collection created" (its summary says
 * so; smoke test 2026-10-11, F9).
 * @param {{ action: string, summary?: string|null }} e
 */
export function headlineOf(e) {
  if (e?.action === 'collection_created' && /^Project started/.test(String(e.summary ?? ''))) return 'Project started';
  return HEADLINES[e?.action] ?? e?.action;
}

/** Entries about a whole day (EXPORT on a day page), not one buy. */
export const DAY_ACTIONS = new Set(['day_exported', 'day_unexported', 'day_completed']);
/** Entries about a whole month (the Cash buys file; smoke test 2026-10-02 #10), not one buy. */
export const MONTH_ACTIONS = new Set(['cash_buys_downloaded']);
/** Landmarks: something made (big dot, green headline) or gone (red cross). */
export const MADE = new Set(['buy_confirmed', 'collection_created', 'buy_converted', 'project_converted']);
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
  // Cards and bulk apart, as CONFIRM BUY counts them (owner, 2026-10-16;
  // migration 0066): a bulk row carries bulk_per, the cards in one item. A
  // placeholder is a card. added / removed are cards, as an entry's own are.
  const count = (sign, bulk) => rows.filter((l) => (sign === '+' ? l.sign === '+' : l.sign !== '+'))
    .filter((l) => (l.bulk_per != null) === bulk)
    .reduce((n, l) => n + Number(l.qty) * (bulk ? Number(l.bulk_per) : 1), 0);
  const added = recount ? count('+', false) : Number(first.added ?? 0);
  const removed = recount ? count('-', false) : Number(first.removed ?? 0);
  const addedBulk = recount ? count('+', true) : 0;
  const removedBulk = recount ? count('-', true) : 0;

  let totals = first.totals ?? null;
  if (totals && recount) {
    const market = Math.round(rows.reduce((s, l) => s + Number(l.unit_price) * Number(l.qty), 0) * 100) / 100;
    // Each row at its card's own rate where the entry kept it (migration 0055,
    // docs/TEAM_FEEDBACK.md 4.4), else the entry's rate; added up, rounded down once.
    const pct = (side) => {
      if (totals[`${side}_pct`] == null && rows.every((l) => l[`${side}_pct`] == null)) return null;
      const raw = rows.reduce((s, l) => s + Number(l.unit_price) * Number(l.qty)
        * Number(l[`${side}_pct`] ?? totals[`${side}_pct`]), 0) / 100;
      return roundDownPrice(raw);
    };
    totals = { ...totals, market, cash: pct('cash'), credit: pct('credit') };
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
    addedBulk,
    removedBulk,
    totals,
    games,
  };
}

/**
 * What a folded run adds up to: "7 cards added.", "2 cards + 100 bulk
 * removed." A run is all adds or all removes (foldEvents).
 * @param {ReturnType<typeof panelView>} view
 */
export function foldedSummary(view) {
  const adding = view.added + view.addedBulk > 0;
  const counts = adding ? { cards: view.added, bulk: view.addedBulk } : { cards: view.removed, bulk: view.removedBulk };
  return `${countText(counts)} ${adding ? 'added' : 'removed'}.`;
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
