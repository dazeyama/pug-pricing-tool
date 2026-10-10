import { useEffect, useState } from 'react';

// English names for Japanese Pokémon cards (owner, 2026-09-29), for searches
// on sites that list them in English (Cardmarket, TCGplayer). TCGdex's
// Japanese cards have Japanese names only, but Pokémon cards carry their
// National Pokédex numbers (dexId), and pokemonNames.json is the 1,025
// English species names by number (from PokeAPI, 2026-09-29; index = number
// - 1). Loaded only when a Japanese card needs it.

// A trainer's Pokémon, or a Dark, Light or Shining one, as TCGplayer (and so
// JustTCG) names it in English (owner, 2026-10-10): "カスミのスターミー" is
// "Misty's Starmie", "R団のエビワラー" "Rocket's Hitmonchan", "わるいリザードン"
// "Dark Charizard". Without the prefix their prices were looked up as the
// plain Pokémon's. TCGdex writes some old Dark cards "暗い…".
const PREFIXES = [
  // Gym Leaders (Leaders' Stadium, Challenge from the Darkness, and their 2025 cards)
  ['カスミの', "Misty's"], ['タケシの', "Brock's"], ['エリカの', "Erika's"], ['マチスの', "Lt. Surge's"],
  ['ナツメの', "Sabrina's"], ['キョウの', "Koga's"], ['カツラの', "Blaine's"], ['サカキの', "Giovanni's"],
  ['ロケット団の', "Team Rocket's"], ['R団の', "Rocket's"],
  // Trainers' Pokémon (2025)
  ['ナンジャモの', "Iono's"], ['リーリエの', "Lillie's"], ['ホップの', "Hop's"], ['Nの', "N's"], ['シロナの', "Cynthia's"],
  ['ペパーの', "Arven's"], ['ヒビキの', "Ethan's"], ['ダイゴの', "Steven's"], ['マリィの', "Marnie's"],
  // Dark, Light and Shining (Rocket Gang, neo)
  ['わるい', 'Dark'], ['暗い', 'Dark'], ['やさしい', 'Light'], ['ひかる', 'Shining'],
];

let names = null;
const load = () => import('./pokemonNames.json').then((m) => {
  names = m.default;
  return names;
});

/**
 * "メガリザードンYex" (dexId [6]) → "Mega Charizard Y ex"; "ピカチュウV" → "Pikachu V";
 * "カスミのスターミー" → "Misty's Starmie"; a TAG TEAM's numbers join with
 * " & ". Null for Trainers and Energy (no dexId) or a number past the list.
 */
export function englishPokemonName(card, list = names) {
  const ids = card?.dexId ?? [];
  if (!ids.length || !list) return null;
  const species = ids.map((id) => list[id - 1]);
  if (species.some((s) => !s)) return null;
  const full = String(card.name ?? '').trim();
  const prefix = PREFIXES.find(([ja]) => full.startsWith(ja));
  const jp = prefix ? full.slice(prefix[0].length) : full;
  const mega = jp.startsWith('メガ');
  const form = mega ? jp.match(/([XY])(?:ex|EX)?$/)?.[1] : null;
  const suffix = jp.match(/(VMAX|VSTAR|GX|EX|ex|V)$/)?.[1];
  return [prefix?.[1], mega ? 'Mega' : null, species.join(' & '), form, suffix].filter(Boolean).join(' ');
}

/**
 * The English name of a Japanese TCGdex card: a string; null when there
 * isn't one (not Japanese, a Trainer or Energy, the list failed to load);
 * undefined while the name list is still loading, so price lookups can wait.
 * @returns {string|null|undefined}
 */
export function useEnglishPokemonName(card, lang) {
  const needed = lang === 'ja' && (card?.dexId ?? []).length > 0;
  const [list, setList] = useState(names);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (needed && !list && !failed) load().then(setList, () => setFailed(true));
  }, [needed, list, failed]);
  if (!needed) return null;
  if (!list) return failed ? null : undefined;
  return englishPokemonName(card, list);
}
