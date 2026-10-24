import { test } from 'node:test';
import assert from 'node:assert/strict';
import { underTenName, underTenText } from '../src/lib/underTen.js';

// Hand-made rows in the inventory CSV's shape; never the real file.
const HOST = 'http://playersuniongames.crystalcommerce.com/catalog/';
const row = (name, price, qty = '1', path = 'magic_the_gathering_singles-odyssey') => ({
  'Product Name': name,
  'Sell Price': price,
  'Total Qty': qty,
  URL: `${HOST}${path}/${name.toLowerCase().replace(/\W+/g, '_')}/123`,
});

test('every category counts, the newer sets without the singles prefix too (decision 498)', () => {
  assert.equal(underTenName(row('Mirari', '2.00')).name, 'Mirari');
  assert.equal(underTenName(row('Llanowar Elves', '0.25', '3', 'foundations')).name, 'Llanowar Elves');
  assert.equal(underTenName(row('Cloud, Midgar Mercenary', '4.00', '1', 'final_fantasy')).name,
    'Cloud, Midgar Mercenary');
});

test('"Foil" stuck on the name without " - " is dropped; the card named Foil stays', () => {
  assert.equal(underTenName(row('Narset, Enlightened Master Foil - Prerelease Promo', '3.00')).name,
    'Narset, Enlightened Master');
  assert.equal(underTenName(row('Skyship Weatherlight Alternate Art Foil', '3.00')).name, 'Skyship Weatherlight');
  assert.equal(underTenName(row('Foil', '0.50')).name, 'Foil');
  assert.equal(underTenName(row('Foil - Foil', '0.50')).name, 'Foil');
  const list = underTenText([row('Narset, Enlightened Master Foil - Prerelease Promo', '3.00'),
    row('Narset, Enlightened Master', '5.00')].map(underTenName));
  assert.equal(list.text, '1 Narset, Enlightened Master');
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
