// The audit printout (docs/TEAM_FEEDBACK.md 3): a batch's Magic cards in
// Crystal Commerce's own order, to tick off by hand before it goes up. Which
// cards, where each goes, merged and sorted. Pure: the matching comes in.

import { categoryFor, expectedName, expectedTreatments, fold } from './ccMatch.js';
import { exportsFileOnly, unsavedCollectionSku } from './massCreate.js';
import { CONDITIONS } from './ladder.js';
import { magicTreatmentLabel } from './printings.js';
import { lineTags } from './lineFormat.js';

/** The last section: cards with no Crystal Commerce product, or staff's to choose (team plan 3.3; decision 601). */
export const UNMATCHED = 'Unmatched';

/** The symbols' key for the star: a category with no Scryfall set of its own (decision 601; useAuditPrint.js). */
export const STAR_SYMBOL = '*';

// A printout row's price band, red or amber (decision 404), at the Settings' Export rates for bulk
// (decision 416).
export { priceTone } from './bulkCut.js';

const FINISHES = ['nonfoil', 'foil', 'etched'];
const FINISH_WORDS = { foil: 'Foil', etched: 'Etched' };
const POKEMON_FINISH_WORDS = { holo: 'Holo', reverse: 'Reverse' };

/**
 * A card's colour group, as pull-pdf sorts and tints them (owner, 2026-10-14:
 * the row's chip is the card's colour, just like pull-pdf): a land by its
 * type line (both faces'), else its colours: none → artifact (colourless),
 * several → multicolor. No Scryfall card → unknown.
 * @param {object|null|undefined} card  a Scryfall card
 * @returns {'white'|'blue'|'black'|'red'|'green'|'multicolor'|'artifact'|'land'|'unknown'}
 */
