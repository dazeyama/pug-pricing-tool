import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineTags, lineText, lineTextWithCondition } from '../src/lib/lineFormat.js';

const line = (over) => ({
  quantity: 1, name: 'Sol Ring', set_code: 'CMR', collector_number: '472', finish: 'nonfoil',
  condition: 'NM', first_edition: false, lang: 'en', treatments: [], ...over,
});

// The spec's examples (8.9).
test('plain non-foil NM Magic card', () => {
  assert.equal(lineText(line({ name: 'Sonic the Hedgehog', set_code: 'SLD', collector_number: '2087' })),
    '1 Sonic the Hedgehog (SLD) 2087');
});
test('foil keeps letters in the number', () => {
  assert.equal(lineText(line({ name: 'Abandoned Air Temple', set_code: 'PTLA', collector_number: '263s', finish: 'foil' })),
    '1 Abandoned Air Temple (PTLA) 263s *F*');
});
test('condition tag when not NM', () => {
  assert.equal(lineText(line({ name: 'Abrade', set_code: 'SOA', collector_number: '37', condition: 'LP' })),
    '1 Abrade (SOA) 37 [LP]');
});
test('etched with a quantity', () => {
  assert.equal(lineText(line({ quantity: 2, finish: 'etched' })), '2 Sol Ring (CMR) 472 *E*');
});
test('Pokémon holo', () => {
  assert.equal(lineText(line({ name: 'Charizard ex', set_code: 'OBF', collector_number: '125', finish: 'holo' })),
    '1 Charizard ex (OBF) 125 *H*');
});
test('reverse holo, Japanese, Poké Ball pattern, MP: tags in order', () => {
  assert.equal(lineText(line({
    name: 'Pikachu', set_code: 'SV2a', collector_number: '025', finish: 'reverse', condition: 'MP',
    lang: 'ja', treatments: ['pokeball-pattern'],
  })), '1 Pikachu (SV2a) 025 *RH* [MP, JP, Poké Ball]');
});

// Japanese cards in English (owner, 2026-09-29).
test('a Japanese card shows its English name when the line has one', () => {
  const jp = { name: 'ピカチュウ', set_code: 'SV2a', collector_number: '025', finish: 'holo', lang: 'ja' };
  assert.equal(lineText(line({ ...jp, name_en: 'Pikachu' })), '1 Pikachu (SV2a) 025 *H* [JP]');
  assert.equal(lineText(line(jp)), '1 ピカチュウ (SV2a) 025 *H* [JP]');
});

// Shadowless (owner, 2026-09-29).
test('Shadowless gets SL', () => {
  assert.equal(lineText(line({ name: 'Charizard', set_code: 'BS', collector_number: '4', finish: 'holo', treatments: ['shadowless'] })),
    '1 Charizard (BS) 4 *H* [SL]');
});
test('red-cheek Shadowless gets SL too', () => {
  assert.deepEqual(lineTags(line({ treatments: ['shadowless-red-cheek'] })), ['SL']);
});
test('1st Edition says 1st Ed, not SL as well', () => {
  assert.deepEqual(lineTags(line({ first_edition: true, treatments: ['shadowless'], condition: 'LP' })), ['LP', '1st Ed']);
});

test('a pattern only tags a reverse holo', () => {
  assert.deepEqual(lineTags(line({ finish: 'holo', treatments: ['pokeball-pattern'] })), []);
  assert.deepEqual(lineTags(line({ finish: 'reverse', treatments: ['masterball-pattern'] })), ['Master Ball']);
});
test('another quantity can be shown (removing some)', () => {
  assert.equal(lineText(line({ quantity: 3 }), 1), '1 Sol Ring (CMR) 472');
});
test('double-faced names stay whole', () => {
  assert.equal(lineText(line({ name: 'Delver of Secrets // Insectile Aberration', set_code: 'ISD', collector_number: '51' })),
    '1 Delver of Secrets // Insectile Aberration (ISD) 51');
});

// The header search's second line (owner, 2026-09-30): the condition always shows, NM too.
test('with its condition: NM in brackets, other tags after it', () => {
  assert.equal(lineTextWithCondition(line({ name: 'Fabricate', set_code: 'SLD', collector_number: '123' })),
    '1 Fabricate (SLD) 123 [NM]');
  assert.equal(lineTextWithCondition(line({ finish: 'foil', condition: 'LP' }), 3), '3 Sol Ring (CMR) 472 *F* [LP]');
  assert.equal(lineTextWithCondition(line({
    name: 'ピカチュウ', name_en: 'Pikachu', set_code: 'SV2a', collector_number: '025', finish: 'reverse',
    lang: 'ja', condition: 'MP', treatments: ['pokeball-pattern'],
  })), '1 Pikachu (SV2a) 025 *RH* [MP, JP, Poké Ball]');
});
