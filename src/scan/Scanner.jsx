import { useState } from 'react';
import { CONDITIONS } from '../lib/ladder.js';
import { readSession, writeSession } from '../lib/local.js';
import { usePairing } from './usePairing.js';

// The condition and finish for the next scans, kept for this tab (a reload keeps them).
const CONDITION_KEY = 'pug.scan.condition';
const FOIL_KEY = 'pug.scan.foil';

/** Why the paired computer can't take cards now, as the phone says it, or null. */
export function blockedText(session) {
  if (!session || session.can_add) return null;
  const name = session.device_label;
  if (!(session.games ?? []).includes('mtg')) return `${name} is on Pokémon: switch it to Magic.`;
  if (session.locked) return `${name}: ${session.locked}.`;
  if (!session.staff_user_id) return `Pick a user on ${name} first.`;
  return `${name} can't take cards right now.`;
}

/**
 * The scanning screen (docs/SCAN_FUNCTION.md 5.3): who it's paired with, the
 * condition and finish for the next scans, and (from Phase S2) the camera.
 * @param {{ computerId: string, phoneId: string, onEnd: (message: string|null) => void }} props
 */
export default function Scanner({ computerId, phoneId, onEnd }) {
  const { session, unpair } = usePairing(computerId, phoneId, onEnd);
  const [condition, setConditionState] = useState(() => {
    const saved = readSession(CONDITION_KEY);
    return CONDITIONS.includes(saved) ? saved : 'NM';
  });
  const [foil, setFoilState] = useState(() => readSession(FOIL_KEY) === '1');
  const setCondition = (c) => {
    setConditionState(c);
    writeSession(CONDITION_KEY, c);
  };
  const setFoil = (f) => {
    setFoilState(f);
    writeSession(FOIL_KEY, f ? '1' : null);
  };
  const blocked = blockedText(session);

  return (
    <div className="scanner">
      <div className="scan-paired">
        <div className="scan-paired-text">
          <strong>→ {session?.device_label ?? 'Connecting…'}{session ? ` · ${session.target_name}` : ''}</strong>
          <span>
            {session?.staff_user_name ?? 'No user picked'}
            {session ? ` · ${session.scanned} scanned` : ''}
          </span>
        </div>
        <button type="button" className="btn small" onClick={unpair}>Unpair</button>
      </div>

      <div className="scan-controls">
        <div className="scan-seg conditions" role="radiogroup" aria-label="Condition for the next scans">
          {CONDITIONS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={condition === c}
              className={`scan-seg-btn cond-${c.toLowerCase()}${condition === c ? ' on' : ''}`}
              onClick={() => setCondition(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="scan-seg finish" role="radiogroup" aria-label="Finish for the next scans">
          <button type="button" role="radio" aria-checked={!foil} className={`scan-seg-btn${!foil ? ' on' : ''}`} onClick={() => setFoil(false)}>
            Normal
          </button>
          <button type="button" role="radio" aria-checked={foil} className={`scan-seg-btn foil${foil ? ' on' : ''}`} onClick={() => setFoil(true)}>
            Foil
          </button>
        </div>
      </div>

      {blocked && <div className="scan-notice warn" role="status">{blocked}</div>}

      <p className="scan-empty">The camera arrives in the next build phase.</p>
    </div>
  );
}
