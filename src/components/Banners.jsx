import { Link } from 'react-router-dom';
import { useInventory } from '../state/inventory.jsx';
import { useConnection } from '../state/connection.jsx';
import { usePriceLimit } from '../state/priceLimit.jsx';
import { formatTime } from '../lib/time.js';

// Banners below the header, above the tab content (spec 7.5). The backup
// reminder arrives with Phase 10.
export default function Banners() {
  const inventory = useInventory();
  const { offline } = useConnection();
  const { limitUntil } = usePriceLimit();

  return (
    <>
      {inventory.loaded && !inventory.current && (
        <div className="banner err">
          <strong>Master Crystal Inventory required.</strong> Upload your Crystal Commerce
          inventory CSV in Settings before exporting.
          <Link to="/settings">Open Settings</Link>
        </div>
      )}
      {offline && (
        <div className="banner warn">No connection — changes are paused.</div>
      )}
      {limitUntil && (
        <div className="banner warn">
          JustTCG daily limit reached — enter prices manually until {formatTime(limitUntil)}.
        </div>
      )}
    </>
  );
}
