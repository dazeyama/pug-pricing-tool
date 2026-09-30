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

/** "Aug 17, 2026" */
export function formatShortDate(when) {
  return formatInTimeZone(when, STORE_TZ, 'MMM d, yyyy');
}

/**
 * "Today 3:12 PM", "Yesterday 9:05 AM", else "Aug 14, 2026" (spec 9.1's
 * Last edited), by the store's calendar.
 */
export function formatRecent(when, now = new Date()) {
  const day = (d) => formatInTimeZone(d, STORE_TZ, 'yyyy-MM-dd');
  const then = day(when);
  if (then === day(now)) return `Today ${formatTime(when)}`;
  if (then === day(new Date(new Date(now).getTime() - 86_400_000))) return `Yesterday ${formatTime(when)}`;
  return formatShortDate(when);
}

/** "just now", "3 minutes ago", "2 hours ago", "3 days ago". */
export function timeAgo(when, now = Date.now()) {
  const minutes = Math.floor((now - new Date(when).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** The next 00:00 UTC (when JustTCG's daily allowance resets), as a Date. */
export function nextUtcMidnight(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** "20260817-154210", for file names. */
export function fileStamp(when) {
  return formatInTimeZone(when, STORE_TZ, 'yyyyMMdd-HHmmss');
}
