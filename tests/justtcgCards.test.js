import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  guessSetCode, isOversized, isPlayStamp, isSealed, isTcgplayerOnlyLine, isWorldsDeck, justtcgCandidate, justtcgVersions, lineVersion, noNumberCards, plainSetName, printingFinish, siblingVersions, splitName, splitNumber, withTcgplayerVersions,
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
    { uuid: 'a', name: 'Gengar - 060/162', set_name: 'XY - BREAKthrough', number: '060/162', tcgplayerId: 100, variants: [{ printing: 'Normal' }] },
    { uuid: 'b', name: 'Gengar - 060/162 (Cosmos Holo)', set_name: 'Miscellaneous Cards & Products', number: '060/162', tcgplayerId: 200, variants: [{ printing: 'Holofoil' }] },
    { uuid: 'c', name: 'Gengar - 060/162', set_name: 'XY - BREAKthrough', number: '060/162', tcgplayerId: null, variants: [{ printing: 'Normal' }] },
  ];
  const extra = siblingVersions(cards, c, tcgdex);
  // The one TCGdex has (by TCGplayer ID) and the plain card again (same set, no suffix) are left out.
  assert.deepEqual(extra.map((v) => v.label), ['Cosmos Holo']);
  assert.equal(extra[0].tcgplayerId, '200');
  assert.equal(extra[0].finish, 'holo');
  // Without TCGplayer IDs from TCGdex, the plain card is still recognised by its set.
  const dp = siblingVersions(
    [{ uuid: 'd', name: 'Drapion - 23/130', set_name: 'Diamond and Pearl', number: '23/130', variants: [{ printing: 'Normal' }] }],
    { setName: 'Diamond & Pearl' }, [{ id: 'normal|||', finish: 'normal', tcgplayerId: null, treatments: [] }],
  );
  assert.equal(dp.length, 0);
});

