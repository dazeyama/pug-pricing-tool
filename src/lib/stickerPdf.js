// Price-tag stickers for Pokémon cards (decision 281), on the store's
// sticker sheets: Letter, 160 stickers, 8 across x 20 down, each 1 in x
// 1/2 in, the grid 0.29 in from the left and 0.49 in from the top. Measured
// from a scan of the sheet (2026-10-16: the pitch), then from the owner's
// test print on it (the same day: the print sat 0.03 in right and a little
// low, so the grid moved; the stand-alone tool with the same numbers and a
// calibration page is C:\ClaudeProjects\temp\sticker-sheet). A plain
// rectangle: no skew. One sticker a copy, in Print PKM?'s order, so a sheet
// follows the printout. Each sticker (owner, 2026-10-16): the name's first
// letters and the collector number in brackets, small, at the top; the
// price, big and centred, as the app shows money ("$12", "$1.50"); the
// condition in a chip centred under it; 0.12 in kept clear at the sides and
// about 0.08 in top and bottom (two test prints: a chip at the price's
// right sat on the right cut line, the name on the top one). Built with jsPDF
// like the audit printout; the pure parts are tested under Node.

import { jsPDF } from 'jspdf';
import { formatMoney } from './money.js';
import { CONDITION_RGB, pdfSafe } from './auditPdf.js';
import { pokemonOrder } from './auditPrint.js';

const IN = 72;
/** The sheet, in points: the page, the grid's place on it, and each sticker. */
export const SHEET = {
  page: { w: 8.5 * IN, h: 11 * IN },
  columns: 8,
  rows: 20,
  cell: { w: 1 * IN, h: 0.5 * IN },
  left: 0.29 * IN,
  top: 0.49 * IN,
};
export const PER_SHEET = SHEET.columns * SHEET.rows;
/**
 * The printer's offset, in points (+dx moves everything right, +dy down):
 * every printer feeds a little off. Found once with the sticker-sheet tool's
 * calibration page (its README), the same numbers as its template.json.
 */
export const PRINTER_OFFSET = { dx: 0, dy: 0 };

const NAME_LETTERS = 6;      // "first 5ish letters of the name" (owner, 2026-10-16)
// Kept clear inside each sticker (owner, after two test prints: "we can't be close to or
// touching ANY red lines"): 0.12 in at the sides; the stack sized to leave about 0.08 in at
// the top and the bottom, so a print landing 0.05 in off still touches nothing.
const INSET_X = 0.12 * IN;
const LABEL_PT = 5;          // the name and number
const LABEL_TOP = 6;         // its cap top this far below the sticker's top edge
const PRICE_PT = 12;         // the biggest the price is tried at; it shrinks to fit
const PRICE_MIN_PT = 7;
const PRICE_BASELINE = 21.5; // below the sticker's top edge
const CHIP = { h: 7, pt: 5, top: 23.4, pad: 5 };   // the condition, centred under the price

/**
 * A sticker's top line: the name's first letters and the collector number,
 * always: "Chariz [199]", "Mew [151]".
 */
export function stickerLabel(name, number) {
  const short = String(name ?? '').trim().slice(0, NAME_LETTERS).trim();
  return `${short} [${String(number ?? '').trim()}]`.trim();
}

/**
 * One sticker a copy, in Print PKM?'s order (by set name, then as a set's rows).
 * @param {object[]} lines  buy_lines rows (pokemonPrintLines')
 * @param {(line: object) => number} priceOf  the line's sell price today
 * @returns {{ label: string, price: number, condition: string }[]}
 */
export function stickerRows(lines, priceOf) {
  const out = [];
  for (const line of pokemonOrder(lines)) {
    const row = {
      label: stickerLabel(line.name_en || line.name, line.collector_number),
      price: priceOf(line),
      condition: line.condition || 'NM',
    };
    for (let i = 0; i < Math.max(1, Number(line.quantity) || 1); i++) out.push(row);
  }
  return out;
}

/** Sticker `slot` (0-based, row by row) on the sheet: its top-left corner and size, in points. */
export function stickerBox(slot, offset = PRINTER_OFFSET) {
  const c = slot % SHEET.columns;
  const r = Math.floor(slot / SHEET.columns);
  return {
    x: SHEET.left + offset.dx + c * SHEET.cell.w,
    y: SHEET.top + offset.dy + r * SHEET.cell.h,
    w: SHEET.cell.w,
    h: SHEET.cell.h,
  };
}

/** The biggest size (down to `smallest`, in half points) at which `text` fits `width` in the current font. */
function sizeToFit(doc, text, width, biggest, smallest) {
  let size = biggest;
  doc.setFontSize(size);
  while (size > smallest && doc.getTextWidth(text) > width) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  return size;
}

/**
 * The stickers as a PDF, 160 a sheet.
 * @param {ReturnType<typeof stickerRows>} rows
 * @param {{ offset?: { dx: number, dy: number }, start?: number, outline?: boolean }} [o]
 *   start: the first sticker used on the first sheet (1–160), for a partly used sheet;
 *   outline: the stickers' edges drawn, to test on plain paper
 * @returns {jsPDF}
 */
export function stickerPdf(rows, { offset = PRINTER_OFFSET, start = 1, outline = false } = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  doc.setFont('helvetica', 'bold');
  let slot = Math.min(Math.max(1, start), PER_SHEET) - 1;
  for (const row of rows) {
    if (slot === PER_SHEET) {
      doc.addPage('letter', 'portrait');
      slot = 0;
    }
    const { x, y, w, h } = stickerBox(slot, offset);
    slot += 1;
    if (outline) {
      doc.setDrawColor(200, 203, 214);
      doc.setLineWidth(0.3);
      doc.rect(x, y, w, h, 'S');
    }
    const mid = x + w / 2;
    const room = w - 2 * INSET_X;
    // The name and number, small, at the top: well down from the edge (owner, second test print).
    const label = pdfSafe(row.label);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    sizeToFit(doc, label, room, LABEL_PT, 4);
    doc.text(label, mid, y + LABEL_TOP + LABEL_PT * 0.72, { align: 'center' });
    // The price, big, centred.
    // As the app shows money: "$12", "$1.50", "$0.40" (owner, after seeing both: no "empty .00").
    const price = formatMoney(row.price);
    sizeToFit(doc, price, room, PRICE_PT, PRICE_MIN_PT);
    doc.text(price, mid, y + PRICE_BASELINE, { align: 'center' });
    // The condition's chip, centred under the price (owner, second test print: "a LOT of space
    // on both left and right").
    doc.setFontSize(CHIP.pt);
    const chipW = doc.getTextWidth(row.condition) + CHIP.pad;
    const chipX = mid - chipW / 2;
    const chipY = y + CHIP.top;
    doc.setDrawColor(...(CONDITION_RGB[row.condition] ?? CONDITION_RGB.NM));
    doc.setLineWidth(0.7);
    doc.roundedRect(chipX, chipY, chipW, CHIP.h, 1.4, 1.4, 'S');
    doc.text(row.condition, mid, chipY + 5.2, { align: 'center' });
  }
  return doc;
}
