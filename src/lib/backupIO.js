// Downloading and restoring backups (spec 11.5). The file's shape and the
// checks on it are in backup.js.

import { supabase } from './supabase.js';
import { withLoading } from './loading.js';
import { backupFileName } from './backup.js';

/* global __APP_VERSION__ */

/** Hand the browser a JSON file to save. */
function downloadJson(data, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Let the download start before the file's address goes away.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Download a backup of everything now, and record when (last_backup_at, which
 * the reminder banner reads on every computer).
 * @param {{ userId?: string|null, note?: string }} [opts]  note: "before-restore" for the automatic one
 * @returns {Promise<string>} the file name
 */
export async function saveBackup({ userId = null, note = '' } = {}) {
  const { data, error } = await withLoading(() => supabase.rpc('backup_export'));
  if (error) throw new Error(`Couldn't make the backup: ${error.message}`);
  const name = backupFileName(new Date(), note);
  downloadJson({ ...data, app_version: __APP_VERSION__ }, name);
  const { error: stampError } = await supabase.from('settings').upsert({
    key: 'last_backup_at',
    value: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: userId,
  });
  if (stampError) console.error('Recording the backup time failed', stampError);
  return name;
}

/** What's in the database now, counted as a backup file is (backup.js countsOf). */
export async function currentCounts() {
  const { data, error } = await supabase.rpc('backup_counts');
  if (error) throw new Error(error.message);
  return data;
}

const RESTORE_ERRORS = {
  bad_backup: "That file isn't a backup this version can restore.",
  not_confirmed: 'Type RESTORE to confirm.',
  not_signed_in: 'Sign in again, then try once more.',
};

/**
 * Replace everything with a backup's contents (one transaction), logging a
 * "Backup restored" milestone.
 * @returns {Promise<object>} the counts after
 */
export async function restoreBackup(data, fileName, userId, deviceId) {
  const { data: counts, error } = await withLoading(() => supabase.rpc('restore_backup', {
    p_payload: data,
    p_file: fileName,
    p_user: userId,
    p_device: deviceId,
    p_typed: 'RESTORE',
  }));
  if (error) throw new Error(RESTORE_ERRORS[error.message] ?? `The restore failed, and nothing was changed: ${error.message}`);
  // A backup made before Can't upload cards existed (export spec 9.5): make it again.
  const { error: ensureError } = await supabase.rpc('cant_upload_ensure');
  if (ensureError) console.error("Couldn't make Can't upload cards again", ensureError);
  return counts;
}
