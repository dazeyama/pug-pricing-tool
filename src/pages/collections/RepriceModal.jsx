import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { useSettings, useSettingsReady } from '../../state/settings.jsx';
import { todaysPrices } from '../../lib/todaysPrices.js';
import { repricedLine } from '../../lib/reprice.js';
import { bulkValuesFrom, cardCounts, countText, isBulk, repricedBulk } from '../../lib/bulk.js';
import { isStruck } from '../../lib/struck.js';

/**
 * REPRICE? (owner, 2026-10-01): asks first, then fetches today's prices for
 * every card (the export's way), works out each new buy price and saves them
 * all at once. Can't be closed while it works. Struck cards (lib/struck.js)
 * keep the price they were bought at: they're gone from here.
 * @param {object} p
 * @param {object[]} p.lines  the collection's lines
 * @param {boolean} [p.roundUp]  a project: prices round up (ladder.js)
 * @param {(updates: object[], counts: { changed: number, manual: number, noPrice: number }) => Promise<boolean>} p.onReprice
 * @param {() => void} p.onClose
 */
export default function RepriceModal({ lines: all, roundUp = false, onReprice, onClose }) {
  // Not struck cards, nor exported ones: their price is frozen (decision 345).
  const lines = all.filter((l) => !isStruck(l) && !l.cc_status);
  const { values } = useSettings();
  const ready = useSettingsReady();   // not at the built-in defaults (decision 389)
  const [phase, setPhase] = useState('ask');   // ask | working | error
  const [step, setStep] = useState('');
  const [error, setError] = useState(null);
  const counts = cardCounts(lines);
  const manual = lines.filter((l) => l.price_source === 'manual').length;
  const requests = Math.max(1, Math.ceil(lines.length / 100));

  async function run() {
    if (!ready()) return;
    setPhase('working');
    setError(null);
    try {
      // Bulk (docs/TEAM_FEEDBACK.md 5.2): no price to fetch, its Settings value instead.
      const today = await todaysPrices(lines.filter((l) => !isBulk(l)), { onStep: setStep });
      const pct = { mtg: values.fallback_pct_mtg, pokemon: values.fallback_pct_pokemon };
      const bulkValues = bulkValuesFrom(values.bulk_values);
      const repriced = lines.map((l) => ({
        line: l,
        r: isBulk(l) ? repricedBulk(l, bulkValues) : repricedLine(l, today.get(l.id) ?? {}, pct[l.game], { up: roundUp }),
      }));
      const updates = repriced.filter(({ r }) => r.kept !== 'no_price').map(({ r }) => {
        const { kept, ...update } = r;
        return update;
      });
      const counts = {
        changed: repriced.filter(({ line, r }) => r.kept == null && r.unit_price !== Number(line.unit_price)).length,
        manual: repriced.filter(({ r }) => r.kept === 'manual').length,
        noPrice: repriced.filter(({ r }) => r.kept === 'no_price').length,
      };
      setStep('Saving…');
      if (await onReprice(updates, counts)) onClose();
      else setPhase('ask');
    } catch (e) {
      setError(`${e.message} Nothing was repriced.`);
      setPhase('error');
    }
  }

  const working = phase === 'working';
  return (
    <Modal
      title="Reprice this collection?"
      onClose={working ? undefined : onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" disabled={working} onClick={onClose}>Cancel</button>
          <button type="button" className={`btn primary${working ? ' busy' : ''}`} disabled={working} autoFocus onClick={run}>
            {phase === 'error' ? 'Try again' : 'Reprice'}
          </button>
        </>
      )}
    >
      {working ? (
        <p className="loading-note">{step || 'Repricing…'}</p>
      ) : (
        <>
          {error && <div className="banner err">{error}</div>}
          <p>
            Every card here (<strong>{countText(counts)}</strong>) gets today's buy price for its
            condition, worked out the way it was priced: the same price ladder, Use TCGplayer / Use Cardmarket as it was,{' '}
            {roundUp ? 'rounded up, as in every project' : 'rounded down as always'}. Sell prices aren't touched.
          </p>
          <p className="hint">
            {manual > 0 && <>{manual} manual price{manual === 1 ? '' : 's'} stay{manual === 1 ? 's' : ''} as typed. </>}
            A card with no price today keeps its price. Uses about {requests} JustTCG request{requests === 1 ? '' : 's'}.
          </p>
        </>
      )}
    </Modal>
  );
}
