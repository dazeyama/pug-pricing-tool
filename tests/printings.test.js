import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPokemonVersion, isPokemonCenterStamp, pokemonVersions, uncrossPatterns } from '../src/lib/printings.js';

// TCGdex's data for Fossil (2026-10-01): every printing tagged "galaxy".
const fossil = (variants) => ({ set: { id: 'base3' }, variants_detailed: variants });

test('Fossil: no "Galaxy foil" on plain or holo versions', () => {
  const gastly = pokemonVersions(fossil([
    { type: 'normal', size: 'standard', foil: 'galaxy', thirdParty: { tcgplayer: 44435 } },
    { type: 'normal', size: 'standard', stamp: ['1st-edition'], foil: 'galaxy', thirdParty: { tcgplayer: 44435 } },
    { type: 'normal', size: 'standard', subtype: '1999-2000-copyright' },
  ]));
  assert.deepEqual(gastly.map((v) => v.label), ['Unlimited', '1st Edition', '1999–2000 Copyright (4th print)']);
  assert.deepEqual(gastly[0].treatments, []);
  assert.equal(defaultPokemonVersion(gastly).label, 'Unlimited');

  const aerodactyl = pokemonVersions(fossil([
    { type: 'holo', size: 'standard', foil: 'galaxy' },
    { type: 'holo', size: 'standard', stamp: ['1st-edition'], foil: 'galaxy' },
    { type: 'holo', size: 'standard', stamp: ['pre-release'], foil: 'cosmos' },
  ]));
  assert.deepEqual(aerodactyl.map((v) => v.label), ['Unlimited', '1st Edition', 'Cosmos foil · Prerelease stamp']);
});

test('a plain version never has a foil pattern; real patterns elsewhere stay', () => {
  const card = { set: { id: 'sv03.5' }, variants_detailed: [
    { type: 'normal', size: 'standard', foil: 'pokeball' },
    { type: 'reverse', size: 'standard', foil: 'pokeball' },
    { type: 'holo', size: 'standard', foil: 'galaxy' },
  ] };
  assert.deepEqual(pokemonVersions(card).map((v) => v.label), ['Standard', 'Poké Ball pattern', 'Galaxy foil']);
});

test('versions left the same once a mistaken pattern is dropped appear once', () => {
  const card = fossil([
    { type: 'holo', size: 'standard', foil: 'galaxy' },
    { type: 'holo', size: 'standard' },
  ]);
  assert.equal(pokemonVersions(card).length, 1);
});

test('a crossed Poké Ball / Master Ball pair is put back (TCGdex, SV2a Starmie, 2026-10-10)', () => {
  const card = {
    set: { id: 'SV2a' },
    variants_detailed: [
      { type: 'holo', size: 'standard', pricing: { cardmarket: { avg30: 0.12 } } },
      { type: 'reverse', size: 'standard', foil: 'pokeball', pricing: { cardmarket: { 'avg30-holo': 9.11 } } },
      { type: 'reverse', size: 'standard', foil: 'masterball', pricing: { cardmarket: { 'avg30-holo': 0.92 } } },
    ],
  };
  const v = pokemonVersions(card);
  const price = (t) => v.find((x) => x.treatments.includes(t)).cardmarketPrice;
  assert.equal(price('pokeball-pattern'), 0.92);
  assert.equal(price('masterball-pattern'), 9.11);
  assert.equal(v.find((x) => x.finish === 'holo').cardmarketPrice, 0.12);
});

test('a pair the right way round, or with one price missing, is left alone', () => {
  const pair = (pb, mb) => uncrossPatterns([
    { finish: 'reverse', treatments: ['pokeball-pattern'], cardmarketPrice: pb, marketPrice: null },
    { finish: 'reverse', treatments: ['masterball-pattern'], cardmarketPrice: mb, marketPrice: null },
  ]).map((x) => x.cardmarketPrice);
  assert.deepEqual(pair(2.39, 355.54), [2.39, 355.54]);
  assert.deepEqual(pair(5, null), [5, null]);
});

test('Snorlax 051: the Pokémon Center stamp, spelled right, with its logo', () => {
  const versions = pokemonVersions({ set: { id: 'svp' }, variants_detailed: [
    { type: 'holo', size: 'standard', thirdParty: { tcgplayer: 517175 } },
    { type: 'holo', size: 'standard', stamp: ['pokemon-center'], thirdParty: { tcgplayer: 517270 } },
  ] });
  assert.deepEqual(versions.map((v) => v.label), ['Standard', 'Pokémon Center stamp']);
  assert.ok(isPokemonCenterStamp(versions[1]));
  assert.ok(!isPokemonCenterStamp(versions[0]));
  // A TCGplayer product named for it, too.
  assert.ok(isPokemonCenterStamp({ treatments: ['variant:Pokemon Center Exclusive'] }));
  // Any stamp TCGdex names with "pokemon" gets its é.
  assert.equal(pokemonVersions({ set: { id: 'x' }, variants_detailed: [{ type: 'holo', stamp: ['pokemon-league'] }] })[0].label,
    'Pokémon League stamp');
});

test('the default version is TCGdex\'s, not a TCGplayer-only product (Pikachu SVP 027)', () => {
  const versions = [
    { id: 'holo|||', finish: 'holo', treatments: [], firstEdition: false },
    { id: 'holo|||pokemon-center', finish: 'holo', treatments: ['pokemon-center'], firstEdition: false },
    { id: 'jt:x:Normal', finish: 'normal', treatments: ['variant:Baby'], firstEdition: false, tcgplayerOnly: true },
  ];
  assert.equal(defaultPokemonVersion(versions).id, 'holo|||');
  // A card known only from TCGplayer: its own versions are all there is.
  assert.equal(defaultPokemonVersion([versions[2]]).id, 'jt:x:Normal');
});
