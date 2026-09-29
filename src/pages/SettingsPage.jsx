import { useState } from 'react';
import { useSession } from '../state/session.jsx';
import { useDevice } from '../state/device.jsx';

// Settings (spec 11). Phase 1 has only "This computer" (11.6): the device
// name and Sign out. Renaming, the other panels and the footer come in Phase 2.
export default function SettingsPage() {
  const { signOut } = useSession();
  const { label } = useDevice();
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    setBusy(true);
    await signOut();
    // The login screen replaces this page; nothing to reset.
  }

  return (
    <>
      <div className="panel-head">
        <div className="panel-title"><h2>Settings</h2></div>
      </div>
      <div className="card-grid">
        <section className="cardpanel">
          <div className="cardpanel-head"><strong>This computer</strong></div>
          <div className="cardpanel-body">
            <label>Computer name</label>
            <p className="setting-value">{label}</p>
            <button type="button" className={`btn danger-ghost${busy ? ' busy' : ''}`} onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </section>
      </div>
      <p className="empty">The rest of Settings arrives in Phase 2.</p>
    </>
  );
}
