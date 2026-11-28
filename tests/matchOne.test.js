import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchOne } from '../src/lib/ccExport.js';
import { parseProductName } from '../src/lib/ccNames.js';
import { ccListPrintings, fold } from '../src/lib/ccMatch.js';

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

// Decision 607 (the owner, 2026-11-27): a Surge Foil matched to the plain foil when CC had its Surge Foil product.
// TCGplayer's product for a surge foil is often the plain card's (decision 316), so the route named the plain foil.
const SURGE_CAT = 'Final Fantasy';
const surgeCats = new Map([SURGE_CAT].map((c) => [fold(c), c]));
const cecilFoil = product('Cecil - Foil - Borderless', SURGE_CAT, 'foil');
const cecilSurge = product('Cecil - Surge Foil - Borderless', SURGE_CAT, 'surge');
const surgeOne = (candidates, over = {}) => matchOne({
  line: { id: 's1', name: 'Cecil', set_code: 'FIN', collector_number: '300', finish: 'foil', treatments: ['borderless', 'surgefoil'], tcgplayer_id: '5' },
  set: { code: 'fin', name: SURGE_CAT },
  promo: '',
  card: null,
  flavor: null,
  where: { category: SURGE_CAT, how: 'name' },
  also: [],
  link: null,
  linkedProduct: null,
  candidates,
  // TCGplayer's product is the plain card's, so the route names the plain foil.
  tcg: { product_id: 5, group_id: 50, group_name: SURGE_CAT, name: 'Cecil (Borderless)' },
  routeCandidates: candidates,
  categoryNamed: (n) => surgeCats.get(fold(n)) ?? null,
  table: { 50: [SURGE_CAT, SURGE_CAT, null, null] },
  ...over,
});

test('a Surge Foil (607): never the plain foil by the route; its Surge product when CC has one', () => {
  const r = surgeOne([cecilFoil, cecilSurge]);
  assert.equal(r.status, 'auto');
  assert.equal(r.product, cecilSurge);
  assert.equal(r.via, 'match');
});

test('a Surge Foil (607): no product with Surge in its name is Needs a choice, never the plain foil', () => {
  const r = surgeOne([cecilFoil]);
  assert.equal(r.status, 'choose');
  assert.equal(r.product, null);
  assert.ok(r.ranked.some((x) => x.product === cecilFoil));   // offered to pick by hand
  // The name matcher alone (no TCGplayer product) the same.
  assert.equal(surgeOne([cecilFoil], { tcg: null, routeCandidates: [] }).status, 'choose');
  // Nothing under its name at all stays Can't upload, as before.
  assert.equal(surgeOne([], { tcg: null, routeCandidates: [] }).status, 'none');
});

test('a Surge Foil (607): found only by TCGplayer, its plain foil, is Needs a choice, not Can\'t upload', () => {
  // The owner, after the release review: "Yes, Needs a choice". The matcher found nothing under the card's name.
  const cecilPlain = product('Cecil - Borderless', SURGE_CAT, 'plain');
  const r = surgeOne([], { routeCandidates: [cecilFoil, cecilPlain] });
  assert.equal(r.status, 'choose');
  assert.equal(r.product, null);
  assert.equal(r.via, null);
  // The route's product first, then its other candidates, unscored: offered, never the app's own match.
  assert.deepEqual(r.ranked.map((x) => [x.product, x.score]), [[cecilFoil, null], [cecilPlain, null]]);
  // A plain foil found the same way is still the route's match.
  const foil = surgeOne([], { routeCandidates: [cecilFoil], line: { id: 's4', name: 'Cecil', set_code: 'FIN', collector_number: '300', finish: 'foil', treatments: ['borderless'], tcgplayer_id: '5' } });
  assert.equal(foil.status, 'auto');
  assert.equal(foil.via, 'route');
});

test('a Surge Foil (607): a remembered pick wins, plain foil or not; other foils and the non-foil copy as before', () => {
  const r = surgeOne([cecilFoil], { link: { product_id: 'foil', source: 'staff' }, linkedProduct: cecilFoil });
  assert.equal(r.status, 'auto');
  assert.equal(r.product, cecilFoil);
  assert.equal(r.via, 'link');
  // A plain foil: the route's plain foil product, as before.
  const foil = surgeOne([cecilFoil], { line: { id: 's2', name: 'Cecil', set_code: 'FIN', collector_number: '300', finish: 'foil', treatments: ['borderless'], tcgplayer_id: '5' } });
  assert.equal(foil.status, 'auto');
  assert.equal(foil.product, cecilFoil);
  // The non-foil copy of a printing whose foil is surge (decision 326) isn't a Surge Foil.
  const cecil = product('Cecil - Borderless', SURGE_CAT, 'nonfoil');
  const nonfoil = surgeOne([cecil], { line: { id: 's3', name: 'Cecil', set_code: 'FIN', collector_number: '300', finish: 'nonfoil', treatments: ['borderless', 'surgefoil'], tcgplayer_id: '5' } });
  assert.equal(nonfoil.status, 'auto');
  assert.equal(nonfoil.product, cecil);
});

