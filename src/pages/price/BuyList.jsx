import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import LinePreview, { previewFor } from '../../components/LinePreview.jsx';
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

/**
 * "Remove card?" (spec 8.9): one copy, or how many of several. `note` adds a
 * line under the question (a day page: "This buy was already confirmed.").
 */
export function RemoveModal({ line, note = null, onRemove, onClose }) {
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
      {note && <p className="hint">{note}</p>}
    </Modal>
  );
}

/**
 * "Rates for this buy" (spec 8.9.1): a Cash % and a Credit % saved with the
 * buy on blur or Enter; the master value typed back clears that custom rate.
 */
function RatesPanel({ title, rates, master, onSave, onClose }) {
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
    <label className={`rate-row ${which}`}>
      <span className="rate-name">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${label} % (${title.toLowerCase()})`}
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
      <div className="rates-head">{title}</div>
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
 * Market, Cash and Credit (spec 8.9), with the clickable percentages that
 * open the custom-rate subpanel (8.9.1) above them.
 */
function Totals({
  market, rates, master, ratesTitle, canEdit, editBlocked, onSaveRates, onDone,
}) {
  const [ratesOpen, setRatesOpen] = useState(false);
  const pct = (which, label) => {
    const custom = which === 'cash' ? rates.customCash : rates.customCredit;
    const value = rates[which];
    return (
      <button
        type="button"
        className={`pct-link${custom != null ? ' custom' : ''}`}
        title={custom != null
          ? `Custom rate here. Master rate: ${Number(master[which])}%`
          : `Set a custom ${label} rate here`}
        onClick={() => (canEdit ? setRatesOpen((o) => !o) : editBlocked())}
      >
        {label} ({Number(value)}%{custom != null && ' ✎'})
      </button>
    );
  };
  return (
    <div className="totals">
      <div className="total-row"><span>Market</span><strong>{formatMoney(market)}</strong></div>
      <div className="total-row cash">{pct('cash', 'Cash')}<strong>{formatMoney(payout(market, rates.cash))}</strong></div>
      <div className="total-row credit">{pct('credit', 'Credit')}<strong>{formatMoney(payout(market, rates.credit))}</strong></div>
      {ratesOpen && (
        <RatesPanel
          title={ratesTitle}
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
  );
}

/**
 * The list sidebar (spec 8.9): the walk-in draft ("Buy list") or a
 * collection ("Collection list"), grouped by game in the order added. Its
 * foot holds the page's `details` (a collection's), the totals, and the
 * page's buttons (`footer`). Clicking a line edits it (onEdit; owner,
 * 2026-09-29); its red × removes it. While `locked` (Paid/Ours, view-only)
 * lines can't be edited, and while `removeLocked` (Completed, view-only) the
 * × is hidden too; a Paid/Ours collection keeps it (owner, 2026-09-29).
 */
export default function BuyList({
  title = 'Buy list', lines, loaded, rates, master, ratesTitle, flashId, hits = null, editingId,
  canEdit, locked = null, editBlocked, canRemove = canEdit, removeLocked = locked, removeBlocked = editBlocked,
  onEdit, onRemove, onSaveRates, onDone, details, footer,
}) {
  const [removing, setRemoving] = useState(null);
  const [preview, setPreview] = useState(null);   // { src, top, left } while a line is hovered
  const list = useRef(null);
  const aside = useRef(null);

  const hidePreview = useCallback(() => setPreview(null), []);

  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const market = marketTotal(lines);

  // A new or updated line scrolls into view and flashes (spec 8.8).
  useEffect(() => {
    if (!flashId) return;
    list.current?.querySelector(`[data-line="${flashId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [flashId, lines]);

  // Lines a header search matched (spec 13): the first scrolls into view once
  // the list has loaded, and all of them stay tinted.
  const hitSet = new Set(hits?.ids ?? []);
  const hitKey = hits?.key ?? null;
  const firstHit = hits?.ids?.[0] ?? null;
  useEffect(() => {
    if (!hitKey || !firstHit || !loaded) return;
    list.current?.querySelector(`[data-line="${firstHit}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [hitKey, firstHit, loaded]);

  return (
    <aside className={`buy-list${locked ? ' locked' : ''}${removeLocked ? ' no-remove' : ''}`} ref={aside}>
      <div className="list-head">
        <span className="list-title">{title}</span>
        <span className="list-count">{count} card{count === 1 ? '' : 's'}</span>
      </div>

      <div className="list-body" ref={list}>
        {loaded && !lines.length && <p className="list-empty">Cards you add will appear here.</p>}
        {GROUPS.map((g) => {
          const mine = lines.filter((l) => l.game === g.game);
          if (!mine.length) return null;
          return (
            <section key={g.game} className="list-group">
              <div className="group-head">
                <span className={`group-chip ${g.game}`}>{g.name} ({mine.reduce((n, l) => n + l.quantity, 0)})</span>
              </div>
              {mine.map((l) => (
                <div
                  key={l.id}
                  data-line={l.id}
                  className={`buy-line-row${l.id === flashId ? ' flash' : ''}${l.id === editingId ? ' editing' : ''}${hitSet.has(l.id) ? ' search-hit' : ''}`}
                  // A small card picture left of the sidebar, level with the line (owner, 2026-09-29).
                  onMouseEnter={(e) => setPreview(previewFor(l.image_url, e.currentTarget, aside.current, 'left'))}
                  onMouseLeave={hidePreview}
                >
                  <span className="line-price" title="Price per card">{formatMoney(l.unit_price)}</span>
                  <button
                    type="button"
                    className="buy-line"
                    title={l.id === editingId
                      ? 'Being edited: EDIT CARD saves the changes, Esc leaves it as it was'
                      : `${l.name_en ? `${l.name} · ` : ''}${formatMoney(l.unit_price)} each${locked ? '' : ' · click to edit'}`}
                    onClick={() => (canEdit ? onEdit(l) : editBlocked())}
                  >
                    {lineText(l)}
                  </button>
                  <button
                    type="button"
                    className="line-x"
                    title="Remove"
                    aria-label={`Remove ${lineText(l)}`}
                    onClick={() => (canRemove ? setRemoving(l) : removeBlocked())}
                  >
                    ×
                  </button>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      <div className="list-foot">
        {details}
        <Totals
          market={market}
          rates={rates}
          master={master}
          ratesTitle={ratesTitle}
          canEdit={canEdit}
          editBlocked={editBlocked}
          onSaveRates={onSaveRates}
          onDone={onDone}
        />
        {footer}
      </div>

      <LinePreview preview={preview} onHide={hidePreview} />
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
    </aside>
  );
}
