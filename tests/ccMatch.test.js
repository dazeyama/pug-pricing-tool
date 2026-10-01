import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryFor, chooseProduct, expectedFoilKind, expectedName, fold, promoKind, ruleGuesses } from '../src/lib/ccMatch.js';
import { parseProductName } from '../src/lib/ccNames.js';

// Hand-made fixtures following the store's inventory patterns (export spec
// 3.3–3.4, Appendix A); never the real file.

const cats = (...names) => new Map(names.map((n) => [fold(n), n]));
const CATEGORIES = cats('March of the Machine', 'Secret Lair Drop Series', 'Avatar: The Last Airbender: Eternal-Legal',
  'Teenage Mutant Ninja Turtles Eternal-Legal', 'Unlimited', 'Pre-Release Promos', 'Promo Pack: Core Set 2020',
  'Commander: Duskmourn: House of Horror', 'Commander: Universes Beyond: Doctor Who', 'Throne of Eldraine', 'The List');

const product = (name, category, id = name) => {
  const p = parseProductName(name);
  return { product_id: id, product_name: name, category, base_key: p.baseKey, bracket: p.bracket, foil_kind: p.foilKind, variants: p.variants };
};
const line = (over) => ({ name: 'X', set_code: 'MOM', collector_number: '1', finish: 'nonfoil', treatments: [], ...over });

test('sets to categories: same name, rules, promo kinds, staff choices', () => {
  const at = (set, promo = '', setMap = new Map(), parent = null) => categoryFor({ set, parent, promo, categories: CATEGORIES, setMap });
  assert.deepEqual(at({ code: 'mom', name: 'March of the Machine' }), { category: 'March of the Machine', how: 'name' });
  assert.equal(at({ code: 'sld', name: 'Secret Lair Drop' }).category, 'Secret Lair Drop Series');
  assert.equal(at({ code: 'tle', name: 'Avatar: The Last Airbender Eternal' }).category, 'Avatar: The Last Airbender: Eternal-Legal');
  assert.equal(at({ code: 'tmc', name: 'Teenage Mutant Ninja Turtles Eternal' }).category, 'Teenage Mutant Ninja Turtles Eternal-Legal');
  assert.equal(at({ code: '2ed', name: 'Unlimited Edition' }).category, 'Unlimited');
  assert.equal(at({ code: 'dsc', name: 'Duskmourn: House of Horror Commander', set_type: 'commander' }).category, 'Commander: Duskmourn: House of Horror');
  assert.equal(at({ code: 'who', name: 'Doctor Who', set_type: 'commander' }).category, 'Commander: Universes Beyond: Doctor Who');
  // A Commander deck named after its main set in full.
  const withNcc = cats('Commander: Streets of New Capenna');
  assert.equal(categoryFor({ set: { code: 'ncc', name: 'New Capenna Commander', set_type: 'commander' }, parent: { name: 'Streets of New Capenna' },
    categories: withNcc, setMap: new Map() }).category, 'Commander: Streets of New Capenna');
  assert.equal(at({ code: 'pm20', name: 'Core Set 2020 Promos' }, 'prerelease').category, 'Pre-Release Promos');
  assert.equal(at({ code: 'pm20', name: 'Core Set 2020 Promos' }, 'promopack', new Map(), { name: 'Core Set 2020' }).category, 'Promo Pack: Core Set 2020');
  assert.equal(at({ code: 'zzz', name: 'Nothing Like It' }), null);
  assert.deepEqual(at({ code: 'zzz', name: 'Nothing Like It' }, '', new Map([['zzz|', 'Unlimited']])), { category: 'Unlimited', how: 'staff' });
  // A staff choice whose category is gone falls through.
  assert.equal(at({ code: 'mom', name: 'March of the Machine' }, '', new Map([['mom|', 'Gone Set']])).how, 'name');
  assert.equal(promoKind(['prerelease', 'datestamped']), 'prerelease');
  assert.ok(ruleGuesses({ code: 'pip', name: 'Fallout' }).includes('Universes Beyond: Fallout'));
});

test('the expected name, in CC order', () => {
  assert.equal(expectedName(line({ name: 'Chrome Host Seedshark', finish: 'foil', treatments: ['extendedart'] })),
    'Chrome Host Seedshark - Foil - Extended Art');
  assert.equal(expectedName(line({ name: 'Fabricate', collector_number: '2090', finish: 'foil' }), { number: true }), 'Fabricate (2090) - Foil');
  assert.equal(expectedName(line({ name: 'Bolt', finish: 'foil', treatments: ['borderless', 'surgefoil'] })), 'Bolt - Surge Foil - Borderless');
  assert.equal(expectedName(line({ name: 'Voracious Hydra' }), { flavor: 'Aggro Amalgam' }), 'Aggro Amalgam - Voracious Hydra');
  assert.equal(expectedFoilKind('etched', []), 'Foil Etched');
  assert.equal(expectedFoilKind('nonfoil', ['surgefoil']), null);
});

const SEEDSHARK = ['Chrome Host Seedshark', 'Chrome Host Seedshark - Foil', 'Chrome Host Seedshark - Extended Art',
  'Chrome Host Seedshark - Foil - Extended Art'].map((n) => product(n, 'March of the Machine'));

