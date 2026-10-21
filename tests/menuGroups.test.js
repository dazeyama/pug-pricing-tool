import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenGroups } from '../src/lib/menuGroups.js';

const leaf = (label) => ({ label, onClick: () => {} });

test('menu groups (decision 422): kept with two or more items, a group of one is its item, an empty one is dropped', () => {
  const items = flattenGroups([
    leaf('Mark as completed'),
    { label: 'Print', items: [leaf('Print buy (all)'), leaf('Print buy (>$1.49)')] },
    { label: 'Export', items: [leaf('Complete day…')] },
    { label: 'Convert', items: [null, false] },
    null,
    leaf('Delete buy…'),
  ]);
  assert.deepEqual(items.map((i) => [i.label, i.items?.map((x) => x.label) ?? null]), [
    ['Mark as completed', null],
    ['Print', ['Print buy (all)', 'Print buy (>$1.49)']],
    ['Complete day…', null],
    ['Delete buy…', null],
  ]);
  // A group's null entries (a print the page doesn't offer) are dropped, the rest kept.
  assert.deepEqual(flattenGroups([{ label: 'Print', items: [leaf('A'), null, leaf('B')] }])[0].items.map((x) => x.label), ['A', 'B']);
  assert.deepEqual(flattenGroups(null), []);
});
