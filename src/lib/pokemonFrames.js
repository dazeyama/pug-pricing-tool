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
