import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SELL_FLOOR, roundUpPrice, sellFloorFrom } from '../src/lib/money.js';
import { sellPriceFor } from '../src/lib/sellPrice.js';
import { settingSummary } from '../src/lib/settingText.js';
import { targetOf } from '../src/lib/changelog.js';
import {
  customSkuFor, customSkuForDay, fileSafe, massCreateCsv, massCreateRows, nearMintPrice, nearMintPrices, withoutRestamps,
} from '../src/lib/massCreate.js';

// docs/EXPORT_FUNCTION.md 5.3: the buy steps, upward.
test('rounding up: each band, prices on a step, float error', () => {
  const cases = [[0.333, 0.34], [0.30, 0.30], [0.29, 0.29], [1.01, 1.25], [2.10, 2.25], [1.00, 1.00], [9.80, 10.00],
    // From $10, half the old steps (decision 478): 50 cents to $100, then the dollar to $1,000.
    [10.01, 10.50], [10.51, 11.00], [99.50, 99.50], [99.51, 100.00], [100.01, 101.00], [1000.01, 1010.00], [1000, 1000],
    [12, 12]];
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
  // Decision 417: the Export sell floor from Settings.
  const higher = sellPriceFor(line({ condition: 'MP' }), { ...today, floor: 0.75 });
  assert.equal(higher.price, 0.75);
  assert.ok(higher.basis.floored);
  assert.equal(higher.basis.floor, 0.75);
  assert.equal(sellPriceFor(line({}), { ...today, floor: 0.75 }).price, 1.25, 'above the floor: unchanged');
});

// Decision 417: the saved floor, checked: $0.40 (the database's own lowest) to $10, whole cents.
test('the Export sell floor setting', () => {
  assert.equal(sellFloorFrom(undefined), 0.4);
  assert.equal(sellFloorFrom(0.75), 0.75);
  assert.equal(sellFloorFrom(0.3), 0.4, 'never below $0.40');
  assert.equal(sellFloorFrom(10.01), 0.4, 'at most $10');
  assert.equal(sellFloorFrom('nonsense'), 0.4);
  assert.equal(settingSummary('sell_floor', 0.4, 0.5), 'Export sell floor: $0.40 → $0.50.');
  assert.equal(targetOf({ action: 'setting_changed', target_name: 'sell_floor' }), 'Export sell floor');
});

test('a fallback card that JustTCG prices today takes JustTCG\'s price', () => {
  const today = { market: { NM: 4.1, LP: null, MP: null, HP: null, DMG: null }, fallback: { price: 9, source: 'scryfall_fallback' }, pct };
  assert.equal(sellPriceFor(line({ price_source: 'scryfall_fallback' }), today).price, 4.25);
  // LP has no JustTCG price: JustTCG's NM × 90% = 3.69 → 3.75.
  assert.equal(sellPriceFor(line({ price_source: 'justtcg_fallback', condition: 'LP' }), today).price, 3.75);
});

