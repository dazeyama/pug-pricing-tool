import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectionRates, statusTone, walkInStatus } from '../src/pages/collections/status.js';

// Owner, 2026-09-30: a walk-in buy is Paid/Ours until exported, then Completed, game by game.
test('a walk-in buy is Completed for a game once all its cards in that game are exported', () => {
  const buy = { buy_lines: [
    { game: 'mtg', completed_at: '2026-09-30T20:00:00Z' },
    { game: 'mtg', completed_at: '2026-09-30T20:00:00Z' },
    { game: 'pokemon', completed_at: null },
  ] };
  assert.equal(walkInStatus(buy, 'mtg'), 'completed');
  assert.equal(walkInStatus(buy, 'pokemon'), 'paid');
  buy.buy_lines[1].completed_at = null;
  assert.equal(walkInStatus(buy, 'mtg'), 'paid');
});

test('Paid/Ours follows how it was paid; a walk-in from before the price was asked is neutral', () => {
  assert.equal(statusTone({ kind: 'walk_in', status: 'paid' }), 'tone-paid-walkin');
  assert.equal(statusTone({ kind: 'walk_in', status: 'paid', paid_method: 'credit' }), 'tone-paid-credit');
  assert.equal(statusTone({ kind: 'walk_in', status: 'completed' }), 'tone-completed');
  assert.equal(statusTone({ status: 'paid', paid_method: 'credit' }), 'tone-paid-credit');
  assert.equal(statusTone({ status: 'paid', paid_method: 'cash' }), 'tone-paid-cash');
});

// Owner, 2026-10-15: a project has no rates of its own, whatever it carries.
test("a project's rates are always the default ones", () => {
  const master = { cash: 33, credit: 66, tiers: { low: {}, high: {} } };
  const project = { project: true, status: 'paid', cash_pct: 40, credit_pct: 60, custom_cash_pct: 45, custom_credit_pct: 55 };
  assert.deepEqual(collectionRates(project, master),
    { cash: 33, credit: 66, customCash: null, customCredit: null, tiers: master.tiers });
  const kept = { project: false, status: 'paid', cash_pct: 40, credit_pct: 60, custom_cash_pct: null, custom_credit_pct: null };
  assert.equal(collectionRates(kept, master).cash, 40);
});