// Decision 599: a The List card with more than one The List printing, in CC or on TCGplayer, is staff's to pick.
const LIST = 'The List';
const listCats = new Map([LIST, 'Mystery Booster'].map((c) => [fold(c), c]));
const LIST_TABLE = { ...TABLE, 2715: ['The List Reprints', LIST, 'thelist', null] };
const listOne = (name, products, over = {}) => matchOne({
  line: { id: 'l9', name, set_code: 'PLST', collector_number: '2XM-1', finish: 'nonfoil', treatments: [], tcgplayer_id: null },
  set: { code: 'plst', name: LIST },
  promo: '',
  card: null,
  flavor: null,
  where: { category: LIST, how: 'rule' },
  also: ['Mystery Booster'],
  link: null,
  linkedProduct: null,
  candidates: products,
  tcg: null,
  routeCandidates: [],
  categoryNamed: (n) => listCats.get(fold(n)) ?? null,
  table: LIST_TABLE,
  ...over,
});

test('The List (599): one printing in CC and on TCGplayer matches as before; a foil of it is the same printing', () => {
  const abrade = product('Abrade - The List', LIST, 'abrade');
  assert.equal(listOne('Abrade', [abrade]).status, 'auto');
  assert.equal(listOne('Abrade', [abrade, product('Abrade - Foil - The List', LIST, 'abrade-foil')]).status, 'auto');
  assert.equal(listOne('Abrade', [abrade], { tcgListPrintings: 1 }).status, 'auto');
});

test('The List (599): two printings in CC, or two on TCGplayer, go to Needs a choice', () => {
  const bolts = [product('Lightning Bolt (001) - The List', LIST, 'b1'), product('Lightning Bolt (141) - The List', LIST, 'b2')];
  const two = listOne('Lightning Bolt', bolts);
  assert.equal(two.status, 'choose');
  assert.equal(two.product, null);
  assert.equal(two.ranked.length, 2, 'Change still offers them');
  const abrade = product('Abrade - The List', LIST, 'abrade');
  assert.equal(listOne('Abrade', [abrade], { tcgListPrintings: 2 }).status, 'choose');
});

test('The List (599): no product under its own name but several TCGplayer printings is a choice, not Can\'t upload', () => {
  const none = listOne('Demonic Tutor', [], { tcgListPrintings: 2 });
  assert.equal(none.status, 'choose');
  assert.equal(none.product, null);
  assert.equal(none.ranked.length, 0);   // the search is there
  // Products found by TCGplayer's name are offered, unscored.
  const tutor = product('Demonic Tutor - The List', LIST, 'dt');
  const offered = listOne('Demonic Tutor', [], { tcgListPrintings: 2, routeCandidates: [tutor, tutor] });
  assert.deepEqual(offered.ranked.map((x) => [x.product.product_id, x.score]), [['dt', null]]);
  // One printing on TCGplayer and none in CC: Can't upload, as before.
  assert.equal(listOne('Demonic Tutor', [], { tcgListPrintings: 1 }).status, 'none');
});

test('The List (599): a remembered pick wins; Mystery Booster\'s products aren\'t The List printings', () => {
  const bolts = [product('Lightning Bolt (001) - The List', LIST, 'b1'), product('Lightning Bolt (141) - The List', LIST, 'b2')];
  const r = listOne('Lightning Bolt', bolts, { link: { product_id: 'b2', source: 'staff' }, linkedProduct: bolts[1] });
  assert.equal(r.status, 'auto');
  assert.equal(r.via, 'link');
  const abrade = product('Abrade - The List', LIST, 'abrade');
  assert.equal(ccListPrintings([abrade, product('Abrade', 'Mystery Booster', 'abrade-mb')]), 1);
  assert.equal(ccListPrintings([abrade, abrade]), 1, 'a product met twice (both reads) is one');
});

test('The List (599): by its TCGplayer set too, and the route doesn\'t answer for it; other cards are left alone', () => {
  const bolts = [product('Lightning Bolt (001) - The List', LIST, 'b1'), product('Lightning Bolt (141) - The List', LIST, 'b2')];
  const tcg = { product_id: 9, group_id: 2715, group_name: 'The List Reprints', name: 'Lightning Bolt (E01)' };
  // Its Scryfall set isn't The List, but its TCGplayer product is.
  const arch = product('Lightning Bolt', 'Archenemy: Nicol Bolas', 'arch');
  const viaTcg = listOne('Lightning Bolt', [arch], {
    set: { code: 'e01', name: 'Archenemy: Nicol Bolas' }, where: { category: 'Archenemy: Nicol Bolas', how: 'name' },
    also: [], tcg, routeCandidates: bolts,
  });
  assert.equal(viaTcg.status, 'choose');
  assert.notEqual(viaTcg.via, 'route');
  // A Duskmourn card whose name CC also has twice on The List: not a The List card, matched as before.
  assert.equal(one({ routeCandidates: [plain, borderless, ...bolts], tcgListPrintings: 3 }).status, 'auto');
});
