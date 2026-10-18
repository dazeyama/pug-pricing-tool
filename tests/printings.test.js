import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPokemonVersion, fixedProduct, isPokemonCenterStamp, pokemonVersions, uncrossPatterns } from '../src/lib/printings.js';

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

// TCGdex's TCGplayer products that name another card (PKM_PRICES.md 3.1; decision 286).
test('Charmander SVP 044: TCGdex\'s product is Fuecoco 002\'s; the app prices and links Charmander\'s', () => {
  const [plain, center] = pokemonVersions({
    id: 'svp-044',
    set: { id: 'svp' },
    variants_detailed: [
      { type: 'holo', size: 'standard', thirdParty: { tcgplayer: 477182 }, pricing: { tcgplayer: { holofoil: { marketPrice: 5.35 } } } },
      { type: 'holo', size: 'standard', stamp: ['pokemon-center'], thirdParty: { tcgplayer: 512036 }, pricing: { tcgplayer: { holofoil: { marketPrice: 236.49 } } } },
    ],
  });
  assert.equal(plain.tcgplayerId, '512035');
  assert.equal(plain.marketPrice, null, 'TCGdex\'s market price is Fuecoco\'s: not used');
  assert.equal(center.tcgplayerId, '512036');
  assert.equal(center.marketPrice, 236.49);
  assert.equal(fixedProduct('swsh9tg-TG16', 263784), '264221', 'a Trainer Gallery full art, not the plain Mimikyu V');
  assert.equal(fixedProduct('sv03-022', 213012), null, 'a 2004 league card: no product');
  assert.equal(fixedProduct('sv03-022', 509767), '509767', 'any other product stands');
  assert.equal(fixedProduct('sv03-022', null), null);
});

// The fallback market price is the finish's, not the first in TCGdex's block (decision 287).
test('a reverse holo\'s fallback is the reverse holo\'s market price', () => {
  const block = { unit: 'USD', normal: { marketPrice: 0.09 }, 'reverse-holofoil': { marketPrice: 0.2 } };
  const [normal, reverse, holo] = pokemonVersions({ id: 'sv08.5-001', set: { id: 'sv08.5' }, variants_detailed: [
    { type: 'normal', size: 'standard', thirdParty: { tcgplayer: 610356 }, pricing: { tcgplayer: block } },
    { type: 'reverse', size: 'standard', thirdParty: { tcgplayer: 610356 }, pricing: { tcgplayer: block } },
    // A pattern product sold as "Holofoil" only: the one price there is.
    { type: 'reverse', size: 'standard', foil: 'masterball', thirdParty: { tcgplayer: 610637 }, pricing: { tcgplayer: { holofoil: { marketPrice: 1.08 } } } },
  ] });
  assert.equal(normal.marketPrice, 0.09);
  assert.equal(reverse.marketPrice, 0.2);
  assert.equal(holo.marketPrice, 1.08);
});
