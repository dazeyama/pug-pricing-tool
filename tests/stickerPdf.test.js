import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PER_SHEET, SHEET, stickerBox, stickerLabel, stickerPdf, stickerRows } from '../src/lib/stickerPdf.js';

// Print PKM Stickers? (decision 281): price tags on the store's 160-sticker sheets.

const line = (over) => ({
  id: Math.random().toString(36).slice(2), game: 'pokemon', lang: 'en', name: 'Pikachu', set_code: 'sv1',
  set_name: 'Scarlet & Violet', collector_number: '25', finish: 'normal', condition: 'NM', treatments: [], quantity: 1,
  tcgdex_id: 'sv1-25', ...over,
});

test("a sticker's top line: the name's first letters and the number, always", () => {
  assert.equal(stickerLabel('Charizard ex', '199'), 'Chariz [199]');
  assert.equal(stickerLabel('Mew', '151'), 'Mew [151]');
  assert.equal(stickerLabel('Mr. Mime', '122'), 'Mr. Mi [122]');
  assert.equal(stickerLabel('', '7'), '[7]');
});

test("a sticker a copy, in Print PKM?'s order: by set name, then by number, NM first", () => {
  const rows = stickerRows([
    line({ name: 'Pikachu', collector_number: '25', quantity: 2 }),
    line({ name: 'Mew', collector_number: '151', set_code: 'mew', set_name: '151' }),
    line({ name: 'Charmander', collector_number: '4', condition: 'LP' }),
  ], (l) => ({ Pikachu: 1.5, Mew: 12, Charmander: 0.4 })[l.name]);
  assert.deepEqual(rows.map((r) => [r.label, r.price, r.condition]), [
    ['Mew [151]', 12, 'NM'],
    ['Pikach [25]', 1.5, 'NM'],
    ['Pikach [25]', 1.5, 'NM'],
    ['Charma [4]', 0.4, 'LP'],
  ]);
});

test('the sheet: 8 x 20 stickers of 1 in x 1/2 in from 0.30 in, 0.49 in; a printer offset moves them all', () => {
  assert.equal(PER_SHEET, 160);
  assert.deepEqual(stickerBox(0), { x: SHEET.left, y: SHEET.top, w: 72, h: 36 });
  assert.deepEqual(stickerBox(9), { x: SHEET.left + 72, y: SHEET.top + 36, w: 72, h: 36 });
  assert.deepEqual(stickerBox(159), { x: SHEET.left + 7 * 72, y: SHEET.top + 19 * 36, w: 72, h: 36 });
  assert.equal(stickerBox(0, { dx: 2, dy: -3 }).x, SHEET.left + 2);
  assert.equal(stickerBox(0, { dx: 2, dy: -3 }).y, SHEET.top - 3);
  assert.ok(SHEET.left + 8 * 72 <= SHEET.page.w && SHEET.top + 20 * 36 <= SHEET.page.h);
  assert.equal(SHEET.left, 0.30 * 72);
  assert.equal(SHEET.top, 0.49 * 72);
});

test('the pages: 160 stickers a sheet, the 161st on a second; a partly used sheet starts further in', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ label: `Card ${i}`, price: 1 + i, condition: 'NM' }));
  assert.equal(stickerPdf([]).getNumberOfPages(), 1);
  assert.equal(stickerPdf(rows(160)).getNumberOfPages(), 1);
  assert.equal(stickerPdf(rows(161)).getNumberOfPages(), 2);
  assert.equal(stickerPdf(rows(160), { start: 2 }).getNumberOfPages(), 2);
  assert.equal(stickerPdf(rows(321)).getNumberOfPages(), 3);
});
