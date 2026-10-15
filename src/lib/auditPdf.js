// The audit printout as a PDF (docs/TEAM_FEEDBACK.md 3.6), built in the
// browser with jsPDF: US Letter, portrait, two columns, in pull-pdf's look
// (C:\ClaudeProjects\pull-pdf: dark section bands with their card counts,
// one row per card tinted by its colour, with a tick box). Compact (owner,
// 2026-10-14): one line a card, its set and number and its condition in
// black chips lined up on the right, its finish and treatments in chips
// after its name (wrapping under it only when they don't fit); the set's
// symbol on each category's band. Sections carry on across columns and
// pages with "(cont.)".

import { jsPDF } from 'jspdf';

const PAGE = { w: 612, h: 792 };            // Letter, in points
const MARGIN = 28;
const GUTTER = 14;
const COL_W = (PAGE.w - 2 * MARGIN - GUTTER) / 2;
const TOP = 46;                              // under the page header
const BOTTOM = PAGE.h - 28;                  // above the page number
const BAND = 15;
const ROW = 13;                              // a one-line row
const ROW_WRAPPED = 22;                      // its chips on a second line
const ROW_GAP = 1;
const SECTION_GAP = 7;
const NAME_PT = 8.6;
const CHIP_PT = 6.6;
const CHIP_H = 9;
const BOX = 7;
const NAME_X = 19;                           // the name, after the chip and the tick box
const QTY_W = 15;
const COND_W = 20;

