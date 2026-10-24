import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMagicSingle, underTenName, underTenText } from '../src/lib/underTen.js';

// Hand-made rows in the inventory CSV's shape; never the real file.
const HOST = 'http://playersuniongames.crystalcommerce.com/catalog/';
const row = (name, price, qty = '1', path = 'magic_the_gathering_singles-odyssey') => ({
  'Product Name': name,
  'Sell Price': price,
  'Total Qty': qty,
  URL: `${HOST}${path}/${name.toLowerCase().replace(/\W+/g, '_')}/123`,
});

test('Magic singles only, by the catalog path', () => {
  assert.equal(isMagicSingle(`${HOST}magic_the_gathering_singles-odyssey/mirari/1`), true);
  assert.equal(isMagicSingle(`${HOST}magic_the_gathering_sealed_product-boxes/x/1`), false);
  assert.equal(isMagicSingle(`${HOST}pokemon_singles-base_set/charizard/1`), false);
  assert.equal(isMagicSingle(''), false);
  assert.equal(underTenName(row('Mirari', '2.00', '1', 'pokemon_singles-base_set')), null);
});

test('in stock, under $10, the price written with or without $', () => {
  assert.equal(underTenName(row('Mirari', '2.32')).name, 'Mirari');
  assert.equal(underTenName(row('Mirari', '$2.32')).name, 'Mirari');
  assert.equal(underTenName(row('Mirari', '9.99')).name, 'Mirari');
  assert.equal(underTenName(row('Mirari', '10.00')), null);
  assert.equal(underTenName(row('Mirari', '$1,204.00')), null);
  assert.equal(underTenName(row('Mirari', '2.32', '0')), null);
  assert.equal(underTenName(row('Mirari', '2.32', '-1')), null);
  assert.equal(underTenName(row('Mirari', '2.32', '')), null);
});

test('a blank or unreadable price is left out', () => {
  assert.equal(underTenName(row('Mirari', '')), null);
  assert.equal(underTenName(row('Mirari', 'n/a')), null);
  assert.equal(underTenName(row('Mirari', undefined)), null);
});

test('the name without its bracket, foil kind and variants; "A // B" as written', () => {
  assert.equal(underTenName(row('Fabricate (2090) - Rainbow Foil', '3.00')).name, 'Fabricate');
  assert.equal(underTenName(row('Chrome Host Seedshark - Foil - Extended Art', '3.00')).name, 'Chrome Host Seedshark');
  assert.equal(underTenName(row('Brazen Borrower // Petty Theft - Foil - Showcase', '8.00')).name,
    'Brazen Borrower // Petty Theft');
});

test('once per name, A to Z, any one qualifying product enough', () => {
  const names = [
    row('Snuff Out - Foil', '45.00'),
    row('Snuff Out', '9.50'),
    row('Mirari', '2.00'),
    row('Mirari - Foil', '6.00'),
    row('ancestral recall', '1.00', '0'),
    row('Æther Vial', '4.00'),
  ].map(underTenName);
  const list = underTenText(names);
  assert.equal(list.text, '1 Æther Vial\n1 Mirari\n1 Snuff Out');
  assert.equal(list.names, 3);
  assert.deepEqual(underTenText([]), { text: '', names: 0 });
});
