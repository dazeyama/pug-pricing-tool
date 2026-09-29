import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPrices, lookupsFor } from '../../lib/prices.js';
import { usePriceLimit } from '../../state/priceLimit.jsx';
import { useConnection } from '../../state/connection.jsx';

// Prices only after a card has stayed selected for 400ms (spec 5.3), so
// arrowing through suggestions doesn't spend the JustTCG allowance. Results
// are kept for the page's life per lookup key; the server keeps them 6 hours
// for every computer.
const SETTLE_MS = 400;
const results = new Map();   // lookup key → { card, fetchedAt }

/**
 * @returns {{ status: 'idle'|'waiting'|'loading'|'ok'|'error'|'quota'|'no-key',
 *   results: Record<string, { card: any, fetchedAt: string|null }>|null,
 *   error: string|null, retry: () => void }}
 */
export function usePrices(selected, { pokemon, versions, jaName, waitName }) {
  const { reachedLimit } = usePriceLimit();
  const { offline } = useConnection();
  const [state, setState] = useState({ key: null, status: 'idle', error: null });
  const [attempt, setAttempt] = useState(0);

  // A Pokémon card's lookups need its full TCGdex card (TCGplayer IDs), and
  // a Japanese card's its English name (waitName while that loads): a lookup
  // sent without it would be remembered as "no price" for the page's life.
  const ready = selected && (selected.game === 'mtg' || (pokemon.resolved && !waitName));
  const lookups = ready ? lookupsFor(selected, { pokemonCard: pokemon.card, versions, jaName }) : [];
  const signature = lookups.map((l) => l.key).join('|');
  const lookupsRef = useRef(lookups);
  lookupsRef.current = lookups;

  useEffect(() => {
    if (!signature) {
      setState({ key: signature, status: selected ? 'waiting' : 'idle', error: null });
      return undefined;
    }
    const wanted = lookupsRef.current;
    if (wanted.every((l) => results.has(l.key))) {
      setState({ key: signature, status: 'ok', error: null });
      return undefined;
    }
    if (offline) {
      setState({ key: signature, status: 'error', error: 'No connection' });
      return undefined;
    }
    setState({ key: signature, status: 'loading', error: null });
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const got = await fetchPrices(wanted.filter((l) => !results.has(l.key)));
        for (const [k, v] of Object.entries(got)) results.set(k, v);
        if (alive) setState({ key: signature, status: 'ok', error: null });
      } catch (e) {
        for (const [k, v] of Object.entries(e.payload?.results ?? {})) results.set(k, v);
        if (!alive) return;
        if (e.code === 'DAILY_LIMIT_EXCEEDED' || e.code === 'REQUEST_LIMIT_EXCEEDED') {
          reachedLimit(e.payload?.resetAt ? new Date(e.payload.resetAt) : null);
          setState({ key: signature, status: 'quota', error: e.message });
        } else if (e.code === 'NO_KEY') {
          setState({ key: signature, status: 'no-key', error: e.message });
        } else {
          console.error('Prices failed', e);
          setState({ key: signature, status: 'error', error: e.message });
        }
      }
    }, SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [signature, attempt, offline]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const current = state.key === signature ? state : { status: signature ? 'loading' : 'idle', error: null };
  const own = signature ? Object.fromEntries(lookups.filter((l) => results.has(l.key)).map((l) => [l.key, results.get(l.key)])) : null;
  return { status: current.status, error: current.error, results: own, retry };
}
