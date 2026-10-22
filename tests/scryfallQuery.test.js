import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPromo, keepListed, listedNumber, numberTerm, printsQuery } from '../src/lib/scryfall.js';

// Owner, 2026-10-22: Delney's promos after its MKM printings (decision 435).
test('a promo is Scryfall\'s promo flag or a promo set, not a showcase card', () => {
  assert.equal(isPromo({ set: 'pmkm', promo: true, set_type: 'promo' }), true);
  assert.equal(isPromo({ set: 'pwcs', promo: false, set_type: 'promo' }), true);
  assert.equal(isPromo({ set: 'mkm', promo: false, set_type: 'expansion' }), false);
  assert.equal(isPromo({ set: 'mkm' }), false);
  assert.equal(isPromo(null), false);
});

// Owner, 2026-10-13: "High Perfect 229" finds the promo pack 229p too.
test('a plain collector number also asks for its promo pack "p" printing', () => {
  assert.equal(numberTerm('229'), '(cn:"229" or cn:"229p")');
  assert.equal(numberTerm(' 7 '), '(cn:"7" or cn:"7p")');
  // Anything else as typed.
  assert.equal(numberTerm('229p'), 'cn:"229p"');
  assert.equal(numberTerm('229s'), 'cn:"229s"');
  assert.equal(numberTerm('TG05'), 'cn:"TG05"');
  assert.equal(numberTerm('22"9'), '(cn:"229" or cn:"229p")');     // a stray quote is dropped
  assert.equal(numberTerm(''), null);
  assert.equal(numberTerm(null), null);
});

// Owner, 2026-10-18: "rootborn def 26" finds The List's RVR-26 too (decision 329).
const TAIL = ' game:paper -is:extra';
const LISTS = '(set:plst or set:mb1 or set:fmb1)';

test('a set code and a number: that card, and The List\'s and Mystery Booster\'s with that code and number', () => {
  assert.deepEqual(printsQuery({ name: '', number: '26', setCode: 'RVR' }),
    { q: `((set:rvr (cn:"26" or cn:"26p")) or (${LISTS} cn:"rvr-26"))${TAIL}`, listedOnly: null });
  // Asked for The List itself: as typed.
  assert.deepEqual(printsQuery({ name: '', number: 'RVR-26', setCode: 'plst' }),
    { q: `cn:"RVR-26" set:plst${TAIL}`, listedOnly: null });
});

test('a name and a number: those sets\' printings of the name too, kept by their number', () => {
  const { q, listedOnly } = printsQuery({ name: 'rootborn def', number: '26', setCode: null });
  assert.equal(q, `"rootborn" "def" (cn:"26" or cn:"26p" or ${LISTS})${TAIL}`);
  assert.equal(listedOnly, '26');
  const card = (set, collector_number) => ({ set, collector_number });
  assert.equal(keepListed(card('plst', 'RVR-26'), '26'), true);
  assert.equal(keepListed(card('plst', 'MM3-21'), '26'), false);
  assert.equal(keepListed(card('mb1', 'RVR-026'), '26'), true);
  assert.equal(keepListed(card('rvr', '26'), '26'), true);
  assert.equal(keepListed(card('plst', 'MM3-21'), null), true);
  // A number alone, or a name alone: as before.
  assert.deepEqual(printsQuery({ name: '', number: '26', setCode: null }), { q: `(cn:"26" or cn:"26p")${TAIL}`, listedOnly: null });
  assert.equal(printsQuery({ name: '', number: null, setCode: null }).q, null);
});

test('a List or Mystery Booster number as printed on the card', () => {
  assert.deepEqual(listedNumber('PLST', 'RVR-26'), { set: 'rvr', number: '26' });
  assert.deepEqual(listedNumber('fmb1', 'M10-120'), { set: 'm10', number: '120' });
  assert.equal(listedNumber('rvr', '26'), null);
  assert.equal(listedNumber('sld', '1-2'), null);
});

// Owner, 2026-10-22: "nazgul" finds Nazgûl (decision 446).
test('a word typed without accents is searched with its accented spelling beside it', () => {
  const spell = (w) => ({ nazgul: ['Nazgûl'], dul: ['Dûl', "Dûl's"] }[w] ?? []);
  assert.equal(printsQuery({ name: 'nazgul', number: null, setCode: null }, spell).q, `("nazgul" or "Nazgûl")${TAIL}`);
  assert.equal(printsQuery({ name: 'lim dul', number: null, setCode: null }, spell).q,
    `"lim" ("dul" or "Dûl" or "Dûl's")${TAIL}`);
  // No spellings (the names not loaded yet): as typed.
  assert.equal(printsQuery({ name: 'nazgul', number: null, setCode: null }).q, `"nazgul"${TAIL}`);
});
