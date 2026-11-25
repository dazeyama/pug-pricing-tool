import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNMATCHED, auditRow, auditSections, buyOrderSections, cardBucket, categorySets, collectionUnmatchedSku, matchPlace, pokemonPrintLines, pokemonRow,
  pokemonSections, priceTone, printLines, savedPlace, unmatchedName, unmatchedSku,
} from '../src/lib/auditPrint.js';
import { fold } from '../src/lib/ccMatch.js';
import { magicTreatmentLabel } from '../src/lib/printings.js';

const line = (over) => ({
  id: over.id ?? Math.random().toString(36).slice(2), game: 'mtg', name: 'X', set_code: 'mom', collector_number: '1',
  finish: 'nonfoil', condition: 'NM', treatments: [], quantity: 1, scryfall_id: over.scryfall_id ?? over.name ?? 'x',
  completed_at: null, cc_status: null, ...over,
});

test('which cards print: not yet exported first; once all Completed, what the export took', () => {
  const paid = line({ name: 'A' });
  const exported = line({ name: 'B', completed_at: '2026-10-14', cc_status: 'exported', cc_category: 'Zendikar', cc_product_name: 'B - Foil' });
  const cant = line({ name: 'C', completed_at: '2026-10-14', cc_status: 'cant_upload' });
  const byHand = line({ name: 'D', completed_at: '2026-10-14' });
  const pkm = line({ name: 'E', game: 'pokemon' });
  const bulk = line({ name: 'F', bulk_kind: 'mtg_100_common' });
  const struck = line({ name: 'G', struck_at: '2026-10-16T18:00:00Z' });
  assert.deepEqual(printLines([paid, exported, cant, byHand, pkm, bulk, struck]).map((l) => l.name), ['A']);
  assert.deepEqual(printLines([exported, cant, byHand, pkm]).map((l) => l.name), ['B', 'C']);
  assert.deepEqual(printLines([byHand]), []);
  assert.deepEqual(savedPlace(exported), { category: 'Zendikar', product: 'B - Foil' });
  assert.equal(savedPlace(cant), null);
  assert.equal(savedPlace(line({ cc_status: 'pulled' })), null);
  assert.equal(savedPlace(paid), undefined);
});

test('where a matched card goes, asking nothing (decision 601): its product, or Unmatched', () => {
  assert.deepEqual(matchPlace({ status: 'auto', product: { category: 'Mystery Booster', product_name: 'Abrade (List)' }, category: 'The List' }),
    { category: 'Mystery Booster', product: 'Abrade (List)' });
  // Needs a choice: Unmatched until chosen, not its set's guessed category.
  assert.equal(matchPlace({ status: 'choose', category: 'Commander 2015', product: null }), null);
  assert.equal(matchPlace({ status: 'choose', category: null }), null);
  assert.equal(matchPlace({ status: 'none', category: 'Zendikar' }), null);
  assert.equal(matchPlace(undefined), null);
});

test('CC rows (decision 601): the product name, one row per product and condition, printings merged', () => {
  const s = auditSections([
    { line: line({ name: 'Abrade', set_code: 'plst', collector_number: '2XM-120' }), category: 'Mystery Booster', product: 'Abrade (List)', bucket: 'red', price: 0.4 },
    { line: line({ name: 'Abrade', set_code: 'plst', collector_number: 'MH2-115', quantity: 2 }), category: 'Mystery Booster', product: 'abrade (list)', bucket: 'red', price: 0.6 },
    { line: line({ name: 'Abrade', set_code: 'plst', collector_number: 'MH2-115', condition: 'LP' }), category: 'Mystery Booster', product: 'Abrade (List)', bucket: 'red' },
    { line: line({ name: 'Sol Ring', set_code: 'plst', finish: 'foil' }), category: 'Mystery Booster', product: 'Sol Ring - Foil (List)', bucket: 'artifact' },
    { line: line({ name: 'Doom Blade', set_code: 'plst' }), category: null, product: null, bucket: 'black' },
  ], (c) => (c === 'Mystery Booster' ? 'MB1' : null));
  assert.deepEqual(s.map((x) => x.name), ['Mystery Booster', UNMATCHED]);
  assert.deepEqual(s[0].rows.map((r) => [r.condition, r.name, r.qty, r.price]), [
    ['NM', 'Abrade (List)', 3, 0.6], ['NM', 'Sol Ring - Foil (List)', 1, null], ['LP', 'Abrade (List)', 1, null],
  ]);
  // No Scryfall chips on a product's row: no set, number, finish or treatments.
  assert.deepEqual([s[0].rows[1].set, s[0].rows[1].number, s[0].rows[1].extras], ['', '', []]);
  // The band's symbol is the category's set, not its cards' (PLST).
  assert.equal(s[0].set, 'mb1');
  assert.equal(s[0].star, false);
  // Unmatched: the card as CC would name it, with its set chip (decision 604).
  assert.deepEqual([s[1].rows[0].name, s[1].rows[0].set, s[1].rows[0].number, s[1].rows[0].extras, s[1].set, s[1].star],
    ['Doom Blade - The List', 'PLST', '1', [], null, false]);
  // A category with no set of its own: the star.
  assert.equal(auditSections([{ line: line({}), category: 'Pre-Release Promos', product: 'X - Prerelease' }])[0].star, true);
});

