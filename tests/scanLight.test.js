import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDark, lightOf } from '../src/scan/light.js';

// Too dark to read well (owner, 2026-10-18; decision 306).

/** A picture's pixels: `n` of each grey given. */
const pixels = (...greys) => greys.flatMap(([grey, n]) => Array.from({ length: n }, () => [grey, grey, grey, 255]).flat());

test('a black-bordered card in good light: dark on average, its white text bright, not too dark', () => {
  const light = lightOf(pixels([20, 85], [240, 15]));
  assert.ok(light.mean < 60, String(light.mean));
  assert.equal(isDark(light), false);
});

test('a dim picture: nothing gets bright', () => {
  const light = lightOf(pixels([40, 80], [70, 20]));
  assert.equal(isDark(light), true);
});

test('an empty picture is too dark, not an error', () => {
  assert.deepEqual(lightOf([]), { mean: 0, high: 0 });
});
