import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaff } from '../../state/staff.jsx';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';
import GuardButton from '../../components/GuardButton.jsx';
import UserTag from '../../components/UserTag.jsx';
import {
  DEFAULT_STALE_DAYS, currentStaleFile, loadStaleFile, parseDays, readStaleCsv,
} from '../../lib/staleFile.js';
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
        filename: file.name, days: span, rows: read.rows, userId: staff.current.id,
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
      <div className="cardpanel-head"><strong>Stale cards file</strong></div>
      <div className="cardpanel-body">
        <p className="hint">
          Crystal Commerce&apos;s list of the cards that haven&apos;t sold in a while. A card in it that&apos;s in
          stock is stale: Copies we own on the Buy tab marks it and lowers what we pay for it. Uploading a new file
          replaces the one before.
        </p>
        <details className="stale-how" open={loaded && !current}>
          <summary>How to make the file</summary>
          <ol>
            <li>In Crystal Commerce, open the <strong>Inventory</strong> tab.</li>
            <li>Product type <strong>Magic Singles</strong>, under the <strong>Magic: The Gathering Singles</strong> category.</li>
            <li><strong>Sell price is between</strong> 35 and 9999.</li>
            <li><strong>In the past</strong> 180 <strong>days</strong> (=) <strong>equal to</strong> 0 quantity <strong>sold</strong>.</li>
            <li><strong>Export Search to CSV</strong>. The file is under <strong>Notifications → Generated Reports</strong>.</li>
          </ol>
          <p className="hint">Made with another number of days than 180? Put that number in the box below before uploading.</p>
        </details>

        <div className="stale-upload">
          <label className="stale-days">
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
          <GuardButton
            className={`btn primary${busy ? ' busy' : ''}`}
            disabled={offline || busy}
            title={offline ? 'No connection' : undefined}
            onClick={pick}
          >
            Upload stale cards file
          </GuardButton>
          <input ref={picker} type="file" accept=".csv" hidden onChange={onPicked} />
        </div>
        {busy && <p className="inv-progress loading-note">Reading and saving the file…</p>}
        {error && <div className="banner err inv-error">{error}</div>}
        {readError && <div className="banner err inv-error">{readError}</div>}

        {current && (
          <dl className="inv-current">
            <dt>Current file</dt>
            <dd><strong>{current.original_filename}</strong></dd>
            <dt>Uploaded</dt>
            <dd>{formatDateTime(current.uploaded_at)}</dd>
            <dt>By</dt>
            <dd><UserTag user={staff.byId(current.uploaded_by)} /></dd>
            <dt>Stale cards</dt>
            <dd>
              <strong>{current.in_stock.toLocaleString()}</strong> in stock, no sale in {current.days} days
              <span className="inv-products">{current.products.toLocaleString()} products in the file</span>
            </dd>
          </dl>
        )}
        {loaded && !current && !readError && <p className="muted-text">No file uploaded yet: no card is marked stale.</p>}
      </div>
    </section>
  );
}