test("a category's set (decision 601): the set of its name, staff's choice, then the rules; Promo Pack: X by X", () => {
  const sets = new Map([
    ['mh3', { code: 'mh3', name: 'Modern Horizons 3' }],
    ['pmh3', { code: 'pmh3', name: 'Modern Horizons 3 Promos', parent_set_code: 'mh3' }],
    ['m3c', { code: 'm3c', name: 'Modern Horizons 3 Commander', set_type: 'commander', parent_set_code: 'mh3' }],
    ['mb1', { code: 'mb1', name: 'Mystery Booster' }],
    ['plst', { code: 'plst', name: 'The List' }],
    ['stx', { code: 'stx', name: 'Strixhaven' }],
  ]);
  const categories = new Map(['Modern Horizons 3', 'Commander: Modern Horizons 3', 'Mystery Booster', 'The List',
    'Promo Pack: Modern Horizons 3', 'Secret Lair', 'Strixhaven'].map((c) => [fold(c), c]));
  const setOf = categorySets(sets, categories, new Map([['plst|', 'Mystery Booster']]));
  assert.equal(setOf('Modern Horizons 3'), 'mh3');            // its own name, not the promos (a parent's set)
  assert.equal(setOf('Commander: Modern Horizons 3'), 'm3c');
  assert.equal(setOf('Mystery Booster'), 'mb1');              // named so, before staff's choice for PLST
  assert.equal(setOf('Promo Pack: Modern Horizons 3'), 'mh3');
  // The part after the colon whatever follows it (no space, or one starting with an s).
  assert.equal(setOf('Promo Pack:strixhaven'), 'stx');
  assert.equal(setOf('Secret Lair'), null);
});

test('sections A to Z with Unmatched last; inside, by name then collector number; the same card merged', () => {
  const placed = [
    { line: line({ name: 'Sol Ring', set_code: 'c21', collector_number: '263', quantity: 1 }), category: 'Commander 2021' },
    { line: line({ name: 'Arcane Signet', set_code: 'c21', collector_number: '236', quantity: 2 }), category: 'Commander 2021' },
    { line: line({ name: 'Sol Ring', set_code: 'c21', collector_number: '263', quantity: 3 }), category: 'Commander 2021' },
    { line: line({ name: 'Command Tower', set_code: 'c15', collector_number: '281' }), category: 'Commander 2015' },
    { line: line({ name: 'Mystery Card', set_code: 'zzz', collector_number: '9' }), category: null },
    { line: line({ name: 'Abrade', set_code: 'plst', collector_number: '2XM-120' }), category: 'Alpha' },
    { line: line({ name: 'Bolt', set_code: 'lea', collector_number: '120a' }), category: 'alpha' },
    { line: line({ name: 'Bolt', set_code: 'lea', collector_number: '12' }), category: 'Alpha' },
  ];
  const s = auditSections(placed);
  assert.deepEqual(s.map((x) => x.name), ['Alpha', 'Commander 2015', 'Commander 2021', UNMATCHED]);
  const c21 = s[2];
  assert.equal(c21.cards, 6);
  assert.deepEqual(c21.rows.map((r) => [r.name, r.qty]), [['Arcane Signet', 2], ['Sol Ring', 4]]);
  // "alpha" joins "Alpha"; by name (decision 443), then 12 before 120a: two printings, two rows with their set chips.
  assert.deepEqual(s[0].rows.map((r) => `${r.name} ${r.set} ${r.number}`),
    ['Abrade - The List PLST 2XM-120', 'Bolt LEA 12', 'Bolt LEA 120a']);
  assert.equal(s[3].rows[0].name, 'Mystery Card');
  // No set given for a category: no set, so the star (decision 601); none for Unmatched.
  assert.deepEqual([s[0].set, s[0].star], [null, true]);
  assert.deepEqual([s[3].set, s[3].star], [null, false]);
});

