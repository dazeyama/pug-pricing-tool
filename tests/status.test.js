import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectionKind, collectionRates, isPulled, statusText, statusTone, walkInStatus } from '../src/pages/collections/status.js';

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

test('the three kinds of collection (decision 421): system, project, overnight', () => {
  assert.equal(collectionKind({ system_key: 'cant_upload', project: false }), 'system');
  assert.equal(collectionKind({ system_key: null, project: true }), 'project');
  assert.equal(collectionKind({ system_key: null, project: false }), 'overnight');
  assert.equal(collectionKind(null), 'overnight');
});

test("a chip's words: Ours for the store's own cards, the label otherwise", () => {
  assert.equal(statusText({ status: 'paid', system_key: 'cant_upload' }), 'Ours');
  assert.equal(statusTone({ status: 'paid', system_key: 'cant_upload' }), 'tone-ours');
  assert.equal(statusText({ status: 'paid', project: true }), 'Ours');
  assert.equal(statusText({ status: 'paid', paid_method: 'cash' }), 'Paid/Ours');
  assert.equal(statusText({ status: 'processing' }), 'Processing');
  assert.equal(statusTone({ status: 'rejected' }), 'tone-rejected');
});

test('Bulk pulled from exports reads Completed, in grey, whatever the database says (decision 423)', () => {
  const pulled = { status: 'paid', system_key: 'pulled' };
  assert.ok(isPulled(pulled));
  assert.equal(statusText(pulled), 'Completed');
  assert.equal(statusTone(pulled), 'tone-completed');
  assert.ok(!isPulled({ status: 'paid', system_key: 'cant_upload' }));
});
