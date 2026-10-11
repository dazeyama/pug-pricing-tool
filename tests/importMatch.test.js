import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categorySets, cardsForRow, choosePrinting, conditionCode, defaultName, fileFormat, finishOf, finishOfPrinting,
  importKey, missingColumns, namesFor, readRows, readTcgplayerRows, rowFallbackPrice, scorePrinting,
} from '../src/lib/importMatch.js';
import { fold } from '../src/lib/ccMatch.js';
import Papa from 'papaparse';
import { massCreateCsv, massCreateRows } from '../src/lib/massCreate.js';

const row = (productName, category, over = {}) => readRows([{
  'Add Qty': '1', 'Product Name': productName, Category: category, Condition: 'Near Mint', Language: 'English',
  'Sell Price': '1.0', ...over,
}])[0];

const card = (over) => ({
  id: over.id ?? `${over.set}-${over.collector_number}`,
  name: 'Snuff Out', set: 'mmq', collector_number: '159', finishes: ['nonfoil', 'foil'],
  border_color: 'black', frame: '1997', frame_effects: [], promo_types: [], released_at: '1999-10-04', ...over,
});

test('reading rows: conditions both ways, problems kept', () => {
  assert.equal(conditionCode('Lightly Played'), 'LP');
  assert.equal(conditionCode('Light Play'), 'LP');
  assert.equal(conditionCode('Heavily Played'), 'HP');
  assert.equal(conditionCode('Mint'), null);
  assert.deepEqual(missingColumns(['Add Qty', 'Product Name', 'Category', 'Condition', 'Language']), ['Sell Price']);
  const rows = readRows([
    { 'Add Qty': '2', 'Product Name': 'Mirari', Category: 'Odyssey', Condition: 'Near Mint', Language: 'English', 'Sell Price': '2.32' },
    { 'Add Qty': 'x', 'Product Name': 'Mirari', Category: 'Odyssey', Condition: 'Near Mint', Language: 'English', 'Sell Price': '2' },
    { 'Add Qty': '1', 'Product Name': 'Mirari', Category: 'Odyssey', Condition: 'Near Mint', Language: 'Japanese', 'Sell Price': '2' },
    { 'Add Qty': '1', 'Product Name': 'Mirari', Category: 'Odyssey', Condition: 'Mint', Language: 'English', 'Sell Price': '2' },
  ]);
  assert.equal(rows[0].problem, null);
  assert.equal(rows[0].qty, 2);
  assert.equal(rows[0].price, 2.32);
  assert.equal(rows[0].line, 2);
  assert.match(rows[1].problem, /whole number/);
  assert.match(rows[2].problem, /only English/);
  assert.match(rows[3].problem, /Condition/);
});

test('finish and names from the product name', () => {
  assert.equal(finishOf(row('Snuff Out', 'Mercadian Masques').parsed), 'nonfoil');
  assert.equal(finishOf(row('Snuff Out - Foil', 'Mercadian Masques').parsed), 'foil');
  assert.equal(finishOf(row('Sol Ring - Foil Etched', 'Commander Legends').parsed), 'etched');
  assert.deepEqual(namesFor(row('Aggro Amalgam - Voracious Hydra', 'X').parsed), ['Aggro Amalgam', 'Voracious Hydra']);
  assert.deepEqual(namesFor(row('Niko Aris - Borderless', 'Kaldheim').parsed), ['Niko Aris']);
  assert.equal(importKey(row('Fabricate (332) - Foil  - Borderless', 'Secret Lair Drop Series')),
    `${fold('Secret Lair Drop Series')}|fabricate (332) - foil - borderless`);
});

test('a plain name picks the plain printing over its showcase and borderless ones', () => {
  const r = row('Tenacious Underdog', 'Streets of New Capenna');
  const plain = card({ name: 'Tenacious Underdog', set: 'snc', collector_number: '91' });
  const showcase = card({ name: 'Tenacious Underdog', set: 'snc', collector_number: '311', frame_effects: ['showcase'] });
  const borderless = card({ name: 'Tenacious Underdog', set: 'snc', collector_number: '400', border_color: 'borderless' });
  const pick = choosePrinting(r, [showcase, plain, borderless]);
  assert.equal(pick.status, 'auto');
  assert.equal(pick.card.collector_number, '91');
  const show = choosePrinting(row('Tenacious Underdog - Showcase', 'Streets of New Capenna'), [showcase, plain, borderless]);
  assert.equal(show.status, 'auto');
  assert.equal(show.card.collector_number, '311');
});

