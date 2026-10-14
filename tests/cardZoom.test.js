import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LENS, lensTransforms } from '../src/lib/cardZoom.js';

const numbers = (t) => t.match(/-?[\d.]+/g).map(Number);

test('the glass sits on the cursor, and what is under the cursor sits in its middle, twice the size', () => {
  const panel = { left: 300, top: 40 };
  const pointer = { x: 420, y: 700 };
  const t = lensTransforms(pointer, panel);
  const [lx, ly] = numbers(t.lens);
  assert.deepEqual([lx + LENS.size / 2, ly + LENS.size / 2], [pointer.x, pointer.y]);
  const [vx, vy, zoom] = numbers(t.view);
  assert.equal(zoom, LENS.zoom);
  // The panel's point under the cursor (120, 660), in the copy: at the zoom circle's middle.
  const middle = LENS.size / 2 - LENS.rim;
  assert.deepEqual([vx + zoom * 120, vy + zoom * 660], [middle, middle]);
});

test('the panel’s top-left corner under the cursor shows the copy’s corner in the middle', () => {
  const t = lensTransforms({ x: 10, y: 20 }, { left: 10, top: 20 }, { size: 100, rim: 10, zoom: 3 });
  assert.equal(t.view, 'translate(40px, 40px) scale(3)');
  assert.equal(t.lens, 'translate(-40px, -30px)');
});
