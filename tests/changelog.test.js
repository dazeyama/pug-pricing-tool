import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  actionsFor, categoryOf, dayHeading, entryWhen, foldEvents, panelView,
} from '../src/lib/changelog.js';

let seq = 1000;
const ev = (over) => ({
  seq: seq--,
  at: '2026-09-29T20:00:00Z',
  action: 'collection_cards_added',
  target_id: 'c1',
  staff_user_id: 'u1',
  games: ['mtg'],
  added: 1,
  removed: 0,
  lines: [{ sign: '+', qty: 1, game: 'mtg', unit_price: 2, text: '1 Sol Ring (CMR) 472' }],
  totals: { market: 2, cash: 0.66, credit: 1.32, cash_pct: 33, credit_pct: 66 },
  fields: [],
  ...over,
});
const min = (m) => new Date(Date.UTC(2026, 8, 29, 20, 0) - m * 60_000).toISOString();

// Owner, 2026-10-02: Buys and Collections are cards in or out; the rest is Actions.
test('categories', () => {
  assert.equal(categoryOf('collection_status_changed'), 'actions');
  assert.equal(categoryOf('day_exported'), 'actions');
  assert.equal(categoryOf('collection_info_edited'), 'actions');
  assert.equal(categoryOf('buy_cards_removed'), 'buys');
  assert.equal(categoryOf('collection_cards_added'), 'collections');
  assert.equal(categoryOf('collection_created'), 'collections');
  assert.equal(categoryOf('buy_converted'), 'buys');
  assert.ok(actionsFor(['buys']).includes('backup_restored'));
  assert.ok(!actionsFor(['buys', 'collections']).includes('collection_info_edited'));
});

test('a run of adds by one user within 15 minutes folds into one panel', () => {
  const events = [ev({ at: min(0) }), ev({ at: min(10) }), ev({ at: min(20) }), ev({ at: min(40) })];
  const panels = foldEvents(events);
  assert.deepEqual(panels.map((p) => p.events.length), [3, 1]);   // 20 → 40 is a 20-minute gap
  const v = panelView(panels[0]);
  assert.equal(v.added, 3);
  assert.equal(v.totals.market, 6);
  assert.ok(v.folded);
});

test('other collections in between do not break a run; its own other entries do', () => {
  const interleaved = foldEvents([
    ev({ at: min(0) }), ev({ at: min(2), target_id: 'c2' }), ev({ at: min(4) }),
  ]);
  assert.deepEqual(interleaved.map((p) => p.events.length), [2, 1]);
  const broken = foldEvents([
    ev({ at: min(0) }), ev({ at: min(2), action: 'collection_status_changed', lines: [] }), ev({ at: min(4) }),
  ]);
  assert.equal(broken.length, 3);
});

test('different users, removals and card edits do not fold together', () => {
  assert.equal(foldEvents([ev({ at: min(0) }), ev({ at: min(1), staff_user_id: 'u2' })]).length, 2);
  assert.equal(foldEvents([ev({ at: min(0) }), ev({ at: min(1), action: 'collection_cards_removed' })]).length, 2);
  assert.equal(foldEvents([
    ev({ at: min(0), action: 'collection_line_edited' }), ev({ at: min(1), action: 'collection_line_edited' }),
  ]).length, 2);
});

// Owner, 2026-09-29: under a game filter a mixed buy still shows whole.
test('a mixed buy shows whole: both games, all its cards and totals', () => {
  const buy = ev({
    action: 'buy_confirmed',
    games: ['mtg', 'pokemon'],
    added: 3,
    lines: [
      { sign: '+', qty: 2, game: 'mtg', unit_price: 10, text: '2 Sol Ring (CMR) 472' },
      { sign: '+', qty: 1, game: 'pokemon', unit_price: 5, text: '1 Pikachu (BS) 58' },
    ],
    totals: { market: 25, cash: 8.25, credit: 16.5, cash_pct: 33, credit_pct: 66 },
  });
  const [panel] = foldEvents([buy]);
  const v = panelView(panel);
  assert.equal(v.rows.length, 2);
  assert.equal(v.added, 3);
  assert.equal(v.totals.market, 25);
  assert.equal(v.totals.cash, 8.25);
  assert.deepEqual(v.games, ['mtg', 'pokemon']);
});

test('days and times in store time', () => {
  const now = new Date('2026-09-29T20:00:00Z');
  assert.equal(dayHeading('2026-09-29T16:00:00Z', now), 'Today · September 29, 2026');
  assert.equal(dayHeading('2026-09-29T02:00:00Z', now), 'Yesterday · September 28, 2026');   // 7 PM on the 28th, Pacific
  assert.equal(dayHeading('2026-08-17T21:37:00Z', now), 'August 17, 2026');
  assert.equal(entryWhen('2026-08-17T21:37:00Z'), 'August 17, 2026 at 2:37 PM');
  assert.equal(entryWhen('2026-08-17T21:41:00Z', '2026-08-17T21:04:00Z'), 'August 17, 2026 · 2:04 – 2:41 PM');
});
