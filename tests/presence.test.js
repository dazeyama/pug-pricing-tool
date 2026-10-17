import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whoIsOn } from '../src/lib/presence.js';

// The home page's "N Connected" and "N Users selected" (decision 284).

test('who is on: computers by name; users by name with their computers; two tabs of one computer count once', () => {
  const state = {
    'dev-b': [{ label: 'Back Office', user_id: 'u2', user_name: 'Sam', user_color: 'teal' }],
    'dev-a': [
      { label: 'Front Counter', user_id: 'u1', user_name: 'Dana', user_color: 'crimson' },
      { label: 'Front Counter', user_id: null },
    ],
    'dev-c': [{ label: 'Register 2', user_id: 'u1', user_name: 'Dana', user_color: 'crimson' }],
  };
  const w = whoIsOn(state);
  assert.deepEqual(w.computers.map((c) => c.label), ['Back Office', 'Front Counter', 'Register 2']);
  assert.deepEqual(w.users.map((u) => [u.name, u.color, u.computers]), [
    ['Dana', 'crimson', ['Front Counter', 'Register 2']],
    ['Sam', 'teal', ['Back Office']],
  ]);
});

test('who is on: nothing, and a tab that said nothing yet', () => {
  assert.deepEqual(whoIsOn({}), { computers: [], users: [] });
  assert.deepEqual(whoIsOn(undefined), { computers: [], users: [] });
  assert.deepEqual(whoIsOn({ 'dev-x': [{}] }), { computers: [{ id: 'dev-x', label: 'A computer' }], users: [] });
});
