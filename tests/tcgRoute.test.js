import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTp, routeBaseKeys, routeProduct, setPlace } from '../src/lib/tcgRoute.js';
import { parseProductName } from '../src/lib/ccNames.js';
import { fold } from '../src/lib/ccMatch.js';
import { TCG_SET_TABLE } from '../src/lib/tcgSetTable.js';

// Decision 588's phase 3 (decision 590): the TCGplayer route. Hand-made products in CC's patterns; never the real file.
const product = (name, category, id = `${category}|${name}`) => {
  const p = parseProductName(name);
  return { product_id: id, product_name: name, category, base_key: p.baseKey, bracket: p.bracket, foil_kind: p.foilKind, variants: p.variants };
};
const CATS = ['Duskmourn: House of Horror', 'Pre-Release Promos', 'Prerelease Promo: Bloomburrow', 'The List',
  'Mystery Booster', 'Unique & Misc. Promos', 'Brand New Set'];
const catMap = new Map(CATS.map((c) => [fold(c), c]));
const categoryNamed = (n) => catMap.get(fold(n)) ?? null;
const TABLE = {
  10: ['Duskmourn: House of Horror', 'Duskmourn: House of Horror', null, null],
  20: ['Prerelease Cards', 'Pre-Release Promos', 'prereleasepromo', ['Prerelease Promo: Bloomburrow']],
  30: ['The List Reprints', 'The List', 'thelist', null],
  40: ['Collector\'s Edition', null, null, null],
};
const route = (line, tcg, candidates) => routeProduct({
  line: { finish: 'nonfoil', ...line }, tcg: { group_id: 10, number: null, ...tcg }, candidates, table: TABLE, categoryNamed,
});

test('TCGplayer\'s name read: base, number, its own foil word, tags', () => {
  assert.deepEqual(parseTp('Avatar of Burgeoning Echoes (Showcase)'),
    { full: 'avatar of burgeoning echoes', base: 'avatar of burgeoning echoes', number: null, foil: null, tags: ['showcase'], codes: [], flavor: null });
  assert.deepEqual(parseTp('Sol Ring (0348) (Surge Foil) (JP Alternate Art)'),
    { full: 'sol ring', base: 'sol ring', number: '348', foil: 'surgefoil', tags: ['japanesealternateart'], codes: [], flavor: null });
  assert.deepEqual(parseTp('Godzilla, Doom Inevitable - Yidaro, Wandering Monster').flavor,
    { base: 'godzilla, doom inevitable', card: 'yidarowanderingmonster' });
  assert.deepEqual(routeBaseKeys({ name: 'Fire // Ice (Non-Foil)' }), ['fire // ice', 'fire']);
});

test('a set\'s place: its row, not carried, or a CC category of its own name for a set the table hasn\'t met', () => {
  assert.equal(setPlace(10, 'x', TABLE, categoryNamed).category, 'Duskmourn: House of Horror');
  assert.deepEqual(setPlace(40, 'Collector\'s Edition', TABLE, categoryNamed), { category: null, extra: null, more: [], carried: false });
  assert.equal(setPlace(99, 'Brand New Set', TABLE, categoryNamed).category, 'Brand New Set');
  assert.equal(setPlace(98, 'Nothing Like It', TABLE, categoryNamed).carried, false);
});

test('one product of TCGplayer\'s name, finish and tags in the set\'s category is the answer', () => {
  const plain = product('Overlord of the Hauntwoods', 'Duskmourn: House of Horror');
  const foil = product('Overlord of the Hauntwoods - Foil', 'Duskmourn: House of Horror');
  const other = product('Overlord of the Hauntwoods', 'The List');
  const r = route({}, { name: 'Overlord of the Hauntwoods' }, [plain, foil, other]);
  assert.equal(r.status, 'auto');
  assert.equal(r.product, plain);
  assert.equal(route({ finish: 'foil' }, { name: 'Overlord of the Hauntwoods' }, [plain, foil, other]).product, foil);
});

test('no answer: not in the catalog, a set not carried, nothing of that name, several alike', () => {
  assert.equal(routeProduct({ line: { finish: 'nonfoil' }, tcg: null, candidates: [], table: TABLE, categoryNamed }).status, 'none');
  assert.equal(route({}, { group_id: 40, name: 'Black Lotus' }, [product('Black Lotus', 'Unique & Misc. Promos')]).why, 'set not carried');
  assert.equal(route({}, { name: 'Missing' }, []).why, 'no product of that name and finish');
  const twins = [product('Twin', 'Duskmourn: House of Horror', 'a'), product('Twin', 'Duskmourn: House of Horror', 'b')];
  assert.equal(route({}, { name: 'Twin' }, twins).why, 'several alike');
});

