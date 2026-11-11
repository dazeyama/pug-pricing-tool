// The in-progress walk-in printout (decision 579): the Buy tab's list as it stands, one sheet for both the
// customer's offer and staff's check. A row per line as added, each card at what we'd pay in Cash and in Credit at
// its own rate; the foot with the card count and the Cash and Credit offers as the list's totals have them. Only
// the list's own prices: nothing fetched, matched, saved or logged. Pure: the lines and rates come in.

import { payout } from './money.js';
import { lineRate, rateTotals } from './rates.js';
import { bulkItem, cardCounts, countText, isBulk, isPlaceholder, placeholderBody } from './bulk.js';
import { lineTags } from './lineFormat.js';
import { magicTreatmentLabel } from './printings.js';
import { printedTreatments } from './auditPrint.js';
import { showsNoPrice } from './unpriced.js';

/** The sheet's title: a buy has no number before CONFIRM BUY. */
export const QUOTE_TITLE = 'Buy in progress, not confirmed';
/** On the sheet's top and every page's foot. */
export const QUOTE_NOTE = 'Quote only, not a receipt';

const FINISH_WORDS ={ foil: 'Foil', etched: 'Etched', holo: 'Holo', reverse: 'Reverse' };

/**
 * One line as a row: its count, name (with what tells the printing apart: treatments, 1st Ed, JP, a pattern),
 * set, number, finish and condition, and what we'd pay for one card (a bulk line: one item) in Cash and in
 * Credit, each at the card's own rate and rounded down as the Price screen shows it; null with no price.
 * @param {object} line  a buy_lines row
 * @param {object} rates  the list's rates, as the totals take them
 */
export function quoteRow(line, rates) {
  const r = lineRate(line, rates);
  const price = showsNoPrice(line) ? null : Number(line.unit_price);
  const pay = (pct) => (price == null ? null : payout(price, pct));
  const base = { qty: Number(line.quantity), cash: pay(r.cash), credit: pay(r.credit) };
  if (isPlaceholder(line)) {
    return { ...base, name: placeholderBody(line), set: '', number: '', finish: '', condition: line.condition || 'NM' };
  }
  if (isBulk(line)) {
    const item = bulkItem(line.bulk_kind);
    const name = item ? `${item.per.toLocaleString('en-US')} ${item.unit}` : line.name;
    return { ...base, name, set: '', number: '', finish: '', condition: '' };
  }
  const extras = line.game === 'mtg'
    ? printedTreatments(line.treatments).map(magicTreatmentLabel)
    : lineTags({ ...line, condition: 'NM' });
  const name = line.name_en || line.name;
  return {
    ...base,
    name: extras.length ? `${name} (${extras.join(', ')})` : name,
    set: String(line.set_code ?? '').toUpperCase(),
    number: String(line.collector_number ?? ''),
    finish: FINISH_WORDS[line.finish] ?? '',
    condition: line.condition || 'NM',
  };
}

/**
 * The sheet's rows and foot. Rows in the order added (the list as it came, whatever order the screen shows);
 * the foot's offers are the list's totals ("as the screen has them"), with no subtotal of the rows.
 * @param {object[]} lines  the walk-in's lines, as added
 * @param {object} rates
 * @returns {{ rows: ReturnType<typeof quoteRow>[], count: string, cash: number|null, credit: number|null }}
 */
export function quoteSheet(lines, rates) {
  const live = (lines ?? []).filter((l) => !l.struck_at);
  const priced = live.filter((l) => !showsNoPrice(l));
  const t = rateTotals(priced, rates);
  return {
    rows: live.map((l) => quoteRow(l, rates)),
    count: countText(cardCounts(live)),
    cash: priced.length ? t.cash : null,
    credit: priced.length ? t.credit : null,
  };
}

/** The file's name: "buy-in-progress-2026-11-10-1425.pdf", by the time it was printed. */
export function quoteFileName(at = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `buy-in-progress-${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}.pdf`;
}
