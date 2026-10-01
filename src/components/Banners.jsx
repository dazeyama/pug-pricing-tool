import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInventory } from '../state/inventory.jsx';
import { useConnection } from '../state/connection.jsx';
import { usePriceLimit } from '../state/priceLimit.jsx';
import { useSettings } from '../state/settings.jsx';
import { useStaff } from '../state/staff.jsx';
import { useToast } from './Toast.jsx';
import { formatTime } from '../lib/time.js';
import { backupDue, daysSince } from '../lib/backup.js';
import { saveBackup } from '../lib/backupIO.js';

// Banners below the header, above the tab content (spec 7.5).

const DISMISS_KEY = 'pug.backupReminderDismissed';

function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === 'yes';
  } catch {
    return false;
  }
}

/**
 * The backup reminder (spec 7.5, 11.5): on the Free plan, when the last
 * backup is more than 7 days old (or there's none). Downloading one clears it
 * on every computer; × hides it until the browser is closed.
 */
function BackupReminder() {
  const { loaded, values } = useSettings();
  const staff = useStaff();
  const { offline } = useConnection();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [busy, setBusy] = useState(false);
  const last = values.last_backup_at ?? null;
  if (!loaded || dismissed || !backupDue(last)) return null;
  const days = daysSince(last);

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

  return (
    <div className="banner warn banner-row">
      <span>
        {last ? `Last backup downloaded ${days} day${days === 1 ? '' : 's'} ago.` : 'No backup has been downloaded yet.'}
      </span>
      <button
        type="button"
        className={`btn small banner-btn${busy ? ' busy' : ''}`}
        disabled={offline || busy}
        title={offline ? 'No connection' : 'Save a backup file of everything to this computer'}
        onClick={download}
      >
        Download backup
      </button>
      <button
        type="button"
        className="banner-x"
        title="Hide until the browser is closed"
        aria-label="Hide the backup reminder"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, 'yes');
          } catch {
            // Storage blocked: hidden for this page load only.
          }
          setDismissed(true);
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function Banners() {
  const inventory = useInventory();
  const { offline } = useConnection();
  const { limitUntil } = usePriceLimit();

  return (
    <>
      {inventory.loaded && !inventory.current && (
        <div className="banner err">
          <strong>Master Crystal Inventory required.</strong> Upload your Crystal Commerce
          inventory CSV in Settings before exporting.
          <Link to="/settings">Open Settings</Link>
        </div>
      )}
      {offline && (
        <div className="banner warn">No connection — changes are paused.</div>
      )}
      {limitUntil && (
        <div className="banner warn">
          JustTCG daily limit reached — enter prices manually until {formatTime(limitUntil)}.
        </div>
      )}
      <BackupReminder />
    </>
  );
}
