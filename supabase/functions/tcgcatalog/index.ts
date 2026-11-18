// `tcgcatalog` Edge Function (decisions 588, 589): TCGplayer's Magic catalog, fetched from tcgcsv.com (its daily
// mirror of TCGplayer's catalog, refreshed about 20:00 UTC) into `tcg_groups` and `tcg_products` (migration 0017).
// Server-side because tcgcsv sends no CORS header. The first run fetches all 459 groups (about 112 MB of JSON), so
// one call does a batch of groups and says how many are left, and the app calls it again until none are
// (lib/tcgCatalog.js). A group's products are written in one call (tcg_group_load), so a call cut short loses
// nothing: the next one picks up there.
//
// Which groups are fetched again: one whose modifiedOn changed; and, since a group's date doesn't move when only
// its cards are edited (the Star Trek sets, 2026-11-13), a group released in the last 120 days or not yet released
// once its copy is half a day old (that includes the 34 ongoing series, The List, Secret Lair and the promos, whose
// publishedOn tcgcsv gives as the day it built the list: the sets that gain cards all the time), and any group once
// its copy is a month old, 30 to 44 days by its id, so the monthly refetch is spread over two weeks.
// A group tcgcsv won't serve is skipped for the pass and reported; a database error stops the call.
//
// POST { skip?: number[] } → { done, loaded, remaining, groups, skipped, products?, checkedAt? }
//   skip      = groups that already failed in this pass (the app keeps the list): not tried again in it
//   loaded    = groups fetched by this call; remaining = groups still to fetch after it, the skipped left out
//   skipped   = [{ groupId, name, error }]: this call's groups tcgcsv or the database refused, for the app to skip
//   done      = none left: the pass is finished (tcg_catalog_finish), with the catalog's counts and its time
// Errors: 401 not signed in; 502 { code: 'SOURCE' } when tcgcsv's list of groups can't be read.
import { adminClient, corsHeaders, json, requireStoreSession } from '../_shared/supabase.ts';

const SOURCE = 'https://tcgcsv.com/tcgplayer/1';      // category 1: Magic
const HEADERS = { 'User-Agent': 'store-catalog-sync', Accept: 'application/json' };
const PAUSE_MS = 150;                                   // between tcgcsv requests: a polite pace
const BUDGET_MS = 25_000;                               // a call's work, well inside the function's time limit
const FETCH_MS = 20_000;                                // one tcgcsv request's longest wait
const MAX_GROUPS = 40;                                  // a call's most groups, whatever the time
const DAY = 86_400_000;
const RECENT_DAYS = 120;                                // a release this recent is still being edited
const RECENT_AGE = DAY / 2;                             // … so its copy is fetched again after half a day
const MAX_AGE = 30 * DAY;                               // every copy is fetched again after a month …
const SPREAD_DAYS = 15;                                 // … plus 0 to 14 days by its group id

type Group = {
  groupId: number; name: string; abbreviation?: string | null; isSupplemental?: boolean;
  publishedOn?: string | null; modifiedOn?: string | null;
};
type Product = { productId: number; name: string; extendedData?: { name: string; value: unknown }[] };

class SourceError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A tcgcsv page as JSON: tried up to 3 times, each with a time limit; a 404 isn't tried again. */
async function get(path: string): Promise<any> {
  let last = '';
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(`${SOURCE}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(FETCH_MS) });
      if (res.ok) return await res.json();
      last = `HTTP ${res.status}`;
      if (res.status === 404) break;
    } catch (e) {
      last = String((e as Error).message ?? e);
    }
    await sleep(1000 * (i + 1));
  }
  throw new SourceError(`tcgcsv.com didn't answer for ${path} (${last})`);
}

/** A product as the table keeps it: its id, name and collector number. */
function slim(p: Product) {
  const number = p.extendedData?.find((e) => e.name === 'Number')?.value;
  return { product_id: p.productId, name: p.name, number: number == null ? null : String(number) };
}

/** Is the stored copy of a group out of date? (The rules in the header.) */
function isStale(g: Group, stored: { modified_on: string | null; fetched_at: string } | undefined, now: number) {
  if (!stored) return true;
  if ((stored.modified_on ?? null) !== (g.modifiedOn ?? null)) return true;
  const age = now - Date.parse(stored.fetched_at);
  if (!(age < MAX_AGE + (Math.abs(g.groupId) % SPREAD_DAYS) * DAY)) return true;
  // tcgcsv writes most dates without a zone ("2007-07-13T00:00:00") and some with one ("…:05.4657437Z").
  const published = g.publishedOn ?? '';
  const released = Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(published) ? published : `${published}Z`);
  const recent = !Number.isFinite(released) || released > now - RECENT_DAYS * DAY;
  return recent && !(age < RECENT_AGE);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const denied = await requireStoreSession(req);
  if (denied) return denied;
  const started = Date.now();
  const db = adminClient();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const skip = new Set<number>((Array.isArray(body?.skip) ? body.skip : []).filter(Number.isInteger));

  try {
    const list = await get('/groups');
    const groups: Group[] = (list?.results ?? [])
      .filter((g: Group) => Number.isInteger(g?.groupId) && typeof g?.name === 'string' && g.name.trim());
    if (!groups.length) throw new SourceError("tcgcsv.com's list of Magic sets came back empty");

    const { data: stored, error: readError } = await db.from('tcg_groups').select('group_id, modified_on, fetched_at');
    if (readError) throw readError;
    const known = new Map((stored ?? []).map((r) => [r.group_id as number, r]));
    const stale = groups.filter((g) => !skip.has(g.groupId) && isStale(g, known.get(g.groupId), started));

    let loaded = 0;
    const skipped: { groupId: number; name: string; error: string }[] = [];
    for (const g of stale) {
      if (loaded + skipped.length >= MAX_GROUPS || Date.now() - started > BUDGET_MS) break;
      if (loaded + skipped.length > 0) await sleep(PAUSE_MS);
      let page;
      try {
        page = await get(`/${g.groupId}/products`);
      } catch (e) {
        // A group tcgcsv won't serve is skipped for the rest of the pass, so it can't hold up the others.
        skipped.push({ groupId: g.groupId, name: g.name, error: String((e as Error).message ?? e) });
        continue;
      }
      const products = ((page?.results ?? []) as Product[])
        .filter((p) => Number.isInteger(p?.productId) && p?.name).map(slim);
      // A database error isn't the group's fault: it stops the call, and the pass with it.
      const { error } = await db.rpc('tcg_group_load', {
        p_group: {
          groupId: g.groupId, name: g.name, abbreviation: g.abbreviation ?? null,
          isSupplemental: g.isSupplemental ?? null, publishedOn: g.publishedOn ?? null, modifiedOn: g.modifiedOn ?? null,
        },
        p_products: products,
      });
      if (error) throw error;
      loaded += 1;
    }

    const remaining = stale.length - loaded - skipped.length;
    if (remaining > 0) return json({ done: false, loaded, remaining, groups: groups.length, skipped });
    const { data: finished, error: finishError } = await db.rpc('tcg_catalog_finish', {
      p_group_ids: groups.map((g) => g.groupId),
    });
    if (finishError) throw finishError;
    return json({
      done: true, loaded, remaining: 0, groups: finished?.groups ?? groups.length, skipped,
      products: finished?.products ?? null, checkedAt: finished?.checked_at ?? null,
    });
  } catch (e) {
    if (e instanceof SourceError) return json({ error: e.message, code: 'SOURCE' }, 502);
    console.error(e);
    return json({ error: `Saving the TCGplayer catalog failed: ${(e as Error).message ?? e}`, code: 'SERVER' }, 500);
  }
});
