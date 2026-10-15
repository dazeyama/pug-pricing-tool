import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BULK_ITEMS, DEFAULT_BULK_VALUES, bulkItem, bulkLineText, bulkSearch, bulkValuesFrom, buildBulkLine, cardCounts,
  bulkShortText, countText, isBulk, perText, repricedBulk, shortName,
} from '../src/lib/bulk.js';
import { lineText, lineTextWithCondition } from '../src/lib/lineFormat.js';

// Bulk (docs/TEAM_FEEDBACK.md 5, owner 2026-10-14).
const both = { mtg: true, pokemon: true };
const kinds = (r) => r.items.map((c) => c.bulk);

test('the eight items and their values', () => {
  assert.equal(BULK_ITEMS.length, 8);
  assert.deepEqual(bulkValuesFrom(null), { ...DEFAULT_BULK_VALUES });
  assert.equal(bulkValuesFrom({ mtg_100_common: '2', pkm_100: -1 }).mtg_100_common, 2);
  assert.equal(bulkValuesFrom({ pkm_100: -1 }).pkm_100, 0.75);
  assert.equal(perText(bulkItem('mtg_100_common'), 1.5), '$1.50 per 100');
  assert.equal(perText(bulkItem('pkm_10_dollar'), 7), '$7 per 10');
  assert.deepEqual(BULK_ITEMS.map(shortName), ['100 BULK c/u', '100 BULK r/m', '10 BULK $1', '10 BULK 50¢',
    '100 BULK', '100 BULK EX', '10 BULK $1', '10 BULK 50¢']);
});

test('only a search with the word "bulk" finds bulk (5.3)', () => {
  assert.deepEqual(bulkSearch('sol ring', both), { items: [], only: false });
  assert.deepEqual(bulkSearch('bulky', both), { items: [], only: false });
  const any = bulkSearch('bulk', both);
  assert.equal(any.items.length, 8);
  assert.equal(any.only, false);   // the cards too: Bulk Up
  assert.equal(bulkSearch('Bulk', both).only, false);
  assert.equal(bulkSearch('BULK', both).only, true);
});

test('more words narrow the items; the game toggles apply', () => {
  assert.deepEqual(kinds(bulkSearch('bulk rares', both)), ['mtg_100_rare']);
  assert.deepEqual(kinds(bulkSearch('BULK pkm', both)), ['pkm_100', 'pkm_100_ex', 'pkm_10_dollar', 'pkm_10_fifty']);
  assert.deepEqual(kinds(bulkSearch('bulk $1', both)), ['mtg_10_dollar', 'pkm_10_dollar']);
  assert.deepEqual(kinds(bulkSearch('bulk 50¢ magic', both)), ['mtg_10_fifty']);
  assert.deepEqual(kinds(bulkSearch('bulk ex', both)), ['pkm_100_ex']);
  assert.deepEqual(kinds(bulkSearch('bulk up', both)), []);
  assert.deepEqual(kinds(bulkSearch('bulk', { mtg: false, pokemon: true })).length, 4);
});

test('a search result carries its item and value', () => {
  const [c] = bulkSearch('bulk rares', both, { ...DEFAULT_BULK_VALUES, mtg_100_rare: 3 }).items;
  assert.equal(c.key, 'bulk:mtg_100_rare');
  assert.equal(c.game, 'mtg');
  assert.equal(c.value, 3);
});

test('a bulk line reads in total cards (5.5)', () => {
  const line = buildBulkLine(bulkItem('mtg_100_common'), 10, 1.5);
  assert.ok(isBulk(line));
  assert.equal(line.price_source, 'bulk');
  assert.equal(line.unit_price, 1.5);
  assert.equal(bulkLineText(line), '1,000 MTG Bulk commons/uncommons');
  assert.equal(lineText(line), '1,000 MTG Bulk commons/uncommons');
  assert.equal(lineText(line, 2), '200 MTG Bulk commons/uncommons');
  assert.equal(lineTextWithCondition(line), '1,000 MTG Bulk commons/uncommons');
  assert.equal(bulkShortText(line), '1,000 BULK c/u');
  const set = buildBulkLine(bulkItem('pkm_10_dollar'), 1, 7, 9);
  assert.equal(set.unit_price, 9);
  assert.equal(set.price_source, 'manual');
  assert.equal(set.finish, 'normal');
});

test('cards and bulk are counted apart', () => {
  const lines = [
    { quantity: 40 }, { quantity: 2 },
    { quantity: 10, bulk_kind: 'mtg_100_common' }, { quantity: 3, bulk_kind: 'pkm_10_fifty' },
  ];
  assert.deepEqual(cardCounts(lines), { cards: 42, bulk: 1030 });
  assert.equal(countText(cardCounts(lines)), '42 cards + 1,030 bulk');
  assert.equal(countText({ cards: 1, bulk: 0 }), '1 card');
  assert.equal(countText({ cards: 0, bulk: 100 }), '100 bulk');
  assert.equal(countText({ cards: 0, bulk: 0 }), '0 cards');
});

test('REPRICE? puts bulk back on its Settings value, keeping a value of its own', () => {
  const values = { ...DEFAULT_BULK_VALUES, mtg_100_common: 2 };
  const plain = repricedBulk({ id: 'a', bulk_kind: 'mtg_100_common', unit_price: 1.5, price_source: 'bulk' }, values);
  assert.equal(plain.unit_price, 2);
  assert.equal(plain.price_source, 'bulk');
  assert.equal(plain.kept, null);
  const own = repricedBulk({ id: 'b', bulk_kind: 'mtg_100_common', unit_price: 3, price_source: 'manual' }, values);
  assert.equal(own.unit_price, 3);
  assert.equal(own.kept, 'manual');
});
