import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBack } from '../src/pages/price/confirmReadBack.js';

// CONFIRM BUY's read-back after a lost answer (decisions 363, 367).
const attempt = {
  userId: 'u1',
  sent: { customerName: 'Pat Lee', phone: '5035551234', notes: '  ', paidPrice: 12.5, paidMethod: 'cash' },
  lines: [{ id: 'a', quantity: 2 }, { id: 'b', quantity: 1 }],
};
const row = (over = {}) => ({
  status: 'confirmed', number: 44, confirmed_by: 'u1', customer_name: 'Pat Lee', phone: '5035551234', notes: '',
  paid_price: '12.50', paid_method: 'cash',
  buy_lines: [{ id: 'b', game: 'pokemon', quantity: 1 }, { id: 'a', game: 'mtg', quantity: 2 }],
  ...over,
});

test("this tab's confirm, as the buy keeps it: Magic before Pokémon", () => {
  assert.deepEqual(readBack(row(), attempt),
    { state: 'mine', result: { number: 44, games: ['mtg', 'pokemon'], target_name: null } });
  // The phone as typed in the dialog, with a country code: the same number.
  assert.equal(readBack(row(), { ...attempt, sent: { ...attempt.sent, phone: '1 (503) 555-1234' } }).state, 'mine');
});

test('still a draft: it was not confirmed', () => {
  assert.deepEqual(readBack(row({ status: 'draft', number: null }), attempt), { state: 'draft' });
});

test("another tab's confirm, or a buy gone: not this one", () => {
  assert.equal(readBack(null, attempt).state, 'other', 'cancelled');
  assert.equal(readBack(row({ confirmed_by: 'u2' }), attempt).state, 'other', 'another user');
  assert.equal(readBack(row({ paid_price: '15.00' }), attempt).state, 'other', 'another price');
  assert.equal(readBack(row({ paid_method: 'credit' }), attempt).state, 'other');
  assert.equal(readBack(row({ customer_name: 'Pat Leigh' }), attempt).state, 'other');
  assert.equal(readBack(row({ phone: '5035559999' }), attempt).state, 'other');
  assert.equal(readBack(row({ notes: 'binder' }), attempt).state, 'other');
  assert.equal(readBack(row({ buy_lines: [{ id: 'a', game: 'mtg', quantity: 3 }, { id: 'b', game: 'pokemon', quantity: 1 }] }),
    attempt).state, 'other', 'another quantity');
  assert.equal(readBack(row({ buy_lines: [{ id: 'a', game: 'mtg', quantity: 2 }] }), attempt).state, 'other', 'a card fewer');
});
