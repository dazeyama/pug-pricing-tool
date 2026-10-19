import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anotherCard } from '../src/lib/anotherCard.js';

// Decision 347: a product's cached answer checked for the card asking.
const lookup = (number) => ({ key: 'pokemon:tcgplayer:500', game: 'pokemon', tcgplayerId: '500', number });

test('a cached product whose number is another card\'s is refused for this card', () => {
  assert.equal(anotherCard(lookup('44'), { number: '044/225' }), null, 'the same card, zero-padded');
  assert.equal(anotherCard(lookup('44'), { number: '45/225' }), 'number 45/225, not 44');
  assert.equal(anotherCard(lookup('TG05'), { number: 'TG5/TG30' }), null);
  assert.equal(anotherCard(lookup('TG05'), { number: 'TG16/TG30' }), 'number TG16/TG30, not TG05');
});

test('nothing to go on, or not a Pokémon product: not refused', () => {
  assert.equal(anotherCard(lookup('CC001'), { number: '2/102' }), null, "Celebrations' Classic Collection keeps the originals' numbers");
  assert.equal(anotherCard(lookup(undefined), { number: '45' }), null, 'a TCGplayer-only version has no number');
  assert.equal(anotherCard(lookup('44'), { number: '' }), null);
  assert.equal(anotherCard(lookup('44'), null), null);
  assert.equal(anotherCard({ ...lookup('44'), game: 'mtg' }, { number: '45' }), null);
  assert.equal(anotherCard({ key: 'pokemon:en:x', game: 'pokemon', number: '44' }, { number: '45' }), null, 'a name search');
});
