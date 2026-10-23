import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryFor, chooseProduct, evidenceTreatments, expectedFoilKind, expectedName, extraWords, fold, promoKind, readVariant,
  linkToSave, ruleGuesses, searchCategories, usableLink, wordFamilies,
} from '../src/lib/ccMatch.js';
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

test('The List and Mystery Booster are one shelf: either searches both, its own first', () => {
  const shelf = cats('The List', 'Mystery Booster', 'Mystery Booster 2', 'Zendikar');
  assert.deepEqual(searchCategories('The List', shelf), ['The List', 'Mystery Booster']);
  assert.deepEqual(searchCategories('Mystery Booster', shelf), ['Mystery Booster', 'The List']);
  assert.deepEqual(searchCategories('Mystery Booster 2', shelf), ['Mystery Booster 2']);
  assert.deepEqual(searchCategories('Zendikar', shelf), ['Zendikar']);
  assert.deepEqual(searchCategories('The List', cats('The List')), ['The List']);   // no Mystery Booster in the inventory
  assert.deepEqual(searchCategories(null, shelf), [null]);
  // Mystery Booster's retail foils are Mystery Booster's.
  const foils = { code: 'fmb1', name: 'Mystery Booster Retail Edition Foils', set_type: 'masters' };
  assert.deepEqual(categoryFor({ set: foils, categories: shelf, setMap: new Map() }), { category: 'Mystery Booster', how: 'rule' });
});

test("a List card filed under Mystery Booster matches it; one in both stays in its own category", () => {
  const monument = line({ name: 'Eldrazi Monument', set_code: 'PLST', collector_number: 'CMA-216' });
  const mb = product('Eldrazi Monument', 'Mystery Booster');
  const only = chooseProduct(monument, [mb], { home: 'The List' });
  assert.equal(only.status, 'auto');
  assert.equal(only.product.category, 'Mystery Booster');
  // In both: The List's own product wins, named as CC names it or plain.
  for (const own of [product('Eldrazi Monument - The List', 'The List'), product('Eldrazi Monument', 'The List')]) {
    const both = chooseProduct(monument, [mb, own], { home: 'The List' });
    assert.equal(both.status, 'auto', own.product_name);
    assert.equal(both.product.category, 'The List');
  }
  // A Mystery Booster card: its own product, over The List's.
  const absorb = line({ name: 'Absorb Vis', set_code: 'MB1', collector_number: '126' });
  const pick = chooseProduct(absorb, [product('Absorb Vis - The List', 'The List'), product('Absorb Vis', 'Mystery Booster')],
    { home: 'Mystery Booster' });
  assert.equal(pick.product.category, 'Mystery Booster');
  // Foil still has to be foil.
  assert.equal(chooseProduct({ ...monument, finish: 'foil' }, [mb], { home: 'The List' }).status, 'choose');
});

// ---------------------------------------------------------------- never guess (decisions 484–485)
// The two reported mistakes (MATCHING.md 1.1), with the products' names as the inventory has them.

const WOT = 'Wilds of Eldraine: Enchanting Tales';
const BONDS = ['Polluted Bonds', 'Polluted Bonds - Anime Borderless', 'Polluted Bonds - Confetti Foil - Anime Borderless',
  'Polluted Bonds - Foil', 'Polluted Bonds - Foil - Anime Borderless'].map((n) => product(n, WOT));
const LTR = 'The Lord of the Rings: Tales of Middle-earth';
const TOM = ['Tom Bombadil', 'Tom Bombadil - Borderless Poster', 'Tom Bombadil - Borderless Poster (Serialized)', 'Tom Bombadil - Foil',
  'Tom Bombadil - Foil - Borderless Poster', 'Tom Bombadil - Foil - Showcase', 'Tom Bombadil - Foil - Showcase Scrolls',
  'Tom Bombadil - Showcase', 'Tom Bombadil - Showcase Scrolls', 'Tom Bombadil - Surge Foil - Showcase'].map((n) => product(n, LTR));
const names = (pick) => pick.ranked.filter((r) => r.score != null).map((r) => r.product.product_name);

test('Polluted Bonds (WOT) 34: the plain and the Anime products are a choice, the plain one listed first', () => {
  for (const finish of ['foil', 'nonfoil']) {
    const pick = chooseProduct(line({ name: 'Polluted Bonds', set_code: 'WOT', collector_number: '34', finish, treatments: ['borderless', 'showcase'] }), BONDS);
    assert.equal(pick.status, 'choose', finish);
    const order = names(pick);
    assert.ok(order.indexOf(finish === 'foil' ? 'Polluted Bonds - Foil' : 'Polluted Bonds')
      < order.indexOf(finish === 'foil' ? 'Polluted Bonds - Foil - Anime Borderless' : 'Polluted Bonds - Anime Borderless'), finish);
  }
});

