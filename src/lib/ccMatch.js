// Matching a Magic buy line to one Crystal Commerce product (export spec 7):
// first its set → CC Category, then the product within that category, by the
// name CC would use (in CC's exact order) and the evidence on each candidate.
// Pure functions: the data comes in, so the tests run under Node.

import { nameKey } from './normalize.js';
import { normNumber } from './query.js';
import { isEtchedKind } from './ccNames.js';

/**
 * Is a remembered product link to be used (decision 486)? Only a person's pick: an 'auto' row (written before
 * the app stopped remembering its own matches, or restored from an old backup) is ignored.
 * @param {{ source?: string }|null} link  a cc_product_links row
 */
export const usableLink = (link) => link?.source === 'staff';

/**
 * What an exported match remembers (export_learn): 'staff' for a person's pick, nothing for one the app made by
 * itself, which it makes again next time (decision 486).
 * @param {'staff'|'link'|'match'|string|null} by  how the export dialog's line was matched
 */
export const linkToSave = (by) => (by === 'staff' ? 'staff' : null);

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
  // Mystery Booster's retail foils (owner, 2026-10-14): filed with Mystery Booster's other cards.
  fmb1: 'Mystery Booster',
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

/**
 * Is a line always staff's choice (decision 574)? A Secret Lair card (the SLD set, or a category named Secret Lair)
 * never matches by itself: "too difficult to be auto match" (owner, 2026-10-27). A remembered pick still applies.
 * @param {{ code?: string }|null} set  the line's set
 * @param {string|null} category  categoryFor's answer
 */
export const alwaysChoose = (set, category) => String(set?.code ?? '').toLowerCase() === 'sld'
  || fold(category).includes('secretlair');

// Categories the store keeps as one (owner, 2026-10-14): The List's cards
// and Mystery Booster's are shelved together, so a card in either is filed
// under either ("Eldrazi Monument (PLST) CMA-216" is in Mystery Booster).
const SAME_SHELF = [['The List', 'Mystery Booster']];

/**
 * Where a line's products are looked for: its own category first, then any
 * the store keeps as the same one (The List ↔ Mystery Booster), where the
 * inventory has them. No category: [null], every category.
 * @param {string|null} category  categoryFor's answer
 * @param {Map<string, string>} categories  folded category → the category exactly
 * @returns {(string|null)[]}
 */
