import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURGE_PRODUCTS, surgeLookup, surgeResult } from '../src/lib/surgeProducts.js';

// Surge foils sold as their own TCGplayer product (owner, 2026-10-19; decision 316). (lib/prices.js
// calls these; it opens the database when loaded, so it isn't loaded here.)

const EGO = { id: 'fda23b02-c650-4092-a35d-ae330547c425', finishes: ['nonfoil', 'foil'] };   // Altered Ego, FIC 317
const priced = (printing) => ({ card: { variants: [{ printing, condition: 'Near Mint', price: 0.4 }] } });

test('Altered Ego FIC 317: its surge foil is TCGplayer product 636749', () => {
  assert.equal(SURGE_PRODUCTS[EGO.id], '636749');
  assert.ok(Object.keys(SURGE_PRODUCTS).length > 600);
});

test('the foil finish is looked up on the surge foil product too', () => {
  assert.deepEqual(surgeLookup(EGO), { key: 'mtg:surge:636749', game: 'mtg', lang: 'en', tcgplayerId: '636749' });
  assert.equal(surgeLookup({ id: 'other', finishes: ['nonfoil', 'foil'] }), null);
  assert.equal(surgeLookup({ ...EGO, finishes: ['nonfoil'] }), null);
});

test("the foil's prices: the main card's when it lists a foil, else the surge product's; else the usual way", () => {
  const main = priced('Normal');
  const surge = priced('Foil');
  const results = { [`mtg:scryfall:${EGO.id}`]: main, 'mtg:surge:636749': surge };
  assert.equal(surgeResult(EGO, results, 'foil'), surge);
  assert.equal(surgeResult(EGO, results, 'nonfoil'), undefined);
  const both = { ...results, [`mtg:scryfall:${EGO.id}`]: priced('Foil') };
  assert.equal(surgeResult(EGO, both, 'foil'), both[`mtg:scryfall:${EGO.id}`]);
  assert.equal(surgeResult({ id: 'other' }, results, 'foil'), undefined);
});
