import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { auditPdf, footerKey, numberChip, pdfSafe } from '../src/lib/auditPdf.js';
import { DEFAULT_BULK_CUT } from '../src/lib/bulkCut.js';

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
    name: `Card ${i}`, qty: 1, set: 'LEA', number: String(i), condition: 'NM', extras: i % 3 ? [] : ['Foil'], bucket: 'blue',
  }));
  const one = auditPdf({ title: 'Audit', sections: [{ name: 'Alpha', cards: 90, set: 'lea', rows: rows(90) }] });
  assert.equal(one.getNumberOfPages(), 1);   // about 50 one-line rows a column, 2 columns a page
  const many = auditPdf({ title: 'Audit', sections: [{ name: 'Alpha', cards: 250, set: 'lea', rows: rows(250) }, { name: 'Unmatched', cards: 5, set: null, rows: rows(5) }] });
  assert.ok(many.getNumberOfPages() >= 3);
});

test('a bare section (buy order, decision 444) draws its rows with no band, on every page', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({
    name: `Card ${i}`, qty: 1, set: 'LEA', number: String(i), condition: i % 2 ? 'LP' : 'NM', extras: [], bucket: 'red',
  }));
  const banded = auditPdf({ title: 'Audit', sections: [{ name: 'ZZBAND', cards: 250, set: null, rows: rows(250) }] });
  const bare = auditPdf({ title: 'Audit', sections: [{ name: 'ZZBAND', cards: 250, set: null, bare: true, rows: rows(250) }] });
  assert.match(banded.output(), /ZZBAND/);
  assert.doesNotMatch(bare.output(), /ZZBAND/);
  assert.match(bare.output(), /Card 249/);
});

test('the foot: the key ends before the page number at the right margin, at any cut (decision 419)', () => {
  // The printout's foot in points: Letter is 612 wide, the margins 28, the number and key at 7.5pt.
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const page = doc.getTextWidth('Page 10 of 10');
  const width = (parts) => parts.reduce((w, p) => {
    doc.setFont('helvetica', p.bold ? 'bold' : 'normal');
    return w + doc.getTextWidth(p.text);
  }, 0);
  // The defaults, and the longest words the slider allows ("$2.98 and under", "$2.99 to $2.99").
  for (const cut of [DEFAULT_BULK_CUT, { red: 2.98, amber: 2.99 }]) {
    const key = width(footerKey(cut));
    assert.ok(key + 12 + page <= 612 - 2 * 28, `the key (${key.toFixed(0)}pt) runs into the page number`);
  }
  assert.match(footerKey(DEFAULT_BULK_CUT).map((p) => p.text).join(''), /amber = \$1 card, 51¢ to \$1\.49 {3}red = true bulk card, 50¢ and under$/);
});

test("a row's number chip: the number alone under its own set's band, the set too otherwise", () => {
  assert.equal(numberChip({ set: 'LEA', number: '161' }, 'lea'), '161');
  assert.equal(numberChip({ set: 'PLST', number: 'CMA-216' }, 'mb1'), 'PLST CMA-216');
  assert.equal(numberChip({ set: 'ZEN', number: '9' }, null), 'ZEN 9');   // Unmatched
});
