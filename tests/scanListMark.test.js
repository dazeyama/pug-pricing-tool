import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { findListMark, listNumber, listPrintingOf } from '../src/scan/listMark.js';
import { WEIGHTS, scorePrinting } from '../src/scan/printingMatch.js';

// Owner, 2026-10-16: The List's (and the first Mystery Booster's) planeswalker mark at the card's
// bottom-left corner, so those cards go in as their List printing.

const make = (w, h) => createCanvas(w, h);
const card = { x: 50, y: 50, width: 600, height: 838 };

/** A card on the light holder: black border, a light text box, and what's drawn in its corner. */
function picture(corner) {
  const c = createCanvas(700, 950);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e4e0d8';
  ctx.fillRect(0, 0, 700, 950);
  ctx.fillStyle = '#141414';
  ctx.fillRect(card.x, card.y, card.width, card.height);
  ctx.fillStyle = '#eee';
  ctx.fillRect(card.x + 40, card.y + 520, card.width - 80, 230);
  ctx.fillStyle = '#fff';
  corner(ctx);
  return c;
}

/** A planeswalker-like mark: five spikes over a point, about 16px square. */
function mark(ctx, cx, cy) {
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy - 8);
  for (let i = 0; i < 5; i++) {
    ctx.lineTo(cx - 8 + i * 4 + 2, cy - (i === 2 ? 2 : 4));
    ctx.lineTo(cx - 8 + (i + 1) * 4, cy - 8);
  }
  ctx.lineTo(cx + 8, cy);
  ctx.lineTo(cx, cy + 8);
  ctx.lineTo(cx - 8, cy);
  ctx.closePath();
  ctx.fill();
}

const cornerY = card.y + card.height * 0.95;
const cornerX = card.x + card.width * 0.045;

test('the mark alone on the black border, at the bottom-left corner: found', () => {
  const found = findListMark(picture((ctx) => mark(ctx, cornerX, cornerY)), card, make);
  assert.equal(found.mark, true, JSON.stringify(found));
});

test('no mark, or the collector number\'s digits there: not found', () => {
  assert.equal(findListMark(picture(() => {}), card, make).mark, false);
  const digits = picture((ctx) => {
    for (let i = 0; i < 6; i++) ctx.fillRect(cornerX - 6 + i * 10, cornerY - 6, 8, 12);
  });
  assert.equal(findListMark(digits, card, make).mark, false);
});

test('a List number from a printing read off a card', () => {
  assert.equal(listNumber({ set: 'a25', collector_number: '50' }), 'A25-50');
});

test('the older-card ranking: the mark seen favours the List printing; not seen, a List printing loses a little', () => {
  const list = { set: 'plst', frame: '2003', border_color: 'black', artist: 'x', released_at: '2024-08-02', collector_number: 'DIS-99' };
  const original = { ...list, set: 'dis', collector_number: '99', released_at: '2006-05-05' };
  const clues = { symbolSeen: false, border: null, artist: 0, year: null, number: null, older: true };
  assert.equal(scorePrinting(list, { ...clues, listMark: true }).parts.list, WEIGHTS.list.seen);
  assert.equal(scorePrinting(original, { ...clues, listMark: true }).parts.list, WEIGHTS.list.other);
  assert.equal(scorePrinting(list, { ...clues, listMark: false }).parts.list, WEIGHTS.list.missed);
  assert.equal(scorePrinting(original, { ...clues, listMark: false }).parts.list, undefined);
});

// Decision 355: an older card taken by its number goes in as its List printing when the mark is seen.
test('the List\'s printing of a card, among its printings', () => {
  const original = { set: 'dis', collector_number: '99' };
  const printings = [original, { set: 'plst', collector_number: 'DIS-99' }, { set: 'plst', collector_number: 'A25-50' }];
  assert.deepEqual(listPrintingOf(original, printings), { set: 'plst', collector_number: 'DIS-99' });
  assert.equal(listPrintingOf(original, [original]), null);
  assert.equal(listPrintingOf({ set: 'a25', collector_number: '51' }, printings), null);
});
