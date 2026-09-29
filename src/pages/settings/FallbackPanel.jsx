import { useEffect, useState } from 'react';
import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useToast } from '../../components/Toast.jsx';
import { CONDITIONS } from '../../lib/prices.js';

const VALID = /^\d{1,3}(\.\d{1,2})?$/;
const GAMES = [
  { key: 'fallback_pct_mtg', name: 'Magic' },
  { key: 'fallback_pct_pokemon', name: 'Pokémon' },
];

/** One percentage box: 0–100, up to 2 decimals, saved when it loses focus. */
function PctBox({ game, code }) {
  const { values, save } = useSettings();
  const { current } = useStaff();
  const toast = useToast();
  const all = values[game.key];
  const stored = Number(all[code]);
  const [text, setText] = useState(String(stored));
  const [editing, setEditing] = useState(false);

  // Follow other computers' changes, but never under someone's typing.
  useEffect(() => {
    if (!editing) setText(String(stored));
  }, [stored, editing]);

  async function commit() {
    setEditing(false);
    const raw = text.trim();
    if (!VALID.test(raw) || Number(raw) > 100) {
      toast('Enter a number from 0 to 100, with up to 2 decimals.', 'err');
      setText(String(stored));
      return;
    }
    const next = Number(raw);
    if (next === stored) return;
    const err = await save(game.key, { ...all, [code]: next }, current?.id);
    if (err) {
      toast(`Couldn't save: ${err}`, 'err');
      setText(String(stored));
    } else {
      toast(`${game.name} ${code} fallback saved: ${next}%.`, 'ok');
    }
  }

  return (
    <span className="pct-input fb-box">
      <input
        type="number"
        min="0"
        max="100"
        step="0.01"
        aria-label={`${game.name} ${code} fallback percentage`}
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <span className="pct-sign">%</span>
    </span>
  );
}

// Settings → Master Fallback Percentages (owner, 2026-09-29): when JustTCG has
// no price, the Scryfall/TCGdex market price stands in for NM and each other
// condition is that price × its percentage here.
export default function FallbackPanel() {
  return (
    <section className="cardpanel settings-panel">
      <div className="cardpanel-head"><strong>Master Fallback Percentages</strong></div>
      <div className="cardpanel-body">
        <p className="hint">
          Used only when JustTCG has no price for a card: the Scryfall (Magic) or TCGdex (Pokémon)
          market price is taken as Near Mint, and each condition is that price times its percentage.
          Prices worked out this way are marked “fallback”.
        </p>
        <table className="fb-table">
          <thead>
            <tr>
              <th />
              {CONDITIONS.map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {GAMES.map((g) => (
              <tr key={g.key}>
                <th scope="row">{g.name}</th>
                {CONDITIONS.map((c) => (
                  <td key={c}><PctBox game={g} code={c} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
