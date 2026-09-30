// The header's global search (spec 13), in CM's pill style. Phase 1 is
// visual only; the search itself arrives in Phase 10.
// Much larger on every tab but the pricing screens (owner, 2026-09-29), where
// the main search bar is the focus.
export default function SearchBox({ wide }) {
  return (
    <div className={`search-col${wide ? ' wide' : ''}`}>
      <div className="search-wrap">
        <svg className="search-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <line x1="10.4" y1="10.4" x2="14.4" y2="14.4" stroke="currentColor"
                strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          className="search-input"
          autoComplete="off"
          placeholder="Search buys & collections…"
          aria-label="Search buys and collections"
        />
      </div>
    </div>
  );
}