test('a bracketed number must be the printing\'s; a foil product needs a foil printing', () => {
  const r = row('Contested War Zone (0008) - Borderless', 'Edge of Eternities: Stellar Sights');
  const eight = card({ name: 'Contested War Zone', set: 'eos', collector_number: '8', border_color: 'borderless' });
  const other = card({ name: 'Contested War Zone', set: 'eos', collector_number: '48', border_color: 'borderless' });
  assert.equal(scorePrinting(r, other), null);
  assert.equal(choosePrinting(r, [other, eight]).card.collector_number, '8');
  const foilOnly = row('Snuff Out - Foil', 'Mercadian Masques');
  assert.equal(scorePrinting(foilOnly, card({ finishes: ['nonfoil'] })), null);
});

test('promo packs: the category says it, the stamp decides', () => {
  const r = row('Transmogrify - Promo Pack', 'Promo Pack: Core Set 2021');
  const pack = card({ name: 'Transmogrify', set: 'pm21', collector_number: '159p', promo_types: ['promopack'] });
  const pre = card({ name: 'Transmogrify', set: 'pm21', collector_number: '159s', promo_types: ['prerelease'] });
  assert.equal(choosePrinting(r, [pre, pack]).card.collector_number, '159p');
});

test('The List: the set code in brackets is its number\'s prefix', () => {
  const r = row('Austere Command (PAGL) - The List', 'The List');
  const pagl = card({ name: 'Austere Command', set: 'plst', collector_number: 'PAGL-12' });
  const lrw = card({ name: 'Austere Command', set: 'plst', collector_number: 'LRW-4' });
  const pick = choosePrinting(r, [lrw, pagl]);
  assert.equal(pick.status, 'auto');
  assert.equal(pick.card.collector_number, 'PAGL-12');
});

test('flavor names: Universes Beyond cards found by their card name', () => {
  const r = row('Aggro Amalgam - Voracious Hydra', 'Teenage Mutant Ninja Turtles: Eternal-Legal');
  const hydra = card({ name: 'Voracious Hydra', set: 'tmc', collector_number: '54', flavor_name: 'Aggro Amalgam' });
  const plainHydra = card({ name: 'Voracious Hydra', set: 'm20', collector_number: '200' });
  const found = cardsForRow(r, [hydra, plainHydra]);
  assert.deepEqual(found.map((c) => c.set), ['tmc']);
  assert.equal(choosePrinting(r, found).status, 'auto');
});

test('a tie goes to staff; no card at all is none', () => {
  const r = row('Forest', 'Dominaria United');
  const a = card({ name: 'Forest', set: 'dmu', collector_number: '277' });
  const b = card({ name: 'Forest', set: 'dmu', collector_number: '278' });
  assert.equal(choosePrinting(r, [a, b]).status, 'choose');
  assert.equal(choosePrinting(r, []).status, 'none');
  // Two-part cards by their front name.
  const dfc = card({ name: 'Brazen Borrower // Petty Theft', set: 'eld', collector_number: '39' });
  assert.equal(cardsForRow(row('Brazen Borrower', 'Throne of Eldraine'), [dfc]).length, 1);
});