test('a printing of the card itself that TCGdex misses becomes a version (Staryu 33\'s reverse holo)', () => {
  const tcgdex = [{ id: 'normal|||', finish: 'normal', tcgplayerId: null, treatments: [] }];
  const staryu = {
    uuid: 'st', name: 'Staryu - 033/146', set_name: 'XY Base Set', number: '033/146', tcgplayerId: 89554,
    variants: [
      { condition: 'Near Mint', printing: 'Normal', price: 0.25 },
      { condition: 'Near Mint', printing: 'Reverse Holofoil', price: 0.99 },
      { condition: 'Lightly Played', printing: 'Reverse Holofoil', price: 0.8 },
    ],
  };
  const extra = siblingVersions([staryu], { setName: 'XY' }, tcgdex);
  assert.deepEqual(extra.map((v) => [v.finish, v.label, v.tcgplayerId, v.ownProduct]), [['reverse', 'Standard', '89554', true]]);
  assert.ok(extra[0].tcgplayerOnly);
  // Found by its TCGplayer ID as well; and once TCGdex lists the reverse, nothing is added.
  const byId = siblingVersions([{ ...staryu, set_name: 'Something Else' }], { setName: 'XY' },
    [{ ...tcgdex[0], tcgplayerId: '89554' }]);
  assert.deepEqual(byId.map((v) => v.finish), ['reverse']);
  assert.equal(siblingVersions([staryu], { setName: 'XY' }, [...tcgdex, { id: 'reverse|||', finish: 'reverse', treatments: [] }]).length, 0);
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

test('"No." search: TCGplayer cards TCGdex already found (same set, same name) go; the rest stay', () => {
  const cards = [
    { name: 'Starmie', set: 'expansion-pack-pokemon-japan', variants: [] },
    { name: 'Starmie', set: 'expansion-pack-no-rarity-pokemon-japan', variants: [] },
    { name: "Misty's Starmie", set: 'city-gym-decks-pokemon-japan', variants: [] },
    { name: 'Starmie', set: 'awakening-legends-pokemon-japan', variants: [] },
  ];
  const found = [{ setId: 'PMCG1', name: 'Starmie' }, { setId: 'neo3', name: 'Starmie' }];
  assert.deepEqual(noNumberCards(cards, found).map((c) => `${c.name} | ${c.set}`), ["Misty's Starmie | city-gym-decks-pokemon-japan"]);
  assert.equal(noNumberCards(cards, []).length, 4);
});

test('a Japanese JustTCG card: Japanese versions, shown by its "No."', () => {
  const card = {
    uuid: 'jt-1', name: "Misty's Starmie", set: 'city-gym-decks-pokemon-japan', set_name: 'City Gym Decks', number: 'N/A',
    tcgplayerId: 614814,
    variants: [
      { condition: 'Near Mint', printing: 'Holofoil', language: 'Japanese', price: 8.67 },
      { condition: 'Near Mint', printing: 'Holofoil', language: 'English', price: 1 },
    ],
  };
  const v = justtcgVersions(card, '', 'ja');
  assert.deepEqual(v.map((x) => x.finish), ['holo']);
  assert.equal(justtcgVersions({ ...card, variants: card.variants.slice(0, 1) }, '').length, 1, 'English: one plain version when none');
  const c = justtcgCandidate(card, { lang: 'ja', setCode: 'CGD', number: 'No. 121' });
  assert.equal(c.number, 'No. 121');
  assert.equal(c.key, 'pokemon:ja:jt:jt-1');
});

test('Mimikyu ex 069: the jumbo card goes; TCGdex\'s set-logo stamp takes TCGplayer\'s stamped product', () => {
  const tcgdex = [
    { id: 'holo|||', finish: 'holo', label: 'Standard', tcgplayerId: '623496', treatments: [], stamps: [] },
    { id: 'holo|||set-logo', finish: 'holo', label: 'Set logo stamp', tcgplayerId: null, treatments: ['set-logo'], stamps: ['set-logo'] },
  ];
  const card = (uuid, name, set, tcg) => ({ uuid, name, set_name: set, number: '069/159', tcgplayerId: tcg, variants: [{ printing: 'Holofoil' }] });
  const cards = [
    card('own', 'Mimikyu ex - 069/159', 'SV09: Journey Together', 623496),
    card('jumbo', 'Mimikyu ex - 069/159 (Journey Together Stamped)', 'Jumbo Cards', 660078),
    card('misc', 'Mimikyu ex - 069/159 (Journey Together Stamped)', 'Miscellaneous Cards & Products', 660074),
  ];
  const all = withTcgplayerVersions(tcgdex, cards, { setName: 'Journey Together' });
  assert.deepEqual(all.map((v) => [v.id, v.label, v.tcgplayerId, Boolean(v.tcgplayerOnly)]), [
    ['holo|||', 'Standard', '623496', false],
    ['holo|||set-logo', 'Journey Together Stamped', '660074', false],
  ]);
  assert.deepEqual(all[1].treatments, ['set-logo']);   // still TCGdex's stamped version
  assert.ok(isOversized(cards[1]));
  assert.ok(!isOversized(cards[2]));

  // Two stamped products: which is TCGdex's can't be told, so nothing is matched.
  const two = withTcgplayerVersions(tcgdex, [...cards, card('pre', 'Mimikyu ex - 069/159 (Prerelease Stamped)', 'Prerelease Cards', 1)],
    { setName: 'Journey Together' });
  assert.equal(two.find((v) => v.id === 'holo|||set-logo').label, 'Set logo stamp');
  assert.equal(two.filter((v) => v.tcgplayerOnly).length, 2);
});

test('a Prize Pack product is the Play! Pokémon stamp', () => {
  const tcgdex = [{ id: 'holo|||', finish: 'holo', label: 'Standard', tcgplayerId: '451396', treatments: [], stamps: [] }];
  const prize = {
    uuid: 'pp', name: 'Lugia VSTAR - 139/195', set_name: 'Prize Pack Series Cards', number: '139/195', tcgplayerId: 600001,
    variants: [{ printing: 'Holofoil' }],
  };
  const [v] = siblingVersions([prize], { setName: 'Silver Tempest' }, tcgdex);
  assert.equal(v.label, 'Play! Pokémon stamp');
  assert.ok(isPlayStamp(v));   // its logo goes on the card (SelectedCard)
  assert.ok(!isPlayStamp(tcgdex[0]));
  assert.deepEqual(v.treatments, ['variant:Play! Pokémon stamp']);
  // A stamp, so it matches TCGdex's one stamped version without a TCGplayer product.
  const stamped = [...tcgdex, { id: 'holo|||play', finish: 'holo', label: 'Play stamp', tcgplayerId: null, treatments: ['play'], stamps: ['play'] }];
  const all = withTcgplayerVersions(stamped, [prize], { setName: 'Silver Tempest' });
  assert.deepEqual(all.map((x) => [x.id, x.label, x.tcgplayerId]), [
    ['holo|||', 'Standard', '451396'],
    ['holo|||play', 'Play! Pokémon stamp', '600001'],
  ]);
});

test('World Championship deck cards are left out, like jumbo cards; a Worlds promo stamp stays', () => {
  const tcgdex = [{ id: 'holo|||', finish: 'holo', label: 'Standard', tcgplayerId: '1', treatments: [], stamps: [] }];
  const card = (uuid, name, set) => ({ uuid, name, set_name: set, number: '1', tcgplayerId: uuid.length, variants: [{ printing: 'Holofoil' }] });
  const worlds = card('wcd', 'Pidgeot - 2006 (Hiroki Yano)', 'World Championship Decks');
  const promo = card('promo', 'Pikachu - 027 (World Championships 2023 Stamp)', 'SV: Scarlet & Violet Promo Cards');
  assert.ok(isWorldsDeck(worlds));
  assert.ok(!isWorldsDeck(promo));
  assert.deepEqual(siblingVersions([worlds, promo], { setName: 'Other' }, tcgdex).map((v) => v.label), ['World Championships 2023 Stamp']);
});

test('TCGdex\'s World Championship deck versions go when TCGplayer files them as deck cards (Pidgeot ex6-10)', () => {
  const v = (id, tcgplayerId, stamps = []) => ({ id, finish: 'holo', label: id, tcgplayerId, treatments: stamps, stamps });
  const tcgdex = [
    v('holo|||', '88031'),
    v('holo|||takashi-yoneda', '477560', ['takashi-yoneda']),
    v('holo|||jeremy-maron', '477561', ['jeremy-maron']),
    v('holo|||hiroki-yano', '477881', ['hiroki-yano']),
  ];
  const card = (name, set, tcg) => ({ uuid: String(tcg), name, set_name: set, number: '10/112', tcgplayerId: tcg, variants: [{ printing: 'Holofoil' }] });
  const cards = [
    card('Pidgeot', 'EX FireRed & LeafGreen', 88031),
    card('Pidgeot - 2005 (Takashi Yoneda)', 'World Championship Decks', 477560),
    card('Pidgeot - 2005 (Jeremy Maron)', 'World Championship Decks', 477561),
    card('Pidgeot - 2006 (Hiroki Yano)', 'World Championship Decks', 477881),
  ];
  assert.deepEqual(withTcgplayerVersions(tcgdex, cards, { setName: 'FireRed & LeafGreen' }).map((x) => x.id), ['holo|||']);
  // Before TCGplayer answers (no cards), TCGdex's list is shown as it is.
  assert.equal(withTcgplayerVersions(tcgdex, [], { setName: 'FireRed & LeafGreen' }).length, 4);
});

test('TCGplayer\'s "None" rarity is no rarity (smoke test F4)', () => {
  const card = { uuid: 'n', name: "Misty's Starmie", set: 'city-gym-decks-pokemon-japan', set_name: 'City Gym Decks', number: 'N/A', rarity: 'None', variants: [] };
  assert.equal(justtcgCandidate(card, { lang: 'ja', setCode: 'CGD', number: 'No. 121' }).rarity, null);
  assert.equal(justtcgCandidate({ ...card, rarity: 'Holo Rare' }, { lang: 'ja', setCode: 'CGD' }).rarity, 'Holo Rare');
});

// Owner, 2026-10-15: TCGplayer's sealed products never show as cards or versions.
test('sealed products are told apart from cards', () => {
  assert.ok(isSealed({ name: '151 Booster Bundle Bulk Case', number: 'N/A', rarity: '' }));
  assert.ok(isSealed({ name: 'Base Set 2 Booster Pack', number: 'N/A', rarity: null }));
  assert.ok(isSealed({ name: 'XY Base Set Sleeved Booster Pack', number: 'N/A' }));
  assert.ok(!isSealed({ name: 'Pikachu', number: '025/165', rarity: 'Common' }));
  // An unnumbered card still has a rarity; a card named like a product still has a number.
  assert.ok(!isSealed({ name: 'Pikachu', number: 'N/A', rarity: 'Promo' }));
  assert.ok(!isSealed({ name: 'Energy Box', number: '12', rarity: '' }));
});
