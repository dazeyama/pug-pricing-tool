// Import Collection (owner, 2026-10-09): a Mass Create CSV (the store's
// CardBot writes them, and so does our EXPORT) read back, each row matched to
// its exact Magic printing: the export's matching run in reverse. The export
// goes printing → CC Category → product; this goes the file's Category → the
// Scryfall sets that export to it → the printings with the product's name,
// scored on the evidence in the Product Name (its bracket, foil kind and
// variants; export spec 7.2) against each printing's own traits. One clear
// printing is matched; the rest go to staff. Pure functions, so the tests
// run under Node; the data side is importCollection.js.

import { nameKey } from './normalize.js';
import { normNumber } from './query.js';
import { isEtchedKind, parseProductName } from './ccNames.js';
import { expectedFoilKind, expectedName, fold, frontFace, lineFamilies, ruleGuesses, wordFamilies } from './ccMatch.js';
import { magicTreatments } from './printings.js';

/** The columns a Mass Create file must have (Custom SKU, our export's last column, is optional). */
export const IMPORT_COLUMNS = ['Add Qty', 'Product Name', 'Category', 'Condition', 'Language', 'Sell Price'];

/**
 * TCGplayer's inventory format (CardBot's other export, owner 2026-10-09):
 * each card by its TCGplayer SKU, one condition and printing of a product.
 */
export const TCGPLAYER_COLUMNS = ['TCGplayer Id', 'Condition', 'Add to Quantity', 'TCG Marketplace Price'];

/** Which format a file's header is: 'tcgplayer' (SKUs) or 'cc' (Mass Create). */
export const fileFormat = (fields) => ((fields ?? []).some((f) => String(f).trim() === 'TCGplayer Id') ? 'tcgplayer' : 'cc');

// The condition words: the inventory's (what our export writes now, 0046),
// and the help page's, which CardBot files and our older exports use.
const CONDITIONS = {
  nearmint: 'NM',
  lightlyplayed: 'LP', lightplay: 'LP',
  moderatelyplayed: 'MP', moderateplay: 'MP',
  heavilyplayed: 'HP', heavyplay: 'HP',
  damaged: 'DMG',
};

/** "Lightly Played" (or "Light Play") → 'LP'; null for a word it doesn't know. */
export const conditionCode = (word) => CONDITIONS[fold(word)] ?? null;

/** The required columns a file's header lacks, for its format. */
export function missingColumns(fields, format = 'cc') {
  const have = new Set((fields ?? []).map((f) => String(f).trim()));
  return (format === 'tcgplayer' ? TCGPLAYER_COLUMNS : IMPORT_COLUMNS).filter((c) => !have.has(c));
}

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * The key a staff pick is remembered by: a TCGplayer row's SKU; otherwise the
 * row's category and product name, as the file has them.
 */
export const importKey = (row) => (row.sku ? `sku:${row.sku}` : `${fold(row.category)}|${collapse(row.productName)}`);

/**
 * The file's rows, read (PapaParse, header: true). Each keeps where it is in
 * the file and, when it can't be imported, why (`problem`).
 *
 * Our export prices only Near Mint (owner, 2026-10-11): a worse condition's
 * row has no Sell Price, and a 0-quantity Near Mint row sets the product's
 * price. Read back, a 0-quantity row adds no card, so it's left out (not
 * skipped either). A row with no Sell Price gets its product's Near Mint
 * price in the file × its condition's Master Fallback Percentage, the export
 * in reverse (`priceFrom` 'Near Mint'); the last NM price in the file counts,
 * as CC would end up with. With none to work from, it's priced once its
 * printing is known (rowFallbackPrice).
 * @param {object[]} records
 * @param {Record<string, number>} [pct]  Master Fallback Percentages (Magic)
 */