test('Chrome Host Seedshark: each finish and treatment finds its one product', () => {
  const pick = (over) => chooseProduct(line({ name: 'Chrome Host Seedshark', ...over }), SEEDSHARK);
  assert.equal(pick({}).product.product_name, 'Chrome Host Seedshark');
  assert.equal(pick({ finish: 'foil' }).product.product_name, 'Chrome Host Seedshark - Foil');
  assert.equal(pick({ treatments: ['extendedart'] }).product.product_name, 'Chrome Host Seedshark - Extended Art');
  assert.equal(pick({ finish: 'foil', treatments: ['extendedart'] }).product.product_name, 'Chrome Host Seedshark - Foil - Extended Art');
});

test('Secret Lair: the collector number decides, and its Rainbow Foil is the foil', () => {
  const sld = ['Fabricate (332) - Borderless', 'Fabricate (332) - Foil  - Borderless', 'Fabricate (2090)', 'Fabricate (2090) - Rainbow Foil']
    .map((n) => product(n, 'Secret Lair Drop Series'));
  const nonfoil = chooseProduct(line({ name: 'Fabricate', set_code: 'SLD', collector_number: '2090', treatments: ['borderless'] }), sld);
  assert.equal(nonfoil.status, 'auto');
  assert.equal(nonfoil.product.product_name, 'Fabricate (2090)');
  const foil = chooseProduct(line({ name: 'Fabricate', set_code: 'SLD', collector_number: '2090', finish: 'foil', treatments: ['borderless'] }), sld);
  assert.equal(foil.product.product_name, 'Fabricate (2090) - Rainbow Foil');
  // An older, unnumbered drop of the same card doesn't compete with ours (Generous Gift #2088).
  const gift = ['Generous Gift - Borderless', 'Generous Gift - Foil - Borderless', 'Generous Gift (2088)', 'Generous Gift (2534)']
    .map((n) => product(n, 'Secret Lair Drop Series'));
  const g = chooseProduct(line({ name: 'Generous Gift', set_code: 'SLD', collector_number: '2088', treatments: ['borderless'] }), gift);
  assert.equal(g.status, 'auto');
  assert.equal(g.product.product_name, 'Generous Gift (2088)');
  const other = chooseProduct(line({ name: 'Fabricate', set_code: 'SLD', collector_number: '9999' }), sld);
  assert.equal(other.status, 'choose');   // candidates, none fits: staff decide
});

test('flavor names, showcase-only CC names, a double-faced card, nothing at all', () => {
  const tmnt = [product('Aggro Amalgam - Voracious Hydra', 'Teenage Mutant Ninja Turtles Eternal-Legal')];
  assert.equal(chooseProduct(line({ name: 'Voracious Hydra', set_code: 'TMC' }), tmnt, { flavor: 'Aggro Amalgam' }).status, 'auto');
  const avatar = [product('Deadly Rollick - Showcase', 'Avatar: The Last Airbender: Eternal-Legal')];
  assert.equal(chooseProduct(line({ name: 'Deadly Rollick', set_code: 'TLE', treatments: ['borderless', 'showcase'] }), avatar).status, 'auto');
  const eld = ['Brazen Borrower // Petty Theft', 'Brazen Borrower // Petty Theft - Foil', 'Brazen Borrower // Petty Theft - Showcase',
    'Brazen Borrower // Petty Theft - Foil - Showcase'].map((n) => product(n, 'Throne of Eldraine'));
  assert.equal(chooseProduct(line({ name: 'Brazen Borrower // Petty Theft', set_code: 'ELD', finish: 'foil', treatments: ['showcase'] }), eld)
    .product.product_name, 'Brazen Borrower // Petty Theft - Foil - Showcase');
  assert.equal(chooseProduct(line({ name: 'Nowhere Card' }), eld).status, 'none');
  // A flip card CC lists by its front.
  const sok = [product('Homura, Human Ascendant', 'Saviors of Kamigawa'), product('Homura, Human Ascendant - Foil', 'Saviors of Kamigawa')];
  assert.equal(chooseProduct(line({ name: 'Homura, Human Ascendant // Homura\'s Essence', set_code: 'SOK' }), sok).product.product_name,
    'Homura, Human Ascendant');
});

test('promo packs, prereleases, and two identical products are a choice', () => {
  const pack = [product('Sorin, Vampire Lord - Promo Pack', 'Promo Pack: Core Set 2020'), product('Sorin, Vampire Lord - Foil - Promo Pack', 'Promo Pack: Core Set 2020')];
  assert.equal(chooseProduct(line({ name: 'Sorin, Vampire Lord', treatments: ['promopack'] }), pack).product.product_name, 'Sorin, Vampire Lord - Promo Pack');
  const pre = [product('Lotus Bloom - Foil - Prerelease Promo', 'Pre-Release Promos')];
  assert.equal(chooseProduct(line({ name: 'Lotus Bloom', finish: 'foil', treatments: ['prerelease'] }), pre).status, 'auto');
  const twins = [product('Goblin Token', 'Tenth Edition', 'a'), product('Goblin Token', 'Tenth Edition', 'b')];
  assert.equal(chooseProduct(line({ name: 'Goblin Token' }), twins).status, 'choose');
});
