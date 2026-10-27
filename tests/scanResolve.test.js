import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANDIDATES, confirms, likeliest, nameLikeness, readClues, resolveText, resolveThorough, scoreCard,
} from '../src/scan/resolve.js';

// Owner, 2026-10-16: the collector strip's text, every clue in it, and the card found by elimination.

const KNOWN = new Set(['HOB', 'DMU', 'MH3', 'DSK', 'LTR', '2X2', '40K', 'M21', 'OTJ', 'BLB']);

test('a 2023 strip: rarity, number, set, language and artist', () => {
  const c = readClues('R 0113\nHOB • EN ⟿ MIKLÓS LIGETI', KNOWN);
  assert.equal(c.sets[0], 'HOB');
  assert.equal(c.numbers[0], '113');
  assert.equal(c.rarity, 'rare');
  assert.equal(c.lang, 'EN');
  assert.equal(c.artist, 'MIKLOS LIGETI');
});

test('ones read as L, a nought as O: still HOB 113', () => {
  const c = readClues('R 0ll3\nH0B EN MlKLOS LlGETl', KNOWN);
  assert.equal(c.sets[0], 'HOB');
  assert.equal(c.numbers[0], '113');
  assert.equal(c.rarity, 'rare');
  assert.ok(nameLikeness(c.artist, 'Miklós Ligeti') > 0.7, c.artist);
});

test('an older strip: number over the set size, rarity after it', () => {
  const c = readClues('071/281 C\nDMU • EN ⟿ SOMEONE ELSE', KNOWN);
  assert.equal(c.sets[0], 'DMU');
  assert.equal(c.numbers[0], '71');
  assert.equal(c.size, 281);
  assert.equal(c.rarity, 'common');
});

test('a set code run into its language code, and a number with its look-alikes', () => {
  const c = readClues('R 0113\nHOBEN MIKLOS LIGETI', KNOWN);
  assert.deepEqual([c.sets[0], c.lang], ['HOB', 'EN']);
  assert.ok(c.numbers.includes('118') && c.numbers.includes('713'), c.numbers.join(' '));
});

test('a set code with digits is a set, not a number', () => {
  const c = readClues('M 0042\n40K • EN ⟿ SOMEBODY', KNOWN);
  assert.deepEqual([c.sets[0], c.numbers[0], c.rarity], ['40K', '42', 'mythic']);
});

test('the rarity beside the number, not a stray mark above it; noughts read as O', () => {
  const c = readClues('L__________ ___ |\nU 0145\nBLB + EN % ZOLIAN BOROS', KNOWN);
  assert.deepEqual([c.sets[0], c.numbers[0], c.rarity], ['BLB', '145', 'uncommon']);
  assert.equal(readClues('C OllO\nD0M EN ANTHONY PALUMBO', new Set(['DOM'])).numbers[0], '110');
  const d = readClues('RoOoO48\nOTJ « EN % BRIAN VALEZA', KNOWN);
  assert.deepEqual([d.sets[0], d.numbers[0], d.rarity], ['OTJ', '48', 'rare']);
});

test('a set code a letter off: the codes it could be, as the weakest clue', () => {
  const c = readClues('C 0071\nDMQ EN OLIVIER BERNARD', KNOWN);
  assert.ok(c.sets.includes('DMU'), c.sets.join(' '));
  assert.equal(c.setWeight.DMU, 1);
});

const card = (id, set, number, rarity, artist) => ({ id, set, collector_number: number, rarity, artist, lang: 'en' });
const GIANT = card('giant', 'hob', '113', 'rare', 'Miklós Ligeti');
const GARRISON = card('garrison', 'hob', '13', 'common', 'Another Painter');
const PONIES = card('ponies', 'hob', '3', 'common', 'Third Painter');
const NEIGHBOUR = card('neighbour', 'hob', '118', 'rare', 'Fourth Painter');
const HOB = [GIANT, GARRISON, PONIES, NEIGHBOUR];

/**
 * A pretend Scryfall over a few cards. search: set:, cn: (any of), r: and a:, and groups joined
 * by ") or (". lookup: a set and number. Records what was asked of each.
 */
function fakeSearch(cards) {
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
      && (!artist || c.artist.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(artist)));
  };
  const search = async (q) => {
    asked.push(q);
    return [...new Set(q.split(/\) or \(/).flatMap(matches))];
  };
  const lookup = async (set, number) => {
    looked.push(`${set.toLowerCase()}/${number}`);
    return cards.find((c) => c.set === set.toLowerCase() && c.collector_number === number) ?? null;
  };
  return { search, lookup, asked, looked };
}

test('the right card scores well ahead of its neighbours', () => {
  const clues = readClues('R 0113\nHOB • EN ⟿ MIKLOS LIGETI', KNOWN);
  const giant = scoreCard(GIANT, clues);
  for (const other of [GARRISON, PONIES, NEIGHBOUR]) assert.ok(giant - scoreCard(other, clues) >= 4, other.id);
});

