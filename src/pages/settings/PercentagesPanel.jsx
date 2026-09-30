import { useEffect, useState } from 'react';
import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useToast } from '../../components/Toast.jsx';

const VALID = /^\d{1,3}(\.\d{1,2})?$/;

/** One percentage: 0–100, up to 2 decimals, saved when the field loses focus. */
function PercentField({ label, settingKey }) {
  const { values, save } = useSettings();
  const { current } = useStaff();
  const toast = useToast();
  const stored = Number(values[settingKey]);
  const [text, setText] = useState(String(stored));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  // Follow changes from other computers, but never under the user's typing.
  useEffect(() => {
    if (!editing) setText(String(stored));
  }, [stored, editing]);

  async function commit() {
    setEditing(false);
    const raw = text.trim();
    if (!VALID.test(raw) || Number(raw) > 100) {
      setError('Enter a number from 0 to 100, with up to 2 decimals.');
      setText(String(stored));
      return;
    }
    setError('');
    const next = Number(raw);
    if (next === stored) return;
    const err = await save(settingKey, next, current?.id);
    if (err) {
      toast(`Couldn't save ${label}: ${err}`, 'err');
      setText(String(stored));
    } else {
      toast(`${label} saved: ${next}%.`, 'ok');
    }
  }

  return (
    <div className={`pct-field ${settingKey === 'cash_pct' ? 'cash' : 'credit'}`}>
      <label htmlFor={`pct-${settingKey}`}>{label}</label>
      <div className="pct-input">
        <input
          id={`pct-${settingKey}`}
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={text}
          onFocus={() => setEditing(true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <span className="pct-sign">%</span>
      </div>
      {error && <p className="field-error">{error}</p>}
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
