import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DB_LIMIT_MS, LONG_LIMIT_MS, limitFor, timedFetch } from '../src/lib/timedFetch.js';

// Every request to Supabase ends in time (decision 388).

const BASE = 'https://psucrzljraxeootwnltf.supabase.co';

test('a table read or an ordinary write has the database limit', () => {
  assert.equal(limitFor(`${BASE}/rest/v1/buys?select=*&status=eq.draft`), DB_LIMIT_MS);
  assert.equal(limitFor(`${BASE}/rest/v1/rpc/draft_add_line`), DB_LIMIT_MS);
  assert.equal(limitFor(`${BASE}/auth/v1/token?grant_type=refresh_token`), DB_LIMIT_MS);
});

test('the price function, files and the calls that carry a whole backup or file have the long one', () => {
  assert.equal(limitFor(`${BASE}/functions/v1/prices`), LONG_LIMIT_MS);
  assert.equal(limitFor(`${BASE}/storage/v1/object/inventory/x.csv.gz`), LONG_LIMIT_MS);
  for (const fn of ['restore_backup', 'backup_export', 'cc_products_load', 'collection_import', 'project_import', 'export_lines']) {
    assert.equal(limitFor(`${BASE}/rest/v1/rpc/${fn}`), LONG_LIMIT_MS, fn);
  }
  // Only the call itself: a name like it in a query string doesn't count.
  assert.equal(limitFor(`${BASE}/rest/v1/events?action=eq.restore_backup`), DB_LIMIT_MS);
});

test('timedFetch hands fetch a signal, and keeps the caller\'s own', async () => {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input, init) => {
    seen.push(init.signal);
    return { ok: true };
  };
  try {
    await timedFetch(`${BASE}/rest/v1/rpc/draft_add_line`, { method: 'POST' });
    assert.ok(seen[0] instanceof AbortSignal);
    const mine = new AbortController();
    await timedFetch(`${BASE}/rest/v1/buys`, { signal: mine.signal });
    mine.abort();
    assert.equal(seen[1].aborted, true, 'aborting the caller\'s signal aborts the request');
  } finally {
    globalThis.fetch = real;
  }
});
