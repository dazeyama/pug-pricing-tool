// The TCGplayer route to a Crystal Commerce product (decision 588, phase 3; decision 590's order: it answers only
// where today's matcher, ccMatch.js, leaves a line as Needs a choice, with no category, or with no candidates).
// A line's TCGplayer id (Scryfall's, buyLine.js) → TCGplayer's own product (`tcg_products`: its name, number and
// set) → the CC category the set table gives that set (tcgSetTable.js, owner-checked, decision 591) → the CC
// products of TCGplayer's name in that category, kept where finish, number and tags agree. One product left is the
// answer; anything else is no answer, and the line stays as today's matcher left it.
// The same steps as the measuring script (C:/ClaudeProjects/temp/cc-tcgcsv/measure.mjs `route`), with the set
// table in place of its vote and decision 590's two fixes: a numbered CC product whose tags match isn't dropped
// when TCGplayer's name has no number; and a "lone" pick (one product left after the tags disagreed) is no answer.
// Pure: the catalog product, the set table and the candidates come in, so the measuring scripts run this code too.

import { nameKey } from './normalize.js';

/** Folded for comparing words: lower case, accents off, letters and digits only. */
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
/** A collector number without leading zeros: "0348" → "348". */
const normNum = (s) => String(s ?? '').toLowerCase().replace(/^0+(?=\d)/, '');

// The two sides' words for one thing, made one: TCGplayer's → CC's (Alliances' "(Man)" is CC's "(Male)").
const SYN = new Map(Object.entries({
  jpalternateart: 'japanesealternateart', serialnumbered: 'serialized', nonfoil: '', man: 'male', woman: 'female',
}));
/** A word as both sides are compared: folded, then the shared spelling. */
const word = (raw) => {
  const f = fold(raw);
  return SYN.has(f) ? SYN.get(f) : f;
};
/** A set code in brackets ("(C14)", "(FDN)", "(PLST)"), as written: 3 to 5 capitals and digits, a letter among them. */
const isCode = (raw) => /^[A-Z0-9]{3,5}$/.test(raw) && /[A-Z]/.test(raw);

/**
 * TCGplayer's product name → its base name (front face, as CC's base_key), number, its own foil word, tags and
 * set codes. "Avatar of Burgeoning Echoes (Showcase)" → { base: 'avatar of burgeoning echoes', number: null,
 * foil: null, tags: ['showcase'], codes: [] }.
 * @param {string} name
 */
export function parseTp(name) {
  const toks = [...String(name ?? '').matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim());
  const full = nameKey(String(name ?? '').replace(/\s*\([^)]*\)/g, '').trim());
  let number = null;
  let foil = null;
  const tags = [];
  const codes = [];
  for (const t of toks) {
    if (/^\d+[a-z]?$/i.test(t)) number = normNum(t);
    else if (/foil/i.test(t) && !/^non-?foil$/i.test(t)) foil = fold(t);
    else if (isCode(t)) codes.push(fold(t));
    else {
      const f = word(t);
      if (f) tags.push(f);
    }
  }
  return { full, base: full.split(' // ')[0], number, foil, tags, codes };
}

/**
 * A CC product as the route compares it: its foil word; its number (a numeric bracket); its tags, its variants and
 * any other word in its bracket ("Kiddie Coaster (2-5-6)", "Maro's Gone Nuts (No PW Symbol)": phase 4a); and a set
 * code in its bracket ("Sol Ring (C14)").
 */
export function ccRecord(product) {
  const bracket = product.bracket ?? null;
  const numbered = bracket != null && /^\d+[a-z]?$/i.test(bracket);
  const code = bracket != null && !numbered && isCode(bracket);
  const tags = (product.variants ?? []).map(word).filter(Boolean);
  if (bracket != null && !numbered && !code && word(bracket)) tags.push(word(bracket));
  return {
    product,
    foil: product.foil_kind ? fold(product.foil_kind) : null,
    number: numbered ? normNum(bracket) : null,
    tags,
    codes: code ? [fold(bracket)] : [],
    // Its extra words one by one, for phase 4b's promo check: "Store Championship Promo" → store, championship, promo.
    words: [...(product.variants ?? []), ...(bracket != null && !numbered && !code ? [bracket] : [])]
      .flatMap((v) => String(v).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/))
      .filter(Boolean),
  };
}

/** Does a CC product's foil fit the line's finish? A plain foil line takes any foil unless TCGplayer names one. */
export function finishOk(rec, finish, tpFoil) {
  if (finish === 'nonfoil') return rec.foil == null;
  if (rec.foil == null) return false;
  const etched = rec.foil.includes('etched');
  if (finish === 'etched') return etched;
  if (etched) return false;
  return tpFoil ? rec.foil === tpFoil : true;
}

