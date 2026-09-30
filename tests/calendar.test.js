import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayRange, dayTitle, monthGrid, monthRange, monthTitle, parseDay, parseMonth, shiftMonth, storeDay,
} from '../src/lib/calendar.js';

// Spec 10: Sunday-first months on the store's (Pacific) calendar.
test('a buy just before midnight is on that store day', () => {
  // 11:58 PM Pacific on Aug 17 is 06:58 UTC on Aug 18.
  assert.equal(storeDay(new Date('2026-08-18T06:58:00Z')), '2026-08-17');
  assert.equal(storeDay(new Date('2026-08-18T07:02:00Z')), '2026-08-18');
});

test('months from the URL, and moving between them', () => {
  assert.equal(parseMonth('2026-08'), '2026-08');
  assert.equal(parseMonth('2026-13', new Date('2026-09-29T20:00:00Z')), '2026-09');
  assert.equal(parseMonth(null, new Date('2026-09-29T20:00:00Z')), '2026-09');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(monthTitle('2026-08'), 'August 2026');
});

test('days from the URL', () => {
  assert.equal(parseDay('2026-08-17'), '2026-08-17');
  assert.equal(parseDay('2026-02-30'), null);
  assert.equal(parseDay('nonsense'), null);
  assert.equal(dayTitle('2026-08-17'), 'Monday, August 17, 2026');
});

test('August 2026 starts on a Saturday: Sunday-first weeks', () => {
  const weeks = monthGrid('2026-08');
  assert.equal(weeks[0].length, 7);
  assert.deepEqual(weeks[0].slice(5), [null, '2026-08-01']);
  assert.equal(weeks.flat().filter(Boolean).length, 31);
  assert.equal(weeks.at(-1).filter(Boolean).at(-1), '2026-08-31');
});

test('a month and a day as instants in store time', () => {
  const m = monthRange('2026-08');
  assert.equal(m.from.toISOString(), '2026-08-01T07:00:00.000Z');
  assert.equal(m.to.toISOString(), '2026-09-01T07:00:00.000Z');
  // Nov 1 2026 is the fall-back day: 25 hours long.
  const d = dayRange('2026-11-01');
  assert.equal(d.from.toISOString(), '2026-11-01T07:00:00.000Z');
  assert.equal(d.to.toISOString(), '2026-11-02T08:00:00.000Z');
});
