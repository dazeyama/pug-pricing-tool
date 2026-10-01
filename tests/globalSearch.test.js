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

test('collections pinned at the top; buys under their confirmation day, newest first', () => {
  const sections = groupResults([
    line({ line_id: 'l1', buy_id: 'b6', buy_number: 6, confirmed_at: '2026-10-01T04:48:00Z', quantity: 1, condition: 'MP' }),
    line({ line_id: 'l2', buy_id: 'b6', buy_number: 6, confirmed_at: '2026-10-01T04:48:00Z', quantity: 1 }),
    line({ line_id: 'l3', buy_id: 'b6', buy_number: 6, confirmed_at: '2026-10-01T04:48:00Z', quantity: 2, condition: 'LP' }),
    line({ line_id: 'l4', buy_id: 'b6', buy_number: 6, confirmed_at: '2026-10-01T04:48:00Z', set_code: 'JGP', collector_number: '3', condition: 'MP' }),
    line({ line_id: 'l5', buy_id: 'b6', buy_number: 6, confirmed_at: '2026-10-01T04:48:00Z', quantity: 1 }),
    line({ line_id: 'l6', buy_id: 'b2', buy_number: 2, confirmed_at: '2026-09-30T23:03:00Z' }),
    line({ line_id: 'l7', buy_id: 'c1', kind: 'collection', status: 'processing', buy_number: null,
      confirmed_at: null, created_at: '2026-09-30T04:04:00Z', customer_name: 'Jordan Reyes' }),
  ]);
  // 04:48 UTC Oct 1 is 9:48 PM Sep 30 in the store.
  assert.deepEqual(sections.map((s) => [s.title ?? s.day, s.panels.map((p) => p.key.split('|')[0])]),
    [['Collections', ['c1']], ['2026-09-30', ['b6', 'b2']]]);
  const b6 = sections[1].panels[0];
  assert.deepEqual(b6.entries.map((e) => [e.line.set_code, e.condition, e.qty]),
    [['2X2', 'NM', 2], ['2X2', 'LP', 2], ['2X2', 'MP', 1], ['JGP', 'MP', 1]]);
  assert.deepEqual(b6.lineIds, ['l1', 'l2', 'l3', 'l4', 'l5']);
  assert.deepEqual(flatRows(sections).map((p) => p.key.split('|')[0]), ['c1', 'b6', 'b2']);
  assert.equal(groupResults([line({})])[0].title, undefined);   // no collections, no pinned section
});

test('a walk-in panel is Completed only when its cards are', () => {
  const [sec] = groupResults([line({ line_id: 'a', completed: true }), line({ line_id: 'b', buy_id: 'b2', completed: false })]);
  assert.deepEqual(sec.panels.map((p) => [p.buyId, p.completed]), [['b1', true], ['b2', false]]);
});

test('a buy with matches in both games is a panel per game', () => {
  const sections = groupResults([line({ line_id: 'a' }), line({ line_id: 'b', game: 'pokemon', set_code: 'SV2a' })]);
  assert.deepEqual(sections[0].panels.map((p) => p.game), ['mtg', 'pokemon']);
});

test('a Japanese printing is its own entry', () => {
  assert.notEqual(printingKey(line({ lang: 'ja' })), printingKey(line({ lang: 'en' })));
});
