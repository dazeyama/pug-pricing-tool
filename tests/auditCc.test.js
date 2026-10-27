import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAMPLES, FIT_SHARE, TOKENS, applyRule, canShowMore, cardFacts, cardValues, declineRule, emptyPicks, examplesOf, groupUnits,
  inferRules, isDataFile, isPicksFile, moreExamples, nextStep, pickExamples, poolOf, progress, recordPick, recordSetChoice,
  settleGroup, skipUnit, tokenEquals, undoLast, wordToken,
} from '../src/lib/auditCc.js';

// Hand-made units in the data file's shape (decision 547), following the inventory's patterns: 30th Anniversary
// Edition's "Modern Frame" word, Unfinity's attraction-lights brackets, a lone "Planeswalker Deck Exclusive".

let ids = 0;
const product = (name, over = {}) => ({
  id: String(++ids), name, category: 'X', qty: 0, score: 0, reasons: [], foil_kind: null, bracket: null, variants: [],
  words: [], families: [], passes: true, left: true, leader: false, ...over,
});
const unit = (over) => ({
  key: `${over.scryfall_id ?? `id${++ids}`}|${over.finish ?? 'nonfoil'}`, scryfall_id: over.scryfall_id ?? `id${ids}`, finish: 'nonfoil',
  name: 'Card', set: 'tst', set_name: 'Test', set_type: 'expansion', collector_number: '1', lang: 'en', artist: 'Mark Poole',
  frame: '2015', border_color: 'black', frame_effects: [], promo_types: [], attraction_lights: [], full_art: false, textless: false,
  finishes: ['nonfoil'], treatments: [], evidence: [], category: 'X', how: 'name', cause: 'several products pass', pattern: 'x',
  expected: 'Card', anyStock: false, products: [], ...over,
});

/** A 30A-like set: modern cards whose only product carries "Modern Frame"; retro cards with both products. */
function thirtieth() {
  const units = [];
  for (let i = 1; i <= 6; i += 1) {
    units.push(unit({
      name: `Modern ${i}`, set: '30a', collector_number: String(i), frame: '2015', cause: 'one product, with a word the matcher can\'t read',
      products: [product(`Modern ${i} - Modern Frame`, { words: ['Modern Frame'], leader: true, score: -1 })],
    }));
    units.push(unit({
      name: `Retro ${i}`, set: '30a', collector_number: String(300 + i), frame: '1997', treatments: ['retro'], anyStock: i === 1,
      products: [
        product(`Retro ${i} - Retro Frame`, { leader: true, score: 103, reasons: ['exact'], families: ['retro'] }),
        product(`Retro ${i} - Modern Frame`, { words: ['Modern Frame'], score: -2 }),
      ],
    }));
  }
  return units;
}

/** Unfinity: six attraction products, the card's lights pick one. */
const attraction = (name, lights, number) => unit({
  name, set: 'unf', collector_number: number, attraction_lights: lights,
  products: ['2-3-6', '2-4-6', '2-5-6', '3-4-6', '3-5-6', '4-5-6'].map((b, i) => product(`${name} (${b})`, { bracket: b, words: [b], score: -4, leader: i === 0 })),
});

test('words become tokens: lights, a letter, a number, the artist, else the word itself', () => {
  const u = unit({ artist: 'Jeff A. Menges' });
  assert.equal(wordToken('2-3-6', u), TOKENS.lights);
  assert.equal(wordToken('A', u), TOKENS.letter);
  assert.equal(wordToken('083', u), TOKENS.number);
  assert.equal(wordToken('Menges', u), TOKENS.artist);
  assert.equal(wordToken('Modern Frame', u), 'modern frame');
  assert.equal(wordToken('Anime', u), 'anime');
});

test('the card\'s facts and values', () => {
  const u = unit({ frame: '1997', border_color: 'borderless', frame_effects: ['showcase'], promo_types: ['planeswalkerdeck'], collector_number: '219c', attraction_lights: [2, 5, 6], artist: 'Marco Bucci' });
  const keys = cardFacts(u).map((f) => f.key);
  for (const k of ['frame=1997', 'border=borderless', 'effect=showcase', 'promo=planeswalkerdeck', 'lights', 'letter', 'lang=en', 'set=tst']) assert.ok(keys.includes(k), k);
  const values = Object.fromEntries(cardValues(u).map((v) => [v.kind, v.value]));
  assert.equal(values.lights, '2-5-6');
  assert.equal(values.letter, 'c');
  assert.equal(values.number, '219');
  assert.ok(cardValues(u).some((v) => v.kind === 'artist' && v.value === 'bucci'));
  assert.ok(tokenEquals(product('Card (2-5-6)', { words: ['2-5-6'] }), 'lights', u));
  assert.ok(!tokenEquals(product('Card (2-3-6)', { words: ['2-3-6'] }), 'lights', u));
  assert.ok(tokenEquals(product('Card (C)', { words: ['C'] }), 'letter', u));
  assert.ok(tokenEquals(product('Card - Foil (0219)', { words: ['0219'] }), 'number', u));
});

