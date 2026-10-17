import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decklistText } from '../src/lib/decklist.js';

// Ctrl+Click on EXPORT copies the cards as a decklist (decision 285).

test('decklist: quantity and name only, one line per name, A to Z', () => {
  const lines = [
    { name: 'Lightning Bolt', quantity: 2, set_code: '2X2', finish: 'foil', condition: 'NM' },
    { name: 'Counterspell', quantity: 1, set_code: 'MH2' },
    { name: 'Lightning Bolt', quantity: 1, set_code: 'M10', condition: 'LP' },
  ];
  assert.deepEqual(decklistText(lines), { text: '1 Counterspell\n3 Lightning Bolt', cards: 4, names: 2 });
});

test('decklist: bulk and struck cards left out; the English name first', () => {
  const lines = [
    { name: 'ピカチュウ', name_en: 'Pikachu', quantity: 1 },
    { name: 'Bulk commons', quantity: 500, bulk_kind: 'mtg_commons' },
    { name: 'Sol Ring', quantity: 1, struck_at: '2026-10-17T12:00:00Z' },
  ];
  assert.deepEqual(decklistText(lines), { text: '1 Pikachu', cards: 1, names: 1 });
});

test('decklist: nothing to copy', () => {
  assert.deepEqual(decklistText([]), { text: '', cards: 0, names: 0 });
  assert.deepEqual(decklistText(undefined), { text: '', cards: 0, names: 0 });
});
