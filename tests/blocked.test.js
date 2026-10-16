import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstReason } from '../src/lib/blocked.js';

// Why a button can't be used now (FABLE_REPORT B8).

test('the first reason that applies, in order', () => {
  assert.equal(firstReason([[false, 'Pick a user first'], [true, 'No connection'], [true, 'Loading']]), 'No connection');
  assert.equal(firstReason([[0, 'a'], [null, 'b'], ['yes', 'c']]), 'c');
});

test('none applies: null', () => {
  assert.equal(firstReason([[false, 'a'], [undefined, 'b']]), null);
  assert.equal(firstReason([]), null);
});

test('a reason left out with && is skipped', () => {
  const system = false;
  assert.equal(firstReason([system && [true, 'only on Can\'t upload cards'], [true, 'No cards']]), 'No cards');
});
