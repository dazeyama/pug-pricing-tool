import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useSettingField } from './useSettingField.js';
import { CONDITIONS } from '../../lib/prices.js';
import { GAMES } from '../../lib/games.js';

const VALID = /^\d{1,3}(\.\d{1,2})?$/;
// Each game's row: its setting's key and its name.
const ROWS = GAMES.map((g) => ({ key: `fallback_pct_${g.key}`, name: g.name }));

/** One percentage box: 0–100, up to 2 decimals, saved when it loses focus. */
function PctBox({ game, code }) {
  const { values, save } = useSettings();
  const { current } = useStaff();
  const all = values[game.key];
  const box = useSettingField({
    stored: Number(all[code]),
    problem: (raw, next) => (!VALID.test(raw) || next > 100 ? 'Enter a number from 0 to 100, with up to 2 decimals.' : null),
    save: (next) => save(game.key, { ...all, [code]: next }, current?.id),
    saved: (next) => `${game.name} ${code} fallback saved: ${next}%.`,
  });

  return (
    <span className="pct-input fb-box">
      <input type="number" min="0" max="100" step="0.01" aria-label={`${game.name} ${code} fallback percentage`} {...box} />
      <span className="pct-sign">%</span>
    </span>
  );
}

// Settings → Master Fallback Percentages (owner, 2026-09-29): a condition
// JustTCG doesn't price (or prices out of order) is JustTCG's NM, else the
// Scryfall/TCGdex market price, × its percentage here (lib/prices priceLadder).
export default function FallbackPanel() {
  return (
    <section className="cardpanel settings-panel">
      <div className="cardpanel-head"><strong>Master Fallback Percentages</strong></div>
      <div className="cardpanel-body">
        <p className="hint">
          Used when JustTCG has no price for a condition, or prices a worse condition above a better
          one (that price is thrown out): the condition gets JustTCG’s Near Mint price times its
          percentage. Without a JustTCG Near Mint, TCGplayer’s Market Price (through Scryfall for
          Magic, TCGdex for Pokémon) is used instead. Prices worked out this way are marked
          “fallback”; when every price comes from TCGplayer (Use TCGplayer, or no JustTCG prices),
          or one is TCGplayer’s price itself (its condition at 100%), they’re marked “TCGplayer”.
        </p>
        <table className="fb-table">
          <thead>
            <tr>
              <th />
              {CONDITIONS.map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((g) => (
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
