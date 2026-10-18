import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTimeout, withTimeout } from '../src/lib/timeout.js';
import { createTransport } from '../src/lib/transport.js';

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

test("a request's own limit wins over its queue's (Scryfall's searches wait longer than its lookups)", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = silentFetch(calls);
  try {
    const t = createTransport({ spacingMs: 0, tries: 1, timeoutMs: 60_000 });
    const began = Date.now();
    await assert.rejects(t.request('https://x.test/slow', { timeoutMs: 30 }), (e) => e.name === 'UnavailableError');
    assert.ok(Date.now() - began < 5_000, 'gave up on its own 30 ms, not the minute its queue allows');
  } finally {
    globalThis.fetch = realFetch;
  }
});