test('a numbered product whose tags match isn\'t dropped when TCGplayer\'s name has no number (decision 590, fix 1)', () => {
  const numbered = product('Avatar of Burgeoning Echoes (0348) - Showcase', 'Duskmourn: House of Horror');
  const plain = product('Avatar of Burgeoning Echoes', 'Duskmourn: House of Horror');
  const r = route({}, { name: 'Avatar of Burgeoning Echoes (Showcase)' }, [numbered, plain]);
  assert.equal(r.status, 'auto');
  assert.equal(r.product, numbered);
  // TCGplayer's number picks its own.
  const n2 = product('Avatar of Burgeoning Echoes (0349) - Showcase', 'Duskmourn: House of Horror');
  assert.equal(route({}, { name: 'Avatar of Burgeoning Echoes (349) (Showcase)' }, [numbered, n2, plain]).product, n2);
});

test('a lone product whose tags disagree is no answer (decision 590, fix 2)', () => {
  const manga = product('Fear of Missing Out - Borderless Manga', 'Duskmourn: House of Horror');
  const r = route({}, { name: 'Fear of Missing Out (Borderless)' }, [manga]);
  assert.equal(r.status, 'none');
  assert.equal(r.why, 'tags differ');
});

test('the set\'s extra word: TCGplayer\'s one Prerelease Cards set reaches CC\'s per-set categories', () => {
  const pre = product('Season of Loss - Prerelease Promo - Foil', 'Prerelease Promo: Bloomburrow');
  const r = route({ finish: 'foil' }, { group_id: 20, name: 'Season of Loss' }, [pre]);
  assert.equal(r.status, 'auto');
  assert.equal(r.product, pre);
  assert.equal(r.category, 'Prerelease Promo: Bloomburrow');
});

test('The List and Mystery Booster are one shelf', () => {
  const mb = product('Eldrazi Monument - The List', 'Mystery Booster');
  const r = route({}, { group_id: 30, name: 'Eldrazi Monument' }, [mb]);
  assert.equal(r.product, mb);
});

test('4a: CC\'s bracket words are tags; set codes count only when both names carry one', () => {
  const coaster = [product('Kiddie Coaster (3-4-6)', 'Duskmourn: House of Horror'), product('Kiddie Coaster (2-5-6)', 'Duskmourn: House of Horror')];
  assert.equal(route({}, { name: 'Kiddie Coaster (2-5-6)' }, coaster).product, coaster[1]);
  const maro = [product("Maro's Gone Nuts", 'Duskmourn: House of Horror'), product("Maro's Gone Nuts (No PW Symbol)", 'Duskmourn: House of Horror')];
  assert.equal(route({}, { name: "Maro's Gone Nuts" }, maro).product, maro[0]);
  assert.equal(route({}, { name: "Maro's Gone Nuts (No PW Symbol)" }, maro).product, maro[1]);
  // Alliances' "(Man)" is CC's "(Male)".
  const herbalist = [product('Royal Herbalist (Male)', 'Duskmourn: House of Horror'), product('Royal Herbalist (Female)', 'Duskmourn: House of Horror')];
  assert.equal(route({}, { name: 'Royal Herbalist (Man)' }, herbalist).product, herbalist[0]);
  // A set code: matched to CC's when it has one, ignored when it hasn't.
  const coded = [product('Blooming Marsh (KLD)', 'Duskmourn: House of Horror'), product('Blooming Marsh (AER)', 'Duskmourn: House of Horror')];
  assert.equal(route({}, { name: 'Blooming Marsh (KLD)' }, coded).product, coded[0]);
  const plain = [product('Island (30)', 'Duskmourn: House of Horror')];
  assert.equal(route({}, { name: 'Island (030) (JVC)' }, plain).product, plain[0]);
  assert.deepEqual(parseTp('Sol Ring (C14)').codes, ['c14']);
});

