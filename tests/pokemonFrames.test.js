import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_SET_ART_FRAME, classicFrame, frameEra, isFullArt, isFullPromo, isRuleBox, needsBaseSetShadow,
} from '../src/lib/pokemonFrames.js';

// The owner's eras (2026-09-29): 1999, 2003, 2007, 2011, 2017, 2023+.
test('frame eras by release year', () => {
  assert.equal(frameEra('1999-01-09'), '1999');        // Base Set
  assert.equal(frameEra('2002-09-15'), '1999');        // Expedition
  assert.equal(frameEra('2003-07-01'), '2003');        // Ruby & Sapphire
  assert.equal(frameEra('2007-08-22'), '2007');        // Mysterious Treasures (Gible 85)
  assert.equal(frameEra('2010-02-10'), '2007');        // HeartGold SoulSilver
  assert.equal(frameEra('2011-04-25'), '2011');        // Black & White
  assert.equal(frameEra('2016-11-02'), '2011');        // Evolutions
  assert.equal(frameEra('2017-02-03'), '2017');        // Sun & Moon
  assert.equal(frameEra('2022-11-11'), '2017');        // Silver Tempest
  assert.equal(frameEra('2023-03-31'), '2023');        // Scarlet & Violet
  assert.equal(frameEra('2025-05-30'), '2023');
  assert.equal(frameEra(null), '2023');
});

test('rule boxes from TCGdex suffix and stage', () => {
  assert.ok(isRuleBox({ category: 'Pokemon', suffix: 'ex', stage: 'Stage2' }, 'Charizard ex'));
  assert.ok(isRuleBox({ category: 'Pokemon', suffix: 'V', stage: 'VSTAR' }, 'Lugia VSTAR'));
  assert.ok(isRuleBox({ category: 'Pokemon', suffix: null, stage: 'VMAX' }, 'Pikachu VMAX'));
  assert.ok(isRuleBox({ category: 'Pokemon', suffix: 'TAG TEAM-GX' }, 'Reshiram & Charizard GX'));
  assert.ok(isRuleBox({ category: 'Pokemon', stage: 'BREAK' }, 'Greninja BREAK'));
});

test('rule boxes TCGdex only names', () => {
  assert.ok(isRuleBox({ category: 'Pokemon' }, 'Garchomp C LV.X'));
  assert.ok(isRuleBox({ category: 'Pokemon' }, 'Lugia LEGEND'));
  assert.ok(isRuleBox({ category: 'Pokemon' }, 'M Garchomp-EX'));
  assert.ok(isRuleBox({ category: 'Pokemon' }, 'Radiant Charizard'));
  assert.ok(isRuleBox(null, 'リザードンex'));
});

test('ordinary Pokémon and Trainers have no rule box', () => {
  assert.ok(!isRuleBox({ category: 'Pokemon', stage: 'Basic' }, 'Gible'));
  assert.ok(!isRuleBox({ category: 'Pokemon', stage: 'Stage2' }, 'Typhlosion'));
  assert.ok(!isRuleBox({ category: 'Pokemon', stage: 'Basic' }, 'Vivillon'));
  assert.ok(!isRuleBox({ category: 'Trainer' }, "Professor's Research"));
});

test('full art: by rarity, English, Japanese and TCGplayer names', () => {
  assert.ok(isFullArt({ rarity: 'Special illustration rare', number: '199', printedSize: 165 }));
  assert.ok(isFullArt({ rarity: 'Shiny rare', number: 'SV49' }));                   // Hidden Fates Shiny Vault
  assert.ok(isFullArt({ rarity: 'Shiny rare', number: '092', printedSize: 91 }));   // Paldean Fates
  assert.ok(isFullArt({ rarity: 'Secret Rare', number: '115', printedSize: 114 })); // BW Pikachu, listed non-holo
  assert.ok(isFullArt({ rarity: 'Character Rare', number: '185', printedSize: 184 }));
  assert.ok(isFullArt({ rarity: 'Amazing Rare', number: '022', printedSize: 185 }));
  assert.ok(isFullArt({ rarity: 'Special Art Rare' }));                             // TCGplayer, Japanese
  assert.ok(isFullArt({ rarity: 'Shiny Holo Rare' }));
});

test('full art: Trainer Gallery, Galarian Gallery, Shiny Vault, Radiant Collection numbers', () => {
  assert.ok(isFullArt({ rarity: 'Rare', number: 'TG05' }));
  assert.ok(isFullArt({ rarity: 'Rare', number: 'GG01' }));
  assert.ok(isFullArt({ rarity: null, number: 'SV107' }));
  assert.ok(isFullArt({ rarity: 'Common', number: 'RC25' }));
});

