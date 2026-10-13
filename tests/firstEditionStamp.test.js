import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_SHIFTS, STAMP_LAYOUTS, drawnStampBox, fillStamp, findStamp, firstEditionMode, stampDrawing, stampLayout, stampRect,
  tcgdexCardId,
} from '../src/lib/firstEditionStamp.js';

const TCGDEX = 'https://assets.tcgdex.net/en/base/base1/4/high.webp';
const card = { game: 'pokemon', lang: 'en', hasFirstEdition: true, firstEdition: false, category: 'Pokemon', image: TCGDEX };

test('which cards get the stamp treatment, and which way', () => {
  assert.deepEqual(firstEditionMode(card), { mode: 'hide', layout: 'pokemon', shift: 0 });
  assert.deepEqual(firstEditionMode({ ...card, firstEdition: true }), { mode: 'show', layout: 'pokemon', shift: 0 });
  assert.deepEqual(firstEditionMode({ ...card, category: 'Trainer' }), { mode: 'hide', layout: 'trainer', shift: 0 });
  // Not: Magic, Japanese, a card with no 1st Edition, an Energy, a picture from elsewhere.
  assert.equal(firstEditionMode({ ...card, game: 'mtg' }), null);
  assert.equal(firstEditionMode({ ...card, lang: 'ja' }), null);
  assert.equal(firstEditionMode({ ...card, hasFirstEdition: false }), null);
  assert.equal(firstEditionMode({ ...card, category: 'Energy' }), null);
  assert.equal(firstEditionMode({ ...card, image: 'https://images.pokemontcg.io/base1/4_hires.png' }), null);
  assert.equal(firstEditionMode({ ...card, image: null }), null);
  assert.equal(stampLayout('Pokemon'), 'pokemon');
  assert.equal(stampLayout('Energy'), null);
});

test('the rectangle read holds the zone with a margin, inside the picture', () => {
  for (const layout of Object.keys(STAMP_LAYOUTS)) {
    const r = stampRect(layout, 600, 825);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 600 && r.y + r.h <= 825);
    assert.ok(r.zone.x0 >= 6 && r.zone.y0 >= 6 && r.zone.x1 <= r.w - 6 && r.zone.y1 <= r.h - 6);
    assert.ok(r.core.x0 > r.zone.x0 && r.core.x1 < r.zone.x1 && r.core.y0 > r.zone.y0 && r.core.y1 < r.zone.y1);
  }
});

// A made-up piece of a scan: the card's pink with grain, and on it, if asked,
// a stamp (a dark disc with a light "1", and dark letters over it) and an
// energy symbol's top reaching in from below the zone.
function scan({ stamp = true, energy = true, seed = 7 } = {}) {
  const r = stampRect('pokemon', 600, 825);
  const { w, h } = r;
  const data = new Uint8ClampedArray(w * h * 4);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const put = (x, y, rgb) => rgb.forEach((v, c) => { data[(y * w + x) * 4 + c] = v; });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = (rnd() - 0.5) * 16;
      put(x, y, [232 + g, 150 + g, 140 + g]);
      data[(y * w + x) * 4 + 3] = 255;
    }
  }
  const cx = Math.round((r.core.x0 + r.core.x1) / 2);
  const cy = Math.round((r.core.y0 + r.core.y1) / 2);
  if (stamp) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= 11) put(x, y, Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 6 ? [240, 240, 235] : [25, 22, 20]);
      }
    }
    for (const dx of [-14, -7, 0, 7, 14]) {           // the letters, over the disc
      for (let y = cy - 19; y < cy - 14; y++) for (let x = cx + dx - 1; x <= cx + dx + 1; x++) put(x, y, [30, 25, 25]);
    }
  }
  if (energy) {                                         // reaches out of the zone: never touched
    for (let y = r.zone.y1 - 3; y < h; y++) for (let x = cx - 4; x <= cx + 4; x++) put(x, y, [20, 20, 20]);
  }
  return { r, data, cx, cy };
}

