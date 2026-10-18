import { useEffect, useMemo, useRef, useState } from 'react';
import { searchHelp, searchTerms } from '../../lib/help.js';

/**
 * The Help's search (owner, 2026-10-18; decision 299): a small box at the
 * right of the page's header. Typing lists the pages that have every word
 * typed, the most relevant first (lib/help.js searchHelp), each with its
 * chapter, how many times the words are on it, and a line around the first
 * one. ↓ ↑ and Enter, or a click, open a page; Esc clears the box. The words
 * stay highlighted on the pages while they're in the box.
 */
export default function HelpSearch({ pages, query, onQuery, onPick }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const list = useRef(null);
  const results = useMemo(() => searchHelp(pages, query), [pages, query]);
  const searching = searchTerms(query).length > 0;
  const shown = open && searching;

  useEffect(() => {
    list.current?.querySelector('.help-result.on')?.scrollIntoView({ block: 'nearest' });
  }, [active, shown]);

  function pick(result) {
    if (!result) return;
    setOpen(false);
    input.current?.blur();
    onPick(result.page.id);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) onQuery('');
      else input.current?.blur();
    }
  }

  return (
    <div className="help-search">
      <input
        ref={input}
        type="search"
        className="help-search-box"
        placeholder="Search Help…"
        aria-label="Search Help"
        role="combobox"
        aria-expanded={shown}
        aria-controls="help-results"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {shown && (
        // Clicks in the list don't take the focus from the box, so it stays open until one is picked.
        <div className="help-results" id="help-results" role="listbox" ref={list} onMouseDown={(e) => e.preventDefault()}>
          {results.length ? (
            <>
              <p className="help-results-count">{results.length} page{results.length === 1 ? '' : 's'}</p>
              {results.map((r, i) => (
                <button
                  key={r.page.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`help-result${i === active ? ' on' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(r)}
                >
                  <span className="help-result-head">
                    <span className="help-result-title">{r.page.title}</span>
                    <span className="help-result-chapter">{r.page.chapter}</span>
                    {r.count > 0 && <span className="help-result-hits" title="Times on this page">{r.count}</span>}
                  </span>
                  {r.snippet && (
                    <span className="help-result-snippet">
                      {r.snippet.before}<mark>{r.snippet.match}</mark>{r.snippet.after}
                    </span>
                  )}
                </button>
              ))}
            </>
          ) : (
            <p className="help-results-none">No page has “{query.trim()}”.</p>
          )}
        </div>
      )}
    </div>
  );
}
