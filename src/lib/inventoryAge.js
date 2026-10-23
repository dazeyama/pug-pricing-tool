// The Master Crystal Inventory's age (owner, 2026-10-22; decision 451): a reminder once the current file is
// more than a week old, as the backup reminder does for backups. The owned-copies counter (decision 448) and
// the export's matching read it, so an old file counts copies sold since and misses cards added. Pure.
import { daysSince } from './backup.js';

/** Days before the reminder: the same week as the backup reminder's. */
export const INVENTORY_REMINDER_DAYS = 7;

/**
 * Time for the reminder: the current inventory was uploaded more than a week ago. None at all is the
 * "required" banner's, not this one's.
 * @param {string|null} uploadedAt
 */
export function inventoryDue(uploadedAt, now = Date.now()) {
  const days = daysSince(uploadedAt, now);
  return days != null && days > INVENTORY_REMINDER_DAYS;
}