const sameTags = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
// Phase 4b: the words a promo's name adds that say where it was given out, not how it looks. A year counts too.
// Treatments (borderless, showcase, extended art, retro frame, etched, serialized, manga…) are deliberately absent.
const PROMO_WORDS = new Set(`promo promos promotional exclusive deck decks theme planeswalker welcome brawl intro
  starter fnm friday night magic arena judge academy dci game day launch release prerelease event party store
  championship championships champs anniversary bundle costco walmart target gamestop pride month buy a box
  bring friend league open house player rewards wpn gateway play standard showdown hero heros path media insert
  sdcc convention edition holiday gift kit pack card season worlds world grand prix pro tour qualifier`
  .split(/\s+/).filter(Boolean));
const isPromoWord = (w) => PROMO_WORDS.has(w) || /^(19|20)\d\d$/.test(w);
// A promo's words that name the program it came from, and the TCGplayer sets of that program: a CC product naming
// one fits only a card from those sets ("Mutavault - Grand Prix Promo" isn't TCGplayer's Champs Promos Mutavault).
const PROGRAMS = [
  [/\bgrand prix\b/, /grand prix/i],
  [/\bfnm\b|\bfriday night\b/, /fnm/i],
  [/\barena\b/, /arena/i],
  [/\bjudge\b|\bdci\b/, /judge/i],
  [/\bpro tour\b/, /pro tour/i],
  [/\bchamps\b/, /champs/i],
  [/\bgame day\b|\bstore championships?\b/, /game day|store championship/i],
  [/\bprerelease\b|\blaunch\b|\brelease\b/, /prerelease|launch|release|hero/i],
  [/\bplayer rewards\b/, /player rewards/i],
  [/\bwpn\b|\bgateway\b/, /wpn|gateway/i],
  [/\bopen house\b/, /open house/i],
  [/\bworlds?\b|\bworld championship\b/, /world/i],
];
/** Do a promo product's words fit the TCGplayer set the card is from? */
const programFits = (words, groupName) => {
  const text = words.join(' ');
  return PROGRAMS.every(([said, sets]) => !said.test(text) || sets.test(String(groupName ?? '')));
};

/** Phase 4c: a printing Scryfall makes in foil only (the line carries its Scryfall card's finishes). */
const foilOnly = (line) => Array.isArray(line.finishes) && line.finishes.length > 0
  && line.finishes.every((f) => f === 'foil');
/** Phase 4c: a CC category of promos, where a foil-only card's product often lacks the foil word. */
const isPromoCategory = (c) => /promo|arena|judge|reward|championship|game day|fnm/i.test(String(c ?? ''))
  && !/^Promo Pack:/i.test(String(c));

/** Set codes tell printings apart only when both names carry one: then they must be the same (phase 4a). */
const codesOk = (a, b) => !a.length || !b.length || sameTags(a, b);

// The store shelves The List and Mystery Booster together (ccMatch.js SAME_SHELF, owner 2026-10-14).
const SHELF = { 'The List': 'Mystery Booster', 'Mystery Booster': 'The List' };

/**
 * The base keys to look a TCGplayer product's CC candidates up by: its full name and its front face.
 * @param {{ name: string }} tcg
 * @returns {string[]}
 */
export function routeBaseKeys(tcg) {
  const t = parseTp(tcg.name);
  return [...new Set([t.full, t.base].filter(Boolean))];
}

/**
 * A set's place in CC: the set table's row by group id ([name, category|null, extra word|null, more categories|null]),
 * else, for a set the table hasn't met, a CC category of the set's own name; else none.
 * @param {number} groupId
 * @param {string|null} groupName  `tcg_groups.name`, for a set the table hasn't met
 * @param {Record<number, [string, string|null, string|null, string[]|null]>} table
 * @param {(name: string) => string|null} categoryNamed  CC's category of that name, folded, or null
 * @returns {{ category: string|null, extra: string|null, more: string[], carried: boolean }}
 */
export function setPlace(groupId, groupName, table, categoryNamed) {
  const row = table[groupId];
  if (row) return { category: row[1], extra: row[2] ?? null, more: row[3] ?? [], carried: row[1] != null };
  const same = groupName ? categoryNamed(groupName) : null;
  return { category: same, extra: null, more: [], carried: same != null };
}

