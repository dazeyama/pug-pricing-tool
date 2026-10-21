import { useState } from 'react';
import { useSellFloor, useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useSettingField } from './useSettingField.js';
import { SELL_FLOOR, SELL_FLOOR_MAX, formatMoneyCents, roundDownPrice, roundUpPrice } from '../../lib/money.js';

const VALID_MONEY = /^\d{1,2}(\.\d{1,2})?$/;

// The store's rounding steps (Help, Rounding), each with a price to show it on.
const STEPS = [
  { band: 'Under $1', to: 'cent', example: 0.23 },
  { band: '$1 to $10', to: 'quarter', example: 3.1 },
  { band: '$10 to $100', to: 'dollar', example: 12.4 },
  { band: '$100 to $1,000', to: '$5', example: 123 },
  { band: '$1,000 and up', to: '$10', example: 1234 },
];

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
      : `Enter a dollar amount from ${formatMoneyCents(SELL_FLOOR)} to ${formatMoneyCents(SELL_FLOOR_MAX)}.`),
    save: (next) => save('sell_floor', next, current?.id),
    saved: (next) => `Export sell floor saved: ${formatMoneyCents(next)}.`,
    shown: (v) => Number(v).toFixed(2),   // money, two decimals always (owner, 2026-10-20)
  });
  const sell = side === 'sell';

  return (
    <section className="cardpanel settings-panel">
      <div className="cardpanel-head"><strong>Export sell floor</strong></div>
      <div className="cardpanel-body">
        <p className="hint">
          An exported card sells at today’s market price, rounded up, never below this floor (a typed
          price neither). Cards already exported keep theirs. {formatMoneyCents(SELL_FLOOR)} at the lowest.
        </p>
        {/* The box on the left, the rounding beside it (owner, 2026-10-20): a table like Collection
            Manager's Activity panel, grey for Buy and green for Sell, switched by a pill. */}
        <div className="floor-layout">
          <label className="pct-input floor-box">
            <span className="floor-label">Floor</span>
            <span className="pct-sign">$</span>
            <input type="number" min={SELL_FLOOR} max={SELL_FLOOR_MAX} step="0.01" aria-label="Export sell floor: dollars" {...box} />
          </label>
          <div className="floor-rounding">
            <div className="floor-rounding-head">
              <span>{sell ? 'Sell: the export’s Sell Price, and Complete day…’s' : 'Buy: market prices, Cash and Credit'}</span>
              <span className="floor-pill" role="group" aria-label="Rounding for">
                {['buy', 'sell'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`${s}${side === s ? ' on' : ''}`}
                    aria-pressed={side === s}
                    onClick={() => setSide(s)}
                  >
                    {s === 'buy' ? 'Buy' : 'Sell'}
                  </button>
                ))}
              </span>
            </div>
            <div className={`floor-window is-${side}`}>
              <table className="floor-table">
                <thead>
                  <tr>
                    <th>Price</th>
                    <th>Rounded {sell ? 'up' : 'down'} to the</th>
                    <th className="num">Example</th>
                  </tr>
                </thead>
                <tbody>
                  {STEPS.map((s) => {
                    const up = roundUpPrice(s.example);
                    const shown = sell ? Math.max(floor, up) : roundDownPrice(s.example);
                    return (
                      <tr key={s.band}>
                        <td>{s.band}</td>
                        <td>{s.to}</td>
                        <td className="num">
                          {formatMoneyCents(s.example)} → <strong>{formatMoneyCents(shown)}</strong>
                          {sell && shown > up && <span className="floor-note"> (floor)</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!sell && <p className="hint floor-foot">A project’s prices round up.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
