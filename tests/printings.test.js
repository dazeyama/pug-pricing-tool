import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPokemonVersion, pokemonVersions } from '../src/lib/printings.js';

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
