import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceEms } from '../src/lib/priceFit.js';

// Decision 505: a condition button's price sized from its width in ems (measured: "$63.50" 59.7px at 18px).
test("a price's width in ems, from what it's made of", () => {
  assert.equal(priceEms('$63.50'), 3.32);
  assert.equal(priceEms('$1,234.50'), 4.74);
  assert.equal(priceEms('$63'), 1.8);
  assert.ok(priceEms('$163.50') > priceEms('$63.50'));
  assert.ok(priceEms('$1,234') < priceEms('$1,234.50'));
});
