import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useConnection } from '../../state/connection.jsx';
import { supabase } from '../../lib/supabase.js';
import { formatMoney, formatMoneyCents } from '../../lib/money.js';
import { nameKey } from '../../lib/normalize.js';
import Modal from '../../components/Modal.jsx';
import { useSettingField } from './useSettingField.js';
import { STALE_EMOJI, adjustRate, staleFrom } from '../../lib/ownedRates.js';
import '../../styles/staleCut.css';

const VALID_PCT = /^\d{1,3}(\.\d{1,2})?$/;

/** Every stale card (stale_cards: as Copies we own judges them) and the file's window and floor. */
async function readStaleCards() {
  const [cards, file] = await Promise.all([
    supabase.rpc('stale_cards'),
    supabase.from('stale_files').select('days, min_price').maybeSingle(),
  ]);
  const error = cards.error ?? file.error;
  if (error) throw new Error(error.message);
  return { cards: cards.data ?? [], file: file.data ?? null };
}

/**
 * View Stale Cards (the owner, 2026-11-10): "a subpanel like "Browse remembered products" … that lists all the
 * cards currently tagged as stale", in a window of its own as that one is (CcMatchingPanel's ProductsModal):
 * searched by name, read when it opens. Read only.
 */
function StaleCardsModal({ onClose }) {
  const [read, setRead] = useState(null);   // { cards, file } or { error }
  const [text, setText] = useState('');
  useEffect(() => {
    let alive = true;
    readStaleCards()
      .then((r) => alive && setRead(r))
      .catch((e) => alive && setRead({ error: e.message }));
    return () => {
      alive = false;
    };
  }, []);
  const shown = useMemo(() => {
    const q = nameKey(text);
    const cards = read?.cards ?? [];
    return q ? cards.filter((c) => nameKey(c.product_name).includes(q)) : cards;
  }, [read, text]);
  const copies = (read?.cards ?? []).reduce((n, c) => n + (Number(c.total_qty) || 0), 0);

  return (
    <Modal
      wide
      className="ccm-modal"
      title={`${STALE_EMOJI} Stale cards`}
      onClose={onClose}
      footer={<button type="button" className="btn primary" onClick={onClose}>Close</button>}
    >
      <input
        type="search"
        className="ccm-search"
        placeholder="Find by product name…"
        aria-label="Find a stale card by name"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {read == null ? (
        <p className="hint">Loading…</p>
      ) : read.error ? (
        <p className="hint">Couldn&apos;t read the stale cards: {read.error}</p>
      ) : !read.file ? (
        <p className="hint">No stale cards file is uploaded yet: Settings → Stale cards file.</p>
      ) : (
        <>
          <p className="hint ccm-caption">
            {read.cards.length.toLocaleString()} stale {read.cards.length === 1 ? 'card' : 'cards'} in stock
            ({copies.toLocaleString()} {copies === 1 ? 'copy' : 'copies'}): no sale in {read.file.days} days,
            {' '}{formatMoney(read.file.min_price)} and up. The cards the Price screen marks {STALE_EMOJI}; ones the
            app exported in that window aren&apos;t here.
            {text.trim() ? ` Found: ${shown.length.toLocaleString()}.` : ''}
          </p>
          {!shown.length ? (
            <p className="hint">{text.trim() ? 'Nothing found.' : 'None.'}</p>
          ) : (
            <ul className="ccm-list">
              {shown.map((c) => (
                <li key={c.product_id}>
                  <span className="ccm-what">
                    {c.product_name}
                    {c.category && <span className="ccm-note"> · {c.category}</span>}
                  </span>
                  <span className="ccm-who stale-qty">×{c.total_qty}</span>
                  <span className="ccm-who stale-price">{c.sell_price != null ? formatMoneyCents(c.sell_price) : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

// Settings → Stale cut (owner, 2026-11-10; decision 580): the stale cut, one percentage, beside the stale cards
// file's panel. The owner: "another panel besides it, that allows us to set base multipliers like -10% or -20% to
// stale cards". It's off the card's rate, as Copies we own's cut is, and on top of it: the copies cut's "at most"
// limits that cut alone ("Have them be separate."). Saved like every setting, live on every computer, in the
// Changelog. View Stale Cards opens the list of the cards it applies to.
export default function StaleCutPanel() {
  const { values, save } = useSettings();
  const { current } = useStaff();
  const { offline } = useConnection();
  const [viewing, setViewing] = useState(false);
  const cfg = staleFrom(values.stale_cards);
  const box = useSettingField({
    stored: cfg.pct,
    problem: (raw, next) => (VALID_PCT.test(raw) && next <= 100 ? null : 'Enter a number from 0 to 100, with up to 2 decimals.'),
    save: (next) => save('stale_cards', (now) => ({ ...staleFrom(now), pct: next }), current?.id),
    saved: (next) => (next > 0 ? `Stale cut saved: −${next}%.` : 'Stale cut saved: none, stale cards keep their rate.'),
  });

  return (
    <section className="cardpanel settings-panel">
      {/* The Price screen's stale emoji, so the two are seen as one (the owner, 2026-11-10). */}
      <div className="cardpanel-head"><strong>{STALE_EMOJI} Stale cut</strong></div>
      <div className="cardpanel-body stale-cut">
        <p className="hint">
          A Magic card whose exact printing is in the stale cards file, in stock, shows {STALE_EMOJI} on the Price
          screen&apos;s Copies we own, and its suggested rate is this much lower, on walk-in buys and open overnight
          buys. It&apos;s a percent of the card&apos;s rate, on top of Copies we own&apos;s cut: that cut&apos;s
          &quot;At most&quot; doesn&apos;t limit this one. Applied as Copies we own&apos;s are: Apply, or Auto apply
          rates?. 0 turns it off.
        </p>
        <label className="owned-set-row">
          <span className="owned-set-label">Lower for a stale card</span>
          <span className="pct-input fb-box owned-set-box">
            <span className="pct-sign owned-set-pre">−</span>
            <input type="number" min="0" max="100" step="0.01" aria-label="Lower for a stale card" {...box} />
            <span className="pct-sign owned-set-unit">%</span>
          </span>
        </label>
        <p className="hint owned-set-example">
          {cfg.pct > 0
            ? `With this: Credit 60% on a stale card is ${adjustRate(60, -cfg.pct)}%.`
            : 'Off: stale cards show the emoji and keep their rate.'}
        </p>
        <button
          type="button"
          className="btn primary stale-view"
          disabled={offline}
          title={offline ? 'No connection' : 'List every card tagged stale. Changes nothing.'}
          onClick={() => setViewing(true)}
        >
          View Stale Cards…
        </button>
      </div>
      {viewing && <StaleCardsModal onClose={() => setViewing(false)} />}
    </section>
  );
}
