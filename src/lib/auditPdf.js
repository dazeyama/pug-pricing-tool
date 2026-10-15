// The audit printout as a PDF (docs/TEAM_FEEDBACK.md 3.6), built in the
// browser with jsPDF: US Letter, portrait, two columns, in pull-pdf's look
// (C:\ClaudeProjects\pull-pdf: dark section bands with their card counts,
// one tinted row per card with a tick box). A type size fixed for every
// printout; sections carry on across columns and pages with "(cont.)".

import { jsPDF } from 'jspdf';

const PAGE = { w: 612, h: 792 };            // Letter, in points
const MARGIN = 36;
const GUTTER = 18;
const COL_W = (PAGE.w - 2 * MARGIN - GUTTER) / 2;
const TOP = 72;                              // under the page header
const BOTTOM = PAGE.h - 40;                  // above the page number
const BAND = 20;
const ROW = 25;
const ROW_GAP = 2;
const SECTION_GAP = 10;

// The condition buttons' colours (price.css), as the strip on each row's left edge.
const CONDITION_RGB = {
  NM: [62, 207, 142], LP: [163, 214, 92], MP: [255, 204, 102], HP: [255, 159, 67], DMG: [255, 107, 107],
};

// PDF's built-in fonts draw Windows-1252 (Latin-1 and a few more: curly
// quotes, dashes, …). One character outside it garbles the whole line
// (checked 2026-10-14: "120★" came out spaced out, with "&" for the star), so
// the rest is put in plain letters rather than dropped (as pull-pdf's _safe does).
const WIN_1252 = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const PLAIN = { '★': '*', '☆': '*', '−': '-', '⁄': '/' };
const drawable = (c) => {
  const code = c.codePointAt(0);
  return (code >= 0x20 && code <= 0xff && code !== 0x7f) || WIN_1252.has(c);
};
/** Text the built-in fonts can draw. */
export function pdfSafe(text) {
  let out = '';
  for (const ch of String(text ?? '').normalize('NFC')) {
    if (drawable(ch)) out += ch;
    else if (PLAIN[ch]) out += PLAIN[ch];
    else {
      // An accented letter the font lacks: its plain letter ("ŵ" → "w"); else "?".
      const base = [...ch.normalize('NFKD')].filter((c) => drawable(c)).join('');
      out += base || '?';
    }
  }
  return out;
}

/** `text` cut to `width` points in the current font, ending "…". */
function fit(doc, text, width) {
  if (doc.getTextWidth(text) <= width) return text;
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/**
 * The printout.
 * @param {object} p
 * @param {string} p.title  "Audit — Magic, Tuesday, October 14, 2026"
 * @param {{ name: string, cards: number, rows: { name: string, qty: number, condition: string, detail: string }[] }[]} p.sections  auditSections()
 * @param {Date} [p.printedAt]
 * @returns {jsPDF}
 */
export function auditPdf({ title, sections, printedAt = new Date() }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const cards = sections.reduce((n, s) => n + s.cards, 0);
  const when = printedAt.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const header = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(25, 27, 38);
    doc.text(fit(doc, pdfSafe(title), PAGE.w - 2 * MARGIN - 190), MARGIN, 50);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 124, 140);
    doc.text(`Printed ${when}  ·  ${cards} card${cards === 1 ? '' : 's'}`, PAGE.w - MARGIN, 50, { align: 'right' });
    doc.setDrawColor(200, 203, 214);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, 58, PAGE.w - MARGIN, 58);
  };

  let col = 0;
  let y = TOP;
  const x = () => MARGIN + col * (COL_W + GUTTER);
  const nextColumn = () => {
    if (col === 0) col = 1;
    else {
      doc.addPage('letter', 'portrait');
      header();
      col = 0;
    }
    y = TOP;
  };

  const band = (name, count) => {
    doc.setFillColor(35, 38, 58);
    doc.roundedRect(x(), y, COL_W, BAND, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    const countText = String(count);
    const countW = doc.getTextWidth(countText);
    doc.text(fit(doc, pdfSafe(name), COL_W - 24 - countW), x() + 8, y + 13.6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(205, 208, 222);
    doc.text(countText, x() + COL_W - 8, y + 13.6, { align: 'right' });
    y += BAND + 3;
  };

  const row = (r) => {
    const left = x();
    doc.setFillColor(242, 243, 247);
    doc.roundedRect(left, y, COL_W, ROW, 2, 2, 'F');
    doc.setFillColor(...(CONDITION_RGB[r.condition] ?? CONDITION_RGB.NM));
    doc.rect(left, y, 3, ROW, 'F');
    // The tick box.
    doc.setDrawColor(110, 114, 130);
    doc.setLineWidth(0.8);
    doc.setFillColor(255, 255, 255);
    doc.rect(left + 9, y + 4.5, 9, 9, 'FD');
    // The count, right; the name, left of it.
    let qtyW = 0;
    if (r.qty > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(25, 27, 38);
      const q = `x${r.qty}`;
      qtyW = doc.getTextWidth(q) + 6;
      doc.text(q, left + COL_W - 7, y + 11.5, { align: 'right' });
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(25, 27, 38);
    doc.text(fit(doc, pdfSafe(r.name), COL_W - 24 - 7 - qtyW), left + 24, y + 11.5);
    doc.setFontSize(7.6);
    doc.setTextColor(95, 99, 115);
    doc.text(fit(doc, pdfSafe(r.detail), COL_W - 24 - 7), left + 24, y + 21);
    y += ROW + ROW_GAP;
  };

  header();
  if (!sections.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(95, 99, 115);
    doc.text('No cards to print.', MARGIN, TOP + 14);
  }
  for (const s of sections) {
    if (y > TOP) y += SECTION_GAP;
    // A band never sits alone at a column's foot: it needs one row under it.
    if (y + BAND + 3 + ROW > BOTTOM) nextColumn();
    band(s.name, s.cards);
    for (const r of s.rows) {
      if (y + ROW > BOTTOM) {
        nextColumn();
        band(`${s.name} (cont.)`, s.cards);
      }
      row(r);
    }
  }

  // "Page 2 of 5", now that the count is known.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 144, 160);
    doc.text(`Page ${p} of ${pages}`, PAGE.w / 2, PAGE.h - 22, { align: 'center' });
  }
  return doc;
}
