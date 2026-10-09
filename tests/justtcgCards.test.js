import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitName, splitNumber, printingFinish, justtcgVersions, siblingVersions, guessSetCode, plainSetName,
  justtcgCandidate, lineVersion, isTcgplayerOnlyLine,
} from '../src/lib/justtcgCards.js';
import { lineText } from '../src/lib/lineFormat.js';

// Owner, 2026-10-09: Pokémon cards TCGdex lacks, from TCGplayer's catalogue.

test('TCGplayer product names: the card, then what makes it different', () => {
  assert.deepEqual(splitName('Gengar - 060/162 (Cosmos Holo)'), { name: 'Gengar', suffix: 'Cosmos Holo' });
  assert.deepEqual(splitName('Nidorina - 101 (30th Celebration)'), { name: 'Nidorina', suffix: '30th Celebration' });
  assert.deepEqual(splitName('Nidorina - 101 (30th Celebration) (101)'), { name: 'Nidorina', suffix: '30th Celebration' });
  assert.deepEqual(splitName('Mega Charizard Y ex - 022/217'), { name: 'Mega Charizard Y ex', suffix: '' });
  assert.deepEqual(splitName('Pikachu - SWSH020'), { name: 'Pikachu', suffix: '' });
  assert.deepEqual(splitName('Gengar'), { name: 'Gengar', suffix: '' });
});

test('numbers and set sizes', () => {
  assert.deepEqual(splitNumber('060/162'), { number: '060', size: 162 });
  assert.deepEqual(splitNumber('101'), { number: '101', size: null });
  assert.deepEqual(splitNumber('TG06/TG30'), { number: 'TG06', size: null });
});

test('printings become finishes', () => {
  assert.deepEqual(printingFinish('Holofoil'), { finish: 'holo', firstEdition: false });
  assert.deepEqual(printingFinish('Reverse Holofoil'), { finish: 'reverse', firstEdition: false });
  assert.deepEqual(printingFinish('1st Edition Holofoil'), { finish: 'holo', firstEdition: true });
  assert.deepEqual(printingFinish('Normal'), { finish: 'normal', firstEdition: false });
});

const card = (over) => ({
  uuid: 'jt-1', id: 'jt-1', name: 'Nidorina - 101 (30th Celebration)', set: 'me-promo', set_name: 'ME: Mega Evolution Promo',
  number: '101', tcgplayerId: 555, rarity: 'Promo',
  variants: [
    { condition: 'Near Mint', printing: 'Holofoil', price: 3 },
    { condition: 'Lightly Played', printing: 'Holofoil', price: 2.5 },
    { condition: 'Near Mint', printing: 'Holofoil', language: 'Japanese', price: 9 },
  ],
  ...over,
});

test('a card known only from TCGplayer: one version per English printing', () => {
  const v = justtcgVersions(card(), '30th Celebration');
  assert.equal(v.length, 1);
  assert.equal(v[0].finish, 'holo');
  assert.equal(v[0].label, '30th Celebration');
  assert.deepEqual(v[0].treatments, ['variant:30th Celebration']);
  assert.equal(v[0].tcgplayerId, '555');
  assert.equal(v[0].justtcgId, 'jt-1');
  assert.ok(v[0].tcgplayerOnly);
  // No printings listed: one plain version, so a manual price can still be entered.
  assert.equal(justtcgVersions(card({ variants: [] }))[0].label, 'Standard');
  // 1st Edition beside an unlimited printing.
  const wotc = justtcgVersions(card({ variants: [{ printing: '1st Edition Holofoil' }, { printing: 'Unlimited Holofoil' }] }));
  assert.deepEqual(wotc.map((x) => x.label), ['1st Edition', 'Unlimited']);
});

test('as a search result', () => {
  const c = justtcgCandidate(card(), { setCode: 'MEP' });
  assert.equal(c.key, 'pokemon:en:jt:jt-1');
  assert.equal(c.name, 'Nidorina');
  assert.equal(c.number, '101');
  assert.equal(c.printedSize, null);
  assert.equal(c.source, 'justtcg');
  assert.equal(c.suffix, '30th Celebration');
});

test('TCGplayer-only versions of a TCGdex card', () => {
  const tcgdex = [{ id: 'normal|||', finish: 'normal', tcgplayerId: '100', treatments: [] }];
  const c = { setName: 'BREAKthrough' };
  const cards = [
    { uuid: 'a', name: 'Gengar - 060/162', set_name: 'XY - BREAKthrough', number: '060/162', tcgplayerId: 100, variants: [{ printing: 'Holofoil' }] },
    { uuid: 'b', name: 'Gengar - 060/162 (Cosmos Holo)', set_name: 'Miscellaneous Cards & Products', number: '060/162', tcgplayerId: 200, variants: [{ printing: 'Holofoil' }] },
    { uuid: 'c', name: 'Gengar - 060/162', set_name: 'XY - BREAKthrough', number: '060/162', tcgplayerId: null, variants: [{ printing: 'Holofoil' }] },
  ];
  const extra = siblingVersions(cards, c, tcgdex);
  // The one TCGdex has (by TCGplayer ID) and the plain card again (same set, no suffix) are left out.
  assert.deepEqual(extra.map((v) => v.label), ['Cosmos Holo']);
  assert.equal(extra[0].tcgplayerId, '200');
  assert.equal(extra[0].finish, 'holo');
  // Without TCGplayer IDs from TCGdex, the plain card is still recognised by its set.
  const dp = siblingVersions(
    [{ uuid: 'd', name: 'Drapion - 23/130', set_name: 'Diamond and Pearl', number: '23/130', variants: [{ printing: 'Normal' }] }],
    { setName: 'Diamond & Pearl' }, [],
  );
  assert.equal(dp.length, 0);
});

test('set codes for TCGplayer sets', () => {
  assert.equal(guessSetCode('ME: Mega Evolution Promo'), 'MEP');
  assert.equal(guessSetCode('SWSH: Sword & Shield Promo Cards'), 'SWSHP');
  assert.equal(guessSetCode('Miscellaneous Cards & Products'), 'MISC');
  assert.equal(guessSetCode('SV10: Destined Rivals'), 'SV10');
  assert.equal(guessSetCode('Pokemon Futsal Collection'), 'PFC');
  assert.equal(plainSetName('XY - BREAKthrough'), 'BREAKthrough');
  assert.equal(plainSetName('SV10: Destined Rivals'), 'Destined Rivals');
});

test('a saved TCGplayer-only line reprices as itself', () => {
  const line = {
    tcgdex_id: 'xy8-60', justtcg_card_id: 'b', tcgplayer_id: '200', finish: 'holo', first_edition: false,
    treatments: ['variant:Cosmos Holo'], price_snapshot: { version: 'jt:b:Holofoil' },
  };
  assert.ok(isTcgplayerOnlyLine(line));
  assert.equal(lineVersion(line).id, 'jt:b:Holofoil');
  assert.equal(lineVersion(line).tcgplayerId, '200');
  assert.ok(!isTcgplayerOnlyLine({ tcgdex_id: 'xy8-60', price_snapshot: { version: 'holo|||' } }));
  assert.ok(isTcgplayerOnlyLine({ tcgdex_id: null, justtcg_card_id: 'jt-1' }));
});

test('the buy line names the TCGplayer version', () => {
  const line = {
    quantity: 1, name: 'Gengar', set_code: 'BKT', collector_number: '60', finish: 'holo', condition: 'NM',
    lang: 'en', treatments: ['variant:Cosmos Holo'],
  };
  assert.equal(lineText(line), '1 Gengar (BKT) 60 *H* [Cosmos Holo]');
});