export function readRows(records, pct) {
  const read = (records ?? []).map((rec, index) => {
    const qtyText = String(rec['Add Qty'] ?? '').trim();
    const priceText = String(rec['Sell Price'] ?? '').replace(/[$,\s]/g, '');
    return {
      rec, index, qtyText, priceText,
      productName: String(rec['Product Name'] ?? '').trim(),
      category: String(rec.Category ?? '').trim(),
      qty: Number(qtyText),
      price: priceText === '' ? NaN : Math.round(Number(priceText) * 100) / 100,
      condition: conditionCode(rec.Condition),
    };
  });
  const nearMint = new Map();
  for (const r of read) {
    if (r.condition === 'NM' && Number.isFinite(r.price) && r.price >= 0) nearMint.set(importKey(r), r.price);
  }
  return read.filter((r) => !(r.qtyText !== '' && r.qty === 0)).map((r) => {
    const { rec, index, productName, category, qty, condition } = r;
    let { price } = r;
    let from = null;
    const nm = nearMint.get(importKey(r));
    if (r.priceText === '' && condition && condition !== 'NM' && nm != null && pct?.[condition] != null) {
      price = Math.round(nm * Number(pct[condition])) / 100;
      from = { price: nm, pct: Number(pct[condition]) };
    }
    const language = String(rec.Language ?? '').trim();
    let problem = null;
    if (!productName || !category) problem = 'No product name or category';
    else if (!Number.isInteger(qty) || qty < 1) problem = `Add Qty "${rec['Add Qty'] ?? ''}" isn't a whole number`;
    else if (r.priceText !== '' && (!Number.isFinite(price) || price < 0)) problem = `Sell Price "${r.priceText}" isn't a price`;
    else if (!condition) problem = `Condition "${rec.Condition ?? ''}" isn't one the app knows`;
    else if (language && fold(language) !== 'english') problem = `${language}: only English cards can be imported`;
    return {
      index,
      line: index + 2,                     // the file's line number (after the header)
      qty, productName, category, condition, price, problem,
      ...(from ? { priceFrom: 'Near Mint', nearMint: from } : {}),
      parsed: parseProductName(productName),
    };
  });
}

/**
 * A Mass Create row with no Sell Price and no Near Mint price to work it out
 * from, once its printing is known (owner, 2026-10-11): TCGplayer's Market
 * Price for the finish (through Scryfall) × the condition's Master Fallback
 * Percentage, the app's own fallback (DESIGN_SPEC 8.7). Null when Scryfall
 * has no price.
 */
export function rowFallbackPrice(card, finish, condition, pct) {
  const raw = { nonfoil: card?.prices?.usd, foil: card?.prices?.usd_foil, etched: card?.prices?.usd_etched }[finish];
  const usd = raw != null ? Number(raw) : NaN;
  if (!Number.isFinite(usd) || pct?.[condition] == null) return null;
  return Math.round(usd * Number(pct[condition])) / 100;
}

/**
 * A TCGplayer-format file's rows. The SKU says the card, and JustTCG says
 * which (importCollection.js); until then each is named by its SKU. A blank
 * price is allowed: JustTCG's price for the SKU is used.
 * @param {object[]} records
 */
export function readTcgplayerRows(records) {
  return (records ?? []).map((rec, index) => {
    const sku = String(rec['TCGplayer Id'] ?? '').trim();
    const qty = Number(String(rec['Add to Quantity'] ?? '').trim());
    const priceText = String(rec['TCG Marketplace Price'] ?? '').replace(/[$,\s]/g, '');
    const price = priceText === '' ? NaN : Math.round(Number(priceText) * 100) / 100;
    const condition = conditionCode(rec.Condition);
    let problem = null;
    if (!/^\d+$/.test(sku)) problem = `TCGplayer Id "${sku}" isn't a number`;
    else if (!Number.isInteger(qty) || qty < 1) problem = `Add to Quantity "${rec['Add to Quantity'] ?? ''}" isn't a whole number`;
    else if (priceText !== '' && (!Number.isFinite(price) || price < 0)) problem = `TCG Marketplace Price "${priceText}" isn't a price`;
    else if (!condition) problem = `Condition "${rec.Condition ?? ''}" isn't one the app knows`;
    return {
      index,
      line: index + 2,
      sku, qty, condition, price, problem,
      productName: `SKU ${sku}`,
      category: 'TCGplayer',
      parsed: null,
    };
  });
}

/** A JustTCG printing ("Normal", "Foil", "Etched Foil") as a Magic finish. */
export function finishOfPrinting(printing) {
  const p = String(printing ?? '').toLowerCase();
  if (p.includes('etched')) return 'etched';
  return p.includes('foil') ? 'foil' : 'nonfoil';
}

/** The finish a product's foil kind says: none → non-foil, "… Etched" → etched, any other foil → foil. */
export function finishOf(parsed) {
  if (!parsed.foilKind) return 'nonfoil';
  return isEtchedKind(parsed.foilKind) ? 'etched' : 'foil';
}

/**
 * The card names to look a row up by: its base name; and, for a Universes
 * Beyond flavor name ("Aggro Amalgam - Voracious Hydra"), the first suffix
 * as the card's name, when it isn't a variant word.
 */
export function namesFor(parsed) {
  const names = [parsed.base];
  const first = parsed.variants[0];
  if (first && !wordFamilies(first).length) names.push(first);
  return names.filter(Boolean);
}

