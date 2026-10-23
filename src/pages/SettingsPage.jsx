import MasterInventoryPanel from './settings/MasterInventoryPanel.jsx';
import PercentagesPanel from './settings/PercentagesPanel.jsx';
import RatesTiersPanel from './settings/RatesTiersPanel.jsx';
import BulkValuesPanel from './settings/BulkValuesPanel.jsx';
import BulkExportRatesPanel from './settings/BulkExportRatesPanel.jsx';
import SellFloorPanel from './settings/SellFloorPanel.jsx';
import ApiKeysPanel from './settings/ApiKeysPanel.jsx';
import UsagePanel from './settings/UsagePanel.jsx';
import FallbackPanel from './settings/FallbackPanel.jsx';
import ThisComputerPanel from './settings/ThisComputerPanel.jsx';
import BackupsPanel from './settings/BackupsPanel.jsx';
import CcMatchingPanel from './settings/CcMatchingPanel.jsx';
import OwnedCopiesPanel from './settings/OwnedCopiesPanel.jsx';
import { formatDate } from '../lib/time.js';

/* global __APP_VERSION__, __BUILD_DATE__ */

// The footer's credits (spec 11.7): what, and where it comes from.
const CREDITS = [
  ['Magic card data and images', 'Scryfall'],
  ['Pokémon card data and images', 'TCGdex'],
  ['Backup Pokémon images', 'pokemontcg.io and TCGplayer'],
  ['Japanese Pokémon images', 'Limitless TCG'],
  ['Vintage Japanese Pokémon images (1996–2001)', 'Pokellector'],
  ['English names for Japanese Pokémon', 'PokeAPI'],
  ['Prices', 'JustTCG'],
  ['Pokémon cards TCGdex doesn\u2019t list yet', 'TCGplayer\u2019s catalogue, through JustTCG'],
  ['Cardmarket prices', 'Scryfall (Magic) and TCGdex (Pokémon)'],
  ['Euro to dollar rate', 'Frankfurter (European Central Bank)'],
  // The phone scanner (docs/SCAN_FUNCTION.md 10.1): its recognition is mtgscan's (GPL-3.0), its OCR Tesseract.js.
  ['Card scanning', 'mtgscan (GPL-3.0) and Tesseract.js'],
];

// Settings (spec 11), each section in a panel, two columns across the page
// with related panels side by side (owner, 2026-09-29): the required CSV
// with this computer, the JustTCG key with its usage, the Master Buy
// Percentages with the low-end and high-end rates (owner, 2026-10-14), then
// the fallback percentages with the bulk values (owner, 2026-10-15); Crystal Commerce matching and Backups take a row each
// (export spec 11.2, Phase 10). Staff users are
// managed in the header dropdown, not here.
export default function SettingsPage() {
  return (
    <>
      <div className="panel-head">
        <div className="panel-title"><h2>Settings</h2></div>
      </div>
      <div className="settings-grid">
        <MasterInventoryPanel />
        <ThisComputerPanel />
        <ApiKeysPanel />
        <UsagePanel />
        <PercentagesPanel />
        <RatesTiersPanel />
        <FallbackPanel />
        <BulkValuesPanel />
        <BulkExportRatesPanel />
        <SellFloorPanel />
        <OwnedCopiesPanel />
        <CcMatchingPanel />
        <BackupsPanel />
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
