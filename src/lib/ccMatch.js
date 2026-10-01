// Matching a Magic buy line to one Crystal Commerce product (export spec 7):
// first its set → CC Category, then the product within that category, by the
// name CC would use (in CC's exact order) and the evidence on each candidate.
// Pure functions: the data comes in, so the tests and scripts/cc-report.mjs
// run under Node.

import { nameKey } from './normalize.js';
import { normNumber } from './query.js';
import { isEtchedKind } from './ccNames.js';

/** "Homura, Human Ascendant // Homura's Essence" → "Homura, Human Ascendant". */
export const frontFace = (name) => String(name ?? '').split(' // ')[0];

/** Folded for comparing names: lower case, accents off, letters and digits only. */
export const fold = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------- sets → categories

/** Scryfall sets CC names its own way (export spec Appendix B), by set code. */
const RENAMES = {
  sld: 'Secret Lair Drop Series',
  plst: 'The List',
  lea: 'Alpha',
  leb: 'Beta',
  '2ed': 'Unlimited',
  '6ed': 'Sixth Edition',
  rav: 'Ravnica',
  cn2: 'Conspiracy 2: Take the Crown',
  gnt: 'Game Night 2018',
};

/**
 * The card's promo kind for the set map: 'prerelease', 'promopack' or ''.
 * @param {string[]} promos  the line's treatments or Scryfall's promo_types
 */
export function promoKind(promos) {
  const p = promos ?? [];
  if (p.includes('prerelease')) return 'prerelease';
  if (p.includes('promopack')) return 'promopack';
  return '';
}

/**
 * The rules' guesses for a set, best first (export spec 7.3 step 4, Appendix B).
 * @param {{ code: string, name: string, set_type?: string }} set
 * @param {{ name: string }|null} [parent]  its main set
 */
export function ruleGuesses(set, parent = null) {
  const out = [];
  const code = String(set?.code ?? '').toLowerCase();
  const name = String(set?.name ?? '');
  if (RENAMES[code]) out.push(RENAMES[code]);
  const commander = / Commander$/.exec(name) ? name.replace(/ Commander$/, '') : null;
  // CC names a set's Commander decks after the main set in full: "New Capenna
  // Commander" is "Commander: Streets of New Capenna".
  if ((commander || set?.set_type === 'commander') && parent?.name) {
    out.push(`Commander: ${parent.name}`, `Commander: Universes Beyond: ${parent.name}`);
  }
  if (commander) out.push(`Commander: ${commander}`, `Commander: Universes Beyond: ${commander}`);
  if (set?.set_type === 'commander' && !commander) out.push(`Commander: ${name}`, `Commander: Universes Beyond: ${name}`);
  const eternal = / Eternal$/.exec(name) ? name.replace(/ Eternal$/, '') : null;
  if (eternal) out.push(`${eternal}: Eternal-Legal`, `${eternal} Eternal-Legal`);
  out.push(`Universes Beyond: ${name}`);
  return out;
}

/**
 * The CC Category for a line's set (export spec 7.3), or null when nothing
 * fits (the review asks). Every answer is a category the inventory has.
 * @param {object} p
 * @param {{ code: string, name: string, set_type?: string }} p.set  the line's set
 * @param {{ name: string }|null} [p.parent]  its parent set (promo sets' main set)
 * @param {string} p.promo  promoKind(...)
 * @param {Map<string, string>} p.categories  folded category → the category exactly
 * @param {Map<string, string>} p.setMap  "code|promo" → category, staff's choices
 * @returns {{ category: string, how: 'staff'|'promo'|'name'|'rule' } | null}
 */
export function categoryFor({ set, parent = null, promo = '', categories, setMap }) {
  const has = (c) => categories.get(fold(c)) ?? null;
  const code = String(set?.code ?? '').toLowerCase();
  const staff = setMap?.get(`${code}|${promo}`);
  if (staff && has(staff)) return { category: has(staff), how: 'staff' };
  const main = parent?.name ?? String(set?.name ?? '').replace(/ Promos$/, '');
  if (promo === 'prerelease') {
    const c = has(`Prerelease Promo: ${main}`) ?? has('Pre-Release Promos');
    if (c) return { category: c, how: 'promo' };
  }
  if (promo === 'promopack') {
    const c = has(`Promo Pack: ${main}`);
    if (c) return { category: c, how: 'promo' };
  }
  const same = has(set?.name);
  if (same) return { category: same, how: 'name' };
  for (const guess of ruleGuesses(set, parent)) {
    const c = has(guess);
    if (c) return { category: c, how: 'rule' };
  }
  return null;
}

