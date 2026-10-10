import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerKey, likeEscape, rankCustomers } from '../src/lib/customers.js';

test('customerKey: trimmed, single spaces, lower case (as the database keys it)', () => {
  assert.equal(customerKey('  Jordan   Reyes '), 'jordan reyes');
  assert.equal(customerKey(null), '');
});

test('likeEscape: % _ and \\ match only themselves', () => {
  assert.equal(likeEscape('50%_off\\'), '50\\%\\_off\\\\');
});

test('rankCustomers: start of name, then a word, then anywhere; newest first within each', () => {
  const rows = [
    { name_key: 'sam okafor', name: 'Sam Okafor', phone: '5035550187', last_used: '2026-10-01T00:00:00Z' },
    { name_key: 'jo samuels', name: 'Jo Samuels', phone: null, last_used: '2026-10-08T00:00:00Z' },
    { name_key: 'sammy lee', name: 'Sammy Lee', phone: '5035550100', last_used: '2026-10-05T00:00:00Z' },
    { name_key: 'chelsam', name: 'Chelsam', phone: null, last_used: '2026-10-09T00:00:00Z' },
    { name_key: 'taylor brooks', name: 'Taylor Brooks', phone: null, last_used: '2026-10-09T00:00:00Z' },
  ];
  assert.deepEqual(rankCustomers(rows, 'Sam').map((r) => r.name), ['Sammy Lee', 'Sam Okafor', 'Jo Samuels', 'Chelsam']);
  assert.deepEqual(rankCustomers(rows, 's'), [], 'one letter suggests nothing');
  assert.equal(rankCustomers(rows, 'sam', 2).length, 2);
});
