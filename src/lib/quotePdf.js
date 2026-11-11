// The in-progress walk-in printout as a PDF (decision 579), built in the browser with jsPDF: US Letter, portrait,
// one table. On top, "Buy in progress, not confirmed" with the date and time, "Quote only, not a receipt" and a
// blank "Customer:" line to write on; a row per line as added (a tick box, the count, the name, set, number,
// finish and condition, and what we'd pay for one in Cash and in Credit); after the last row the card count and
// the Cash and Credit offers. Outlines and black type, light on ink, as the audit printout.

import { jsPDF } from 'jspdf';
import { formatMoney } from './money.js';
import { pdfSafe } from './auditPdf.js';
import { QUOTE_NOTE, QUOTE_TITLE } from './quotePrint.js';

const PAGE = { w: 612, h: 792 };            // Letter, in points
const MARGIN = 36;
const WIDTH = PAGE.w - 2 * MARGIN;
const ROW = 16;
const BOTTOM = PAGE.h - 40;                  // above the page number
const BOX = 8;
const BODY_PT = 9;
const HEAD_PT = 7.5;
const INK = [20, 20, 26];
const GREY = [110, 114, 128];
const RULE = [200, 203, 214];

// The columns, left to right, by their left edge from the margin (and the money's right edge).
const COLS = {
  box: 0, qty: 14, name: 44, set: 262, number: 300, finish: 346, cond: 388, cashRight: 470, creditRight: WIDTH,
};
const NAME_W = COLS.set - COLS.name - 6;

/** `text` cut to `width` points in the current font, ending "…". */
function fit(doc, text, width) {
  if (doc.getTextWidth(text) <= width) return text;
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

const money = (n) => (n == null ? '—' : formatMoney(n));

/**
 * @param {object} p
 * @param {ReturnType<import('./quotePrint.js').quoteSheet>} p.sheet
 * @param {Date} [p.printedAt]
 * @returns {jsPDF}
 */
export function quotePdf({ sheet, printedAt = new Date() }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const when = printedAt.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const x = (col) => MARGIN + COLS[col];
  let y = 0;

  // The first page's top: the title, the time, the note and the customer's line.
  const top = () => {
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(QUOTE_TITLE, MARGIN, MARGIN + 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(when, PAGE.w - MARGIN, MARGIN + 12, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(QUOTE_NOTE, MARGIN, MARGIN + 32);
    doc.setFont('helvetica', 'normal');
    doc.text('Customer:', MARGIN, MARGIN + 56);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.6);
    doc.line(MARGIN + 56, MARGIN + 58, MARGIN + 320, MARGIN + 58);
    y = MARGIN + 80;
  };

  // The column heads, on every page.
  const heads = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(HEAD_PT);
    doc.setTextColor(...GREY);
    doc.text('QTY', x('qty') + 22, y, { align: 'right' });
    doc.text('CARD', x('name'), y);
    doc.text('SET', x('set'), y);
    doc.text('NO.', x('number'), y);
    doc.text('FINISH', x('finish'), y);
    doc.text('COND.', x('cond'), y);
    doc.text('CASH EACH', MARGIN + COLS.cashRight, y, { align: 'right' });
    doc.text('CREDIT EACH', MARGIN + COLS.creditRight, y, { align: 'right' });
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y + 4, PAGE.w - MARGIN, y + 4);
    y += 6;
  };

  const newPage = () => {
    doc.addPage('letter', 'portrait');
    y = MARGIN + 10;
    heads();
  };

  const row = (r) => {
    if (y + ROW > BOTTOM) newPage();
    const base = y + 11;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.6);
    doc.rect(x('box'), base - BOX + 1, BOX, BOX);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(BODY_PT);
    doc.text(String(r.qty), x('qty') + 22, base, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(fit(doc, pdfSafe(r.name), NAME_W), x('name'), base);
    doc.text(fit(doc, pdfSafe(r.set), COLS.number - COLS.set - 4), x('set'), base);
    doc.text(fit(doc, pdfSafe(r.number), COLS.finish - COLS.number - 4), x('number'), base);
    doc.text(r.finish, x('finish'), base);
    doc.text(r.condition, x('cond'), base);
    doc.text(money(r.cash), MARGIN + COLS.cashRight, base, { align: 'right' });
    doc.text(money(r.credit), MARGIN + COLS.creditRight, base, { align: 'right' });
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y + ROW, PAGE.w - MARGIN, y + ROW);
    y += ROW;
  };

  // The foot: the card count and the two offers, kept together.
  const foot = () => {
    if (y + 70 > BOTTOM) newPage();
    y += 22;
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(sheet.count, MARGIN, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Cash offer', PAGE.w - MARGIN - 130, y);
    doc.text(money(sheet.cash), PAGE.w - MARGIN, y, { align: 'right' });
    y += 20;
    doc.text('Credit offer', PAGE.w - MARGIN - 130, y);
    doc.text(money(sheet.credit), PAGE.w - MARGIN, y, { align: 'right' });
  };

  top();
  heads();
  for (const r of sheet.rows) row(r);
  foot();

  // Page numbers, once the pages are all there.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(`${QUOTE_NOTE}  ·  Page ${i} of ${pages}`, PAGE.w / 2, PAGE.h - 24, { align: 'center' });
  }
  return doc;
}
