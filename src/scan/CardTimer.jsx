import { useEffect, useState } from 'react';

// How long the card has taken, in the camera's top right corner (owner, 2026-10-27: "Can we make the 3
// second timer visible in the top right corner of the camera panel, clear to read, but also subtle";
// decision 558). Counting up, and held when the card's done (owner, 2026-10-27: "Instead of counting down,
// count up, and instead of stopping drawing when complete, remain on the screen as the last number counted
// up to so that the user can see how quickly it got the scan. When the number locks in to remain on the
// screen, become bold and amber"; decision 559). Its own small component, ticking twenty times a second,
// so the scanner's screen isn't drawn again with it.

/**
 * @param {{ read: () => number|null }} props  read: when the card's time began (Scanner.jsx: Scan card's
 *   press, else auto scan's cardTime), null with none running; a stable function
 */
export default function CardTimer({ read }) {
  const [shown, setShown] = useState(null);   // { at, ms, done }
  useEffect(() => {
    const timer = setInterval(() => {
      const at = read();
      setShown((s) => {
        if (at != null) return { at, ms: Date.now() - at, done: false };
        // The card's done (sent, its list opened, or taken away): its last time held, locked in.
        if (s && !s.done) return { ...s, done: true };
        return s;
      });
    }, 50);
    return () => clearInterval(timer);
  }, [read]);
  if (!shown) return null;
  const text = (shown.ms / 1000).toFixed(1);
  // Red from 2.1 s on, and held red when the card's 3 s ran out (owner, 2026-10-27: "make the timer red
  // between 2.1 and 3.0 seconds, and when it finishes at 3.0, leave it red"; decision 560). A card done
  // sooner is held amber.
  const red = shown.done ? Number(text) >= 3 : Number(text) >= 2.1;
  return (
    <div className={`scan-card-timer${shown.done ? ' done' : ''}${red ? ' late' : ''}`} aria-hidden="true">
      {text}
    </div>
  );
}
