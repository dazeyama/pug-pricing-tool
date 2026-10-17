import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { judgeFinishMark, marksOn, stripShowsFoil } from '../src/scan/foilMark.js';

// Owner, 2026-10-16: the star between the set code and the language means foil; a dot, not.

const LETTER = 48;

/** A strip as straighten.js leaves it: black on white, two lines of letter-sized marks. */
function strip(mark, { spaced = true } = {}) {
  const c = createCanvas(900, 160);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 900, 160);
  ctx.fillStyle = '#000';
  const letter = (x, y) => ctx.fillRect(x, y, 30, LETTER);
  // "U 0151"
  [20, 90, 130, 170, 210].forEach((x) => letter(x, 15));
  // "TMT ★ EN" and the artist's name
  const y = 90;
  let x = 20;
  for (let i = 0; i < 3; i++, x += 38) letter(x, y);
  const gap = spaced ? 14 : -4;   // run in: touching the letters either side
  const cx = (x - 8) + gap + 20;   // the last letter's right edge, the gap, the mark's half-width
  const cy = y + LETTER / 2;
  if (mark === 'dot') {
    ctx.beginPath();
    ctx.arc(cx, cy, LETTER * 0.21, 0, Math.PI * 2);
    ctx.fill();
  } else if (mark === 'star') {
    const R = LETTER * 0.42;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? R * 0.42 : R;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      ctx[k ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();
  }
  x = cx + 20 + gap;
  for (let i = 0; i < 2; i++, x += 38) letter(x, y);   // EN
  for (let i = 0; i < 6; i++, x += 38) letter(x + 40, y);
  return c;
}

test('a star between the set code and the language: foil', () => {
  const j = judgeFinishMark(marksOn(strip('star')));
  assert.equal(j?.mark, 'star', JSON.stringify(j));
  assert.equal(stripShowsFoil(strip('star')), true);
});

test('a dot there: not foil', () => {
  const j = judgeFinishMark(marksOn(strip('dot')));
  assert.equal(j?.mark, 'dot', JSON.stringify(j));
  assert.equal(stripShowsFoil(strip('dot')), false);
});

test('no mark found: not foil', () => {
  assert.equal(judgeFinishMark(marksOn(strip(null))), null);
  assert.equal(stripShowsFoil(strip(null)), false);
  const blank = createCanvas(300, 80);
  const ctx = blank.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 300, 80);
  assert.equal(stripShowsFoil(blank), false);
});

test('a mark run into the letters is not taken for the finish mark', () => {
  assert.equal(judgeFinishMark(marksOn(strip('star', { spaced: false }))), null);
});
