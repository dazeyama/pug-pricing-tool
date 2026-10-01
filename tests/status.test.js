import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusTone, walkInStatus } from '../src/pages/collections/status.js';

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

test('a walk-in Paid/Ours chip is neutral; a collection\'s follows how it was paid', () => {
  assert.equal(statusTone({ kind: 'walk_in', status: 'paid' }), 'tone-paid-walkin');
  assert.equal(statusTone({ kind: 'walk_in', status: 'completed' }), 'tone-completed');
  assert.equal(statusTone({ status: 'paid', paid_method: 'credit' }), 'tone-paid-credit');
  assert.equal(statusTone({ status: 'paid', paid_method: 'cash' }), 'tone-paid-cash');
});