test('different condition, finish or treatments stay separate rows, NM before LP, non-foil before foil', () => {
  const s = auditSections([
    { line: line({ name: 'Bolt', condition: 'LP' }), category: 'Alpha' },
    { line: line({ name: 'Bolt', finish: 'foil' }), category: 'Alpha' },
    { line: line({ name: 'Bolt' }), category: 'Alpha' },
    { line: line({ name: 'Bolt', treatments: ['borderless'] }), category: 'Alpha' },
  ]);
  assert.deepEqual(s[0].rows.map((r) => `${r.condition} ${r.name}`), ['NM Bolt', 'NM Bolt - Borderless', 'NM Bolt - Foil', 'LP Bolt']);
  assert.ok(s[0].rows.every((r) => !r.extras.length));
});

test("inside a category (decisions 443, 596): NM, then LP, MP, HP, DMG; in each by colour pile, A to Z, then number", () => {
  const s = auditSections([
    { line: line({ name: 'Zap', collector_number: '5', condition: 'MP' }), category: 'Alpha', bucket: 'red' },
    { line: line({ name: 'Bolt', collector_number: '200' }), category: 'Alpha', bucket: 'red' },
    { line: line({ name: 'Zap', collector_number: '5', condition: 'DMG' }), category: 'Alpha', bucket: 'red' },
    { line: line({ name: 'Ruby', collector_number: '3', condition: 'HP' }), category: 'Alpha', bucket: 'artifact' },
    { line: line({ name: 'Mox', collector_number: '12' }), category: 'Alpha', bucket: 'artifact' },
    { line: line({ name: 'Zap', collector_number: '5', condition: 'LP' }), category: 'Alpha', bucket: 'red' },
    { line: line({ name: 'Orb', collector_number: '1', condition: 'LP' }), category: 'Alpha', bucket: 'blue' },
    { line: line({ name: 'Bolt', collector_number: '161' }), category: 'Alpha', bucket: 'red' },
    { line: line({ name: 'Island', collector_number: '290' }), category: 'Alpha', bucket: 'land' },
    { line: line({ name: 'Plea', collector_number: '7' }), category: 'Alpha', bucket: 'white' },
    { line: line({ name: 'Unknown', collector_number: '1' }), category: 'Alpha' },
    { line: line({ name: 'Golos', collector_number: '9' }), category: 'Alpha', bucket: 'multicolor' },
  ]);
  assert.deepEqual(s[0].rows.map((r) => `${r.condition} ${r.name} ${r.number}`), [
    'NM Plea 7', 'NM Bolt 161', 'NM Bolt 200', 'NM Golos 9', 'NM Mox 12', 'NM Island 290', 'NM Unknown 1',
    'LP Orb 1', 'LP Zap 5', 'MP Zap 5', 'HP Ruby 3', 'DMG Zap 5',
  ]);
});

