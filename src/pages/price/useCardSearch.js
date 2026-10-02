import { useEffect, useMemo, useRef, useState } from 'react';
import { rank, runSearch } from '../../lib/cardSearch.js';
import { isAbort } from '../../lib/transport.js';

// Live search as the user types (spec 8.2): 250ms debounce, at least 2
// characters, both games unless MTG | PKM leaves one out, newest printings
// first unless the sort toggle says oldest (it re-runs the search, so the
// first page is the oldest, not the newest 175 turned round). A newer query
// aborts the older one, so its queued requests are dropped and its answers
// ignored.

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
 * @param {{ mtg: boolean, pokemon: boolean }} games  which games to search
 * @param {boolean} [oldest]  oldest printings first
 */
export function useCardSearch(text, lang, games, oldest = false) {
  const gamesKey = `${games.mtg ? 'mtg' : ''}|${games.pokemon ? 'pokemon' : ''}`;
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
      // The old results go as soon as the new search starts (owner,
      // 2026-09-29), so the suggestions never show cards from the last query.
      // The selected card stays until the new results say otherwise (spec 8.12).
      setState((s) => ({
        ...s,
        query: input,
        searching: true,
        settled: false,
        correction: null,
        tried: null,
        runId,
        games: {
          mtg: { ...IDLE, status: games.mtg ? 'searching' : 'off' },
          pokemon: { ...IDLE, status: games.pokemon ? 'searching' : 'off' },
        },
      }));
      try {
        const { correction, tried } = await runSearch(input, lang, games, oldest, controller.signal, {
          onParsed: (parsed) => setState((s) => ({ ...s, parsed })),
          onUpdate: (game, result) => {
            if (!controller.signal.aborted) setState((s) => ({ ...s, games: { ...s.games, [game]: result } }));
          },
        });
        setState((s) => ({ ...s, correction, tried, searching: false, settled: true }));
      } catch (e) {
        if (isAbort(e)) return;
        // Never leave "Searching…" up: the search ends, with whatever it found.
        console.error('Search failed', e);
        setState((s) => ({ ...s, searching: false, settled: true }));
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, lang, gamesKey, oldest]);

  const candidates = useMemo(
    () => rank([state.games.mtg.list, state.games.pokemon.list], state.parsed ?? {}, oldest),
    [state.games, state.parsed, oldest],
  );
  const total = state.games.mtg.total + state.games.pokemon.total;
  const hasMore = state.games.mtg.hasMore || state.games.pokemon.hasMore;

  return { ...state, candidates, total, hasMore };
}
