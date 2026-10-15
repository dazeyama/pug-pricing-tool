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
const ORDER = ['borderless', 'showcase', 'extendedart', 'fullart', 'retro', 'textless', 'serialized'];
const TRAIT_LABELS = {
  borderless: 'Borderless', showcase: 'Showcase', extendedart: 'Extended art', fullart: 'Full art',
  retro: 'Retro frame', textless: 'Textless', serialized: 'Serialized',
};

function foilName(key) {
  return SPECIAL_FOILS[key] ?? `${key.replace(/foil$/, '').replace(/^./, (c) => c.toUpperCase())} foil`;
}

/**
 * The traits that identify a Magic printing (spec 8.6), as key → label.
 * Etched isn't here: it's a finish (see magicFinishes).
 * @returns {Map<string, string>}
 */
export function magicTraits(card) {
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
  for (const p of promos) {
    if (SPECIAL_FOILS[p] || /foil$/.test(p)) t.set(`foil:${p}`, foilName(p));
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

/** A Magic printing's traits as a buy line stores them: ["borderless", "showcase", "surgefoil"]. */
export function magicTreatments(card) {
  const traits = magicTraits(card);
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
 * read-only chips.
 * @returns {{ key: string, label: string, on: boolean, toggle: boolean }[]}
 */
export function magicTraitRows(current, siblings) {
  const all = [current, ...siblings.filter((s) => s.id !== current.id)];
  const labels = new Map();
  const counts = new Map();
  for (const card of all) {
    for (const [k, label] of magicTraits(card)) {
      labels.set(k, label);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const cur = magicTraits(current);
  return sortTraitKeys(labels.keys(), labels).map((key) => ({
    key,
    label: labels.get(key),
    on: cur.has(key),
    toggle: counts.get(key) < all.length,   // some printing lacks it: it can be flipped
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

/** The first TCGplayer market price in a TCGdex pricing block ({ holofoil: { marketPrice } …}). */
function marketPriceIn(tcgplayer) {
  for (const v of Object.values(tcgplayer ?? {})) {
    if (v && typeof v === 'object' && typeof v.marketPrice === 'number') return v.marketPrice;
  }
  return null;
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
      return {
        id: [v.type, v.subtype ?? '', foil ?? '', stamps.join('+')].join('|'),
        finish: v.type,
        label: parts.join(' · ') || (v.subtype === 'unlimited' || hasFirst ? 'Unlimited' : 'Standard'),
        firstEdition: first,
        treatments,
        tcgplayerId: v.thirdParty?.tcgplayer != null ? String(v.thirdParty.tcgplayer) : null,
        marketPrice: marketPriceIn(v.pricing?.tcgplayer),
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