// pull-pdf's colour groups (sorting.py BUCKET_STYLE): a faint row tint, and a
// stronger chip on the row's left edge.
const BUCKET_RGB = {
  white: { fill: [254, 250, 234], chip: [225, 212, 163] },
  blue: { fill: [232, 243, 252], chip: [139, 186, 224] },
  black: { fill: [236, 234, 239], chip: [150, 144, 157] },
  red: { fill: [253, 233, 229], chip: [225, 150, 139] },
  green: { fill: [231, 244, 231], chip: [140, 196, 140] },
  multicolor: { fill: [254, 245, 217], chip: [224, 191, 102] },
  artifact: { fill: [240, 241, 242], chip: [173, 180, 186] },
  land: { fill: [242, 236, 228], chip: [191, 173, 150] },
  unknown: { fill: [255, 255, 255], chip: [217, 217, 217] },
};
// The condition chip: a light tint of the condition buttons' colours (price.css).
const CONDITION_FILL = {
  NM: [190, 238, 214], LP: [214, 238, 180], MP: [255, 232, 180], HP: [255, 212, 172], DMG: [255, 190, 190],
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
      // An accented letter the font lacks: its plain letter ("Ŵ" → "W"); else "?".
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
 * @param {ReturnType<import('./auditPrint.js').auditSections>} p.sections
 * @param {Record<string, { data: string, ratio: number }>} [p.symbols]  set code → its symbol (a white PNG; width / height)
 * @param {Date} [p.printedAt]
 * @returns {jsPDF}
 */
export function auditPdf({ title, sections, symbols = {}, printedAt = new Date() }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const cards = sections.reduce((n, s) => n + s.cards, 0);
  const when = printedAt.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const header = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 26);
    doc.text(fit(doc, pdfSafe(title), PAGE.w - 2 * MARGIN - 170), MARGIN, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 114, 128);
    doc.text(`Printed ${when}  ·  ${cards} card${cards === 1 ? '' : 's'}`, PAGE.w - MARGIN, 30, { align: 'right' });
    doc.setDrawColor(200, 203, 214);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, 36, PAGE.w - MARGIN, 36);
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

  const chipWidth = (text) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(CHIP_PT);
    return doc.getTextWidth(text) + 5;
  };
  /** A chip: `text` in black on `fill`, its left edge at `left`. */
  const chip = (text, left, top, fill, width) => {
    doc.setFillColor(...fill);
    doc.setDrawColor(150, 152, 162);
    doc.setLineWidth(0.4);
    doc.roundedRect(left, top, width, CHIP_H, 1.6, 1.6, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(CHIP_PT);
    doc.setTextColor(0, 0, 0);
    doc.text(text, left + width / 2, top + 6.5, { align: 'center' });
  };

  const band = (s, cont) => {
    doc.setFillColor(35, 38, 58);
    doc.roundedRect(x(), y, COL_W, BAND, 2.5, 2.5, 'F');
    let textX = x() + 6;
    const symbol = s.set ? symbols[s.set] : null;
    if (symbol) {
      const h = 10;
      const w = Math.min(16, h * symbol.ratio);
      doc.addImage(symbol.data, 'PNG', textX, y + (BAND - h) / 2, w, h);
      textX += w + 5;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const countText = String(s.cards);
    const countW = doc.getTextWidth(countText);
    doc.setTextColor(205, 208, 222);
    doc.text(countText, x() + COL_W - 6, y + 10.4, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.6);
    doc.setTextColor(255, 255, 255);
    doc.text(fit(doc, pdfSafe(cont ? `${s.name} (cont.)` : s.name), x() + COL_W - 12 - countW - textX), textX, y + 10.4);
    y += BAND + 2;
  };

  /** How a row lays out: the name's room, its extras, one line or two. */
  const layout = (r) => {
    const set = pdfSafe(r.set);
    const setW = chipWidth(set);
    const right = COL_W - 4 - QTY_W - COND_W - 3 - setW - 4;   // the name's room ends at the set chip
    const extras = r.extras.map((e) => pdfSafe(e));
    const extrasW = extras.reduce((w, e) => w + chipWidth(e) + 2, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(NAME_PT);
    const nameW = doc.getTextWidth(pdfSafe(r.name));
    const oneLine = !extras.length || NAME_X + nameW + 4 + extrasW <= right;
    return { set, setW, right, extras, oneLine, h: oneLine ? ROW : ROW_WRAPPED };
  };

  const row = (r, l) => {
    const left = x();
    const tint = BUCKET_RGB[r.bucket] ?? BUCKET_RGB.unknown;
    doc.setFillColor(...tint.fill);
    doc.rect(left, y, COL_W, l.h, 'F');
    doc.setFillColor(...tint.chip);
    doc.rect(left, y, 3.5, l.h, 'F');
    // The tick box.
    doc.setDrawColor(90, 92, 104);
    doc.setLineWidth(0.7);
    doc.setFillColor(255, 255, 255);
    doc.rect(left + 8, y + (ROW - BOX) / 2, BOX, BOX, 'FD');
    // Right to left: the count, the condition, the set and number, each in its own column.
    const top = y + (ROW - CHIP_H) / 2;
    if (r.qty > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(NAME_PT);
      doc.setTextColor(0, 0, 0);
      doc.text(`x${r.qty}`, left + COL_W - 4, y + 9.2, { align: 'right' });
    }
    const condLeft = left + COL_W - 4 - QTY_W - COND_W;
    chip(r.condition, condLeft, top, CONDITION_FILL[r.condition] ?? CONDITION_FILL.NM, COND_W);
    chip(l.set, condLeft - 3 - l.setW, top, [255, 255, 255], l.setW);
    // The name, then its finish and treatments (or under it, when they don't fit).
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(NAME_PT);
    doc.setTextColor(0, 0, 0);
    const name = fit(doc, pdfSafe(r.name), l.right - NAME_X);
    doc.text(name, left + NAME_X, y + 9.2);
    let ex = l.oneLine ? left + NAME_X + doc.getTextWidth(name) + 4 : left + NAME_X;
    const exTop = l.oneLine ? top : y + ROW - 1;
    for (const e of l.extras) {
      const w = chipWidth(e);
      if (ex + w > left + COL_W - 4) break;   // never past the row
      chip(e, ex, exTop, [238, 236, 250], w);
      ex += w + 2;
    }
    y += l.h + ROW_GAP;
  };

  header();
  if (!sections.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(95, 99, 115);
    doc.text('No cards to print.', MARGIN, TOP + 12);
  }
  for (const s of sections) {
    if (y > TOP) y += SECTION_GAP;
    const first = s.rows[0] ? layout(s.rows[0]) : { h: ROW };
    // A band never sits alone at a column's foot: it needs its first row under it.
    if (y + BAND + 2 + first.h > BOTTOM) nextColumn();
    band(s, false);
    for (const r of s.rows) {
      const l = layout(r);
      if (y + l.h > BOTTOM) {
        nextColumn();
        band(s, true);
      }
      row(r, l);
    }
  }

  // "Page 2 of 5", now that the count is known.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 144, 160);
    doc.text(`Page ${p} of ${pages}`, PAGE.w / 2, PAGE.h - 14, { align: 'center' });
  }
  return doc;
}