test('categories back to sets: names, renames, Commander, promo packs, staff choices', () => {
  const list = [
    { code: 'mmq', name: 'Mercadian Masques', set_type: 'expansion' },
    { code: 'plst', name: 'The List', set_type: 'masterpiece' },
    { code: 'm3c', name: 'Modern Horizons 3 Commander', set_type: 'commander', parent_set_code: 'mh3' },
    { code: 'mh3', name: 'Modern Horizons 3', set_type: 'expansion' },
    { code: 'pm21', name: 'Core Set 2021 Promos', set_type: 'promo', parent_set_code: 'm21' },
    { code: 'm21', name: 'Core Set 2021', set_type: 'core' },
    { code: 'xyz', name: 'Odd Set', set_type: 'funny' },
    { code: 'who', name: 'Doctor Who', set_type: 'commander' },
    { code: 'otj', name: 'Outlaws of Thunder Junction', set_type: 'expansion' },
    { code: 'otp', name: 'Breaking News', set_type: 'masterpiece', parent_set_code: 'otj' },
    { code: 'slx', name: 'Universes Within', set_type: 'box' },
    { code: 'arena', name: 'Arena Only', set_type: 'alchemy', digital: true },
  ];
  const sets = new Map(list.map((s) => [s.code, s]));
  const cats = ['Mercadian Masques', 'The List', 'Commander: Modern Horizons 3', 'Modern Horizons 3',
    'Promo Pack: Core Set 2021', 'Core Set 2021', 'Weird Category', 'Arena Only',
    'Doctor Who', 'Universes Beyond: Doctor Who', 'Outlaws of Thunder Junction: Breaking News',
    'Universes Within (SLX)', 'The List Reprints', 'Mystery Booster'];
  const categories = new Map(cats.map((c) => [fold(c), c]));
  const setMap = new Map([['xyz|', 'Weird Category']]);
  const back = categorySets({ sets, categories, setMap });
  assert.deepEqual(back.get(fold('Mercadian Masques')), ['mmq']);
  assert.deepEqual(back.get(fold('The List')), ['plst']);
  assert.deepEqual(back.get(fold('Commander: Modern Horizons 3')), ['m3c']);
  assert.deepEqual(back.get(fold('Promo Pack: Core Set 2021')), ['pm21']);
  assert.deepEqual(back.get(fold('Weird Category')), ['xyz']);
  // Every name a set could have, not just the first the inventory has.
  assert.deepEqual(back.get(fold('Doctor Who')), ['who']);
  assert.deepEqual(back.get(fold('Universes Beyond: Doctor Who')), ['who']);
  assert.deepEqual(back.get(fold('Outlaws of Thunder Junction: Breaking News')), ['otp']);
  assert.deepEqual(back.get(fold('Universes Within (SLX)')), ['slx']);
  assert.deepEqual(back.get(fold('The List Reprints')), ['plst']);
  assert.deepEqual(back.get(fold('Mystery Booster')), ['plst']);
  assert.equal(back.get(fold('Arena Only')), undefined);
});

test('the default project name', () => {
  const day = (d) => d.toISOString().slice(0, 10);
  assert.equal(defaultName('export_crystalcommerce_1790637677.csv', day), 'CardBot import 2026-09-28');
  assert.equal(defaultName('Binder 3.csv', day), 'Binder 3');
  assert.equal(defaultName('export_tcgplayer_online_1791588546.csv', day), 'CardBot import 2026-10-09');
});