export function searchCategories(category, categories) {
  if (!category) return [null];
  const shelf = SAME_SHELF.find((g) => g.some((c) => fold(c) === fold(category))) ?? [];
  const others = shelf.filter((c) => fold(c) !== fold(category)).map((c) => categories.get(fold(c))).filter(Boolean);
  return [category, ...others];
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

// The variant families, in the order CC writes them (export spec 7.4; decisions 484–485). Each has `name`, how CC
// writes it; `re`, the test that a CC variant word shows it; and `words`, its own spellings in CC's names. What a
// variant word says beyond its families' spellings is an extra word ("Anime Borderless": Anime; "Showcase
// Scrolls": Scrolls), which tells another printing apart and which no family explains.
// `evidence` families come only from the card's Scryfall facts (evidenceTreatments), one way: a product's word for
// one is read as that family only when the card has it. A card without the tag may simply be missing it on
// Scryfall, so for it the word stays an extra word and the product is never set aside on it. A family that
// `joins` another is written with it as one word ("Showcase Scrolls", "Borderless Poster").
const FAMILIES = [
  { key: 'prerelease', name: 'Prerelease Promo', re: /pre-?release/i, words: /pre-?release( promos?)?/gi },
  { key: 'promopack', name: 'Promo Pack', re: /promo pack/i, words: /promo pack/gi },
  { key: 'thelist', name: 'The List', re: /^the list$/i, words: /the list/gi },
  { key: 'extendedart', name: 'Extended Art', re: /extended art/i, words: /extended art/gi },
  { key: 'borderless', name: 'Borderless', re: /borderless/i, words: /borderless/gi },
  { key: 'poster', name: 'Borderless Poster', joins: 'borderless', re: /\bposter\b/i, words: /\bposter\b/gi, evidence: true },
  { key: 'showcase', name: 'Showcase', re: /showcase/i, words: /showcase/gi },
  { key: 'scroll', name: 'Showcase Scrolls', joins: 'showcase', re: /\bscrolls?\b/i, words: /\bscrolls?\b/gi, evidence: true },
  // An English card's frame (owner, 2026-10-16), not a Japanese printing.
  { key: 'japanshowcase', name: 'Japan Showcase', joins: 'showcase', re: /\bjapan showcase\b/i, words: /\bjapan\b/gi, evidence: true },
  { key: 'retro', name: 'Retro Frame', re: /retro (frame|schematic)/i, words: /retro( frame)?/gi },
  // A Brothers' War Retro Artifacts schematic (decision 516): "Retro Schematic", one word with Retro Frame. Known
  // for sure from the card's number (evidenceTreatments), so an ordinary family: a plain retro card sets it aside.
  { key: 'schematic', name: 'Retro Schematic', joins: 'retro', re: /\bschematic\b/i, words: /\bschematic\b/gi },
  { key: 'futureframe', name: 'Future Frame', re: /future (sight )?frame/i, words: /future (sight )?frame/gi, evidence: true },
  { key: 'whiteborder', name: 'White Border', re: /white border/i, words: /white border(ed)?/gi, evidence: true },
  { key: 'fullart', name: 'Full Art', re: /full art/i, words: /full art/gi },
  { key: 'serialized', name: 'Serialized', re: /serial/i, words: /serial( numbered|ized)?/gi },
  { key: 'buyabox', name: 'Buy-a-Box Promo', re: /buy-a-box/i, words: /buy-a-box( promos?)?/gi },
  { key: 'bundle', name: 'Bundle Promo', re: /bundle/i, words: /bundle( promo)?/gi },
  { key: 'textless', name: 'Textless', re: /textless/i, words: /textless/gi },
  // A Japanese printing (owner, 2026-10-16): "Japanese Alternate Art", "Japanese", "(JP Exclusive)".
  { key: 'japanese', name: 'Japanese', re: /japanese|\bjp\b/i, words: /(japanese|\bjp\b)( alternate art)?/gi },
  // A Phyrexian-language printing (decision 512): "Elesh Norn, Mother of Machines - Phyrexian". Scryfall's language
  // says it surely, so not an evidence family. (CC writes no word for the Dwarven and Elvish ones.)
  { key: 'phyrexian', name: 'Phyrexian', re: /\bphyrexian\b/i, words: /\bphyrexian\b/gi },
];
const FAMILY = new Map(FAMILIES.map((f) => [f.key, f]));
/** A printing's language families: a product without the card's language is another printing (decisions 269, 512). */
const LANGUAGE_FAMILIES = ['japanese', 'phyrexian'];

/**
 * A Brothers' War Retro Artifacts schematic (decision 516): Scryfall marks nothing for one, so its number says it,
 * 64–126 and the serialized 64z–126z (1–63 are the plain retro frame).
 */
const isSchematic = (card) => String(card?.set ?? '').toLowerCase() === 'brr' && parseInt(card?.collector_number, 10) >= 64;

/** Magic's later reprints in an old look (Mystery Booster 2's): CC names their frame or border; the originals' it doesn't. */
const LATER_REPRINT_FROM = '2008-01-01';

/**
 * The evidence families a printing has, from its Scryfall card (decision 485): the facts the app keeps no
 * treatment for, which CC writes as words beside a family ("Showcase Scrolls", "Borderless Poster").
 * @param {object|null} card  a Scryfall card
 * @returns {string[]}
 */
export function evidenceTreatments(card) {
  if (!card) return [];
  const promos = card.promo_types ?? [];
  const later = (card.released_at ?? '') >= LATER_REPRINT_FROM;
  return [
    isSchematic(card) && 'schematic',
    promos.includes('scroll') && 'scroll',
    promos.includes('poster') && 'poster',
    promos.includes('japanshowcase') && 'japanshowcase',
    card.frame === 'future' && later && 'futureframe',
    card.border_color === 'white' && later && 'whiteborder',
  ].filter(Boolean);
}

/** Our line's variant families, in CC's order. */
export function lineFamilies(line) {
  const t = new Set(line.treatments ?? []);
  if (String(line.set_code ?? '').toLowerCase() === 'plst') t.add('thelist');
  return FAMILIES.filter((f) => t.has(f.key)).map((f) => f.key);
}

/** The families a word is read for: every ordinary one; of the evidence families, all (`true`) or those listed. */
const readable = (evidence) => FAMILIES.filter((f) => !f.evidence || evidence === true
  || (Array.isArray(evidence) && evidence.includes(f.key)));

/**
 * The families a CC variant word shows ("Borderless Showcase" → borderless, showcase); none → other. The evidence
 * families only as `evidence` says: true for all, or the list of those the card has.
 */
export function wordFamilies(word, { evidence = false } = {}) {
  return readable(evidence).filter((f) => f.re.test(word)).map((f) => f.key);
}

/** A variant word's extra words: what's left once its families' own spellings are taken out ("Anime Borderless" → Anime). */
export function extraWords(word, { evidence = false } = {}) {
  let rest = String(word ?? '');
  for (const f of readable(evidence)) if (f.re.test(word)) rest = rest.replace(f.words, ' ');
  return rest.split(/[\s()]+/).filter((w) => /[a-z0-9]/i.test(w));
}

const isNumberBracket = (bracket) => bracket != null && /^\d+[a-z★]*$/i.test(bracket);
/** The prefix of a List card's number ("CMA-216" → cma), which CC writes as a set code in brackets. */
const numberPrefix = (line) => /^([a-z0-9]+)-/i.exec(String(line.collector_number ?? ''))?.[1]?.toLowerCase() ?? null;

/**
 * How a product reads for a line: the families its variant words show, the extra words beside them, the words
 * with no family at all, each word on its own. A bracket that is neither a number nor our set code ("(A)",
 * "(Full Art)") reads as a variant word. A flavor-named product's first word is the card's name, not a variant.
 * The evidence families are read only for those the line has (its treatments carry evidenceTreatments).
 * @returns {{ families: Set<string>, extra: string[], other: string[], plain: boolean,
 *   words: { word: string, bracket: boolean, families: string[], extra: string[] }[] }}
 */
export function readVariant(cand, line, { flavor = null } = {}) {
  const evidence = lineFamilies(line).filter((k) => FAMILY.get(k).evidence);
  const variants = [...(cand.variants ?? [])];
  if (flavor && variants.length && fold(variants[0]) === fold(line.name)) variants.shift();   // "Flavor - Name"
  const list = variants.map((word) => ({ word, bracket: false }));
  const b = cand.bracket;
  if (b != null && !isNumberBracket(b) && String(b).toLowerCase() !== numberPrefix(line)) list.push({ word: b, bracket: true });
  const families = new Set();
  const extra = [];
  const other = [];
  const words = list.map(({ word, bracket }) => {
    const fams = wordFamilies(word, { evidence });
    const more = fams.length ? extraWords(word, { evidence }) : [];
    for (const f of fams) families.add(f);
    if (fams.length) extra.push(...more);
    else if (bracket) extra.push(word);
    else other.push(word);
    return { word, bracket, families: fams, extra: more };
  });
  return { families, extra, other, plain: !list.length, words };
}

/**
 * The name CC would most likely use, in CC's order (export spec 7.4):
 * <name>[ (<number>)][ - <foil kind>][ - <variants…>].
 * @param {object} line  name, collector_number, finish, treatments, set_code
 * @param {{ number?: boolean|string, flavor?: string|null }} [opts]  number: true for the card's collector number,
 *   or the number as CC spells it ("0342")
 */
export function expectedName(line, { number = false, flavor = null } = {}) {
  const parts = [flavor ? `${flavor} - ${line.name}` : line.name];
  if (number) parts[0] += ` (${number === true ? line.collector_number : number})`;
  const foil = expectedFoilKind(line.finish, line.treatments);
  if (foil) parts.push(foil);
  const keys = lineFamilies(line);
  for (const key of keys) {
    // A family CC writes as one word with another: that word, in the other's place.
    if (keys.some((k) => FAMILY.get(k).joins === key)) continue;
    parts.push(FAMILY.get(key).name);
  }
  return parts.join(' - ');
}

// What an extra word costs a product: more than one of our families earns (+3), so "Anime Borderless" never
// outranks the plain product for a borderless card (decision 485).
const EXTRA_WORD = 4;

/**
 * Score one candidate product for a line (export spec 7.4, step 3). Returns
 * null when it fails a required check (finish, collector number). The score
 * only orders the candidates: chooseProduct decides whether one is certain.
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
  const prefix = numberPrefix(line);
  if (isNumberBracket(bracket)) {
    if (normNumber(bracket) !== normNumber(line.collector_number)) return null;
    score += 5;
    reasons.push('number');
  } else if (bracket != null) {
    // A set code (The List's "(PAGL)"): matches the card number's prefix when it has one; another set code is
    // another printing. Any other bracket is read with the variant words below.
    if (prefix && prefix === String(bracket).toLowerCase()) score += 3;
    else if (prefix) {
      score -= EXTRA_WORD;
      reasons.push('other printing');
    }
  }
  // A named special foil that's ours scores above plain Foil.
  const wantFoil = expectedFoilKind(line.finish, line.treatments);
  if (kind && wantFoil && fold(kind) === fold(wantFoil)) {
    score += 2;
  } else if (kind && wantFoil) {
    score -= 1;
  }
  // Variants: ours found +3 each; theirs we can't explain −2 (a family) or −1 (another word); a word with an
  // extra word beside its family (or a bracket that isn't ours) −4.
  const read = readVariant(cand, line, { flavor });
  for (const w of read.words) {
    if (w.bracket && prefix) continue;   // charged above as another printing's set code
    if (w.extra.length || (w.bracket && !w.families.length)) {
      score -= EXTRA_WORD;
      reasons.push(`extra: ${w.word}`);
    } else if (!w.families.length) {
      score -= 1;
      reasons.push(`other: ${w.word}`);
    }
  }
  const ours = new Set(lineFamilies(line));
  for (const f of ours) {
    if (read.families.has(f)) score += 3;
    else score -= 1;
  }
  for (const f of read.families) if (!ours.has(f)) score -= 2;
  if (fold(cand.product_name) === fold(expected)) {
    score += 100;
    reasons.push('exact');
  }
  return { score, reasons };
}

/**
 * Pick a line's product from its candidates (export spec 7.4, 7.1 rule 4; decision 484, "never guess"):
 * 'auto' only when the product is certain, 'choose' when staff must pick, 'none' when there are no candidates
 * at all. Certain means, among the products that pass the finish and number checks (in the line's own category
 * when it has any: `home`, when candidates also come from one kept as the same, searchCategories):
 *  - the evidence first thins them: when one carries our collector number, the unnumbered ones are other
 *    printings; a set code in brackets that isn't our number's prefix is another printing;
 *  - one product is left; or, setting aside every product that is clearly another printing (it shows a trait
 *    the card hasn't, it lacks the card's Japanese or Phyrexian, or it has the same words in another foil kind), one is left;
 *  - or the leader shows only the card's traits, in its foil kind, and every other product left shows strictly
 *    fewer of the leader's words (plain ⊂ "Showcase" ⊂ a borderless showcase card: the fullest is taken).
 * A word the matcher can't read (an extra word, "Anime", "Scrolls"; or one with no family, "Gold-Stamped
 * Signature") never sets a product aside, so it blocks the last rule; and a product carrying one is never taken
 * by itself. The scores only order the candidates, so Needs a choice lists the likeliest first.
 * @param {object} line  its treatments may carry its Scryfall card's evidence families (evidenceTreatments)
 * @param {object[]} candidates  cc_products rows for the line's name
 * @param {{ flavor?: string|null, home?: string|null }} [opts]
 * @returns {{ status: 'auto'|'choose'|'none', product: object|null, ranked: object[], expected: string }}
 */
export function chooseProduct(line, candidates, { flavor = null, home = null } = {}) {
  const lineKey = nameKey(line.name);
  // Flavor-named products ("Aggro Amalgam - Voracious Hydra") count when the first suffix is our name.
  let own = (candidates ?? []).filter((c) => c.base_key === lineKey
    || (flavor && c.base_key === nameKey(flavor) && fold(c.variants?.[0]) === fold(line.name)));
  // A two-part card CC lists by its front only (a Kamigawa flip card,
  // "Homura, Human Ascendant"), when nothing has the full name: CC's name is the front's.
  let named = line;
  if (!own.length && line.name.includes(' // ')) {
    const front = nameKey(frontFace(line.name));
    own = (candidates ?? []).filter((c) => c.base_key === front);
    named = { ...line, name: frontFace(line.name) };
  }
  const useFlavor = flavor && own.some((c) => c.base_key === nameKey(flavor)) ? flavor : null;
  // The number is in CC's name only when a product carries ours ("Fabricate (2090)"), as CC spells it.
  const ourNumber = own.find((c) => isNumberBracket(c.bracket) && normNumber(c.bracket) === normNumber(line.collector_number));
  const expected = expectedName(named, { number: ourNumber?.bracket ?? false, flavor: useFlavor });
  if (!own.length) return { status: 'none', product: null, ranked: [], expected };
  const want = { expected, flavor: useFlavor };
  const byScore = (a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.product.product_name.localeCompare(b.product.product_name);
  const ranked = own
    .map((product) => {
      const s = scoreCandidate(named, product, want);
      if (s && home && product.category !== home) {
        s.score -= 2;
        s.reasons.push('other category');
      }
      return { product, ...(s ?? { score: null, reasons: [] }) };
    })
    .sort(byScore);
  // When CC lists one with our collector number in brackets, the ones with no
  // number are other printings (an older Secret Lair drop of the same card).
  const numbered = ranked.some((r) => r.reasons?.includes('number'));
  if (numbered) {
    for (const r of ranked) {
      if (r.score != null && !r.reasons.includes('number')) r.score -= 4;
    }
    ranked.sort(byScore);
  }
  const product = certainProduct(named, ranked, { home, numbered, flavor: useFlavor });
  if (product) return { status: 'auto', product, ranked, expected };
  return { status: 'choose', product: null, ranked, expected };
}

/** chooseProduct's "never guess" rule: the one certain product among the ranked candidates, or null. */
function certainProduct(line, ranked, { home, numbered, flavor }) {
  const passing = ranked.filter((r) => r.score != null);
  const inHome = home ? passing.filter((r) => r.product.category === home) : [];
  const pool = (inHome.length ? inHome : passing)
    .filter((r) => !(numbered && !r.reasons.includes('number')) && !r.reasons.includes('other printing'))
    .map((r) => ({ r, v: readVariant(r.product, line, { flavor }) }));
  const mine = new Set(lineFamilies(line));
  const wantFoil = fold(expectedFoilKind(line.finish, line.treatments) ?? '');
  const unread = ({ v }) => v.extra.length > 0 || v.other.length > 0;
  const ourFoil = ({ r }) => !r.product.foil_kind || fold(r.product.foil_kind) === wantFoil;
  const clearlyOther = (x) => [...x.v.families].some((f) => !mine.has(f))
    || LANGUAGE_FAMILIES.some((f) => mine.has(f) && !x.v.families.has(f))
    || (!unread(x) && !ourFoil(x));
  let pick = null;
  if (pool.length === 1) pick = pool[0];
  else {
    const left = pool.filter((x) => !clearlyOther(x));
    const [lead, ...rest] = left;
    if (left.length === 1) pick = lead;
    else if (lead && !unread(lead) && ourFoil(lead) && [...lead.v.families].every((f) => mine.has(f))
      && rest.every((x) => !unread(x) && [...x.v.families].every((f) => lead.v.families.has(f))
        && x.v.families.size < lead.v.families.size)) pick = lead;
  }
  return pick && !unread(pick) ? pick.r.product : null;
}
