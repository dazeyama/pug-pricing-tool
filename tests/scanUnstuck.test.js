import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTimeout, withTimeout } from '../src/lib/timeout.js';
import { createTransport } from '../src/lib/transport.js';
import { resolveText } from '../src/scan/resolve.js';

// The scanner stuck on "Reading…" (owner, 2026-10-18): nothing waits for good.

test('withTimeout: the answer in time, a TimeoutError after it', async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 50), 7);
  await assert.rejects(withTimeout(new Promise(() => {}), 20), (e) => isTimeout(e));
});

/** A fetch that never answers, until its signal gives up on it. */
function silentFetch(calls) {
  return (url, { signal } = {}) => {
    calls.push(url);
    return new Promise((_, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
  };
}

test('a request with no answer is tried again, then given up; the queue goes on', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = silentFetch(calls);
  try {
    const t = createTransport({ spacingMs: 0, tries: 2, timeoutMs: 30 });
    await assert.rejects(t.request('https://x.test/stalled'), (e) => e.name === 'UnavailableError');
    assert.equal(calls.length, 2, 'tried twice');
    // The next request in the same queue isn't held behind the stalled one.
    globalThis.fetch = async () => new Response('{"ok":1}', { status: 200 });
    assert.deepEqual(await t.getJson('https://x.test/next'), { ok: 1 });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the caller's own give-up still rejects as AbortError, not retried", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = silentFetch(calls);
  try {
    const t = createTransport({ spacingMs: 0, tries: 3, timeoutMs: 5_000 });
    const stop = new AbortController();
    const asked = t.request('https://x.test/a', { signal: stop.signal });
    setTimeout(() => stop.abort(), 10);
    await assert.rejects(asked, (e) => e.name === 'AbortError');
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

const KNOWN = new Set(['HOB']);
const card = (id, set, number, rarity, artist) => ({
  id, set, collector_number: number, rarity, artist, lang: 'en', name: id,
});
const GIANT = card('giant', 'hob', '113', 'rare', 'Miklós Ligeti');

test("Scan card's quick try: the direct lookup alone, never a search", async () => {
  const asked = [];
  const search = async (q) => {
    asked.push(q);
    return [GIANT];
  };
  const lookup = async (set, number) => (set.toLowerCase() === 'hob' && number === '113' ? GIANT : null);
  const found = await resolveText('R 0113\nHOB • EN ⟿ MIKLOS LIGETI 2026', KNOWN, { quickOnly: true, search, lookup });
  assert.equal(found.card.id, 'giant');
  assert.equal(found.quick, true);
  // A digit lost: the quick way can't confirm it, and no search is asked (the thorough run does that).
  assert.equal(await resolveText('R 013\nHOB • EN ⟿ MIKLOS LIGETI 2026', KNOWN, { quickOnly: true, search, lookup }), null);
  assert.equal(asked.length, 0);
});
