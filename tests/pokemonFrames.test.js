import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameEra, isRuleBox } from '../src/lib/pokemonFrames.js';

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
