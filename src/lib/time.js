import { formatInTimeZone } from 'date-fns-tz';

// Every "day" is the store's day (spec 4.9). The database stores UTC; all
// display goes through these helpers.
export const STORE_TZ = 'America/Los_Angeles';

/** "Sat, Aug 17, 2026" */
export function formatDate(when) {
  return formatInTimeZone(when, STORE_TZ, 'EEE, MMM d, yyyy');
}

/** "3:42 PM" */
export function formatTime(when) {
  return formatInTimeZone(when, STORE_TZ, 'h:mm a');
}

/** "Sat, Aug 17, 2026 · 3:42 PM" */
export function formatDateTime(when) {
  return `${formatDate(when)} · ${formatTime(when)}`;
}

/** "20260817-154210", for file names. */
export function fileStamp(when) {
  return formatInTimeZone(when, STORE_TZ, 'yyyyMMdd-HHmmss');
}
