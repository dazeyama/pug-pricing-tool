import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowEdges, textBands } from '../src/scan/titles.js';

// Finding an older card's title (owner, 2026-10-19; decision 308).

test('rowEdges counts the changes across each row', () => {
  const w = 10;
  const flat = Array(w).fill(200);
  const striped = Array.from({ length: w }, (_, x) => (x % 2 ? 0 : 255));
  const e = rowEdges([...flat, ...striped], w, 2);
  assert.equal(e[0], 0);
  assert.ok(Math.abs(e[1] - 0.9) < 1e-6, String(e[1]));
});

test('textBands: the band with text in its middle and calm rims, not the busy art below it', () => {
  // Rows: border (calm), title bar margin, text, margin, then busy art all the way down.
  const edges = [
    ...Array(10).fill(0.01),   // border
    ...Array(4).fill(0.02),    // the bar's top margin
    ...Array(12).fill(0.3),    // the title's letters
    ...Array(4).fill(0.02),    // the bar's bottom margin
    ...Array(30).fill(0.35),   // the art
  ];
  const [best] = textBands(edges, 20, 3);
  assert.ok(best.at >= 9 && best.at <= 11, `band at ${best.at}`);
});

test('textBands: nothing like text, nothing offered', () => {
  assert.deepEqual(textBands(Array(40).fill(0.2), 10), []);
});

test('whiteThreshold: the white letters, in a bright scan and in a dim photo', async () => {
  const { whiteThreshold } = await import('../src/scan/titles.js');
  // A parchment bar (darkest channel about 160) with white letters (250): the letters are past it.
  const bright = [...Array(90).fill(160), ...Array(10).fill(250)];
  const t1 = whiteThreshold(bright);
  assert.ok(t1 > 160 && t1 < 250, String(t1));
  // The same, dimmed to 60% (96 and 150): still between them, where a fixed cut at 200 would take nothing.
  const dim = bright.map((v) => v * 0.6);
  const t2 = whiteThreshold(dim);
  assert.ok(t2 > 96 && t2 < 150, String(t2));
});
