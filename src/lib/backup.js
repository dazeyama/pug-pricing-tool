// Backup files (spec 11.5): what one holds, and how a picked file is checked
// before a restore. Pure functions, so the tests run under Node; the
// download and restore themselves are in backupIO.js.

import { fileStamp } from './time.js';

export const FORMAT = 'pug-pricing-backup';
export const VERSION = 1;
/**
 * The tables a backup must hold (migration 0015, backup_export). Since decision 348 it also holds
 * cc_set_map, cc_product_links and import_links, which older files don't: those aren't required.
 */
export const TABLES = ['staff_users', 'devices', 'buys', 'buy_lines', 'events', 'settings'];

/**
 * Supabase's own daily backups for prod: false on the Free plan, true once
 * prod is on Pro (spec 11.5). The owner updates this if they upgrade; while
 * it's false, the reminder banner asks for a backup file every week.
 */
export const CLOUD_BACKUPS = false;
/** The reminder shows once the last backup is more than this many days old. */
export const REMINDER_DAYS = 7;

/** "pug-pricing-backup-20260930-154210.json", or "…-before-restore.json". */
export function backupFileName(when = new Date(), note = '') {
  return `${FORMAT}-${fileStamp(when)}${note ? `-${note}` : ''}.json`;
}

/**
 * What a backup's tables add up to, counted as `backup_counts()` counts
 * what's here: confirmed walk-in buys, collections, card lines, changelog
 * entries and (active) staff users.
 */
export function countsOf(tables) {
  const buys = tables.buys ?? [];
  return {
    buys: buys.filter((b) => b.kind === 'walk_in' && b.status === 'confirmed').length,
    collections: buys.filter((b) => b.kind === 'collection').length,
    lines: (tables.buy_lines ?? []).length,
    events: (tables.events ?? []).length,
    users: (tables.staff_users ?? []).filter((u) => u.active).length,
  };
}

/**
 * Is this a backup this version can restore?
 * @returns {{ ok: true, counts: object, exportedAt: string|null, appVersion: string|null }
 *   | { ok: false, error: string }}
 */
export function checkBackup(data) {
  if (!data || typeof data !== 'object' || data.format !== FORMAT) {
    return { ok: false, error: "That file isn't a PUG Pricing Tool backup." };
  }
  if (data.version !== VERSION) {
    return { ok: false, error: `That backup is format version ${data.version}; this app restores version ${VERSION}.` };
  }
  const tables = data.tables;
  const missing = TABLES.filter((t) => !Array.isArray(tables?.[t]));
  if (missing.length) {
    return { ok: false, error: `That backup is incomplete: it has no ${missing.join(', ')}.` };
  }
  const idless = TABLES.filter((t) => tables[t].some((row) => !row || typeof row !== 'object'
    || (t === 'settings' ? !row.key : t === 'events' ? row.seq == null : !row.id)));
  if (idless.length) {
    return { ok: false, error: `That backup is damaged: some ${idless.join(', ')} rows have no ID.` };
  }
  return { ok: true, counts: countsOf(tables), exportedAt: data.exported_at ?? null, appVersion: data.app_version ?? null };
}

/**
 * The backup's tables in the order the app reads them (smoke pass, 2026-10-21; decision 426), each
 * with its sort and its key: one table at a time, a page at a time, so no single statement nears
 * the 8 s the app's statements get (the one-call `backup_export` took 2 to 4 s on dev and timed out
 * twice). Children before parents: a buy, user or computer made while the backup reads is then in
 * it with everything that points at it, or not at all.
 */
export const READ_ORDER = [
  { table: 'buy_lines', order: ['buy_id', 'position', 'id'], key: ['id'] },
  { table: 'events', order: ['seq'], key: ['seq'] },
  { table: 'settings', order: ['key'], key: ['key'] },
  { table: 'cc_set_map', order: ['scryfall_set', 'promo_kind'], key: ['scryfall_set', 'promo_kind'] },
  { table: 'cc_product_links', order: ['scryfall_id', 'finish'], key: ['scryfall_id', 'finish'] },
  { table: 'import_links', order: ['key'], key: ['key'] },
  { table: 'buys', order: ['created_at', 'id'], key: ['id'] },
  { table: 'devices', order: ['id'], key: ['id'] },
  { table: 'staff_users', order: ['created_at', 'id'], key: ['id'] },
];

/** Columns the backup leaves out: the Changelog's search copies, which the database rebuilds. */
export const LEFT_OUT = { events: ['search_text', 'search_digits'] };

/**
 * Tables read one page at a time, made whole as the one-call export was: a row read twice (the
 * pages shifted under a change) kept once; a card whose buy was deleted while the backup read
 * dropped, as the buy took it; a copy pointing at a card that's gone pointed at none, as the
 * database does; the left-out columns taken off.
 * @param {Record<string, object[]>} tables
 * @returns {Record<string, object[]>}
 */
export function tidyTables(tables) {
  const out = {};
  for (const { table, key } of READ_ORDER) {
    const rows = tables?.[table];
    if (!Array.isArray(rows)) continue;
    const seen = new Set();
    out[table] = rows.filter((r) => {
      const k = key.map((c) => r?.[c]).join('|');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).map((r) => {
      if (!LEFT_OUT[table]) return r;
      const copy = { ...r };
      for (const c of LEFT_OUT[table]) delete copy[c];
      return copy;
    });
  }
  if (out.buy_lines && out.buys) {
    const buyIds = new Set(out.buys.map((b) => b.id));
    out.buy_lines = out.buy_lines.filter((l) => buyIds.has(l.buy_id));
    const lineIds = new Set(out.buy_lines.map((l) => l.id));
    out.buy_lines = out.buy_lines.map((l) => (l.source_line_id && !lineIds.has(l.source_line_id) ? { ...l, source_line_id: null } : l));
  }
  return out;
}

/** The matches staff taught, in backups since decision 348, with what the restore dialog calls them. */
export const LEARNED = {
  cc_set_map: 'set choices',
  cc_product_links: 'remembered product matches',
  import_links: 'remembered import picks',
};

/**
 * The file's columns the database lacks, table by table (decision 398): a restore leaves them
 * out, so the dialog lists them first.
 * @param {object} tables  the backup's tables
 * @param {Record<string, string[]>} columns  each table's columns here (backup_columns)
 * @returns {{ table: string, columns: string[] }[]}
 */
export function extraColumns(tables, columns) {
  const out = [];
  for (const [table, rows] of Object.entries(tables ?? {})) {
    const here = columns?.[table];
    if (!Array.isArray(rows) || !Array.isArray(here)) continue;
    const known = new Set(here);
    const keys = new Set(rows.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : [])));
    const extra = [...keys].filter((c) => !known.has(c)).sort();
    if (extra.length) out.push({ table, columns: extra });
  }
  return out;
}

/** The learned-match tables the file has with no rows: a restore leaves what's here (decision 398). */
export function emptyLearned(tables) {
  return Object.keys(LEARNED).filter((t) => Array.isArray(tables?.[t]) && tables[t].length === 0);
}

/** Whole days since `when`, or null if there's no date. */
export function daysSince(when, now = Date.now()) {
  if (!when) return null;
  const t = new Date(when).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** Time for the reminder: never backed up, or more than a week ago (and no cloud backups). */
export function backupDue(lastBackupAt, now = Date.now()) {
  if (CLOUD_BACKUPS) return false;
  const days = daysSince(lastBackupAt, now);
  return days == null || days > REMINDER_DAYS;
}
