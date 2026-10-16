import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSure, readClues, resolveText, resolveThorough } from '../src/scan/resolve.js';
import { createProgress } from '../src/scan/progress.js';

// Owner, 2026-10-16: one look for a card every clue agrees with; Scan card the slow, thorough way
// with a loading bar.

const KNOWN = new Set(['HOB', 'DMU', 'BLB']);
const card = (id, set, number, rarity, artist) => ({ id, set, collector_number: number, rarity, artist, lang: 'en' });
const GIANT = card('giant', 'hob', '113', 'rare', 'Miklós Ligeti');
const GARRISON = card('garrison', 'hob', '13', 'common', 'Another Painter');
const NEIGHBOUR = card('neighbour', 'hob', '118', 'rare', 'Fourth Painter');

function fake(cards) {
  const asked = [];
  const looked = [];
  const matches = (q) => {
    const sets = [...q.matchAll(/set:(\w+)/g)].map((m) => m[1]);
    const numbers = [...q.matchAll(/cn:"(\w+)"/g)].map((m) => m[1]);
    const rarity = /r:(\w+)/.exec(q)?.[1];
    const artist = /a:"(\w+)"/.exec(q)?.[1];
    return cards.filter((c) => (!sets.length || sets.includes(c.set))
      && (!numbers.length || numbers.includes(c.collector_number))
      && (!rarity || c.rarity === rarity)
      && (!artist || c.artist.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(artist)));
  };
  return {
    asked,
    looked,
    search: async (q) => {
      asked.push(q);
      return [...new Set(q.split(/\) or \(/).flatMap(matches))];
    },
    lookup: async (set, number) => {
      looked.push(`${set.toLowerCase()}/${number}`);
      return cards.find((c) => c.set === set.toLowerCase() && c.collector_number === number) ?? null;
    },
  };
}

test('sure: set, number, rarity and the artist all read and all agreeing', () => {
  const full = readClues('R 0113\nHOB • EN ⟿ MIKLOS LIGETI', KNOWN);
  assert.equal(isSure(GIANT, full, 'HOB'), true);
  const noArtist = readClues('R 0113\nHOB EN', KNOWN);
  assert.equal(isSure(GIANT, noArtist, 'HOB'), false, 'no artist read');
  const noRarity = readClues('0113\nHOB • EN ⟿ MIKLOS LIGETI', KNOWN);
  assert.equal(isSure(GIANT, noRarity, 'HOB'), false, 'no rarity read');
  const short = readClues('R 0113\nHOB • EN ⟿ MIKL', KNOWN);
  assert.equal(isSure(GIANT, short, 'HOB'), false, 'a name read too short to be sure of');
});

test('the quick way says when it is sure, and when it is not', async () => {
  const api = fake([GIANT, GARRISON]);
  assert.equal((await resolveText('R 0113\nHOB • EN ⟿ MIKLOS LIGETI Q', KNOWN, api)).sure, true);
  const found = await resolveText('R 0113\nHOB EN Q', KNOWN, api);
  assert.equal(found.card.id, 'giant');
  assert.equal(Boolean(found.sure), false);
});

test('thorough: every lookup and search asked, even with a card already clear', async () => {
  const api = fake([GIANT, GARRISON, NEIGHBOUR]);
  const found = await resolveThorough(['R 0113\nHOB • EN ⟿ MIKLOS LIGETI'], KNOWN, api);
  assert.equal(found.card.id, 'giant');
  assert.deepEqual(api.looked, ['hob/113']);
  assert.equal(api.asked.length, 2, 'the set and number search and the wider one');
});

test('thorough: readings pooled, each card scored by the reading it fits best', async () => {
  const api = fake([GIANT, GARRISON]);
  // The strip lost a digit; the card's line, read too, has it.
  const found = await resolveThorough(['R 013\nHOB EN', 'R 0113\nHOB • EN ⟿ MIKLOS LIGETI'], KNOWN, api);
  assert.equal(found.card.id, 'giant');
});

test('thorough: nothing clearly ahead, nothing taken; no readings, nothing asked', async () => {
  const twins = [card('a', 'hob', '116', 'rare', 'Same Painter'), card('b', 'hob', '118', 'rare', 'Same Painter')];
  const api = fake(twins);
  assert.equal(await resolveThorough(['R 0110\nHOB EN SAME PAINTER'], KNOWN, api), null);
  const none = fake([GIANT]);
  assert.equal(await resolveThorough(['', 'HOB'], KNOWN, none), null);
  assert.equal(none.asked.length + none.looked.length, 0);
});

test('thorough: another language refused', async () => {
  const api = fake([GIANT]);
  assert.deepEqual(await resolveThorough(['R 0113\nHOB • DE ⟿ MIKLOS LIGETI'], KNOWN, api), { foreign: 'DE' });
});

test('thorough: its lookups and searches go on the loading bar', async () => {
  let t = 0;
  const progress = createProgress(() => t);
  progress.plan('resolve', 2000);
  const api = fake([GIANT]);
  await resolveThorough(['R 0113\nHOB • EN ⟿ MIKLOS LIGETI'], KNOWN, { ...api, progress });
  t = 10;
  assert.equal(progress.value(), 1, 'every step it planned is done, the placeholder dropped');
});

test('the bar: by the time each step is expected to take, creeping, never back', () => {
  let t = 0;
  const p = createProgress(() => t);
  p.plan('a', 1000);
  p.plan('b', 1000);
  assert.equal(p.value(), 0);
  p.start('a');
  t = 500;
  assert.equal(p.value(), 0.25);
  t = 5000;
  assert.equal(p.value(), 0.45, 'a slow step creeps to 90% of itself, no further');
  p.finish('a');
  assert.equal(p.value(), 0.5);
  p.plan('c', 2000);   // more work turns up: the bar waits, it doesn't go back
  assert.equal(p.value(), 0.5);
  p.start('b');
  p.finish('b');
  p.start('c');
  t = 6000;
  assert.equal(p.value(), 0.75);
  p.drop('c');         // not needed after all
  assert.equal(p.value(), 1);
  p.complete();
  assert.equal(p.value(), 1);
});
