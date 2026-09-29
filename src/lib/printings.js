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
  if (card.border_color === 'borderless') t.set('borderless', 'Borderless');
  if (effects.includes('showcase')) t.set('showcase', 'Showcase');
  if (effects.includes('extendedart')) t.set('extendedart', 'Extended art');
  if (card.full_art) t.set('fullart', 'Full art');
  if (['1993', '1997'].includes(card.frame) && (card.released_at ?? '') >= MODERN_FRAME_FROM) t.set('retro', 'Retro frame');
  if (card.textless) t.set('textless', 'Textless');
  if (promos.includes('serialized')) t.set('serialized', 'Serialized');
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
  snowflake: 'Snowflake stamp', 'poketour-99': "Poké Tour '99 stamp", 'w-promo': 'W Promo stamp',
};
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
    return detailed.map((v) => {
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
      if (v.foil) parts.push(FOIL_NAMES[v.foil] ?? `${titleCase(v.foil)} foil`);
      for (const s of stamps) if (s !== '1st-edition') parts.push(STAMP_NAMES[s] ?? `${titleCase(s)} stamp`);
      const treatments = [
        ...(v.subtype && v.subtype !== 'unlimited' ? [v.subtype] : []),
        ...(v.foil ? [`${v.foil}-pattern`] : []),
        ...stamps.filter((s) => s !== '1st-edition'),
      ];
      return {
        id: [v.type, v.subtype ?? '', v.foil ?? '', stamps.join('+')].join('|'),
        finish: v.type,
        label: parts.join(' · ') || (v.subtype === 'unlimited' || hasFirst ? 'Unlimited' : 'Standard'),
        firstEdition: first,
        treatments,
        tcgplayerId: v.thirdParty?.tcgplayer != null ? String(v.thirdParty.tcgplayer) : null,
        marketPrice: marketPriceIn(v.pricing?.tcgplayer),
        cardmarketPrice: cardmarketIn(v.pricing?.cardmarket, v.type),
      };
    });
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

/** The version to start on: the first finish available in Normal → Holo → Reverse order, plainest version. */
export function defaultPokemonVersion(versions) {
  for (const finish of POKEMON_FINISHES) {
    const of = versions.filter((v) => v.finish === finish);
    if (of.length) return of.find((v) => !v.treatments.length && !v.firstEdition) ?? of[0];
  }
  return null;
}
