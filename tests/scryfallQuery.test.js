import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberTerm } from '../src/lib/scryfall.js';

// Owner, 2026-10-13: "High Perfect 229" finds the promo pack 229p too.
test('a plain collector number also asks for its promo pack "p" printing', () => {
  assert.equal(numberTerm('229'), '(cn:"229" or cn:"229p")');
  assert.equal(numberTerm(' 7 '), '(cn:"7" or cn:"7p")');
  // Anything else as typed.
  assert.equal(numberTerm('229p'), 'cn:"229p"');
  assert.equal(numberTerm('229s'), 'cn:"229s"');
  assert.equal(numberTerm('TG05'), 'cn:"TG05"');
  assert.equal(numberTerm('22"9'), '(cn:"229" or cn:"229p")');     // a stray quote is dropped
  assert.equal(numberTerm(''), null);
  assert.equal(numberTerm(null), null);
});
