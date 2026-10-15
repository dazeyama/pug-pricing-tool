import { hasOwnRate, lineRate } from '../lib/rates.js';

/**
 * The alert when confirming (docs/TEAM_FEEDBACK.md 4.5): every card with its
 * own rate (Set Rate), short and simple (owner, 2026-10-15): its name and its
 * rates, on CONFIRM BUY, a collection's Paid/Ours and Convert to buy. It
 * informs; the dialog's own button still confirms. Nothing when no card has
 * its own rate.
 *   ⚠ 1 card has its own rate
 *   Mental Misstep   Credit 80%   Cash 50%
 */
export default function OwnRateAlert({ lines, rates }) {
  const own = lines.filter(hasOwnRate);
  if (!own.length) return null;
  const n = own.length;
  return (
    <div className="own-rate-alert" role="note">
      <strong>⚠ {n} card{n === 1 ? ' has its' : 's have their'} own rate{n === 1 ? '' : 's'}</strong>
      <ul>
        {own.map((l) => {
          const r = lineRate(l, rates);
          return (
            <li key={l.id}>
              <span className="ora-card">{l.name_en || l.name}</span>
              <span className="is-credit">Credit {r.credit}%</span>
              <span className="is-cash">Cash {r.cash}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
