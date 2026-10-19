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

// Several lanes (TCGdex's card records, owner, 2026-10-16): up to `concurrency` in flight; one by default.
test('concurrency lanes: that many requests in flight at once, one without it', async () => {
  const realFetch = globalThis.fetch;
  let inFlight = 0;
  let most = 0;
  globalThis.fetch = async () => {
    inFlight += 1;
    most = Math.max(most, inFlight);
    await new Promise((r) => setTimeout(r, 15));
    inFlight -= 1;
    return new Response('{}', { status: 200 });
  };
  try {
    const four = createTransport({ spacingMs: 0, concurrency: 4 });
    await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map((x) => four.request(`https://x.test/${x}`)));
    assert.equal(most, 4);
    most = 0;
    const one = createTransport({ spacingMs: 0 });
    await Promise.all(['a', 'b', 'c'].map((x) => one.request(`https://x.test/${x}`)));
    assert.equal(most, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// The spacing holds between starts even with lanes open: each request starts no sooner than its turn,
// the first's start plus the spacing for each before it. (Measured from the first, not between
// neighbours: a timer firing late, up to ~15 ms on Windows, shortened a neighbour gap below the
// spacing and failed this test now and then, though nothing started early. 2026-10-18.)
test('with lanes, requests still start at least the spacing apart', async () => {
  const realFetch = globalThis.fetch;
  const starts = [];
  globalThis.fetch = async () => {
    starts.push(performance.now());
    await new Promise((r) => setTimeout(r, 30));
    return new Response('{}', { status: 200 });
  };
  try {
    const t = createTransport({ spacingMs: 20, concurrency: 3 });
    await Promise.all(['a', 'b', 'c', 'd'].map((x) => t.request(`https://x.test/${x}`)));
    starts.sort((p, q) => p - q);
    // 3 ms for a timer's rounding.
    for (let i = 1; i < starts.length; i++) {
      assert.ok(starts[i] - starts[0] >= i * 20 - 3, `request ${i + 1} started ${(starts[i] - starts[0]).toFixed(1)} ms after the first`);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});
