import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pairFoils, wrapComment, generatedSource, patchModule } from '../scripts/sld-foils.mjs';

// The Secret Lair foils generator (decisions 510, 544): how TCGplayer's products pair up, and how the table is
// written into src/lib/sldFoilProducts.js without touching the rest of it.

const product = (productId, name, number) => ({ productId, name, extendedData: [{ name: 'Number', value: number }] });

test('a "(… Foil)" product pairs with the plain one of its name and number; etched, doubles and orphans left out', () => {
  const { pairs, kinds, twice, unpaired } = pairFoils([
    product(643682, 'Fabricate (2090)', '2090'),
    product(643683, 'Fabricate (2090) (Rainbow Foil)', '2090'),
    product(1, 'Abrade (2179)', '2179'),
    product(2, 'Abrade (2179) (Foil Etched)', '2179'),      // an etched printing's own product already
    product(3, 'Opt (1)', '1'),
    product(4, 'Opt (1) (Rainbow Foil)', '1'),
    product(5, 'Opt (1) (Galaxy Foil)', '1'),               // two foil siblings: nothing to choose between
    product(6, 'Lost (9) (Rainbow Foil)', '9'),             // no plain sibling
    product(7, 'Fabricate (2091)', '2091'),                 // another number: not 2090's
  ]);
  assert.deepEqual(pairs, { 643682: '643683' });
  assert.deepEqual(kinds, { 'Rainbow Foil': 1 });
  assert.deepEqual(twice, ['3: 4 Rainbow Foil, 5 Galaxy Foil']);
  assert.deepEqual(unpaired, ['6 Lost (9) (Rainbow Foil) #9']);
});

test('a comment wraps at the width, each line "// …"', () => {
  assert.deepEqual(wrapComment('one two three four five six', 14), ['// one two', '// three four', '// five six']);
  assert.deepEqual(wrapComment('short'), ['// short']);
});

const ROWS = { 643682: '643683', 1: '2' };
const REPORT = { date: '2026-10-26', kinds: { 'Galaxy Foil': 1, 'Rainbow Foil': 2 }, covered: 2, noFoil: 3 };

test('the generated part: the Generated paragraph (pairs by kind, most first), then the table by product id', () => {
  const lines = generatedSource(ROWS, REPORT).split('\n');
  const comment = lines.filter((l) => l.startsWith('// ')).map((l) => l.slice(3)).join(' ');
  assert.equal(comment, "Generated 2026-10-26 by scripts/sld-foils.mjs from TCGplayer's catalogue via tcgcsv.com: 2 pairs "
    + "(2 Rainbow Foil, 1 Galaxy Foil), covering 2 of Scryfall's 3 SLD cards in both finishes with no foil price.");
  assert.ok(lines.filter((l) => l.startsWith('//')).every((l) => l.length <= 115));
  assert.deepEqual(lines.filter((l) => !l.startsWith('//')),
    ['export const SLD_FOIL_PRODUCTS = {', "  '1': '2',", "  '643682': '643683',", '};', '']);
});

test('only the generated part of the module is replaced, and only when there is exactly one', () => {
  const head = '// The why, kept as written.\n\n';
  const tail = '\nexport function f() {}\n';
  const old = generatedSource({ 1: '2' }, { ...REPORT, date: '2026-10-24' });
  const fresh = generatedSource(ROWS, REPORT);
  assert.equal(patchModule(head + old + tail, fresh), head + fresh + tail);
  assert.throws(() => patchModule(head + tail, fresh), /found 0/);
  assert.throws(() => patchModule(head + old + old + tail, fresh), /found 2/);
});

test('the module on disk has the one generated part the script looks for', () => {
  const source = fs.readFileSync(new URL('../src/lib/sldFoilProducts.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.doesNotThrow(() => patchModule(source, generatedSource(ROWS, REPORT)));
});
