// The audit printout as a PDF (docs/TEAM_FEEDBACK.md 3.6), built in the
// browser with jsPDF: US Letter, portrait, two columns, in pull-pdf's look
// (C:\ClaudeProjects\pull-pdf: black section bands with their card counts,
// one row per card marked with its colour, with a tick box), its rows and
// chips drawn in outlines to save ink. Compact (owner,
// 2026-10-14): one line a card, its count first in a column of its own so
// the names line up, its collector number and its condition in black chips
// lined up on the right, its finish and treatments in chips after its name
// (wrapping under it only when they don't fit); the set's symbol, large, and
// its code in brackets on each category's band ("Alpha [LEA]"), so the rows
// carry only their numbers. Sections carry on across columns and pages with
// "(cont.)".

import { jsPDF } from 'jspdf';
import { formatMoney } from './money.js';
import { priceTone } from './auditPrint.js';
import { DEFAULT_BULK_CUT, bandWords } from './bulkCut.js';

/**
 * A row's number chip: the collector number alone when its set is its
 * band's (owner, 2026-10-14: the set code is on the band), "PLST CMA-216"
 * when it's from another set than most of its category's cards, or in
 * Unmatched, whose cards come from any set.
 */
export function numberChip(row, sectionSet) {
  return sectionSet && row.set.toLowerCase() === sectionSet ? row.number : `${row.set} ${row.number}`.trim();
}

const PAGE = { w: 612, h: 792 };            // Letter, in points
const MARGIN = 28;
const GUTTER = 14;
const COL_W = (PAGE.w - 2 * MARGIN - GUTTER) / 2;
const TOP = 46;                              // under the page header
const BOTTOM = PAGE.h - 28;                  // above the page number
const BAND = 24;                             // big enough to see the set's symbol (owner, 2026-10-14)
const SYMBOL_H = 17;
const ROW = 13;                              // a one-line row
const ROW_WRAPPED = 22;                      // its chips on a second line
const ROW_GAP = 1;
const SECTION_GAP = 7;
const DIVIDER = 7;                           // the line between a category's NM cards and the rest
const NAME_PT = 8.6;
const CHIP_PT = 6.6;
const CHIP_H = 9;
const BOX = 7;
const QTY_RIGHT = 33;                        // the count, first, right-aligned in its own column
const NAME_X = 37;                           // the name, after the chip, the tick box and the count
const COND_W = 20;
const PRICE_W = 30;                          // today's market price, last on the row (decision 404)
const PRICE_PT = 6.8;

// Light on ink (owner, 2026-10-14: colour kept, but outlines over shading):
// rows and chips are outlines, the colour only where it tells something:
// each row's left chip (its card's colour) and its condition chip's outline.
// The category bands stay solid black with white words (owner, 2026-10-14:
// outlined ones lost the eye), the only ink spent on finding your place.

// pull-pdf's colour groups (sorting.py BUCKET_STYLE), its chip colours: the
// strip on a row's left edge. pull-pdf's faint row tints are left off.
const BUCKET_RGB = {
  white: [225, 212, 163],
  blue: [139, 186, 224],
  black: [150, 144, 157],
  red: [225, 150, 139],
  green: [140, 196, 140],
  multicolor: [224, 191, 102],
  artifact: [173, 180, 186],
  land: [191, 173, 150],
  unknown: [217, 217, 217],
};
// The condition chip's outline: the condition buttons' colours (price/conditions.css),
// deepened to read as a thin line on paper.
export const CONDITION_RGB = {
  NM: [34, 150, 96], LP: [104, 154, 36], MP: [196, 142, 18], HP: [212, 106, 28], DMG: [204, 58, 58],
};
const INK = [20, 20, 26];        // text, the bands
// A flagged buy (decision 301): the banner across every page.
const FLAG_RGB = [200, 30, 30];
const FLAG_BANNER = 20;
const LINE = [190, 192, 200];    // the rows' hairlines
// A row's price (decision 404): red (true bulk), amber (a $1 card), else ink, at the Export rates for bulk (416).
const TONE_RGB = { bulk: [200, 30, 30], dollar: [196, 120, 0] };

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
 * @param {string|null} [p.flagText]  a flagged buy's banner (decision 301), red across every page under its header
 * @param {{ red: number, amber: number }} [p.cut]  the Export rates for bulk (decision 416)
 * @returns {jsPDF}
 */
