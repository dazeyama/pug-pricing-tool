import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogPath, isEtchedKind, isFoilKind, parseProductName, productRow } from '../src/lib/ccNames.js';

// Hand-made names following the patterns measured on the store's inventory
// (export spec Appendix A); never the real file.

test('plain, foil, and foil before the variant', () => {
  assert.deepEqual(parseProductName('Snuff Out'),
    { base: 'Snuff Out', baseKey: 'snuff out', bracket: null, foilKind: null, variants: [] });
  assert.deepEqual(parseProductName('Snuff Out - Foil').foilKind, 'Foil');
  const p = parseProductName('Chrome Host Seedshark - Foil - Extended Art');
  assert.equal(p.foilKind, 'Foil');
  assert.deepEqual(p.variants, ['Extended Art']);
});

test('a collector number or set code in brackets, and named foils', () => {
  const p = parseProductName('Fabricate (2090) - Rainbow Foil');
  assert.equal(p.base, 'Fabricate');
  assert.equal(p.bracket, '2090');
  assert.equal(p.foilKind, 'Rainbow Foil');
  assert.equal(parseProductName('Austere Command (PAGL) - The List').bracket, 'PAGL');
  assert.deepEqual(parseProductName('Austere Command (PAGL) - The List').variants, ['The List']);
});

test('double spaces are read through, the variant-first exceptions still find the foil', () => {
  const p = parseProductName('Fabricate (332) - Foil  - Borderless');
  assert.equal(p.foilKind, 'Foil');
  assert.deepEqual(p.variants, ['Borderless']);
  const q = parseProductName('Some Card - Showcase - Galaxy Foil');
  assert.equal(q.foilKind, 'Galaxy Foil');
  assert.deepEqual(q.variants, ['Showcase']);
  assert.equal(parseProductName('Some Card - Thick Stock - Foil Etched').foilKind, 'Foil Etched');
});

test('foil kinds, etched, and "Foil <promo>" in one suffix', () => {
  for (const k of ['Foil', 'Foil Etched', 'Surge Foil', 'Step-and-Compleat Foil', 'Silver Foil Etched', 'Oil Slick Raised Foil']) {
    assert.ok(isFoilKind(k), k);
  }
  for (const k of ['Extended Art', 'Borderless', 'Foil DCI Judge Promo', 'Prerelease Promo']) assert.ok(!isFoilKind(k), k);
  assert.ok(isEtchedKind('Foil Etched') && isEtchedKind('Silver Foil Etched') && !isEtchedKind('Surge Foil'));
  const j = parseProductName('Stoneforge Mystic - Foil DCI Judge Promo');
  assert.equal(j.foilKind, 'Foil');
  assert.deepEqual(j.variants, ['DCI Judge Promo']);
});

test('double-faced names and flavor names stay in the base / first suffix', () => {
  const d = parseProductName('Brazen Borrower // Petty Theft - Foil - Showcase');
  assert.equal(d.base, 'Brazen Borrower // Petty Theft');
  assert.deepEqual(d.variants, ['Showcase']);
  const u = parseProductName('Aggro Amalgam - Voracious Hydra');
  assert.equal(u.base, 'Aggro Amalgam');
  assert.deepEqual(u.variants, ['Voracious Hydra']);
});

test('an inventory row becomes a cc_products row, the name kept exactly', () => {
  const r = productRow({
    'Product ID': '2123626', 'CC ID': '991', 'Product Name': 'Fabricate (332) - Foil  - Borderless',
    Category: 'Secret Lair Drop Series',
    URL: 'http://playersuniongames.crystalcommerce.com/catalog/magic_the_gathering_singles-secret_lair_drop_series/fabricate_332__foil__borderless/2123626',
  });
  assert.equal(r.product_name, 'Fabricate (332) - Foil  - Borderless');
  assert.equal(r.catalog_path, 'magic_the_gathering_singles-secret_lair_drop_series/fabricate_332__foil__borderless');
  assert.equal(r.bracket, '332');
  assert.equal(productRow({ 'Product Name': 'x' }), null);
  assert.equal(catalogPath('https://h/catalog/a-b/c/12/'), 'a-b/c');
});
