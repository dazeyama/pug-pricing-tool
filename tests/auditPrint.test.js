import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNMATCHED, auditRow, auditSections, matchCategory, printLines, savedCategory } from '../src/lib/auditPrint.js';
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
  assert.deepEqual(printLines([paid, exported, cant, byHand, pkm, bulk]).map((l) => l.name), ['A']);
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

test('sections A to Z with Unmatched last; inside, by collector number; the same card merged', () => {
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
  // "alpha" joins "Alpha"; 12 before 120a; a prefixed number (The List's) after the plain ones.
  assert.deepEqual(s[0].rows.map((r) => r.detail.split(' · ')[0]), ['LEA 12', 'LEA 120a', 'PLST 2XM-120']);
  assert.equal(s[3].rows[0].name, 'Mystery Card');
});

test('different condition, finish or treatments stay separate rows, NM before LP, non-foil before foil', () => {
  const s = auditSections([
    { line: line({ name: 'Bolt', condition: 'LP' }), category: 'Alpha' },
    { line: line({ name: 'Bolt', finish: 'foil' }), category: 'Alpha' },
    { line: line({ name: 'Bolt' }), category: 'Alpha' },
    { line: line({ name: 'Bolt', treatments: ['borderless'] }), category: 'Alpha' },
  ]);
  assert.deepEqual(s[0].rows.map((r) => r.detail), [
    'MOM 1 · NM', 'MOM 1 · NM · Borderless', 'MOM 1 · NM · Foil', 'MOM 1 · LP',
  ]);
});

test('inside a category: condition first, then collector number', () => {
  const s = auditSections([
    { line: line({ name: 'Zap', collector_number: '5', condition: 'MP' }), category: 'Alpha' },
    { line: line({ name: 'Bolt', collector_number: '200' }), category: 'Alpha' },
    { line: line({ name: 'Ruby', collector_number: '3', condition: 'LP' }), category: 'Alpha' },
    { line: line({ name: 'Mox', collector_number: '12' }), category: 'Alpha' },
    { line: line({ name: 'Orb', collector_number: '1', condition: 'LP' }), category: 'Alpha' },
  ]);
  assert.deepEqual(s[0].rows.map((r) => `${r.condition} ${r.name}`), ['NM Mox', 'NM Bolt', 'LP Orb', 'LP Ruby', 'MP Zap']);
});

test("a row's words", () => {
  const r = auditRow(line({
    name: 'Lightning Bolt', set_code: '2x2', collector_number: '117', finish: 'foil', condition: 'MP',
    treatments: ['borderless', 'surgefoil'], quantity: 3,
  }));
  assert.deepEqual(r, { name: 'Lightning Bolt', qty: 3, condition: 'MP', detail: '2X2 117 · MP · Foil · Borderless · Surge foil' });
  assert.equal(magicTreatmentLabel('extendedart'), 'Extended art');
  assert.equal(magicTreatmentLabel('promopack'), 'Promo pack stamp');
  assert.equal(magicTreatmentLabel('variant:Foil Etched'), 'Foil Etched');
  assert.equal(magicTreatmentLabel('something-new'), 'Something new');
});
