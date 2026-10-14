import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uiZoom } from '../src/lib/uiScale.js';

test('full size on a big window, 80% on the smallest, the tighter side deciding in between', () => {
  assert.equal(uiZoom(1920, 1080), 1);
  assert.equal(uiZoom(1500, 813), 1);
  assert.equal(uiZoom(1200, 650), 0.8);    // the work laptops (owner, 2026-10-14)
  assert.equal(uiZoom(1200, 500), 0.8);    // never below 80%
  assert.equal(uiZoom(1366, 768), 0.91);   // its width decides
  assert.equal(uiZoom(1920, 700), 0.86);   // its height decides
});
