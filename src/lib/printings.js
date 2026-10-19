// Finishes and printing traits (spec 8.5–8.6): what the FOIL switch and the
// NORMAL | HOLO | REVERSE selector offer, the traits the details panel shows,
// and which sibling printing a trait toggle moves to. Pure functions.

// ---------------------------------------------------------------- Magic

/** Magic's modern frame arrived with 8th Edition; older frames after it are "retro". */
const MODERN_FRAME_FROM = '2003-07-28';

// Named special foils (promo_types), in plain words. Others ending in "foil"
// are named from their key.
const SPECIAL_FOILS = {
  surgefoil: 'Surge foil', galaxyfoil: 'Galaxy foil', textured: 'Textured foil',
  confettifoil: 'Confetti foil', halofoil: 'Halo foil', rainbowfoil: 'Rainbow foil',
  raisedfoil: 'Raised foil', stepandcompleat: 'Step-and-compleat foil',
  doublerainbow: 'Double rainbow foil', neonink: 'Neon ink', fracturefoil: 'Fracture foil',
  manafoil: 'Mana foil', oilslick: 'Oil slick foil', gilded: 'Gilded foil',
  embossed: 'Embossed foil', silverfoil: 'Silver foil', ripplefoil: 'Ripple foil',
};
const STAMPS = {
  prerelease: 'Prerelease stamp', promopack: 'Promo pack stamp', datestamped: 'Date stamped',
  stamped: 'Stamped', bundle: 'Bundle promo', buyabox: 'Buy-a-box promo',
  planeswalkerstamped: 'Planeswalker stamp',
};

/** Fixed display order for the usual traits; special foils and stamps follow. */
const ORDER = ['borderless', 'showcase', 'extendedart', 'fullart', 'retro', 'textless', 'serialized', 'japanese'];
const TRAIT_LABELS = {
  borderless: 'Borderless', showcase: 'Showcase', extendedart: 'Extended art', fullart: 'Full art',
  retro: 'Retro frame', textless: 'Textless', serialized: 'Serialized', japanese: 'Japanese',
};

function foilName(key) {
  return SPECIAL_FOILS[key] ?? `${key.replace(/foil$/, '').replace(/^./, (c) => c.toUpperCase())} foil`;
}

/**
 * The traits that identify a Magic printing (spec 8.6), as key → label.
 * Etched isn't here: it's a finish (see magicFinishes). With a `finish`, the
 * copy in that finish: a non-foil copy has no special foil (decision 326).
 * Scryfall lists one printing for both copies of some cards (Kefka, Dancing
 * Mad FIC 84: non-foil and foil, promo type surgefoil), the non-foil copy the
 * plain card. Without one, every trait the printing lists, for comparing
 * siblings.
 * @param {object} card
 * @param {string|null} [finish]
 * @returns {Map<string, string>}
 */
export function magicTraits(card, finish = null) {
  const t = new Map();
  const effects = card.frame_effects ?? [];
  const promos = card.promo_types ?? [];
  if (card.border_color === 'borderless') t.set('borderless', TRAIT_LABELS.borderless);
  if (effects.includes('showcase')) t.set('showcase', TRAIT_LABELS.showcase);
  if (effects.includes('extendedart')) t.set('extendedart', TRAIT_LABELS.extendedart);
  if (card.full_art) t.set('fullart', TRAIT_LABELS.fullart);
  if (['1993', '1997'].includes(card.frame) && (card.released_at ?? '') >= MODERN_FRAME_FROM) t.set('retro', TRAIT_LABELS.retro);
  if (card.textless) t.set('textless', TRAIT_LABELS.textless);
  if (promos.includes('serialized')) t.set('serialized', TRAIT_LABELS.serialized);
  // A Japanese-only printing (owner, 2026-10-16): a checkbox beside the set's English one.
  if (card.lang === 'ja') t.set('japanese', TRAIT_LABELS.japanese);
  for (const p of promos) {
    if ((SPECIAL_FOILS[p] || /foil$/.test(p)) && finish !== 'nonfoil') t.set(`foil:${p}`, foilName(p));
    if (STAMPS[p]) t.set(`stamp:${p}`, STAMPS[p]);
  }
  return t;
}

