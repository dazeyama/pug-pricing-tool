import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPrices, lookupsFor, priceResults, searchTcgplayer } from '../../lib/prices.js';
import { usePriceLimit } from '../../state/priceLimit.jsx';
import { useConnection } from '../../state/connection.jsx';
import { isSealed } from '../../lib/justtcgCards.js';
import { anotherCard } from '../../lib/anotherCard.js';

// Prices only after a card has stayed selected for 400ms (spec 5.3), so
// arrowing through suggestions doesn't spend the JustTCG allowance. Results
// are kept for the page's life per lookup key; the server keeps them 6 hours
// for every computer.
const SETTLE_MS = 400;
const results = priceResults;   // lookup key → { card, fetchedAt } (prices.js, shared with TCGplayer searches)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- signature stands for the selected card's lookups; reachedLimit only reports
  }, [signature, attempt, offline]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const current = state.key === signature ? state : { status: signature ? 'loading' : 'idle', error: null };
  // A product's answer is kept under its key, which another card's lookup may share: read as
  // refused for a card it isn't (decision 347), and left as it is for the product's own card.
  const mine = (l) => {
    const got = results.get(l.key);
    const why = anotherCard(l, got?.card);
    return why ? { card: null, fetchedAt: got.fetchedAt, refused: why } : got;
  };
  const own = signature ? Object.fromEntries(lookups.filter((l) => results.has(l.key)).map((l) => [l.key, mine(l)])) : null;
  return { status: current.status, error: current.error, results: own, retry };
}

/**
 * TCGplayer-only products sharing a TCGdex card's name and number (owner,
 * 2026-10-09): Cosmos Holo, stamped and other separate products TCGdex
 * doesn't list, for the Version list. English cards only, one search per
 * card (kept by the server a week). It ran for every card selected, a
 * JustTCG request each; now (decision 289) it runs by itself only when the
 * card `needed`s it (a version TCGdex gives no product, or a saved
 * TCGplayer-only version being edited), and otherwise when asked for
 * (`ask`: the "Other TCGplayer versions…" link in the details panel).
 * @returns {{ cards: object[]|null, settled: boolean, canAsk: boolean, byHand: boolean, ask: () => void }}
 *   cards null while looking, or while not asked; settled: nothing more to wait for
 */
export function usePokemonSiblings(selected, pokemon, { needed = true } = {}) {
  const { offline } = useConnection();
  const possible = selected?.game === 'pokemon' && selected.lang === 'en' && selected.source !== 'justtcg'
    && selected.tcgdexId && selected.number && pokemon.resolved;
  const key = possible ? `pokemon:siblings:${selected.tcgdexId}` : null;
  const [state, setState] = useState({ key: null, cards: null });
  const [askedKey, setAskedKey] = useState(null);
  const byHand = Boolean(key) && askedKey === key;
  const wanted = Boolean(key) && (needed || byHand);
  const ask = useCallback(() => key && setAskedKey(key), [key]);

  useEffect(() => {
    if (!wanted || offline) return undefined;
    let alive = true;
    const size = selected.printedSize ?? pokemon.card?.set?.cardCount?.official ?? null;
    const timer = setTimeout(() => {
      searchTcgplayer({ kind: 'siblings', key, name: selected.name, number: selected.number, size })
        // Sealed products aren't versions of a card (owner, 2026-10-15).
        .then((cards) => alive && setState({ key, cards: (cards ?? []).filter((c) => !isSealed(c)) }))
        .catch((e) => {
          // No extra versions this time; the card's own still price as usual.
          console.warn('TCGplayer versions failed', e);
          if (alive) setState({ key, cards: [] });
        });
    }, SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- key stands for the card; its name, number and size go with it
  }, [wanted, key, offline]);

  if (!key) return { cards: null, settled: true, canAsk: false, byHand: false, ask };
  if (!wanted) return { cards: null, settled: true, canAsk: true, byHand: false, ask };
  return state.key === key
    ? { cards: state.cards, settled: true, canAsk: false, byHand, ask }
    : { cards: null, settled: Boolean(offline), canAsk: false, byHand, ask };
}
