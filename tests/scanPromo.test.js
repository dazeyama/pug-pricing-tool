import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPromoStrip, promoNumber, resolvePromo } from '../src/scan/promo.js';

// Promos printing PRM for their set (owner, 2026-10-19: Etali, Primal Storm; decision 313).

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