test('the owner\'s Kaldheim printout (decision 596): NM cards above the line, LP and HP below, never mixed', () => {
  const s = auditSections([
    { line: line({ name: 'Reflections of Littjara', collector_number: '400', finish: 'foil', condition: 'LP' }), category: 'Kaldheim', bucket: 'blue' },
    { line: line({ name: 'Vorinclex, Monstrous Raider', collector_number: '199', condition: 'HP' }), category: 'Kaldheim', bucket: 'green' },
    { line: line({ name: 'Cosmos Elixir', collector_number: '368' }), category: 'Kaldheim', bucket: 'artifact' },
    { line: line({ name: 'Maskwood Nexus', collector_number: '240', condition: 'LP' }), category: 'Kaldheim', bucket: 'artifact' },
    { line: line({ name: 'Pyre of Heroes', collector_number: '241' }), category: 'Kaldheim', bucket: 'artifact' },
    { line: line({ name: 'Barkchannel Pathway // Tidechannel Pathway', collector_number: '290' }), category: 'Kaldheim', bucket: 'land' },
  ]);
  const conds = s[0].rows.map((r) => r.condition);
  assert.deepEqual(conds, ['NM', 'NM', 'NM', 'LP', 'LP', 'HP']);
  assert.deepEqual(s[0].rows.slice(0, 3).map((r) => r.name), ['Cosmos Elixir', 'Pyre of Heroes', 'Barkchannel Pathway // Tidechannel Pathway']);
});

test('in buy order (decision 444): one bare section, a row per line as it came, nothing merged', () => {
  const s = buyOrderSections([
    { line: line({ name: 'Zap', quantity: 2 }), bucket: 'red', price: 3 },
    { line: line({ name: 'Bolt' }), bucket: 'red' },
    { line: line({ name: 'Zap' }), bucket: 'red', price: 3 },
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].bare, true);
  assert.equal(s[0].set, null);
  assert.equal(s[0].cards, 4);
  assert.deepEqual(s[0].rows.map((r) => [r.name, r.qty, r.price]), [['Zap', 2, 3], ['Bolt', 1, null], ['Zap', 1, 3]]);
  assert.deepEqual(buyOrderSections([]), []);
  // Print PKM in buy order (decision 445): Pokémon rows, grey edge.
  const pkm = buyOrderSections([{ line: line({ game: 'pokemon', name: 'Pikachu', finish: 'holo' }), price: 2 }],
    (l, qty, _bucket, price) => pokemonRow(l, qty, price));
  assert.deepEqual(pkm[0].rows.map((r) => [r.name, r.bucket, r.price, r.extras[0]]), [['Pikachu', 'unknown', 2, 'Holo']]);
});

test("a card's colour group, as pull-pdf's", () => {
  assert.equal(cardBucket({ colors: ['R'], type_line: 'Instant' }), 'red');
  assert.equal(cardBucket({ colors: ['W', 'U'], type_line: 'Creature' }), 'multicolor');
  assert.equal(cardBucket({ colors: [], type_line: 'Artifact' }), 'artifact');
  assert.equal(cardBucket({ colors: [], type_line: 'Land' }), 'land');
  assert.equal(cardBucket({ colors: ['G'], type_line: 'Creature — Elf // Land' }), 'land');   // a land on either face
  assert.equal(cardBucket({ type_line: '', card_faces: [{ colors: ['B'], type_line: 'Creature' }] }), 'black');
  assert.equal(cardBucket(null), 'unknown');
});

// Decision 404's bands, at the Export rates for bulk' defaults (decision 416): red to 50¢, amber to $1.49.
test('price bands: true bulk, a $1 card, the rest', () => {
  assert.equal(priceTone(0.1), 'bulk');
  assert.equal(priceTone(0.5), 'bulk');
  assert.equal(priceTone(0.51), 'dollar');
  assert.equal(priceTone(1.49), 'dollar');
  assert.equal(priceTone(1.5), null);
  assert.equal(priceTone(null), null);
});

test("a row's words", () => {
  const r = auditRow(line({
    name: 'Lightning Bolt', set_code: '2x2', collector_number: '117', finish: 'foil', condition: 'MP',
    treatments: ['borderless', 'surgefoil'], quantity: 3,
  }), 3, 'red', 2.5);
  assert.deepEqual(r, {
    name: 'Lightning Bolt', qty: 3, set: '2X2', number: '117', condition: 'MP', extras: ['Foil', 'Borderless', 'Surge foil'],
    bucket: 'red', price: 2.5,
  });
  // A borderless showcase card prints as Showcase alone (decision 508); Borderless alone stays.
  const both = auditRow(line({ name: 'Elesh Norn, Mother of Machines', finish: 'foil', treatments: ['borderless', 'showcase'] }));
  assert.deepEqual(both.extras, ['Foil', 'Showcase']);
  assert.deepEqual(auditRow(line({ name: 'Ichormoon Gauntlet', treatments: ['borderless'] })).extras, ['Borderless']);
  assert.deepEqual(auditRow(line({ name: 'Ichormoon Gauntlet', treatments: ['showcase', 'surgefoil'] })).extras,
    ['Showcase', 'Surge foil']);
  assert.equal(magicTreatmentLabel('extendedart'), 'Extended art');
  assert.equal(magicTreatmentLabel('promopack'), 'Promo pack stamp');
  assert.equal(magicTreatmentLabel('variant:Foil Etched'), 'Foil Etched');
  assert.equal(magicTreatmentLabel('something-new'), 'Something new');
});