test('groups: word groups biggest first, look-alikes, then no product left; examples from different looks', () => {
  const units = [
    ...thirtieth(),
    attraction('Kiddie Coaster', [2, 5, 6], '219c'),
    unit({ name: 'Plain', products: [product('Plain', { leader: true }), product('Plain', { score: 0 })] }),   // a duplicate name: a look-alike
    unit({ name: 'Gone', cause: 'no product passes the checks', products: [product('Gone - Foil', { passes: false, left: false, foil_kind: 'Foil' })] }),
  ];
  const groups = groupUnits(units);
  assert.deepEqual(groups.map((g) => g.id), ['word:modern frame', `word:${TOKENS.lights}`, 'lookalike', 'none']);
  assert.equal(groups[0].display, 'Modern Frame');
  assert.equal(groups[0].units.length, 12);
  const byKey = new Map(units.map((u) => [u.key, u]));
  const examples = groups[0].examples;
  assert.equal(examples.length, 3);
  const frames = new Set(examples.map((k) => byKey.get(k).frame));
  assert.deepEqual([...frames].sort(), ['1997', '2015'], 'one example of each look');
  // In stock first within a look.
  assert.ok(examples.includes(units.find((u) => u.name === 'Retro 1').key));
  assert.equal(pickExamples(groups[1], byKey).length, 1);
  assert.equal(poolOf(units.at(-1)).length, 0);
});

/** The right pick for a 30A unit: a modern card takes the Modern Frame product, a retro card the one without it. */
const right30a = (u) => u.products.find((p) => (u.frame === '2015') === p.words.includes('Modern Frame')).id;
/** Pick each of these keys with `choose(unit)` (a product id, a found product row, or null for None). */
const pickAll = (picks, keys, byKey, choose) => keys.reduce((acc, key) => recordPick(acc, byKey.get(key), choose(byKey.get(key))), picks);

test('a fact rule inferred from the hand picks: "Modern Frame" means the 2015 frame, settling the whole group', () => {
  const units = thirtieth();
  const byKey = new Map(units.map((u) => [u.key, u]));
  const [group] = groupUnits(units);
  const picks = pickAll(emptyPicks({}), group.examples, byKey, right30a);
  const rules = inferRules(group, picks, byKey);
  assert.ok(rules.length >= 1);
  assert.deepEqual([rules[0].type, rules[0].fact, rules[0].yes, rules[0].no], ['fact', 'frame=2015', 'word', 'plain']);
  assert.deepEqual([rules[0].fits, rules[0].of, rules[0].misses.length], [3, 3, 0]);
  assert.equal(rules[0].settles, 12);
  assert.equal(rules[0].leaves, 0);
  assert.ok(rules[0].varies);
  assert.match(rules[0].sentence, /"Modern Frame" in a Crystal Commerce name: when the card has the 2015 frame .*, it takes the product carrying the word; otherwise the product without it\./);
  // Applied: a modern card takes the Modern Frame product, a retro card the one without the word.
  const modern = units.find((u) => u.name === 'Modern 3');
  const retro = units.find((u) => u.name === 'Retro 3');
  assert.deepEqual(applyRule(rules[0], modern), { productId: modern.products[0].id });
  assert.deepEqual(applyRule(rules[0], retro), { productId: retro.products[0].id });
});

