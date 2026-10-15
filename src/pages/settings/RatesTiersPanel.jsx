import { useEffect, useState } from 'react';
import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatMoney } from '../../lib/money.js';
import { tiersFrom } from '../../lib/rates.js';

const VALID_PCT = /^\d{1,3}(\.\d{1,2})?$/;
const VALID_MONEY = /^\d{1,6}(\.\d{1,2})?$/;

/**
 * One box of the tiers (a threshold in dollars or a rate in %), saved when it
 * loses focus. The whole setting is saved at once, with the box changed.
 */
function TierBox({ tier, field, money = false, label }) {
  const { values, save } = useSettings();
  const { current } = useStaff();
  const toast = useToast();
  const tiers = tiersFrom(values.rate_tiers);
  const stored = tiers[tier][field];
  const [text, setText] = useState(String(stored));
  const [editing, setEditing] = useState(false);

  // Follow other computers' changes, but never under someone's typing.
  useEffect(() => {
    if (!editing) setText(String(stored));
  }, [stored, editing]);

  async function commit() {
    setEditing(false);
    const raw = text.trim().replace(/^\$/, '');
    const next = Number(raw);
    let problem = null;
    if (money) {
      if (!VALID_MONEY.test(raw) || !(next > 0)) problem = 'Enter a dollar amount over $0, with up to 2 decimals.';
      else if (tier === 'low' && next >= tiers.high.over) problem = `The low end has to stay below the high end (${formatMoney(tiers.high.over)}).`;
      else if (tier === 'high' && next <= tiers.low.under) problem = `The high end has to stay above the low end (${formatMoney(tiers.low.under)}).`;
    } else if (!VALID_PCT.test(raw) || next > 100) {
      problem = 'Enter a number from 0 to 100, with up to 2 decimals.';
    }
    if (problem) {
      toast(problem, 'err');
      setText(String(stored));
      return;
    }
    if (next === stored) return;
    const value = { ...tiers, [tier]: { ...tiers[tier], [field]: next } };
    const err = await save('rate_tiers', value, current?.id);
    if (err) {
      toast(`Couldn't save: ${err}`, 'err');
      setText(String(stored));
    } else {
      toast(`${label} saved: ${money ? formatMoney(next) : `${next}%`}.`, 'ok');
    }
  }

  return (
    // Credit and Cash boxes in their colours (owner, 2026-10-15).
    <span className={`pct-input fb-box${money ? ' tier-money' : ` tier-${field}`}`}>
      {money && <span className="pct-sign">$</span>}
      <input
        type="number"
        min="0"
        max={money ? undefined : 100}
        step="0.01"
        aria-label={label}
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {!money && <span className="pct-sign">%</span>}
    </span>
  );
}

// Settings → Low-end and high-end rates (docs/TEAM_FEEDBACK.md 4.2; owner,
// 2026-10-14): cards strictly under or over a price get their own rates, on
// walk-in buys, collections and projects alike, unless the buy or collection
// has custom rates. Saved like every setting, live on every computer.
export default function RatesTiersPanel() {
  return (
    <section className="cardpanel settings-panel">
      <div className="cardpanel-head"><strong>Low-end and high-end rates</strong></div>
      <div className="cardpanel-body">
        <p className="hint">
          Cards under or over these prices (each card's own price, strictly) get these rates instead
          of the Master Buy Percentages. A buy or collection with custom rates uses those for every
          card; a card's own rate (right-click → Set Rate) always wins.
        </p>
        <table className="fb-table tier-table">
          <thead>
            <tr>
              <th scope="col" aria-label="Tier" />
              <th scope="col">Threshold</th>
              <th scope="col" className="is-credit">Credit</th>
              <th scope="col" className="is-cash">Cash</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Low end</th>
              <td><span className="tier-cell"><span className="tier-when">under</span><TierBox tier="low" field="under" money label="Low end: cards under" /></span></td>
              <td><TierBox tier="low" field="credit" label="Low end Credit" /></td>
              <td><TierBox tier="low" field="cash" label="Low end Cash" /></td>
            </tr>
            <tr>
              <th scope="row">High end</th>
              <td><span className="tier-cell"><span className="tier-when">over</span><TierBox tier="high" field="over" money label="High end: cards over" /></span></td>
              <td><TierBox tier="high" field="credit" label="High end Credit" /></td>
              <td><TierBox tier="high" field="cash" label="High end Cash" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
