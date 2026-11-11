import { useRef, useState } from 'react';
import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useConnection } from '../../state/connection.jsx';
import { supabase } from '../../lib/supabase.js';
import { formatMoney, formatMoneyCents } from '../../lib/money.js';
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
 * View Stale Cards (the owner, 2026-11-10: "a scrollable subpanel list of all the cards marked stale"): in the
 * panel itself, so it keeps its height beside the file's panel. Read when opened.
 */
function StaleList({ list }) {
  if (list.error) return <p className="hint stale-list-note">Couldn&apos;t read the stale cards: {list.error}</p>;
  if (!list.cards) return <p className="hint stale-list-note">Reading the stale cards…</p>;
  if (!list.file) return <p className="hint stale-list-note">No stale cards file is uploaded yet.</p>;
  const copies = list.cards.reduce((n, c) => n + (Number(c.total_qty) || 0), 0);
  return (
    <>
      <p className="hint stale-list-note">
        {list.cards.length} stale {list.cards.length === 1 ? 'card' : 'cards'} in stock ({copies}{' '}
        {copies === 1 ? 'copy' : 'copies'}): no sale in {list.file.days} days, {formatMoney(list.file.min_price)} and
        up, as the Price screen marks them. Cards the app exported in that window aren&apos;t here.
      </p>
      {list.cards.length > 0 && (
        <div className="stale-list" role="list" aria-label="Stale cards">
          {list.cards.map((c) => (
            <div key={c.product_id} className="stale-list-row" role="listitem">
              <span className="stale-list-name">
                {c.product_name}
                {c.category && <span className="stale-list-cat">{c.category}</span>}
              </span>
              <span className="stale-list-qty">×{c.total_qty}</span>
              <span className="stale-list-price">{c.sell_price != null ? formatMoneyCents(c.sell_price) : ''}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Settings → Stale cut (owner, 2026-11-10; decision 580): the stale cut, one percentage, beside the stale cards
// file's panel. The owner: "another panel besides it, that allows us to set base multipliers like -10% or -20% to
// stale cards". It's off the card's rate, as Copies we own's cut is, and on top of it: the copies cut's "at most"
// limits that cut alone ("Have them be separate."). Saved like every setting, live on every computer, in the
// Changelog. View Stale Cards lists the cards it applies to.
export default function StaleCutPanel() {
  const { values, save } = useSettings();
  const { current } = useStaff();
  const { offline } = useConnection();
  const [list, setList] = useState(null);   // null: closed; { cards, file, error } while open
  const reading = useRef(0);   // the read in flight: a later open or a Hide makes its answer stale
  const cfg = staleFrom(values.stale_cards);
  const box = useSettingField({
    stored: cfg.pct,
    problem: (raw, next) => (VALID_PCT.test(raw) && next <= 100 ? null : 'Enter a number from 0 to 100, with up to 2 decimals.'),
    save: (next) => save('stale_cards', (now) => ({ ...staleFrom(now), pct: next }), current?.id),
    saved: (next) => (next > 0 ? `Stale cut saved: −${next}%.` : 'Stale cut saved: none, stale cards keep their rate.'),
  });

  async function open() {
    const mine = ++reading.current;
    setList({ cards: null, file: null, error: null });
    let next;
    try {
      next = { ...await readStaleCards(), error: null };
    } catch (e) {
      next = { cards: [], file: null, error: e.message };
    }
    if (reading.current === mine) setList(next);   // not if Hide was clicked meanwhile
  }
  function hide() {
    reading.current += 1;
    setList(null);
  }

  return (
    <section className="cardpanel settings-panel">
      <div className="cardpanel-head stale-cut-head">
        <strong>Stale cut</strong>
        <button
          type="button"
          className="btn ghost small"
          disabled={offline && !list}
          title={list ? 'Back to the stale cut' : 'List every card marked stale: in the stale cards file, in stock, not exported by the app in its window. Changes nothing.'}
          onClick={() => (list ? hide() : open())}
        >
          {list ? 'Hide Stale Cards' : 'View Stale Cards'}
        </button>
      </div>
      <div className={`cardpanel-body${list ? ' stale-listing' : ''}`}>
        {list ? <StaleList list={list} /> : (
          <>
            <p className="hint">
              A Magic card whose exact printing is in the stale cards file, in stock, shows {STALE_EMOJI} on the
              Price screen&apos;s Copies we own, and its suggested rate is this much lower, on walk-in buys and open
              overnight buys. It&apos;s a percent of the card&apos;s rate, on top of Copies we own&apos;s cut: that
              cut&apos;s &quot;At most&quot; doesn&apos;t limit this one. Applied as Copies we own&apos;s are:
              Apply, or Auto apply rates?. 0 turns it off.
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
          </>
        )}
      </div>
    </section>
  );
}
