import { useEffect, useRef, useState } from 'react';
import SearchBar from './price/SearchBar.jsx';
import SelectedCard from './price/SelectedCard.jsx';
import Suggestions, { ROW } from './price/Suggestions.jsx';
import ShowAllModal from './price/ShowAllModal.jsx';
import { useCardSearch } from './price/useCardSearch.js';
import { warmUp } from '../lib/cardSearch.js';
import { readLocal, writeLocal } from '../lib/local.js';

const BACKGROUND = { '--stage-bg': `url(${import.meta.env.BASE_URL}background.webp)` };
const LANG_KEY = 'pug.pokemonLang';

/** EN | JP for Pokémon, remembered per computer (spec 8.2). */
function usePokemonLang() {
  const [lang, setLang] = useState(() => (readLocal(LANG_KEY) === 'ja' ? 'ja' : 'en'));
  return [lang, (next) => {
    setLang(next);
    writeLocal(LANG_KEY, next);
  }];
}

// The Price tab (spec 8). Phase 3: search, suggestions and the selected card.
// Finish and details (Phase 4), prices (Phase 5) and the buy list (Phase 6)
// are marked where they'll go.
export default function PricePage() {
  const [text, setText] = useState('');
  const [lang, setLang] = usePokemonLang();
  const search = useCardSearch(text, lang);
  const [selected, setSelected] = useState(null);
  const [highlight, setHighlight] = useState(-1);
  const [showAll, setShowAll] = useState(false);
  const input = useRef(null);
  const selectedRef = useRef(null);
  selectedRef.current = selected;

  useEffect(() => warmUp(lang), [lang]);

  const visible = search.candidates.slice(0, ROW);
  const hasShowAll = search.candidates.length > ROW;

  // When a search settles: a lone printing is selected automatically; a
  // selection the new results don't include is dropped (spec 8.3, 8.12).
  useEffect(() => {
    if (!search.settled) return;
    const list = search.candidates;
    if (list.length === 1) {
      setSelected(list[0]);
      setHighlight(0);
      return;
    }
    const cur = selectedRef.current;
    const index = cur ? list.findIndex((c) => c.key === cur.key) : -1;
    setSelected(index >= 0 ? list[index] : null);
    setHighlight(index >= 0 && index < ROW ? index : -1);
    // Runs once per finished search, not on every re-render of the same results.
  }, [search.runId, search.settled]);

  function focusSearch() {
    input.current?.focus();
  }

  // Clicking the selected card again deselects it.
  function pick(c) {
    const again = selected?.key === c.key;
    setSelected(again ? null : c);
    setHighlight(again ? -1 : visible.findIndex((v) => v.key === c.key));
    setShowAll(false);
    focusSearch();
  }

  function clear() {
    setText('');
    setSelected(null);
    setHighlight(-1);
    focusSearch();
  }

  // Focus stays in the search bar; these keys drive everything (spec 8.11).
  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const last = visible.length - 1 + (hasShowAll ? 1 : 0);
      if (last < 0 || (e.key === 'ArrowUp' && highlight <= 0)) return;
      const next = e.key === 'ArrowDown' ? Math.min(highlight + 1, last) : highlight - 1;
      setHighlight(next);
      if (next < visible.length) setSelected(visible[next]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clear();
    } else if (e.key === 'Enter' && hasShowAll && highlight === visible.length) {
      e.preventDefault();
      setShowAll(true);
    }
  }

  const note = search.correction ? (
    <>Showing results for <strong>{search.correction.name}</strong></>
  ) : null;

  return (
    <div className="price-screen" style={BACKGROUND}>
      <div className="stage">
        <SearchBar
          inputRef={input}
          value={text}
          onChange={setText}
          onKeyDown={onKeyDown}
          lang={lang}
          onLang={(l) => {
            setLang(l);
            focusSearch();
          }}
          note={note}
        />

        {/* Owner's layout (2026-09-29): card left with prices under it; info
            beside it with the suggestions below; finish & details beside the
            suggestions with the action row under them. Grid areas in price.css. */}
        <div className="stage-body">
          <SelectedCard candidate={selected} typedName={search.parsed?.name} />
          <Suggestions
            search={search}
            lang={lang}
            highlight={highlight}
            selectedKey={selected?.key}
            onPick={pick}
            onShowAll={() => setShowAll(true)}
          />
          <div className="area-side">
            <div className="stage-slot">Finish &amp; details · Phase 4</div>
          </div>
          <div className="area-prices">
            <div className="stage-slot">NM · LP · MP · HP · DMG prices · Phase 5</div>
          </div>
          <div className="area-actions">
            <div className="stage-slot">Qty · CLEAR · ADD CARD · Phase 6</div>
          </div>
        </div>
        <p className="hint-strip">↓↑ pick · Esc clear</p>
      </div>

      <aside className="buy-list">
        <div className="list-head">
          <span className="list-title">Buy list</span>
          <span className="list-count">0 cards</span>
        </div>
        <p className="list-empty">Cards you add will appear here (Phase 6).</p>
      </aside>

      {showAll && (
        <ShowAllModal
          candidates={search.candidates}
          hasMore={search.hasMore}
          selectedKey={selected?.key}
          onPick={pick}
          onClose={() => {
            setShowAll(false);
            focusSearch();
          }}
        />
      )}
    </div>
  );
}