/**
 * One line's answer by the TCGplayer route.
 * @param {object} p
 * @param {{ finish: string }} p.line  a Magic buy line
 * @param {{ product_id: number, group_id: number, name: string, number?: string|null, group_name?: string|null }|null} p.tcg
 *   the line's TCGplayer product (`tcg_products`, its group's name beside it), or null when the catalog lacks it
 * @param {object[]} p.candidates  cc_products rows of the TCGplayer name in any category (routeBaseKeys)
 * @param {Record<number, Array>} p.table  the set table (tcgSetTable.js)
 * @param {(name: string) => string|null} p.categoryNamed
 * @returns {{ status: 'auto', product: object, category: string } | { status: 'none', why: string, category?: string|null }}
 */
export function routeProduct({ line, tcg, candidates, table, categoryNamed }) {
  if (!tcg) return { status: 'none', why: 'not in the TCGplayer catalog' };
  const place = setPlace(tcg.group_id, tcg.group_name ?? null, table, categoryNamed);
  if (!place.carried) return { status: 'none', why: place.category === null && table[tcg.group_id] ? 'set not carried' : 'set not placed' };
  const finish = line.finish;
  const t = parseTp(tcg.name);
  const front = (r) => String(r.product.base_key ?? '').split(' // ')[0];
  const all = (candidates ?? []).map(ccRecord).filter((r) => front(r) === t.base);
  const inCat = (c) => all.filter((r) => r.product.category === c && finishOk(r, finish, t.foil));
  let cat = place.category;
  let recs = inCat(cat);
  // A set CC splits by set (TCGplayer's one "Prerelease Cards" is CC's "Prerelease Promo: <set>"): its other
  // categories, only for a product carrying the set's own word.
  if (!recs.length && place.extra) {
    for (const c of place.more) {
      const more = inCat(c).filter((r) => r.tags.includes(place.extra));
      if (more.length) {
        recs = more;
        cat = c;
        break;
      }
    }
  }
  if (!recs.length && SHELF[cat]) {
    const more = inCat(SHELF[cat]);
    if (more.length) {
      recs = more;
      cat = SHELF[cat];
    }
  }
  // Phase 4c: CC names many a foil-only promo without "Foil" ("Pillage - Arena 2000", "- Game Day Promo"). A
  // printing Scryfall makes in foil only, with no foil product of that name in a promo category, takes the
  // products there without the foil word. Not a promo pack's category: its non-foil and foil are two products.
  if (!recs.length && finish === 'foil' && foilOnly(line) && isPromoCategory(place.category)) {
    const plain = all.filter((r) => r.product.category === place.category && r.foil == null);
    if (plain.length) {
      recs = plain;
      cat = place.category;
    }
  }
  if (!recs.length) return { status: 'none', why: 'no product of that name and finish', category: cat };
  const want = (r) => codesOk(r.codes, t.codes)
    && (sameTags(r.tags, t.tags) || (place.extra && sameTags(r.tags, [...t.tags, place.extra])));
  if (recs.some((r) => r.number != null)) {
    if (t.number) {
      recs = recs.filter((r) => r.number === t.number || r.number == null);
      if (recs.some((r) => r.number === t.number)) recs = recs.filter((r) => r.number === t.number);
    } else if (!recs.every((r) => r.number != null)) {
      // TCGplayer's name has no number: the unnumbered products, and a numbered one whose tags match
      // ("Avatar of Burgeoning Echoes (0348) - Showcase" for TCGplayer's "(Showcase)"; decision 590's first fix).
      recs = recs.filter((r) => r.number == null || want(r));
    }
  }
  if (!recs.length) return { status: 'none', why: 'number differs', category: cat };
  let exact = recs.filter(want);
  if (exact.length > 1 && finish === 'foil' && !t.foil) {
    const plain = exact.filter((r) => r.foil === 'foil');
    if (plain.length) exact = plain;
  }
  if (exact.length === 1) return { status: 'auto', product: exact[0].product, category: cat };
  // Phase 4b: TCGplayer's name has no tags, and CC's one product here adds only promo words ("Wall of Roots - Foil
  // FNM 2008", "- Theme Deck Exclusive", "- Store Championship Promo"). A treatment word is never one (the lone-pick
  // mistake of decision 590).
  if (!exact.length && !t.tags.length) {
    const group = tcg.group_name ?? table[tcg.group_id]?.[0] ?? null;
    const promo = recs.filter((r) => r.words.length && r.words.every(isPromoWord) && codesOk(r.codes, t.codes)
      && programFits(r.words, group));
    if (promo.length === 1) return { status: 'auto', product: promo[0].product, category: cat, rule: '4b' };
  }
  // Several alike, or none whose tags agree (a "lone" product left is often another printing: decision 590's
  // second fix): no answer, and the line stays as today's matcher left it.
  return { status: 'none', why: exact.length > 1 ? 'several alike' : 'tags differ', category: cat };
}
