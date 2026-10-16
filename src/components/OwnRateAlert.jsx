import { lineText } from '../lib/lineFormat.js';
import { hasOwnRate, lineRate } from '../lib/rates.js';
import { bulkItem, isValuedBulk, perText } from '../lib/bulk.js';

/**
 * The alert when confirming (docs/TEAM_FEEDBACK.md 4.5): every card with its
 * own rate (Set Rate): the card in full, then its rates (owner, 2026-10-15);
 * and every bulk line with its own value (Set value, 5.6), then that value.
 * On CONFIRM BUY, a collection's Paid/Ours and Convert to buy. It informs;
 * the dialog's own button still confirms. Nothing when there's neither.
 *   ⚠ 1 card has its own rate · 1 bulk item has its own value
 *   1 Mental Misstep (NPH) 38 *F* [MP] — Credit 80% · Cash 50%
 *   1,000 MTG Bulk commons/uncommons — $2 per 100
 */
export default function OwnRateAlert({ lines, rates }) {
  const own = lines.filter(hasOwnRate);
  // A placeholder's price is always typed in: not an own value (owner, 2026-10-16).
  const valued = lines.filter((l) => isValuedBulk(l) && l.price_source === 'manual');
  if (!own.length && !valued.length) return null;
  const n = own.length;
  const m = valued.length;
  const head = [
    n && `${n} card${n === 1 ? ' has its' : 's have their'} own rate${n === 1 ? '' : 's'}`,
    m && `${m} bulk item${m === 1 ? ' has its' : 's have their'} own value${m === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');
  return (
    <div className="own-rate-alert" role="note">
      <strong>⚠ {head}</strong>
      <ul>
        {own.map((l) => {
          const r = lineRate(l, rates);
          return (
            <li key={l.id}>
              <span className="ora-card">{lineText(l)}</span>
              {' — '}
              <span className="is-credit">Credit {r.credit}%</span>
              {' · '}
              <span className="is-cash">Cash {r.cash}%</span>
            </li>
          );
        })}
        {valued.map((l) => (
          <li key={l.id}>
            <span className="ora-card">{lineText(l)}</span>
            {' — '}
            {perText(bulkItem(l.bulk_kind), Number(l.unit_price))}
          </li>
        ))}
      </ul>
    </div>
  );
}
