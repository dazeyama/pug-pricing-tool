// The audit printout (docs/TEAM_FEEDBACK.md 3): a batch's Magic cards in
// Crystal Commerce's own order, to tick off by hand before it goes up. Which
// cards, where each goes, merged and sorted. Pure: the matching comes in.

import { CONDITIONS } from './ladder.js';
import { magicTreatmentLabel } from './printings.js';

/** The last section: cards with no Crystal Commerce product (team plan 3.3). */
export const UNMATCHED = 'Unmatched';

const FINISHES = ['nonfoil', 'foil', 'etched'];
const FINISH_WORDS = { foil: 'Foil', etched: 'Etched' };
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

/** One row's words: the name, its count, and "2X2 117 · NM · Foil · Borderless" under it (team plan 3.5). */
export function auditRow(line, qty = line.quantity) {
  const detail = [
    `${String(line.set_code ?? '').toUpperCase()} ${line.collector_number ?? ''}`.trim(),
    line.condition || 'NM',
    FINISH_WORDS[line.finish],
    ...(line.treatments ?? []).map(magicTreatmentLabel),
  ].filter(Boolean).join(' · ');
  return { name: line.name_en || line.name, qty, condition: line.condition || 'NM', detail };
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
/** Inside a section: collector number, then name, condition NM → DMG, non-foil → foil → etched (team plan 3.4). */
function byCard(a, b) {
  return byNumber(a.line.collector_number, b.line.collector_number)
    || collator.compare(a.line.name, b.line.name)
    || rank(CONDITIONS, a.line.condition) - rank(CONDITIONS, b.line.condition)
    || rank(FINISHES, a.line.finish) - rank(FINISHES, b.line.finish);
}

/**
 * The printout's sections, by category A to Z with Unmatched last; the same
 * card from different buys (printing, finish, condition, treatments) as one
 * row with the quantities added (team plan 3.2–3.5).
 * @param {{ line: object, category: string|null }[]} placed
 * @returns {{ name: string, cards: number, rows: { name: string, qty: number, condition: string, detail: string }[] }[]}
 */
export function auditSections(placed) {
  // One section per category whatever its case (an older export's saved name), named as first met.
  const names = new Map();
  const merged = new Map();
  for (const { line, category } of placed) {
    const folded = (category || UNMATCHED).toLowerCase();
    if (!names.has(folded)) names.set(folded, category || UNMATCHED);
    const section = names.get(folded);
    const key = [section, line.scryfall_id ?? '', line.name, line.set_code, line.collector_number, line.finish,
      line.condition, [...(line.treatments ?? [])].sort().join(',')].join('|');
    const had = merged.get(key);
    if (had) had.qty += line.quantity;
    else merged.set(key, { section, line, qty: line.quantity });
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
      rows: list.sort(byCard).map((m) => auditRow(m.line, m.qty)),
    }))
    .sort((a, b) => (a.name === UNMATCHED) - (b.name === UNMATCHED) || collator.compare(a.name, b.name));
}
