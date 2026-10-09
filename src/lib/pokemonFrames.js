// Pokémon card frames, for the foil sheen (spec 8.4). Holo shines on the art
// window and reverse holo everywhere else, and the art window moved as the
// frame was redesigned, so each era has its own mask (price.css
// .card-shine.era-*). Eras by the set's release year (owner, 2026-09-29);
// the odd set that breaks its era's frame is an accepted outlier.

export const FRAME_ERAS = ['1999', '2003', '2007', '2011', '2017', '2023'];

/**
 * The frame era for a set's release date ("2007-08-01"): the last era that
 * started on or before that year. No date: the newest.
 * @returns {'1999'|'2003'|'2007'|'2011'|'2017'|'2023'}
 */
export function frameEra(releaseDate) {
  const year = Number(String(releaseDate ?? '').slice(0, 4));
  if (!year) return FRAME_ERAS[FRAME_ERAS.length - 1];
  let era = FRAME_ERAS[0];
  for (const start of FRAME_ERAS) if (year >= Number(start)) era = start;
  return era;
}

// Rule-box Pokémon (owner, 2026-09-29): ex / EX, GX, V, VMAX, VSTAR,
// V-UNION, LV.X, LEGEND, BREAK, Radiant and Prism Star. TCGdex marks some by
// `suffix` (ex, EX, GX, V, TAG TEAM-GX), some by `stage` (VMAX, VSTAR,
// V-UNION, BREAK), and some only in the name.
const RULE_STAGES = new Set(['VMAX', 'VSTAR', 'V-UNION', 'BREAK', 'LEVEL-UP', 'LV.X', 'MEGA']);
const RULE_NAME = /(?:[\s-](?:ex|EX|GX|V|VMAX|VSTAR|V-UNION|LV\.X|LEGEND|BREAK)|◇|\bPrism Star)$/u;
// Japanese names run the mark straight on: "リザードンex", "ピカチュウVMAX".
const RULE_NAME_JA = /[^\u0000-\u007F](?:ex|EX|GX|V|VMAX|VSTAR|V-UNION|BREAK)$/u;

// Rarities whose art covers the whole card, or whose foil does (owner,
// 2026-09-29, 2026-10-09): TCGdex's names, English and Japanese, and
// TCGplayer's, for JustTCG-only cards (no TCGdex card).
const FULL_ART_RARITIES = new Set([
  'full art trainer', 'illustration rare', 'special illustration rare', 'ultra rare', 'hyper rare',
  'mega hyper rare', 'secret rare', 'black white rare', 'character rare', 'character super rare',
  'holo rare vmax', 'holo rare vstar', 'shiny rare', 'shiny rare v', 'shiny rare vmax', 'shiny ultra rare',
  'amazing rare', 'radiant rare', 'ace spec rare',
  // TCGplayer's names (Japanese AR, SAR, SR…)
  'shiny holo rare', 'art rare', 'special art rare', 'super rare', 'shiny super rare',
]);

/**
 * True for a full-art Pokémon card, or one foiled edge to edge: its holo
 * shines across the whole card, whatever finish TCGdex lists (it lists some
 * as non-holo: Black & White secret rares, Hidden Fates' Shiny Vault). Known
 * by its rarity; by a Trainer Gallery, Galarian Gallery, Shiny Vault or
 * Radiant Collection number (TG05, GG44, SV49, RC25); or, from Black & White
 * on, by a number past the set's printed count, a secret rare (TCGdex leaves
 * many Japanese ones without a rarity: S9a, SV9…). Not in a promo set,
 * whose numbers just run on.
 * @param {{ rarity?: string|null, number?: string|null, printedSize?: number|null,
 *   setName?: string|null, releaseDate?: string|null }} card
 */
export function isFullArt({ rarity, number, printedSize, setName, releaseDate }) {
  if (FULL_ART_RARITIES.has(String(rarity ?? '').trim().toLowerCase())) return true;
  if (/promo|プロモ/i.test(String(setName ?? ''))) return false;
  const n = String(number ?? '').trim();
  if (/^(tg|gg|sv|rc)\d/i.test(n)) return true;
  return /^\d+$/.test(n) && printedSize > 0 && Number(n) > printedSize && Number(frameEra(releaseDate)) >= 2011;
}

/**
 * True for a Pokémon with a rule box: its holo covers the whole card (like a
 * full art), since the art-window mask doesn't fit those frames.
 * @param {{ category?: string, suffix?: string|null, stage?: string|null }|null} card  TCGdex card
 * @param {string} name  the card's name
 */
export function isRuleBox(card, name) {
  if (card?.category && card.category !== 'Pokemon') return false;
  if (card?.suffix) return true;
  if (card?.stage && RULE_STAGES.has(String(card.stage).toUpperCase())) return true;
  const n = String(name ?? '').trim();
  return RULE_NAME.test(n) || RULE_NAME_JA.test(n) || /^Radiant\s/.test(n);
}
