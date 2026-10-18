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

/**
 * The search an edit opens with (owner, 2026-10-19: "Clicking on a card for
 * edit card should automatically open the same query as the right click
 * instead of just filtering exactly to the 1 card, it's more useful to see
 * like-cards when going to edit"; decision 319): the card's name, every
 * printing of it, as right-clicking a suggestion searches. Null where a name
 * doesn't find it (a Japanese card, searched by its number; a card known only
 * from TCGplayer; bulk and placeholders): those keep editQuery's exact search.
 */
export function nameQuery(line) {
  if (line.bulk_kind != null || !line.name) return null;
  if (line.game === 'mtg') return line.name;
  if (line.lang === 'ja' || !line.tcgdex_id) return null;
  return line.name;
}

/**
 * A search line that finds exactly this saved card (spec 8.2's syntax):
 * "Sol Ring 472 CMR", "Charizard 4/102 BS", Japanese "025/165 SV2a".
 */
export function editQuery(line) {
  // Bulk: its game's items, found by "BULK" alone (docs/TEAM_FEEDBACK.md 5.3).
  if (line.bulk_kind != null) return `BULK ${line.game === 'mtg' ? 'mtg' : 'pkm'}`;
  const size = line.printed_size ? `/${line.printed_size}` : '';
  if (line.game === 'mtg') return `${line.name} ${line.collector_number} ${line.set_code}`;
  // An unnumbered old Japanese card found through TCGplayer: its "No." search again.
  if (line.lang === 'ja' && /^No\./.test(line.collector_number ?? '')) return line.collector_number;
  if (line.lang === 'ja') return `${line.collector_number}${size} ${line.set_code}`;
  // From TCGplayer: its set code may be one TCGdex doesn't know; name and number find it.
  if (!line.tcgdex_id) return `${line.name} ${line.collector_number}${size}`;
  return `${line.name} ${line.collector_number}${size} ${line.set_code}`;
}