test('full art: a secret rare by its number, from Black & White on', () => {
  // TCGdex has no rarity for these Japanese ones: N's Zoroark ex SV9 117, Roxanne S9a 081.
  assert.ok(isFullArt({ rarity: null, number: '117', printedSize: 100, releaseDate: '2024-01-26' }));
  assert.ok(isFullArt({ rarity: 'None', number: '081', printedSize: 67, releaseDate: '2022-04-08' }));
  assert.ok(isFullArt({ number: '21', printedSize: 20, releaseDate: '2012-10-05' }));   // Dragon Vault Kyurem
  // Before Black & White a secret rare kept the usual frame (Holon Phantoms Mew 111/110).
  assert.ok(!isFullArt({ rarity: 'Rare Holo', number: '111', printedSize: 110, releaseDate: '2006-05-01' }));
});

test('not full art', () => {
  assert.ok(!isFullArt({ rarity: 'Rare Holo', number: '010', printedSize: 102, releaseDate: '1999-01-09' }));
  assert.ok(!isFullArt({ rarity: 'Double rare', number: '006', printedSize: 165, releaseDate: '2023-09-22' }));
  assert.ok(!isFullArt({ rarity: 'Rare', number: '115', printedSize: null }));
  // Promos' numbers run past the count (SVP 500).
  assert.ok(!isFullArt({ rarity: null, number: '500', printedSize: 225, setName: 'SVP Black Star Promos', releaseDate: '2023-03-31' }));
  assert.ok(!isFullArt({ rarity: null, number: '101', printedSize: 0, setName: 'MEP Black Star Promos' }));
});

test("Classic Collection: each reprint in its original's frame", () => {
  assert.equal(classicFrame('cel25cc', 'CC002'), '1999');   // Base Set Charizard
  assert.equal(classicFrame('cel25cc', 'CC010'), '1999');   // Shining Magikarp
  assert.equal(classicFrame('cel25cc', 'CC011'), '2003');   // Team Magma's Groudon
  assert.equal(classicFrame('cel25cc', 'CC015'), '2003');   // Umbreon ☆, POP Series 5 (2007, ex-era frame)
  assert.equal(classicFrame('cel25cc', 'CC019'), '2007');   // Donphan
  assert.equal(classicFrame('cel25cc', 'CC020'), 'full');   // Reshiram 113/114
  assert.equal(classicFrame('cel25cc', 'CC025'), '2017');   // Tapu Lele GX
  assert.equal(classicFrame('cel25cc', 'CC026'), null);
  assert.equal(classicFrame('cel25', '4'), null);
  assert.equal(classicFrame('base1', 'CC002'), null);
});

test('holo promos from Scarlet & Violet on (2023-03-31) shine across the whole card', () => {
  assert.ok(isFullPromo({ rarity: 'Promo', releaseDate: '2023-03-31' }));   // SVP: the day itself
  assert.ok(isFullPromo({ rarity: 'promo', releaseDate: '2025-09-26' }));
  assert.ok(!isFullPromo({ rarity: 'Promo', releaseDate: '2023-03-30' }));
  assert.ok(!isFullPromo({ rarity: 'Promo', releaseDate: '2019-11-15' }));  // SWSH promos keep the mask
  assert.ok(!isFullPromo({ rarity: 'Rare', releaseDate: '2024-01-01' }));
  assert.ok(!isFullPromo({ rarity: 'Promo', releaseDate: null }));
});

// Owner, 2026-10-12: TCGdex's Base Set scans are the shadowless 1st Edition
// ones; the Unlimited prints get the art frame's shadow drawn. Pokémon only.
test('Base Set shadow: Unlimited Pokémon only, from TCGdex', () => {
  const card = {
    setId: 'base1', lang: 'en', category: 'Pokemon', image: 'https://assets.tcgdex.net/en/base/base1/4/high.webp',
    version: { firstEdition: false, treatments: [] },
  };
  assert.equal(needsBaseSetShadow(card), true);                                                   // Unlimited
  assert.equal(needsBaseSetShadow({ ...card, version: { treatments: ['1999-2000-copyright'] } }), true);
  assert.equal(needsBaseSetShadow({ ...card, version: { treatments: ['shadowless'] } }), false);
  assert.equal(needsBaseSetShadow({ ...card, version: { treatments: ['shadowless-red-cheek'] } }), false);
  assert.equal(needsBaseSetShadow({ ...card, version: { firstEdition: true, treatments: ['shadowless'] } }), false);
  assert.equal(needsBaseSetShadow({ ...card, version: { treatments: [], tcgplayerOnly: true } }), false);
  assert.equal(needsBaseSetShadow({ ...card, category: 'Trainer' }), false);                     // Trainers don't have it
  assert.equal(needsBaseSetShadow({ ...card, setId: 'base2' }), false);                          // Jungle: printed with it
  assert.equal(needsBaseSetShadow({ ...card, lang: 'ja' }), false);
  assert.equal(needsBaseSetShadow({ ...card, image: 'https://images.pokemontcg.io/base1/4_hires.png' }), false);
  assert.equal(needsBaseSetShadow({ ...card, version: null }), false);
  assert.ok(BASE_SET_ART_FRAME.left < BASE_SET_ART_FRAME.right && BASE_SET_ART_FRAME.top < BASE_SET_ART_FRAME.bottom);
});
