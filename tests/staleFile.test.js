import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_STALE_ROWS, parseDays, parseStalePrice, staleFromText } from '../src/lib/staleFile.js';

// Decision 581: the stale cards file, the inventory file's own columns. Hand-made rows, never the real file.
const HEAD = 'Product ID,Product Name,Category,Total Qty,Wishlists,Buy Price,Sell Price,URL,Barcode,Manufacturer SKU,ASIN,MSRP,Brand,Weight,Description,Max Qty,Domestic Only,Tax Exempt,GST Exempt,PST Exempt,HST Exempt,CC ID';
const row = (id, name, qty) => `${id},"${name}",Alliances,${qty},0,0.00,65.00,http://x/${id},"","",,0.00,"",0.005,"",,false,false,false,false,false,${id}9`;

test('the search export read: id, name and Total Qty; in stock is Total Qty over 0', () => {
  const text = [HEAD, row(73, 'Force of Will', 0), row(125, 'Lake of the Dead', 2), row(9, 'Mox, Pearl', '"1,204"')].join('\n');
  const s = staleFromText(text, 'search.csv');
  assert.deepEqual(s.rows, [
    { product_id: '73', product_name: 'Force of Will', total_qty: 0, sell_price: 65 },
    { product_id: '125', product_name: 'Lake of the Dead', total_qty: 2, sell_price: 65 },
    { product_id: '9', product_name: 'Mox, Pearl', total_qty: 1204, sell_price: 65 },
  ]);
  assert.equal(s.products, 3);
  assert.equal(s.inStock, 2);
});

test('a byte-order mark, a repeated product and a blank row', () => {
  const bom = String.fromCharCode(0xfeff);
  const text = `${bom}${[HEAD, row(1, 'A', 1), row(1, 'A again', 5), ',,,,', row(2, 'B', 'x')].join('\r\n')}\r\n`;
  const s = staleFromText(text, 'search.csv');
  assert.deepEqual(s.rows.map((r) => [r.product_id, r.product_name, r.total_qty]), [['1', 'A', 1], ['2', 'B', null]]);
  assert.equal(s.inStock, 1);
});

test('not the search export: a column missing, no products, the whole inventory', () => {
  assert.throws(() => staleFromText('Product ID,Product Name\n1,A', 'x.csv'), /no Total Qty column/);
  assert.throws(() => staleFromText(HEAD, 'x.csv'), /no products/);
  const many = [HEAD, ...Array.from({ length: MAX_STALE_ROWS + 1 }, (_, i) => row(i + 1, `Card ${i}`, 1))].join('\n');
  assert.throws(() => staleFromText(many, 'inventory.csv'), /whole inventory/);
});

test('the days box: a whole number of days from 1 to 3650', () => {
  assert.equal(parseDays('180'), 180);
  assert.equal(parseDays(' 90 '), 90);
  assert.equal(parseDays('0'), null);
  assert.equal(parseDays('3651'), null);
  assert.equal(parseDays('12.5'), null);
  assert.equal(parseDays(''), null);
});

test('the Sell price box: dollars from 0 to 9999, up to 2 decimals', () => {
  assert.equal(parseStalePrice('35'), 35);
  assert.equal(parseStalePrice('$12.50'), 12.5);
  assert.equal(parseStalePrice('0'), 0);
  assert.equal(parseStalePrice('10000'), null);
  assert.equal(parseStalePrice('1.234'), null);
  assert.equal(parseStalePrice(''), null);
});