test('Tom Bombadil (LTR): Showcase beside Showcase Scrolls is a choice, unless the card says which', () => {
  const tom = (over) => line({ name: 'Tom Bombadil', set_code: 'LTR', ...over });
  // Without the card's Scryfall facts: "Scrolls" is an extra word, and the two can't be told apart.
  assert.equal(chooseProduct(tom({ collector_number: '685', treatments: ['showcase'] }), TOM).status, 'choose');
  assert.equal(chooseProduct(tom({ collector_number: '685', finish: 'foil', treatments: ['showcase'] }), TOM).status, 'choose');
  assert.equal(chooseProduct(tom({ collector_number: '331', treatments: ['borderless', 'showcase'] }), TOM).status, 'choose');
  // Scryfall says 685 is a scroll: that settles it.
  const scroll = chooseProduct(tom({ collector_number: '685', treatments: ['showcase', 'scroll'] }), TOM);
  assert.equal(scroll.status, 'auto');
  assert.equal(scroll.product.product_name, 'Tom Bombadil - Showcase Scrolls');
  assert.equal(scroll.expected, 'Tom Bombadil - Showcase Scrolls');
  assert.equal(chooseProduct(tom({ collector_number: '685', finish: 'foil', treatments: ['showcase', 'scroll'] }), TOM)
    .product.product_name, 'Tom Bombadil - Foil - Showcase Scrolls');
  // No scroll tag proves nothing (Scryfall may lack it): 331 stays a choice, and so does a lone scroll product.
  assert.equal(chooseProduct(tom({ collector_number: '331', treatments: ['borderless', 'showcase'] }), TOM).status, 'choose');
  assert.equal(chooseProduct(tom({ collector_number: '331', treatments: ['showcase'] }),
    [product('Tom Bombadil - Showcase Scrolls', LTR)]).status, 'choose');
});

test('the Scryfall facts behind the evidence families', () => {
  assert.deepEqual(evidenceTreatments({ promo_types: ['scroll'], frame: '2015', border_color: 'black', released_at: '2023-06-23' }), ['scroll']);
  assert.deepEqual(evidenceTreatments({ promo_types: ['poster'], frame: '2015', border_color: 'borderless', released_at: '2023-06-23' }), ['poster']);
  // Mystery Booster 2's reprints in an old look; the originals are just their set.
  assert.deepEqual(evidenceTreatments({ frame: 'future', border_color: 'black', released_at: '2024-08-02' }), ['futureframe']);
  assert.deepEqual(evidenceTreatments({ frame: '1997', border_color: 'white', released_at: '2024-08-02' }), ['whiteborder']);
  assert.deepEqual(evidenceTreatments({ frame: 'future', border_color: 'black', released_at: '2007-05-04' }), []);
  assert.deepEqual(evidenceTreatments({ frame: '1993', border_color: 'white', released_at: '1995-04-01' }), []);
  assert.deepEqual(evidenceTreatments(null), []);
  // Read on a product only with the card's facts.
  assert.deepEqual(wordFamilies('Showcase Scrolls'), ['showcase']);
  assert.deepEqual(extraWords('Showcase Scrolls'), ['Scrolls']);
  assert.deepEqual(wordFamilies('Showcase Scrolls', { evidence: true }), ['showcase', 'scroll']);
  assert.deepEqual(extraWords('Showcase Scrolls', { evidence: true }), []);
  assert.deepEqual(extraWords('Anime Borderless'), ['Anime']);
  assert.deepEqual(extraWords('Japanese Alternate Art'), []);
  assert.deepEqual(wordFamilies('Retro Schematic'), []);
  assert.deepEqual(readVariant(product('X (A)', 'Fallen Empires'), line({})).extra, ['A']);
});

test('an extra word on our own trait, or a word with no family, is never guessed past', () => {
  const at = (list, over) => chooseProduct(line({ name: 'X', ...over }), list.map((n) => product(n, 'March of the Machine')));
  assert.equal(at(['X', 'X - Borderless Manga'], { treatments: ['borderless'] }).status, 'choose');
  assert.equal(at(['X - Showcase', 'X - Showcase Scrolls'], { treatments: ['showcase'] }).status, 'choose');
  assert.equal(at(['X - Theme Booster Exclusive'], {}).status, 'choose');   // alone, but CC may not carry ours
  assert.equal(at(['X', 'X (A)'], {}).status, 'choose');   // a bracket that isn't ours reads as an extra word
  // Fallen Empires' arts: the plain name was never certain.
  const thrull = ['Armor Thrull', 'Armor Thrull (Kirschner)', 'Armor Thrull (Menges)', 'Armor Thrull (Spencer)'].map((n) => product(n, 'Fallen Empires'));
  assert.equal(chooseProduct(line({ name: 'Armor Thrull', set_code: 'FEM', collector_number: '33b' }), thrull).status, 'choose');
  // A word with no family on a rival blocks the exact name.
  const glass = ['Ratchet - Foil', 'Ratchet - Foil - Shattered Glass'].map((n) => product(n, 'Transformers'));
  assert.equal(chooseProduct(line({ name: 'Ratchet', finish: 'foil' }), glass).status, 'choose');
});

