import { formatMoney } from '../lib/money.js';
import { lineText } from '../lib/lineFormat.js';
import { ownRateChanges } from '../lib/rates.js';

/**
 * The alert when confirming (docs/TEAM_FEEDBACK.md 4.5): every card with its
 * own rate (Set Rate) and the difference it makes against the rate it would
 * otherwise get, on CONFIRM BUY, a collection's Paid/Ours and Convert to buy.
 * It informs; the dialog's own button still confirms. Nothing when no card
 * has its own rate.
 *   ⚠ 2 cards have their own rates
 *   1 Volcanic Island (3ED) 286 — Credit 75% (not 70%): +$22.50 credit · Cash 45% (not 40%): +$22.50 cash
 */
export default function OwnRateAlert({ lines, rates }) {
  const changes = ownRateChanges(lines, rates);
  if (!changes.length) return null;
  const n = changes.length;
  const money = (d) => `${d < 0 ? '−' : '+'}${formatMoney(Math.abs(d))}`;
  return (
    <div className="own-rate-alert" role="note">
      <strong>⚠ {n} card{n === 1 ? ' has its' : 's have their'} own rate{n === 1 ? '' : 's'}</strong>
      <ul>
        {changes.map(({ line, sides }) => (
          <li key={line.id}>
            <span className="ora-card">{lineText(line)}</span>
            {' — '}
            {sides.map((x, i) => (
              <span key={x.side} className={`ora-side is-${x.side}`}>
                {i > 0 && ' · '}
                {x.side === 'cash' ? 'Cash' : 'Credit'} {x.own}% (not {x.other}%): {money(x.diff)} {x.side}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
