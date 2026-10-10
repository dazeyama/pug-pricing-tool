import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONDITIONS, ladderFor, priceLadder } from '../src/lib/ladder.js';

// Owner, 2026-10-10: a project's prices round up, like an export.

const PCT = { NM: 100, LP: 85, MP: 55, HP: 40, DMG: 25 };
const prices = (ladder) => CONDITIONS.map((c) => ladder[c].price);

test('prices round down by the store\'s steps, or up in a project', () => {
  const market = { NM: 12.4, LP: 10.2, MP: 6.1, HP: 3.3, DMG: 0.996 };
  assert.deepEqual(prices(priceLadder(market, null, PCT, 'mtg')), [12, 10, 6, 3.25, 0.99]);
  assert.deepEqual(prices(priceLadder(market, null, PCT, 'mtg', { up: true })), [13, 11, 6.25, 3.5, 1]);
  // On a step already: the same either way.
  assert.equal(priceLadder({ NM: 15 }, null, PCT, 'mtg', { up: true }).NM.price, 15);
});

test('fallbacks round up too, and the raw price is kept', () => {
  const ladder = priceLadder({}, { price: 3.1, source: 'scryfall_fallback' }, PCT, 'mtg', { up: true });
  assert.equal(ladder.LP.price, 2.75);
  assert.equal(ladder.LP.raw, 2.635);
  assert.equal(priceLadder({}, { price: 3.1, source: 'scryfall_fallback' }, PCT, 'mtg').LP.price, 2.5);
});

test('rounding up, two conditions still never show one price', () => {
  // MP's fallback (2 × 55% = $1.10) shows $1.25 rounded up, the same as LP:
  // 10% below LP still shows $1.25, so it goes a quarter below.
  const up = priceLadder({ NM: 2, LP: 1.25 }, null, PCT, 'mtg', { up: true });
  assert.equal(up.MP.price, 1);
  assert.ok(up.MP.cap?.quarter);
  const shown = prices(up).filter((p) => p != null);
  assert.equal(new Set(shown).size, shown.length, shown.join(', '));
  // Rounded down, $1.10 shows $1, already below LP: no cap.
  const down = priceLadder({ NM: 2, LP: 1.25 }, null, PCT, 'mtg');
  assert.equal(down.MP.price, 1);
  assert.equal(down.MP.cap, null);
});

test('a saved line\'s ladder (REPRICE?) rounds up in a project', () => {
  const line = { id: 'l1', game: 'mtg', condition: 'LP', price_source: 'justtcg', unit_price: 9, market_price: 9.4 };
  const today = { market: { NM: 12.4, LP: 10.2 } };
  assert.equal(ladderFor(line, today, PCT).ladder.LP.price, 10);
  assert.equal(ladderFor(line, today, PCT, { up: true }).ladder.LP.price, 11);
});
