// The audit printout (docs/TEAM_FEEDBACK.md 3): a batch's Magic cards in
// Crystal Commerce's own order, to tick off by hand before it goes up. Which
// cards, where each goes, merged and sorted. Pure: the matching comes in.

import { CONDITIONS } from './ladder.js';
import { magicTreatmentLabel } from './printings.js';
import { lineTags } from './lineFormat.js';

/** The last section: cards with no Crystal Commerce product (team plan 3.3). */
export const UNMATCHED = 'Unmatched';

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
  return pending.length ? pending : magic.filter((l) => l.cc_status === 'exported' || l.cc_status === 'cant_upload');
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
 * Where an exported line goes, from what the export saved: its category, or
 * Unmatched (null) for one sent to Can't upload. Undefined: not exported, so
 * matched now.
 * @returns {string|null|undefined}
 */
export function savedCategory(line) {
  if (line.cc_status === 'exported') return line.cc_category || null;
  if (line.cc_status === 'cant_upload') return null;
  return undefined;
}

/**
 * Where a matched card goes, asking nothing (team plan 3.3): its product's
 * category (a remembered match, or one clear product); with several products
 * to choose from, its set's category; else Unmatched (null).
 * @param {object|undefined} result  one of matchLines' results (ccExport.js)
 * @returns {string|null}
 */
export function matchCategory(result) {
  if (!result) return null;
  if (result.status === 'auto' && result.product?.category) return result.product.category;
  if (result.status === 'choose' && result.category) return result.category;
  return null;
}

/**
 * One row's parts (team plan 3.5): the name and count; its set ("2X2") and
 * collector number ("117") and condition, which the PDF lines up in chips;
 * its finish and treatments ("Foil", "Borderless"), chips after the name;
 * its colour group.
 */
export function auditRow(line, qty = line.quantity, bucket = 'unknown') {
  return {
    name: line.name_en || line.name,
    qty,
    set: String(line.set_code ?? '').toUpperCase(),
    number: String(line.collector_number ?? ''),
    condition: line.condition || 'NM',
    extras: [FINISH_WORDS[line.finish], ...(line.treatments ?? []).map(magicTreatmentLabel)].filter(Boolean),
    bucket,
  };
}

/**
 * A Pokémon row's parts, as auditRow gives a Magic card's: its finish
 * ("Holo", "Reverse") and the bracket's tags but the condition ("1st Ed",
 * "JP", a reverse pattern, a TCGplayer-only version) as its chips. No colour
 * group: the row's edge chip stays grey.
 */
export function pokemonRow(line, qty = line.quantity) {
  return {
    name: line.name_en || line.name,
    qty,
    set: String(line.set_code ?? '').toUpperCase(),
    number: String(line.collector_number ?? ''),
    condition: line.condition || 'NM',
    extras: [POKEMON_FINISH_WORDS[line.finish], ...lineTags({ ...line, condition: 'NM' })].filter(Boolean),
    bucket: 'unknown',
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
 * Inside a section (owner, 2026-10-14): the NM cards by collector number,
 * then every other condition together by collector number, the same card's
 * conditions in order down (LP, MP, HP, DMG); then name, non-foil → foil →
 * etched (team plan 3.4).
 */
function byCard(a, b) {
  const nm = (x) => ((x.line.condition || 'NM') === 'NM' ? 0 : 1);
  return nm(a) - nm(b)
    || byNumber(a.line.collector_number, b.line.collector_number)
    || rank(CONDITIONS, a.line.condition) - rank(CONDITIONS, b.line.condition)
    || collator.compare(a.line.name, b.line.name)
    || rank(FINISHES, a.line.finish) - rank(FINISHES, b.line.finish);
}

/** The set most of a section's cards are from, for the symbol on its band; none for Unmatched. */
function mainSet(list) {
  const counts = new Map();
  for (const m of list) {
    const code = String(m.line.set_code ?? '').toLowerCase();
    if (code) counts.set(code, (counts.get(code) ?? 0) + m.qty);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/**
 * The printout's sections, by category A to Z with Unmatched last; the same
 * card from different buys (printing, finish, condition, treatments) as one
 * row with the quantities added (team plan 3.2–3.5).
 * @param {{ line: object, category: string|null, bucket?: string }[]} placed
 * @returns {{ name: string, cards: number, set: string|null, rows: ReturnType<typeof auditRow>[] }[]}
 */
export function auditSections(placed) {
  // One section per category whatever its case (an older export's saved name), named as first met.
  const names = new Map();
  const merged = new Map();
  for (const { line, category, bucket } of placed) {
    const folded = (category || UNMATCHED).toLowerCase();
    if (!names.has(folded)) names.set(folded, category || UNMATCHED);
    const section = names.get(folded);
    const key = [section, line.scryfall_id ?? '', line.name, line.set_code, line.collector_number, line.finish,
      line.condition, [...(line.treatments ?? [])].sort().join(',')].join('|');
    const had = merged.get(key);
    if (had) had.qty += line.quantity;
    else merged.set(key, { section, line, qty: line.quantity, bucket: bucket ?? 'unknown' });
  }
  const bySection = new Map();
  for (const m of merged.values()) {
    if (!bySection.has(m.section)) bySection.set(m.section, []);
    bySection.get(m.section).push(m);
  }
  return [...bySection.entries()]
    .map(([name, list]) => ({
      name,
      cards: list.reduce((n, m) => n + m.qty, 0),
      set: name === UNMATCHED ? null : mainSet(list),
      rows: list.sort(byCard).map((m) => auditRow(m.line, m.qty, m.bucket)),
    }))
    .sort((a, b) => (a.name === UNMATCHED) - (b.name === UNMATCHED) || collator.compare(a.name, b.name));
}

/**
 * Print PKM?'s sections (decision 280): one per set, A to Z by the set's
 * name, its code on the band ("Scarlet & Violet [SV1]"); inside, as a Magic
 * category's rows (NM by number, then the rest), the same card from
 * different buys as one row. A set is its code (whatever its case); its
 * name as first met, the code when a line has none.
 * @param {object[]} lines  pokemonPrintLines' lines
 * @returns {{ name: string, cards: number, set: string|null, rows: ReturnType<typeof pokemonRow>[] }[]}
 */
export function pokemonSections(lines) {
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
      rows: list.sort(byCard).map((m) => pokemonRow(m.line, m.qty)),
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
