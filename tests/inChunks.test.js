import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inChunks } from '../src/lib/inChunks.js';

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
