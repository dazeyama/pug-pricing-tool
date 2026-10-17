import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { sharpness, skewAngle, straightCutout } from '../src/scan/straighten.js';

// Owner, 2026-10-16: the collector corner, found on each card and set straight.

const make = (w, h) => createCanvas(w, h);

/** Two left-aligned lines of small light "letters" on a dark border, turned `deg` degrees about (cx, cy). */
function drawLines(ctx, { x, y, letter, deg, cx, cy, light = '#eee' }) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = light;
  for (const [row, count] of [[0, 9], [1, 13]]) {
    for (let i = 0; i < count; i++) {
      if (i === 4) continue;   // a space between words
      ctx.fillRect(x + i * letter * 0.85, y + row * letter * 1.45, letter * 0.6, letter);
    }
  }
  ctx.restore();
}

function greys(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  return Float32Array.from({ length: canvas.width * canvas.height }, (_, k) => 0.299 * data[4 * k] + 0.587 * data[4 * k + 1] + 0.114 * data[4 * k + 2]);
}

for (const deg of [0, 3, -5, 8]) {
  test(`a line leaning ${deg}° is measured as leaning ${deg}°`, () => {
    const c = createCanvas(420, 160);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 420, 160);
    drawLines(ctx, { x: 40, y: 50, letter: 18, deg, cx: 210, cy: 80 });
    assert.ok(Math.abs(skewAngle(greys(c), 420, 160, true) - deg) <= 1, `measured ${skewAngle(greys(c), 420, 160, true)}`);
  });
}

test('on a card in the holder: the line is found where it is on this card, and set level', () => {
  const frame = createCanvas(1080, 1920);
  const ctx = frame.getContext('2d');
  ctx.fillStyle = '#d8d4cc';
  ctx.fillRect(0, 0, 1080, 1920);
  const card = { x: 270, y: 620, width: 544, height: 760 };
  ctx.fillStyle = '#141414';
  ctx.fillRect(card.x, card.y, card.width, card.height);
  // This card's line sits a little right of and below where the locked card's was, leaning 4°.
  drawLines(ctx, { x: card.x + 48, y: card.y + 718, letter: 9, deg: 4, cx: card.x + 100, cy: card.y + 726 });
  const lock = {
    card,
    collector: { x: card.x + 20, y: card.y + 700, width: 160, height: 40 },
    charHeight: 9,
  };
  const out = straightCutout(frame, lock, make);
  assert.equal(out.found, true, 'found on this card');
  assert.ok(Math.abs(out.tilt - 4) <= 1, `tilt ${out.tilt}`);
  assert.ok(out.canvas.width > 160 && out.canvas.height > 40, 'enlarged');
});

test('sharpness: letters in focus score well above 2, the same blurred well below, a blank patch 0', () => {
  const draw = (blur) => {
    const c = createCanvas(420, 160);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 420, 160);
    if (blur) ctx.filter = `blur(${blur}px)`;
    drawLines(ctx, { x: 40, y: 50, letter: 18, deg: 0, cx: 210, cy: 80 });
    ctx.filter = 'none';
    return c;
  };
  const sharp = sharpness(greys(draw(0)), 420, 160, 18);
  const soft = sharpness(greys(draw(6)), 420, 160, 18);
  assert.ok(sharp > 3, `in focus ${sharp}`);
  assert.ok(soft < 2, `blurred ${soft}`);
  const blank = createCanvas(100, 40);
  blank.getContext('2d').fillRect(0, 0, 100, 40);
  assert.equal(sharpness(greys(blank), 100, 40, 10), 0);
});
