import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useSettingField } from './useSettingField.js';

const VALID = /^\d{1,3}(\.\d{1,2})?$/;

/** One percentage: 0–100, up to 2 decimals, saved when the field loses focus. */
function PercentField({ label, settingKey }) {
  const { values, save } = useSettings();
  const { current } = useStaff();
  const box = useSettingField({
    stored: Number(values[settingKey]),
    problem: (raw, next) => (!VALID.test(raw) || next > 100 ? 'Enter a number from 0 to 100, with up to 2 decimals.' : null),
    save: (next) => save(settingKey, next, current?.id),
    saved: (next) => `${label} saved: ${next}%.`,
    failed: `Couldn't save ${label}`,
  });

  return (
    <div className={`pct-field ${settingKey === 'cash_pct' ? 'cash' : 'credit'}`}>
      <label htmlFor={`pct-${settingKey}`}>{label}</label>
      <div className="pct-input">
        <input id={`pct-${settingKey}`} type="number" min="0" max="100" step="0.01" {...box} />
        <span className="pct-sign">%</span>
      </div>
    </div>
  );
}

// Settings → Master Buy Percentages (spec 11.4).
export default function PercentagesPanel() {
  return (
    <section className="cardpanel settings-panel">
      <div className="cardpanel-head"><strong>Master Buy Percentages</strong></div>
      <div className="cardpanel-body">
        <p className="hint">
          What the store pays, as a share of the market total. Changes apply right away to
          buys in progress and unpaid collections; confirmed buys and Paid/Ours collections keep
          the percentages they were made with.
        </p>
        <div className="pct-row">
          <PercentField label="Cash %" settingKey="cash_pct" />
          <PercentField label="Credit %" settingKey="credit_pct" />
        </div>
      </div>
    </section>
  );
}