/** Sort trait keys: the usual ones in ORDER, then the rest by label. */
export function sortTraitKeys(keys, labels) {
  return [...keys].sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return (labels.get(a) ?? a).localeCompare(labels.get(b) ?? b);
  });
}

/**
 * A stored Magic treatment in plain words, as the details panel names it:
 * "extendedart" → "Extended art", "surgefoil" → "Surge foil", "promopack" →
 * "Promo pack stamp", a TCGplayer listing's "variant:Foil Etched" → its own name.
 */
export function magicTreatmentLabel(key) {
  if (TRAIT_LABELS[key]) return TRAIT_LABELS[key];
  if (STAMPS[key]) return STAMPS[key];
  if (SPECIAL_FOILS[key] || /foil$/.test(key)) return foilName(key);
  if (key.startsWith('variant:')) return key.slice('variant:'.length);
  return key.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * A Magic printing's traits as a buy line stores them: ["borderless", "showcase", "surgefoil"].
 * Pass the line's finish: a non-foil line never stores a special foil (decision 326).
 */
export function magicTreatments(card, finish = null) {
  const traits = magicTraits(card, finish);
  return sortTraitKeys(traits.keys(), traits).map((k) => k.replace(/^(foil|stamp):/, ''));
}

/** Which finishes a printing comes in. */
export function magicFinishes(card) {
  const f = card.finishes ?? [];
  return { nonfoil: f.includes('nonfoil'), foil: f.includes('foil'), etched: f.includes('etched') };
}

/** Non-foil when it exists both ways (owner's decision), else what there is. */
export function defaultMagicFinish(card) {
  const f = magicFinishes(card);
  return f.nonfoil ? 'nonfoil' : f.foil ? 'foil' : 'etched';
}

/**
 * Is this trait switched by the FOIL switch on this printing (decision 326)?
 * A special foil on a printing that also comes non-foil: on with foil, off
 * with non-foil.
 */
export function isFinishTrait(card, key) {
  const f = magicFinishes(card);
  return key.startsWith('foil:') && f.nonfoil && f.foil && magicTraits(card).has(key);
}

/** Keep the current finish on a new printing if it has it; otherwise its default. */
export function carryFinish(finish, card) {
  return magicFinishes(card)[finish] ? finish : defaultMagicFinish(card);
}

/** "263s" → [263, "s"], for "lowest collector number" tie-breaks. */
function numberSortKey(n) {
  const m = /^(\D*)(\d+)(.*)$/.exec(String(n));
  return m ? [Number(m[2]), `${m[1]}${m[3]}`] : [Number.MAX_SAFE_INTEGER, String(n)];
}
function byNumber(a, b) {
  const [na, sa] = numberSortKey(a.collector_number);
  const [nb, sb] = numberSortKey(b.collector_number);
  return na - nb || sa.localeCompare(sb);
}

/**
 * The sibling to move to when a trait is toggled (spec 8.6 step 4): it has
 * the trait flipped, and of those, differs least from the current printing
 * on every other trait; ties go to the lowest collector number. `accept`
 * narrows which siblings qualify (e.g. "has an etched finish").
 * @returns {object|null} a Scryfall card
 */
export function closestSibling(current, siblings, key, accept = () => true) {
  const cur = magicTraits(current);
  const want = key == null ? null : !cur.has(key);
  let best = null;
  let bestScore = Infinity;
  for (const s of [...siblings].sort(byNumber)) {
    if (s.id === current.id || !accept(s)) continue;
    const t = magicTraits(s);
    if (key != null && t.has(key) !== want) continue;
    let score = 0;
    for (const k of new Set([...cur.keys(), ...t.keys()])) {
      if (k !== key && cur.has(k) !== t.has(k)) score += 1;
    }
    if (score < bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

/**
 * What the details panel shows for a Magic printing among its siblings:
 * traits that differ among them are checkboxes; traits every one has are
 * read-only chips. `finish` is the current one: a special foil the FOIL
 * switch turns on and off is a checkbox, ticked only with foil (decision 326).
 * @returns {{ key: string, label: string, on: boolean, toggle: boolean }[]}
 */
export function magicTraitRows(current, siblings, finish = null) {
  const all = [current, ...siblings.filter((s) => s.id !== current.id)];
  const labels = new Map();
  const counts = new Map();
  for (const card of all) {
    for (const [k, label] of magicTraits(card)) {
      labels.set(k, label);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const cur = magicTraits(current, finish);
  return sortTraitKeys(labels.keys(), labels).map((key) => ({
    key,
    label: labels.get(key),
    on: cur.has(key),
    // Some printing lacks it, or a non-foil copy does: it can be flipped.
    toggle: counts.get(key) < all.length || all.some((c) => isFinishTrait(c, key)),
  }));
}

// ---------------------------------------------------------------- Pokémon

export const POKEMON_FINISHES = ['normal', 'holo', 'reverse'];

const STAMP_NAMES = {
  '1st-edition': '1st Edition', 'set-logo': 'Set logo stamp', 'pokemon-together': 'Pokémon Together stamp',
  'pre-release': 'Prerelease stamp', snowflake: 'Snowflake stamp', 'poketour-99': "Poké Tour '99 stamp", 'w-promo': 'W Promo stamp',
  'pokemon-center': 'Pokémon Center stamp',
};
/** A stamp TCGdex names that isn't listed above: its words, "Pokémon" spelled right ("Pokemon Center" read wrong). */
const stampName = (s) => STAMP_NAMES[s] ?? `${titleCase(s).replace(/\bPokemon\b/g, 'Pokémon')} stamp`;

/**
 * Is this the Pokémon Center stamped version (owner, 2026-10-11)? TCGdex's
 * `pokemon-center` stamp, or a TCGplayer product named for the Pokémon
 * Center ("Pokemon Center Exclusive"). Its logo goes on the card.
 */
export const isPokemonCenterStamp = (v) => (v?.treatments ?? [])
  .some((t) => t === 'pokemon-center' || /^variant:.*\bpok[eé]mon center\b/i.test(t));
const FOIL_NAMES = { pokeball: 'Poké Ball pattern', masterball: 'Master Ball pattern', cosmos: 'Cosmos foil' };
const SUBTYPE_NAMES = {
  shadowless: 'Shadowless',
  'shadowless-red-cheek': 'Shadowless · Red Cheeks',
  '1999-2000-copyright': '1999–2000 Copyright (4th print)',
};
// Base Set's 1st Edition print run is all shadowless, so on a 1st Edition
// version "Shadowless" says nothing: collectors and TCGplayer just call it
// "1st Edition" (owner, 2026-09-29).
const FIRST_EDITION_SUBTYPE_NAMES = { shadowless: null, 'shadowless-red-cheek': 'Red Cheeks' };

// TCGdex's price block names each printing; the finish's own first (a reverse
// holo's block lists the plain card's price first, and 4,452 of 6,554 reverse
// versions used to take it: PKM_PRICES.md 3.4; decision 287).
const MARKET_KEYS = {
  normal: ['normal', 'unlimited', '1st-edition'],
  holo: ['holofoil', 'unlimited-holofoil', '1st-edition-holofoil'],
  reverse: ['reverse-holofoil'],
};
/** The TCGplayer market price for the finish in a TCGdex pricing block, else the first there is. */
function marketPriceIn(tcgplayer, finish) {
  const blocks = Object.entries(tcgplayer ?? {})
    .filter(([, v]) => v && typeof v === 'object' && typeof v.marketPrice === 'number');
  const own = blocks.find(([k]) => (MARKET_KEYS[finish] ?? []).includes(k));
  return (own ?? blocks[0])?.[1].marketPrice ?? null;
}

// TCGdex's TCGplayer products that name another card, checked against
// TCGplayer's whole catalogue on 2026-10-17 (PKM_PRICES.md 3.1; decision 286):
// '<TCGdex card id>:<TCGdex's product>' → the right product, or null for none.
// Charmander SVP 044 was priced, and linked, as Fuecoco 002 at the counter
// (owner, 2026-10-17); Brilliant Stars' Trainer Gallery full arts as the plain
// cards; main-set holos as their theme-deck reprints ("Deck Exclusives").
// Reported to TCGdex too; this table goes when the data is fixed there.
export const WRONG_PRODUCTS = {
  'svp-044:477182': '512035',   // Charmander 044: Charmander, not Fuecoco 002 (owner, 2026-10-17)
  'swsh9tg-TG06:263778': '264214',   // Dusknoir TG06: Trainer Gallery, not the plain card
  'swsh9tg-TG07:263783': '264215',   // Dedenne TG07
  'swsh9tg-TG08:263787': '264216',   // Alcremie TG08
  'swsh9tg-TG16:263784': '264221',   // Mimikyu V TG16
  'swsh9tg-TG17:263785': '264222',   // Mimikyu VMAX TG17
  'swsh9tg-TG24:263852': '264228',   // Acerola's Premonition TG24
  'swsh9tg-TG26:263863': '264229',   // Gloria TG26
  'ex4-3:125256': '89788',   // Team Aqua's Kyogre 3: the set's holo, not the theme deck reprint
  'ex4-9:125255': '89827',   // Team Magma's Groudon 9
  'ex5-11:125058': '87335',   // Metagross 11
  'ex7-1:125066': '83682',   // Azumarill 1
  'ex7-7:125065': '84627',   // Dark Marowak 7
  'ex8-4:84089': '97749',   // Camerupt 4
  'ex8-14:228156': '89118',   // Shedinja 14
  'ex9-1:97710': '83906',   // Blaziken 1
  'ex9-7:97711': '87156',   // Manectric 7
  'ex9-10:88947': '97730',   // Sceptile 10
  'ex9-11:89678': '97731',   // Swampert 11
  'lc-3:118404': '84196',   // Charizard 3
  'lc-4:125088': '84569',   // Dark Blastoise 4
  'lc-7:125089': '84646',   // Dark Raichu 7
  'pl1-8:125076': '85636',   // Gardevoir 8
  'pl1-38:125077': '89106',   // Shaymin 38
  'pl2-5:125054': '85526',   // Flygon 5
  'pl2-32:125053': '88748',   // Rhyperior E4 32
  'pl3-35:125074': '87459',   // Milotic C 35
  'pl4-5:125055': '86949',   // Luxray 5
  'pl4-9:125057': '89674',   // Swalot 9
  'pl4-10:125056': '89753',   // Tangrowth 10
  'hgss2-5:125048': '87517',   // Mismagius 5
  'hgss2-24:125050': '89563',   // Steelix 24
  'swsh4-121:270101': '226575',   // Dialga 121
  'swsh7-16:247422': '246831',   // Eldegoss 16
  'me02-014:664004': '662201',   // Moltres 014
  'me02-045:664005': '662244',   // Zacian 045
  'me02-053:664006': '662159',   // Flygon 053
  'me02-068:663937': '660409',   // Toxtricity 068
  'cel25cc-CC020:250301': '250337',   // Reshiram CC020: Classic Collection, not Celebrations 2/25
  'cel25cc-CC021:250308': '250338',   // Zekrom CC021
  '2021swsh-5:232319': '232320',   // Snivy 5: Snivy, not Turtwig
  '2021swsh-16:232341': '232330',   // Scorbunny 16: Scorbunny, not Litten
  'pop7-9:86467': '89505',   // Stantler 9: Stantler, not Kirlia
  'ru1-5:87775': '89537',   // Starmie 5: Starmie, not Ninetales
  'ru1-6:87775': '85996',   // Gyarados 6: Gyarados, not Ninetales
  'hgss4-5:125072': '125069',   // Mamoswine 5: Mamoswine, not Nidoking
  'hgss3-4:125042': '234310',   // Gliscor 4: Gliscor's cracked ice, not Espeon's
  'sm3-28:178762': '173088',   // Alolan Ninetales 28: Alolan Ninetales and Lycanroc's cracked ice swapped
  'sm3-76:173088': '178762',   // Lycanroc 76
  'swsh10.5-052:279929': '279928',   // Blissey 052: Blissey's cosmos, not Snorlax's
  'np-16:153317': '153316',   // Treecko 16: Treecko, not Torchic
  'ecard2-50b:85813': '85814',   // Golduck 50b: Aquapolis a/b
  'ecard2-74b:84971': '84972',   // Drowzee 74b
  'ecard2-95a:87591': '87590',   // Mr. Mime 95a
  'ecard2-103b:88306': '88307',   // Porygon 103b
  'hgss2-21:220667': '231418',   // Poliwrath 21: Poliwrath's league promo, not Politoed's
  'hgss2-21:220668': '231419',   // Poliwrath 21
  'sv03-066:538743': '538744',   // Tyranitar ex 066: Tyranitar ex's Prize Pack card, not Toedscruel's
  'sv03-022:213012': null,   // Toedscruel ex 022: a 2004 Rayquaza league card: no product
  'ex1-107:176636': '176637',   // Psychic Energy 107: Psychic Energy, not Water Energy
};

/** A version's TCGplayer product, with TCGdex's known mistakes put right (null: none). */
export function fixedProduct(cardId, id) {
  if (id == null) return null;
  const key = `${cardId}:${id}`;
  return key in WRONG_PRODUCTS ? WRONG_PRODUCTS[key] : String(id);
}

/**
 * Cardmarket's price in euros from a TCGdex cardmarket block: the 30-day
 * average (steadier than one sale), else the trend, else the average. The
 * "-holo" figures are the reverse holo's.
 */
function cardmarketIn(cardmarket, finish) {
  if (!cardmarket) return null;
  const keys = finish === 'reverse' ? ['avg30-holo', 'trend-holo', 'avg-holo'] : ['avg30', 'trend', 'avg'];
  for (const k of keys) if (typeof cardmarket[k] === 'number' && cardmarket[k] > 0) return cardmarket[k];
  return null;
}

// TCGdex's foil-pattern mistakes (checked 2026-10-01). A plain (non-holo)
// version can't have a foil pattern at all, and TCGdex tags every Fossil
// printing, plain and holo, "galaxy": Fossil never had galaxy foils, so its
// versions read "Galaxy foil" instead of Unlimited / 1st Edition (owner,
// 2026-10-01). Its real oddities (the prerelease Aerodactyl's cosmos and
// starlight, the 4th-print Zapdos) are other patterns, and stay.
const WRONG_FOILS = { base3: ['galaxy'] };

/** A version's foil pattern, unless it's one of TCGdex's mistakes. */
function foilOf(card, v) {
  if (!v.foil || v.type === 'normal') return null;
  return (WRONG_FOILS[card?.set?.id] ?? []).includes(v.foil) ? null : v.foil;
}

// TCGdex's card-level TCGplayer pricing keys, by finish (older data).
const PRICING_KEYS = { normal: ['normal', 'unlimited'], holo: ['holofoil', 'unlimited-holofoil'], reverse: ['reverse-holofoil'] };

function titleCase(s) {
  return String(s).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The versions of a Pokémon card, from TCGdex's variants_detailed (standard
 * size only), each with a stable id, its finish and a plain-words label:
 * 1st Edition first, then subtype (Shadowless…), foil pattern (Poké Ball…)
 * and other stamps. The plain version reads "Unlimited" when the card also
 * has a 1st Edition (the collectors' word), else "Standard".
 * Older data without variants_detailed falls back to the plain `variants`.
 * Each also carries its TCGplayer product ID (JustTCG lookup), TCGplayer
 * market price (the fallback NM price, spec 8.7) and Cardmarket price in
 * euros (a warning check only).
 * @returns {{ id: string, finish: string, label: string, firstEdition: boolean,
 *   treatments: string[], tcgplayerId: string|null, marketPrice: number|null,
 *   cardmarketPrice: number|null }[]}
 */
export function pokemonVersions(card) {
  const detailed = (card?.variants_detailed ?? []).filter((v) => (v.size ?? 'standard') === 'standard'
    && POKEMON_FINISHES.includes(v.type));
  if (detailed.length) {
    const hasFirst = detailed.some((v) => (v.stamp ?? []).includes('1st-edition'));
    const seen = new Set();
    return uncrossPatterns(detailed.map((v) => {
      const foil = foilOf(card, v);
      const stamps = v.stamp ?? [];
      const first = stamps.includes('1st-edition');
      const parts = [];
      if (first) parts.push(STAMP_NAMES['1st-edition']);
      if (v.subtype && v.subtype !== 'unlimited') {
        const name = first && v.subtype in FIRST_EDITION_SUBTYPE_NAMES
          ? FIRST_EDITION_SUBTYPE_NAMES[v.subtype]
          : SUBTYPE_NAMES[v.subtype] ?? titleCase(v.subtype);
        if (name) parts.push(name);
      }
      if (foil) parts.push(FOIL_NAMES[foil] ?? `${titleCase(foil)} foil`);
      for (const s of stamps) if (s !== '1st-edition') parts.push(stampName(s));
      const treatments = [
        ...(v.subtype && v.subtype !== 'unlimited' ? [v.subtype] : []),
        ...(foil ? [`${foil}-pattern`] : []),
        ...stamps.filter((s) => s !== '1st-edition'),
      ];
      const tcgplayerId = fixedProduct(card?.id, v.thirdParty?.tcgplayer);
      // A product put right: TCGdex's market price is the wrong card's, so none.
      const fixed = v.thirdParty?.tcgplayer != null && tcgplayerId !== String(v.thirdParty.tcgplayer);
      return {
        id: [v.type, v.subtype ?? '', foil ?? '', stamps.join('+')].join('|'),
        finish: v.type,
        label: parts.join(' · ') || (v.subtype === 'unlimited' || hasFirst ? 'Unlimited' : 'Standard'),
        firstEdition: first,
        treatments,
        tcgplayerId,
        marketPrice: fixed ? null : marketPriceIn(v.pricing?.tcgplayer, v.type),
        cardmarketPrice: cardmarketIn(v.pricing?.cardmarket, v.type),
        // Its stamps besides 1st Edition: a stamped version TCGdex gives no
        // TCGplayer product can be matched to TCGplayer's (justtcgCards.js).
        stamps: stamps.filter((s) => s !== '1st-edition'),
      };
    }).filter((v) => {
      // A mistaken pattern dropped can leave two versions the same: keep the first.
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    }));
  }
  const v = card?.variants ?? {};
  const pricing = card?.pricing?.tcgplayer ?? {};
  const out = [];
  for (const finish of POKEMON_FINISHES) {
    if (!v[finish]) continue;
    const key = PRICING_KEYS[finish].find((k) => pricing[k]);
    const base = {
      finish, treatments: [], tcgplayerId: key && pricing[key].productId ? String(pricing[key].productId) : null,
      marketPrice: key ? pricing[key].marketPrice ?? null : null,
      cardmarketPrice: cardmarketIn(card?.pricing?.cardmarket, finish),
    };
    out.push({ ...base, id: `${finish}|||`, label: v.firstEdition ? 'Unlimited' : 'Standard', firstEdition: false });
    if (v.firstEdition) {
      out.push({ ...base, id: `${finish}|||1st-edition`, label: '1st Edition', firstEdition: true, marketPrice: null, cardmarketPrice: null });
    }
  }
  return out;
}

/**
 * A card's Poké Ball pattern is never pricier than its Master Ball pattern
 * (owner, 2026-10-10). TCGdex sometimes crosses the two patterns' products
 * (8 of 39 Japanese SV2a cards checked: Poké Ball €9.11 and Master Ball €0.92
 * on Starmie), so a pair the wrong way round is put back, for the Cardmarket
 * price and TCGplayer's market price alike. Changes the versions in place.
 */
export function uncrossPatterns(versions) {
  for (const finish of POKEMON_FINISHES) {
    const pokeball = versions.find((v) => v.finish === finish && v.treatments.includes('pokeball-pattern'));
    const masterball = versions.find((v) => v.finish === finish && v.treatments.includes('masterball-pattern'));
    if (!pokeball || !masterball) continue;
    for (const field of ['cardmarketPrice', 'marketPrice']) {
      if (pokeball[field] != null && masterball[field] != null && pokeball[field] > masterball[field]) {
        [pokeball[field], masterball[field]] = [masterball[field], pokeball[field]];
      }
    }
  }
  return versions;
}

/** The version to start on: the first finish available in Normal → Holo → Reverse order, plainest version. */
export function defaultPokemonVersion(versions) {
  // TCGdex's own versions first (smoke test 2026-10-11, F7): a TCGplayer-only
  // product (Pikachu SVP 027's "Baby" normal, $97) is never the default when
  // TCGdex lists the card; a card known only from TCGplayer has nothing else.
  const own = versions.filter((v) => !v.tcgplayerOnly);
  const pool = own.length ? own : versions;
  for (const finish of POKEMON_FINISHES) {
    const of = pool.filter((v) => v.finish === finish);
    if (of.length) return of.find((v) => !v.treatments.length && !v.firstEdition) ?? of[0];
  }
  return null;
}
