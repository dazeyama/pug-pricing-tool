// The main search bar (spec 8.2): large, fixed at the top of the stage, never
// an overlay. At its right edge, MTG | PKM picks the games searched (either
// or both, never neither), and EN | JP switches Pokémon's language only.
// `lead` goes before the field (a collection's < BACK). `blocked` switches
// the field off and says why in it (Can't upload cards: cards only arrive
// from exports).
const GAMES = [
  { key: 'mtg', label: 'MTG', name: 'Magic' },
  { key: 'pokemon', label: 'PKM', name: 'Pokémon' },
];

export default function SearchBar({
  inputRef, value, onChange, onKeyDown, lang, onLang, games, onGames, note, lead, blocked = null, gameBlocked = {},
}) {
  return (
    <div className="main-search">
      <div className="main-search-row">
        {lead}
        <div className="main-search-field">
          <svg className="main-search-icon" viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
            <circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <line x1="10.4" y1="10.4" x2="14.4" y2="14.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            autoFocus={!blocked}
            autoComplete="off"
            spellCheck="false"
            placeholder={blocked ?? "Type what's printed on the card: Lightning Bolt 161/295 2X2"}
            aria-label="Search for a card"
            disabled={Boolean(blocked)}
            title={blocked ?? undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {lang === 'ja' && games.pokemon && <span className="jp-chip" title="Pokémon searches are Japanese">JP</span>}
        </div>
        <div className="lang-toggle game-toggle" role="group" aria-label="Games to search">
          {GAMES.map((g) => {
            const on = games[g.key];
            // A game that can't be picked now (MTG in JP mode): greyed out, saying why.
            const why = gameBlocked[g.key] ?? null;
            const last = on && GAMES.every((o) => o.key === g.key || !games[o.key]);
            let title = on ? `Searching ${g.name}: click to leave it out` : `Not searching ${g.name}: click to include it`;
            if (last) title = why || Object.keys(gameBlocked).length
              ? `Searching ${g.name} only (Japanese is Pokémon only)`
              : `Searching ${g.name} only: at least one game stays on`;
            if (why) title = why;
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={on}
                className={`${g.key}${on ? ' on' : ''}${last ? ' last' : ''}`}
                title={title}
                disabled={Boolean(why)}
                onClick={() => {
                  if (!last && !why) onGames({ ...games, [g.key]: !on });
                }}
              >
                {g.label}
              </button>
            );
          })}
        </div>
        <div className="lang-toggle" role="radiogroup" aria-label="Pokémon language">
          {['en', 'ja'].map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              className={lang === l ? 'on' : ''}
              disabled={!games.pokemon}
              title={!games.pokemon ? 'Pokémon is switched off (PKM)'
                : l === 'en' ? 'English Pokémon' : 'Japanese Pokémon (search by number and set code)'}
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
