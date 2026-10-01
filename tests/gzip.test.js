import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzip, gzip, isGzipPath } from '../src/lib/gzip.js';

// The Master Crystal Inventory is stored gzipped (owner, 2026-09-30: the real file is 40 MB+).
test('a CSV survives gzip and back, and packs down', async () => {
  const row = 'Product ID,Product Name,Category,Total Qty,Description\n';
  const csv = row + Array.from({ length: 2000 }, (_, i) =>
    `${i},"Lightning Bolt","Magic Singles: 2X2",${i % 4},"<p>An instant, with ""quotes"", commas and\nnewlines</p>"`).join('\n');
  const packed = await gzip(new Blob([csv]));
  assert.ok(packed.size < csv.length / 5, `packed ${packed.size} of ${csv.length}`);
  assert.equal(await (await gunzip(packed)).text(), csv);
});

test('stored copies are recognised by their .gz ending', () => {
  assert.equal(isGzipPath('20260930-154210__inventory.csv.gz'), true);
  assert.equal(isGzipPath('20260929-003600__playersuniongames-inventory-search-27.csv'), false);
  assert.equal(isGzipPath(null), false);
});
