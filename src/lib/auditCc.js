// The Crystal Commerce matching audit (decision 547): the pure side of the temporary dev-only page
// (src/pages/export/audit/AuditCcPage.jsx). Its data file, made by the whole-inventory sweep outside the repo,
// holds every printing + finish today's matcher sends to Needs a choice, with the card's Scryfall facts and every
// candidate product as the matcher read it (its unread words above all). Here: the word groups the asks fall into,
// the example cards a group shows first, the rule a group's picks imply (a CC word ↔ a Scryfall fact), what a rule
// settles, the order of work, and the picks file the import will read. Tested under Node.

export const DATA_FORMAT = 'pug-audit-cc-data';
export const PICKS_FORMAT = 'pug-audit-cc-picks';

// ---------------------------------------------------------------- words → tokens

const LIGHTS = /^\d(-\d)+$/;
const LETTER = /^[a-f]$/i;
const NUMBER = /^\d+[a-z★]?$/i;
/** The special tokens, the words that stand for a value of the card's rather than a name of their own. */
export const TOKENS = {
  lights: 'attraction lights', letter: 'a letter (A–F)', number: 'a number', artist: "the artist's name",
};

/** The words of the card's artist (longer than two letters), lower case: "Jeff A. Menges" → jeff, menges. */
export const artistWords = (unit) => new Set(String(unit?.artist ?? '').toLowerCase().split(/[\s,&/.]+/).filter((x) => x.length > 2));

/**
 * The group token a CC word belongs to: an attraction-lights bracket, a letter, a number and the artist's name
 * stand for a value of the card's; any other word is its own token, lower case.
 */
export function wordToken(word, unit) {
  const w = String(word ?? '').trim();
  if (LIGHTS.test(w)) return TOKENS.lights;
  if (LETTER.test(w)) return TOKENS.letter;
  if (NUMBER.test(w)) return TOKENS.number;
  if (artistWords(unit).has(w.toLowerCase())) return TOKENS.artist;
  return w.toLowerCase();
}

/** Does a product's name carry a word of this token? */
export const productHasToken = (product, token, unit) => (product.words ?? []).some((w) => wordToken(w, unit) === token);

const NONE_CAUSES = new Set([
  'no product passes the checks', 'every product is clearly another printing',
  'every product in the category carries another printing\'s bracket',
]);

/** The products a pick is made among: the ones the matcher left, else the ones that pass its checks. */
export function poolOf(unit) {
  const left = (unit.products ?? []).filter((p) => p.left);
  if (left.length) return left;
  return (unit.products ?? []).filter((p) => p.passes);
}

// ---------------------------------------------------------------- groups

/**
 * The groups, in the order they're worked: the word groups biggest first (a unit goes with its commonest unread
 * word), then the look-alikes (products left but no unread word: duplicates, two variants that don't nest), then
 * the "no product left" group (nothing passes the checks, or every product is clearly another printing), where
 * the answer is almost always none.
 * @param {object[]} units  the data file's units
 * @returns {{ id: string, kind: 'word'|'lookalike'|'none', token: string|null, display: string, units: string[], examples: string[] }[]}
 */
