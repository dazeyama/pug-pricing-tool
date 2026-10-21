import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  READ_ORDER, TABLES, backupDue, backupFileName, checkBackup, countsOf, daysSince, emptyLearned, extraColumns, tidyTables,
} from '../src/lib/backup.js';

// Decision 426: the backup read a table and a page at a time, made whole again.
test('every backup table is read, children before the buys, users and computers they point at', () => {
  const order = READ_ORDER.map((r) => r.table);
  for (const t of [...TABLES, 'cc_set_map', 'cc_product_links', 'import_links']) assert.ok(order.includes(t), t);
  assert.ok(order.indexOf('buy_lines') < order.indexOf('buys'));
  for (const child of ['buys', 'buy_lines', 'settings', 'cc_set_map', 'cc_product_links', 'import_links']) {
    assert.ok(order.indexOf(child) < order.indexOf('staff_users'), child);
  }
  assert.ok(order.indexOf('buys') < order.indexOf('devices'));
});

test('pages made whole: a row read twice kept once, a card whose buy went dropped, a dangling copy link cleared', () => {
  const tables = tidyTables({
    buys: [{ id: 'b1' }, { id: 'b1' }],
    buy_lines: [
      { id: 'l1', buy_id: 'b1', source_line_id: null },
      { id: 'l2', buy_id: 'b1', source_line_id: 'l9' },
      { id: 'l2', buy_id: 'b1', source_line_id: 'l9' },
      { id: 'l9', buy_id: 'gone', source_line_id: null },
    ],
    events: [{ seq: 1, search_text: 'x', search_digits: '1', summary: 'a' }, { seq: 1, summary: 'a' }],
    settings: [{ key: 'a' }],
    cc_set_map: [{ scryfall_set: 'lea', promo_kind: '' }, { scryfall_set: 'lea', promo_kind: 'prerelease' }],
  });
  assert.deepEqual(tables.buys, [{ id: 'b1' }]);
  assert.deepEqual(tables.buy_lines.map((l) => [l.id, l.source_line_id]), [['l1', null], ['l2', null]]);
  assert.deepEqual(tables.events, [{ seq: 1, summary: 'a' }]);
  assert.equal(tables.cc_set_map.length, 2);
  assert.equal(tables.devices, undefined);   // a table not read stays out
});

// Decision 398: what a restore would leave out, and what it leaves as it is.
test("the file's columns the database lacks, table by table", () => {
  const tables = {
    buys: [{ id: 'b1', kind: 'walk_in', kept_buy_id: null, future_col: 1 }, { id: 'b2', other_new: 'x' }],
    buy_lines: [{ id: 'l1', name: 'Bolt' }],
    events: [],
    unknown_table: [{ id: 'u' }],
  };
  const columns = { buys: ['id', 'kind', 'kept_buy_id'], buy_lines: ['id', 'name'], events: ['seq'] };
  assert.deepEqual(extraColumns(tables, columns), [{ table: 'buys', columns: ['future_col', 'other_new'] }]);
  assert.deepEqual(extraColumns(tables, {}), [], "a table the database doesn't list isn't guessed at");
});

test('a learned-match list that is there but empty is kept as it is here', () => {
  assert.deepEqual(emptyLearned({ cc_set_map: [], cc_product_links: [{ scryfall_id: 'x' }] }), ['cc_set_map']);
  assert.deepEqual(emptyLearned({}), [], 'an older file without them restores as before');
});

const good = () => ({
  format: 'pug-pricing-backup',
  version: 1,
  exported_at: '2026-09-30T20:00:00Z',
  app_version: '0.9.0-dev',
  tables: {
    staff_users: [{ id: 'u1', active: true }, { id: 'u2', active: false }],
    devices: [{ id: 'd1' }],
    buys: [
      { id: 'b1', kind: 'walk_in', status: 'confirmed' },
      { id: 'b2', kind: 'walk_in', status: 'draft' },
      { id: 'c1', kind: 'collection', status: 'completed' },
    ],
    buy_lines: [{ id: 'l1' }, { id: 'l2' }],
    events: [{ seq: 1 }, { seq: 2 }, { seq: 3 }],
    settings: [{ key: 'cash_pct', value: 33 }],
  },
});

test('a good backup passes, with counts like backup_counts()', () => {
  const r = checkBackup(good());
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { buys: 1, collections: 1, lines: 2, events: 3, users: 1 });
  assert.equal(r.appVersion, '0.9.0-dev');
  assert.deepEqual(countsOf({}), { buys: 0, collections: 0, lines: 0, events: 0, users: 0 });
});

test('anything else is refused, saying why', () => {
  assert.match(checkBackup(null).error, /isn't a PUG Pricing Tool backup/);
  assert.match(checkBackup({ format: 'other' }).error, /isn't a PUG Pricing Tool backup/);
  assert.match(checkBackup({ ...good(), version: 2 }).error, /version 2/);
  const partial = good();
  delete partial.tables.events;
  assert.match(checkBackup(partial).error, /no events/);
  const damaged = good();
  damaged.tables.buys.push({ kind: 'walk_in' });
  assert.match(checkBackup(damaged).error, /buys rows have no ID/);
});

test('file names carry the store-time stamp', () => {
  const when = new Date('2026-09-30T22:42:10Z');   // 3:42:10 PM Pacific
  assert.equal(backupFileName(when), 'pug-pricing-backup-20260930-154210.json');
  assert.equal(backupFileName(when, 'before-restore'), 'pug-pricing-backup-20260930-154210-before-restore.json');
});

test('the reminder: never backed up, or more than 7 days ago', () => {
  const now = Date.parse('2026-09-30T20:00:00Z');
  assert.equal(daysSince(null, now), null);
  assert.equal(daysSince('2026-09-22T20:00:00Z', now), 8);
  assert.equal(backupDue(null, now), true);
  assert.equal(backupDue('2026-09-23T20:00:01Z', now), false);   // 6.99 days
  assert.equal(backupDue('2026-09-22T19:00:00Z', now), true);    // 8 days
});