// Print PKM? (decision 280): the Pokémon cards by set.
const pkm = (over) => line({
  game: 'pokemon', lang: 'en', set_code: 'sv1', set_name: 'Scarlet & Violet', finish: 'normal', tcgdex_id: 'sv1-1',
  scryfall_id: null, ...over,
});

test('Print PKM? takes the Pokémon cards, never bulk or struck, Completed or not', () => {
  const a = pkm({ name: 'A' });
  const done = pkm({ name: 'B', completed_at: '2026-10-14' });
  const bulk = pkm({ name: 'C', bulk_kind: 'pkm_100_common' });
  const struck = pkm({ name: 'D', struck_at: '2026-10-16T18:00:00Z' });
  const mtg = line({ name: 'E' });
  assert.deepEqual(pokemonPrintLines([a, done, bulk, struck, mtg]).map((l) => l.name), ['A', 'B']);
});

test('Pokémon sections: one a set, A to Z by name with the code on the band; inside by number; the same card merged', () => {
  const s = pokemonSections([
    pkm({ name: 'Pikachu', collector_number: '25', quantity: 2 }),
    pkm({ name: 'Pikachu', collector_number: '25', quantity: 1 }),
    pkm({ name: 'Mew', collector_number: '151', set_code: 'MEW', set_name: '151', tcgdex_id: 'sv3pt5-151' }),
    pkm({ name: 'Charmander', collector_number: '4', condition: 'LP' }),
    pkm({ name: 'Eevee', collector_number: '133', finish: 'reverse', treatments: ['sv-pattern'] }),
    pkm({ name: 'Nameless', set_code: 'xy', set_name: null, collector_number: '1' }),
  ]);
  assert.deepEqual(s.map((x) => [x.name, x.set, x.cards]), [['151', 'mew', 1], ['Scarlet & Violet', 'sv1', 5], ['XY', 'xy', 1]]);
  const sv = s[1];
  assert.deepEqual(sv.rows.map((r) => [r.name, r.qty, r.condition]), [['Pikachu', 3, 'NM'], ['Eevee', 1, 'NM'], ['Charmander', 1, 'LP']]);
  assert.equal(sv.rows[1].extras[0], 'Reverse');
});

test('Print PKM? inside a set (decision 597): NM by number, then LP, MP, HP, DMG, each by number', () => {
  const s = pokemonSections([
    pkm({ name: 'A', collector_number: '45' }),
    pkm({ name: 'B', collector_number: '5', condition: 'LP' }),
    pkm({ name: 'C', collector_number: '7', condition: 'HP' }),
    pkm({ name: 'D', collector_number: '12' }),
    pkm({ name: 'E', collector_number: '9', condition: 'LP' }),
    pkm({ name: 'F', collector_number: '31', condition: 'DMG' }),
    pkm({ name: 'G', collector_number: '22', condition: 'MP' }),
    pkm({ name: 'H', collector_number: '30' }),
  ]);
  assert.deepEqual(s[0].rows.map((r) => `${r.condition} ${r.number}`),
    ['NM 12', 'NM 30', 'NM 45', 'LP 5', 'LP 9', 'MP 22', 'HP 7', 'DMG 31']);
});

test("a Pokémon row's words: the finish and the bracket's tags but the condition, as chips; no colour", () => {
  const r = pokemonRow(pkm({ name: 'Pikachu', collector_number: '25', finish: 'holo', condition: 'MP', lang: 'ja', first_edition: true }));
  assert.deepEqual([r.name, r.set, r.number, r.condition, r.extras, r.bucket], ['Pikachu', 'SV1', '25', 'MP', ['Holo', '1st Ed', 'JP'], 'unknown']);
});

