import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useSession } from '../state/session.jsx';
import { useOpenSessions, whyNotPairable } from './useOpenSessions.js';

// scan_pair's refusals, as the phone says them.
const PAIR_MESSAGES = {
  session_gone: 'That computer has left its price screen.',
  session_stale: "That computer hasn't been heard from for a minute: check it's still on its price screen.",
  cannot_scan: "That computer can't take cards right now.",
  not_a_device: "This phone isn't saved yet: reload the page.",
};

/**
 * The phone's first page (docs/SCAN_FUNCTION.md 5.2): the computers with a
 * price screen open, one big button each, to pair with. The one this phone
 * is already paired with comes first, as Continue scanning.
 * @param {{ phoneId: string, notice: string|null, onPaired: (computerId: string) => void }} props
 */
export default function LandingPage({ phoneId, notice, onPaired }) {
  const { signOut } = useSession();
  const { rows, loaded, error } = useOpenSessions();
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState(null);

  const sorted = [...rows].sort((a, b) => Number(b.phone_device_id === phoneId) - Number(a.phone_device_id === phoneId));

  async function pair(row) {
    if (busy || whyNotPairable(row)) return;
    setBusy(row.device_id);
    setFailed(null);
    const { error: e } = await supabase.rpc('scan_pair', { p_device: row.device_id, p_phone: phoneId });
    setBusy(null);
    if (e) {
      setFailed(PAIR_MESSAGES[e.message] ?? `Couldn't pair: ${e.message}`);
      return;
    }
    onPaired(row.device_id);
  }

  return (
    <div className="scan-landing">
      {notice && <div className="scan-notice" role="status">{notice}</div>}
      <h2 className="scan-heading">Scan cards into</h2>
      {failed && <div className="scan-notice err" role="alert">{failed}</div>}
      {error && <div className="scan-notice err">Couldn't load the computers: {error}</div>}
      <div className="scan-computers">
        {sorted.map((row) => {
          const why = whyNotPairable(row);
          const mine = row.phone_device_id === phoneId;
          const other = row.phone_device_id && !mine;
          return (
            <button
              key={row.device_id}
              type="button"
              className={`scan-computer${why ? ' dim' : ''}${mine ? ' mine' : ''}`}
              aria-disabled={Boolean(why)}
              disabled={busy === row.device_id}
              onClick={() => pair(row)}
            >
              <span className="scan-computer-name">{row.device_label}</span>
              <span className="scan-computer-what">
                {row.target_name || (row.target_kind === 'walk_in' ? 'Buy list' : 'A collection')}
                {' · '}
                {row.staff_user_name
                  ? row.staff_user_name
                  : <span className="scan-pick-user">Pick user</span>}
              </span>
              {why && <span className="scan-computer-why">{why}</span>}
              {!why && mine && <span className="scan-computer-go">Continue scanning ›</span>}
              {!why && other && <span className="scan-computer-why">Scanning with {row.phone_label ?? 'another phone'}: tap to take over</span>}
            </button>
          );
        })}
      </div>
      {loaded && !rows.length && (
        <p className="scan-empty">
          No computer here? Open the Price tab, a project or a collection on it, and it
          shows up here.
        </p>
      )}
      {!loaded && <p className="scan-empty">Looking for computers…</p>}
      <div className="scan-landing-foot">
        {/* Only this phone: the store's other devices stay signed in. */}
        <button type="button" className="btn ghost small" onClick={() => signOut({ scope: 'local' })}>Sign out</button>
      </div>
    </div>
  );
}
