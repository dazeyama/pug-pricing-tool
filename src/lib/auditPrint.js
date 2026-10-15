// The audit printout (docs/TEAM_FEEDBACK.md 3): a batch's Magic cards in
// Crystal Commerce's own order, to tick off by hand before it goes up. Which
// cards, where each goes, merged and sorted. Pure: the matching comes in.

import { CONDITIONS } from './ladder.js';
import { magicTreatmentLabel } from './printings.js';

/** The last section: cards with no Crystal Commerce product (team plan 3.3). */
export const UNMATCHED = 'Unmatched';

const FINISHES = ['nonfoil', 'foil', 'etched'];
const FINISH_WORDS = { foil: 'Foil', etched: 'Etched' };

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
 * an export took (exported, or sent to Can't upload). Never bulk; never cards
 * Completed by hand, which weren't exported and won't be.
 * @param {object[]} lines  buy_lines rows
 * @returns {object[]}
 */
export function printLines(lines) {
  const magic = (lines ?? []).filter((l) => l.game === 'mtg' && !l.bulk_kind);
  const pending = magic.filter((l) => !l.completed_at);
  return pending.length ? pending : magic.filter((l) => l.cc_status === 'exported' || l.cc_status === 'cant_upload');
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
 * One row's parts (team plan 3.5): the name and count; its set and number
 * ("2X2 117") and condition, which the PDF lines up in chips; its finish and
 * treatments ("Foil", "Borderless"), chips after the name; its colour group.
 */
export function auditRow(line, qty = line.quantity, bucket = 'unknown') {
  return {
    name: line.name_en || line.name,
    qty,
    set: `${String(line.set_code ?? '').toUpperCase()} ${line.collector_number ?? ''}`.trim(),
    condition: line.condition || 'NM',
    extras: [FINISH_WORDS[line.finish], ...(line.treatments ?? []).map(magicTreatmentLabel)].filter(Boolean),
    bucket,
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
