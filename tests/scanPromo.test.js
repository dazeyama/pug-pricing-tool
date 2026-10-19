import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPromoStrip, promoNumber, resolvePromo } from '../src/scan/promo.js';

// Promos printing PRM for their set (owner, 2026-10-18: Etali, Primal Storm; decision 313).

const STRIP = '100/196 P Promo\nPRM * EN > RAYMOND SWANLAND';

test('a PRM strip, and its number over its set size', () => {
  assert.equal(isPromoStrip(STRIP), true);
  assert.equal(isPromoStrip('R 0113\nHOB • EN MIKLOS LIGETI'), false);
  assert.equal(isPromoStrip('PRMX 12'), false);
  assert.deepEqual(promoNumber(['', STRIP]), { number: '100', size: 196 });
});

const set = (code, size, extra = {}) => [code, { code, printed_size: size, card_count: size, set_type: 'expansion', digital: false, ...extra }];
const SETS = new Map([
  set('rix', 196),
  set('prix', null, { set_type: 'promo', parent_set_code: 'rix' }),
  set('znr', 280), set('m19', 280),
  set('pss3', null, { set_type: 'promo', parent_set_code: 'm19' }),
  set('prm', null, { set_type: 'promo', digital: true }),
]);
const card = (s, n, name) => ({ id: `${s}-${n}`, set: s, collector_number: n, name });

test("Etali: Rivals of Ixalan by its 196 cards, then its promos numbered 100", async () => {
  const lookup = async (s, n) => (s === 'rix' && n === '100' ? card('rix', '100', 'Etali, Primal Storm') : null);
  const printings = async () => [
    card('rix', '100', 'Etali, Primal Storm'), card('prix', '100p', 'Etali, Primal Storm'),
    card('prix', '100s', 'Etali, Primal Storm'), card('prix', '100★', 'Etali, Primal Storm'),
    card('prix', '1001', 'Etali, Primal Storm'), card('plst', 'RIX-100', 'Etali, Primal Storm'),
  ];
  const got = await resolvePromo([STRIP], { sets: SETS, lookup, printings });
  assert.equal(got.name, 'Etali, Primal Storm');
  assert.deepEqual(got.cards.map((c) => c.collector_number), ['100p', '100s', '100★']);
});

test('a size two sets share: the one whose card has a promo of that number', async () => {
  const lookup = async (s, n) => (n === '5' ? card(s, '5', s === 'm19' ? 'Core Thing' : 'Zendikar Thing') : null);
  const printings = async (name) => (name === 'Core Thing' ? [card('pss3', '5s', name)] : [card('znr', '5', name)]);
  const got = await resolvePromo(['5/280 P\nPRM EN'], { sets: SETS, lookup, printings });
  assert.equal(got.name, 'Core Thing');
  assert.deepEqual(got.cards.map((c) => c.id), ['pss3-5s']);
});

test('not a PRM strip, or no number: nothing', async () => {
  assert.equal(await resolvePromo(['R 0113 HOB EN'], { sets: SETS }), null);
  assert.equal(await resolvePromo(['P Promo PRM EN'], { sets: SETS }), null);
});

// FNM promos of 2014–2018 printing FNM for their set (owner, 2026-10-18: Renegade Rallier; decision 327).

const FNM = '009/012 P FNM\nFNM *EN 5 David PALUMBO';
const fnmCard = (s, n, name, artist, frame = '2015') => ({ id: `${s}-${n}`, set: s, collector_number: n, name, artist, frame });
const FNM9 = {
  f14: fnmCard('f14', '9', 'Banishing Light', 'Wesley Burt'),
  f15: fnmCard('f15', '9', 'Orator of Ojutai', 'David Gaillet'),
  f16: fnmCard('f16', '9', 'Flaying Tendrils', 'Svetlin Velinov'),
  f17: fnmCard('f17', '9', 'Renegade Rallier', 'David Palumbo'),
};
const FNM1 = {
  f14: fnmCard('f14', '1', 'Warleader\'s Helix', 'Ryan Barger', '2003'),
  f15: fnmCard('f15', '1', 'Frenzied Goblin', 'Kev Walker'),
  f16: fnmCard('f16', '1', "Nissa's Pilgrimage", 'Christine Choi'),
  f17: fnmCard('f17', '1', 'Noose Constrictor', 'Kev Walker'),
  f18: fnmCard('f18', '1', 'Merfolk // Treasure', 'Randy Gallegos & Jason Felix'),
};

test('an FNM strip, not a PRM one', async () => {
  const { isFnmStrip } = await import('../src/scan/promo.js');
  assert.equal(isFnmStrip(FNM), true);
  assert.equal(isFnmStrip('FNMX 12'), false);
  assert.equal(isFnmStrip(STRIP), false);
  assert.equal(isPromoStrip(FNM), false);
});

test('Renegade Rallier: 2017\'s card 9, by David Palumbo on the line', async () => {
  const { resolveFnm } = await import('../src/scan/promo.js');
  const lookup = async (s, n) => (n === '9' ? FNM9[s] ?? null : null);
  const found = await resolveFnm([FNM], { lookup });
  assert.equal(found.by, 'artist');
  assert.deepEqual(found.cards.map((c) => c.name), ['Renegade Rallier']);
  // No "009/012" read: the number the strip's own lookup used.
  const bare = await resolveFnm(['P FNM *EN David PALUMBO'], { number: '009', lookup });
  assert.deepEqual(bare.cards.map((c) => c.name), ['Renegade Rallier']);
  // Not an FNM strip, or no number: nothing.
  assert.equal(await resolveFnm([STRIP], { lookup }), null);
  assert.equal(await resolveFnm(['FNM EN'], { lookup }), null);
});

test('card 1: Kev Walker drew two, so both are left for the title; old frames aren\'t candidates', async () => {
  const { resolveFnm, cardNamed } = await import('../src/scan/promo.js');
  const lookup = async (s, n) => (n === '1' ? FNM1[s] ?? null : null);
  const found = await resolveFnm(['001/012 P FNM\nFNM * EN KEV WALKEK'], { lookup });
  assert.equal(found.by, null);
  assert.deepEqual(found.cards.slice(0, 2).map((c) => c.name).sort(), ['Frenzied Goblin', 'Noose Constrictor']);
  assert.equal(found.cards.some((c) => c.set === 'f14'), false);
  assert.equal(cardNamed('Noose Constrictar 1G', found.cards)?.name, 'Noose Constrictor');
  assert.equal(cardNamed('Merfolk', found.cards)?.name, 'Merfolk // Treasure');
  assert.equal(cardNamed('xq', found.cards), null);
  assert.equal(cardNamed('Lightning Bolt', found.cards), null);
});
