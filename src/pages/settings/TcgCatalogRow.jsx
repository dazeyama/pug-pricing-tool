import { useCallback, useEffect, useState } from 'react';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';
import { onTcgCatalogProgress, refreshTcgCatalog, tcgCatalogStatus } from '../../lib/tcgCatalog.js';
import { formatDateTime } from '../../lib/time.js';

/** The catalog's line: its products and when a pass last finished, or why it can't say. */
function statusText(status, failed) {
  if (failed) return `couldn't be read (${failed})`;
  if (status === undefined) return '…';
  if (!status) return 'not fetched yet';
  const products = `${status.products.toLocaleString()} products`;
  return status.checkedAt ? `${products}, ${formatDateTime(status.checkedAt)}` : `${products}, not finished: refresh again`;
}

/**
 * Settings → Crystal Commerce matching, under Products (decisions 588, 589): TCGplayer's Magic catalog in the app,
 * when a pass last finished and how many products it holds, and Refresh TCGplayer catalog, the backup to the
 * refresh each master-file upload starts. While a pass runs (here or from an upload) it says how far.
 */
export default function TcgCatalogRow() {
  const { offline } = useConnection();
  const toast = useToast();
  const [status, setStatus] = useState(undefined);   // undefined while reading; null: never fetched
  const [failed, setFailed] = useState(null);        // why the status couldn't be read
  const [pass, setPass] = useState(null);            // { loaded, remaining } while a pass runs

  const reload = useCallback(() => {
    tcgCatalogStatus().then((s) => {
      setStatus(s);
      setFailed(null);
    }, (e) => setFailed(e.message));
  }, []);
  // Subscribing tells the pass's state at once (none: null), which reads the counts; each pass's end reads them again.
  useEffect(() => onTcgCatalogProgress((p) => {
    setPass(p);
    if (!p) reload();
  }), [reload]);

  async function refresh() {
    try {
      const r = await refreshTcgCatalog();
      const skipped = r.skipped.length ? ` ${r.skipped.length} set${r.skipped.length === 1 ? '' : 's'} couldn't be fetched: `
        + `${r.skipped.map((g) => g.name).join(', ')}.` : '';
      toast(`TCGplayer catalog up to date: ${r.products?.toLocaleString() ?? '?'} products in ${r.groups} sets`
        + `${r.loaded ? ` (${r.loaded} fetched)` : ', nothing changed'}.${skipped}`, skipped ? 'warn' : 'ok');
    } catch (e) {
      toast(`Couldn't refresh the TCGplayer catalog: ${e.message}.`, 'err');
    }
  }

  return (
    <div className="ccm-tcg">
      <p className="hint">TCGplayer catalog: {statusText(status, failed)}</p>
      <button
        type="button"
        className={`btn${pass ? ' busy' : ''}`}
        disabled={offline || Boolean(pass)}
        title={offline ? 'No connection' : 'Fetch the TCGplayer sets changed since last time (each master-file upload does this too)'}
        onClick={refresh}
      >
        {pass ? `Refreshing… ${pass.loaded} sets${pass.remaining ? `, ${pass.remaining} to go` : ''}` : 'Refresh TCGplayer catalog'}
      </button>
    </div>
  );
}
