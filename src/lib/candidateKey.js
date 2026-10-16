// A search candidate's key (FABLE_REPORT B6): one card, one key, however it
// was found; and the same key worked out again from a saved line, so editing
// a line finds its card among the suggestions. The formats live here only.

/** A Magic printing, by its Scryfall id. */
export const magicKey = (scryfallId) => `mtg:${scryfallId}`;

/** A Pokémon card TCGdex lists, by its TCGdex id. */
export const pokemonKey = (lang, tcgdexId) => `pokemon:${lang}:${tcgdexId}`;

/** A Pokémon card known only from TCGplayer (owner, 2026-10-09), by its JustTCG card id. */
export const justtcgKey = (lang, cardId) => `pokemon:${lang}:jt:${cardId}`;

/** A bulk item or a placeholder, by its kind. */
export const bulkItemKey = (kind) => `bulk:${kind}`;

/** The key of the candidate a saved line was made from. */
export function candidateKeyOf(line) {
  if (line.bulk_kind != null) return bulkItemKey(line.bulk_kind);
  if (line.game === 'mtg') return magicKey(line.scryfall_id);
  return line.tcgdex_id ? pokemonKey(line.lang, line.tcgdex_id) : justtcgKey(line.lang, line.justtcg_card_id);
}
