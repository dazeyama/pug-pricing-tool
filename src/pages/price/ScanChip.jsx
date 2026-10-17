import { useEffect, useState } from 'react';
import { formatTime } from '../../lib/time.js';

// A phone's last beat older than this, and the chip says it's away
// (docs/SCAN_FUNCTION.md 5.4): its screen locked, or another app open.
const AWAY_MS = 60_000;

/**
 * The paired phone, in the list's heading (docs/SCAN_FUNCTION.md 8.2):
 * "📱 Chase's phone · 23 scanned", with × to let it go. Muted, "away", when
 * the phone hasn't been heard from for a minute. Nothing when no phone is paired.
 * @param {{ session: object|null, onUnpair: () => void }} props
 */
export default function ScanChip({ session, onUnpair }) {
  const [now, setNow] = useState(() => Date.now());
  const paired = Boolean(session?.phone_device_id);
  // "Away" is a matter of time passing: look again every 15 seconds.
  useEffect(() => {
    if (!paired) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [paired]);
  if (!paired) return null;

  const name = session.phone_label || 'A phone';
  const seen = session.phone_seen_at ? Date.parse(session.phone_seen_at) : 0;
  const away = now - seen > AWAY_MS;
  const since = session.paired_at ? formatTime(session.paired_at) : null;
  const title = away
    ? `${name} hasn't been heard from for a minute: its screen may be locked. It's still paired; × lets it go.`
    : `Scanning from ${name}${since ? ` since ${since}` : ''}. Cards it scans are added here. × unpairs it.`;
  return (
    <span className={`scan-chip${away ? ' away' : ''}`} title={title}>
      <span aria-hidden="true">📱</span>
      <span className="scan-chip-name">{name}</span>
      {away ? <span className="scan-chip-count">away</span> : (
        <span className="scan-chip-count">· {session.scanned} scanned</span>
      )}
      <button type="button" className="scan-chip-x" aria-label={`Unpair ${name}`} title={`Unpair ${name}`} onClick={onUnpair}>×</button>
    </span>
  );
}
