// A buy line as plain text, Moxfield-style (spec 8.9):
//   <qty> <name> (<SET>) <number>[ <finish marker>][ [<tags>]]
// e.g. "2 Sol Ring (CMR) 472 *E*", "1 Pikachu (SV2a) 025 *RH* [MP, JP, Poké Ball]".
// Japanese cards show their English name when the line has one (name_en,
// owner 2026-09-29), else the Japanese name TCGdex gave.
// Used by the buy list, the changelog (confirm_buy stores these) and later
// the day pages and export. A bulk line reads in the cards it stands for:
// "1,000 MTG Bulk commons/uncommons" (docs/TEAM_FEEDBACK.md 5.5); a
// placeholder by its name: "1 Team Rocket's, Meowth 117 [Placeholder]".
import { bulkItem, bulkLineText, isBulk, isPlaceholder, placeholderBody } from './bulk.js';

const FINISH_MARKERS = { foil: '*F*', etched: '*E*', holo: '*H*', reverse: '*RH*' };
const PATTERNS = { 'pokeball-pattern': 'Poké Ball', 'masterball-pattern': 'Master Ball' };
const SHADOWLESS = ['shadowless', 'shadowless-red-cheek'];

/** "cosmos-pattern" → "Cosmos" (a reverse pattern without a set name). */
function patternName(treatment) {
  return PATTERNS[treatment]
    ?? treatment.replace(/-pattern$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The bracket's tags, only non-defaults, in the spec's order: condition (not
 * NM), 1st Ed, SL (Shadowless, not 1st Edition), JP, reverse pattern,
 * then a TCGplayer-only version's name.
 * @returns {string[]}
 */
export function lineTags(line) {
  const treatments = line.treatments ?? [];
  const tags = [];
  if (line.condition && line.condition !== 'NM') tags.push(line.condition);
  if (line.first_edition) tags.push('1st Ed');
  else if (treatments.some((t) => SHADOWLESS.includes(t))) tags.push('SL');
  if (line.lang === 'ja') tags.push('JP');
  if (line.finish === 'reverse') {
    for (const t of treatments) if (t.endsWith('-pattern')) tags.push(patternName(t));
  }
  // A TCGplayer-only version or listing (owner, 2026-10-09): "Cosmos Holo", "30th Celebration".
  for (const t of treatments) if (t.startsWith('variant:')) tags.push(t.slice('variant:'.length));
  return tags;
}

/**
 * The line without its quantity: "Sol Ring (CMR) 472 *E* [LP]" (the day
 * pages' tables give the quantity its own column, spec 10.2).
 * @param {{ name: string, name_en?: string|null, set_code: string, collector_number: string,
 *   finish: string, condition?: string, first_edition?: boolean, lang?: string,
 *   treatments?: string[] }} line  a buy_lines row
 */
export function lineBody(line) {
  if (isPlaceholder(line)) return placeholderBody(line);
  if (isBulk(line)) return bulkItem(line.bulk_kind)?.unit ?? line.name;
  const parts = [`${line.name_en || line.name} (${line.set_code}) ${line.collector_number}`];
  const marker = FINISH_MARKERS[line.finish];
  if (marker) parts.push(marker);
  const tags = lineTags(line);
  if (tags.length) parts.push(`[${tags.join(', ')}]`);
  return parts.join(' ');
}

/**
 * @param {{ quantity: number } & Parameters<typeof lineBody>[0]} line  a buy_lines row
 * @param {number} [quantity]  a different count to show (e.g. how many are being removed)
 */
export function lineText(line, quantity = line.quantity) {
  if (isBulk(line)) return bulkLineText(line, quantity);
  return `${quantity} ${lineBody(line)}`;
}

/**
 * The line with its condition always in the brackets, NM too, first:
 * "1 Fabricate (SLD) 123 [NM]", "2 Pikachu (SV2a) 025 [LP, JP]". The header
 * search's results show cards this way (owner, 2026-09-30).
 * @param {Parameters<typeof lineText>[0]} line
 * @param {number} [quantity]
 */
export function lineTextWithCondition(line, quantity = line.quantity) {
  if (isBulk(line)) return bulkLineText(line, quantity);
  const parts = [`${quantity} ${line.name_en || line.name} (${line.set_code}) ${line.collector_number}`];
  const marker = FINISH_MARKERS[line.finish];
  if (marker) parts.push(marker);
  parts.push(`[${[line.condition || 'NM', ...lineTags({ ...line, condition: 'NM' })].join(', ')}]`);
  return parts.join(' ');
}