test('what the evidence settles stays automatic', () => {
  // A plain card's product beside a special foil of the same words and a showcase.
  const rat = ['Ratadrabik of Urborg - Foil', 'Ratadrabik of Urborg - Foil - Showcase', 'Ratadrabik of Urborg - Textured Foil']
    .map((n) => product(n, 'Dominaria United'));
  const textured = chooseProduct(line({ name: 'Ratadrabik of Urborg', finish: 'foil', treatments: ['showcase', 'textured'] }), rat);
  assert.equal(textured.status, 'auto');
  assert.equal(textured.product.product_name, 'Ratadrabik of Urborg - Textured Foil');
  // Surge foil over plain foil, both borderless.
  const cecil = ['Cecil - Foil - Borderless', 'Cecil - Surge Foil - Borderless'].map((n) => product(n, 'Final Fantasy'));
  assert.equal(chooseProduct(line({ name: 'Cecil', finish: 'foil', treatments: ['borderless', 'surgefoil'] }), cecil).product.product_name,
    'Cecil - Surge Foil - Borderless');
  // The List: a set code that isn't our number's prefix is another printing.
  const boots = ['Swiftfoot Boots - The List', 'Swiftfoot Boots (M12) - The List'].map((n) => product(n, 'The List'));
  const b = chooseProduct(line({ name: 'Swiftfoot Boots', set_code: 'PLST', collector_number: 'A25-234' }), boots);
  assert.equal(b.status, 'auto');
  assert.equal(b.product.product_name, 'Swiftfoot Boots - The List');
  assert.equal(chooseProduct(line({ name: 'Serra Ascendant', set_code: 'PLST', collector_number: 'M11-28' }),
    [product('Serra Ascendant (PAGL) - The List', 'The List')]).status, 'choose');
  // A Japanese card: a product without a Japanese word is another printing.
  const jp = ['X', 'X - Japanese Alternate Art'].map((n) => product(n, 'Strixhaven Mystical Archive'));
  assert.equal(chooseProduct(line({ name: 'X', lang: 'ja', treatments: ['japanese'] }), jp).product.product_name, 'X - Japanese Alternate Art');
  // The fullest of nested words: plain ⊂ Showcase for a borderless showcase card.
  const beorn = ['Beorn - Showcase', 'Beorn'].map((n) => product(n, 'The Hobbit'));
  assert.equal(chooseProduct(line({ name: 'Beorn', treatments: ['borderless', 'showcase'] }), beorn).product.product_name, 'Beorn - Showcase');
});

test('only a person\'s pick is remembered, and only a person\'s pick is used', () => {
  assert.equal(usableLink({ source: 'staff' }), true);
  assert.equal(usableLink({ source: 'auto' }), false);
  assert.equal(usableLink(null), false);
  assert.equal(linkToSave('staff'), 'staff');
  assert.equal(linkToSave('match'), null);
  assert.equal(linkToSave('link'), null);
});

test('the exact name: accents, a front face, and the number only when it is ours', () => {
  const gloin = chooseProduct(line({ name: 'Glóin, Dwarf Emissary' }), [product('Gloin, Dwarf Emissary', LTR)]);
  assert.ok(gloin.ranked[0].reasons.includes('exact'));
  const emeritus = chooseProduct(line({ name: 'Emeritus of Ideation // Ancestral Recall', set_code: 'SOS' }),
    [product('Emeritus of Ideation', 'Secrets of Strixhaven')]);
  assert.equal(emeritus.expected, 'Emeritus of Ideation');
  assert.ok(emeritus.ranked[0].reasons.includes('exact'));
  const moria = chooseProduct(line({ name: 'Mines of Moria', set_code: 'LTR', collector_number: '257', finish: 'foil' }),
    ['Mines of Moria - Foil', 'Mines of Moria (0342) - Foil - Borderless'].map((n) => product(n, LTR)));
  assert.equal(moria.expected, 'Mines of Moria - Foil');
  assert.equal(moria.status, 'auto');
  assert.ok(moria.ranked[0].reasons.includes('exact'));
  // CC's own spelling of our number.
  assert.equal(chooseProduct(line({ name: 'Mines of Moria', set_code: 'LTR', collector_number: '342', finish: 'foil', treatments: ['borderless'] }),
    ['Mines of Moria - Foil', 'Mines of Moria (0342) - Foil - Borderless'].map((n) => product(n, LTR))).expected,
  'Mines of Moria (0342) - Foil - Borderless');
});
