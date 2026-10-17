import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineOfScan, scanFinish, scanQuote, scanText } from '../src/lib/scanPrice.js';

// docs/SCAN_FUNCTION.md 7.1: TCGplayer > JustTCG > Cardmarket > ask (owner, 2026-10-16).

const PCT = { NM: 100, LP: 90, MP: 80, HP: 70, DMG: 60 };
const TCG = { price: 2.0, source: 'scryfall_fallback' };

test('TCGplayer first: the ladder as Use TCGplayer, and JustTCG is never asked', () => {
  const q = scanQuote({ condition: 'LP', tcgplayer: TCG, market: undefined, cardmarketUsd: 9, pct: PCT });
  assert.equal(q.step, 'tcgplayer');
  assert.equal(q.override, 'fallback');
  assert.equal(q.entry.price, 1.75);           // $2 × 90% = $1.80, rounded down to the quarter
  assert.equal(q.entry.base.from, 'Scryfall');  // buildLine reads that as scryfall_fallback
  assert.equal(q.ladder.NM.price, 2);
});

test('a project rounds up', () => {
  const tcg = { price: 1.9, source: 'scryfall_fallback' };
  assert.equal(scanQuote({ condition: 'NM', tcgplayer: tcg, market: undefined, cardmarketUsd: null, pct: PCT }).entry.price, 1.75);
  assert.equal(scanQuote({ condition: 'NM', tcgplayer: tcg, market: undefined, cardmarketUsd: null, pct: PCT, up: true }).entry.price, 2);
});

test('no TCGplayer price: JustTCG has to be fetched first', () => {
  const q = scanQuote({ condition: 'NM', tcgplayer: null, market: undefined, cardmarketUsd: 5, pct: PCT });
  assert.equal(q.step, 'needs_justtcg');
  assert.equal(q.ladder, null);
});

test('JustTCG next: its own price for the condition, or its NM × the percentage', () => {
  let q = scanQuote({ condition: 'MP', tcgplayer: null, market: { NM: 10, LP: 8, MP: 6.5, HP: null, DMG: null }, cardmarketUsd: 3, pct: PCT });
  assert.equal(q.step, 'justtcg');
  assert.equal(q.override, null);
  assert.equal(q.entry.source, 'justtcg');
  assert.equal(q.entry.price, 6.5);
  q = scanQuote({ condition: 'HP', tcgplayer: null, market: { NM: 10, LP: null, MP: null, HP: null, DMG: null }, cardmarketUsd: 3, pct: PCT });
  assert.equal(q.step, 'justtcg');
  assert.equal(q.entry.source, 'fallback');
  assert.equal(q.entry.price, 7);              // $10 × 70%
});

test('a $0 TCGplayer price is no price', () => {
  const q = scanQuote({ condition: 'NM', tcgplayer: { price: 0, source: 'scryfall_fallback' }, market: {}, cardmarketUsd: 1.2, pct: PCT });
  assert.equal(q.step, 'cardmarket');
});

test('Cardmarket after that, as Use Cardmarket', () => {
  const q = scanQuote({ condition: 'NM', tcgplayer: null, market: {}, cardmarketUsd: 4.4, pct: PCT });
  assert.equal(q.step, 'cardmarket');
  assert.equal(q.override, 'cardmarket');
  assert.equal(q.entry.base.from, 'Cardmarket');
  assert.equal(q.entry.price, 4.25);
});

test('JustTCG with nothing for the condition falls through to Cardmarket', () => {
  // JustTCG prices only LP: no NM to work NM out from.
  const q = scanQuote({ condition: 'NM', tcgplayer: null, market: { NM: null, LP: 3, MP: null, HP: null, DMG: null }, cardmarketUsd: 2, pct: PCT });
  assert.equal(q.step, 'cardmarket');
});

test('nothing anywhere: the phone asks', () => {
  const q = scanQuote({ condition: 'NM', tcgplayer: null, market: {}, cardmarketUsd: null, pct: PCT });
  assert.equal(q.step, 'none');
  assert.equal(q.entry, null);
});

test('the finish follows the switch, within what was printed', () => {
  assert.equal(scanFinish({ finishes: ['nonfoil', 'foil'] }, false), 'nonfoil');
  assert.equal(scanFinish({ finishes: ['nonfoil', 'foil'] }, true), 'foil');
  assert.equal(scanFinish({ finishes: ['foil'] }, false), 'foil');             // foil only
  assert.equal(scanFinish({ finishes: ['nonfoil'] }, true), 'nonfoil');        // no foil printing
  assert.equal(scanFinish({ finishes: ['etched'] }, false), 'etched');
  assert.equal(scanFinish({ finishes: ['nonfoil', 'etched'] }, true), 'etched');
  assert.equal(scanFinish({ finishes: ['nonfoil', 'foil', 'etched'] }, 'etched'), 'etched');
  assert.equal(scanFinish({}, true), 'nonfoil');
});

test('a scan reads like a list line', () => {
  assert.equal(scanText({ name: 'Lightning Bolt', set_code: '2x2', collector_number: '117', finish: 'foil', condition: 'LP' }),
    'Lightning Bolt (2X2) 117 *F* [LP]');
  assert.equal(scanText({ name: 'Sol Ring', set_code: 'CMR', collector_number: '472', finish: 'etched', condition: 'NM' }),
    'Sol Ring (CMR) 472 *E*');
});

test('lineOfScan: the line a scan made, by its id in the snapshot; nothing for a scan that made none', () => {
  const lines = [
    { id: 'a', price_snapshot: { scan: { from: 'phone', scan_id: 's1' } } },
    { id: 'b', price_snapshot: { manual: 1 } },
    { id: 'c', price_snapshot: null },
  ];
  assert.equal(lineOfScan(lines, 's1')?.id, 'a');
  assert.equal(lineOfScan(lines, 's2'), null);
  assert.equal(lineOfScan([], 's1'), null);
  assert.equal(lineOfScan(undefined, 's1'), null);
});
