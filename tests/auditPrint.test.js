import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNMATCHED, auditRow, auditSections, buyOrderSections, cardBucket, matchCategory, pokemonPrintLines, pokemonRow, pokemonSections,
  priceTone, printLines, savedCategory,
} from '../src/lib/auditPrint.js';
import { magicTreatmentLabel } from '../src/lib/printings.js';

const line = (over) => ({
  id: over.id ?? Math.random().toString(36).slice(2), game: 'mtg', name: 'X', set_code: 'mom', collector_number: '1',
  finish: 'nonfoil', condition: 'NM', treatments: [], quantity: 1, scryfall_id: over.scryfall_id ?? over.name ?? 'x',
  completed_at: null, cc_status: null, ...over,
});

test('which cards print: not yet exported first; once all Completed, what the export took', () => {
  const paid = line({ name: 'A' });
  const exported = line({ name: 'B', completed_at: '2026-10-14', cc_status: 'exported', cc_category: 'Zendikar' });
  const cant = line({ name: 'C', completed_at: '2026-10-14', cc_status: 'cant_upload' });
  const byHand = line({ name: 'D', completed_at: '2026-10-14' });
  const pkm = line({ name: 'E', game: 'pokemon' });
  const bulk = line({ name: 'F', bulk_kind: 'mtg_100_common' });
  const struck = line({ name: 'G', struck_at: '2026-10-16T18:00:00Z' });
  assert.deepEqual(printLines([paid, exported, cant, byHand, pkm, bulk, struck]).map((l) => l.name), ['A']);
  assert.deepEqual(printLines([exported, cant, byHand, pkm]).map((l) => l.name), ['B', 'C']);
  assert.deepEqual(printLines([byHand]), []);
  assert.equal(savedCategory(exported), 'Zendikar');
  assert.equal(savedCategory(cant), null);
  assert.equal(savedCategory(paid), undefined);
});

test('where a matched card goes, asking nothing', () => {
  assert.equal(matchCategory({ status: 'auto', product: { category: 'Mystery Booster' }, category: 'The List' }), 'Mystery Booster');
  assert.equal(matchCategory({ status: 'choose', category: 'Commander 2015', product: null }), 'Commander 2015');
  assert.equal(matchCategory({ status: 'choose', category: null }), null);   // no category for the set
  assert.equal(matchCategory({ status: 'none', category: 'Zendikar' }), null);
  assert.equal(matchCategory(undefined), null);
});

test('sections A to Z with Unmatched last; inside, by name then collector number; the same card merged', () => {
  const placed = [
    { line: line({ name: 'Sol Ring', set_code: 'c21', collector_number: '263', quantity: 1 }), category: 'Commander 2021' },
    { line: line({ name: 'Arcane Signet', set_code: 'c21', collector_number: '236', quantity: 2 }), category: 'Commander 2021' },
    { line: line({ name: 'Sol Ring', set_code: 'c21', collector_number: '263', quantity: 3 }), category: 'Commander 2021' },
    { line: line({ name: 'Command Tower', set_code: 'c15', collector_number: '281' }), category: 'Commander 2015' },
    { line: line({ name: 'Mystery Card', set_code: 'zzz', collector_number: '9' }), category: null },
    { line: line({ name: 'Abrade', set_code: 'plst', collector_number: '2XM-120' }), category: 'Alpha' },
    { line: line({ name: 'Bolt', set_code: 'lea', collector_number: '120a' }), category: 'alpha' },
    { line: line({ name: 'Bolt', set_code: 'lea', collector_number: '12' }), category: 'Alpha' },
  ];
  const s = auditSections(placed);
  assert.deepEqual(s.map((x) => x.name), ['Alpha', 'Commander 2015', 'Commander 2021', UNMATCHED]);
  const c21 = s[2];
  assert.equal(c21.cards, 6);
  assert.deepEqual(c21.rows.map((r) => [r.name, r.qty]), [['Arcane Signet', 2], ['Sol Ring', 4]]);
  // "alpha" joins "Alpha"; by name (decision 443), then 12 before 120a.
  assert.deepEqual(s[0].rows.map((r) => `${r.name} ${r.set} ${r.number}`), ['Abrade PLST 2XM-120', 'Bolt LEA 12', 'Bolt LEA 120a']);
  assert.equal(s[3].rows[0].name, 'Mystery Card');
  // The band's symbol: the set most of its cards are from; none for Unmatched.
  assert.equal(s[0].set, 'lea');
  assert.equal(s[2].set, 'c21');
  assert.equal(s[3].set, null);
});

