import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SELL_FLOOR, roundUpPrice } from '../src/lib/money.js';
import { sellPriceFor } from '../src/lib/sellPrice.js';
import { customSkuFor, fileSafe, massCreateCsv, massCreateRows } from '../src/lib/massCreate.js';

// docs/EXPORT_FUNCTION.md 5.3: the buy steps, upward.
test('rounding up: each band, prices on a step, float error', () => {
  const cases = [[0.333, 0.34], [0.30, 0.30], [0.29, 0.29], [1.01, 1.25], [2.10, 2.25], [1.00, 1.00], [9.80, 10.00],
    [10.01, 11.00], [99.50, 100.00], [100.01, 105.00], [1000.01, 1010.00], [1000, 1000], [12, 12]];
  for (const [raw, up] of cases) assert.equal(roundUpPrice(raw), up, `${raw}`);
  assert.equal(roundUpPrice(null), null);
  assert.equal(SELL_FLOOR, 0.4);
});

const pct = { NM: 100, LP: 90, MP: 80, HP: 70, DMG: 60 };
const line = (over) => ({ condition: 'NM', unit_price: 1, market_price: 1, price_source: 'justtcg', price_snapshot: {}, ...over });

// 5.2: worked out the same way as at the buy, today.
test('a JustTCG-priced card: today\'s price for its condition, rounded up, floored', () => {
  const today = { market: { NM: 1.01, LP: 0.9, MP: 0.5, HP: 0.3, DMG: 0.1 }, fallback: null, cardmarketUsd: null, pct };
  assert.equal(sellPriceFor(line({}), today).price, 1.25);
  assert.equal(sellPriceFor(line({ condition: 'LP' }), today).price, 0.90);
  const cheap = sellPriceFor(line({ condition: 'DMG' }), today);
  assert.equal(cheap.price, 0.40);
  assert.ok(cheap.basis.floored);
});

test('a fallback card that JustTCG prices today takes JustTCG\'s price', () => {
  const today = { market: { NM: 4.1, LP: null, MP: null, HP: null, DMG: null }, fallback: { price: 9, source: 'scryfall_fallback' }, pct };
  assert.equal(sellPriceFor(line({ price_source: 'scryfall_fallback' }), today).price, 4.25);
  // LP has no JustTCG price: JustTCG's NM × 90% = 3.69 → 3.75.
  assert.equal(sellPriceFor(line({ price_source: 'justtcg_fallback', condition: 'LP' }), today).price, 3.75);
});

test('Use Fallback and Use Cardmarket stay on', () => {
  const today = { market: { NM: 50, LP: 45, MP: null, HP: null, DMG: null }, fallback: { price: 20.2, source: 'scryfall_fallback' }, cardmarketUsd: 30.5, pct };
  assert.equal(sellPriceFor(line({ price_source: 'scryfall_fallback', price_snapshot: { override: 'fallback' } }), today).price, 21.00);
  assert.equal(sellPriceFor(line({ price_source: 'cardmarket', price_snapshot: { override: 'cardmarket' } }), today).price, 31.00);
  // No Cardmarket price today: the ladder runs as the Price screen would, without it.
  const noEur = sellPriceFor(line({ price_source: 'cardmarket', price_snapshot: { override: 'cardmarket' } }), { ...today, cardmarketUsd: null });
  assert.equal(noEur.price, 50.00);
  assert.equal(noEur.basis.overrideApplied, false);
});

test('a manual price: the higher of it and today\'s, rounded up; alone when there\'s nothing to compare', () => {
  const today = { market: { NM: 3.2, LP: null, MP: null, HP: null, DMG: null }, fallback: null, pct };
  assert.equal(sellPriceFor(line({ price_source: 'manual', unit_price: 2.10 }), today).price, 3.25);
  assert.equal(sellPriceFor(line({ price_source: 'manual', unit_price: 5.10 }), today).price, 5.25);
  const nothing = { market: {}, fallback: null, pct };
  const alone = sellPriceFor(line({ price_source: 'manual', unit_price: 2.10 }), nothing);
  assert.equal(alone.price, 2.25);
  assert.equal(alone.basis.used, 'manual');
  // Not manual and nothing today: the market price recorded at the buy.
  assert.equal(sellPriceFor(line({ market_price: 7.3 }), nothing).basis.used, 'at_buy');
  assert.equal(sellPriceFor(line({ market_price: 7.3 }), nothing).price, 7.50);
});

// 4.4: month with no leading zero, the day always two digits.
test('the Custom SKU from the export\'s date (store time)', () => {
  const at = (iso) => customSkuFor(new Date(iso));
  assert.equal(at('2026-06-17T20:00:00Z'), '61726');
  assert.equal(at('2026-06-05T20:00:00Z'), '60526');
  assert.equal(at('2026-01-11T20:00:00Z'), '11126');
  assert.equal(at('2026-11-01T20:00:00Z'), '110126');
  assert.equal(at('2026-12-31T20:00:00Z'), '123126');
  assert.equal(at('2026-10-02T03:00:00Z'), '100126');   // 8 PM on October 1st in the store
});

const stamped = (over) => ({
  cc_status: 'exported', quantity: 1, cc_product_name: 'Snuff Out', cc_category: 'Mercadian Masques',
  cc_condition: 'Near Mint', cc_sell_price: 12, cc_custom_sku: '100126', ...over,
});

test('rows: same product, condition and price merge; sorted; can\'t-upload left out', () => {
  const rows = massCreateRows([
    stamped({}), stamped({ quantity: 2 }),
    stamped({ cc_condition: 'Light Play' }),
    stamped({ cc_sell_price: 13 }),
    stamped({ cc_product_name: 'Ashnod\'s Altar', cc_category: 'Antiquities' }),
    stamped({ cc_status: 'cant_upload' }),
  ]);
  assert.deepEqual(rows.map((r) => [r.Category, r['Product Name'], r.Condition, r['Sell Price'], r['Add Qty']]), [
    ['Antiquities', 'Ashnod\'s Altar', 'Near Mint', '12.00', 1],
    ['Mercadian Masques', 'Snuff Out', 'Near Mint', '12.00', 3],
    ['Mercadian Masques', 'Snuff Out', 'Near Mint', '13.00', 1],
    ['Mercadian Masques', 'Snuff Out', 'Light Play', '12.00', 1],
  ]);
});

test('the CSV: header, quotes only where needed, Custom SKU last, no BOM', () => {
  const csv = massCreateCsv(massCreateRows([stamped({ cc_product_name: 'Numot, the Devastator', cc_category: 'Commander' })]));
  assert.equal(csv, 'Add Qty,Product Name,Category,Condition,Language,Sell Price,Custom SKU\n'
    + '1,"Numot, the Devastator",Commander,Near Mint,English,12.00,100126');
  assert.notEqual(csv.charCodeAt(0), 0xfeff);
  assert.equal(fileSafe('Jordan Reyes!'), 'jordan-reyes');
});
