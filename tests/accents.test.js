import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accentedWords, spellingsOf, withAccents } from '../src/lib/normalize.js';

// Decision 446: names typed without accents find the cards that have them.
const words = accentedWords([
  'Nazgûl', 'Lim-Dûl the Necromancer', "Lim-Dûl's Vault", 'Lightning Bolt', 'Éowyn, Fearless Knight',
  'Flabébé', 'Pokémon Center Lady', 'Pokémon Fan Club',
]);

test('the accented words of a name list, by plain spelling; plain names left out', () => {
  assert.deepEqual(words.get('nazgul'), ['Nazgûl']);
  assert.deepEqual(words.get('lim-dul'), ['Lim-Dûl']);
  assert.deepEqual(words.get("lim-dul's"), ["Lim-Dûl's"]);
  assert.deepEqual(words.get('pokemon'), ['Pokémon']);   // once, however many names have it
  assert.equal(words.get('bolt'), undefined);
  assert.equal(words.has('lightning'), false);
});

test('what a word typed without accents may stand for', () => {
  assert.deepEqual(spellingsOf('nazgul', words), ['Nazgûl']);
  assert.deepEqual(spellingsOf('Nazgu', words), ['Nazgûl']);
  assert.deepEqual(spellingsOf('eowyn,', words), ['Éowyn,']);
  assert.deepEqual(spellingsOf('lim-dul', words), ['Lim-Dûl', "Lim-Dûl's"]);
  assert.deepEqual(spellingsOf('nazgûl', words), []);   // typed with its accent: already right
  assert.deepEqual(spellingsOf('ul', words), []);       // too short
  assert.deepEqual(spellingsOf('bolt', words), []);
  assert.equal(spellingsOf('e', new Map([['ee', ['Éé']]])).length, 0);
});

test('a one-name search: each plain word put back as its one accented word', () => {
  assert.equal(withAccents('flabebe', words), 'Flabébé');
  assert.equal(withAccents('pokemon center lady', words), 'Pokémon center lady');
  assert.equal(withAccents('pikachu', words), 'pikachu');
  assert.equal(withAccents('Flabébé', words), 'Flabébé');
  assert.equal(withAccents('', words), '');
});