test('different condition, finish or treatments stay separate rows, NM before LP, non-foil before foil', () => {
  const s = auditSections([
    { line: line({ name: 'Bolt', condition: 'LP' }), category: 'Alpha' },
    { line: line({ name: 'Bolt', finish: 'foil' }), category: 'Alpha' },
    { line: line({ name: 'Bolt' }), category: 'Alpha' },
    { line: line({ name: 'Bolt', treatments: ['borderless'] }), category: 'Alpha' },
  ]);
  assert.deepEqual(s[0].rows.map((r) => [r.condition, ...r.extras].join(' ')), ['NM', 'NM Borderless', 'NM Foil', 'LP']);
});

test("inside a category (decision 443): by colour pile, A to Z, then number; a card's conditions in order down", () => {
  const s = auditSections([
    { line: line({ name: 'Zap', collector_number: '5', condition: 'MP' }), category: 'Alpha', bucket: 'red' },
    { line: line({ name: 'Bolt', collector_number: '200' }), category: 'Alpha', bucket: 'red' },
    { line: line({ name: 'Zap', collector_number: '5', condition: 'DMG' }), category: 'Alpha', bucket: 'red' },
    { line: line({ name: 'Ruby', collector_number: '3', condition: 'HP' }), category: 'Alpha', bucket: 'artifact' },
    { line: line({ name: 'Mox', collector_number: '12' }), category: 'Alpha', bucket: 'artifact' },
    { line: line({ name: 'Zap', collector_number: '5', condition: 'LP' }), category: 'Alpha', bucket: 'red' },
    { line: line({ name: 'Orb', collector_number: '1', condition: 'LP' }), category: 'Alpha', bucket: 'blue' },
    { line: line({ name: 'Bolt', collector_number: '161' }), category: 'Alpha', bucket: 'red' },
    { line: line({ name: 'Island', collector_number: '290' }), category: 'Alpha', bucket: 'land' },
    { line: line({ name: 'Plea', collector_number: '7' }), category: 'Alpha', bucket: 'white' },
    { line: line({ name: 'Unknown', collector_number: '1' }), category: 'Alpha' },
    { line: line({ name: 'Golos', collector_number: '9' }), category: 'Alpha', bucket: 'multicolor' },
  ]);
  assert.deepEqual(s[0].rows.map((r) => `${r.condition} ${r.name} ${r.number}`), [
    'NM Plea 7', 'LP Orb 1', 'NM Bolt 161', 'NM Bolt 200', 'LP Zap 5', 'MP Zap 5', 'DMG Zap 5',
    'NM Golos 9', 'NM Mox 12', 'HP Ruby 3', 'NM Island 290', 'NM Unknown 1',
  ]);
});

test('in buy order (decision 444): one bare section, a row per line as it came, nothing merged', () => {
  const s = buyOrderSections([
    { line: line({ name: 'Zap', quantity: 2 }), bucket: 'red', price: 3 },
    { line: line({ name: 'Bolt' }), bucket: 'red' },
    { line: line({ name: 'Zap' }), bucket: 'red', price: 3 },
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].bare, true);
  assert.equal(s[0].set, null);
  assert.equal(s[0].cards, 4);
  assert.deepEqual(s[0].rows.map((r) => [r.name, r.qty, r.price]), [['Zap', 2, 3], ['Bolt', 1, null], ['Zap', 1, 3]]);
  assert.deepEqual(buyOrderSections([]), []);
});

test("a card's colour group, as pull-pdf's", () => {
  assert.equal(cardBucket({ colors: ['R'], type_line: 'Instant' }), 'red');
  assert.equal(cardBucket({ colors: ['W', 'U'], type_line: 'Creature' }), 'multicolor');
  assert.equal(cardBucket({ colors: [], type_line: 'Artifact' }), 'artifact');
  assert.equal(cardBucket({ colors: [], type_line: 'Land' }), 'land');
  assert.equal(cardBucket({ colors: ['G'], type_line: 'Creature — Elf // Land' }), 'land');   // a land on either face
  assert.equal(cardBucket({ type_line: '', card_faces: [{ colors: ['B'], type_line: 'Creature' }] }), 'black');
  assert.equal(cardBucket(null), 'unknown');
});