test('4b: a plain TCGplayer name takes CC\'s one product whose extra words are all promo words, never a treatment', () => {
  const fnm = [product('Wall of Roots - Foil FNM 2008', 'Duskmourn: House of Horror')];
  const fnmTable = { ...TABLE, 70: ['FNM Promos', 'Duskmourn: House of Horror', null, null] };
  assert.equal(routeProduct({ line: { finish: 'foil' }, tcg: { group_id: 70, name: 'Wall of Roots' }, candidates: fnm, table: fnmTable, categoryNamed }).product, fnm[0]);
  const deck = [product('Avenger of Zendikar - Theme Deck Exclusive', 'Duskmourn: House of Horror')];
  assert.equal(route({}, { name: 'Avenger of Zendikar' }, deck).product, deck[0]);
  // Two promo products: no answer.
  const two = [product('Abrade - Game Day Promo', 'Duskmourn: House of Horror'), product('Abrade - Store Championship Promo', 'Duskmourn: House of Horror')];
  assert.equal(route({}, { name: 'Abrade' }, two).status, 'none');
  // A treatment is never a promo word.
  const manga = [product('Fear of Missing Out - Borderless Manga', 'Duskmourn: House of Horror')];
  assert.equal(route({}, { name: 'Fear of Missing Out' }, manga).status, 'none');
});

test('4c: a foil-only printing takes a promo\'s product named without "Foil", in a promo category only', () => {
  const promoTable = { ...TABLE, 50: ['Arena Promos', 'Unique & Misc. Promos', null, null] };
  const r = (line, tcg, c) => routeProduct({ line, tcg: { group_id: 50, group_name: 'Arena Promos', ...tcg }, candidates: c, table: promoTable, categoryNamed });
  const pillage = [product('Pillage - Arena 2000', 'Unique & Misc. Promos')];
  assert.equal(r({ finish: 'foil', finishes: ['foil'] }, { name: 'Pillage' }, pillage).product, pillage[0]);
  // Not when the printing comes in non-foil too, nor without its finishes.
  assert.equal(r({ finish: 'foil', finishes: ['nonfoil', 'foil'] }, { name: 'Pillage' }, pillage).status, 'none');
  assert.equal(r({ finish: 'foil' }, { name: 'Pillage' }, pillage).status, 'none');
  // Not in a set's own category.
  const plain = [product('Overlord of the Hauntwoods', 'Duskmourn: House of Horror')];
  assert.equal(route({ finish: 'foil', finishes: ['foil'] }, { name: 'Overlord of the Hauntwoods' }, plain).status, 'none');
});

test('a promo naming another program isn\'t the card\'s (4b, 4c)', () => {
  const t = { ...TABLE, 60: ['Champs Promos', 'Unique & Misc. Promos', null, null], 61: ['Grand Prix Promos', 'Unique & Misc. Promos', null, null] };
  const gp = [product('Mutavault - Grand Prix Promo', 'Unique & Misc. Promos')];
  const r = (group, name) => routeProduct({ line: { finish: 'foil', finishes: ['foil'] }, tcg: { group_id: group, group_name: name, name: 'Mutavault' }, candidates: gp, table: t, categoryNamed });
  assert.equal(r(60, 'Champs Promos').status, 'none');
  assert.equal(r(61, 'Grand Prix Promos').product, gp[0]);
});

test('4d: "Flavor Name - Card Name" finds CC\'s product of the same two names, never the plain card', () => {
  const godzilla = product('Spacegodzilla, Death Corona - Void Beckoner - Foil', 'Duskmourn: House of Horror');
  const plain = product('Void Beckoner - Foil', 'Duskmourn: House of Horror');
  const name = 'Spacegodzilla, Death Corona - Void Beckoner';
  assert.ok(routeBaseKeys({ name }).includes('spacegodzilla, death corona'));
  assert.equal(route({ finish: 'foil' }, { name }, [godzilla, plain]).product, godzilla);
  assert.equal(route({ finish: 'foil' }, { name }, [plain]).status, 'none');
});

test('the set table in the code: by group id, the owner-checked rows', () => {
  const rows = Object.values(TCG_SET_TABLE);
  assert.ok(rows.length > 450);
  const byName = new Map(rows.map((r) => [r[0], r]));
  assert.equal(byName.get('Unlimited Edition')[1], 'Unlimited');
  assert.equal(byName.get("Collector's Edition")[1], null);
  assert.equal(byName.has('Oversize Cards'), false);
  assert.equal(byName.get('Prerelease Cards')[2], 'prereleasepromo');
});
