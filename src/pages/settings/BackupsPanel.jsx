import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import GuardButton from '../../components/GuardButton.jsx';
import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useDevice } from '../../state/device.jsx';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';
import { CLOUD_BACKUPS, REMINDER_DAYS, checkBackup, daysSince } from '../../lib/backup.js';
import { currentCounts, restoreBackup, saveBackup } from '../../lib/backupIO.js';
import { formatDateTime, timeAgo } from '../../lib/time.js';

// Settings → Backups (spec 11.5), a row of its own: download a backup file,
// Supabase's own backups for prod, and Restore from backup… (typed RESTORE,
// a backup of what's here downloads first, then everything is replaced).

const ROWS = [
  ['buys', 'Buys'],
  ['collections', 'Collections'],
  ['lines', 'Card lines'],
  ['events', 'Changelog entries'],
  ['users', 'Staff users'],
];

export default function BackupsPanel() {
  const { values } = useSettings();
  const staff = useStaff();
  const { offline } = useConnection();
  const toast = useToast();
  const picker = useRef(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(null);   // { fileName, data, check }

  const last = values.last_backup_at ?? null;
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

  async function onPicked(e) {
    const file = e.target.files?.[0];
    e.target.value = '';                      // so picking the same file again still fires
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast(`${file.name} isn't a backup file (it isn't JSON).`, 'err');
      return;
    }
    const check = checkBackup(data);
    if (!check.ok) {
      toast(check.error, 'err');
      return;
    }
    setRestoring({ fileName: file.name, data, check });
  }

  return (
    <section className="cardpanel settings-panel settings-wide">
      <div className="cardpanel-head"><strong>Backups</strong></div>
      <div className="cardpanel-body backups">
        <div className="backups-col">
          <p className="hint">
            A backup file holds every buy, collection, card line, changelog entry, staff user and
            setting. Keep copies somewhere safe off this computer. The Crystal Commerce CSVs (download
            them above) and the API keys aren’t in it.
          </p>
          <GuardButton
            needsUser={false}
            className={`btn primary big${busy ? ' busy' : ''}`}
            disabled={offline || busy}
            title={offline ? 'No connection' : undefined}
            onClick={download}
          >
            Download backup
          </GuardButton>
          <p className="backup-last">
            {last ? (
              <>Last backup: <strong>{formatDateTime(last)}</strong> ({timeAgo(last)})</>
            ) : (
              <>No backup has been downloaded yet.</>
            )}
          </p>
          {CLOUD_BACKUPS ? (
            <p className="backup-cloud on">Supabase daily backups: <strong>on (Pro plan)</strong>.</p>
          ) : (
            <p className={`backup-cloud off${days == null || days > REMINDER_DAYS ? ' due' : ''}`}>
              Supabase daily backups: <strong>not included on the Free plan</strong> — download a
              backup at least weekly.
            </p>
          )}
        </div>
        <div className="backups-col restore-col">
          <h4 className="settings-sub">Restore</h4>
          <p className="hint">
            Replaces <strong>everything</strong> in the database with a backup file’s contents, on every
            computer. A backup of what’s here now downloads first. Computers’ names, the Crystal Commerce
            CSVs and the API keys stay as they are.
          </p>
          <GuardButton
            className="btn danger-ghost"
            disabled={offline}
            title={offline ? 'No connection' : 'Pick a backup file to restore'}
            onClick={() => picker.current?.click()}
          >
            Restore from backup…
          </GuardButton>
          <input ref={picker} type="file" accept=".json,application/json" hidden onChange={onPicked} />
        </div>
      </div>
      {restoring && <RestoreModal {...restoring} onClose={() => setRestoring(null)} />}
    </section>
  );
}

/** The restore: what's in the file next to what's here, then type RESTORE (spec 11.5). */
function RestoreModal({ fileName, data, check, onClose }) {
  const staff = useStaff();
  const { deviceId } = useDevice();
  const { offline } = useConnection();
  const toast = useToast();
  const [now, setNow] = useState(null);
  const [nowError, setNowError] = useState(null);
  const [typed, setTyped] = useState('');
  const [step, setStep] = useState(null);   // null | 'saving' | 'restoring' | 'done'
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    currentCounts()
      .then((c) => alive && setNow(c))
      .catch((e) => alive && setNowError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const working = step !== null && step !== 'done';
  const ready = typed.trim() === 'RESTORE' && !offline && !working && step !== 'done';

  async function run() {
    setError(null);
    try {
      setStep('saving');
      await saveBackup({ userId: staff.current?.id ?? null, note: 'before-restore' });
      setStep('restoring');
      await restoreBackup(data, fileName, staff.current?.id ?? null, deviceId);
      setStep('done');
      toast('Backup restored. Reloading…', 'ok');
      // Give the before-restore download a moment, then start fresh.
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setStep(null);
      setError(e.message);
    }
  }

  return (
    <Modal
      wide
      title={`Restore from ${fileName}?`}
      onClose={working || step === 'done' ? undefined : onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" disabled={working || step === 'done'} onClick={onClose}>Cancel</button>
          <GuardButton
            className={`btn danger${working ? ' busy' : ''}`}
            disabled={!ready}
            title={offline ? 'No connection' : typed.trim() !== 'RESTORE' ? 'Type RESTORE first' : undefined}
            onClick={run}
          >
            Restore
          </GuardButton>
        </>
      )}
    >
      <p>
        Made {check.exportedAt ? <strong>{formatDateTime(check.exportedAt)}</strong> : 'at an unknown time'}
        {check.appVersion ? <> by version {check.appVersion}</> : null}.
      </p>
      <table className="restore-table">
        <thead>
          <tr><th /><th>In the backup</th><th>Here now</th></tr>
        </thead>
        <tbody>
          {ROWS.map(([key, label]) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td>{check.counts[key].toLocaleString()}</td>
              <td>{now ? Number(now[key]).toLocaleString() : nowError ? '?' : '…'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {nowError && <p className="hint">Couldn’t count what’s here now: {nowError}</p>}
      <div className="banner err restore-warning">
        <strong>Everything currently in the database will be replaced.</strong> Every buy, collection,
        changelog entry, staff user and setting becomes what’s in this file, on every computer. A backup
        of what’s here now downloads first.
      </div>
      <label htmlFor="restore-typed">Type <strong>RESTORE</strong> to confirm</label>
      <input
        id="restore-typed"
        type="text"
        className="restore-typed"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        disabled={working || step === 'done'}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && ready && staff.current) run();
        }}
      />
      {step === 'saving' && <p className="loading-note restore-step">Downloading a backup of what’s here now…</p>}
      {step === 'restoring' && <p className="loading-note restore-step">Restoring…</p>}
      {step === 'done' && <p className="restore-step ok">Restored. Reloading…</p>}
      {error && <div className="banner err restore-error">{error}</div>}
    </Modal>
  );
}
