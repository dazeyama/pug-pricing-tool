import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { englishPokemonName } from '../src/lib/pokemonNames.js';

const NAMES = JSON.parse(readFileSync(new URL('../src/lib/pokemonNames.json', import.meta.url), 'utf8'));
const en = (name, dexId) => englishPokemonName({ name, dexId }, NAMES);

test('species, forms and suffixes', () => {
  assert.equal(en('ピカチュウV', [25]), 'Pikachu V');
  assert.equal(en('メガリザードンYex', [6]), 'Mega Charizard Y ex');
  assert.equal(en('フェローチェ&マッシブーンGX', [795, 794]), 'Pheromosa & Buzzwole GX');
  assert.equal(en('マサキの転送', undefined), null);
});

test("trainers' Pokémon and Dark ones keep their prefix (2026-10-10)", () => {
  assert.equal(en('カスミのスターミー', [121]), "Misty's Starmie");
  assert.equal(en('R団のエビワラー', [107]), "Rocket's Hitmonchan");
  assert.equal(en('ロケット団のミュウツーex', [150]), "Team Rocket's Mewtwo ex");
  assert.equal(en('わるいリザードン', [6]), 'Dark Charizard');
  assert.equal(en('暗い染色', [157]), 'Dark Typhlosion');
  assert.equal(en('ナンジャモのハラバリーex', [939]), "Iono's Bellibolt ex");
});
