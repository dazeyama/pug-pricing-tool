// A time limit on every request to Supabase (decision 388). postgrest-js has none of its own, so
// on flaky wifi a request whose answer never came hung for as long as the browser let it: the
// screen stayed "Saving…" and nothing could be pressed. Now it ends as a lost answer, which every
// write already handles (CONFIRM BUY's read-back, the export's, a write's request id).

/** A database call: the database itself stops a statement after 8 s. */
export const DB_LIMIT_MS = 30_000;
/** Uploads, downloads, the price function, and the calls that carry a whole backup or file. */
export const LONG_LIMIT_MS = 120_000;
const LONG_CALLS = new Set([
  'restore_backup', 'backup_export', 'cc_products_load', 'collection_import', 'project_import', 'export_lines',
]);

/**
 * How long a request to this address may take.
 * @param {string} url
 * @returns {number} milliseconds
 */
export function limitFor(url) {
  const path = String(url ?? '').split('?')[0];
  if (/\/(functions|storage)\/v1\//.test(path)) return LONG_LIMIT_MS;
  const rpc = path.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
  return rpc && LONG_CALLS.has(rpc[1]) ? LONG_LIMIT_MS : DB_LIMIT_MS;
}

/** The caller's own signal and the time limit together, where the browser can join them. */
function limited(signal, ms) {
  const limit = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : null;
  if (!limit) return signal;
  if (!signal) return limit;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, limit]) : signal;
}

/** `fetch`, with the time limit for its address: the Supabase client's own fetch. */
export function timedFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url ?? String(input ?? '');
  return fetch(input, { ...init, signal: limited(init.signal, limitFor(url)) });
}
