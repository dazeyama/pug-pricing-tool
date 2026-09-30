import MasterInventoryPanel from './settings/MasterInventoryPanel.jsx';
import PercentagesPanel from './settings/PercentagesPanel.jsx';
import ApiKeysPanel from './settings/ApiKeysPanel.jsx';
import UsagePanel from './settings/UsagePanel.jsx';
import FallbackPanel from './settings/FallbackPanel.jsx';
import ThisComputerPanel from './settings/ThisComputerPanel.jsx';
import { formatDate } from '../lib/time.js';

/* global __APP_VERSION__, __BUILD_DATE__ */

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
          <p>
            Card data and images from Scryfall (Magic) and TCGdex (Pokémon), with some Pokémon images
            from pokemontcg.io, TCGplayer and Limitless TCG (Japanese). Prices via JustTCG.
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
