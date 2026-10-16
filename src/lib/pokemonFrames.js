// Pokémon card frames, for the foil sheen (spec 8.4). Holo shines on the art
// window and reverse holo everywhere else, and the art window moved as the
// frame was redesigned, so each era has its own mask (price/card.css
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

// Celebrations' Classic Collection (TCGdex cel25cc, CC001–CC025) reprints
// old cards in their old frames (owner, 2026-10-09): each takes its
// original's era, not 2021's. Rule-box ones (ex, LV.X, EX, GX) shine across
// the whole card anyway; Reshiram and Zekrom are Black & White's full-art
// secret rares (113/114, 114/114).
const CLASSIC_COLLECTION = [
  // CC001–CC010: Base Set Blastoise, Charizard, Venusaur; Team Rocket Imposter Professor Oak,
  // Dark Gyarados, Here Comes Team Rocket!; Gym Challenge Rocket's Zapdos; _____'s Pikachu
  // (2001 promo); Neo Genesis Cleffa; Neo Revelation Shining Magikarp
  '1999', '1999', '1999', '1999', '1999', '1999', '1999', '1999', '1999', '1999',
  // CC011–CC015: Team Magma vs Team Aqua Groudon, Team Rocket Returns Rocket's Admin.,
  // Legend Maker Mew ex, Dragon Frontiers Gardevoir ex, POP Series 5 Umbreon ☆
  '2003', '2003', '2003', '2003', '2003',
  // CC016–CC019: Great Encounters Claydol, Rising Rivals Luxray GL LV.X,
  // Supreme Victors Garchomp C LV.X, HeartGold SoulSilver Donphan
  '2007', '2007', '2007', '2007',
  // CC020–CC021: Black & White Reshiram 113/114, Zekrom 114/114
  'full', 'full',
  // CC022–CC025: Next Destinies Mewtwo EX, XY Xerneas EX, Roaring Skies M Rayquaza EX,
  // Guardians Rising Tapu Lele GX
  '2011', '2011', '2011', '2017',
];

/**
 * A Classic Collection reprint's frame: its original's era ('1999'…), or
 * 'full' for a full art. Null for any other card.
 * @param {string|null} setId  TCGdex set id
 * @param {string|null} number  its number in that set ("CC015")
 */
export function classicFrame(setId, number) {
  if (setId !== 'cel25cc') return null;
  const m = /^CC0*(\d+)$/i.exec(String(number ?? '').trim());
  return m ? CLASSIC_COLLECTION[Number(m[1]) - 1] ?? null : null;
}

// Rule-box Pokémon (owner, 2026-09-29): ex / EX, GX, V, VMAX, VSTAR,
// V-UNION, LV.X, LEGEND, BREAK, Radiant and Prism Star. TCGdex marks some by
// `suffix` (ex, EX, GX, V, TAG TEAM-GX), some by `stage` (VMAX, VSTAR,
// V-UNION, BREAK), and some only in the name.
const RULE_STAGES = new Set(['VMAX', 'VSTAR', 'V-UNION', 'BREAK', 'LEVEL-UP', 'LV.X', 'MEGA']);
const RULE_NAME = /(?:[\s-](?:ex|EX|GX|V|VMAX|VSTAR|V-UNION|LV\.X|LEGEND|BREAK)|◇|\bPrism Star)$/u;
// Japanese names run the mark straight on: "リザードンex", "ピカチュウVMAX".
// eslint-disable-next-line no-control-regex -- [^\u0000-\u007F] is "not ASCII": the Japanese letter before the mark
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
 * The day promos moved into the illustration-rare frame: Scarlet & Violet's
 * release, 2023-03-31, its Elite Trainer Box promo (Koraidon / Miraidon SVP
 * 013–014) the first (owner, 2026-10-11).
 */
export const FULL_PROMOS_FROM = '2023-03-31';

/**
 * True for a holo promo from then on (owner, 2026-10-11): TCGdex's "Promo"
 * rarity in a set released on or after FULL_PROMOS_FROM shines across the
 * whole card, with no art-window mask. By the set's release date
 * ("2023-03-31"); no date, no.
 * @param {{ rarity?: string|null, releaseDate?: string|null }} card
 */
export function isFullPromo({ rarity, releaseDate }) {
  return String(rarity ?? '').trim().toLowerCase() === 'promo'
    && /^\d{4}-\d{2}-\d{2}/.test(String(releaseDate ?? '')) && String(releaseDate).slice(0, 10) >= FULL_PROMOS_FROM;
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

/**
 * Base Set's art-frame shadow (owner, 2026-10-12). TCGdex's Base Set scans
 * are 1st Edition ones, and Base Set's 1st Edition was printed shadowless;
 * its Unlimited prints have a drop shadow along the art frame's right and
 * bottom edges, as Base Set 2 and every later set do. So the Unlimited
 * versions get one drawn (a CSS box shadow, price/card.css .art-shadow, measured
 * against Base Set 2's and made a little stronger, as the owner asked).
 * Pokémon only: Trainers don't have it. `BASE_SET_ART_FRAME` is the frame's
 * outer edge as fractions of the picture, the same on all 69 Pokémon scans.
 */
export const BASE_SET_ART_FRAME = { left: 0.0883, top: 0.1067, right: 0.9117, bottom: 0.526 };

/**
 * True when the selected card's picture gets Base Set's shadow: an English
 * Base Set Pokémon shown from TCGdex, with an Unlimited version picked (the
 * plain one or the "1999–2000 copyright" print; not Shadowless, not 1st
 * Edition, not a TCGplayer-only product).
 * @param {{ setId?: string, lang?: string, category?: string|null, image?: string|null,
 *   version?: { firstEdition?: boolean, treatments?: string[], tcgplayerOnly?: boolean }|null }} p
 */
export function needsBaseSetShadow({ setId, lang, category, image, version }) {
  if (setId !== 'base1' || lang !== 'en' || category !== 'Pokemon' || !version) return false;
  if (!String(image ?? '').startsWith('https://assets.tcgdex.net/')) return false;
  if (version.firstEdition || version.tcgplayerOnly) return false;
  return !(version.treatments ?? []).some((t) => String(t).startsWith('shadowless'));
}
