import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyCopyRow, sheetDate, sheetLocation, sheetMoney } from '../src/lib/buyCopy.js';

// Made-up people and numbers only.
const staff = { u1: 'DBTEST Sam', u2: 'DBTEST Riley' };
const name = (id) => staff[id];

const walkIn = {
  kind: 'walk_in',
  created_by: 'u2',
  created_at: '2026-11-10T19:00:00Z',
  confirmed_by: 'u1',
  confirmed_at: '2026-11-10T20:05:00Z',
  customer_name: 'Test Customer',
  phone: '5555550100',
  id_last4: null,
  paid_method: 'cash',
  paid_by: 'u1',
  paid_at: '2026-11-10T20:05:00Z',
  paid_price: 90,
  cash_location: 'till',
};

test('a walk-in buy: ten cells, tab-separated, as the sheet keeps them', () => {
  const row = buyCopyRow(walkIn, name);
  assert.equal(row, 'DBTEST Sam\t11/10/2026\tTest Customer\t(555) 555-0100\t\tCash\tDBTEST Sam\t11/10/2026\t$90.00\tTill');
  assert.equal(row.split('\t').length, 10);
});

test('credit is NA, whatever was kept; the ID\'s last four when the buy has them', () => {
  const row = buyCopyRow({ ...walkIn, paid_method: 'credit', cash_location: null, id_last4: '0420', paid_price: 12.5 }, name);
  assert.deepEqual(row.split('\t').slice(4), ['0420', 'Credit', 'DBTEST Sam', '11/10/2026', '$12.50', 'NA']);
});

test('an overnight buy: who started it and when, then who paid it and when', () => {
  const row = buyCopyRow({
    ...walkIn, kind: 'collection', confirmed_by: null, confirmed_at: null,
    created_at: '2026-11-08T22:00:00Z', paid_by: 'u1', paid_at: '2026-11-10T18:00:00Z', cash_location: 'backroom',
  }, name);
  assert.deepEqual(row.split('\t'), [
    'DBTEST Riley', '11/08/2026', 'Test Customer', '(555) 555-0100', '', 'Cash', 'DBTEST Sam', '11/10/2026', '$90.00',
    'Backroom',
  ]);
});

test('a buy from before decision 580: no payer or cash location kept, so those cells are empty', () => {
  const row = buyCopyRow({ ...walkIn, paid_by: null, cash_location: null }, name);
  assert.deepEqual(row.split('\t').slice(5), ['Cash', '', '11/10/2026', '$90.00', '']);
});

test('the store\'s day, not UTC: 11:30 pm Pacific is still that day', () => {
  assert.equal(sheetDate('2026-11-11T07:30:00Z'), '11/10/2026');
  assert.equal(sheetDate(null), '');
  assert.equal(sheetDate('not a date'), '');
});

test('money always with cents; none is empty', () => {
  assert.equal(sheetMoney(90), '$90.00');
  assert.equal(sheetMoney('1234.5'), '$1,234.50');
  assert.equal(sheetMoney(0), '$0.00');
  assert.equal(sheetMoney(null), '');
});

test('the location: Till, Backroom, NA on credit, empty for cash with none', () => {
  assert.equal(sheetLocation('cash', 'till'), 'Till');
  assert.equal(sheetLocation('cash', 'backroom'), 'Backroom');
  assert.equal(sheetLocation('credit', 'till'), 'NA');
  assert.equal(sheetLocation('cash', null), '');
});

test('a tab or line break in a name can\'t split the row; an unknown worker is an empty cell', () => {
  const row = buyCopyRow({ ...walkIn, customer_name: 'Test\tCustomer\nTwo', confirmed_by: 'u9' }, name);
  assert.equal(row.split('\t').length, 10);
  assert.equal(row.split('\t')[0], '');
  assert.equal(row.split('\t')[2], 'Test Customer Two');
});