test('a rule that fits most picks is offered with the ones it gets wrong; one that fits too few is not', () => {
  const units = thirtieth();
  const byKey = new Map(units.map((u) => [u.key, u]));
  const [group] = groupUnits(units);
  // Six picks, one of them against the frame (a retro card given the Modern Frame product): 5 of 6 still fit.
  const keys = group.examplePool.slice(0, 6);
  const odd = keys.find((k) => byKey.get(k).frame === '1997');
  let picks = pickAll(emptyPicks({}), keys, byKey, (u) => (u.key === odd ? u.products.find((p) => p.words.includes('Modern Frame')).id : right30a(u)));
  let rules = inferRules(group, picks, byKey);
  const frame = rules.find((r) => r.fact === 'frame=2015');
  assert.ok(frame, 'still offered');
  assert.deepEqual([frame.fits, frame.of], [5, 6]);
  assert.equal(frame.misses.length, 1);
  assert.equal(frame.misses[0].key, odd);
  assert.match(frame.misses[0].picked, /Modern Frame/);
  assert.match(frame.misses[0].rule, /Retro Frame/);
  // Settled, the odd hand pick stays as picked.
  picks = settleGroup(picks, group, frame, byKey);
  assert.match(picks.picks[odd].product_name, /Modern Frame/);
  assert.equal(picks.picks[odd].rule, null);
  // Picks that agree on nothing (each card given the wrong product) offer no frame rule at all.
  picks = pickAll(emptyPicks({}), keys, byKey, (u) => u.products.find((p) => p.id !== right30a(u))?.id ?? null);
  rules = inferRules(group, picks, byKey);
  assert.ok(!rules.some((r) => r.fact === 'frame=2015' && r.yes === 'word'));
  assert.equal(FIT_SHARE, 0.6);
});

/** A lone "Planeswalker Deck Exclusive" product: the deck's own printing takes it, any other printing is None. */
const deckCard = (name, deck) => unit({
  name, cause: 'one product, with a word the matcher can\'t read', promo_types: deck ? ['planeswalkerdeck'] : [],
  products: [product(`${name} - Planeswalker Deck Exclusive`, { words: ['Planeswalker Deck Exclusive'], leader: true, score: -1 })],
});

