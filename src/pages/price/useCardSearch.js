import { useEffect, useMemo, useRef, useState } from 'react';
import { rank, runSearch } from '../../lib/cardSearch.js';
import { isAbort } from '../../lib/transport.js';

// Live search as the user types (spec 8.2): 250ms debounce, at least 2
// characters, both games every time. A newer query aborts the older one, so
// its queued requests are dropped and its answers ignored.

const IDLE = { status: 'idle', list: [], total: 0, hasMore: false };
const START = {
  query: '',
  parsed: null,
  games: { mtg: IDLE, pokemon: IDLE },
  correction: null,
  tried: null,
  searching: false,
  settled: true,
  runId: 0,
};

/**
 * @param {string} text  the search bar's contents
 * @param {'en'|'ja'} lang  Pokémon language
 */
export function useCardSearch(text, lang) {
  const [state, setState] = useState(START);
  const runs = useRef(0);

  useEffect(() => {
    const input = text.trim();
    if (input.length < 2) {
      setState({ ...START, runId: ++runs.current });
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const runId = ++runs.current;
      // Old results stay up until the new ones arrive, so nothing flickers.
      setState((s) => ({
        ...s,
        query: input,
        searching: true,
        settled: false,
        correction: null,
        tried: null,
        runId,
        games: {
          mtg: { ...s.games.mtg, status: 'searching' },
          pokemon: { ...s.games.pokemon, status: 'searching' },
        },
      }));
      try {
        const { correction, tried } = await runSearch(input, lang, controller.signal, {
          onParsed: (parsed) => setState((s) => ({ ...s, parsed })),
          onUpdate: (game, result) => {
            if (!controller.signal.aborted) setState((s) => ({ ...s, games: { ...s.games, [game]: result } }));
          },
        });
        setState((s) => ({ ...s, correction, tried, searching: false, settled: true }));
      } catch (e) {
        if (!isAbort(e)) console.error('Search failed', e);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, lang]);

  const candidates = useMemo(
    () => rank([state.games.mtg.list, state.games.pokemon.list], state.parsed ?? {}),
    [state.games, state.parsed],
  );
  const total = state.games.mtg.total + state.games.pokemon.total;
  const hasMore = state.games.mtg.hasMore || state.games.pokemon.hasMore;

  return { ...state, candidates, total, hasMore };
}
