import { useEffect, useState } from 'react';
import { ownedCopies, warmOwnedCopies } from '../../lib/owned.js';
import { ownedCounts } from '../../lib/ownedRates.js';

/**
 * The copies we own of the selected Magic printing in its finish, and of its card (decision 448).
 * @param {object|null} card  the selected card (a candidate), or null
 * @param {string|null} finish  its Magic finish
 * @returns {{ status: 'off'|'loading'|'ok'|'failed', key: string|null,
 *   counts: ReturnType<typeof ownedCounts>|null, error: string|null }}
 *   off: no Magic card picked (Pokémon has no CC matching yet)
 */
export function useOwnedCopies(card, finish) {
  const key = card?.game === 'mtg' && card.scryfall && finish ? `${card.key}|${finish}` : null;
  const [state, setState] = useState({ key: null, status: 'off', counts: null, error: null });
  // What matching reads, read as the Price screen opens rather than with its first card (decision 453).
  useEffect(() => warmOwnedCopies(), []);

  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    setState({ key, status: 'loading', counts: null, error: null });
    ownedCopies(card, finish).then(
      (raw) => live && setState({ key, status: 'ok', counts: ownedCounts(raw), error: null }),
      (e) => {
        console.error(e);
        if (live) setState({ key, status: 'failed', counts: null, error: e.message });
      },
    );
    return () => {
      live = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the key stands for the card and finish
  }, [key]);

  if (!key) return { status: 'off', key: null, counts: null, error: null };
  // Another card's answer still in: this one's loading.
  return state.key === key ? state : { status: 'loading', key, counts: null, error: null };
}
