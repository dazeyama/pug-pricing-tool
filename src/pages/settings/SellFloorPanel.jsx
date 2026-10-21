import { useState } from 'react';
import { useSellFloor, useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useSettingField } from './useSettingField.js';
import { SELL_FLOOR, SELL_FLOOR_MAX, formatMoney, roundDownPrice, roundUpPrice } from '../../lib/money.js';

const VALID_MONEY = /^\d{1,2}(\.\d{1,2})?$/;

// The store's rounding steps (Help, Rounding), each with a price to show it on.
const STEPS = [
  { band: 'Under $1', to: 'cent', example: 0.237 },
  { band: '$1 to $10', to: 'quarter', example: 3.1 },
  { band: '$10 to $100', to: 'dollar', example: 12.4 },
  { band: '$100 to $1,000', to: '$5', example: 123 },
  { band: '$1,000 and up', to: '$10', example: 1234 },
];

const exact = (v) => `$${v < 1 ? v.toFixed(3) : v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// Settings → Export sell floor (decision 417): the lowest Sell Price an export sets, and the store's
// rounding, Buy (down) or Sell (up, then the floor), to explain it.
export default function SellFloorPanel() {
  const { save } = useSettings();
  const { current } = useStaff();
  const floor = useSellFloor();
  const [side, setSide] = useState('sell');   // the table: 'buy' | 'sell'
  const box = useSettingField({
    stored: floor,
    clean: (t) => t.trim().replace(/^\$/, ''),
    problem: (raw, next) => (VALID_MONEY.test(raw) && next >= SELL_FLOOR && next <= SELL_FLOOR_MAX ? null
      : `Enter a dollar amount from ${formatMoney(SELL_FLOOR)} to ${formatMoney(SELL_FLOOR_MAX)}.`),
    save: (next) => save('sell_floor', next, current?.id),
    saved: (next) => `Export sell floor saved: ${formatMoney(next)}.`,
  });
  const sell = side === 'sell';

  return (
    <section className="cardpanel settings-panel">
      <div className="cardpanel-head"><strong>Export sell floor</strong></div>
      <div className="cardpanel-body">
        <p className="hint">
          An exported card sells at today’s market price, rounded up, never below this floor (a typed
          price neither). Cards already exported keep theirs. {formatMoney(SELL_FLOOR)} at the lowest.
        </p>
        <label className="pct-input floor-box">
          <span className="floor-label">Floor</span>
          <span className="pct-sign">$</span>
          <input type="number" min={SELL_FLOOR} max={SELL_FLOOR_MAX} step="0.01" aria-label="Export sell floor: dollars" {...box} />
        </label>
        <table className="fb-table floor-table">
          <thead>
            <tr>
              <th>Price</th>
              <th>Rounded {sell ? 'up' : 'down'} to the</th>
              <th className="floor-toggle-cell">
                <span className="floor-toggle" role="group" aria-label="Rounding for">
                  {['buy', 'sell'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={side === s ? 'on' : undefined}
                      aria-pressed={side === s}
                      onClick={() => setSide(s)}
                    >
                      {s === 'buy' ? 'Buy' : 'Sell'}
                    </button>
                  ))}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {STEPS.map((s) => {
              const up = roundUpPrice(s.example);
              const shown = sell ? Math.max(floor, up) : roundDownPrice(s.example);
              return (
                <tr key={s.band}>
                  <th scope="row">{s.band}</th>
                  <td>{s.to}</td>
                  <td className="floor-example">
                    {exact(s.example)} → {formatMoney(shown)}
                    {sell && shown > up && <span className="floor-note"> (floor)</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="hint floor-foot">
          {sell ? 'Sell: the export’s Sell Price, and Complete day…’s.'
            : 'Buy: market prices, and the Cash and Credit paid. A project’s prices round up.'}
        </p>
      </div>
    </section>
  );
}
