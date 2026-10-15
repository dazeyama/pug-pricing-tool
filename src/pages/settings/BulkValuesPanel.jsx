import { useEffect, useState } from 'react';
import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatMoney } from '../../lib/money.js';
import { BULK_ITEMS, bulkValuesFrom } from '../../lib/bulk.js';

const VALID_MONEY = /^\d{1,6}(\.\d{1,2})?$/;
const GAMES = [
  { game: 'mtg', name: 'Magic' },
  { game: 'pokemon', name: 'Pokémon' },
];

/** One item's value: dollars, up to 2 decimals, saved when the box loses focus. */
function ValueBox({ item }) {
  const { values, save } = useSettings();
  const { current } = useStaff();
  const toast = useToast();
  const all = bulkValuesFrom(values.bulk_values);
  const stored = all[item.kind];
  const [text, setText] = useState(String(stored));
  const [editing, setEditing] = useState(false);

  // Follow other computers' changes, but never under someone's typing.
  useEffect(() => {
    if (!editing) setText(String(stored));
  }, [stored, editing]);

  async function commit() {
    setEditing(false);
    const raw = text.trim().replace(/^\$/, '');
    if (!VALID_MONEY.test(raw)) {
      toast('Enter a dollar amount, with up to 2 decimals.', 'err');
      setText(String(stored));
      return;
    }
    const next = Number(raw);
    if (next === stored) return;
    const err = await save('bulk_values', { ...all, [item.kind]: next }, current?.id);
    if (err) {
      toast(`Couldn't save: ${err}`, 'err');
      setText(String(stored));
    } else {
      toast(`${item.name} saved: ${formatMoney(next)} per ${item.per}.`, 'ok');
    }
  }

  return (
    <span className="pct-input fb-box bulk-box">
      <span className="pct-sign">$</span>
      <input
        type="number"
        min="0"
        step="0.01"
        aria-label={`${item.name}: dollars per item`}
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
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
            <table key={g.game} className="fb-table bulk-table">
              <thead>
                <tr><th colSpan={2}>{g.name}</th></tr>
              </thead>
              <tbody>
                {BULK_ITEMS.filter((i) => i.game === g.game).map((item) => (
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