test('read exactly: the quick way, looked up directly, no search', async () => {
  const { search, lookup, asked, looked } = fakeSearch(HOB);
  const found = await resolveText('R 0113\nHOB • EN ⟿ MIKLOS LIGETI', KNOWN, { search, lookup });
  assert.equal(found.card.id, 'giant');
  assert.equal(found.quick, true);
  assert.deepEqual(looked, ['hob/113']);
  assert.equal(asked.length, 0);
});

test('the quick way refuses a card the rarity or artist contradicts', () => {
  const clues = readClues('R 0113\nHOB • EN ⟿ MIKLOS LIGETI', KNOWN);
  assert.equal(confirms(GIANT, clues), true);
  assert.equal(confirms(GARRISON, clues), false);
  assert.equal(confirms(card('x', 'hob', '113', 'rare', 'Another Painter'), clues), false);
  assert.equal(confirms(GIANT, readClues('HOB 113', KNOWN)), false, 'nothing but set and number read');
});

test('a digit lost (013): the rarity and the artist find it, not HOB 13', async () => {
  const { search, lookup, asked, looked } = fakeSearch(HOB);
  const found = await resolveText('R 013\nHOB • EN ⟿ MIKLOS LIGETI', KNOWN, { search, lookup });
  assert.equal(found.card.id, 'giant');
  assert.deepEqual(looked, ['hob/13'], 'HOB 13 looked up, and refused');
  // The rarity's cards and the artist's, asked in one search after the set and number's.
  assert.equal(asked.length, 2);
  assert.match(asked[1], /r:rare/);
  assert.match(asked[1], /a:"(ligeti|miklos)"/);
});

test('only the last digit read (3): not Troop of Ponies HOB 3, a common', async () => {
  const { search, lookup } = fakeSearch(HOB);
  const found = await resolveText('R 3\nHOB EN MIKLOS LIGETI', KNOWN, { search, lookup });
  assert.equal(found.card.id, 'giant');
});

test('set and number alone, read clearly: taken; with a wrong rarity: not by auto scan', async () => {
  const { search, lookup } = fakeSearch(HOB);
  assert.equal((await resolveText('HOB 113', KNOWN, { search, lookup })).card.id, 'giant');
  assert.equal(await resolveText('C 0113\nHOB', KNOWN, { search, lookup }), null);
});

test('the number unreadable: Scan card finds it by the artist and the rarity, in that set', async () => {
  const { search, lookup, asked, looked } = fakeSearch(HOB);
  const found = await resolveText('R\nHOB • EN ⟿ MIKLOS LIGETI', KNOWN, { search, lookup, manual: true });
  assert.equal(found.card.id, 'giant');
  assert.ok(asked.some((q) => /a:"ligeti"|a:"miklos"/.test(q)) || asked.some((q) => /r:rare/.test(q)));
  assert.deepEqual(looked, [], 'no number: nothing to look up directly');
});

test('the number unreadable on auto scan: no search, the next look reads again (decision 550)', async () => {
  const { search, lookup, asked } = fakeSearch(HOB);
  assert.equal(await resolveText('R\nHOB • EN ⟿ MIKLOS LIGETI', KNOWN, { search, lookup }), null);
  assert.deepEqual(asked, []);
});

test('a number read as another card, the artist clearly not theirs: the card by the artist read', async () => {
  const shove = card('shove', 'blb', '145', 'uncommon', 'Zoltan Boros');
  const talent = card('talent', 'blb', '5', 'uncommon', 'Ovidio Cartagena');
  const { search, lookup } = fakeSearch([shove, talent]);
  assert.equal((await resolveText('U 5\nBLB EN ZOLTAN BOROS', KNOWN, { search, lookup })).card.id, 'shove');
});

test('a set code a letter off: the number, rarity and artist find the card', async () => {
  const geyser = card('geyser', 'dmu', '71', 'common', 'Olivier Bernard');
  const { search, lookup } = fakeSearch([geyser, card('other', 'dmu', '17', 'common', 'Someone Else')]);
  assert.equal((await resolveText('C 0071\nDMQ EN OLIVIER BERNARD', KNOWN, { search, lookup })).card.id, 'geyser');
});

test('one digit read: the card whose number ends in it, not one a digit away', async () => {
  const fog = card('fog', 'xln', '177', 'common', 'Igor Kieryluk');
  const other = card('other', 'xln', '8', 'common', 'Igor Kieryluk');
  const { search, lookup } = fakeSearch([fog, other]);
  assert.equal((await resolveText('C 7\nXLN EN IGOR KIERYLUK', KNOWN, { search, lookup })).card.id, 'fog');
});

test('two cards equally likely: neither is taken', async () => {
  // 110 read; 116 and 118 each a digit's look-alike away, and alike in everything else.
  const twins = [card('a', 'hob', '116', 'rare', 'Same Painter'), card('b', 'hob', '118', 'rare', 'Same Painter')];
  const { search, lookup } = fakeSearch(twins);
  assert.equal(await resolveText('R 0110\nHOB EN SAME PAINTER', KNOWN, { search, lookup }), null);
});

