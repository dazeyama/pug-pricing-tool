import { useState } from 'react';
import { useStaff } from '../state/staff.jsx';
import { useToast } from '../components/Toast.jsx';
import { saveBackup } from './backupIO.js';

/**
 * Download backup (spec 11.5), from Settings → Backups and from the reminder
 * banner alike (FABLE_REPORT B12): busy while the file is made, then a toast
 * with its name, or why it failed.
 * @returns {{ busy: boolean, download: () => Promise<void> }}
 */
export function useBackupDownload() {
  const staff = useStaff();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const name = await saveBackup({ userId: staff.current?.id ?? null });
      toast(`Backup saved: ${name}`, 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return { busy, download };
}
