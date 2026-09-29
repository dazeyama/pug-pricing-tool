// The main search bar (spec 8.2): large, fixed at the top of the stage, never
// an overlay. EN | JP at its right edge switches Pokémon's language only.
export default function SearchBar({ inputRef, value, onChange, onKeyDown, lang, onLang, note }) {
  return (
    <div className="main-search">
      <div className="main-search-row">
        <div className="main-search-field">
          <svg className="main-search-icon" viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
            <circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <line x1="10.4" y1="10.4" x2="14.4" y2="14.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            autoFocus
            autoComplete="off"
            spellCheck="false"
            placeholder="Type what's printed on the card: Lightning Bolt 161/295 2X2"
            aria-label="Search for a card"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {lang === 'ja' && <span className="jp-chip" title="Pokémon searches are Japanese">JP</span>}
        </div>
        <div className="lang-toggle" role="radiogroup" aria-label="Pokémon language">
          {['en', 'ja'].map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              className={lang === l ? 'on' : ''}
              title={l === 'en' ? 'English Pokémon' : 'Japanese Pokémon (search by number and set code)'}
              onClick={() => onLang(l)}
            >
              {l === 'en' ? 'EN' : 'JP'}
            </button>
          ))}
        </div>
      </div>
      <p className="search-note">{note}</p>
    </div>
  );
}