// Sets CC files under more names than the export's rules give (seen in the
// owner's CardBot file, 2026-10-09). Scryfall merged Mystery Booster into
// The List.
const MORE_NAMES = { plst: ['Mystery Booster'] };

/**
 * Which Scryfall sets each category could hold: folded category → set codes.
 * Every name the export's rules could give a set (export spec 7.3: staff's
 * choices, the promo kinds, the same name, Appendix B), not just the first
 * the inventory has, since a file may use another ("Universes Beyond: Doctor
 * Who" as well as "Doctor Who"); then, for a category still with no set,
 * CC's looser habits: "Commander: <set>", "<set> (<CODE>)", "<set>
 * Reprints", "<main set>: <set>" ("Outlaws of Thunder Junction: Breaking
 * News"). Looser ones only fill a gap: "Commander: Modern Horizons 3" is the
 * Commander decks, not Modern Horizons 3 itself.
 * @param {object} p
 * @param {Map<string, object>} p.sets  Scryfall sets by code (loadSets)
 * @param {Map<string, string>} p.categories  folded category → the category exactly
 * @param {Map<string, string>} p.setMap  staff's choices, "code|promo" → category
 * @returns {Map<string, string[]>}
 */
export function categorySets({ sets, categories, setMap }) {
  const out = new Map();
  const loose = [];   // [folded category, set code]
  for (const set of sets.values()) {
    if (set.digital) continue;
    const code = String(set.code).toLowerCase();
    const name = String(set.name ?? '');
    const parent = set.parent_set_code ? sets.get(set.parent_set_code) ?? null : null;
    const main = parent?.name ?? name.replace(/ Promos$/, '');
    const guesses = ['', 'prerelease', 'promopack'].map((promo) => setMap?.get(`${code}|${promo}`)).filter(Boolean);
    if (set.set_type === 'promo') guesses.push(`Prerelease Promo: ${main}`, 'Pre-Release Promos', `Promo Pack: ${main}`);
    guesses.push(name, ...ruleGuesses(set, parent), ...(MORE_NAMES[code] ?? []));
    for (const guess of guesses) {
      const category = categories.get(fold(guess));
      if (category) add(out, fold(category), set.code);
    }
    const looser = [`Commander: ${name}`, `${name} (${code.toUpperCase()})`, `${name} Reprints`];
    if (parent?.name) looser.push(`${parent.name}: ${name}`);
    for (const guess of looser) {
      const category = categories.get(fold(guess));
      if (category) loose.push([fold(category), set.code]);
    }
  }
  const strict = new Set(out.keys());
  for (const [key, code] of loose) if (!strict.has(key)) add(out, key, code);
  return out;
}

function add(map, key, code) {
  if (!map.has(key)) map.set(key, []);
  if (!map.get(key).includes(code)) map.get(key).push(code);
}

// Families a category's own name shows: every card in "Promo Pack: Core Set
// 2021" is a promo pack card, whether or not its name says so.
const CATEGORY_FAMILIES = [
  ['promopack', /^promo pack/i],
  ['prerelease', /pre-?release/i],
  ['thelist', /^the list/i],
];

/**
 * A buy line's fields for a printing, as far as matching needs them.
 * @param {object} card  a Scryfall card
 * @param {string} finish
 */
export function printingLine(card, finish) {
  return {
    name: card.name,
    collector_number: card.collector_number,
    finish,
    treatments: magicTreatments(card),
    set_code: card.set,
  };
}

/**
 * How well a printing fits a row's product (the export's evidence, export
 * spec 7.4 step 3, the other way round). Null when it can't be the product:
 * a finish it isn't made in, or another collector number in brackets.
 * @param {object} row  a readRows row
 * @param {object} card  a Scryfall card
 * @returns {{ score: number, reasons: string[] } | null}
 */
