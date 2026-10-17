// Price-tag stickers for Pokémon cards (decision 281), on the store's
// sticker sheets: Letter, 160 stickers, 8 across x 20 down, each 1 in x
// 1/2 in, the grid 0.33 in from the left and 0.50 in from the top (measured
// from a scan of the sheet, 2026-10-16; the stand-alone tool with the same
// numbers and a calibration page is C:\ClaudeProjects\temp\sticker-sheet).
// One sticker a copy, in Print PKM?'s order, so a sheet follows the
// printout. Each sticker (owner, 2026-10-16): the name's first letters and
// the collector number in brackets, small, at the top; the price, big and
// centred, "$1.00"; the condition in a chip to its right. Built with jsPDF
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
  left: 0.33 * IN,
  top: 0.5 * IN,
};
export const PER_SHEET = SHEET.columns * SHEET.rows;
/**
 * The printer's offset, in points (+dx moves everything right, +dy down):
 * every printer feeds a little off. Found once with the sticker-sheet tool's
 * calibration page (its README), the same numbers as its template.json.
 */
export const PRINTER_OFFSET = { dx: 0, dy: 0 };

const NAME_LETTERS = 6;      // "first 5ish letters of the name" (owner, 2026-10-16)
const PAD = 3;               // kept clear inside each sticker: a print lands a little off
const LABEL_PT = 5.5;
const PRICE_PT = 17;         // the biggest the price is tried at; it shrinks to fit
const PRICE_MIN_PT = 7;
const CHIP = { w: 16, h: 9, pt: 6 };

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
    // The name and number, small, along the top.
    const label = pdfSafe(row.label);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    sizeToFit(doc, label, w - 2 * PAD, LABEL_PT, 4);
    doc.text(label, x + w / 2, y + PAD + 5.2, { align: 'center' });
    // The condition's chip at the right, level with the price.
    const chipX = x + w - PAD - CHIP.w;
    const chipY = y + 19;
    doc.setDrawColor(...(CONDITION_RGB[row.condition] ?? CONDITION_RGB.NM));
    doc.setLineWidth(0.8);
    doc.roundedRect(chipX, chipY, CHIP.w, CHIP.h, 1.6, 1.6, 'S');
    doc.setFontSize(CHIP.pt);
    doc.text(row.condition, chipX + CHIP.w / 2, chipY + 6.6, { align: 'center' });
    // The price, big, centred in the room left of the chip.
    const price = formatMoney(row.price);
    const roomW = chipX - 3 - (x + PAD);
    sizeToFit(doc, price, roomW, PRICE_PT, PRICE_MIN_PT);
    doc.text(price, x + PAD + roomW / 2, y + 30, { align: 'center' });
  }
  return doc;
}