// ---------------------------------------------------------------- the product

// Named special foils (Scryfall promo_types, as the app stores them in
// treatments) → CC's foil kind.
const SPECIAL_FOILS = {
  surgefoil: 'Surge Foil', rainbowfoil: 'Rainbow Foil', galaxyfoil: 'Galaxy Foil', halofoil: 'Halo Foil',
  ripplefoil: 'Ripple Foil', fracturefoil: 'Fracture Foil', textured: 'Textured Foil', manafoil: 'Mana Foil',
  gilded: 'Gilded Foil', raisedfoil: 'Raised Foil', confettifoil: 'Confetti Foil',
  stepandcompleat: 'Step-and-Compleat Foil', doublerainbow: 'Double Rainbow Foil',
};

/** CC's foil kind for a finish: none, the special foil if the card has one, "Foil", or "Foil Etched". */
export function expectedFoilKind(finish, treatments = []) {
  if (finish === 'etched') return 'Foil Etched';
  if (finish !== 'foil') return null;
  const special = (treatments ?? []).find((t) => SPECIAL_FOILS[t]);
  return special ? SPECIAL_FOILS[special] : 'Foil';
}

// The variant families, in the order CC writes them (export spec 7.4), each
// with the CC words that show it.
const FAMILIES = [
  ['prerelease', 'Prerelease Promo', /pre-?release/i],
  ['promopack', 'Promo Pack', /promo pack/i],
  ['thelist', 'The List', /^the list$/i],
  ['extendedart', 'Extended Art', /extended art/i],
  ['borderless', 'Borderless', /borderless/i],
  ['showcase', 'Showcase', /showcase|scrolls/i],
  ['retro', 'Retro Frame', /retro (frame|schematic)/i],
  ['fullart', 'Full Art', /full art/i],
  ['serialized', 'Serialized', /serial/i],
  ['buyabox', 'Buy-a-Box Promo', /buy-a-box/i],
  ['bundle', 'Bundle Promo', /bundle/i],
  ['textless', 'Textless', /textless/i],
];

/** Our line's variant families, in CC's order. */
export function lineFamilies(line) {
  const t = new Set(line.treatments ?? []);
  if (String(line.set_code ?? '').toLowerCase() === 'plst') t.add('thelist');
  return FAMILIES.filter(([key]) => t.has(key)).map(([key]) => key);
}

/** The families a CC variant word shows ("Borderless Showcase" → borderless, showcase); none → other. */
export function wordFamilies(word) {
  return FAMILIES.filter(([, , re]) => re.test(word)).map(([key]) => key);
}

/**
 * The name CC would most likely use, in CC's order (export spec 7.4):
 * <name>[ (<number>)][ - <foil kind>][ - <variants…>].
 * @param {object} line  name, collector_number, finish, treatments, set_code
 * @param {{ number?: boolean, flavor?: string|null }} [opts]
 */
export function expectedName(line, { number = false, flavor = null } = {}) {
  const parts = [flavor ? `${flavor} - ${line.name}` : line.name];
  if (number) parts[0] += ` (${line.collector_number})`;
  const foil = expectedFoilKind(line.finish, line.treatments);
  if (foil) parts.push(foil);
  for (const key of lineFamilies(line)) parts.push(FAMILIES.find(([k]) => k === key)[1]);
  return parts.join(' - ');
}

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Score one candidate product for a line (export spec 7.4, step 3). Returns
 * null when it fails a required check (finish, collector number).
 * @param {object} line
 * @param {{ product_name: string, bracket: string|null, foil_kind: string|null, variants: string[] }} cand
 * @param {{ expected: string, flavor: string|null }} want
 */
