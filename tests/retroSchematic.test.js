import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseProduct, evidenceTreatments, expectedName } from '../src/lib/ccMatch.js';
import { parseProductName } from '../src/lib/ccNames.js';
import { scorePrinting } from '../src/lib/importMatch.js';

// The Brothers' War Retro Artifacts: each artifact in the retro frame (1–63) and as a schematic (64–126, the
// serialized 64z–126z), which CC names apart (decision 516). CC's names as on the store's inventory, 2026-10-22.
const BRR = "The Brothers' War: Retro Frame Artifacts";
const product = (name) => {
  const p = parseProductName(name);
  return { product_id: name, product_name: name, category: BRR, base_key: p.baseKey, bracket: p.bracket, foil_kind: p.foilKind, variants: p.variants };
};
const ANVIL = ['Semblance Anvil - Retro Frame', 'Semblance Anvil - Foil - Retro Frame', 'Semblance Anvil - Retro Schematic',
  'Semblance Anvil - Foil - Retro Schematic', 'Semblance Anvil - Foil - Retro Schematic - Serialized'].map(product);
// Scryfall's cards: both the 1997 frame, nothing to tell a schematic but its number.
const card = (number, finishes = ['nonfoil', 'foil'], promos = []) => ({
  name: 'Semblance Anvil', set: 'brr', collector_number: number, frame: '1997', released_at: '2022-11-18',
  border_color: 'black', finishes, promo_types: promos,
});

test('a schematic is told by its number, 64 on in BRR', () => {
  assert.deepEqual(evidenceTreatments(card('115')), ['schematic']);
  assert.deepEqual(evidenceTreatments(card('115z')), ['schematic']);
  assert.deepEqual(evidenceTreatments(card('52')), []);
  assert.deepEqual(evidenceTreatments({ ...card('115'), set: 'bro' }), []);
});

test('export: a schematic takes "- Retro Schematic", a plain retro card "- Retro Frame", each by itself', () => {
  const line = (over) => ({ name: 'Semblance Anvil', set_code: 'BRR', collector_number: '52', finish: 'nonfoil', treatments: ['retro'], ...over });
  const schematic = line({ collector_number: '115', treatments: ['retro', 'schematic'] });
  assert.equal(expectedName(schematic), 'Semblance Anvil - Retro Schematic');
  assert.equal(chooseProduct(schematic, ANVIL).product?.product_name, 'Semblance Anvil - Retro Schematic');
  assert.equal(chooseProduct({ ...schematic, finish: 'foil' }, ANVIL).product?.product_name, 'Semblance Anvil - Foil - Retro Schematic');
  const serial = line({ collector_number: '115z', finish: 'foil', treatments: ['retro', 'schematic', 'serialized'] });
  assert.equal(chooseProduct(serial, ANVIL).product?.product_name, 'Semblance Anvil - Foil - Retro Schematic - Serialized');
  assert.equal(chooseProduct(line(), ANVIL).product?.product_name, 'Semblance Anvil - Retro Frame');
  assert.equal(chooseProduct(line({ finish: 'foil' }), ANVIL).product?.product_name, 'Semblance Anvil - Foil - Retro Frame');
});

test('import: a "- Retro Schematic" row is the schematic printing, a "- Retro Frame" row the plain one', () => {
  const row = (name) => ({ productName: name, category: BRR, parsed: parseProductName(name) });
  const best = (r, cards) => cards
    .map((c) => ({ c, s: scorePrinting(r, c)?.score ?? -Infinity }))
    .sort((a, b) => b.s - a.s)[0].c.collector_number;
  const printings = [card('52'), card('115'), card('115z', ['foil'], ['serialized', 'doublerainbow'])];
  assert.equal(best(row('Semblance Anvil - Retro Schematic'), printings), '115');
  assert.equal(best(row('Semblance Anvil - Retro Frame'), printings), '52');
  assert.equal(best(row('Semblance Anvil - Foil - Retro Schematic - Serialized'), printings), '115z');
});
