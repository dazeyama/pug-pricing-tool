import { supabase } from './supabase.js';
import { callFunction } from './functions.js';

// TCGplayer's Magic catalog in the app (decision 588, phase 1; decision 589):the `tcgcatalog` Edge Function fetches it from
// tcgcsv.com into `tcg_groups` and `tcg_products` (migration 0017), a batch of sets a call, and this calls it until
// the pass is done. Run after each master-file upload (MasterInventoryPanel) and by Settings → Crystal Commerce
// matching's Refresh TCGplayer catalog. One pass at a time on this page: a second ask joins the one running.
// Nothing reads the catalog yet: the matcher does from phase 3.

/** The most calls one pass makes: the first run's 459 sets take about 12. */
const MAX_CALLS = 60;

let running = null;                 // the pass in progress, or null
let progress = null;                // { loaded, remaining } while one runs
const listeners = new Set();
const tell = () => listeners.forEach((fn) => fn(progress));

/**
 * Follow a pass: `fn` gets { loaded, remaining } as it goes, null when none is running.
 * @returns {() => void} unsubscribe
 */
export function onTcgCatalogProgress(fn) {
  listeners.add(fn);
  fn(progress);
  return () => listeners.delete(fn);
}

/**
 * Bring the catalog up to date: the sets tcgcsv changed since the stored copy, the recent releases and the copies
 * a month old (every set, the first time; the function's rules). A set that won't load is skipped for the rest of
 * the pass and named in the answer.
 * @returns {Promise<{ groups: number, products: number|null, checkedAt: string|null, loaded: number,
 *   skipped: { groupId: number, name: string, error: string }[] }>}  loaded: the sets fetched in all
 */
export function refreshTcgCatalog() {
  running ??= (async () => {
    let loaded = 0;
    let idle = 0;                     // calls in a row that moved nothing on
    const skipped = [];
    progress = { loaded: 0, remaining: null };
    tell();
    try {
      for (let i = 0; i < MAX_CALLS; i += 1) {
        // Its own progress on the button: no loading bar for the minutes a first fill takes.
        const r = await callFunction('tcgcatalog', { skip: skipped.map((g) => g.groupId) }, { loading: false });
        loaded += r.loaded ?? 0;
        skipped.push(...(r.skipped ?? []));
        progress = { loaded, remaining: r.remaining ?? 0 };
        tell();
        if (r.done) {
          return { groups: r.groups, products: r.products ?? null, checkedAt: r.checkedAt ?? null, loaded, skipped };
        }
        // A call that fetched and skipped nothing moved nothing on; twice in a row, the pass stops.
        idle = (r.loaded ?? 0) + (r.skipped?.length ?? 0) ? 0 : idle + 1;
        if (idle >= 2) throw new Error('the catalog stopped moving. Try again later');
      }
      throw new Error('the catalog took too many steps. Refresh again to finish it');
    } finally {
      running = null;
      progress = null;
      tell();
    }
  })();
  return running;
}

/**
 * The catalog as stored: its sets, its products and when a pass last finished, or null when it was never fetched.
 * @param {{ group_id: number, products: number, checked_at: string|null }[]} rows  `tcg_groups`
 * @returns {{ groups: number, products: number, checkedAt: string|null }|null}  checkedAt null: no pass finished yet
 */
export function catalogSummary(rows) {
  if (!rows?.length) return null;
  let products = 0;
  let checkedAt = null;              // null until a first pass finishes (a set loads unchecked)
  for (const r of rows) {
    products += Number(r.products) || 0;
    if (r.checked_at && (!checkedAt || r.checked_at > checkedAt)) checkedAt = r.checked_at;
  }
  return { groups: rows.length, products, checkedAt };
}

/** The stored catalog's summary (catalogSummary), read from `tcg_groups` (459 rows, under the API's 1,000). */
export async function tcgCatalogStatus() {
  const { data, error } = await supabase.from('tcg_groups').select('group_id, products, checked_at');
  if (error) throw new Error(error.message);   // Settings says it "couldn't be read", with this
  return catalogSummary(data);
}
