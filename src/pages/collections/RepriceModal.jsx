import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { useSettings } from '../../state/settings.jsx';
import { todaysPrices } from '../../lib/todaysPrices.js';
import { repricedLine } from '../../lib/reprice.js';

/**
 * REPRICE? (owner, 2026-10-01): asks first, then fetches today's prices for
 * every card (the export's way), works out each new buy price and saves them
 * all at once. Can't be closed while it works.
 * @param {object} p
 * @param {object[]} p.lines  the collection's lines
 * @param {(updates: object[], counts: { changed: number, manual: number, noPrice: number }) => Promise<boolean>} p.onReprice
 * @param {() => void} p.onClose
 */
export default function RepriceModal({ lines, onReprice, onClose }) {
  const { values } = useSettings();
  const [phase, setPhase] = useState('ask');   // ask | working | error
  const [step, setStep] = useState('');
  const [error, setError] = useState(null);
  const cards = lines.reduce((n, l) => n + l.quantity, 0);
  const manual = lines.filter((l) => l.price_source === 'manual').length;
  const requests = Math.max(1, Math.ceil(lines.length / 100));

  async function run() {
    setPhase('working');
    setError(null);
    try {
      const today = await todaysPrices(lines, { onStep: setStep });
      const pct = { mtg: values.fallback_pct_mtg, pokemon: values.fallback_pct_pokemon };
      const repriced = lines.map((l) => ({ line: l, r: repricedLine(l, today.get(l.id) ?? {}, pct[l.game]) }));
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
            Every card here (<strong>{cards} card{cards === 1 ? '' : 's'}</strong>) gets today's buy price for its
            condition, worked out the way it was priced: the same price ladder, Use Fallback / Use Cardmarket as it was,
            rounded down as always. Sell prices aren't touched.
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