test('the stamp is found, and only it is masked: not a mark reaching out of the zone', () => {
  const { r, data, cx, cy } = scan();
  const found = findStamp(data, r.w, r.h, r);
  assert.equal(found.stamped, true);
  assert.ok(found.core > 0.5);                          // dark, but for its "1"
  const m = (x, y) => found.mask[y * r.w + x];
  assert.equal(m(cx + 5, cy + 5), 1);                   // the disc
  assert.equal(m(cx, cy), 1);                           // its light "1", enclosed
  assert.equal(m(cx, cy - 17), 1);                      // a letter
  assert.equal(m(cx, r.zone.y1 - 2), 0);                // the energy symbol's top, inside the zone
  assert.equal(m(cx, r.h - 2), 0);
  assert.equal(m(2, 2), 0);                             // the margin
});

test('a scan without the stamp is left alone', () => {
  const { r, data } = scan({ stamp: false });
  assert.equal(findStamp(data, r.w, r.h, r).stamped, false);
});

test('the fill takes the card colour around it, changes nothing else, and is the same every time', () => {
  const { r, data, cx, cy } = scan();
  const found = findStamp(data, r.w, r.h, r);
  const before = data.slice();
  const out = fillStamp(data, r.w, r.h, found.mask, found.body);
  for (let p = 0; p < r.w * r.h; p++) {
    if (found.mask[p]) continue;
    for (let c = 0; c < 4; c++) assert.equal(out[p * 4 + c], before[p * 4 + c]);
  }
  const at = (x, y) => [0, 1, 2].map((c) => out[(y * r.w + x) * 4 + c]);
  for (const [x, y] of [[cx, cy], [cx + 6, cy + 4], [cx, cy - 17]]) {
    const [red, green, blue] = at(x, y);
    assert.ok(Math.abs(red - 232) < 25 && Math.abs(green - 150) < 25 && Math.abs(blue - 140) < 25, `${x},${y}: ${red},${green},${blue}`);
  }
  // Painted out, it isn't found again.
  assert.equal(findStamp(out, r.w, r.h, r).stamped, false);
  const again = fillStamp(before.slice(), r.w, r.h, found.mask, found.body);
  assert.deepEqual([...again], [...out]);
});

test('the drawn stamp: a disc, a "1" and EDITION fanned over it', () => {
  const d = stampDrawing();
  assert.equal(d.viewBox, '0 0 135 100');
  assert.equal(d.letters.map((l) => l.ch).join(''), 'EDITION');
  assert.ok(d.disc.cy + d.disc.r <= 100 && d.disc.cx === 67.5);
  assert.match(d.letters[3].transform, /^rotate\(0 /);   // T stands at the top
});

test("Rocket's Mewtwo (Gym Challenge 14) has its stamp 64 pixels higher; every other card in its place", () => {
  const mewtwo = 'https://assets.tcgdex.net/en/gym/gym2/14/high.webp';
  assert.equal(tcgdexCardId(mewtwo), 'gym2-14');
  assert.equal(tcgdexCardId(TCGDEX), 'base1-4');
  assert.equal(tcgdexCardId('https://images.pokemontcg.io/base1/4_hires.png'), null);
  const mode = firstEditionMode({ ...card, image: mewtwo });
  assert.equal(Math.round(mode.shift * 825), -64);
  assert.equal(firstEditionMode(card).shift, 0);
  assert.deepEqual(Object.keys(CARD_SHIFTS), ['gym2-14']);
  const usual = stampRect('pokemon', 600, 825);
  const moved = stampRect('pokemon', 600, 825, mode.shift);
  assert.equal(usual.y - moved.y, 64);
  assert.deepEqual(moved.zone, usual.zone);               // the same shape, only higher
  assert.ok(Math.abs(drawnStampBox('pokemon', mode.shift).top - (STAMP_LAYOUTS.pokemon.stamp.y0 - 64 / 825)) < 1e-9);
});
