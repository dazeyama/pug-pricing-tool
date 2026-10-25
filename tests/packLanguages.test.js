import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keptLanguage } from '../src/lib/scryfall.js';
import { magicTraits, magicTreatments } from '../src/lib/printings.js';
import { chooseProduct, expectedName } from '../src/lib/ccMatch.js';
import { parseProductName } from '../src/lib/ccNames.js';
import { scorePrinting } from '../src/lib/importMatch.js';

// The invented languages English packs carry, found and matched like the Japanese ones (decisions 269, 512).

test('searches keep English, Japanese-only, Phyrexian, Dwarven and Elvish printings, and no other language', () => {
  for (const lang of ['en', 'ja', 'ph', 'dw', 'qya']) assert.equal(keptLanguage({ lang }), true, lang);
  for (const lang of ['de', 'fr', 'ko', 'zhs', 'la']) assert.equal(keptLanguage({ lang }), false, lang);
});

test('the printing says its language: a trait in the details, a treatment on the line', () => {
  assert.equal(magicTraits({ lang: 'ph' }).get('phyrexian'), 'Phyrexian');
  assert.equal(magicTraits({ lang: 'dw' }).get('dwarven'), 'Dwarven');
  assert.equal(magicTraits({ lang: 'qya' }).get('elvish'), 'Elvish');
  assert.deepEqual(magicTreatments({ lang: 'ph', border_color: 'borderless' }), ['borderless', 'phyrexian']);
  assert.deepEqual(magicTreatments({ lang: 'en' }), []);
});

// CC's names, as on the store's inventory (Phyrexia: All Will Be One, 2026-10-22).
const ONE = 'Phyrexia: All Will Be One';
const product = (name) => {
  const p = parseProductName(name);
  return { product_id: name, product_name: name, category: ONE, base_key: p.baseKey, bracket: p.bracket, foil_kind: p.foilKind, variants: p.variants };
};
const NORN = ['Elesh Norn, Mother of Machines', 'Elesh Norn, Mother of Machines - Foil',
  'Elesh Norn, Mother of Machines - Phyrexian', 'Elesh Norn, Mother of Machines - Foil - Phyrexian'].map(product);
const line = (over) => ({ name: 'Elesh Norn, Mother of Machines', set_code: 'ONE', collector_number: '10', finish: 'nonfoil', treatments: [], ...over });

test('export: a Phyrexian card takes its "- Phyrexian" product, an English one the plain one', () => {
  const ph = line({ collector_number: '285', treatments: ['phyrexian'] });
  assert.equal(chooseProduct(ph, NORN).product?.product_name, 'Elesh Norn, Mother of Machines - Phyrexian');
  assert.equal(chooseProduct({ ...ph, finish: 'foil' }, NORN).product?.product_name, 'Elesh Norn, Mother of Machines - Foil - Phyrexian');
  assert.equal(chooseProduct(line(), NORN).product?.product_name, 'Elesh Norn, Mother of Machines');
  assert.equal(expectedName(ph), 'Elesh Norn, Mother of Machines - Phyrexian');
});

test('import: a "- Phyrexian" row is the Phyrexian printing, a plain row the English one', () => {
  const card = (lang, number) => ({ name: 'Elesh Norn, Mother of Machines', lang, set: 'one', collector_number: number, finishes: ['nonfoil', 'foil'] });
  const row = (name) => ({ productName: name, category: ONE, parsed: parseProductName(name) });
  const best = (r) => [card('en', '10'), card('ph', '285')]
    .map((c) => ({ c, s: scorePrinting(r, c)?.score ?? -Infinity }))
    .sort((a, b) => b.s - a.s)[0].c.lang;
  assert.equal(best(row('Elesh Norn, Mother of Machines - Phyrexian')), 'ph');
  assert.equal(best(row('Elesh Norn, Mother of Machines')), 'en');
});
