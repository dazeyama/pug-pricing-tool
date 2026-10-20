// Rules a day page and its buy panels share (FABLE_REPORT C2).
import { customSkuForDay, withoutRestamps } from '../../lib/massCreate.js';

export const COMPLETED_LOCK = 'Completed (exported): its ⋯ → Mark Paid/Ours again, or the whole day\u2019s (⋯ next to EXPORT), to change it';
// A buy marked Completed from its own ⋯, not exported (owner, 2026-10-02).
export const MARKED_LOCK = 'Completed (marked by hand, not exported): its ⋯ → Mark Paid/Ours again to change it';
/** Was this line Completed by hand (Mark as completed), not by an export? */
export const markedByHand = (l) => Boolean(l.completed_at) && l.cc_status == null;
/**
 * A Magic card Mark as completed struck (decision 295: struck_at = completed_at). Undoing an export
 * leaves it Completed (decision 340): only its buy's own Mark Paid/Ours again brings it back.
 */
export const struckByCompletion = (l) => l.struck_at != null && l.struck_at === l.completed_at;

/**
 * The day's own export, for "Download the same file again" (decision 361): the exported cards
 * stamped with the day's Custom SKU, not a single buy's ("101626-42") nor a later Can't upload
 * export's (stamped the day it ran). A day exported before migration 0071 was stamped the day its
 * export ran: then its exported cards with no buy number. Either way, not the cards a Can't upload
 * cards export stamped, by their stamp's time (`restamped`, decision 372): one that ran on the
 * day itself carries the day's code.
 * @param {Set<string>} [restamped]  stamp times of Can't upload cards exports (ccExport.js restampTimes)
 * @returns {{ lines: object[], skus: string[] }}
 */
export function dayExportLines(lines, day, restamped = new Set()) {
  const exported = withoutRestamps(lines, restamped);
  const sku = customSkuForDay(day);
  const own = exported.filter((l) => l.cc_custom_sku === sku);
  if (own.length) return { lines: own, skus: [sku] };
  const old = exported.filter((l) => l.cc_custom_sku && !l.cc_custom_sku.includes('-'));
  return { lines: old, skus: [...new Set(old.map((l) => l.cc_custom_sku))] };
}
