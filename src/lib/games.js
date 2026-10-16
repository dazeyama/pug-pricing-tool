// The two games (spec 7.1), in the order the app shows them: the database's
// key, the badge's label and the name staff read. Every page takes them from
// here (FABLE_REPORT B3).

export const GAMES = [
  { key: 'mtg', label: 'MTG', name: 'Magic' },
  { key: 'pokemon', label: 'PKM', name: 'Pokémon' },
];

/** "Magic" / "Pokémon", by key. */
export const GAME_NAMES = Object.fromEntries(GAMES.map((g) => [g.key, g.name]));

/** "MTG" / "PKM", by key. */
export const GAME_LABELS = Object.fromEntries(GAMES.map((g) => [g.key, g.label]));

/** The other game's key. */
export const otherGame = (key) => (key === 'mtg' ? 'pokemon' : 'mtg');
