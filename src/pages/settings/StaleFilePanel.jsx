import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaff } from '../../state/staff.jsx';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';
import GuardButton from '../../components/GuardButton.jsx';
import UserTag from '../../components/UserTag.jsx';
import {
  DEFAULT_STALE_DAYS, DEFAULT_STALE_PRICE, currentStaleFile, loadStaleFile, parseDays, parseStalePrice, readStaleCsv,
} from '../../lib/staleFile.js';
import { formatMoney } from '../../lib/money.js';
import { STALE_EMOJI } from '../../lib/ownedRates.js';

/** The current file's price floor, as its line ends: ", $35 and up" (", $12.50 and up"); nothing for a file saved without one. */
const currentFloor = (file) => (file.min_price != null ? `, ${formatMoney(Number(file.min_price))} and up` : '');
import { withLoading } from '../../lib/loading.js';
import { formatDateTime } from '../../lib/time.js';

/**
 * Settings → Stale cards file (decision 581),the Master Crystal Inventory's twin: Crystal Commerce's search of
 * the cards with no sale in a window, uploaded here, how to make it, and the window it was made with (the days
 * box: the file doesn't say). Its in-stock products are the stale cards Copies we own marks down (the stale cut,
 * its panel beside this one). Uploading a new file replaces the one before.
 */
export default function StaleFilePanel() {
  const staff = useStaff();
  const { offline } = useConnection();
  const toast = useToast();
  const picker = useRef(null);
  const [current, setCurrent] = useState(undefined);   // undefined while reading, null for none
  const [readError, setReadError] = useState('');
  const [days, setDays] = useState(String(DEFAULT_STALE_DAYS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const span = parseDays(days);   // the window the file was made with, or null while the box is wrong
  const [price, setPrice] = useState(String(DEFAULT_STALE_PRICE));
  const floor = parseStalePrice(price);   // the search's lowest Sell price, or null while the box is wrong

  const reload = useCallback(async () => {
    try {
      setCurrent(await currentStaleFile());
      setReadError('');
    } catch (e) {
      setReadError(e.message);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  function pick() {
    if (span == null) {
      setError('The days must be a whole number from 1 to 3650.');
      return;
    }
    if (floor == null) {
      setError('The Sell price must be from 0 to 9999, with up to 2 decimals.');
      return;
    }
    picker.current?.click();
  }

  async function onPicked(e) {
    const file = e.target.files?.[0];
    e.target.value = '';                      // so picking the same file again still fires
    if (!file) return;
    // An upload needs a user: the Changelog has it under their name (decision 412).
    if (!staff.current) {
      staff.pulse();
      setError('Pick a user first, then choose the file again.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const read = await readStaleCsv(file);
      const saved = await withLoading(() => loadStaleFile({
        filename: file.name, days: span, minPrice: floor, rows: read.rows, userId: staff.current.id,
      }));
      await reload();
      toast(`Uploaded ${file.name}: ${saved.products.toLocaleString()} products, `
        + `${saved.in_stock.toLocaleString()} stale card${saved.in_stock === 1 ? '' : 's'} in stock.`, 'ok');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const loaded = current !== undefined;
  const state = !loaded ? '' : current ? ' is-ok' : '';

  return (
    <section className={`cardpanel settings-panel stale-panel${state}`}>
      {/* The Price screen's stale emoji, so the two are seen as one (the owner, 2026-11-10). */}
      <div className="cardpanel-head"><strong>{STALE_EMOJI} Stale cards file</strong></div>
      <div className="cardpanel-body">
        <p className="hint">Cards with no sale lately, from Crystal Commerce. In stock, they&apos;re stale on the Buy tab.</p>
        {/* The search as the boxes below describe it (decision 581): its days and its price floor. */}
        <ol className="stale-how">
          <li>
            <strong>Inventory</strong>: Magic Singles, Sell price between {floor ?? '…'} and 9999, in the past {span ?? '…'} days
            (=) 0 sold.
          </li>
          <li><strong>Export Search to CSV</strong>, then find it in Notifications → Generated Reports.</li>
        </ol>

        <div className="stale-upload">
          <label className="stale-box">
            <span>No sale in</span>
            <input
              type="number"
              min="1"
              max="3650"
              step="1"
              value={days}
              disabled={busy}
              aria-label="Days the search was made with"
              aria-invalid={span == null || undefined}
              onChange={(e) => setDays(e.target.value)}
            />
            <span>days</span>
          </label>
          <label className="stale-box">
            <span>Sell price from $</span>
            <input
              type="number"
              min="0"
              max="9999"
              step="0.01"
              value={price}
              disabled={busy}
              aria-label="The search's lowest Sell price"
              aria-invalid={floor == null || undefined}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <GuardButton
            className={`btn primary${busy ? ' busy' : ''}`}
            disabled={offline || busy}
            title={offline ? 'No connection' : undefined}
            onClick={pick}
          >
            Upload file
          </GuardButton>
          <input ref={picker} type="file" accept=".csv" hidden onChange={onPicked} />
        </div>
        {busy && <p className="inv-progress loading-note">Reading and saving the file…</p>}
        {error && <div className="banner err inv-error">{error}</div>}
        {readError && <div className="banner err inv-error">{readError}</div>}

        {/* The current file in two lines: which, when and who; then what it holds and how it was made. */}
        {current && (
          <div className="stale-current">
            <div>
              <strong>{current.original_filename}</strong> · {formatDateTime(current.uploaded_at)} ·{' '}
              <UserTag user={staff.byId(current.uploaded_by)} />
            </div>
            <div>
              <strong>{current.in_stock.toLocaleString()} stale</strong> in stock of {current.products.toLocaleString()}:
              no sale in {current.days} days{currentFloor(current)}
            </div>
          </div>
        )}
        {loaded && !current && !readError && <p className="muted-text">No file yet: no card is stale.</p>}
      </div>
    </section>
  );
}
