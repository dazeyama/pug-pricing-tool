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
