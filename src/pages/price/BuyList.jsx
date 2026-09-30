import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import GuardButton from '../../components/GuardButton.jsx';
import { lineText } from '../../lib/lineFormat.js';
import { formatMoney, payout } from '../../lib/money.js';
import { useToast } from '../../components/Toast.jsx';

const GROUPS = [
  { game: 'mtg', name: 'Magic' },
  { game: 'pokemon', name: 'Pokémon' },
];
const VALID_PCT = /^\d{1,3}(\.\d{1,2})?$/;

/** Σ unit price × quantity, to the cent. */
export function marketTotal(lines) {
  return Math.round(lines.reduce((sum, l) => sum + Number(l.unit_price) * l.quantity, 0) * 100) / 100;
}

/** "Remove card?" (spec 8.9): one copy, or how many of several. */
function RemoveModal({ line, onRemove, onClose }) {
  const [qty, setQty] = useState(1);
  const many = line.quantity > 1;
  return (
    <Modal
      title="Remove card?"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn danger" onClick={() => onRemove(line, qty)}>Remove</button>
          {many && (
            <button type="button" className="btn danger" onClick={() => onRemove(line, line.quantity)}>
              Remove all {line.quantity}
            </button>
          )}
        </>
      )}
    >
      {many ? (
        <>
          <p>Remove how many of <strong>{lineText(line)}</strong>?</p>
          <label className="remove-qty">
            <input
              type="number"
              min="1"
              max={line.quantity}
              value={qty}
              autoFocus
              onChange={(e) => setQty(Math.min(line.quantity, Math.max(1, Number(e.target.value) || 1)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRemove(line, qty);
              }}
            />
            of {line.quantity}
          </label>
        </>
      ) : (
        <p>Remove <strong>{lineText(line)}</strong>?</p>
      )}
    </Modal>
  );
}

/**
 * "Rates for this buy" (spec 8.9.1): a Cash % and a Credit % saved with the
 * buy on blur or Enter; the master value typed back clears that custom rate.
 */
