// Backup files (spec 11.5): what one holds, and how a picked file is checked
// before a restore. Pure functions, so the tests run under Node; the
// download and restore themselves are in backupIO.js.

import { fileStamp } from './time.js';

export const FORMAT = 'pug-pricing-backup';
export const VERSION = 1;
/** The tables a backup holds (migration 0015, backup_export). */
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
