import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditSections, flagBanner, flaggedBuys } from '../src/lib/auditPrint.js';

// Flagged buys on the Magic printout (owner, 2026-10-18; decision 301).

const line = (id, buy) => ({
  id, buy_id: buy, name: 'Lightning Bolt', set_code: '2x2', collector_number: '117', finish: 'nonfoil',
  condition: 'NM', quantity: 1, treatments: [],
});

test("a flagged buy's card stays its own row, carrying its buy", () => {
  const placed = [
    { line: line('a', 'b1'), category: 'Double Masters 2022', bucket: 'red', flag: 'Buy 42' },
    { line: line('b', 'b2'), category: 'Double Masters 2022', bucket: 'red', flag: null },
    { line: line('c', 'b3'), category: 'Double Masters 2022', bucket: 'red', flag: null },
  ];
  const [section] = auditSections(placed);
  assert.equal(section.cards, 3);
  assert.deepEqual(section.rows.map((r) => [r.qty, r.flag]).sort(), [[1, 'Buy 42'], [2, null]]);
});

test('the banner names the flagged buys, in order', () => {
  assert.deepEqual(flaggedBuys([null, 'Buy 45', 'Buy 42', 'Buy 45']), ['Buy 42', 'Buy 45']);
  assert.equal(flagBanner([], true), null);
  assert.equal(flagBanner(['Buy 42'], false), "CHECK CONDITION: Buy 42 is flagged. Check every card's condition before export.");
  assert.equal(flagBanner(['Buy 42', 'Buy 45'], true),
    "CHECK CONDITION: Buys 42 and 45 are flagged. Their cards are outlined in red.");
  assert.match(flagBanner(['Buy 9', 'Buy 10', 'Buy 11'], true), /^CHECK CONDITION: Buys 9, 10 and 11 are flagged\./);
  assert.deepEqual(flaggedBuys(['Buy 10', 'Buy 9']), ['Buy 9', 'Buy 10']);
});

test("a Pokémon printout keeps a flagged buy's card apart too", async () => {
  const { pokemonSections } = await import('../src/lib/auditPrint.js');
  const pk = (id, buy) => ({
    id, buy_id: buy, game: 'pokemon', name: 'Pikachu', set_code: 'sv1', set_name: 'Scarlet & Violet',
    collector_number: '63', lang: 'en', finish: 'normal', condition: 'NM', quantity: 1, treatments: [],
  });
  const [section] = pokemonSections([pk('a', 'b1'), pk('b', 'b2'), pk('c', 'b2')], (l) => (l.buy_id === 'b1' ? 'Buy 42' : null));
  assert.equal(section.cards, 3);
  assert.deepEqual(section.rows.map((r) => [r.qty, r.flag]).sort(), [[1, 'Buy 42'], [2, null]]);
  assert.deepEqual(pokemonSections([pk('a', 'b1'), pk('b', 'b2')])[0].rows.map((r) => [r.qty, r.flag]), [[2, null]]);
});
