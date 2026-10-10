import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { uuid } from '../src/lib/uuid.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('a UUID v4 where randomUUID exists', () => {
  assert.match(uuid(webcrypto), V4);
});

test('a UUID v4 from getRandomValues on a page without randomUUID (http:// on the network)', () => {
  const insecure = { getRandomValues: (a) => webcrypto.getRandomValues(a) };
  const ids = new Set(Array.from({ length: 200 }, () => uuid(insecure)));
  for (const id of ids) assert.match(id, V4);
  assert.equal(ids.size, 200);
});
