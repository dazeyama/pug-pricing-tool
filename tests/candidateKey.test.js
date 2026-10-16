import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkItemKey, candidateKeyOf, justtcgKey, magicKey, pokemonKey } from '../src/lib/candidateKey.js';
import { bulkCandidate, bulkItem, buildBulkLine, buildPlaceholderLine } from '../src/lib/bulk.js';
import { cardId, justtcgCandidate } from '../src/lib/justtcgCards.js';

// A saved line finds its candidate again (FABLE_REPORT B6): the key worked
// out from the line is the key the search gave the card.

test('each kind of card has its own key', () => {
  assert.equal(magicKey('abc'), 'mtg:abc');
  assert.equal(pokemonKey('ja', 'SV2a-025'), 'pokemon:ja:SV2a-025');
  assert.equal(justtcgKey('en', 'jt-1'), 'pokemon:en:jt:jt-1');
  assert.equal(bulkItemKey('mtg_100_common'), 'bulk:mtg_100_common');
});

test('a Magic line and a TCGdex Pokémon line', () => {
  assert.equal(candidateKeyOf({ game: 'mtg', lang: 'en', scryfall_id: 'abc', bulk_kind: null }), 'mtg:abc');
  // A Japanese-only Magic printing is keyed by its Scryfall id like any other.
  assert.equal(candidateKeyOf({ game: 'mtg', lang: 'ja', scryfall_id: 'soa-79', bulk_kind: null }), 'mtg:soa-79');
  assert.equal(candidateKeyOf({ game: 'pokemon', lang: 'en', tcgdex_id: 'base1-4', justtcg_card_id: 'x' }), 'pokemon:en:base1-4');
});

test('a Pokémon card known only from TCGplayer: its JustTCG card', () => {
  const card = { uuid: 'jt-1', id: 'jt-1', name: 'Misty\'s Starmie', number: 'No. 121', set_name: 'CGD', variants: [] };
  const c = justtcgCandidate(card, { lang: 'ja', setCode: 'CGD', number: 'No. 121' });
  assert.equal(candidateKeyOf({ game: 'pokemon', lang: 'ja', tcgdex_id: null, justtcg_card_id: cardId(card) }), c.key);
});

test('a bulk line and a placeholder line find their items', () => {
  const bulk = bulkItem('mtg_100_common');
  assert.equal(candidateKeyOf(buildBulkLine(bulk, 10, 1.5)), bulkCandidate(bulk).key);
  const placeholder = bulkItem('pkm_placeholder');
  assert.equal(candidateKeyOf(buildPlaceholderLine(placeholder, 1, 4, 'Meowth 117')), bulkCandidate(placeholder).key);
});
