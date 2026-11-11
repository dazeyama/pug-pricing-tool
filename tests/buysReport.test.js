import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buysOn, dailyRows, daysIn, graphRows, reportLoadError, isClosedDay, longDay, presets, rangeText, shiftDay, spanBefore, totalOf,
} from '../src/lib/buysReport.js';

test('days: shifted across a month and a year, and listed both ends in', () => {
  assert.equal(shiftDay('2026-11-01', -1), '2026-10-31');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(daysIn('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(daysIn('2026-11-10', '2026-11-10'), ['2026-11-10']);
});

test('Mondays and Wednesdays are the closed days', () => {
  assert.equal(isClosedDay('2026-11-09'), true);    // Monday
  assert.equal(isClosedDay('2026-11-11'), true);    // Wednesday
  assert.equal(isClosedDay('2026-11-10'), false);   // Tuesday
  assert.equal(isClosedDay('2026-11-15'), false);   // Sunday
});

test('presets: last 7 days is 7 days, this month starts on the 1st; the span before is as long', () => {
  const p = Object.fromEntries(presets('2026-11-10').map((x) => [x.key, x]));
  assert.deepEqual([p['7'].from, p['7'].to], ['2026-11-04', '2026-11-10']);
  assert.deepEqual([p['14'].from, p.month.from, p.today.from], ['2026-10-28', '2026-11-01', '2026-11-10']);
  assert.deepEqual(spanBefore('2026-11-04', '2026-11-10'), { from: '2026-10-28', to: '2026-11-03' });
  assert.deepEqual(spanBefore('2026-11-10', '2026-11-10'), { from: '2026-11-09', to: '2026-11-09' });
});

test('the header says the range', () => {
  assert.equal(rangeText('2026-11-10', '2026-11-10'), 'Tue, Nov 10');
  assert.equal(rangeText('2026-11-04', '2026-11-10'), 'Nov 4 to Nov 10, 2026');
  assert.equal(longDay('2026-11-09'), 'Mon, Nov 9');
});

test('a row a day, every day there; cash and credit apart; the Till and the Backroom from the cash', () => {
  const buys = [
    { day: '2026-11-04', paid_price: '90.00', paid_method: 'cash', cash_location: 'till',
      buy_lines: [{ quantity: 3 }, { quantity: 1, struck_at: '2026-11-04T20:00:00Z' }] },
    { day: '2026-11-04', paid_price: 0.1, paid_method: 'cash', cash_location: 'backroom', buy_lines: [{ quantity: 1 }] },
    { day: '2026-11-04', paid_price: 0.2, paid_method: 'credit', cash_location: null, buy_lines: [] },
    { day: '2026-11-06', paid_price: 12.5, paid_method: 'cash', cash_location: null },   // from before 0016
    { day: '2026-11-20', paid_price: 99, paid_method: 'cash', cash_location: 'till' },   // out of range
  ];
  const rows = dailyRows(buys, '2026-11-04', '2026-11-06');
  assert.deepEqual(rows.map((r) => r.day), ['2026-11-04', '2026-11-05', '2026-11-06']);
  assert.deepEqual(rows[0], { day: '2026-11-04', cash: 90.1, credit: 0.2, buys: 3, cards: 4, till: 90, backroom: 0.1 });
  assert.deepEqual(rows[1], { day: '2026-11-05', cash: 0, credit: 0, buys: 0, cards: 0, till: 0, backroom: 0 });
  assert.deepEqual(totalOf(rows), { cash: 102.6, credit: 0.2, buys: 4, cards: 4, till: 90, backroom: 0.1 });
});

test('valued bulk isn\'t counted as cards, as on Home', () => {
  const rows = dailyRows([{ day: '2026-11-04', paid_price: 5, paid_method: 'cash',
    buy_lines: [{ quantity: 2 }, { quantity: 100, bulk_kind: 'mtg_100_common', unit_price: 1 }] }], '2026-11-04', '2026-11-04');
  assert.equal(rows[0].cards, 2);
});

test('a day\'s buys: the latest first, each opening where it lives', () => {
  const buys = [
    { id: 'w1', day: '2026-11-04', paid_at: '2026-11-04T18:00:00Z', kind: 'walk_in', number: 44, customer_name: 'A',
      paid_method: 'cash', paid_price: '5.00', cash_location: 'till', buy_lines: [{ game: 'pokemon' }] },
    { id: 'p1', day: '2026-11-04', paid_at: '2026-11-04T20:00:00Z', kind: 'collection', project: true,
      customer_name: 'B', paid_method: 'credit', paid_price: 1000000, cash_location: null, buy_lines: [{ game: 'mtg' }] },
    { id: 'w2', day: '2026-11-05', paid_at: '2026-11-05T18:00:00Z', kind: 'walk_in', number: 45, paid_method: 'cash',
      paid_price: 1, buy_lines: [{ game: 'pokemon' }, { game: 'mtg' }] },
  ];
  assert.deepEqual(buysOn(buys, '2026-11-04'), [
    { id: 'p1', what: 'Project', customer: 'B', method: 'credit', paid: 1000000, location: null,
      path: '/collections/p1', focus: false },
    { id: 'w1', what: 'Buy 44', customer: 'A', method: 'cash', paid: 5, location: 'till',
      path: '/calendar/pokemon/2026-11-04', focus: true },
  ]);
  assert.equal(buysOn(buys, '2026-11-05')[0].path, '/calendar/mtg/2026-11-05');
  assert.deepEqual(buysOn(buys, '2026-11-06'), []);
});

test('a failed load says what to do: wait for the connection, or reload (decision 587)', () => {
  assert.match(reportLoadError(new Error('Failed to fetch dynamically imported module: x.js'), true), /^No connection/);
  assert.equal(reportLoadError(new Error('Failed to fetch dynamically imported module: x.js'), false),
    "The Buys report couldn't load. The app was updated since this page was opened: reload the page (F5) and try again.");
  assert.equal(reportLoadError(new Error('The app was updated since this page was opened: reload the page (F5) and try again.'), false),
    "The Buys report couldn't load. The app was updated since this page was opened: reload the page (F5) and try again.");
  assert.equal(reportLoadError(new Error('boom'), false), "The Buys report couldn't load: reload the page (F5) and try again.");
});

test('hiding closed days leaves them off the graph only', () => {
  const rows = dailyRows([], '2026-11-08', '2026-11-14');   // Sun to Sat
  assert.deepEqual(graphRows(rows, true).map((r) => r.day),
    ['2026-11-08', '2026-11-10', '2026-11-12', '2026-11-13', '2026-11-14']);
  assert.equal(graphRows(rows, false).length, 7);
});
