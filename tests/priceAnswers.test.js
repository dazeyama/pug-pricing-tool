import { test } from 'node:test';
import assert from 'node:assert/strict';
import { didNotAnswer } from '../src/lib/priceAnswers.js';

// Decision 357: a failed search isn't kept as "no price" for the page's life.
const search = { key: 'pokemon:ja:x', name: 'Pikachu', number: '25' };

test('a failed name-and-number search is no answer', () => {
  assert.equal(didNotAnswer({ card: null, fetchedAt: null }, search), true);
  assert.equal(didNotAnswer({ card: null, fetchedAt: null, failed: true }, { key: 'k' }), true);
});

test('a real "no match", a price, or a lookup with nothing to search by are answers', () => {
  assert.equal(didNotAnswer({ card: null, fetchedAt: '2026-10-19T10:00:00Z' }, search), false);
  assert.equal(didNotAnswer({ card: { id: 'c' }, fetchedAt: '2026-10-19T10:00:00Z' }, search), false);
  assert.equal(didNotAnswer({ card: null, fetchedAt: null }, { key: 'pokemon:en:y', name: 'Eevee' }), false);
});
