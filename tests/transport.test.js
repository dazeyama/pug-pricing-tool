import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../src/lib/transport.js';

// A background fill's queued request jumps the queue once a search waits on it.
test('promote moves a queued low-priority request ahead of the rest', async () => {
  const order = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    order.push(url.split('/').pop());
    await new Promise((r) => setTimeout(r, 5));
    return new Response('{}', { status: 200 });
  };
  try {
    const t = createTransport({ spacingMs: 0 });
    const low = ['a', 'b', 'c', 'd'].map((x) => t.request(`https://x.test/${x}`, { priority: 'low' }));
    t.promote('https://x.test/d');
    await Promise.all(low);
    // "a" was already being fetched; "d" goes next, ahead of "b" and "c".
    assert.deepEqual(order, ['a', 'd', 'b', 'c']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// A 429 is told apart from silence, and the queue slows down after it (owner, 2026-10-09).
test('a 429 marks the failure as limited and widens the spacing for a while', async () => {
  const realFetch = globalThis.fetch;
  const starts = [];
  let calls = 0;
  globalThis.fetch = async () => {
    starts.push(Date.now());
    calls += 1;
    return calls === 1
      ? new Response('{}', { status: 429, headers: { 'Retry-After': '0' } })
      : new Response('{}', { status: 200 });
  };
  try {
    const t = createTransport({ spacingMs: 10, tries: 1 });
    await assert.rejects(t.request('https://x.test/a'), (e) => e.name === 'UnavailableError' && e.limited === true);
    await t.request('https://x.test/b');
    await t.request('https://x.test/c');
    // After the 429, at least 500 ms between requests instead of 10.
    assert.ok(starts[2] - starts[1] >= 480, `spacing was ${starts[2] - starts[1]} ms`);
  } finally {
    globalThis.fetch = realFetch;
  }
});
