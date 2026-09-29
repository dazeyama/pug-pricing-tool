import { useEffect, useState } from 'react';
import { callFunction } from '../../lib/functions.js';
import { formatDateTime } from '../../lib/time.js';
import { useToast } from '../../components/Toast.jsx';
import { useConnection } from '../../state/connection.jsx';
import Modal from '../../components/Modal.jsx';

// Settings → API keys (spec 4.5, 11.2). Everything goes through the
// `secrets` Edge Function: the browser sends a new key once and only ever
// sees it masked afterwards.
const PROVIDERS = [{ id: 'justtcg', name: 'JustTCG', note: 'Condition prices for Magic and Pokémon.' }];

function KeyRow({ provider, status, reload }) {
  const toast = useToast();
  const { offline } = useConnection();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(null);           // 'save' | 'delete' | 'test'
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [test, setTest] = useState(null);

  async function run(kind, body, done) {
    setBusy(kind);
    try {
      const data = await callFunction('secrets', body);
      done(data);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(null);
    }
  }

  const save = () => run('save', { action: 'set', provider: provider.id, value }, () => {
    setEditing(false);
    setValue('');
    setTest(null);
    toast(`${provider.name} key saved.`, 'ok');
    reload();
  });
  const remove = () => run('delete', { action: 'delete', provider: provider.id }, () => {
    setConfirmDelete(false);
    setTest(null);
    toast(`${provider.name} key deleted.`, 'ok');
    reload();
  });
  const runTest = () => run('test', { action: 'test', provider: provider.id }, (data) => setTest(data));

  const n = (x) => (x == null ? '?' : Number(x).toLocaleString());

  return (
    <div className="key-row">
      <div className="key-head">
        <strong>{provider.name}</strong>
        <span className="hint key-note">{provider.note}</span>
      </div>
      {editing ? (
        <form
          className="key-edit"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) save();
          }}
        >
          <input
            type="password"
            autoFocus
            autoComplete="off"
            placeholder={`Paste the ${provider.name} key`}
            aria-label={`${provider.name} API key`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className={`btn primary small${busy === 'save' ? ' busy' : ''}`} disabled={!value.trim() || offline}>
            Save
          </button>
          <button type="button" className="btn ghost small" onClick={() => { setEditing(false); setValue(''); }}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="key-status">
          {status ? (
            <>
              <code className="key-mask">{status.masked}</code>
              <span className="hint">updated {formatDateTime(status.updatedAt)}</span>
            </>
          ) : (
            <span className="muted-text">No key saved.</span>
          )}
          <span className="key-actions">
            <button type="button" className="btn small" disabled={offline} onClick={() => setEditing(true)}>
              {status ? 'Edit' : 'Add key'}
            </button>
            {status && (
              <>
                <button type="button" className={`btn small${busy === 'test' ? ' busy' : ''}`} disabled={offline} onClick={runTest}>
                  Test
                </button>
                <button type="button" className="btn small danger-ghost" disabled={offline} onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              </>
            )}
          </span>
        </div>
      )}
      {test && (
        <p className={`key-test ${test.ok ? 'ok' : 'err'}`}>
          {test.ok
            ? <>Working. Plan <strong>{test.plan ?? '?'}</strong> · {n(test.dailyUsed)} of {n(test.dailyLimit)} requests today · {n(test.monthlyUsed)} of {n(test.monthlyLimit)} this month.</>
            : <>Not working: {test.error}</>}
        </p>
      )}
      {confirmDelete && (
        <Modal
          title={`Delete the ${provider.name} key?`}
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button type="button" className="btn ghost" autoFocus onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" className={`btn danger${busy === 'delete' ? ' busy' : ''}`} onClick={remove}>Delete key</button>
            </>
          }
        >
          <p>Prices stop loading until a new key is saved. Fallback and manual prices still work.</p>
        </Modal>
      )}
    </div>
  );
}

export default function ApiKeysPanel() {
  const [keys, setKeys] = useState(null);
  const [error, setError] = useState(null);

  async function reload() {
    try {
      const data = await callFunction('secrets', { action: 'status' });
      setKeys(Object.fromEntries((data?.keys ?? []).map((k) => [k.provider, k])));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    reload();
  }, []);

  return (
    <section className="cardpanel settings-panel">
      <div className="cardpanel-head"><strong>API keys</strong></div>
      <div className="cardpanel-body">
        <p className="hint">
          Keys are kept on the server. Once saved, a key is only ever shown masked, on every computer.
        </p>
        {error && <div className="banner err inv-error">Couldn’t read the keys: {error}</div>}
        {keys === null && !error && <p className="muted-text">Loading…</p>}
        {keys && PROVIDERS.map((p) => <KeyRow key={p.id} provider={p} status={keys[p.id]} reload={reload} />)}
      </div>
    </section>
  );
}