// Decision 404's bands, at the Export rates for bulk' defaults (decision 416): red to 50¢, amber to $1.49.
test('price bands: true bulk, a $1 card, the rest', () => {
  assert.equal(priceTone(0.1), 'bulk');
  assert.equal(priceTone(0.5), 'bulk');
  assert.equal(priceTone(0.51), 'dollar');
  assert.equal(priceTone(1.49), 'dollar');
  assert.equal(priceTone(1.5), null);
  assert.equal(priceTone(null), null);
});

test("a row's words", () => {
  const r = auditRow(line({
    name: 'Lightning Bolt', set_code: '2x2', collector_number: '117', finish: 'foil', condition: 'MP',
    treatments: ['borderless', 'surgefoil'], quantity: 3,
  }), 3, 'red', 2.5);
  assert.deepEqual(r, {
    name: 'Lightning Bolt', qty: 3, set: '2X2', number: '117', condition: 'MP', extras: ['Foil', 'Borderless', 'Surge foil'],
    bucket: 'red', price: 2.5,
  });
  assert.equal(magicTreatmentLabel('extendedart'), 'Extended art');
  assert.equal(magicTreatmentLabel('promopack'), 'Promo pack stamp');
  assert.equal(magicTreatmentLabel('variant:Foil Etched'), 'Foil Etched');
  assert.equal(magicTreatmentLabel('something-new'), 'Something new');
});

// Print PKM? (decision 280): the Pokémon cards by set.
const pkm = (over) => line({
  game: 'pokemon', lang: 'en', set_code: 'sv1', set_name: 'Scarlet & Violet', finish: 'normal', tcgdex_id: 'sv1-1',
  scryfall_id: null, ...over,
});

test('Print PKM? takes the Pokémon cards, never bulk or struck, Completed or not', () => {
  const a = pkm({ name: 'A' });
  const done = pkm({ name: 'B', completed_at: '2026-10-14' });
  const bulk = pkm({ name: 'C', bulk_kind: 'pkm_100_common' });
  const struck = pkm({ name: 'D', struck_at: '2026-10-16T18:00:00Z' });
  const mtg = line({ name: 'E' });
  assert.deepEqual(pokemonPrintLines([a, done, bulk, struck, mtg]).map((l) => l.name), ['A', 'B']);
});

test('Pokémon sections: one a set, A to Z by name with the code on the band; inside by number; the same card merged', () => {
  const s = pokemonSections([
    pkm({ name: 'Pikachu', collector_number: '25', quantity: 2 }),
    pkm({ name: 'Pikachu', collector_number: '25', quantity: 1 }),
    pkm({ name: 'Mew', collector_number: '151', set_code: 'MEW', set_name: '151', tcgdex_id: 'sv3pt5-151' }),
    pkm({ name: 'Charmander', collector_number: '4', condition: 'LP' }),
    pkm({ name: 'Eevee', collector_number: '133', finish: 'reverse', treatments: ['sv-pattern'] }),
    pkm({ name: 'Nameless', set_code: 'xy', set_name: null, collector_number: '1' }),
  ]);
  assert.deepEqual(s.map((x) => [x.name, x.set, x.cards]), [['151', 'mew', 1], ['Scarlet & Violet', 'sv1', 5], ['XY', 'xy', 1]]);
  const sv = s[1];
  assert.deepEqual(sv.rows.map((r) => [r.name, r.qty, r.condition]), [['Pikachu', 3, 'NM'], ['Eevee', 1, 'NM'], ['Charmander', 1, 'LP']]);
  assert.equal(sv.rows[1].extras[0], 'Reverse');
});

test("a Pokémon row's words: the finish and the bracket's tags but the condition, as chips; no colour", () => {
  const r = pokemonRow(pkm({ name: 'Pikachu', collector_number: '25', finish: 'holo', condition: 'MP', lang: 'ja', first_edition: true }));
  assert.deepEqual([r.name, r.set, r.number, r.condition, r.extras, r.bucket], ['Pikachu', 'SV1', '25', 'MP', ['Holo', '1st Ed', 'JP'], 'unknown']);
});
