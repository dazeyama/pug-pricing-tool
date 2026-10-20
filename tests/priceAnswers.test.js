import { test } from 'node:test';
import assert from 'node:assert/strict';
import { didNotAnswer, keepAnswers } from '../src/lib/priceAnswers.js';

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

// Decision 368: a 429's or 502's partial results are kept like a good reply's, answers only.
test('only answers are kept: a price, a real no match; not a failed search or batch', () => {
  const at = '2026-10-19T10:00:00Z';
  const asked = [search, { key: 'mtg:scryfall:a' }, { key: 'mtg:scryfall:b' }, { key: 'mtg:scryfall:c' }];
  const got = {
    [search.key]: { card: null, fetchedAt: null },                   // its search errored
    'mtg:scryfall:a': { card: { id: 'a' }, fetchedAt: at },          // priced
    'mtg:scryfall:b': { card: null, fetchedAt: at },                 // no match, remembered
    'mtg:scryfall:c': { card: null, fetchedAt: null, failed: true }, // a batch reply with no card list
  };
  const cache = new Map();
  assert.equal(keepAnswers(got, asked, cache), true);
  assert.deepEqual([...cache.keys()], ['mtg:scryfall:a', 'mtg:scryfall:b']);
});

test('nothing unanswered, or no results at all (a 502 before anything was looked up)', () => {
  const cache = new Map();
  assert.equal(keepAnswers({ k: { card: { id: 'k' }, fetchedAt: 'x' } }, [{ key: 'k' }], cache), false);
  assert.equal(cache.size, 1);
  assert.equal(keepAnswers(undefined, [{ key: 'k' }], new Map()), false);
});
