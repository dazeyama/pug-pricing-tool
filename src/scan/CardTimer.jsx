import { useEffect, useState } from 'react';

// A card's 3 s, counting down in the camera's top right corner (owner, 2026-10-27: "Can we make the 3
// second timer visible in the top right corner of the camera panel, clear to read, but also subtle";
// decision 558). Its own small component, ticking ten times a second, so the scanner's screen isn't
// drawn again with it.

/** Shown this long at 0.0 before it goes, when the 3 s ran out with the card taken away meanwhile. */
const LINGER_MS = 500;

/**
 * @param {{ startedAt: () => number|null, total: number }} props  startedAt: when the card's time began
 *   (Scanner.jsx: Scan card's press, else auto scan's cardTime), null with none running; total: its length, ms
 */
export default function CardTimer({ startedAt, total }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  const at = startedAt();
  if (at == null || now - at > total + LINGER_MS) return null;
  const left = Math.max(0, total - Math.max(0, now - at)) / 1000;
  return (
    <div className={`scan-card-timer${left < 1 ? ' low' : ''}`} aria-hidden="true">
      {left.toFixed(1)}
    </div>
  );
}