export function cardBucket(card) {
  if (!card) return 'unknown';
  const front = card.card_faces?.[0];
  const type = card.type_line || front?.type_line || '';
  if (/land/i.test(type)) return 'land';
  const colors = card.colors ?? front?.colors ?? [];
  if (!colors.length) return 'artifact';
  if (colors.length > 1) return 'multicolor';
  return { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' }[colors[0]] ?? 'multicolor';
}
// "Commander 2015" before "Commander 2021", "7" before "12" before "120a"; case and accents aside.
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/**
 * The cards a printout takes (team plan 3.2): a batch's Magic cards not yet
 * exported, as EXPORT would take them; once every one is Completed, the ones
 * an export took (exported, or sent to Can't upload). Never bulk or struck cards; never cards
 * Completed by hand, which weren't exported and won't be.
 * @param {object[]} lines  buy_lines rows
 * @returns {object[]}
 */
export function printLines(lines) {
  const magic = (lines ?? []).filter((l) => l.game === 'mtg' && !l.bulk_kind && !l.struck_at);
  const pending = magic.filter((l) => !l.completed_at);
  // A card pulled as bulk (decision 406) is printed as a Can't upload one is: under Unmatched.
  return pending.length ? pending : magic.filter((l) => ['exported', 'cant_upload', 'pulled'].includes(l.cc_status));
}

/**
 * The cards Print PKM? takes (decision 280): a batch's Pokémon cards, never
 * bulk or struck. Pokémon cards are never exported, so a Completed batch
 * prints the same cards as before.
 * @param {object[]} lines  buy_lines rows
 * @returns {object[]}
 */
export function pokemonPrintLines(lines) {
  return (lines ?? []).filter((l) => l.game === 'pokemon' && !l.bulk_kind && !l.struck_at);
}

/**
 * Where an exported line goes, from what the export saved (decision 601): its category and the product
 * name the file wrote, or Unmatched (null) for one sent to Can't upload or pulled as bulk. Undefined:
 * not exported, so matched now.
 * @returns {{ category: string, product: string|null }|null|undefined}
 */
export function savedPlace(line) {
  if (line.cc_status === 'exported') {
    return line.cc_category ? { category: line.cc_category, product: line.cc_product_name || null } : null;
  }
  if (line.cc_status === 'cant_upload' || line.cc_status === 'pulled') return null;
  return undefined;
}

/**
 * Where a matched card goes, asking nothing (team plan 3.3; decision 601): the product the export would
 * take by itself (a remembered pick, the TCGplayer route, or one clear product), in its category; a card
 * staff must choose for, or with no product, Unmatched (null): never its set's guessed category.
 * @param {object|undefined} result  one of matchLines' results (ccExport.js)
 * @returns {{ category: string, product: string }|null}
 */
export function matchPlace(result) {
  if (result?.status === 'auto' && result.product?.category) {
    return { category: result.product.category, product: result.product.product_name };
  }
  return null;
}

/**
 * Each CC category's Scryfall set, for its band's symbol (decision 601: the category's set, not its cards'
 * own; the owner: "We want to keep set symbols"): every Scryfall set's category as the export finds it
 * (categoryFor, no promo), a set named as the category first, then staff's set choices, then the rules; a
 * main set before a set with a parent; then by code.
 * @param {Map<string, object>} sets  Scryfall's sets by code (loadSets)
 * @param {Map<string, string>} categories  folded category → the category (matchContext)
 * @param {Map<string, string>} [setMap]  staff's set choices (matchContext)
 * @returns {(category: string) => string|null}  a category's set code; "Promo Pack: X" falls back to X's
 */
export function categorySets(sets, categories, setMap = new Map()) {
  const HOW = { name: 0, staff: 1, promo: 2, rule: 3 };
  const best = new Map();
  for (const set of sets.values()) {
    const parent = set.parent_set_code ? sets.get(set.parent_set_code) ?? null : null;
    const where = categoryFor({ set, parent, promo: '', categories, setMap });
    if (!where) continue;
    const key = fold(where.category);
    const rankOf = [HOW[where.how] ?? 4, parent ? 1 : 0];
    const had = best.get(key);
    const order = had ? rankOf[0] - had.rank[0] || rankOf[1] - had.rank[1] || collator.compare(set.code, had.code) : -1;
    if (order < 0) best.set(key, { code: set.code, rank: rankOf });
  }
  return (category) => {
    const own = best.get(fold(category));
    if (own) return own.code;
    const after = /^[^:]+:\s*(.+)$/.exec(String(category ?? ''));
    return (after && best.get(fold(after[1]))?.code) || null;
  };
}

/**
 * The Custom SKU on a printout's Unmatched band (decision 602): that export's own SKU with a "u", so the cards
 * can be searched for by it ("112526u", a single buy's "112526-126bu", a collection's "112526-3cu": the u last,
 * after decision 606's letter). On the printout
 * only: nothing saves it with the cards (the owner: "If this requires a migration, let's skip it.").
 * @param {string|null|undefined} sku  the export's Custom SKU
 */
export const unmatchedSku = (sku) => (sku ? `${sku}u` : null);

/** Does a collection's printout still have cards to export (so its SKU's number isn't given yet)? */
export const hasCardsToExport = (lines) => printLines(lines).some((l) => !l.cc_status);

/**
 * A collection's or project's Unmatched SKU (decision 602): "112526-#cu" (a project's "112526-#pu", decision 606)
 * while it has cards to export, its number given only when the export saves (decision 511), or a file-only one's
 * (not Paid/Ours), "112526cu" or "112526pu"; once they're all exported, the SKUs its own export stamped, each with its u: not a Can't upload cards or Bulk pulled export's restamp of a card it sent there
 * (`restamped`, decision 372, as Download the same file again leaves them out). None for one whose own export
 * stamped nothing (every card Can't upload or pulled), or when the restamps couldn't be read (`restamped` null).
 * @param {object[]} lines  its buy_lines rows
 * @param {string} todaySku  today's Custom SKU (massCreate.js customSkuFor)
 * @param {{ project: boolean, status: string }} buy  its buys row: a project or an overnight buy, and its status
 * @param {Set<string>|null} [restamped]  stamp times of Can't upload cards exports (ccExport.js restampTimes)
 */
export function collectionUnmatchedSku(lines, todaySku, buy, restamped = new Set()) {
  if (hasCardsToExport(lines)) return unmatchedSku(unsavedCollectionSku(todaySku, buy.project, exportsFileOnly(buy.status)));
  if (!restamped) return null;
  const stamped = [...new Set(printLines(lines)
    .filter((l) => l.cc_status === 'exported' && !restamped.has(l.cc_exported_at))
    .map((l) => l.cc_custom_sku).filter(Boolean))].sort();
  return stamped.length ? stamped.map(unmatchedSku).join(', ') : null;
}

/**
 * A line's treatments as a printout shows them: a showcase card is Showcase,
 * never Borderless as well (decision 508; Phyrexia: All Will Be One's showcase
 * cards are borderless on Scryfall). The Price screen keeps both.
 */
export function printedTreatments(treatments) {
  const keys = treatments ?? [];
  return keys.includes('showcase') ? keys.filter((k) => k !== 'borderless') : keys;
}

/**
 * One row's parts (team plan 3.5): the name and count; its set ("2X2") and
 * collector number ("117") and condition, which the PDF lines up in chips;
 * its finish and treatments ("Foil", "Borderless"), chips after the name;
 * its colour group; its market price today, a card's (decision 404), or null.
 */
export function auditRow(line, qty = line.quantity, bucket = 'unknown', price = null) {
  return {
    name: line.name_en || line.name,
    qty,
    set: String(line.set_code ?? '').toUpperCase(),
    number: String(line.collector_number ?? ''),
    condition: line.condition || 'NM',
    extras: [FINISH_WORDS[line.finish], ...printedTreatments(line.treatments).map(magicTreatmentLabel)].filter(Boolean),
    bucket,
    price,
  };
}

/**
 * A CC product's row (decision 601): the product's name as the Mass Create file writes it, the count,
 * the condition, the card's colour and today's price; no set, number, finish or treatment chips (the
 * product's name says them).
 */
export function productRow(product, line, qty, bucket = 'unknown', price = null) {
  return { name: product, qty, set: '', number: '', condition: line.condition || 'NM', extras: [], bucket, price };
}

/**
 * A card with no CC product written as CC would name it (decision 604; the owner: "Fblthp, the Lost - Borderless
 * NOT Fblthp, the Lost [Borderless]"): the matcher's expected name, its foil kind then its variants in CC's words
 * and order ("Jor Kadeen, First Goldwarden - Foil - Showcase", "Journeyer's Kite - Retro Frame"), a showcase card
 * never Borderless too (decision 508); a treatment CC's names have no word for after them, as the app labels it.
 */
export function unmatchedName(line) {
  const card = { ...line, name: line.name_en || line.name, treatments: printedTreatments(line.treatments) };
  const written = expectedTreatments(card);
  const rest = card.treatments.filter((t) => !written.has(t)
    && !(card.finish !== 'foil' && /foil$/.test(t))).map(magicTreatmentLabel);
  return [expectedName(card), ...rest].join(' - ');
}

/**
 * A row for a card with no CC product (decision 604): its name as CC would write it (unmatchedName), no finish or
 * treatment chips, but its set code and collector number chip ("RVR 420"; the owner: "WAIT we need the set code
 * chip for unmatched cards"), as before decision 604.
 */
export function unmatchedRow(line, qty, bucket = 'unknown', price = null) {
  return {
    ...productRow(unmatchedName(line), line, qty, bucket, price),
    set: String(line.set_code ?? '').toUpperCase(),
    number: String(line.collector_number ?? ''),
  };
}

/**
 * A Pokémon row's parts, as auditRow gives a Magic card's: its finish
 * ("Holo", "Reverse") and the bracket's tags but the condition ("1st Ed",
 * "JP", a reverse pattern, a TCGplayer-only version) as its chips. No colour
 * group: the row's edge chip stays grey. Its market price today (decision 404), or null.
 */
export function pokemonRow(line, qty = line.quantity, price = null) {
  return {
    name: line.name_en || line.name,
    qty,
    set: String(line.set_code ?? '').toUpperCase(),
    number: String(line.collector_number ?? ''),
    condition: line.condition || 'NM',
    extras: [POKEMON_FINISH_WORDS[line.finish], ...lineTags({ ...line, condition: 'NM' })].filter(Boolean),
    bucket: 'unknown',
    price,
  };
}

/**
 * A collector number for sorting: its prefix (what comes before its last run
 * of digits: The List's "CMA-"), that number, then what follows ("a"), so
 * 7 < 12 < 120 < 120a and plain numbers come before prefixed ones.
 */
function numberKey(n) {
  const m = /^(.*?)(\d+)(\D*)$/.exec(String(n ?? ''));
  return m ? { prefix: m[1], num: Number(m[2]), suffix: m[3] } : { prefix: String(n ?? ''), num: -1, suffix: '' };
}
function byNumber(a, b) {
  const x = numberKey(a);
  const y = numberKey(b);
  return collator.compare(x.prefix, y.prefix) || x.num - y.num || collator.compare(x.suffix, y.suffix);
}

const rank = (list, v) => {
  const i = list.indexOf(v);
  return i === -1 ? list.length : i;
};
/**
 * Inside a Print PKM? set (owner, 2026-10-14; Magic's were too until decision 443): the condition first, NM, then
 * LP, MP, HP, DMG, so the printout's line falls between the NM cards and the rest and each condition sits together
 * below it (decision 597, as decision 596 for Magic); within each, by collector number, then name, non-foil → foil
 * → etched (team plan 3.4). The Pokémon stickers follow the same order (pokemonOrder).
 */
function byCard(a, b) {
  return rank(CONDITIONS, a.line.condition || 'NM') - rank(CONDITIONS, b.line.condition || 'NM')
    || byNumber(a.line.collector_number, b.line.collector_number)
    || collator.compare(a.line.name, b.line.name)
    || rank(FINISHES, a.line.finish) - rank(FINISHES, b.line.finish);
}

// The buy list's WUBRG piles (decision 403), by the row's colour chip: W, U, B, R, G, multicolor,
// colourless, lands; a card with no Scryfall card last.
const PILES = ['white', 'blue', 'black', 'red', 'green', 'multicolor', 'artifact', 'land', 'unknown'];
/**
 * Inside a Magic section: the condition first, NM, then LP, MP, HP, DMG, so the printout's line falls
 * between the NM cards and the rest (owner, 2026-10-14; decision 596: decision 443 had put it last, and the line
 * landed among mixed conditions); within each, decision 443's order: by colour pile, then name A to Z, so a
 * card's printings sit together, then collector number, then non-foil → foil → etched. Print PKM? keeps byCard.
 */
function byPile(a, b) {
  return rank(CONDITIONS, a.line.condition || 'NM') - rank(CONDITIONS, b.line.condition || 'NM')
    || rank(PILES, a.bucket) - rank(PILES, b.bucket)
    || collator.compare(a.line.name_en || a.line.name, b.line.name_en || b.line.name)
    || byNumber(a.line.collector_number, b.line.collector_number)
    || rank(FINISHES, a.line.finish) - rank(FINISHES, b.line.finish);
}

/** Inside a CC category (decision 601): NM, then LP, MP, HP, DMG; in each by colour pile, then product name. */
function byProduct(a, b) {
  return rank(CONDITIONS, a.line.condition || 'NM') - rank(CONDITIONS, b.line.condition || 'NM')
    || rank(PILES, a.bucket) - rank(PILES, b.bucket)
    || collator.compare(a.product, b.product);
}

/**
 * The printout's sections (decision 601), by CC category A to Z with Unmatched last. In a category, one
 * row per CC product and condition, its quantities added (two printings on one product as one row, at the
 * higher of their prices), named as the file names it (productRow), sorted by byProduct. Under Unmatched
 * (no product, or staff's to choose), the card as CC would name it with its set chip (unmatchedRow, decision 604),
 * the same printing from different buys (printing, finish, condition, treatments) as one row (team plan 3.2–3.5),
 * sorted by byPile.
 * @param {{ line: object, category: string|null, product?: string|null, bucket?: string, price?: number|null }[]} placed
 * @param {(category: string) => string|null} [setOf]  a category's set code, for its band's symbol (categorySets)
 * @returns {{ name: string, cards: number, set: string|null, star: boolean, rows: object[] }[]}
 */
export function auditSections(placed, setOf = () => null) {
  // One section per category whatever its case (an older export's saved name), named as first met.
  const names = new Map();
  const merged = new Map();
  for (const { line, category, product, bucket, price } of placed) {
    const folded = (category || UNMATCHED).toLowerCase();
    if (!names.has(folded)) names.set(folded, category || UNMATCHED);
    const section = names.get(folded);
    const asProduct = section !== UNMATCHED && product ? product : null;
    // A card with no product by its printing (team plan 3.2): two printings are two rows, each with its set chip.
    const key = asProduct
      ? [section, 'product', fold(asProduct), line.condition || 'NM'].join('|')
      : [section, line.scryfall_id ?? '', line.name, line.set_code, line.collector_number, line.finish,
        line.condition, [...(line.treatments ?? [])].sort().join(',')].join('|');
    const had = merged.get(key);
    if (had) {
      had.qty += line.quantity;
      if (price != null && (had.price == null || price > had.price)) had.price = price;
    } else {
      merged.set(key, { section, line, product: asProduct, qty: line.quantity, bucket: bucket ?? 'unknown', price: price ?? null });
    }
  }
  const bySection = new Map();
  for (const m of merged.values()) {
    if (!bySection.has(m.section)) bySection.set(m.section, []);
    bySection.get(m.section).push(m);
  }
  return [...bySection.entries()]
    .map(([name, list]) => {
      const set = name === UNMATCHED ? null : String(setOf(name) ?? '').toLowerCase() || null;
      const products = list.filter((m) => m.product).sort(byProduct);
      const cards = list.filter((m) => !m.product).sort(byPile);
      return {
        name,
        cards: list.reduce((n, m) => n + m.qty, 0),
        set,
        // A category with no Scryfall set of its own: the star, as a set with no symbol (useAuditPrint.js).
        star: name !== UNMATCHED && !set,
        rows: [...products.map((m) => productRow(m.product, m.line, m.qty, m.bucket, m.price)),
          ...cards.map((m) => unmatchedRow(m.line, m.qty, m.bucket, m.price))],
      };
    })
    .sort((a, b) => (a.name === UNMATCHED) - (b.name === UNMATCHED) || collator.compare(a.name, b.name));
}

/**
 * Print MTG in buy order (decision 444): one bare section, no band, a row for every line as it
 * comes (the buys in order, each buy's cards as added), nothing merged or sorted.
 * @param {{ line: object, bucket?: string, price?: number|null }[]} placed
 * @param {(line: object, qty: number, bucket: string, price: number|null) => object} [toRow]  auditRow, or pokemonRow's
 * @returns {{ name: string, cards: number, set: null, bare: true, rows: object[] }[]}
 */
export function buyOrderSections(placed, toRow = auditRow) {
  if (!placed.length) return [];
  return [{
    name: '',
    cards: placed.reduce((n, p) => n + p.line.quantity, 0),
    set: null,
    bare: true,
    rows: placed.map((p) => toRow(p.line, p.line.quantity, p.bucket ?? 'unknown', p.price ?? null)),
  }];
}

/**
 * Print PKM?'s sections (decision 280): one per set, A to Z by the set's
 * name, its code on the band ("Scarlet & Violet [SV1]"); inside, as a Magic
 * category's rows (NM by number, then the rest), the same card from
 * different buys as one row. A set is its code (whatever its case); its
 * name as first met, the code when a line has none.
 * @param {object[]} lines  pokemonPrintLines' lines
 * @param {(line: object) => number|null} [priceOf]  a card's market price today (decision 404)
 * @returns {{ name: string, cards: number, set: string|null, rows: ReturnType<typeof pokemonRow>[] }[]}
 */
export function pokemonSections(lines, priceOf = () => null) {
  const names = new Map();
  const merged = new Map();
  for (const line of lines) {
    const code = String(line.set_code ?? '').toLowerCase();
    if (!names.has(code)) names.set(code, line.set_name || code.toUpperCase() || 'No set');
    const key = [code, line.tcgdex_id ?? '', line.justtcg_card_id ?? '', line.name, line.collector_number, line.lang,
      line.finish, line.condition, Boolean(line.first_edition), [...(line.treatments ?? [])].sort().join(',')].join('|');
    const had = merged.get(key);
    if (had) had.qty += line.quantity;
    else merged.set(key, { code, line, qty: line.quantity });
  }
  const bySet = new Map();
  for (const m of merged.values()) {
    if (!bySet.has(m.code)) bySet.set(m.code, []);
    bySet.get(m.code).push(m);
  }
  return [...bySet.entries()]
    .map(([code, list]) => ({
      name: names.get(code),
      cards: list.reduce((n, m) => n + m.qty, 0),
      set: code || null,
      rows: list.sort(byCard).map((m) => pokemonRow(m.line, m.qty, priceOf(m.line))),
    }))
    .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.set ?? '', b.set ?? ''));
}

