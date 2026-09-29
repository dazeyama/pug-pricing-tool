import { useRef, useState } from 'react';
import { useInventory } from '../../state/inventory.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';
import GuardButton from '../../components/GuardButton.jsx';
import UserTag from '../../components/UserTag.jsx';
import { checkCsv, downloadCsv, uploadCsv } from '../../lib/masterInventory.js';
import { withLoading } from '../../lib/loading.js';
import { formatDateTime } from '../../lib/time.js';

// Settings → Master Crystal Inventory (spec 11.1). Red with a "Required"
// badge until a file is uploaded, green once there's a current one.
export default function MasterInventoryPanel() {
  const { loaded, current, previous, reload } = useInventory();
  const staff = useStaff();
  const { offline } = useConnection();
  const toast = useToast();
  const picker = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onPicked(e) {
    const file = e.target.files?.[0];
    e.target.value = '';                      // so picking the same file again still fires
    if (!file || !staff.current) return;
    setError('');
    setBusy(true);
    try {
      const summary = await withLoading(() => checkCsv(file));
      await withLoading(() => uploadCsv(file, summary, staff.current.id));
      await reload();
      toast(`Uploaded ${file.name}: ${summary.rowCount.toLocaleString()} rows.`, 'ok');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function download(row) {
    try {
      await withLoading(() => downloadCsv(row));
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  const state = !loaded ? '' : current ? ' is-ok' : ' is-required';

  return (
    <section className={`cardpanel settings-panel${state}`}>
      <div className="cardpanel-head">
        <strong>Master Crystal Inventory</strong>
        {loaded && !current && <span className="badge required">Required</span>}
      </div>
      <div className="cardpanel-body">
        <p className="hint">
          The full inventory CSV exported from Crystal Commerce. Exports will use it to match
          set names. Every computer shares the same file; the latest five uploads are kept.
        </p>

        <GuardButton
          className={`btn primary big${busy ? ' busy' : ''}`}
          disabled={offline || busy}
          title={offline ? 'No connection' : undefined}
          onClick={() => picker.current?.click()}
        >
          Upload Crystal Commerce Database
        </GuardButton>
        <input ref={picker} type="file" accept=".csv" hidden onChange={onPicked} />

        {error && <div className="banner err inv-error">{error}</div>}

        {current && (
          <dl className="inv-current">
            <dt>Current file</dt>
            <dd>
              <strong>{current.original_filename}</strong>
              <button type="button" className="btn small ghost inv-dl" onClick={() => download(current)}>
                Download
              </button>
            </dd>
            <dt>Uploaded</dt>
            <dd>{formatDateTime(current.uploaded_at)}</dd>
            <dt>By</dt>
            <dd><UserTag user={staff.byId(current.uploaded_by)} /></dd>
            <dt>Rows</dt>
            <dd>{current.row_count.toLocaleString()}</dd>
            <dt>Columns</dt>
            <dd>
              <details className="inv-columns">
                <summary>{current.columns.length} columns</summary>
                <div className="chips">
                  {current.columns.map((c, i) => (
                    <span key={i} className="chip">{c || <em>(blank)</em>}</span>
                  ))}
                </div>
              </details>
            </dd>
          </dl>
        )}
        {loaded && !current && <p className="muted-text">No file uploaded yet.</p>}

        {previous.length > 0 && (
          <>
            <h4 className="settings-sub">Previous copies</h4>
            <table className="inv-previous">
              <tbody>
                {previous.map((f) => (
                  <tr key={f.id}>
                    <td className="inv-name">{f.original_filename}</td>
                    <td>{formatDateTime(f.uploaded_at)}</td>
                    <td><UserTag user={staff.byId(f.uploaded_by)} /></td>
                    <td className="inv-action">
                      <button type="button" className="btn small ghost" onClick={() => download(f)}>
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}
