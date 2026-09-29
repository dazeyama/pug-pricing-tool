// Unit tests for the search-line parser (spec 8.2). The only automated tests
// the spec asks for. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQuery, withoutGuessedSetCode, normNumber, sameNumber, numericSize, numberPrefix,
} from '../src/lib/query.js';

// Codes a game uses, for rule 1's "matches a known set code" branch.
const KNOWN = new Set(['soa', 'cmr', 'sld', 'obf', 'mew', 'ice', '2x2', 'pal', 'sv2a']);
const known = (t) => KNOWN.has(t.toLowerCase());

const cases = [
  // input                                   name                number   size    setCode  from
  ['Lightning Bolt 161/295',                 'Lightning Bolt',   '161',   '295',  null,    null],
  ['Lightning Bolt 161/295 2X2',             'Lightning Bolt',   '161',   '295',  '2X2',   'slash'],
  ['Abrade 37/291 SOA',                      'Abrade',           '37',    '291',  'SOA',   'slash'],
  ['Charizard ex 125/197 OBF',               'Charizard ex',     '125',   '197',  'OBF',   'slash'],
  ['Pikachu TG05/TG30',                      'Pikachu',          'TG05',  'TG30', null,    null],
  ['Sol Ring',                               'Sol Ring',         null,    null,   null,    null],
  ['Sol Ring CMR',                           'Sol Ring',         null,    null,   'CMR',   'known'],
  ['Sol Ring 472',                           'Sol Ring',         '472',   null,   null,    null],
  ['Abandoned Air Temple 263s',              'Abandoned Air Temple', '263s', null, null,   null],
  ['Abrade 37 SOA',                          'Abrade',           '37',    null,   'SOA',   'known'],
  ['Abrade 037/291',                         'Abrade',           '037',   '291',  null,    null],
  ['light bol',                              'light bol',        null,    null,   null,    null],
  ['  Lightning   Bolt   161/295  ',         'Lightning Bolt',   '161',   '295',  null,    null],
  ['Pikachu 25/165 SV2a',                    'Pikachu',          '25',    '165',  'SV2a',  'slash'],
  ['Pikachu SV107',                          'Pikachu',          'SV107', null,   null,    null],
  ['Sonic the Hedgehog 2087 SLD',            'Sonic the Hedgehog', '2087', null,  'SLD',   'known'],
  ['Mox Pearl 123★',                         'Mox Pearl',        '123★',  null,   null,    null],
  ['125/197',                                '',                 '125',   '197',  null,    null],
  ['125/197 OBF',                            '',                 '125',   '197',  'OBF',   'slash'],
  // A name ending in a word that is also a set code: read as a code, with a fallback.
  ['Fire // Ice',                            'Fire //',          null,    null,   'Ice',   'known'],
  ['Ancient Mew',                            'Ancient',          null,    null,   'Mew',   'known'],
  // Not a code: unknown word with no "<number>/<size>" before it.
  ['Wrath of God',                           'Wrath of God',     null,    null,   null,    null],
  // "//" is part of a split card's name, never "<number>/<size>".
  ['Fire //',                                'Fire //',          null,    null,   null,    null],
  // Names with digits inside a word stay names.
  ['Porygon2',                               'Porygon2',         null,    null,   null,    null],
  ['Mewtwo GX',                              'Mewtwo GX',        null,    null,   null,    null],
  ['',                                       '',                 null,    null,   null,    null],
];

for (const [input, name, number, size, setCode, setCodeFrom] of cases) {
  test(`parseQuery(${JSON.stringify(input)})`, () => {
    assert.deepEqual(parseQuery(input, known), { name, number, size, setCode, setCodeFrom });
  });
}

test('withoutGuessedSetCode gives the plain reading for a guessed code', () => {
  const input = 'Fire // Ice';
  assert.deepEqual(withoutGuessedSetCode(input, parseQuery(input, known)), {
    name: 'Fire // Ice', number: null, size: null, setCode: null, setCodeFrom: null,
  });
  const sure = 'Abrade 37/291 SOA';
  assert.equal(withoutGuessedSetCode(sure, parseQuery(sure, known)), null);
});

test('numbers compare without case or leading zeros', () => {
  assert.equal(normNumber('037'), '37');
  assert.equal(normNumber('TG05'), 'tg5');
  assert.equal(normNumber('0'), '0');
  assert.equal(normNumber('263s'), '263s');
  assert.ok(sameNumber('037', '37'));
  assert.ok(sameNumber('tg05', 'TG5'));
  assert.ok(!sameNumber('125', '12'));
  assert.ok(!sameNumber('', ''));
});

test('only plain sizes are numeric', () => {
  assert.equal(numericSize('295'), 295);
  assert.equal(numericSize('TG30'), null);
  assert.equal(numericSize(null), null);
  assert.equal(numberPrefix('TG05'), 'tg');
  assert.equal(numberPrefix('125'), '');
});
