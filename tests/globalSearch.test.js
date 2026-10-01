import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatRows, groupResults, printingKey, searchArgs } from '../src/lib/globalSearch.js';

const codes = new Set(['2x2', 'soa', 'mew']);

test('too short, or nothing to look for, doesn\'t search', () => {
  assert.equal(searchArgs('b', codes), null);
  assert.equal(searchArgs('   ', codes), null);
});

test('a partial name searches by name alone', () => {
  const { args, retry } = searchArgs('Bolt', codes);
  assert.deepEqual(args, { p_name: 'bolt', p_number: null, p_size: null, p_set: null });
  assert.equal(retry, null);
});

test('number, size and set code narrow it', () => {
  assert.deepEqual(searchArgs('Charizard 125/197', codes).args,
    { p_name: 'charizard', p_number: '125', p_size: 197, p_set: null });
  assert.deepEqual(searchArgs('Abrade 37/291 SOA', codes).args,
    { p_name: 'abrade', p_number: '37', p_size: 291, p_set: 'SOA' });
  // A sub-set size like TG30 isn't a count, so it doesn't filter.
  assert.equal(searchArgs('Pikachu TG05/TG30', codes).args.p_size, null);
});

test('a trailing word is a set code only if a stored line uses it, with a retry without it', () => {
  const known = searchArgs('Lightning Bolt 2X2', codes);
  assert.equal(known.args.p_set, '2X2');
  assert.equal(known.args.p_name, 'lightning bolt');
  const guess = searchArgs('Ancient Mew', codes);
  assert.equal(guess.args.p_set, 'Mew');
  assert.deepEqual(guess.retry, { p_name: 'ancient mew', p_number: null, p_size: null, p_set: null });
  assert.equal(searchArgs('Lightning Bolt', codes).args.p_set, null);
});

const line = (over) => ({
  line_id: 'l1', buy_id: 'b1', kind: 'walk_in', status: 'confirmed', buy_number: 2,
  confirmed_at: '2026-08-17T21:37:00Z', confirmed_by: 'u1', customer_name: null, paid_method: null,
  game: 'mtg', lang: 'en', name: 'Lightning Bolt', name_en: null, set_code: '2X2', collector_number: '161',
  finish: 'foil', first_edition: false, treatments: [], quantity: 1, condition: 'NM', image_url: 'x.jpg',
  ...over,
});

test('lines group by printing; a row per buy and condition, quantities added, best condition first', () => {
  const groups = groupResults([
    line({ line_id: 'l0', quantity: 1, condition: 'LP' }),
    line({ line_id: 'l1', quantity: 3 }),
    line({ line_id: 'l2', quantity: 2, condition: 'LP' }),
    line({ line_id: 'l3', buy_id: 'c1', kind: 'collection', status: 'processing', buy_number: null, customer_name: 'Jordan Reyes', quantity: 2 }),
    line({ line_id: 'l4', finish: 'nonfoil' }),
    line({ line_id: 'l5', collector_number: '0161' }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].heading, 'Lightning Bolt (2X2) 161 *F*');
  assert.deepEqual(groups[0].buys.map((r) => [r.buyId, r.condition, r.qty, r.lineIds.length]),
    [['b1', 'NM', 4, 2], ['b1', 'LP', 3, 2]]);
  assert.deepEqual(groups[0].collections.map((r) => [r.customerName, r.condition, r.qty]), [['Jordan Reyes', 'NM', 2]]);
  assert.equal(groups[1].heading, 'Lightning Bolt (2X2) 161');
  assert.deepEqual(flatRows(groups).map((r) => r.key.split('|').slice(-2).join(' ')),
    ['b1 NM', 'b1 LP', 'c1 NM', 'b1 NM']);
  assert.equal(groups[0].buys[1].line.condition, 'LP');
});

test('a Japanese card heads its group with its English name and a JP tag', () => {
  const [g] = groupResults([line({ game: 'pokemon', lang: 'ja', name: 'ピカチュウ', name_en: 'Pikachu', set_code: 'SV2a', collector_number: '025', finish: 'normal' })]);
  assert.equal(g.heading, 'Pikachu (SV2a) 025 [JP]');
  assert.notEqual(printingKey(line({ lang: 'ja' })), printingKey(line({ lang: 'en' })));
});
