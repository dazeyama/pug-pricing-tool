import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLD_FOIL_PRODUCTS, sldFoilLookup, sldFoilResult } from '../src/lib/sldFoilProducts.js';

// Secret Lair foils sold as their own TCGplayer product (owner, 2026-10-24; decision 510). (lib/prices.js
// calls these; it opens the database when loaded, so it isn't loaded here.)

// Fabricate, SLD 2090: Scryfall's one printing in both finishes, linked to TCGplayer's plain product.
const FABRICATE = { id: 'fab', tcgplayer_id: 643682, finishes: ['nonfoil', 'foil'] };
const priced = (printing) => ({ card: { variants: [{ printing, condition: 'Near Mint', price: 9 }] } });

test('Fabricate (2090): its Rainbow Foil is TCGplayer product 643683', () => {
  assert.equal(SLD_FOIL_PRODUCTS['643682'], '643683');
  assert.ok(Object.keys(SLD_FOIL_PRODUCTS).length > 600);
});

test('the foil finish is looked up on the Secret Lair foil product too, by the card\'s own product', () => {
  assert.deepEqual(sldFoilLookup(FABRICATE), { key: 'mtg:sldfoil:643683', game: 'mtg', lang: 'en', tcgplayerId: '643683' });
  assert.equal(sldFoilLookup({ ...FABRICATE, tcgplayer_id: 1 }), null);
  assert.equal(sldFoilLookup({ ...FABRICATE, finishes: ['nonfoil'] }), null);   // no foil, nothing to look up
  assert.equal(sldFoilLookup({ id: 'x', finishes: ['foil'] }), null);            // no TCGplayer product at all
});

test("the foil's prices: the main card's when it lists a foil, else the foil product's; else the usual way", () => {
  const main = priced('Normal');
  const foil = priced('Foil');
  const results = { 'mtg:scryfall:fab': main, 'mtg:sldfoil:643683': foil };
  assert.equal(sldFoilResult(FABRICATE, results, 'foil'), foil);
  assert.equal(sldFoilResult(FABRICATE, results, 'nonfoil'), undefined);
  const both = { ...results, 'mtg:scryfall:fab': priced('Foil') };
  assert.equal(sldFoilResult(FABRICATE, both, 'foil'), both['mtg:scryfall:fab']);
  assert.equal(sldFoilResult({ ...FABRICATE, tcgplayer_id: 1 }, results, 'foil'), undefined);
  // The foil product not fetched: the main card, as before.
  assert.equal(sldFoilResult(FABRICATE, { 'mtg:scryfall:fab': main }, 'foil'), main);
});
