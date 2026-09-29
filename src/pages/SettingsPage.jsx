import MasterInventoryPanel from './settings/MasterInventoryPanel.jsx';
import PercentagesPanel from './settings/PercentagesPanel.jsx';
import ThisComputerPanel from './settings/ThisComputerPanel.jsx';
import { formatDate } from '../lib/time.js';

/* global __APP_VERSION__, __BUILD_DATE__ */

// Settings (spec 11), top to bottom, each section in a panel. API keys and
// the JustTCG meter arrive in Phase 5, backups in Phase 10. Staff users are
// managed in the header dropdown, not here.
export default function SettingsPage() {
  return (
    <>
      <div className="panel-head">
        <div className="panel-title"><h2>Settings</h2></div>
      </div>
      <div className="settings-stack">
        <MasterInventoryPanel />
        <PercentagesPanel />
        <ThisComputerPanel />
        <footer className="settings-footer">
          <p>
            Card data and images from Scryfall (Magic) and TCGdex (Pokémon), with some Pokémon images
            from pokemontcg.io and TCGplayer. Prices via JustTCG.
            Not affiliated with Wizards of the Coast or The Pokémon Company.
          </p>
          <p>
            PUG Pricing Tool {__APP_VERSION__} · built {formatDate(__BUILD_DATE__)}
          </p>
        </footer>
      </div>
    </>
  );
}
