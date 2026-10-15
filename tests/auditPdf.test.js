import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditPdf, pdfSafe } from '../src/lib/auditPdf.js';

test('text the built-in font can draw: Windows-1252 kept, the rest in plain letters', () => {
  assert.equal(pdfSafe('Æther Vial — Urza’s “Saga”…'), 'Æther Vial — Urza’s “Saga”…');
  assert.equal(pdfSafe('120★'), '120*');
  assert.equal(pdfSafe('Ŵ'), 'W');          // a letter Latin-1 lacks: its plain letter
  assert.equal(pdfSafe('稲妻'), '??');
  assert.equal(pdfSafe(null), '');
});

test('the pages: one for nothing, more as the rows run on, every section kept', () => {
  assert.equal(auditPdf({ title: 'Audit', sections: [] }).getNumberOfPages(), 1);
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ name: `Card ${i}`, qty: 1, condition: 'NM', detail: `MOM ${i} · NM` }));
  const one = auditPdf({ title: 'Audit', sections: [{ name: 'Alpha', cards: 20, rows: rows(20) }] });
  assert.equal(one.getNumberOfPages(), 1);   // 20 rows fit one column
  const many = auditPdf({ title: 'Audit', sections: [{ name: 'Alpha', cards: 120, rows: rows(120) }, { name: 'Unmatched', cards: 5, rows: rows(5) }] });
  assert.ok(many.getNumberOfPages() >= 3);    // about 25 rows a column, 2 columns a page
});
