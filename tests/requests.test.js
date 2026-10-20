import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOST_MS, createRequests, requestKey } from '../src/lib/requests.js';

// A write pressed again after its answer was lost is done once (decision 388).

const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};
const LOST = { message: 'TypeError: Failed to fetch' };
const bolt = requestKey('draft_add_line', { p_line: { name: 'Bolt', quantity: 1 } });

test('a press again after a lost answer sends the same id, once', () => {
  const r = createRequests(ids());
  const first = r.idFor(bolt);
  assert.equal(first.again, false);
  r.settle(bolt, first.id, LOST);
  const again = r.idFor(bolt);
  assert.deepEqual(again, { id: first.id, again: true });
  r.settle(bolt, again.id, null);
  assert.notEqual(r.idFor(bolt).id, first.id, 'a further press is a new one');
});

test('the press again gets it even before its answer, but only once', () => {
  const r = createRequests(ids());
  const first = r.idFor(bolt);
  r.settle(bolt, first.id, LOST);
  assert.equal(r.idFor(bolt).id, first.id);
  assert.notEqual(r.idFor(bolt).id, first.id);
});

test('an answered press, or a refusal, gives the next press a new id', () => {
  const r = createRequests(ids());
  const first = r.idFor(bolt);
  r.settle(bolt, first.id, null);
  assert.notEqual(r.idFor(bolt).id, first.id, 'the same card added again on purpose is added again');
  const second = r.idFor(bolt);
  r.settle(bolt, second.id, { message: 'stale_version' });
  assert.notEqual(r.idFor(bolt).id, second.id);
});

test('a lost id is kept two minutes, then a press is a new one', () => {
  let now = 0;
  const r = createRequests(ids(), () => now);
  const first = r.idFor(bolt);
  r.settle(bolt, first.id, LOST);
  now = LOST_MS;
  assert.notEqual(r.idFor(bolt).id, first.id);
});

test('another write after a lost answer gets its own id, and forgets the lost one', () => {
  const r = createRequests(ids());
  const lost = r.idFor(bolt);
  r.settle(bolt, lost.id, { message: 'TimeoutError: signal timed out' });
  const other = requestKey('draft_add_line', { p_line: { name: 'Counterspell', quantity: 1 } });
  const o = r.idFor(other);
  assert.notEqual(o.id, lost.id);
  r.settle(other, o.id, null);
  assert.notEqual(r.idFor(bolt).id, lost.id);
});

test('the key leaves out what changes between two presses of the same write', () => {
  const a = requestKey('collection_add_line', {
    p_buy_id: 'b', p_expected_version: 3, p_request: 'x', p_line: { name: 'Bolt', priced_at: '2026-10-20T07:00:00Z' },
  });
  const b = requestKey('collection_add_line', {
    p_buy_id: 'b', p_expected_version: 4, p_line: { name: 'Bolt', priced_at: '2026-10-20T07:00:05Z' },
  });
  assert.equal(a, b);
  assert.notEqual(a, requestKey('collection_add_line', { p_buy_id: 'b', p_line: { name: 'Bolt', condition: 'LP' } }));
});
