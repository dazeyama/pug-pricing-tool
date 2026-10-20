import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allPages, inChunks } from '../src/lib/inChunks.js';

// A server that holds `total` rows and returns at most `cap` per request, as the hosted API's Max rows does.
const server = (total, cap) => {
  const asked = [];
  const rows = Array.from({ length: total }, (_, i) => ({ i }));
  const build = async (from, to) => {
    asked.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { build, asked };
};

// Decision 346: a big export's candidates ran past the API's row limit.
test('reads every page, past the server\'s row limit', async () => {
  const { build, asked } = server(2500, 1000);
  const { data, error } = await allPages(build);
  assert.equal(error, null);
  assert.equal(data.length, 2500);
  assert.equal(data[2499].i, 2499);
  assert.deepEqual(asked, [[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]]);
});

test('a server limit smaller than the page still reads everything', async () => {
  const { build } = server(1234, 300);
  const { data } = await allPages(build, 1000);
  assert.equal(data.length, 1234);
  assert.deepEqual(data.map((r) => r.i), Array.from({ length: 1234 }, (_, i) => i));
});

// Decision 373: a read that asks for its count stops without the empty request.
test('a read with its count stops once it has them all, under any server limit', async () => {
  const counted = (total, cap) => {
    const s = server(total, cap);
    return { ...s, build: async (from, to) => ({ ...(await s.build(from, to)), count: total }) };
  };
  const small = counted(40, 1000);
  assert.equal((await allPages(small.build)).data.length, 40);
  assert.deepEqual(small.asked, [[0, 999]], 'one request, not two');
  const big = counted(2500, 1000);
  assert.equal((await allPages(big.build)).data.length, 2500);
  assert.deepEqual(big.asked, [[0, 999], [1000, 1999], [2000, 2999]]);
  const capped = counted(1234, 300);
  assert.deepEqual((await allPages(capped.build, 1000)).data.map((r) => r.i), Array.from({ length: 1234 }, (_, i) => i));
  assert.equal(capped.asked.length, 5);
});

test('stops at an error, and an empty read is one request', async () => {
  let calls = 0;
  const failing = await allPages(async () => {
    calls += 1;
    return calls === 2 ? { data: null, error: { message: 'timeout' } } : { data: [{}], error: null };
  });
  assert.equal(failing.data, null);
  assert.equal(failing.error.message, 'timeout');
  const { build, asked } = server(0, 1000);
  assert.deepEqual((await allPages(build)).data, []);
  assert.equal(asked.length, 1);
});

test('reads many values in chunks and returns the rows together', async () => {
  const parts = [];
  const values = Array.from({ length: 837 }, (_, i) => `key ${i}`);
  const { data, error } = await inChunks(async (part) => {
    parts.push(part.length);
    return { data: part.map((v) => ({ v })), error: null };
  }, values, 40);
  assert.equal(error, null);
  assert.deepEqual(parts, [...Array(20).fill(40), 37]);
  assert.equal(data.length, 837);
  assert.equal(data[836].v, 'key 836');
});

test('stops at the first error', async () => {
  let calls = 0;
  const { data, error } = await inChunks(async () => {
    calls += 1;
    return calls === 2 ? { data: null, error: { message: 'Bad Request' } } : { data: [{}], error: null };
  }, Array(250).fill('x'));
  assert.equal(data, null);
  assert.equal(error.message, 'Bad Request');
  assert.equal(calls, 2);
});

test('no values, no request', async () => {
  let calls = 0;
  const { data, error } = await inChunks(async () => {
    calls += 1;
    return { data: [], error: null };
  }, []);
  assert.deepEqual(data, []);
  assert.equal(error, null);
  assert.equal(calls, 0);
});
