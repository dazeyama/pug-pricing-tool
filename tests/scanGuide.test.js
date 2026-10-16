import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_RATIO, guideRect, guideStyle } from '../src/scan/guide.js';

// docs/SCAN_FUNCTION.md 5.3, 6.2: the card-shaped guide, centred.

const near = (a, b) => Math.abs(a - b) < 1e-6;

test('a landscape picture: the guide is 86% of its height, card-shaped, centred', () => {
  const r = guideRect(1920, 1280);
  assert.ok(near(r.height, 1280 * 0.86));
  assert.ok(near(r.width / r.height, CARD_RATIO));
  assert.ok(near(r.x * 2 + r.width, 1920));
  assert.ok(near(r.y * 2 + r.height, 1280));
});

test('a narrow portrait picture: the width decides', () => {
  const r = guideRect(720, 1280);
  assert.ok(r.width <= 720 * 0.92 + 1e-6);
  assert.ok(near(r.width / r.height, CARD_RATIO));
  assert.ok(r.height < 1280 * 0.86 + 1e-6);
});

test('as CSS, percentages of the picture', () => {
  const s = guideStyle(1000, 1000);
  assert.ok(near(parseFloat(s.top), 7));          // (100% − 86%) ÷ 2
  assert.ok(near(parseFloat(s.height), 86));
  assert.match(s.width, /%$/);
});
