import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_RATIO, guideRect, insetTo, onScreen, showPart } from '../src/scan/guide.js';

// docs/SCAN_FUNCTION.md 5.3: how the camera's picture is shown, and the guide older cards are read from.

const near = (a, b) => Math.abs(a - b) < 1e-6;

test('the guide: card-shaped and centred', () => {
  const r = guideRect(1920, 1280);
  assert.ok(near(r.height, 1280 * 0.86));
  assert.ok(near(r.width / r.height, CARD_RATIO));
  assert.ok(near(r.x * 2 + r.width, 1920));
  const tall = guideRect(720, 1280);
  assert.ok(tall.width <= 720 * 0.92 + 1e-6);
});

test('before the lock: the whole picture covers the space, its own shape kept', () => {
  const picture = { width: 1080, height: 1920 };
  const s = showPart(picture, { x: 0, y: 0, ...picture }, 364, 344, 'cover');
  assert.ok(s.x <= 1e-6 && s.y <= 1e-6 && s.x + s.width >= 364 - 1e-6 && s.y + s.height >= 344 - 1e-6, 'no bands');
  assert.ok(near(s.width / s.height, 1080 / 1920));
});

test('locked: the card, all of it, as large as fits, centred', () => {
  const picture = { width: 1080, height: 1920 };
  const card = { x: 300, y: 600, width: 500, height: 700 };
  const s = showPart(picture, card, 364, 344, 'contain');
  const r = onScreen(s, card);
  assert.ok(r.left >= -1e-6 && r.top >= -1e-6 && r.left + r.width <= 364 + 1e-6 && r.top + r.height <= 344 + 1e-6, 'all of it');
  assert.ok(near(r.height, 344) || near(r.width, 364), 'as large as fits');
  assert.ok(near(r.left * 2 + r.width, 364) && near(r.top * 2 + r.height, 344), 'centred');
  assert.ok(near(s.width / s.height, 1080 / 1920), 'never stretched');
});

test('locked: the video cut to the card at its sides as well as its top and bottom', () => {
  const picture = { width: 1000, height: 2000 };
  const card = { x: 300, y: 500, width: 400, height: 560 };
  const s = showPart(picture, card, 400, 280, 'contain');   // scale 0.5: the card 200 × 280
  assert.equal(insetTo(s, card), 'inset(250px 150px 470px 150px)');
});
