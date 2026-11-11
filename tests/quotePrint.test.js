import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUOTE_NOTE, QUOTE_TITLE, quoteFileName, quoteRow, quoteSheet } from '../src/lib/quotePrint.js';
import { quotePdf } from '../src/lib/quotePdf.js';
import { rateTotals } from '../src/lib/rates.js';

// Decision 579: the in-progress walk-in printout. Hand-made lines, never a real buy.
const RATES = { cash: 30, credit: 60, customCash: null, customCredit: null, tiers: { low: { under: 0, cash: 30, credit: 60 }, high: { over: 99999, cash: 30, credit: 60 } } };
const card = (over) => ({
  id: over.id ?? 'a', game: 'mtg', name: 'Sol Ring', set_code: 'cmr', collector_number: '472', finish: 'nonfoil',
  condition: 'NM', quantity: 1, unit_price: 10, price_source: 'justtcg', treatments: [], ...over,
});

test('a row: count, name, set, number, finish, condition, and one card in Cash and Credit at its rate', () => {
  const r = quoteRow(card({ quantity: 2, finish: 'etched', condition: 'LP', unit_price: 10 }), RATES);
  assert.deepEqual(
    { qty: r.qty, name: r.name, set: r.set, number: r.number, finish: r.finish, condition: r.condition },
    { qty: 2, name: 'Sol Ring', set: 'CMR', number: '472', finish: 'Etched', condition: 'LP' },
  );
  assert.equal(r.cash, 3);
  assert.equal(r.credit, 6);
  // Its own rate (Set Rate) is what it's paid at.
  const own = quoteRow(card({ custom_cash_pct: 50, custom_credit_pct: 70 }), RATES);
  assert.equal(own.cash, 5);
  assert.equal(own.credit, 7);
});

test('a Pokémon card, a bulk item and a placeholder', () => {
  const pk = quoteRow(card({ game: 'pokemon', name: 'Pikachu', set_code: 'XY', collector_number: '174', finish: 'reverse', lang: 'ja', first_edition: true }), RATES);
  assert.equal(pk.name, 'Pikachu (1st Ed, JP)');
  assert.equal(pk.finish, 'Reverse');
  const bulk = quoteRow(card({ bulk_kind: 'mtg_100_common', name: 'MTG 100 Bulk commons/uncommons', set_code: null, collector_number: null, unit_price: 5, quantity: 3 }), RATES);
  assert.deepEqual([bulk.qty, bulk.name, bulk.set, bulk.cash], [3, '100 MTG Bulk commons/uncommons', '', 1.5]);
  const ph = quoteRow(card({ bulk_kind: 'mtg_placeholder', name: 'Meowth 117' }), RATES);
  assert.equal(ph.name, 'Meowth 117 [Placeholder]');
});

test('the sheet: rows as added, the foot as the list totals have it, struck cards left out', () => {
  const lines = [
    card({ id: 'a', name: 'Zebra', unit_price: 3.33 }),
    card({ id: 'b', name: 'Apple', unit_price: 7.77, quantity: 2 }),
    card({ id: 'c', name: 'Gone', struck_at: '2026-11-10' }),
  ];
  const s = quoteSheet(lines, RATES);
  assert.deepEqual(s.rows.map((r) => r.name), ['Zebra', 'Apple']);
  assert.equal(s.count, '3 cards');
  const t = rateTotals(lines.slice(0, 2), RATES);
  assert.equal(s.cash, t.cash);
  assert.equal(s.credit, t.credit);
  assert.equal(quoteSheet([], RATES).cash, null);
});

test('the PDF: its title, the note, a blank customer line, every row, more pages as it runs on', () => {
  const lines = Array.from({ length: 120 }, (_, i) => card({ id: String(i), name: `Card ${i}` }));
  const doc = quotePdf({ sheet: quoteSheet(lines, RATES), printedAt: new Date(2026, 10, 10, 14, 25) });
  const out = doc.output();
  assert.match(out, new RegExp(QUOTE_TITLE));
  assert.match(out, new RegExp(QUOTE_NOTE));
  assert.match(out, /Customer:/);
  assert.match(out, /Card 119/);
  assert.match(out, /Cash offer/);
  assert.ok(doc.getNumberOfPages() >= 3);
  assert.equal(quoteFileName(new Date(2026, 10, 10, 14, 5)), 'buy-in-progress-2026-11-10-1405.pdf');
});