test('TCGplayer format: told by its header, rows by SKU, a blank price allowed', () => {
  const header = ['TCGplayer Id', 'Condition', 'Add to Quantity', 'TCG Marketplace Price'];
  assert.equal(fileFormat(header), 'tcgplayer');
  assert.equal(fileFormat(['Add Qty', 'Product Name']), 'cc');
  assert.deepEqual(missingColumns(header, 'tcgplayer'), []);
  assert.deepEqual(missingColumns(['TCGplayer Id', 'Condition'], 'tcgplayer'), ['Add to Quantity', 'TCG Marketplace Price']);
  const rows = readTcgplayerRows([
    { 'TCGplayer Id': '4561121', Condition: 'Lightly Played', 'Add to Quantity': '2', 'TCG Marketplace Price': '2.12' },
    { 'TCGplayer Id': '5115830', Condition: 'Lightly Played', 'Add to Quantity': '1', 'TCG Marketplace Price': '' },
    { 'TCGplayer Id': 'abc', Condition: 'Lightly Played', 'Add to Quantity': '1', 'TCG Marketplace Price': '1' },
    { 'TCGplayer Id': '1', Condition: 'Near Mint', 'Add to Quantity': '0', 'TCG Marketplace Price': '1' },
  ]);
  assert.equal(rows[0].problem, null);
  assert.equal(rows[0].sku, '4561121');
  assert.equal(rows[0].qty, 2);
  assert.equal(rows[0].condition, 'LP');
  assert.equal(rows[0].price, 2.12);
  assert.equal(rows[1].problem, null);
  assert.ok(Number.isNaN(rows[1].price));
  assert.match(rows[2].problem, /isn't a number/);
  assert.match(rows[3].problem, /whole number/);
  assert.equal(importKey(rows[0]), 'sku:4561121');
  assert.equal(finishOfPrinting('Normal'), 'nonfoil');
  assert.equal(finishOfPrinting('Foil'), 'foil');
  assert.equal(finishOfPrinting('Etched Foil'), 'etched');
});

// Owner, 2026-10-11: our export prices only Near Mint; reading one back works it out again.
const MTG_PCT = { NM: 100, LP: 90, MP: 80, HP: 70, DMG: 60 };
const exportLine = (name, category, condition, sell, qty = 1) => ({
  cc_status: 'exported', quantity: qty, cc_product_name: name, cc_category: category,
  cc_condition: condition, cc_sell_price: sell, cc_custom_sku: '101126',
});

test('our own export read back: 0-quantity rows left out, worse conditions priced from Near Mint', () => {
  const csv = massCreateCsv(massCreateRows([
    exportLine('Tundra', 'Revised Edition', 'Moderately Played', 87),
    exportLine('Sol Ring', 'Commander Masters', 'Near Mint', 3.5, 2),
    exportLine('Sol Ring', 'Commander Masters', 'Lightly Played', 3.25),
    exportLine('Lightning Bolt', 'Fourth Edition', 'Lightly Played', 1.75),
    exportLine('Lightning Bolt', 'Fourth Edition', 'Heavily Played', 1.5),
  ], MTG_PCT));
  const rows = readRows(Papa.parse(csv, { header: true, skipEmptyLines: 'greedy' }).data, MTG_PCT);
  assert.deepEqual(rows.map((r) => [r.line, r.productName, r.condition, r.qty, r.price, r.priceFrom ?? null, r.problem]), [
    [2, 'Sol Ring', 'NM', 2, 3.5, null, null],
    [3, 'Sol Ring', 'LP', 1, 3.15, 'Near Mint', null],          // $3.50 × 90%
    [5, 'Lightning Bolt', 'LP', 1, 1.8, 'Near Mint', null],     // $2 × 90%
    [6, 'Lightning Bolt', 'HP', 1, 1.4, 'Near Mint', null],     // $2 × 70%
    [8, 'Tundra', 'MP', 1, 88, 'Near Mint', null],              // $110 × 80%
  ]);
  assert.deepEqual(rows.at(-1).nearMint, { price: 110, pct: 80 });
});

test('a row with no Sell Price and no Near Mint price waits for its printing; a bad one is a problem', () => {
  const rec = (over) => ({
    'Add Qty': '1', 'Product Name': 'Mirari', Category: 'Odyssey', Condition: 'Lightly Played', Language: 'English',
    'Sell Price': '', ...over,
  });
  const [blank, bad, noQty] = readRows([rec({}), rec({ 'Sell Price': 'abc' }), rec({ 'Add Qty': '' })], MTG_PCT);
  assert.equal(blank.problem, null);
  assert.ok(Number.isNaN(blank.price));
  assert.equal(blank.priceFrom, undefined);
  assert.match(bad.problem, /isn't a price/);
  assert.match(noQty.problem, /whole number/);   // an empty Add Qty isn't a 0-quantity row

  // Then TCGplayer's Market Price for the finish (through Scryfall) × the condition's percentage.
  const mirari = { prices: { usd: '2.00', usd_foil: null, usd_etched: '5.10' } };
  assert.equal(rowFallbackPrice(mirari, 'nonfoil', 'LP', MTG_PCT), 1.8);
  assert.equal(rowFallbackPrice(mirari, 'etched', 'HP', MTG_PCT), 3.57);
  assert.equal(rowFallbackPrice(mirari, 'foil', 'LP', MTG_PCT), null);
  assert.equal(rowFallbackPrice(mirari, 'nonfoil', 'LP', {}), null);
});