export function auditPdf({ title, sections, symbols = {}, printedAt = new Date(), flagText = null, cut = DEFAULT_BULK_CUT }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const top = flagText ? TOP + FLAG_BANNER + 4 : TOP;
  const cards = sections.reduce((n, s) => n + s.cards, 0);
  // Rows with prices give room for them; an older caller without prices lays out as before.
  const priced = sections.some((s) => s.rows.some((r) => r.price != null));
  const priceW = priced ? PRICE_W : 0;
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
    if (flagText) {
      // Red across the page, white words: the first thing seen on every page (owner, 2026-10-18).
      doc.setFillColor(...FLAG_RGB);
      doc.roundedRect(MARGIN, 40, PAGE.w - 2 * MARGIN, FLAG_BANNER, 2.5, 2.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(fit(doc, pdfSafe(flagText), PAGE.w - 2 * MARGIN - 16), PAGE.w / 2, 40 + 13.6, { align: 'center' });
    }
  };

  let col = 0;
  let y = top;
  const x = () => MARGIN + col * (COL_W + GUTTER);
  const nextColumn = () => {
    if (col === 0) col = 1;
    else {
      doc.addPage('letter', 'portrait');
      header();
      col = 0;
    }
    y = top;
  };

  const chipWidth = (text) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(CHIP_PT);
    return doc.getTextWidth(text) + 5;
  };
  /** A chip: `text` in black inside an outline (`stroke`, `weight` thick), its left edge at `left`. */
  const chip = (text, left, top, width, stroke = [140, 142, 152], weight = 0.5) => {
    doc.setDrawColor(...stroke);
    doc.setLineWidth(weight);
    doc.roundedRect(left, top, width, CHIP_H, 1.6, 1.6, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(CHIP_PT);
    doc.setTextColor(0, 0, 0);
    doc.text(text, left + width / 2, top + 6.5, { align: 'center' });
  };

  const band = (s, cont) => {
    doc.setFillColor(...INK);
    doc.roundedRect(x(), y, COL_W, BAND, 2.5, 2.5, 'F');
    let textX = x() + 7;
    const symbol = s.set ? symbols[s.set] : null;
    if (symbol) {
      // As tall as SYMBOL_H, a wide symbol no wider than 1.6 times that.
      const w = Math.min(SYMBOL_H * 1.6, SYMBOL_H * symbol.ratio);
      const h = w / symbol.ratio;
      doc.addImage(symbol.data, 'PNG', textX, y + (BAND - h) / 2, w, h);
      textX += w + 7;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const countText = String(s.cards);
    const countW = doc.getTextWidth(countText);
    doc.setTextColor(205, 208, 222);
    doc.text(countText, x() + COL_W - 7, y + 15.6, { align: 'right' });
    // The name, then its set's code in brackets and "(cont.)", lighter:
    // "Alpha [LEA]" (owner, 2026-10-14). A long name gives way, never the code.
    const tail = [s.set ? `[${s.set.toUpperCase()}]` : '', cont ? '(cont.)' : ''].filter(Boolean).join(' ');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const tailW = tail ? doc.getTextWidth(` ${tail}`) : 0;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    const name = fit(doc, pdfSafe(s.name), x() + COL_W - 14 - countW - tailW - textX);
    doc.text(name, textX, y + 15.8);
    if (tail) {
      const after = textX + doc.getTextWidth(name);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(205, 208, 222);
      doc.text(` ${pdfSafe(tail)}`, after, y + 15.8);
    }
    y += BAND + 2;
  };

  /** How a row lays out: the name's room, its extras, one line or two. */
  const layout = (r, s) => {
    const set = pdfSafe(numberChip(r, s.set));
    const setW = chipWidth(set);
    const right = COL_W - 4 - priceW - COND_W - 3 - setW - 4;   // the name's room ends at the set chip
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
    // A hairline round the row, and its card's colour as the chip on its left edge.
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.35);
    doc.rect(left, y, COL_W, l.h, 'S');
    doc.setFillColor(...(BUCKET_RGB[r.bucket] ?? BUCKET_RGB.unknown));
    doc.rect(left, y, 3, l.h, 'F');
    // The tick box.
    doc.setDrawColor(70, 72, 84);
    doc.setLineWidth(0.7);
    doc.rect(left + 8, y + (ROW - BOX) / 2, BOX, BOX, 'S');
    // The count first, in its own column so every name starts at the same place
    // (owner, 2026-10-14): a single card's quietly, more than one's in bold.
    doc.setFont('helvetica', r.qty > 1 ? 'bold' : 'normal');
    doc.setFontSize(NAME_PT);
    if (r.qty > 1) doc.setTextColor(0, 0, 0);
    else doc.setTextColor(110, 112, 122);
    doc.text(`${r.qty}x`, left + QTY_RIGHT, y + 9.2, { align: 'right' });
    // Right to left: today's price, the condition, then the set and number, each in its own column.
    const top = y + (ROW - CHIP_H) / 2;
    if (r.price != null) {
      const tone = priceTone(r.price, cut);
      doc.setFont('helvetica', tone ? 'bold' : 'normal');
      doc.setFontSize(PRICE_PT);
      doc.setTextColor(...(TONE_RGB[tone] ?? INK));
      doc.text(formatMoney(r.price), left + COL_W - 4, y + 9, { align: 'right' });
    }
    const condLeft = left + COL_W - 4 - priceW - COND_W;
    chip(r.condition, condLeft, top, COND_W, CONDITION_RGB[r.condition] ?? CONDITION_RGB.NM, 1);
    chip(l.set, condLeft - 3 - l.setW, top, l.setW);
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
      chip(e, ex, exTop, w, [170, 172, 182], 0.4);
      ex += w + 2;
    }
    y += l.h + ROW_GAP;
  };

  header();
  if (!sections.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(95, 99, 115);
    doc.text('No cards to print.', MARGIN, top + 12);
  }
  for (const s of sections) {
    if (y > top) y += SECTION_GAP;
    const first = s.rows[0] ? layout(s.rows[0], s) : { h: ROW };
    // A band never sits alone at a column's foot: it needs its first row under it.
    if (y + BAND + 2 + first.h > BOTTOM) nextColumn();
    band(s, false);
    // A line between the NM cards and the lower conditions, when a category
    // has both (owner, 2026-10-14).
    let sawNM = false;
    let divided = false;
    for (const r of s.rows) {
      const l = layout(r, s);
      const divide = sawNM && !divided && r.condition !== 'NM';
      if (y + l.h + (divide ? DIVIDER : 0) > BOTTOM) {
        nextColumn();
        band(s, true);
      }
      if (divide) {
        doc.setDrawColor(...INK);
        doc.setLineWidth(0.9);
        doc.line(x() + 2, y + 2.6, x() + COL_W - 2, y + 2.6);
        y += DIVIDER;
        divided = true;
      }
      row(r, l);
      if (r.condition === 'NM') sawNM = true;
    }
  }

  // "Page 2 of 5", now that the count is known; the prices' key on the left (decision 404).
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 144, 160);
    doc.text(`Page ${p} of ${pages}`, PAGE.w / 2, PAGE.h - 14, { align: 'center' });
    if (priced) {
      let kx = MARGIN;
      const part = (text, rgb, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setTextColor(...rgb);
        doc.text(text, kx, PAGE.h - 14);
        kx += doc.getTextWidth(text);
      };
      part("Today's market price:  ", [110, 114, 128]);
      const bands = bandWords(cut);
      part('amber', TONE_RGB.dollar, true);
      part(` = $1 card, ${pdfSafe(bands.amber)}   `, [110, 114, 128]);
      part('red', TONE_RGB.bulk, true);
      part(` = true bulk card, ${pdfSafe(bands.red)}`, [110, 114, 128]);
    }
  }
  return doc;
}
