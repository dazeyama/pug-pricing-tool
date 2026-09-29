import { useEffect, useState } from 'react';

// English names for Japanese Pokémon cards (owner, 2026-09-29), for searches
// on sites that list them in English (Cardmarket, TCGplayer). TCGdex's
// Japanese cards have Japanese names only, but Pokémon cards carry their
// National Pokédex numbers (dexId), and pokemonNames.json is the 1,025
// English species names by number (from PokeAPI, 2026-09-29; index = number
// - 1). Loaded only when a Japanese card needs it.

let names = null;
const load = () => import('./pokemonNames.json').then((m) => {
  names = m.default;
  return names;
});

/**
 * "メガリザードンYex" (dexId [6]) → "Mega Charizard Y ex"; "ピカチュウV" → "Pikachu V";
 * a TAG TEAM's numbers join with " & ". Null for Trainers and Energy (no
 * dexId) or a number past the list.
 */
export function englishPokemonName(card, list = names) {
  const ids = card?.dexId ?? [];
  if (!ids.length || !list) return null;
  const species = ids.map((id) => list[id - 1]);
  if (species.some((s) => !s)) return null;
  const jp = String(card.name ?? '').trim();
  const mega = jp.startsWith('メガ');
  const form = mega ? jp.match(/([XY])(?:ex|EX)?$/)?.[1] : null;
  const suffix = jp.match(/(VMAX|VSTAR|GX|EX|ex|V)$/)?.[1];
  return [mega ? 'Mega' : null, species.join(' & '), form, suffix].filter(Boolean).join(' ');
}

/** The English name of a Japanese TCGdex card, once the name list has loaded (else null). */
export function useEnglishPokemonName(card, lang) {
  const needed = lang === 'ja' && (card?.dexId ?? []).length > 0;
  const [list, setList] = useState(names);
  useEffect(() => {
    if (needed && !list) load().then(setList, () => {});
  }, [needed, list]);
  return needed ? englishPokemonName(card, list) : null;
}