/**
 * Print PKM?'s order for the lines themselves (the stickers follow it,
 * decision 281): by set name A to Z (as pokemonSections names them), then as
 * a set's rows (NM by number, then the rest).
 * @param {object[]} lines
 * @returns {object[]}
 */
export function pokemonOrder(lines) {
  const names = new Map();
  for (const l of lines) {
    const code = String(l.set_code ?? '').toLowerCase();
    if (!names.has(code)) names.set(code, l.set_name || code.toUpperCase() || 'No set');
  }
  const nameOf = (l) => names.get(String(l.set_code ?? '').toLowerCase());
  return [...lines].sort((a, b) => collator.compare(nameOf(a), nameOf(b))
    || collator.compare(String(a.set_code ?? ''), String(b.set_code ?? ''))
    || byCard({ line: a }, { line: b }));
}

/**
 * The flagged buys a printout holds (decision 301), in order: "Buy 42",
 * "Buy 45". `flags`: each card's flagged buy, or null.
 */
export function flaggedBuys(flags) {
  return [...new Set(flags.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/** The banner's words: what's flagged, and what to do (owner, 2026-10-18: "Just the header is fine"). */
export function flagBanner(buys) {
  if (!buys.length) return null;
  const one = buys.length === 1;
  const numbers = buys.map((x) => x.replace(/^Buy /, ''));
  const names = one ? buys[0] : `Buys ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`;
  return `CHECK CONDITION: ${names} ${one ? 'is' : 'are'} flagged. Check ${one ? 'its' : 'their'} cards before export.`;
}