export function groupUnits(units) {
  const tokensOf = new Map();
  const counts = new Map();
  const spellings = new Map();   // token → Map(spelling → n), for the group's display name
  for (const u of units) {
    if (NONE_CAUSES.has(u.cause)) continue;
    const tokens = new Set();
    for (const p of poolOf(u)) {
      for (const w of p.words ?? []) {
        const t = wordToken(w, u);
        tokens.add(t);
        if (!spellings.has(t)) spellings.set(t, new Map());
        spellings.get(t).set(w, (spellings.get(t).get(w) ?? 0) + 1);
      }
    }
    tokensOf.set(u.key, tokens);
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const groups = new Map();
  const put = (id, kind, token, display, key) => {
    if (!groups.has(id)) groups.set(id, { id, kind, token, display, units: [], examples: [] });
    groups.get(id).units.push(key);
  };
  for (const u of units) {
    if (NONE_CAUSES.has(u.cause)) { put('none', 'none', null, 'No product left', u.key); continue; }
    const tokens = [...tokensOf.get(u.key)];
    if (!tokens.length) { put('lookalike', 'lookalike', null, 'Look-alikes', u.key); continue; }
    const token = tokens.sort((a, b) => (counts.get(b) - counts.get(a)) || a.localeCompare(b))[0];
    const display = Object.values(TOKENS).includes(token) ? token
      : [...spellings.get(token).entries()].sort((a, b) => b[1] - a[1])[0][0];
    put(`word:${token}`, 'word', token, display, u.key);
  }
  const list = [...groups.values()];
  const order = { word: 0, lookalike: 1, none: 2 };
  list.sort((a, b) => order[a.kind] - order[b.kind] || b.units.length - a.units.length || a.id.localeCompare(b.id));
  const byKey = new Map(units.map((u) => [u.key, u]));
  for (const g of list) g.examples = g.kind === 'word' ? pickExamples(g, byKey) : [];
  return list;
}

/** The label of a unit's card, as the page shows it. */
export const cardLabel = (u) => `${u.name} (${String(u.set).toUpperCase()}) ${u.collector_number}${u.finish === 'foil' ? ' · foil' : u.finish === 'etched' ? ' · etched' : ''}`;

/**
 * The group's example cards, up to `n`: one from each of its biggest clusters of look (whether the leader carries
 * the word, the frame, the border, the frame effects, the promo types), so the picks tell the facts apart; in
 * stock first within a cluster.
 */
export function pickExamples(group, byKey, n = 3) {
  const clusters = new Map();
  for (const key of group.units) {
    const u = byKey.get(key);
    const leader = u.products.find((p) => p.leader) ?? null;
    const sig = [leader ? productHasToken(leader, group.token, u) : '-', u.frame, u.border_color,
      (u.frame_effects ?? []).join(','), (u.promo_types ?? []).join(',')].join('|');
    if (!clusters.has(sig)) clusters.set(sig, []);
    clusters.get(sig).push(u);
  }
  const ordered = [...clusters.values()].sort((a, b) => b.length - a.length);
  const byStock = (a, b) => Number(Boolean(b.anyStock)) - Number(Boolean(a.anyStock)) || a.name.localeCompare(b.name);
  const out = [];
  for (const c of ordered) {
    if (out.length >= n) break;
    out.push([...c].sort(byStock)[0].key);
  }
  for (const c of ordered) {
    if (out.length >= n) break;
    for (const u of [...c].sort(byStock)) {
      if (out.length >= n) break;
      if (!out.includes(u.key)) out.push(u.key);
    }
  }
  return out;
}

// ---------------------------------------------------------------- the card's facts

const FRAME_WORDS = { 1993: 'the 1993 frame (the original)', 1997: 'the 1997 frame (the old look)', 2003: 'the 2003 frame (the modern look)', 2015: 'the 2015 frame (the current look)', future: 'the future-shifted frame' };

/**
 * What the card is, on Scryfall, as facts a rule can turn on: each `{ key, label, rank }`; the rank orders ties
 * (frame, border, effects, promo types and the like before language, finish and set).
 */
export function cardFacts(unit) {
  const f = [];
  const add = (key, label, rank) => f.push({ key, label, rank });
  if (unit.frame) add(`frame=${unit.frame}`, `the card has ${FRAME_WORDS[unit.frame] ?? `the ${unit.frame} frame`}`, 1);
  if (unit.border_color) add(`border=${unit.border_color}`, `the card's border is ${unit.border_color}`, 1);
  for (const e of unit.frame_effects ?? []) add(`effect=${e}`, `the card has the "${e}" frame effect`, 1);
  for (const p of unit.promo_types ?? []) add(`promo=${p}`, `the card's promo type is "${p}"`, 1);
  if ((unit.attraction_lights ?? []).length) add('lights', 'the card has attraction lights', 1);
  if (/\d[a-z★]$/i.test(String(unit.collector_number ?? ''))) add('letter', 'the card\'s number ends in a letter', 1);
  if (unit.full_art) add('fullart', 'the card is full art', 1);
  if (unit.textless) add('textless', 'the card is textless', 1);
  if (unit.security_stamp) add(`stamp=${unit.security_stamp}`, `the card's security stamp is "${unit.security_stamp}"`, 2);
  if (unit.watermark) add(`watermark=${unit.watermark}`, `the card's watermark is "${unit.watermark}"`, 2);
  if (unit.promo) add('promo', 'Scryfall marks the card a promo', 2);
  if (unit.booster === false) add('nobooster', 'the card isn\'t found in boosters', 2);
  if (unit.variation) add('variation', 'Scryfall marks the card a variation', 2);
  if (unit.lang) add(`lang=${unit.lang}`, `the card's language is ${unit.lang}`, 3);
  if (unit.finish) add(`finish=${unit.finish}`, `the copy is ${unit.finish}`, 3);
  if (unit.set) add(`set=${unit.set}`, `the card is in ${unit.set_name ?? String(unit.set).toUpperCase()}`, 4);
  return f;
}

/** The card's own values a special token's word can equal: its attraction lights, its number's letter, its number, its artist. */
export function cardValues(unit) {
  const v = [];
  const lights = unit.attraction_lights ?? [];
  if (lights.length) v.push({ kind: 'lights', value: lights.join('-'), label: 'the card\'s attraction lights' });
  const m = /^(\d+)([a-z★])$/i.exec(String(unit.collector_number ?? ''));
  if (m) v.push({ kind: 'letter', value: m[2].toLowerCase(), label: 'the letter of the card\'s number' });
  const num = parseInt(String(unit.collector_number ?? ''), 10);
  if (Number.isFinite(num)) v.push({ kind: 'number', value: String(num), label: 'the card\'s collector number' });
  for (const w of artistWords(unit)) v.push({ kind: 'artist', value: w, label: 'the card\'s artist' });
  return v;
}

const TOKEN_OF_KIND = { lights: TOKENS.lights, letter: TOKENS.letter, number: TOKENS.number, artist: TOKENS.artist };

/** Does a word of this token on the product equal the card's own value of `kind`? */
export function tokenEquals(product, kind, unit) {
  const token = TOKEN_OF_KIND[kind];
  const values = cardValues(unit).filter((v) => v.kind === kind).map((v) => v.value);
  if (!values.length) return false;
  return (product.words ?? []).some((w) => {
    if (wordToken(w, unit) !== token) return false;
    const s = String(w).trim().toLowerCase();
    return kind === 'number' ? values.includes(String(parseInt(s, 10))) : values.includes(s);
  });
}

// ---------------------------------------------------------------- rules

/**
 * What a rule says of one unit: the product it settles on, or null when the rule leaves two or more (or none).
 *  - `fact`: a card with the fact takes the product carrying the word, one without takes the product without it;
 *  - `equals`: the product whose word is the card's own value (its lights, its letter, its number, its artist) is
 *    ours; a card with no such value takes the product without the word.
 */
export function applyRule(rule, unit) {
  const pool = poolOf(unit);
  if (!pool.length) return null;
  let want;
  if (rule.type === 'fact') {
    const has = cardFacts(unit).some((f) => f.key === rule.fact);
    want = pool.filter((p) => productHasToken(p, rule.token, unit) === has);
  } else {
    const hasValue = cardValues(unit).some((v) => v.kind === rule.kind);
    want = hasValue ? pool.filter((p) => tokenEquals(p, rule.kind, unit)) : pool.filter((p) => !productHasToken(p, rule.token, unit));
  }
  return want.length === 1 ? want[0].id : null;
}

/** The rule in one sentence. */
export function ruleSentence(rule) {
  const word = Object.values(TOKENS).includes(rule.token) ? rule.display ?? rule.token : `"${rule.display ?? rule.token}"`;
  if (rule.type === 'fact') {
    return `${word} in a Crystal Commerce name means ${rule.label}: a card with that takes the product carrying the word, one without takes the product without it.`;
  }
  const value = { lights: 'the card\'s attraction lights', letter: 'the letter of the card\'s number', number: 'the card\'s collector number', artist: 'the card\'s artist' }[rule.kind];
  return `${word} in a Crystal Commerce name is ${value}: the product whose word is the card's own is ours.`;
}

/** A rule with what it does to the group: how many units it settles, a sample of them, how many it leaves. */
export function measureRule(rule, group, byKey, sample = 8) {
  const settled = [];
  let withFact = 0;
  for (const key of group.units) {
    const u = byKey.get(key);
    if (rule.type === 'fact' && cardFacts(u).some((f) => f.key === rule.fact)) withFact += 1;
    const id = applyRule(rule, u);
    if (id) settled.push({ key, card: cardLabel(u), product: u.products.find((p) => p.id === id)?.name ?? id });
  }
  const varies = rule.type === 'equals' || (withFact > 0 && withFact < group.units.length);
  return { ...rule, sentence: ruleSentence(rule), settles: settled.length, leaves: group.units.length - settled.length, sample: settled.slice(0, sample), varies, settledKeys: settled.map((s) => s.key) };
}

/**
 * The rules a group's example picks imply, best first (none when the picks agree on nothing).
 * @param {object} group
 * @param {{ key: string, productId: string|null }[]} picks  the examples' picks; a null (none) says nothing
 * @param {Map<string, object>} byKey
 * @returns {object[]}  measureRule's shape, at most three
 */
export function inferRules(group, picks, byKey) {
  const rows = picks.filter((p) => p.productId).map((p) => {
    const unit = byKey.get(p.key);
    const product = unit.products.find((x) => x.id === p.productId) ?? null;
    return { unit, product, has: product ? productHasToken(product, group.token, unit) : false };
  }).filter((r) => r.product);
  if (!rows.length) return [];
  const out = [];
  const display = group.display;
  // An equality rule: every pick carrying the word carries the card's own value, and no pick without the word
  // passed over a product that did.
  const withWord = rows.filter((r) => r.has);
  for (const kind of ['lights', 'letter', 'artist', 'number']) {
    if (TOKEN_OF_KIND[kind] !== group.token) continue;
    const fits = withWord.length > 0 && withWord.every((r) => tokenEquals(r.product, kind, r.unit))
      && rows.filter((r) => !r.has).every((r) => !poolOf(r.unit).some((p) => tokenEquals(p, kind, r.unit)));
    if (fits) out.push(measureRule({ type: 'equals', token: group.token, display, kind }, group, byKey));
  }
  // A fact rule: a fact every example card has exactly when its pick carries the word. The facts come from the
  // whole group, so a fact none of the examples has (their picks all without the word) counts too.
  const all = new Map();
  for (const key of group.units) for (const f of cardFacts(byKey.get(key))) if (!all.has(f.key)) all.set(f.key, f);
  const factSets = rows.map((r) => new Set(cardFacts(r.unit).map((f) => f.key)));
  for (const [key, f] of all) {
    if (rows.every((r, i) => factSets[i].has(key) === r.has)) {
      out.push(measureRule({ type: 'fact', token: group.token, display, fact: key, label: f.label, rank: f.rank }, group, byKey));
    }
  }
  // Best first: what settles most; then the facts that tell the group's cards apart; then the plainer facts.
  out.sort((a, b) => b.settles - a.settles || Number(b.varies) - Number(a.varies) || (a.rank ?? 0) - (b.rank ?? 0) || a.sentence.localeCompare(b.sentence));
  return out.filter((r) => r.settles > 0).slice(0, 3);
}

// ---------------------------------------------------------------- the picks file

/** An empty picks file for a data file. */
export function emptyPicks(data) {
  return {
    format: PICKS_FORMAT, version: 1, saved: null,
    dataFile: { generated: data?.generated ?? null, inventoryFile: data?.inventoryFile ?? null },
    picks: {}, rules: [], skipped: {}, groups: {}, setChoices: {}, history: [],
  };
}

/** Is this a picks file this page wrote? */
export const isPicksFile = (x) => Boolean(x && x.format === PICKS_FORMAT && x.picks && typeof x.picks === 'object');
/** Is this a data file the sweep wrote? */
export const isDataFile = (x) => Boolean(x && x.format === DATA_FORMAT && Array.isArray(x.units));

const HISTORY = 500;
const push = (picks, entry) => ({ ...picks, history: [...picks.history, entry].slice(-HISTORY) });

/**
 * One pick: a product or none (null) for a unit, by hand or by a rule. The product is one of the unit's candidates
 * (its id), or one found by "Find another CC product…" (a cc_products row, kept with `found: true`).
 * @param {string|{ product_id: string, product_name: string, category: string }|null} choice
 * @returns {object} the new picks file
 */
export function recordPick(picks, unit, choice, { rule = null, at = new Date().toISOString() } = {}) {
  let product = null;
  let found = false;
  if (choice && typeof choice === 'object') {
    const own = unit.products.find((p) => p.id === String(choice.product_id)) ?? null;
    product = own ?? { id: String(choice.product_id), name: choice.product_name, category: choice.category };
    found = !own;
  } else if (choice) {
    product = unit.products.find((p) => p.id === choice) ?? { id: choice, name: null, category: null };
  }
  const before = picks.picks[unit.key] ?? null;
  const next = {
    ...picks,
    picks: {
      ...picks.picks,
      [unit.key]: {
        scryfall_id: unit.scryfall_id, finish: unit.finish, card: cardLabel(unit),
        product_id: product?.id ?? null, product_name: product?.name ?? null, category: product?.category ?? null,
        ...(found ? { found: true } : {}), rule, at,
      },
    },
  };
  return push(next, { type: 'pick', key: unit.key, before });
}

/** Skip a unit for now (it comes back once; twice skipped, it stays unanswered). */
export function skipUnit(picks, key) {
  const next = { ...picks, skipped: { ...picks.skipped, [key]: (picks.skipped[key] ?? 0) + 1 } };
  return push(next, { type: 'skip', key });
}

/** A group's rule step done: the rule applied to what it settles, or declined (card by card instead). */
export function settleGroup(picks, group, rule, byKey, { at = new Date().toISOString() } = {}) {
  const id = `${group.token}:${rule.type === 'fact' ? rule.fact : rule.kind}`;
  let next = { ...picks, rules: [...picks.rules.filter((r) => r.id !== id), {
    id, token: group.token, display: group.display, type: rule.type, fact: rule.fact ?? null, label: rule.label ?? null, kind: rule.kind ?? null,
    sentence: rule.sentence, settled: rule.settledKeys.length, confirmed: at,
  }], groups: { ...picks.groups, [group.id]: { rule: 'applied', ruleId: id, at } } };
  const befores = {};
  for (const key of rule.settledKeys) {
    if (next.picks[key]) continue;   // a pick made by hand stays
    const unit = byKey.get(key);
    befores[key] = null;
    next = { ...next, picks: { ...next.picks, [key]: recordPick(next, unit, applyRule(rule, unit), { rule: id, at }).picks[key] } };
  }
  return push(next, { type: 'rule', group: group.id, ruleId: id, keys: Object.keys(befores) });
}

/** A group's rule step declined: its units are picked card by card. */
export function declineRule(picks, group, { at = new Date().toISOString() } = {}) {
  const next = { ...picks, groups: { ...picks.groups, [group.id]: { rule: 'declined', at } } };
  return push(next, { type: 'decline', group: group.id });
}

/** A category audit answer: a set and promo kind → a category (what a `cc_set_map` row holds), or none. */
export function recordSetChoice(picks, key, choice, { at = new Date().toISOString() } = {}) {
  const before = picks.setChoices[key] ?? null;
  const next = { ...picks, setChoices: { ...picks.setChoices, [key]: { ...choice, at } } };
  return push(next, { type: 'setChoice', key, before });
}

/** Undo the last thing done. */
export function undoLast(picks) {
  const entry = picks.history.at(-1);
  if (!entry) return picks;
  const history = picks.history.slice(0, -1);
  if (entry.type === 'pick') {
    const next = { ...picks.picks };
    if (entry.before) next[entry.key] = entry.before; else delete next[entry.key];
    return { ...picks, picks: next, history };
  }
  if (entry.type === 'skip') {
    const skipped = { ...picks.skipped };
    if (skipped[entry.key] > 1) skipped[entry.key] -= 1; else delete skipped[entry.key];
    return { ...picks, skipped, history };
  }
  if (entry.type === 'rule') {
    const next = { ...picks.picks };
    for (const key of entry.keys) delete next[key];
    const groups = { ...picks.groups };
    delete groups[entry.group];
    return { ...picks, picks: next, rules: picks.rules.filter((r) => r.id !== entry.ruleId), groups, history };
  }
  if (entry.type === 'decline') {
    const groups = { ...picks.groups };
    delete groups[entry.group];
    return { ...picks, groups, history };
  }
  if (entry.type === 'setChoice') {
    const setChoices = { ...picks.setChoices };
    if (entry.before) setChoices[entry.key] = entry.before; else delete setChoices[entry.key];
    return { ...picks, setChoices, history };
  }
  return { ...picks, history };
}

// ---------------------------------------------------------------- the order of work

/**
 * What to do next: a word group's example to pick, its rule to confirm, a card to pick by hand (in stock first,
 * skipped ones once more at the end), a "no product left" unit to answer, or done.
 */
export function nextStep(groups, byKey, picks) {
  const answered = (key) => key in picks.picks;
  const open = (key) => !answered(key) && (picks.skipped[key] ?? 0) < 2;
  const fresh = (key) => !answered(key) && !(key in picks.skipped);
  const words = groups.filter((g) => g.kind === 'word');
  for (const [i, g] of words.entries()) {
    const state = picks.groups[g.id];
    if (state?.rule) continue;
    // A skipped example is left for the card-by-card pass; the rule is inferred from the picks made.
    const example = g.examples.find((k) => fresh(k));
    const at = { groupIndex: i + 1, groupCount: words.length };
    if (example) return { phase: 'example', group: g, key: example, exampleIndex: g.examples.indexOf(example) + 1, exampleCount: g.examples.length, ...at };
    return { phase: 'rule', group: g, ...at };
  }
  const byHand = groups.filter((g) => g.kind !== 'none').flatMap((g) => g.units.filter(open).map((key) => ({ g, key })));
  const stock = (key) => Number(Boolean(byKey.get(key).anyStock));
  const order = (a, b) => stock(b.key) - stock(a.key) || groups.indexOf(a.g) - groups.indexOf(b.g) || a.key.localeCompare(b.key);
  const pool = byHand.filter((x) => fresh(x.key));
  const list = (pool.length ? pool : byHand).sort(order);
  if (list.length) return { phase: 'card', group: list[0].g, key: list[0].key, left: byHand.length, skippedLeft: byHand.length - pool.length };
  const none = groups.find((g) => g.kind === 'none');
  const noneOpen = (none?.units ?? []).filter(open);
  const noneFresh = noneOpen.filter(fresh);
  const nk = (noneFresh.length ? noneFresh : noneOpen).sort((a, b) => stock(b) - stock(a) || a.localeCompare(b));
  if (nk.length) return { phase: 'none', group: none, key: nk[0], left: noneOpen.length };
  return { phase: 'done' };
}

/** How far along: answered units, of all. */
export function progress(groups, picks) {
  const all = groups.reduce((n, g) => n + g.units.length, 0);
  const answered = groups.reduce((n, g) => n + g.units.filter((k) => k in picks.picks).length, 0);
  const byRule = Object.values(picks.picks).filter((p) => p.rule).length;
  return { all, answered, byRule, byHand: answered - byRule };
}

/** The file's name when downloaded. */
export const picksFileName = (now = new Date()) => `audit-cc-picks-${now.toISOString().slice(0, 10)}.json`;