test('a rule can end in None, and None picks count: the deck\'s own printing takes the product, any other None', () => {
  const units = [deckCard('Ajani A', true), deckCard('Ajani B', false), deckCard('Ajani C', false), deckCard('Ajani D', true), deckCard('Ajani E', false)];
  const byKey = new Map(units.map((u) => [u.key, u]));
  const [group] = groupUnits(units);
  assert.equal(group.display, 'Planeswalker Deck Exclusive');
  const picks = pickAll(emptyPicks({}), group.examples, byKey, (u) => (u.promo_types.length ? u.products[0].id : null));
  assert.ok(group.examples.some((k) => !byKey.get(k).promo_types.length), 'a None pick among the examples');
  const [rule] = inferRules(group, picks, byKey);
  assert.deepEqual([rule.type, rule.fact, rule.yes, rule.no], ['fact', 'promo=planeswalkerdeck', 'word', 'none']);
  assert.deepEqual([rule.fits, rule.of], [3, 3]);
  assert.equal(rule.settles, 5);
  assert.equal(rule.settlesNone, 3);
  assert.match(rule.sentence, /otherwise None \(can't upload\)\./);
  assert.ok(rule.sample.some((s) => s.product === 'None') && rule.sample.some((s) => s.product !== 'None'), 'the sample shows both answers');
  const applied = settleGroup(picks, group, rule, byKey);
  const e = units.find((u) => u.name === 'Ajani E');
  const d = units.find((u) => u.name === 'Ajani D');
  if (!(e.key in picks.picks)) assert.equal(applied.picks[e.key].product_id, null);
  if (!(d.key in picks.picks)) assert.equal(applied.picks[d.key].product_id, d.products[0].id);
  assert.ok(Object.values(applied.picks).every((p) => p.product_id === null || p.product_name), 'every pick names its product or None');
  // Every pick None: "every card takes None".
  const allNone = pickAll(emptyPicks({}), group.examples, byKey, () => null);
  const [noneRule] = inferRules(group, allNone, byKey);
  assert.deepEqual([noneRule.type, noneRule.outcome, noneRule.settles], ['all', 'none', 5]);
  assert.match(noneRule.sentence, /Every card in the "Planeswalker Deck Exclusive" group takes None/);
});

test('a searched pick counts: a rule can\'t give that product, so it is a miss', () => {
  const units = thirtieth();
  const byKey = new Map(units.map((u) => [u.key, u]));
  const [group] = groupUnits(units);
  const [found, ...rest] = group.examplePool.slice(0, 5);
  let picks = recordPick(emptyPicks({}), byKey.get(found), { product_id: '9001', product_name: 'Elsewhere - Modern Frame', category: 'Other' });
  picks = pickAll(picks, rest, byKey, right30a);
  const frame = inferRules(group, picks, byKey).find((r) => r.fact === 'frame=2015');
  assert.deepEqual([frame.fits, frame.of], [4, 5]);
  assert.equal(frame.misses[0].picked, 'Elsewhere - Modern Frame');
});

test('an equality rule: an attraction-lights bracket is the card\'s own lights', () => {
  const units = [attraction('Kiddie Coaster', [2, 5, 6], '219c'), attraction('Ferris Wheel', [3, 4, 6], '217a'), attraction('Log Flume', [2, 3, 6], '220b')];
  const byKey = new Map(units.map((u) => [u.key, u]));
  const [group] = groupUnits(units);
  assert.equal(group.token, TOKENS.lights);
  const picks = recordPick(emptyPicks({}), units[0], units[0].products[2].id);   // (2-5-6)
  const rules = inferRules(group, picks, byKey);
  assert.equal(rules[0].type, 'equals');
  assert.equal(rules[0].kind, 'lights');
  assert.equal(rules[0].settles, 3);
  assert.deepEqual(applyRule(rules[0], units[1]), { productId: units[1].products[3].id });   // (3-4-6)
  assert.match(rules[0].sentence, /attraction lights in a Crystal Commerce name is the card's attraction lights/);
});

test('Show me 3 more: three more examples before the rule, and undo takes the press back', () => {
  const units = thirtieth();
  const byKey = new Map(units.map((u) => [u.key, u]));
  const groups = groupUnits(units);
  const [group] = groups;
  assert.equal(group.examplePool.length, 12);
  assert.equal(group.examples.length, EXAMPLES);
  let picks = pickAll(emptyPicks({}), group.examples, byKey, right30a);
  let step = nextStep(groups, byKey, picks);
  assert.deepEqual([step.phase, step.canMore, step.examples.length], ['rule', true, 3]);
  picks = moreExamples(picks, group);
  assert.deepEqual(examplesOf(group, picks), group.examplePool.slice(0, 6));
  step = nextStep(groups, byKey, picks);
  assert.deepEqual([step.phase, step.exampleIndex, step.exampleCount], ['example', 4, 6]);
  picks = pickAll(picks, examplesOf(group, picks).slice(3), byKey, right30a);
  step = nextStep(groups, byKey, picks);
  assert.equal(step.phase, 'rule');
  assert.equal(inferRules(group, picks, byKey)[0].of, 6, 'every hand pick is evidence');
  // Undo: the last pick, then two more, then the press.
  picks = undoLast(undoLast(undoLast(undoLast(picks))));
  assert.equal(picks.groups[group.id], undefined);
  assert.equal(nextStep(groups, byKey, picks).phase, 'rule');
  // The examples go round the group's looks: the first round one of each, then the next of each.
  const frames = group.examplePool.slice(0, 4).map((k) => byKey.get(k).frame);
  assert.deepEqual(frames.slice(0, 2).sort(), ['1997', '2015']);
  assert.deepEqual(frames.slice(2, 4).sort(), ['1997', '2015']);
  // No more to show once the pool is used up.
  for (let i = 0; i < 3; i += 1) picks = moreExamples(picks, group);
  assert.equal(canShowMore(group, picks), false);
});

test('the order of work: examples, the rule, cards by hand in stock first, no product left last, then done', () => {
  const units = [
    ...thirtieth(),
    unit({ name: 'Plain', anyStock: false, products: [product('Plain', { leader: true }), product('Plain', { score: 0 })] }),
    unit({ name: 'Stocked', anyStock: true, products: [product('Stocked', { leader: true, qty: 2 }), product('Stocked', { score: 0 })] }),
    unit({ name: 'Gone', cause: 'no product passes the checks', products: [] }),
  ];
  const byKey = new Map(units.map((u) => [u.key, u]));
  const groups = groupUnits(units);
  let picks = emptyPicks({ generated: 'g', inventoryFile: { name: 'f' } });
  let step = nextStep(groups, byKey, picks);
  assert.equal(step.phase, 'example');
  assert.equal(step.exampleIndex, 1);
  assert.equal(step.exampleCount, 3);
  // The three examples picked right.
  for (let i = 0; i < 3; i += 1) {
    step = nextStep(groups, byKey, picks);
    picks = recordPick(picks, byKey.get(step.key), right30a(byKey.get(step.key)));
  }
  step = nextStep(groups, byKey, picks);
  assert.equal(step.phase, 'rule');
  const [rule] = inferRules(step.group, picks, byKey);
  picks = settleGroup(picks, step.group, rule, byKey);
  assert.equal(Object.keys(picks.picks).length, 12);
  assert.equal(picks.rules.length, 1);
  assert.deepEqual([picks.rules[0].yes, picks.rules[0].no, picks.rules[0].fits, picks.rules[0].of], ['word', 'plain', 3, 3]);
  assert.equal(Object.values(picks.picks).filter((p) => p.rule).length, 9, 'the three hand picks stay hand picks');
  // Card by card: the stocked look-alike first.
  step = nextStep(groups, byKey, picks);
  assert.equal(step.phase, 'card');
  assert.equal(byKey.get(step.key).name, 'Stocked');
  picks = skipUnit(picks, step.key);
  step = nextStep(groups, byKey, picks);
  assert.equal(byKey.get(step.key).name, 'Plain', 'a skipped card waits');
  picks = recordPick(picks, byKey.get(step.key), null);
  step = nextStep(groups, byKey, picks);
  assert.equal(byKey.get(step.key).name, 'Stocked', 'then comes back once');
  picks = skipUnit(picks, step.key);
  step = nextStep(groups, byKey, picks);
  assert.equal(step.phase, 'none', 'twice skipped, it stays unanswered');
  picks = recordPick(picks, byKey.get(step.key), null);
  assert.equal(nextStep(groups, byKey, picks).phase, 'done');
  const p = progress(groups, picks);
  assert.deepEqual([p.all, p.answered, p.byRule, p.byHand], [15, 14, 9, 5]);
});

test('undo takes back a pick, a skip, a rule with everything it settled, a declined rule and a set choice', () => {
  const units = thirtieth();
  const byKey = new Map(units.map((u) => [u.key, u]));
  const [group] = groupUnits(units);
  let picks = emptyPicks({});
  const u = byKey.get(group.examples[0]);
  picks = recordPick(picks, u, u.products[0].id);
  assert.equal(picks.picks[u.key].product_id, u.products[0].id);
  assert.equal(picks.picks[u.key].product_name, u.products[0].name);
  picks = undoLast(picks);
  assert.equal(picks.picks[u.key], undefined);
  picks = skipUnit(picks, u.key);
  assert.equal(picks.skipped[u.key], 1);
  picks = undoLast(picks);
  assert.equal(picks.skipped[u.key], undefined);
  picks = pickAll(picks, group.examples, byKey, right30a);
  const rule = inferRules(group, picks, byKey)[0];
  picks = settleGroup(picks, group, rule, byKey);
  assert.equal(Object.keys(picks.picks).length, 12);
  assert.equal(picks.groups[group.id].rule, 'applied');
  picks = undoLast(picks);
  assert.deepEqual([Object.keys(picks.picks).length, picks.rules.length, picks.groups[group.id]], [3, 0, undefined]);
  picks = declineRule(picks, group);
  assert.equal(picks.groups[group.id].rule, 'declined');
  picks = undoLast(picks);
  assert.equal(picks.groups[group.id], undefined);
  picks = recordSetChoice(picks, 'cat:Strixhaven: Mystical Archives', { scryfall_set: 'sta', promo_kind: '', category: 'Strixhaven: Mystical Archives' });
  assert.equal(picks.setChoices['cat:Strixhaven: Mystical Archives'].scryfall_set, 'sta');
  picks = undoLast(picks);
  assert.deepEqual(picks.setChoices, {});
});

test('a pick found by the search keeps its product and says so; a candidate picked as a row is no "found"', () => {
  const u = unit({ products: [product('Card', { leader: true })] });
  let picks = recordPick(emptyPicks({}), u, { product_id: '9001', product_name: 'Card - Anime Borderless', category: 'Wilds of Eldraine: Enchanting Tales' });
  assert.deepEqual(
    [picks.picks[u.key].product_id, picks.picks[u.key].product_name, picks.picks[u.key].category, picks.picks[u.key].found],
    ['9001', 'Card - Anime Borderless', 'Wilds of Eldraine: Enchanting Tales', true],
  );
  picks = recordPick(picks, u, { product_id: u.products[0].id, product_name: 'Card', category: 'X' });
  assert.equal(picks.picks[u.key].found, undefined);
  assert.equal(picks.picks[u.key].product_name, 'Card');
  picks = undoLast(picks);
  assert.equal(picks.picks[u.key].found, true, 'undo puts the found pick back');
});

test('the files are told apart by their format', () => {
  assert.ok(isDataFile({ format: 'pug-audit-cc-data', units: [] }));
  assert.ok(!isDataFile({ format: 'pug-audit-cc-picks', picks: {} }));
  assert.ok(isPicksFile(emptyPicks({})));
  assert.ok(!isPicksFile({ picks: {} }));
});
