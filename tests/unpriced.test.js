import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUnpriced, noneShowPrice, priceOf, showsNoPrice, unpricedCardId, unpricedCards, unpricedFields,
} from '../src/lib/unpriced.js';
import { candidateKeyOf } from '../src/lib/candidateKey.js';
import { rateTotals } from '../src/lib/rates.js';

// Projects that skip pricing (decision 513): a card added with no price, 'unpriced' at $0.
const none = { price_source: 'unpriced', unit_price: 0, quantity: 2 };
const priced = { price_source: 'justtcg', unit_price: 1.5, quantity: 1 };

test('a card added with no price shows none until an export gives it a Sell Price', () => {
  assert.equal(isUnpriced(none), true);
  assert.equal(isUnpriced(priced), false);
  assert.equal(showsNoPrice(none), true);
  assert.equal(showsNoPrice({ ...none, cc_sell_price: 2.5 }), false);
});

test('the cards not priced are counted by the copy, struck and exported ones left out', () => {
  assert.equal(unpricedCards([none, priced, { ...none, quantity: 3 }]), 5);
  assert.equal(unpricedCards([{ ...none, struck_at: '2026-10-24T18:00:00Z' }, { ...none, cc_sell_price: 2 }]), 0);
  assert.equal(unpricedCards([]), 0);
});

test('totals are no figure only when no card shows a price', () => {
  assert.equal(noneShowPrice([none]), true);
  assert.equal(noneShowPrice([none, priced]), false);
  assert.equal(noneShowPrice([]), false);
});

test('a card with no price adds nothing to the market', () => {
  const rates = { cash: 50, credit: 65 };
  assert.equal(rateTotals([none, priced], rates).market, rateTotals([priced], rates).market);
  // At $0 it would read as low-end: the list's totals leave it out (BuyList's Totals).
  assert.equal(rateTotals([none], rates).off.low, 2);
});

// Decision 514: the Price screen's ADD CARD and a phone's scan while Skip pricing is on.
test("a card going in with no price: $0 'unpriced', nothing looked up kept, only what it's given", () => {
  const f = unpricedFields({ version: 'v1', scan: { scan_id: 's' } });
  assert.equal(f.unit_price, 0);
  assert.equal(f.market_price, null);
  assert.equal(f.price_source, 'unpriced');
  assert.equal(isUnpriced(f), true);
  assert.deepEqual(f.price_snapshot, { version: 'v1', scan: { scan_id: 's' }, skip_pricing: true });
  assert.equal(f.justtcg_card_id, null);
  assert.equal(f.justtcg_variant_id, null);
  assert.ok(!Number.isNaN(Date.parse(f.priced_at)));
  assert.deepEqual(unpricedFields().price_snapshot, { skip_pricing: true });
});

// Decision 526: a TCGplayer-only Pokémon card added while Skip pricing is on keeps its JustTCG card id.
test("an unpriced TCGplayer-only Pokémon card keeps its own JustTCG card id; others don't take one", () => {
  // A card known only from TCGplayer: its versions carry the card's id (justtcgVersions).
  const known = { game: 'pokemon', source: 'justtcg', justtcgId: 'pokemon-jp-x-1' };
  assert.equal(unpricedCardId(known, { tcgplayerOnly: true, justtcgId: 'pokemon-jp-x-1' }), 'pokemon-jp-x-1');
  assert.equal(unpricedCardId(known, null), 'pokemon-jp-x-1');   // the candidate's own, failing a version
  // A TCGdex card on a TCGplayer-only version (Cosmos Holo…): the version's product.
  const dex = { game: 'pokemon', tcgdexId: 'sv1-1' };
  assert.equal(unpricedCardId(dex, { tcgplayerOnly: true, justtcgId: 'cosmos-1' }), 'cosmos-1');
  // A TCGdex card on its own version, and Magic: found by their own ids, unchanged.
  assert.equal(unpricedCardId(dex, { tcgplayerOnly: false, justtcgId: 'x' }), null);
  assert.equal(unpricedCardId({ game: 'mtg', justtcgId: 'x' }, null), null);
  // The line's key then finds the card again (SAVE EDIT), where it was "pokemon:en:jt:null".
  assert.equal(candidateKeyOf({ game: 'pokemon', lang: 'en', tcgdex_id: null, justtcg_card_id: unpricedCardId(known, null) }),
    'pokemon:en:jt:pokemon-jp-x-1');
});

test('the price a line is said to be at: none for a card with no price', () => {
  assert.equal(priceOf(none), null);
  assert.equal(priceOf(priced), 1.5);
  assert.equal(priceOf(null), null);
});
