import MasterInventoryPanel from './settings/MasterInventoryPanel.jsx';
import PercentagesPanel from './settings/PercentagesPanel.jsx';
import ApiKeysPanel from './settings/ApiKeysPanel.jsx';
import UsagePanel from './settings/UsagePanel.jsx';
import FallbackPanel from './settings/FallbackPanel.jsx';
import ThisComputerPanel from './settings/ThisComputerPanel.jsx';
import { formatDate } from '../lib/time.js';

/* global __APP_VERSION__, __BUILD_DATE__ */

// The footer's credits (spec 11.7): what, and where it comes from.
const CREDITS = [
  ['Magic card data and images', 'Scryfall'],
  ['Pokémon card data and images', 'TCGdex'],
  ['Backup Pokémon images', 'pokemontcg.io and TCGplayer'],
  ['Japanese Pokémon images', 'Limitless TCG'],
  ['English names for Japanese Pokémon', 'PokeAPI'],
  ['Prices', 'JustTCG'],
  ['Cardmarket prices', 'Scryfall (Magic) and TCGdex (Pokémon)'],
  ['Euro to dollar rate', 'Frankfurter (European Central Bank)'],
];

// Settings (spec 11), top to bottom, each section in a panel. Backups arrive
// in Phase 10. Staff users are managed in the header dropdown, not here.
export default function SettingsPage() {
  return (
    <>
      <div className="panel-head">
        <div className="panel-title"><h2>Settings</h2></div>
      </div>
      <div className="settings-stack">
        <MasterInventoryPanel />
        <ApiKeysPanel />
        <UsagePanel />
        <PercentagesPanel />
        <FallbackPanel />
        <ThisComputerPanel />
        <footer className="settings-footer">
          {/* Where everything comes from, one line each (owner, 2026-09-29). */}
          <ul className="credits">
            {CREDITS.map(([what, from]) => (
              <li key={what}><span className="credit-what">{what}</span> <span className="credit-from">{from}</span></li>
            ))}
          </ul>
          <p>Not affiliated with Wizards of the Coast or The Pokémon Company.</p>
          <p>
            PUG Pricing Tool {__APP_VERSION__} · built {formatDate(__BUILD_DATE__)}
          </p>
        </footer>
      </div>
    </>
  );
}