test("Unmatched's Custom SKU (decision 602): the export's own with a u", () => {
  assert.equal(unmatchedSku('112126'), '112126u');
  assert.equal(unmatchedSku('112126-42'), '112126-42u');
  assert.equal(unmatchedSku('112526-126b'), '112526-126bu');   // the u last (decision 606)
  assert.equal(unmatchedSku(null), null);
  // A collection with cards to export: its number isn't given until the export saves.
  const open = [line({ name: 'A' }), line({ name: 'B', completed_at: '2026-11-21', cc_status: 'exported', cc_custom_sku: '112026-1' })];
  assert.equal(collectionUnmatchedSku(open, '112526', false), '112526-#cu');
  assert.equal(collectionUnmatchedSku(open, '112526', true), '112526-#pu');   // a project's (decision 606)
  // All exported: the SKU its export stamped.
  const done = [line({ name: 'B', completed_at: '2026-11-21', cc_status: 'exported', cc_custom_sku: '112126-3' }),
    line({ name: 'C', completed_at: '2026-11-21', cc_status: 'cant_upload' })];
  assert.equal(collectionUnmatchedSku(done, '112226', false), '112126-3u');   // stamped before decision 606: as it was
  const lettered = [line({ name: 'B', completed_at: '2026-11-25', cc_status: 'exported', cc_custom_sku: '112526-1p' })];
  assert.equal(collectionUnmatchedSku(lettered, '112626', true), '112526-1pu');
  // Every card Can't upload: no SKU was stamped, so none.
  assert.equal(collectionUnmatchedSku([line({ name: 'C', completed_at: '2026-11-21', cc_status: 'cant_upload' })], '112226', false), null);
  // A card a Can't upload cards export restamped (decision 372) isn't the collection's own SKU (release review).
  const restamp = '2026-11-24T19:00:00Z';
  const later = [...done, line({ name: 'D', completed_at: '2026-11-21', cc_status: 'exported', cc_custom_sku: '112426', cc_exported_at: restamp })];
  assert.equal(collectionUnmatchedSku(later, '112626', false, new Set([restamp])), '112126-3u');
  // Its own export stamped nothing: none, not the restamp's.
  const cantOnly = [line({ name: 'D', completed_at: '2026-11-21', cc_status: 'exported', cc_custom_sku: '112426', cc_exported_at: restamp })];
  assert.equal(collectionUnmatchedSku(cantOnly, '112626', false, new Set([restamp])), null);
  // The restamps couldn't be read: none.
  assert.equal(collectionUnmatchedSku(done, '112626', false, null), null);
});

// Decision 604, the owner's screenshot: "Fblthp, the Lost - Borderless NOT Fblthp, the Lost [Borderless]".
test('a card with no product, written as CC would name it', () => {
  const name = (over) => unmatchedName(line(over));
  assert.equal(name({ name: 'Fblthp, the Lost', set_code: 'rvr', treatments: ['borderless'] }), 'Fblthp, the Lost - Borderless');
  assert.equal(name({ name: 'Jor Kadeen, First Goldwarden', set_code: 'one', finish: 'foil', treatments: ['showcase'] }),
    'Jor Kadeen, First Goldwarden - Foil - Showcase');
  assert.equal(name({ name: "Journeyer's Kite", set_code: 'brr', treatments: ['retro'] }), "Journeyer's Kite - Retro Frame");
  // A showcase card never Borderless too (decision 508); a special foil as CC's foil kind; etched.
  assert.equal(name({ name: 'Elesh Norn', finish: 'foil', treatments: ['borderless', 'showcase', 'stepandcompleat'] }),
    'Elesh Norn - Step-and-Compleat Foil - Showcase');
  assert.equal(name({ name: 'Sol Ring', finish: 'etched' }), 'Sol Ring - Foil Etched');
  // A treatment CC's names have no word for, after them as the app labels it; its English name.
  assert.equal(name({ name: 'Bolt', treatments: ['datestamped'] }), 'Bolt - Date stamped');
  assert.equal(name({ name: 'ライトニング', name_en: 'Lightning Bolt' }), 'Lightning Bolt');
});