export function scoreCandidate(line, cand, { expected, flavor }) {
  // Finish: none ↔ non-foil; Foil Etched ↔ etched; any other foil ↔ foil.
  const kind = cand.foil_kind;
  if (line.finish === 'nonfoil' && kind) return null;
  if (line.finish === 'foil' && (!kind || isEtchedKind(kind))) return null;
  if (line.finish === 'etched' && !isEtchedKind(kind)) return null;

  let score = 0;
  const reasons = [];
  // Collector number in brackets: required to match when it's a number.
  const bracket = cand.bracket;
  if (bracket != null && /^\d+[a-z★]*$/i.test(bracket)) {
    if (normNumber(bracket) !== normNumber(line.collector_number)) return null;
    score += 5;
    reasons.push('number');
  } else if (bracket != null) {
    // A set code (The List's "(PAGL)"): matches the card number's prefix when it has one.
    const prefix = /^([a-z0-9]+)-/i.exec(String(line.collector_number ?? ''))?.[1];
    if (prefix && prefix.toLowerCase() === bracket.toLowerCase()) score += 3;
    else score -= 1;
  }
  // A named special foil that's ours scores above plain Foil.
  const wantFoil = expectedFoilKind(line.finish, line.treatments);
  if (kind && wantFoil && fold(kind) === fold(wantFoil)) {
    score += 2;
  } else if (kind && wantFoil) {
    score -= 1;
  }
  // Variants: ours found +3 each; theirs we can't explain −2 (a family) or −1 (another word).
  const variants = [...(cand.variants ?? [])];
  if (flavor && variants.length && fold(variants[0]) === fold(line.name)) variants.shift();   // "Flavor - Name"
  const ours = new Set(lineFamilies(line));
  const theirs = new Set();
  for (const word of variants) {
    const fams = wordFamilies(word);
    if (!fams.length) {
      score -= 1;
      reasons.push(`other: ${word}`);
    }
    for (const f of fams) theirs.add(f);
  }
  for (const f of ours) {
    if (theirs.has(f)) score += 3;
    else score -= 1;
  }
  for (const f of theirs) if (!ours.has(f)) score -= 2;
  if (collapse(cand.product_name) === collapse(expected)) {
    score += 100;
    reasons.push('exact');
  }
  return { score, reasons };
}

/**
 * Pick a line's product from its candidates (export spec 7.4, 7.1 rule 4):
 * 'auto' when one passes the checks or one leads clearly; 'choose' when
 * staff must pick (a tie, or candidates that fail the checks); 'none' when
 * there are no candidates at all.
 * @param {object} line
 * @param {object[]} candidates  cc_products rows for the line's name
 * @param {{ flavor?: string|null }} [opts]
 * @returns {{ status: 'auto'|'choose'|'none', product: object|null, ranked: object[], expected: string }}
 */
export function chooseProduct(line, candidates, { flavor = null } = {}) {
  const lineKey = nameKey(line.name);
  // Flavor-named products ("Aggro Amalgam - Voracious Hydra") count when the first suffix is our name.
  let own = (candidates ?? []).filter((c) => c.base_key === lineKey
    || (flavor && c.base_key === nameKey(flavor) && fold(c.variants?.[0]) === fold(line.name)));
  // A two-part card CC lists by its front only (a Kamigawa flip card,
  // "Homura, Human Ascendant"), when nothing has the full name.
  if (!own.length && line.name.includes(' // ')) {
    const front = nameKey(frontFace(line.name));
    own = (candidates ?? []).filter((c) => c.base_key === front);
  }
  const useFlavor = flavor && own.some((c) => c.base_key === nameKey(flavor));
  const numbered = own.some((c) => c.bracket != null && /^\d+[a-z★]*$/i.test(c.bracket));
  const expected = expectedName(line, { number: numbered, flavor: useFlavor ? flavor : null });
  if (!own.length) return { status: 'none', product: null, ranked: [], expected };
  const ranked = own
    .map((product) => ({ product, ...(scoreCandidate(line, product, { expected, flavor: useFlavor ? flavor : null }) ?? { score: null, reasons: [] }) }))
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.product.product_name.localeCompare(b.product.product_name));
  // When CC lists one with our collector number in brackets, the ones with no
  // number are other printings (an older Secret Lair drop of the same card).
  if (ranked.some((r) => r.reasons?.includes('number'))) {
    for (const r of ranked) {
      if (r.score != null && !r.reasons.includes('number')) r.score -= 4;
    }
    ranked.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.product.product_name.localeCompare(b.product.product_name));
  }
  const passing = ranked.filter((r) => r.score != null);
  if (passing.length === 1) return { status: 'auto', product: passing[0].product, ranked, expected };
  if (passing.length > 1 && passing[0].score >= passing[1].score + 2) {
    return { status: 'auto', product: passing[0].product, ranked, expected };
  }
  return { status: 'choose', product: null, ranked, expected };
}
