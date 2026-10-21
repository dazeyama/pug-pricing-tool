import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useSettingField } from './useSettingField.js';
import { formatMoneyCents } from '../../lib/money.js';
import { BULK_ITEMS, bulkValuesFrom } from '../../lib/bulk.js';
import { GAMES } from '../../lib/games.js';

const VALID_MONEY = /^\d{1,6}(\.\d{1,2})?$/;

/** One item's value: dollars, up to 2 decimals, saved when the box loses focus. */
function ValueBox({ item }) {
  const { values, save } = useSettings();
  const { current } = useStaff();
  const all = bulkValuesFrom(values.bulk_values);
  const box = useSettingField({
    stored: all[item.kind],
    clean: (t) => t.trim().replace(/^\$/, ''),
    problem: (raw) => (VALID_MONEY.test(raw) ? null : 'Enter a dollar amount, with up to 2 decimals.'),
    // From the value saved now, not as this screen last showed it (decision 394).
    save: (next) => save('bulk_values', (now) => ({ ...bulkValuesFrom(now), [item.kind]: next }), current?.id),
    saved: (next) => `${item.name} saved: ${formatMoneyCents(next)} per ${item.per}.`,
    shown: (v) => Number(v).toFixed(2),   // money, two decimals always (owner, 2026-10-20)
  });

  return (
    <span className="pct-input fb-box bulk-box">
      <span className="pct-sign">$</span>
      <input type="number" min="0" step="0.01" aria-label={`${item.name}: dollars per item`} {...box} />
    </span>
  );
}

// Settings → Bulk values (docs/TEAM_FEEDBACK.md 5.2): the market value of each
// bulk item, Magic and Pokémon side by side; Cash and Credit come from them
// like any card's market price. Changing one changes bulk added afterwards;
// bulk already in a list keeps its value.
export default function BulkValuesPanel() {
  return (
    <section className="cardpanel settings-panel">
      <div className="cardpanel-head"><strong>Bulk values</strong></div>
      <div className="cardpanel-body">
        <p className="hint">
          The market value of each bulk item, found by searching “bulk”. Cash and Credit come from it
          at the master rates (or a buy’s custom ones), never the low-end or high-end rates. Bulk already
          in a list keeps its value.
        </p>
        <div className="bulk-tables">
          {GAMES.map((g) => (
            <table key={g.key} className="fb-table bulk-table">
              <thead>
                <tr><th colSpan={2}>{g.name}</th></tr>
              </thead>
              <tbody>
                {BULK_ITEMS.filter((i) => i.game === g.key && !i.placeholder).map((item) => (
                  <tr key={item.kind}>
                    <th scope="row">{item.per} · {item.label}</th>
                    <td><ValueBox item={item} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </div>
    </section>
  );
}
