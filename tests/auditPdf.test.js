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
  const rows = (n) => Array.from({ length: n }, (_, i) => ({
    name: `Card ${i}`, qty: 1, set: `MOM ${i}`, condition: 'NM', extras: i % 3 ? [] : ['Foil'], bucket: 'blue',
  }));
  const one = auditPdf({ title: 'Audit', sections: [{ name: 'Alpha', cards: 90, set: 'lea', rows: rows(90) }] });
  assert.equal(one.getNumberOfPages(), 1);   // about 50 one-line rows a column, 2 columns a page
  const many = auditPdf({ title: 'Audit', sections: [{ name: 'Alpha', cards: 250, set: 'lea', rows: rows(250) }, { name: 'Unmatched', cards: 5, set: null, rows: rows(5) }] });
  assert.ok(many.getNumberOfPages() >= 3);
});
