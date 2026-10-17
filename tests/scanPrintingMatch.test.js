import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import {
  TAKE, WEIGHTS, artistIn, borderKind, printDistance, regionPrint, scorePrinting,
} from '../src/scan/printingMatch.js';

// Owner, 2026-10-16: an older card's printing chosen by how it looks, sometimes taken by itself.

const make = (w, h) => createCanvas(w, h);
const printing = (over = {}) => ({ set: 'tmp', frame: '1997', border_color: 'black', artist: 'Ron Spears', released_at: '1997-10-14', collector_number: '57', ...over });
const clues = (over = {}) => ({ art: null, symbol: null, symbolBest: 0, symbolSeen: false, border: null, artist: 0, year: null, number: null, older: true, ...over });

/** A card-sized picture with an art box of blocks. */
function picture(colours, size = 400) {
  const c = createCanvas(size, Math.round(size * 88 / 63));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, c.width, c.height);
  colours.forEach((colour, i) => {
    ctx.fillStyle = colour;
    ctx.fillRect(c.width * (0.1 + (i % 4) * 0.2), c.height * (0.12 + Math.floor(i / 4) * 0.14), c.width * 0.2, c.height * 0.14);
  });
  return c;
}
const whole = (c) => ({ x: 0, y: 0, width: c.width, height: c.height });
const ART = { left: 0.14, right: 0.86, top: 0.15, bottom: 0.5 };

test('the art: the same picture, whatever its light, close; another picture far', () => {
  const art = ['#c33', '#3c3', '#33c', '#cc3', '#3cc', '#c3c', '#999', '#555', '#a52', '#25a', '#5a2', '#eee'];
  const a = picture(art);
  const darker = createCanvas(a.width, a.height);
  const dctx = darker.getContext('2d');
  dctx.filter = 'brightness(0.7) sepia(0.2)';
  dctx.drawImage(a, 0, 0);
  const other = picture([...art].reverse());
  const pa = regionPrint(a, whole(a), ART, make);
  assert.ok(printDistance(pa, regionPrint(darker, whole(darker), ART, make)) < 0.4, 'the same art, other light');
  assert.ok(printDistance(pa, regionPrint(other, whole(other), ART, make)) > 0.7, 'other art');
});

test('the border: dark, light, or between', () => {
  assert.equal(borderKind(30), 'dark');
  assert.equal(borderKind(200), 'light');
  assert.equal(borderKind(120), null);
});

test('the artist found in what was read off the bottom, a letter or two off', () => {
  assert.equal(artistIn('Illus. Ron Spears TM & © 1997 Wizards', 'Ron Spears'), 1);
  assert.ok(artistIn('Illus. R0n Spaars', 'Ron Spears') >= 0.75);
  assert.equal(artistIn('TM & © 1997 Wizards of the Coast', 'Ron Spears'), 0);
});

test("a printing's score: each clue as it agrees or not", () => {
  const p = printing();
  assert.equal(scorePrinting(p, clues({ border: 'dark' })).parts.border, WEIGHTS.border.match);
  assert.equal(scorePrinting(p, clues({ border: 'light' })).parts.border, WEIGHTS.border.miss);
  assert.equal(scorePrinting(printing({ frame: '2015' }), clues()).parts.frame, WEIGHTS.frame);
  assert.equal(scorePrinting(p, clues()).parts.frame, undefined);
  assert.equal(scorePrinting(p, clues({ artist: 1 })).parts.artist, WEIGHTS.artist);
  assert.equal(scorePrinting(p, clues({ year: 1997 })).parts.year, WEIGHTS.year);
  assert.equal(scorePrinting(p, clues({ year: 2003 })).parts.year, undefined);
  assert.equal(scorePrinting(p, clues({ number: '57' })).parts.number, WEIGHTS.number);
  assert.equal(scorePrinting(p, clues({ art: 0.1 })).parts.art, WEIGHTS.art);
  assert.equal(scorePrinting(p, clues({ art: 1.2 })).parts.art, -WEIGHTS.art);
});

test('the set symbol: none on the card favours a set that printed none; one seen, the best fits gain', () => {
  const alpha = printing({ set: 'lea', frame: '1993' });
  assert.equal(scorePrinting(alpha, clues({ symbolSeen: false })).parts.symbol, WEIGHTS.symbol);
  assert.equal(scorePrinting(alpha, clues({ symbolSeen: true, symbolBest: 0.9 })).parts.symbol, -WEIGHTS.symbol);
  const seen = clues({ symbolSeen: true, symbolBest: 0.9 });
  assert.equal(scorePrinting(printing(), { ...seen, symbol: 0.9 }).parts.symbol, WEIGHTS.symbolShape);
  assert.equal(scorePrinting(printing(), { ...seen, symbol: 0.6 }).parts.symbol, -WEIGHTS.symbolShape);
  assert.equal(scorePrinting(printing(), clues({ symbol: 0.9 })).parts.symbol, undefined, 'no symbol seen: nothing said');
});

test("a printing agreeing on art, border and symbol is taken; art alone isn't enough", () => {
  const all = scorePrinting(printing(), clues({ art: 0.2, border: 'dark', symbolSeen: true, symbolBest: 0.9, symbol: 0.9 })).score;
  assert.ok(all >= TAKE.score, `${all}`);
  const artOnly = scorePrinting(printing(), clues({ art: 0.2 })).score;
  assert.ok(artOnly < TAKE.score, `${artOnly}`);
});
