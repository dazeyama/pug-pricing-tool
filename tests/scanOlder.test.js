import { test } from 'node:test';
import assert from 'node:assert/strict';
import { olderStripYear, parseCopyrightYear, parseOldNumber } from '../src/scan/titles.js';

test('an older card\'s copyright line, as the strip reads it (decision 557)', () => {
  // Read off the phone on 2026-10-27: Goblin Electromancer, Guardian of Vitu-Ghazi.
  assert.equal(olderStripYear("==> Svetlin Velinov\n'M& @ 2012 Wards of the Coast]\n"), 2012);
  assert.equal(olderStripYear('—> Wayne Reynolds\nMK 13 1993-2005 Was ads of he Co:\n'), 2005);
  assert.equal(olderStripYear('TM & © 2009 Wizards of the Coast'), 2009);
  // A modern strip, a set code and number: no year. One that lost its year: none either.
  assert.equal(olderStripYear('R 0113\nHOB • EN ⟿ MIKLOS LIGETI'), null);
  assert.equal(olderStripYear('M 0042\n40K • EN ⟿ SOMEBODY'), null);
  assert.equal(olderStripYear('zr Sveum Velinov\nRK O20 CW ads 1 hie (pan)\n'), null);
  // 2015 on: not an older card.
  assert.equal(olderStripYear('© 2016 Wizards of the Coast'), null);
});
import { matchName, titleKey } from '../src/scan/nameMatch.js';

// docs/SCAN_FUNCTION.md 6.2: older cards by their title and "123/350".

test('an old card\'s collector number and its set\'s size', () => {
  assert.deepEqual(parseOldNumber('Illus. Mark Tedin 123/350'), { number: '123', size: 350 });
  assert.deepEqual(parseOldNumber('TM & © 1999 Wizards 007 / 143'), { number: '7', size: 143 });
  assert.equal(parseOldNumber('Illus. Mark Tedin'), null);
  assert.equal(parseOldNumber('1999 Wizards'), null);
  assert.equal(parseOldNumber('300/150'), null);
});

test('the year on a copyright line', () => {
  assert.equal(parseCopyrightYear('TM & © 1993-2009 Wizards of the Coast LLC 96/249'), 2009);
  assert.equal(parseCopyrightYear('©1993–2000 Wizards of the Coast, Inc. 299/350'), 2000);
  assert.equal(parseCopyrightYear('Illus. & © 1995 Wizards of the Coast'), 1995);
  assert.equal(parseCopyrightYear('Illus. Mark Tedin'), null);
});

const NAMES = [
  'Lightning Bolt', 'Lightning Blast', 'Ancestral Memories', 'Ancestral Recall', 'Llanowar Elves',
  'Delver of Secrets // Insectile Aberration', 'Fire // Ice', 'Serra Angel', 'Shivan Dragon',
];

test('a title read cleanly matches its card', () => {
  assert.equal(matchName('Lightning Bolt', NAMES)?.name, 'Lightning Bolt');
  assert.equal(matchName('  llanowar  elves ', NAMES)?.name, 'Llanowar Elves');
});

test('a two-faced card is found by its front face', () => {
  assert.equal(matchName('Delver of Secrets', NAMES)?.name, 'Delver of Secrets // Insectile Aberration');
});

test('a small misread still matches when the card is clear', () => {
  assert.equal(matchName('Shivan Dragorn', NAMES)?.name, 'Shivan Dragon');
  assert.equal(matchName('Serra Ange1', NAMES)?.name, 'Serra Angel');
});

test('a read that could be two cards, or none, has no answer', () => {
  assert.equal(matchName('Lightning B', NAMES), null);     // Bolt or Blast
  assert.equal(matchName('Shivan', NAMES), null);          // only part of a title
  assert.equal(matchName('xq', NAMES), null);
  assert.equal(matchName('Wizards of the Coast', NAMES), null);
});

test("only short words are cut off a read's end (decision 310)", async () => {
  const { titleKeys } = await import('../src/scan/nameMatch.js');
  // The mana cost read as letters goes; a real word of the title stays.
  assert.deepEqual(titleKeys('Chromatic Sphere Bh'), ['chromatic sphere bh', 'chromatic sphere']);
  assert.deepEqual(titleKeys("{lUrza's Tower N"), ['lurza s tower n', 'lurza s tower']);
  // Cut down to "lurza" it named Urza, another card; now it's never cut that far.
  assert.notEqual(matchName("{lUrza's Tower N", ['Urza', "Urza's Tower", "Urza's Power Plant", "Urza's Mine"])?.name, 'Urza');
});

test('titles compare without punctuation or case', () => {
  assert.equal(titleKey('Æther Vial!'), 'aether vial');
});

test('Which card? (decision 311): a guess when nothing is clear, and names as typed', async () => {
  const { guessName, nameSuggestions } = await import('../src/scan/nameMatch.js');
  const names = ["Heaven's Gate", 'Heavenly Blademaster', 'Serra Angel', 'Serra Aviary', 'Shivan Dragon', 'Sanctum Gargoyle'];
  // A bad reading (the benchmark's Heaven's Gate): no clear name, but a guess to start the box with.
  assert.equal(matchName("Tienvep's Gare", names), null);
  assert.equal(guessName(["Tienvep's Gare", ''], names)?.name, "Heaven's Gate");
  assert.equal(guessName(['', 'x'], names), null);
  // Typing: names starting with it first, then a word starting with it; nothing loose besides.
  assert.deepEqual(nameSuggestions('heav', names), ["Heaven's Gate", 'Heavenly Blademaster']);
  assert.deepEqual(nameSuggestions('aviary', names), ['Serra Aviary']);
  assert.deepEqual(nameSuggestions('s', names), []);
  // A typo, nothing starting with it: the closest names.
  assert.equal(nameSuggestions('hevens gat', names)[0], "Heaven's Gate");
});

test('among thousands of names: misreads still named, junk answered at once (decision 551)', () => {
  // 30,000 made-up two-word names, about as many as Magic has, with the real ones among them.
  const words = ['ancient', 'blazing', 'cursed', 'dread', 'ember', 'feral', 'gilded', 'hollow', 'iron', 'jade',
    'keen', 'lunar', 'molten', 'noble', 'onyx', 'pale', 'quiet', 'raging', 'silent', 'thorn'];
  const nouns = ['angel', 'bolt', 'crypt', 'dragon', 'elves', 'field', 'giant', 'hound', 'idol', 'jackal',
    'knight', 'lich', 'mage', 'nexus', 'ogre', 'pact', 'quarry', 'rider', 'shade', 'tower'];
  const names = [...NAMES];
  for (let i = 0; names.length < 30_000; i++) {
    names.push(`${words[i % 20]} ${nouns[Math.floor(i / 20) % 20]} ${i}`);
  }
  matchName('warm', names);   // the index, built once
  const started = performance.now();
  assert.equal(matchName('Shivan Dragorn', names)?.name, 'Shivan Dragon');
  assert.equal(matchName('Serra Ange1', names)?.name, 'Serra Angel');
  for (const junk of ['po ] 1 y . [3 OC tr Ww AES', 'Life’s circle has become inverted', 'CM 92009 Wisw Jp Gf HE Clout if']) {
    assert.equal(matchName(junk, names), null, junk);
  }
  // Fuse over every name took over a second for each junk reading on the laptop (2026-10-26).
  assert.ok(performance.now() - started < 1_000, `${Math.round(performance.now() - started)} ms`);
});