test('another language: refused, not its English printing', async () => {
  const { search, lookup } = fakeSearch(HOB);
  assert.deepEqual(await resolveText('R 0113\nHOB • DE ⟿ MIKLOS LIGETI', KNOWN, { search, lookup }), { foreign: 'DE' });
});

test('a search that fails is not remembered', async () => {
  let online = false;
  const search = async () => {
    if (!online) throw new Error('offline');
    return [GIANT];
  };
  const lookup = async () => {
    if (!online) throw new Error('offline');
    return GIANT;
  };
  assert.equal(await resolveText('R 0113\nHOB EN MIKLOS LIGETI X', KNOWN, { search, lookup }), null);
  online = true;
  assert.equal((await resolveText('R 0113\nHOB EN MIKLOS LIGETI X', KNOWN, { search, lookup })).card.id, 'giant');
});

// A card's 3 s (decision 549): the likeliest cards, for the pick list when time is up.

test('the likeliest: best first, the clearly wrong left out, three at most', () => {
  const clues = readClues('R 0113\nHOB • EN ⟿ MIKLOS LIGETI', KNOWN);
  const likely = likeliest([PONIES, NEIGHBOUR, GARRISON, GIANT, null, GIANT], clues);
  assert.equal(likely[0].card.id, 'giant');
  assert.ok(likely.some((r) => r.card.id === 'neighbour'), 'a number one look-alike away');
  assert.ok(!likely.some((r) => ['ponies', 'garrison'].includes(r.card.id)), 'another number, rarity and artist');
  assert.ok(likely.length <= CANDIDATES);
  const many = Array.from({ length: 6 }, (_, i) => card(`g${i}`, 'hob', '113', 'rare', 'Miklós Ligeti'));
  assert.equal(likeliest(many, clues).length, CANDIDATES);
});

test('two cards equally likely: neither taken, both offered, and again from memory', async () => {
  const twins = [card('a', 'hob', '116', 'rare', 'Same Painter'), card('b', 'hob', '118', 'rare', 'Same Painter')];
  const { search, lookup } = fakeSearch(twins);
  let offered = null;
  const text = 'R 0110\nHOB • EN ⟿ SAME PAINTER';
  assert.equal(await resolveText(text, KNOWN, { search, lookup, onCandidates: (l) => { offered = l; } }), null);
  assert.deepEqual(offered.map((r) => r.card.id).sort(), ['a', 'b']);
  offered = null;
  assert.equal(await resolveText(text, KNOWN, { search, lookup, onCandidates: (l) => { offered = l; } }), null);
  assert.deepEqual(offered.map((r) => r.card.id).sort(), ['a', 'b'], 'the remembered answer offers them too');
});

test('a card taken is offered first too; a strip in another language offers none', async () => {
  const { search, lookup } = fakeSearch(HOB);
  let offered = null;
  const found = await resolveText('R 0113\nHOB • EN ⟿ MIKLOS LIGETI Y', KNOWN, { search, lookup, onCandidates: (l) => { offered = l; } });
  assert.equal(found.card.id, 'giant');
  assert.equal(offered[0].card.id, 'giant');
  await resolveText('R 0113\nHOB • DE ⟿ MIKLOS LIGETI Y', KNOWN, { search, lookup, onCandidates: (l) => { offered = l; } });
  assert.deepEqual(offered, []);
});

test('Scan card\'s way offers the likeliest too', async () => {
  const twins = [card('a', 'hob', '116', 'rare', 'Same Painter'), card('b', 'hob', '118', 'rare', 'Same Painter')];
  const { search, lookup } = fakeSearch(twins);
  let offered = null;
  const found = await resolveThorough(['R 0110\nHOB EN SAME PAINTER'], KNOWN, { search, lookup, onCandidates: (l) => { offered = l; } });
  assert.equal(found, null);
  assert.deepEqual(offered.map((r) => r.card.id).sort(), ['a', 'b']);
});

test('the look\'s signal and short waits reach Scryfall; a look given up is not remembered', async () => {
  const seen = [];
  const search = async (q, opts) => {
    seen.push(['search', opts?.timeoutMs, Boolean(opts?.signal)]);
    if (opts?.signal?.aborted) throw new Error('aborted');
    return [GIANT];
  };
  const lookup = async (set, number, opts) => {
    seen.push(['lookup', opts?.timeoutMs, Boolean(opts?.signal)]);
    if (opts?.signal?.aborted) throw new Error('aborted');
    return null;   // not found directly: the searches are asked
  };
  const given = new AbortController();
  given.abort();
  const text = 'R 0113\nHOB EN MIKLOS LIGETI W';
  assert.equal(await resolveText(text, KNOWN, { search, lookup, signal: given.signal }), null);
  assert.ok(seen.every(([, ms, hasSignal]) => ms > 0 && ms <= 1500 && hasSignal), JSON.stringify(seen));
  const live = new AbortController();
  assert.equal((await resolveText(text, KNOWN, { search, lookup, signal: live.signal })).card.id, 'giant');
});