test('Use Fallback and Use Cardmarket stay on', () => {
  const today = { market: { NM: 50, LP: 45, MP: null, HP: null, DMG: null }, fallback: { price: 20.2, source: 'scryfall_fallback' }, cardmarketUsd: 30.5, pct };
  assert.equal(sellPriceFor(line({ price_source: 'scryfall_fallback', price_snapshot: { override: 'fallback' } }), today).price, 20.50);
  assert.equal(sellPriceFor(line({ price_source: 'cardmarket', price_snapshot: { override: 'cardmarket' } }), today).price, 30.50);
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

// Decision 384: the Pokémon stickers round the true price, so value is it before the steps and floor.
test("value: the same price before the steps and the $0.40 floor", () => {
  const today = { market: { NM: 1.01, LP: null, MP: null, HP: null, DMG: 0.1 }, fallback: null, cardmarketUsd: null, pct };
  assert.deepEqual([sellPriceFor(line({}), today).price, sellPriceFor(line({}), today).value], [1.25, 1.01]);
  assert.deepEqual([sellPriceFor(line({ condition: 'DMG' }), today).price, sellPriceFor(line({ condition: 'DMG' }), today).value], [0.40, 0.1]);
  // LP: NM × 90%, unrounded.
  assert.ok(Math.abs(sellPriceFor(line({ condition: 'LP' }), today).value - 0.909) < 1e-9);
  // A manual price above today's: the manual price itself.
  assert.equal(sellPriceFor(line({ price_source: 'manual', unit_price: 2.10 }), today).value, 2.10);
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

test('rows: same product, condition and price merge; sorted; can\'t-upload left out; only NM is priced', () => {
  const rows = massCreateRows([
    stamped({}), stamped({ quantity: 2 }),
    stamped({ cc_condition: 'Lightly Played' }),
    stamped({ cc_sell_price: 13 }),
    stamped({ cc_product_name: 'Ashnod\'s Altar', cc_category: 'Antiquities' }),
    stamped({ cc_status: 'cant_upload' }),
  ]);
  assert.deepEqual(rows.map((r) => [r.Category, r['Product Name'], r.Condition, r['Sell Price'], r['Add Qty']]), [
    ['Antiquities', 'Ashnod\'s Altar', 'Near Mint', '12.00', 1],
    ['Mercadian Masques', 'Snuff Out', 'Near Mint', '12.00', 3],
    ['Mercadian Masques', 'Snuff Out', 'Near Mint', '13.00', 1],
    ['Mercadian Masques', 'Snuff Out', 'Lightly Played', '', 1],
  ]);
});

test('the CSV: header, quotes only where needed, Custom SKU last, no BOM', () => {
  const csv = massCreateCsv(massCreateRows([stamped({ cc_product_name: 'Numot, the Devastator', cc_category: 'Commander' })]));
  assert.equal(csv, 'Add Qty,Product Name,Category,Condition,Language,Sell Price,Custom SKU\n'
    + '1,"Numot, the Devastator",Commander,Near Mint,English,12.00,100126');
  assert.notEqual(csv.charCodeAt(0), 0xfeff);
  assert.equal(fileSafe('Jordan Reyes!'), 'jordan-reyes');
});

test('the CSV: quotes, line breaks and a name that starts with +', () => {
  const csv = massCreateCsv(massCreateRows([
    stamped({ cc_product_name: 'Kongming, "Sleeping Dragon"', cc_category: 'Commander' }),
    stamped({ cc_product_name: 'Line\nTwo', cc_category: 'Commander' }),
    // Crystal Commerce matches the name as written: not escaped like a spreadsheet formula.
    stamped({ cc_product_name: '+2 Mace', cc_category: 'Commander' }),
  ]));
  assert.equal(csv, 'Add Qty,Product Name,Category,Condition,Language,Sell Price,Custom SKU\n'
    + '1,+2 Mace,Commander,Near Mint,English,12.00,100126\n'
    + '1,"Kongming, ""Sleeping Dragon""",Commander,Near Mint,English,12.00,100126\n'
    + '1,"Line\nTwo",Commander,Near Mint,English,12.00,100126');
});

// Decision 372: a collection's file again is every export of its own, not Can't upload's restamps.
test("the same file again: every own export, not a Can't upload cards export's cards", () => {
  const FIRST = '2026-10-10T18:00:00.1+00:00';
  const SECOND = '2026-10-12T18:00:00.2+00:00';
  const CANT = '2026-10-13T18:00:00.3+00:00';
  const lines = [
    stamped({ id: 1, cc_exported_at: FIRST }),
    stamped({ id: 2, cc_exported_at: SECOND }),
    stamped({ id: 3, cc_exported_at: CANT }),                        // restamped from Can't upload cards
    stamped({ id: 4, cc_status: 'cant_upload', cc_exported_at: FIRST }), // still can't upload
  ];
  assert.deepEqual(withoutRestamps(lines, new Set([CANT])).map((l) => l.id), [1, 2]);
  assert.deepEqual(withoutRestamps(lines, new Set()).map((l) => l.id), [1, 2, 3]);
});

// Owner, 2026-10-11: CC prices every condition from Near Mint.
const MTG_PCT = { NM: 100, LP: 90, MP: 80, HP: 70, DMG: 60 };

test('a worse condition\'s Sell Price ÷ its percentage, rounded up, at least $0.40', () => {
  assert.equal(nearMintPrice(87, 80), 109);        // $108.75
  assert.equal(nearMintPrice(1.75, 90), 2);        // $1.94
  assert.equal(nearMintPrice(1.5, 70), 2.25);      // $2.14
  assert.equal(nearMintPrice(0.1, 60), 0.4);       // $0.17, floored
  assert.equal(nearMintPrice(5, 0), null);
  assert.equal(nearMintPrice(5, undefined), null);
});

test('only Near Mint carries a price: worse conditions add cards, a 0-quantity NM row sets the price', () => {
  const sku = { cc_custom_sku: '101126' };
  const rows = massCreateRows([
    stamped({ ...sku, cc_product_name: 'Tundra', cc_category: 'Revised Edition', cc_condition: 'Moderately Played', cc_sell_price: 87 }),
    stamped({ ...sku, cc_product_name: 'Sol Ring', cc_category: 'Commander Masters', cc_sell_price: 3.5, quantity: 2 }),
    stamped({ ...sku, cc_product_name: 'Sol Ring', cc_category: 'Commander Masters', cc_condition: 'Lightly Played', cc_sell_price: 3.25 }),
    stamped({ ...sku, cc_product_name: 'Lightning Bolt', cc_category: 'Fourth Edition', cc_condition: 'Heavily Played', cc_sell_price: 1.5 }),
    stamped({ ...sku, cc_product_name: 'Lightning Bolt', cc_category: 'Fourth Edition', cc_condition: 'Lightly Played', cc_sell_price: 1.75 }),
  ], MTG_PCT);
  assert.equal(massCreateCsv(rows), [
    'Add Qty,Product Name,Category,Condition,Language,Sell Price,Custom SKU',
    // NM copies in the file: their own price sets NM, no extra row.
    '2,Sol Ring,Commander Masters,Near Mint,English,3.50,101126',
    '1,Sol Ring,Commander Masters,Lightly Played,English,,101126',
    // Two worse conditions: the best one (LP) prices NM, $1.75 ÷ 90%.
    '0,Lightning Bolt,Fourth Edition,Near Mint,English,2.00,101126',
    '1,Lightning Bolt,Fourth Edition,Lightly Played,English,,101126',
    '1,Lightning Bolt,Fourth Edition,Heavily Played,English,,101126',
    // $87 ÷ 80% = $108.75, rounded up.
    '0,Tundra,Revised Edition,Near Mint,English,109.00,101126',
    '1,Tundra,Revised Edition,Moderately Played,English,,101126',
  ].join('\n'));
});

test('NM prices: the best condition\'s highest Sell Price; the percentage stamped at the export wins', () => {
  const lp = { cc_condition: 'Lightly Played' };
  const two = nearMintPrices([stamped({ ...lp, cc_sell_price: 1.75 }), stamped({ ...lp, cc_sell_price: 2 })], MTG_PCT);
  assert.equal([...two.values()][0].price, 2.25);   // $2 ÷ 90% = $2.22
  assert.equal([...two.values()][0].from, 'LP');
  const kept = nearMintPrices([stamped({ ...lp, cc_sell_price: 2, cc_sell_basis: { conditionPct: 50 } })], MTG_PCT);
  assert.equal([...kept.values()][0].price, 4);
  // Can't-upload cards set nothing; nor does a card with no percentage to divide by.
  assert.equal(nearMintPrices([stamped({ ...lp, cc_status: 'cant_upload' })], MTG_PCT).size, 0);
  assert.equal(nearMintPrices([stamped(lp)], {}).size, 0);
});

// A day page's export is stamped with the day exported (owner, 2026-10-17; 0071).
test('the Custom SKU of a calendar day', () => {
  assert.equal(customSkuForDay('2026-10-16'), '101626');
  assert.equal(customSkuForDay('2026-06-07'), '60726');
  assert.equal(customSkuForDay('2026-11-01'), '110126');
});