function RatesPanel({ rates, master, onSave, onClose }) {
  const [text, setText] = useState({ cash: String(rates.cash), credit: String(rates.credit) });
  const toast = useToast();
  const box = useRef(null);
  // A save (or "Use master rates") comes back as new rates: show them.
  useEffect(() => {
    setText({ cash: String(rates.cash), credit: String(rates.credit) });
  }, [rates.cash, rates.credit]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e) => {
      if (!box.current?.contains(e.target) && !e.target.closest?.('.pct-link')) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  function commit(which) {
    const raw = text[which].trim();
    if (!VALID_PCT.test(raw) || Number(raw) > 100) {
      toast('Enter a percentage from 0 to 100, with up to 2 decimals.', 'err');
      setText((t) => ({ ...t, [which]: String(rates[which]) }));
      return;
    }
    const value = Number(raw);
    const custom = value === Number(master[which]) ? null : value;
    const next = { cash: rates.customCash, credit: rates.customCredit, [which]: custom };
    if (next.cash !== rates.customCash || next.credit !== rates.customCredit) onSave(next.cash, next.credit);
  }

  const row = (which, label) => (
    <label className="rate-row">
      <span className="rate-name">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${label} % for this buy`}
        value={text[which]}
        onChange={(e) => setText((t) => ({ ...t, [which]: e.target.value }))}
        onBlur={() => commit(which)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <span className="rate-pct">%</span>
      <span className="rate-master">master {Number(master[which])}%</span>
    </label>
  );

  return (
    <div className="rates-panel" ref={box}>
      <div className="rates-head">Rates for this buy</div>
      {row('cash', 'Cash')}
      {row('credit', 'Credit')}
      <div className="rates-foot">
        <button type="button" className="btn small ghost" onClick={() => onSave(null, null)}>Use master rates</button>
        <button type="button" className="btn small" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

/**
 * The buy list sidebar (spec 8.9): this computer's draft, grouped by game in
 * the order added, with totals, custom rates, CANCEL and CONFIRM BUY.
 */
export default function BuyList({
  lines, loaded, rates, master, flashId, canEdit, editBlocked, busy,
  onRemove, onSaveRates, onCancel, onConfirm, onDone,
}) {
  const [removing, setRemoving] = useState(null);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const list = useRef(null);

  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const market = marketTotal(lines);

  // A new or updated line scrolls into view and flashes (spec 8.8).
  useEffect(() => {
    if (!flashId) return;
    list.current?.querySelector(`[data-line="${flashId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [flashId, lines]);

  const pct = (which, label) => {
    const custom = which === 'cash' ? rates.customCash : rates.customCredit;
    const value = rates[which];
    return (
      <button
        type="button"
        className={`pct-link${custom != null ? ' custom' : ''}`}
        title={custom != null
          ? `Custom rate for this buy. Master rate: ${Number(master[which])}%`
          : `Set a custom ${label} rate for this buy`}
        onClick={() => (canEdit ? setRatesOpen((o) => !o) : editBlocked())}
      >
        {label} ({Number(value)}%{custom != null && ' ✎'})
      </button>
    );
  };

  return (
    <aside className="buy-list">
      <div className="list-head">
        <span className="list-title">Buy list</span>
        <span className="list-count">{count} card{count === 1 ? '' : 's'}</span>
      </div>

      <div className="list-body" ref={list}>
        {loaded && !lines.length && <p className="list-empty">Cards you add will appear here.</p>}
        {GROUPS.map((g) => {
          const mine = lines.filter((l) => l.game === g.game);
          if (!mine.length) return null;
          return (
            <section key={g.game} className="list-group">
              <div className="group-head">{g.name} ({mine.reduce((n, l) => n + l.quantity, 0)})</div>
              {mine.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  data-line={l.id}
                  className={`buy-line${l.id === flashId ? ' flash' : ''}`}
                  title={`${formatMoney(l.unit_price)} each · click to remove`}
                  onClick={() => (canEdit ? setRemoving(l) : editBlocked())}
                >
                  {lineText(l)}
                </button>
              ))}
            </section>
          );
        })}
      </div>

      <div className="list-foot">
        <div className="totals">
          <div className="total-row"><span>Market</span><strong>{formatMoney(market)}</strong></div>
          <div className="total-row">{pct('cash', 'Cash')}<strong>{formatMoney(payout(market, rates.cash))}</strong></div>
          <div className="total-row">{pct('credit', 'Credit')}<strong>{formatMoney(payout(market, rates.credit))}</strong></div>
          {ratesOpen && (
            <RatesPanel
              rates={rates}
              master={master}
              onSave={onSaveRates}
              onClose={() => {
                setRatesOpen(false);
                onDone();
              }}
            />
          )}
        </div>
        <div className="list-buttons">
          <button
            type="button"
            className="btn cancel-btn"
            disabled={busy}
            title={count ? 'Discard this buy' : 'Start over'}
            onClick={() => (count ? setAsking(true) : onCancel())}
          >
            CANCEL
          </button>
          <GuardButton
            className="btn confirm-btn"
            disabled={!count || busy || !canEdit}
            title={!count ? 'Add cards first' : busy ? 'Saving…' : !canEdit ? 'No connection' : 'Confirm this buy'}
            onClick={onConfirm}
          >
            CONFIRM BUY
          </GuardButton>
        </div>
      </div>

      {removing && (
        <RemoveModal
          line={removing}
          onClose={() => {
            setRemoving(null);
            onDone();
          }}
          onRemove={async (line, qty) => {
            setRemoving(null);
            await onRemove(line, qty);
            onDone();
          }}
        />
      )}
      {asking && (
        <Modal
          title="Cancel this buy?"
          onClose={() => setAsking(false)}
          footer={(
            <>
              <button type="button" className="btn ghost" onClick={() => setAsking(false)}>Keep buy</button>
              <button
                type="button"
                className="btn danger"
                onClick={async () => {
                  setAsking(false);
                  await onCancel();
                }}
              >
                Discard
              </button>
            </>
          )}
        >
          <p><strong>{count} card{count === 1 ? '' : 's'}</strong> will be discarded.</p>
        </Modal>
      )}
    </aside>
  );
}
