import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorGroup, sortLines } from '../src/lib/listSort.js';

// A buy list's order (decision 403).

const card = (colors, typeLine = 'Creature — Elf') => ({ colors, type_line: typeLine });

test('Magic piles: W, U, B, R, G, multicolor, colorless, lands', () => {
  assert.equal(colorGroup(card(['W'])), 0);
  assert.equal(colorGroup(card(['G'])), 4);
  assert.equal(colorGroup(card(['U', 'R'])), 5);
  assert.equal(colorGroup(card([], 'Artifact — Equipment')), 6);
  assert.equal(colorGroup(card([], 'Land — Forest')), 7);
  assert.equal(colorGroup(card(['G'], 'Land Creature — Forest Dryad')), 7, 'a land first, even with a color');
  assert.equal(colorGroup({ card_faces: [{ colors: ['B'], type_line: 'Creature — Vampire' }, { type_line: 'Land' }] }), 2,
    'a double-faced card by its front face');
  assert.equal(colorGroup(null), 8, 'not loaded yet: last');
});

test('as added, by price high to low, by color then A–Z', () => {
  const lines = [
    { id: 1, name: 'Llanowar Elves', unit_price: 0.5 },
    { id: 2, name: 'Counterspell', unit_price: 2 },
    { id: 3, name: 'Forest', unit_price: 0.1 },
    { id: 4, name: 'Brainstorm', unit_price: 2 },
  ];
  const cards = { 1: card(['G']), 2: card(['U']), 3: card([], 'Basic Land — Forest'), 4: card(['U']) };
  assert.deepEqual(sortLines(lines, 'added').map((l) => l.id), [1, 2, 3, 4]);
  assert.deepEqual(sortLines(lines, 'price').map((l) => l.id), [2, 4, 1, 3], 'ties keep the order added');
  assert.deepEqual(sortLines(lines, 'color', (l) => cards[l.id]).map((l) => l.id), [4, 2, 1, 3]);
});
