import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchOne } from '../src/lib/ccExport.js';
import { parseProductName } from '../src/lib/ccNames.js';
import { fold } from '../src/lib/ccMatch.js';

// The safety order of one line's match (decisions 486, 487, 574, 594): a remembered pick, then the TCGplayer route,
// then today's matcher; never the route for a pick that's staff's. Hand-made products; nothing reaches a database.
const CAT = 'Duskmourn: House of Horror';
const product = (name, category = CAT, id = name) => {
  const p = parseProductName(name);
  return { product_id: id, product_name: name, category, base_key: p.baseKey, bracket: p.bracket, foil_kind: p.foilKind, variants: p.variants };
};
const cats = new Map([CAT, 'Secret Lair Drop Series', 'Unique & Misc. Promos'].map((c) => [fold(c), c]));
const TABLE = {
  10: ['Duskmourn: House of Horror', CAT, null, null],
  20: ['Secret Lair Drop Series', 'Secret Lair Drop Series', null, null],
  30: ['Secret Lair Series', 'Unique & Misc. Promos', null, null],
  40: ['Arena Promos', 'Unique & Misc. Promos', null, null],
};
const plain = product('Overlord of the Hauntwoods', CAT, 'plain');
const borderless = product('Overlord of the Hauntwoods - Borderless', CAT, 'borderless');
const one = (over = {}) => matchOne({
  line: { id: 'l1', name: 'Overlord of the Hauntwoods', set_code: 'DSK', collector_number: '194', finish: 'nonfoil', treatments: [], tcgplayer_id: '1' },
  set: { code: 'dsk', name: CAT },
  promo: '',
  card: null,
  flavor: null,
  where: { category: CAT, how: 'name' },
  also: [],
  link: null,
  linkedProduct: null,
  candidates: [plain, borderless],
  // TCGplayer's product is the borderless one.
  tcg: { product_id: 1, group_id: 10, group_name: CAT, name: 'Overlord of the Hauntwoods (Borderless)' },
  routeCandidates: [plain, borderless],
  categoryNamed: (n) => cats.get(fold(n)) ?? null,
  table: TABLE,
  ...over,
});

test('the route first (594): its product wins over the name\'s, first in Change\'s list, tagged as its own', () => {
  const r = one();
  assert.equal(r.status, 'auto');
  assert.equal(r.product, borderless);
  assert.equal(r.via, 'route');
  assert.equal(r.routeOnly, true);
  assert.equal(r.ranked[0].product, borderless);
  assert.equal(r.ranked[0].score, 1000);
  assert.equal(r.ranked.filter((x) => x.product === borderless).length, 1);
});

test('a remembered pick wins over the route (486)', () => {
  const r = one({ link: { product_id: 'plain', source: 'staff' }, linkedProduct: plain });
  assert.equal(r.product, plain);
  assert.equal(r.via, 'link');
});

test('a remembered pick whose product left the inventory isn\'t routed: staff pick again (487)', () => {
  const r = one({ link: { product_id: 'gone', source: 'staff' }, linkedProduct: null });
  assert.equal(r.status, 'choose');
  assert.equal(r.product, null);
  assert.ok(r.wasLinked);
});

test('Secret Lair never takes the route (574): by its set, its category, the route\'s category or its TCGplayer set', () => {
  assert.equal(one({ set: { code: 'sld', name: 'Secret Lair Drop' } }).status, 'choose');
  assert.equal(one({ where: { category: 'Secret Lair Drop Series', how: 'rule' } }).status, 'choose');
  const sl = product('Overlord of the Hauntwoods - Borderless', 'Secret Lair Drop Series', 'sl');
  const viaSl = one({ tcg: { product_id: 1, group_id: 20, group_name: 'Secret Lair Drop Series', name: 'Overlord of the Hauntwoods (Borderless)' }, routeCandidates: [sl] });
  assert.notEqual(viaSl.via, 'route');
  const misc = product('Overlord of the Hauntwoods - Borderless', 'Unique & Misc. Promos', 'misc');
  const series = one({ tcg: { product_id: 1, group_id: 30, group_name: 'Secret Lair Series', name: 'Overlord of the Hauntwoods (Borderless)' }, routeCandidates: [misc] });
  assert.notEqual(series.via, 'route');
});

test('an empty catalog changes nothing: today\'s matcher answers', () => {
  const r = one({ tcg: null, routeCandidates: [], candidates: [plain] });
  assert.equal(r.status, 'auto');
  assert.equal(r.product, plain);
  assert.equal(r.via, 'match');
});

test('a 4c match the name ranks as another finish is still first and scored in Change\'s list', () => {
  const pillage = product('Pillage - Arena 2000', 'Unique & Misc. Promos', 'pillage');
  const r = one({
    line: { id: 'l2', name: 'Pillage', set_code: 'PAL00', collector_number: '1', finish: 'foil', treatments: [], tcgplayer_id: '2' },
    set: { code: 'pal00', name: 'Arena League 2000' },
    where: { category: 'Unique & Misc. Promos', how: 'staff' },
    card: { finishes: ['foil'] },
    candidates: [pillage],
    tcg: { product_id: 2, group_id: 40, group_name: 'Arena Promos', name: 'Pillage' },
    routeCandidates: [pillage],
  });
  assert.equal(r.product, pillage);
  assert.equal(r.ranked[0].product, pillage);
  assert.notEqual(r.ranked[0].score, null);
});
