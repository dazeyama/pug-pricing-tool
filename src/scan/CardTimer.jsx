import { useEffect, useState } from 'react';

// How long the card has taken, in the camera's top right corner (owner, 2026-10-27: "Can we make the 3
// second timer visible in the top right corner of the camera panel, clear to read, but also subtle";
// decision 558). Counting up, and held when the card's done (owner, 2026-10-27: "Instead of counting down,
// count up, and instead of stopping drawing when complete, remain on the screen as the last number counted
// up to so that the user can see how quickly it got the scan. When the number locks in to remain on the
// screen, become bold and amber"; decision 559). Its own small component, ticking twenty times a second,
// so the scanner's screen isn't drawn again with it.

/**
 * @param {{ read: () => ({ at: number, ms?: number }|null) }} props  read: the card's clock (Scanner.jsx):
 *   { at } while it's read (Scan card's press, else auto scan's cardTime); { at, ms } once it's done, ms its
 *   real time (decision 568); null with none; a stable function
 */
export default function CardTimer({ read }) {
  const [shown, setShown] = useState(null);   // { at, ms, done }
  useEffect(() => {
    const timer = setInterval(() => {
      const clock = read();
      setShown((s) => {
        if (clock && clock.ms == null) return { at: clock.at, ms: Date.now() - clock.at, done: false };
        // The card's done, its real time held (decision 568: the last tick could be 2.9 when its 3 s ran
        // out inside a look).
        if (clock) return s?.done && s.at === clock.at && s.ms === clock.ms ? s : { at: clock.at, ms: clock.ms, done: true };
        // Taken away: its last time held, locked in.
        if (s && !s.done) return { ...s, done: true };
        return s;
      });
    }, 50);
    return () => clearInterval(timer);
  }, [read]);
  if (!shown) return null;
  // Tenths cut down, not rounded (decision 565): 2.96 s reads "2.9", so "3.0" is only ever a card whose
  // 3 s ran out, and the colour goes by the number shown.
  const tenths = Math.floor(Math.max(0, shown.ms) / 100);
  const text = (tenths / 10).toFixed(1);
  // Red from 2.1 s on, and held red when the card's 3 s ran out (owner, 2026-10-27: "make the timer red
  // between 2.1 and 3.0 seconds, and when it finishes at 3.0, leave it red"; decision 560). A card done
  // sooner is held amber.
  const red = shown.done ? tenths >= 30 : tenths >= 21;
  return (
    <div className={`scan-card-timer${shown.done ? ' done' : ''}${red ? ' late' : ''}`} aria-hidden="true">
      {text}
    </div>
  );
}