export function scorePrinting(row, card) {
  const p = row.parsed;
  const finish = finishOf(p);
  if (!(card.finishes ?? []).includes(finish)) return null;
  const line = printingLine(card, finish);
  const flavor = card.flavor_name && fold(card.flavor_name) === fold(p.base) ? card.flavor_name : null;
  let score = 0;
  const reasons = [];

  // The bracket: a collector number must be this one's; a set code ("(PAGL)"
  // on The List) should be its number's prefix, or its own set.
  const numbered = p.bracket != null && /^\d+[a-z★]*$/i.test(p.bracket);
  if (numbered) {
    if (normNumber(p.bracket) !== normNumber(card.collector_number)) return null;
    score += 5;
    reasons.push('number');
  } else if (p.bracket != null) {
    const prefix = /^([a-z0-9]+)-/i.exec(String(card.collector_number ?? ''))?.[1];
    if ((prefix && fold(prefix) === fold(p.bracket)) || fold(card.set) === fold(p.bracket)) {
      score += 3;
      reasons.push('set code');
    } else {
      score -= 1;
    }
  }

  // The foil kind: a special foil named in the product wants that foil.
  const want = expectedFoilKind(finish, line.treatments);
  if (p.foilKind && want) {
    if (fold(p.foilKind) === fold(want)) score += 2;
    else score -= fold(p.foilKind) === 'foil' ? 1 : 3;
  }

  // Variants: each of the printing's families the product names +3, each it
  // doesn't −3 (CC writes what makes a printing different); each the product
  // names that the printing hasn't −2.
  const variants = [...p.variants];
  if (flavor && variants.length && fold(variants[0]) === fold(card.name)) variants.shift();   // "Flavor - Name"
  const theirs = new Set();
  for (const word of variants) for (const f of wordFamilies(word)) theirs.add(f);
  for (const [f, re] of CATEGORY_FAMILIES) if (re.test(row.category)) theirs.add(f);
  const ours = new Set(lineFamilies(line));
  for (const f of ours) score += theirs.has(f) ? 3 : -3;
  for (const f of theirs) if (!ours.has(f)) score -= 2;

  // The name CC would give this printing, exactly: the strongest evidence.
  const expected = expectedName(line, { number: numbered, flavor });
  if (collapse(expected) === collapse(row.productName)) {
    score += 100;
    reasons.push('exact');
  }
  return { score, reasons };
}

/**
 * The cards among `pool` that a row could be: by its base name (or a
 * two-part card's front), or by the card name after a flavor name.
 * @param {object} row
 * @param {object[]} pool  Scryfall cards
 */
export function cardsForRow(row, pool) {
  const p = row.parsed;
  const base = nameKey(p.base);
  const flavorName = namesFor(p)[1] ? nameKey(namesFor(p)[1]) : null;
  const seen = new Set();
  const out = [];
  for (const card of pool ?? []) {
    if (seen.has(card.id)) continue;
    const names = [card.name, frontFace(card.name), ...(card.card_faces ?? []).map((f) => f.name)].map(nameKey);
    const byName = names.includes(base);
    const byFlavor = flavorName && names.includes(flavorName) && fold(card.flavor_name) === fold(p.base);
    if (byName || byFlavor) {
      seen.add(card.id);
      out.push(card);
    }
  }
  return out;
}

/**
 * Pick a row's printing from the cards it could be: 'auto' when one fits, or
 * one leads by 2 or more (the export's rule, export spec 7.5a); 'choose' when
 * staff must pick; 'none' when no card has the name.
 * @param {object} row
 * @param {object[]} cards  cardsForRow(...)
 * @returns {{ status: 'auto'|'choose'|'none', card: object|null, finish: string,
 *   ranked: { card: object, score: number|null, reasons: string[] }[] }}
 */
export function choosePrinting(row, cards) {
  const finish = finishOf(row.parsed);
  if (!cards.length) return { status: 'none', card: null, finish, ranked: [] };
  const ranked = cards
    .map((card) => ({ card, ...(scorePrinting(row, card) ?? { score: null, reasons: [] }) }))
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity)
      || String(b.card.released_at ?? '').localeCompare(String(a.card.released_at ?? '')));
  const passing = ranked.filter((r) => r.score != null);
  if (passing.length === 1 || (passing.length > 1 && passing[0].score >= passing[1].score + 2)) {
    return { status: 'auto', card: passing[0].card, finish, ranked };
  }
  return { status: 'choose', card: null, finish, ranked };
}

/**
 * The new project's name, from the file's (owner, 2026-10-09): a CardBot
 * file ("export_crystalcommerce_1790637677.csv", or "export_tcgplayer_online_…"; its time in seconds) is
 * "CardBot import Sep 28"; any other is its name without ".csv".
 * @param {string} fileName
 * @param {(date: Date) => string} formatDay  "Sep 28"
 */
export function defaultName(fileName, formatDay) {
  // "export_crystalcommerce_…" and "export_tcgplayer_online_…" alike.
  const bot = /export_[a-z_]+?_(\d{9,})/i.exec(String(fileName ?? ''));
  if (bot) return `CardBot import ${formatDay(new Date(Number(bot[1]) * 1000))}`;
  const plain = String(fileName ?? '').replace(/\.csv$/i, '').trim();
  return (plain || `Import ${formatDay(new Date())}`).slice(0, 80);
}
