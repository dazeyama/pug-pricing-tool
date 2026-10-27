import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOKENS, applyRule, cardFacts, cardValues, declineRule, emptyPicks, groupUnits, inferRules, isDataFile, isPicksFile,
  nextStep, pickExamples, poolOf, progress, recordPick, recordSetChoice, settleGroup, skipUnit, tokenEquals, undoLast,
  wordToken,
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

test('a fact rule inferred from the examples: "Modern Frame" means the 2015 frame, settling the whole group', () => {
  const units = thirtieth();
  const byKey = new Map(units.map((u) => [u.key, u]));
  const [group] = groupUnits(units);
  const picks = group.examples.map((key) => {
    const u = byKey.get(key);
    return { key, productId: u.products.find((p) => (u.frame === '2015') === p.words.includes('Modern Frame')).id };
  });
  const rules = inferRules(group, picks, byKey);
  assert.ok(rules.length >= 1);
  assert.equal(rules[0].type, 'fact');
  assert.equal(rules[0].fact, 'frame=2015');
  assert.equal(rules[0].settles, 12);
  assert.equal(rules[0].leaves, 0);
  assert.ok(rules[0].varies);
  assert.match(rules[0].sentence, /"Modern Frame" in a Crystal Commerce name means the card has the 2015 frame/);
  // Applied: a modern card takes the Modern Frame product, a retro card the one without the word.
  const modern = units.find((u) => u.name === 'Modern 3');
  const retro = units.find((u) => u.name === 'Retro 3');
  assert.equal(applyRule(rules[0], modern), modern.products[0].id);
  assert.equal(applyRule(rules[0], retro), retro.products[0].id);
  // A pick that contradicts the facts (a retro card given the Modern Frame product) rules the fact out.
  const retroExample = picks.find((p) => byKey.get(p.key).frame === '1997');
  const wrong = picks.map((p) => (p === retroExample
    ? { key: p.key, productId: byKey.get(p.key).products.find((x) => x.words.includes('Modern Frame')).id } : p));
  const none = inferRules(group, wrong, byKey);
  assert.ok(!none.some((r) => r.fact === 'frame=2015'));
});

test('an equality rule: an attraction-lights bracket is the card\'s own lights', () => {
  const units = [attraction('Kiddie Coaster', [2, 5, 6], '219c'), attraction('Ferris Wheel', [3, 4, 6], '217a'), attraction('Log Flume', [2, 3, 6], '220b')];
  const byKey = new Map(units.map((u) => [u.key, u]));
  const [group] = groupUnits(units);
  assert.equal(group.token, TOKENS.lights);
  const picks = [{ key: units[0].key, productId: units[0].products[2].id }];   // (2-5-6)
  const rules = inferRules(group, picks, byKey);
  assert.equal(rules[0].type, 'equals');
  assert.equal(rules[0].kind, 'lights');
  assert.equal(rules[0].settles, 3);
  assert.equal(applyRule(rules[0], units[1]), units[1].products[3].id);   // (3-4-6)
  assert.match(rules[0].sentence, /attraction lights in a Crystal Commerce name is the card's attraction lights/);
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
    const u = byKey.get(step.key);
    picks = recordPick(picks, u, u.products.find((p) => (u.frame === '2015') === p.words.includes('Modern Frame')).id);
  }
  step = nextStep(groups, byKey, picks);
  assert.equal(step.phase, 'rule');
  const [rule] = inferRules(step.group, step.group.examples.map((key) => ({ key, productId: picks.picks[key].product_id })), byKey);
  picks = settleGroup(picks, step.group, rule, byKey);
  assert.equal(Object.keys(picks.picks).length, 12);
  assert.equal(picks.rules.length, 1);
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
  const rule = inferRules(group, group.examples.map((key) => ({ key, productId: byKey.get(key).products.find((p) => (byKey.get(key).frame === '2015') === p.words.includes('Modern Frame')).id })), byKey)[0];
  picks = settleGroup(picks, group, rule, byKey);
  assert.equal(Object.keys(picks.picks).length, 12);
  assert.equal(picks.groups[group.id].rule, 'applied');
  picks = undoLast(picks);
  assert.deepEqual([Object.keys(picks.picks).length, picks.rules.length, picks.groups[group.id]], [0, 0, undefined]);
  picks = declineRule(picks, group);
  assert.equal(picks.groups[group.id].rule, 'declined');
  picks = undoLast(picks);
  assert.equal(picks.groups[group.id], undefined);
  picks = recordSetChoice(picks, 'cat:Strixhaven: Mystical Archives', { scryfall_set: 'sta', promo_kind: '', category: 'Strixhaven: Mystical Archives' });
  assert.equal(picks.setChoices['cat:Strixhaven: Mystical Archives'].scryfall_set, 'sta');
  picks = undoLast(picks);
  assert.deepEqual(picks.setChoices, {});
  assert.equal(undoLast(picks), picks, 'nothing left to undo');
});

test('the files are told apart by their format', () => {
  assert.ok(isDataFile({ format: 'pug-audit-cc-data', units: [] }));
  assert.ok(!isDataFile({ format: 'pug-audit-cc-picks', picks: {} }));
  assert.ok(isPicksFile(emptyPicks({})));
  assert.ok(!isPicksFile({ picks: {} }));
});
