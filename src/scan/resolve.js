// From the collector strip's text to the card, by elimination (owner,
// 2026-10-16: "We have rarity, collector number, set code, even artist …
// try multiple interlocking quick scryfall queries of the info to find the
// card via process of elimination"). mtgscan's parse kept only a set code
// and the longest run of digits, so "R 0ll3" (113 with its ones read as
// L's) became card 3. Here the text is read for every clue it holds, each
// with its likely misreads; Scryfall is asked for the cards those clues
// allow, cheapest question first; and each card it names is scored on how
// many clues it agrees with: set, number, rarity and the artist's name. A
// card is taken only when it's clearly ahead.
//
// Quick first (owner, 2026-10-16: "too slow … if that matches what our new
// scryfall searcher is detecting, auto take that one quickly"): the printing
// the set and number point at is looked up directly, as before the
// searches, and taken at once when every other clue read (the rarity, the
// artist) agrees with it. Only when it doesn't are the searches asked.
//
// Scan card takes its time instead (owner, 2026-10-16: "do it the slow way,
// running all the scans and searches for best possible accuracy"):
// resolveThorough asks every lookup and search every reading calls for and
// picks from all the cards found together.

import * as scry from '../lib/scryfall.js';
import { parseCollectorNumber } from './recognition/parsing.js';
import { STEP_MS } from './progress.js';

/** Language codes printed after the set code. */
const LANGS = new Set(['EN', 'DE', 'FR', 'ES', 'IT', 'PT', 'JP', 'JA', 'KO', 'RU', 'ZH', 'CS', 'CT', 'PH']);
/** Rarity letters printed by the number, and Scryfall's rarity for each. */
const RARITY = { C: 'common', U: 'uncommon', R: 'rare', M: 'mythic', S: 'special', L: 'common' };
/** Letters the collector line's digits get read as. */
const AS_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', '!': '1', ']': '1', '[': '1', S: '5', B: '8', Z: '2', G: '6' };
/** Digits read as each other. */
const DIGIT_LOOKALIKES = { 0: ['8', '6'], 1: ['7'], 3: ['8'], 5: ['6'], 6: ['5', '8'], 7: ['1'], 8: ['3', '0', '6'] };
/** Letters of a set code read as each other. */
const LETTER_LOOKALIKES = {
  0: ['O', 'D'], O: ['0', 'D', 'Q'], D: ['O', '0'], Q: ['O'], 1: ['I', 'L'], I: ['1', 'L'], L: ['1', 'I'],
  5: ['S'], S: ['5'], 8: ['B'], B: ['8', 'E'], E: ['B', 'F'], F: ['E'], 2: ['Z'], Z: ['2'], 6: ['G'], G: ['6', 'C'],
  C: ['G'], U: ['V'], V: ['U'], H: ['N'], N: ['H', 'M'], M: ['N', 'W'], W: ['M'],
};
/** Digits read as letters, in an artist's name. */
const AS_LETTER = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 6: 'G', 2: 'Z' };

/**
 * A card is taken at this score or more, this far ahead of the next. Set
 * and number read exactly make 6; the rarity and the artist's name lift the
 * right card further and sink the wrong ones.
 */
const TAKE = { auto: { score: 6, lead: 1.5 }, manual: { score: 5, lead: 1 } };
/** The quick way's card must score this much too: set and number as read, and the rarity or the artist. */
const QUICK = 7.5;
/**
 * A card's 3 s (decision 549): a lookup waits this long for Scryfall's answer per try, a search
 * this long (their first bytes came in 0.32 s and 0.97 s at worst on 2026-10-18); the look's own
 * `signal` drops whatever is still out when the card's time is up.
 */
const LOOKUP_MS = 1_000;
const SEARCH_MS = 1_500;
/** A card scoring this much or more is one of the likeliest, for the pick list at 3 s (decision 549). */
const CANDIDATE_MIN = 3;
/** The pick list at 3 s shows this many (decision 549). */
export const CANDIDATES = 3;

/**
 * The likeliest cards of a pool, best first, each with its score (decision 549): the ones the
 * pick list at 3 s offers. Pure, for tests.
 * @param {Iterable<object>} cards  Scryfall cards
 * @returns {{ card: object, score: number }[]}
 */
export function likeliest(cards, clues) {
  return [...new Map([...cards].filter(Boolean).map((c) => [c.id, c])).values()]
    .map((card) => ({ card, score: scoreCard(card, clues) }))
    .filter((r) => r.score >= CANDIDATE_MIN)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATES);
}

const plainNumber = (n) => String(n).toLowerCase().replace(/^0+(?=\d)/, '');

/** Edit distance (Levenshtein), for an artist's name and a number. */
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** An artist's name as letters only, upper case, no accents. */
const nameLetters = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[0-9]/g, (d) => AS_LETTER[d] ?? '').replace(/[^A-Z]/g, '');

/** A name's words, upper case, no accents, digits read as the letters they look like. */
const nameWords = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  .replace(/[0-9]/g, (d) => AS_LETTER[d] ?? '').split(/[^A-Z]+/).filter((w) => w.length >= 2);

/**
 * How much of the name read is this artist's, 0 to 1: the share of its
 * letters in words that are, give or take a letter or two, one of the
 * artist's words (the last word may be cut short: "JASON /"). Word by word,
 * so "KARI CHRISTENSEN" isn't half "Chris Seaman".
 */
export function nameLikeness(read, artist) {
  const said = nameWords(read).filter((w) => w.length >= 3);
  const theirs = nameWords(artist);
  if (!said.length || !theirs.length) return 0;
  let matched = 0;
  let total = 0;
  said.forEach((w, i) => {
    total += w.length;
    const last = i === said.length - 1;
    if (theirs.some((t) => 1 - editDistance(w, t) / Math.max(w.length, t.length) >= 0.6 || (last && t.startsWith(w)))) {
      matched += w.length;
    }
  });
  return matched / total;
}

/** A set code and the known codes one look-alike letter away. */
function setsFrom(token, known) {
  const out = [];
  if (known.has(token)) out.push(token);
  for (let i = 0; i < token.length; i++) {
    for (const alt of LETTER_LOOKALIKES[token[i]] ?? []) {
      const v = token.slice(0, i) + alt + token.slice(i + 1);
      if (known.has(v) && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

/** The known set codes one letter different from a token ("DMQ": DMU, DMC, DMR …), at most `max`. */
function setsNear(token, known, max = 6) {
  const out = [];
  for (const code of known) {
    if (code.length !== token.length || code === token) continue;
    let diff = 0;
    for (let i = 0; i < code.length && diff < 2; i++) if (code[i] !== token[i]) diff += 1;
    if (diff === 1) out.push(code);
    if (out.length >= max) break;
  }
  return out;
}

/** A token as a collector number, if it is one: its digits (look-alike letters read as digits), and a size after a slash. */
function asNumber(token) {
  const [head, size] = token.split('/');
  if (!head) return null;
  const mapped = [...head].map((c) => (/\d/.test(c) ? c : AS_DIGIT[c] ?? c)).join('');
  // A letter left at the end is a suffix (263s); anything else isn't a number.
  const m = /^(\d{1,7})([A-Z]?)$/.exec(mapped);
  // No digit read at all: a number only if every letter is a digit's look-alike ("OllO": 0110).
  const allLookalike = head.length >= 3 && [...head].every((c) => AS_DIGIT[c]);
  if (!m || !(/\d/.test(head) || allLookalike) || plainNumber(m[1]).length > 4) return null;
  return { number: plainNumber(m[1]) + m[2].toLowerCase(), size: size && /^\d+$/.test(size) ? Number(size) : null };
}

/**
 * Every clue in the collector strip's text, each with its likely misreads.
 * Pure, for tests.
 * @param {string} text  what the OCR read: "R 0113\nHOB • EN ✒ MIKLÓS LIGETI", or "071/281 C\nDMU • EN …"
 * @param {Set<string>} known  every set code, upper case
 * @returns {{ sets: string[], setWeight: Object<string, number>, numbers: string[], rarity: string|null,
 *   lang: string|null, artist: string, size: number|null }}  sets and numbers best first; setWeight
 *   how sure each set is (3 read as printed, 2 a letter read as its look-alike, 1 a letter off);
 *   rarity Scryfall's word
 */
export function readClues(text, known) {
  const lines = String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[•·*«»+~—–_,;:=()]/g, ' ')
    .split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const tokens = lines.map((line, row) => [...line.matchAll(/[A-Z0-9|!\][/]+/g)].map((m, i) => ({ t: m[0], row, i })));
  // A set code run into its language code ("HOBEN"): two tokens.
  for (const row of tokens) {
    for (let i = 0; i < row.length; i++) {
      const t = row[i].t;
      const tail = t.slice(-2);
      if (t.length >= 5 && LANGS.has(tail) && setsFrom(t.slice(0, -2), known).length) {
        row.splice(i, 1, { t: t.slice(0, -2), row: row[i].row }, { t: tail, row: row[i].row });
      }
    }
    row.forEach((x, i) => { x.i = i; });
  }
  const flat = tokens.flat();
  const lang = flat.find((x) => LANGS.has(x.t)) ?? null;

  // The set: the token before the language code first, then any token that is (or nearly is) a set code.
  const sets = [];
  const setWeight = {};
  const add = (list, weight) => list.forEach((s) => {
    if (sets.includes(s)) return;
    sets.push(s);
    setWeight[s] = weight;
  });
  const beforeLang = lang && lang.i > 0 ? tokens[lang.row][lang.i - 1] : null;
  if (beforeLang) {
    const [asRead, ...alike] = setsFrom(beforeLang.t, known);
    if (asRead === beforeLang.t) add([asRead], 3);
    else if (asRead) alike.unshift(asRead);
    add(alike, 2);
  }
  const setTokens = new Set(beforeLang ? [beforeLang] : []);
  for (const x of flat) {
    if (x === lang || x === beforeLang || x.t.length < 3 || x.t.length > 5 || !/[A-Z]/.test(x.t)) continue;
    if (lang && x.row === lang.row && x.i > lang.i) continue;   // the artist's name
    if (known.has(x.t)) {
      add([x.t], 3);
      setTokens.add(x);
    }
  }
  // Nothing read as printed: the codes a letter off, the weakest clue (left to the number, rarity and artist).
  if (beforeLang && !sets.some((s) => setWeight[s] === 3) && beforeLang.t.length >= 3) {
    add(setsNear(beforeLang.t, known), 1);
  }
  // The artist's name follows the language code, or the set code when the language wasn't read
  // (then less a number or a letter after it).
  const anchor = lang ?? [...setTokens][0] ?? null;
  const isArtist = (x) => Boolean(anchor) && x.row === anchor.row && x.i > anchor.i
    && (anchor === lang || (x.t.length > 1 && !asNumber(x.t)));

  // The number and the rarity: from what's left before the artist's name.
  const numberTokens = flat.filter((x) => x !== lang && !setTokens.has(x) && !isArtist(x));
  const rarities = [];   // [letter's rarity, row]
  const numbers = [];
  let numberRow = null;
  let size = null;
  for (const x of numberTokens) {
    let t = x.t;
    // A rarity letter run into the number: "R0113", "RoOoO48".
    if (t.length > 2 && RARITY[t[0]] && !asNumber(t) && asNumber(t.slice(1))) {
      rarities.push([RARITY[t[0]], x.row]);
      t = t.slice(1);
    }
    if (t.length === 1 && RARITY[t] && !/\d/.test(t)) {
      rarities.push([RARITY[t], x.row]);
      continue;
    }
    const n = asNumber(t);
    if (n && !numbers.includes(n.number)) {
      numbers.push(n.number);
      numberRow ??= x.row;
      size ??= n.size;
    }
  }
  // The rarity letter beside the number, not a stray mark on a line above it.
  const rarity = (rarities.find(([, row]) => row === numberRow) ?? rarities[0])?.[0] ?? null;
  // Look-alike digits of the first number, one at a time.
  const first = numbers[0];
  if (first) {
    for (let i = 0; i < first.length; i++) {
      for (const alt of DIGIT_LOOKALIKES[first[i]] ?? []) {
        const v = plainNumber(first.slice(0, i) + alt + first.slice(i + 1));
        if (v && !numbers.includes(v)) numbers.push(v);
      }
    }
  }

  // The artist: the words after the language code, less the paintbrush read as a letter or two.
  let artist = '';
  if (anchor) {
    const after = tokens[anchor.row].filter(isArtist).map((x) => x.t);
    while (after.length && after[0].replace(/[^A-Z]/g, '').length <= 2) after.shift();
    artist = after.join(' ');
  }
  return { sets: sets.slice(0, 8), setWeight, numbers: numbers.slice(0, 8), rarity, lang: lang?.t ?? null, artist, size };
}

/**
 * How well a card fits the clues: set, number, rarity and artist. Pure, for tests.
 * @param {{ set: string, collector_number: string, rarity: string, artist?: string }} card  a Scryfall card
 */
export function scoreCard(card, clues) {
  let s = 0;
  const set = String(card.set).toUpperCase();
  if (clues.sets.includes(set)) s += clues.setWeight?.[set] ?? 2;
  else if (clues.sets.length) s -= 1;
  const n = plainNumber(card.collector_number);
  const read = clues.numbers[0];
  const ni = clues.numbers.indexOf(n);
  if (ni === 0) s += 3;                                                   // as read
  else if (ni > 0) s += 1.5;                                              // a digit read as its look-alike
  else if (read && ((read.length >= 2 && editDistance(read, n) === 1) || (n.length > read.length && n.endsWith(read)))) {
    s += 0.5;                                                             // a digit lost or gained
  } else if (read) s -= read.length >= 3 ? 3 : 1;                         // a clear number, and not this one
  if (clues.rarity) s += card.rarity === clues.rarity ? 1.5 : -1;
  const letters = nameLetters(clues.artist).length;
  if (letters >= 4 && card.artist) {
    const like = nameLikeness(clues.artist, card.artist);
    // Up to 4 for the whole name; a first name alone (5 letters) counts for less.
    s += 4 * Math.max(0, (like - 0.5) / 0.5) * Math.min(1, letters / 8);
    // A name read clearly, and not this card's: set, number and rarity agreeing aren't enough.
    if (letters >= 6 && like < 0.3) s -= 2.5;
  }
  return s;
}

/**
 * Every clue read, besides its set and number, agrees with this card: its
 * rarity, if read, and its artist, if read (most of the name theirs), and
 * at least one of the two was read. Pure, for tests.
 */
export function confirms(card, clues) {
  const rarityRead = Boolean(clues.rarity);
  const artistRead = nameLetters(clues.artist).length >= 4;
  if (!card || (!rarityRead && !artistRead)) return false;
  if (rarityRead && card.rarity !== clues.rarity) return false;
  if (artistRead && !(card.artist && nameLikeness(clues.artist, card.artist) >= 0.75)) return false;
  return true;
}

/** The best card of a pool, if it's clearly ahead: { card, score } or null. */
function pickBest(pool, clues, take) {
  const ranked = [...pool.values()].map((card) => ({ card, score: scoreCard(card, clues) })).sort((a, b) => b.score - a.score);
  const [best, next] = ranked;
  if (!best || best.score < take.score) return null;
  if (next && best.score - next.score < take.lead) return null;
  return best;
}

const quote = (v) => `"${String(v).replace(/"/g, '')}"`;
const remembered = new Map();   // the strip's text → what it was found to be, this page's life

/**
 * A text's clues (mtgscan's own parse added to them) and what to ask
 * Scryfall for them: the printings to look up directly (the set read as
 * printed with the number, and mtgscan's reading), the set and number
 * search, and the wider search (the set's cards of that rarity, the
 * artist's cards).
 */
function planFor(text, known, pattern) {
  const clues = readClues(text, known);
  const parsed = pattern ? parseCollectorNumber(text, pattern) : null;
  if (parsed?.setCode && !clues.sets.includes(parsed.setCode)) {
    clues.sets.push(parsed.setCode);
    clues.setWeight[parsed.setCode] = 1.5;
  }
  const parsedNumber = parsed?.collectorNumber ? plainNumber(parsed.collectorNumber) : null;
  if (parsedNumber && !clues.numbers.includes(parsedNumber)) clues.numbers.push(parsedNumber);

  const direct = new Map();
  const top = clues.sets.find((s) => clues.setWeight[s] === 3) ?? null;
  if (top && clues.numbers[0]) direct.set(`${top}/${clues.numbers[0]}`, [top, clues.numbers[0]]);
  if (parsed?.setCode && parsedNumber) direct.set(`${parsed.setCode}/${parsedNumber}`, [parsed.setCode, parsedNumber]);

  const sets = clues.sets.map((s) => s.toLowerCase());
  const narrow = sets.length && clues.numbers.length
    ? `(${sets.map((s) => `set:${s}`).join(' or ')}) (${clues.numbers.map((n) => `cn:${quote(n)}`).join(' or ')})`
    : null;
  const likely = clues.sets.filter((s) => clues.setWeight[s] >= 2);
  const word = clues.artist.split(/\s+/).map(nameLetters).sort((a, b) => b.length - a.length)[0] ?? '';
  const parts = [];
  if (likely.length && clues.rarity) parts.push(`(set:${likely[0].toLowerCase()} r:${clues.rarity})`);
  if (word.length >= 4) {
    parts.push(`(a:${quote(word.toLowerCase())}${sets.length ? ` (${sets.map((s) => `set:${s}`).join(' or ')})` : ''})`);
  }
  return { clues, top, direct: [...direct.values()], narrow, wider: parts.length ? parts.join(' or ') : null };
}

/**
 * Every clue on the strip agrees with this card, so one look is enough
 * (owner, 2026-10-16: "Let's try it with just one"): its set read as
 * printed, its number as read, its rarity read, and its artist's name read
 * clearly (six letters or more) and theirs. Pure, for tests.
 */
export function isSure(card, clues, top) {
  return Boolean(card) && String(card.set).toUpperCase() === top
    && plainNumber(card.collector_number) === clues.numbers[0]
    && Boolean(clues.rarity) && card.rarity === clues.rarity
    && nameLetters(clues.artist).length >= 6 && nameLikeness(clues.artist, card.artist) >= 0.75;
}

/** A card in another language refused ({ foreign }), except a Japanese-only printing the app knows. */
function refuseForeign(found, clues) {
  if (found && clues.lang && clues.lang !== 'EN' && !(found.card.lang === 'ja' && /^J[PA]$/.test(clues.lang))) {
    return { foreign: clues.lang };
  }
  return found;
}

/** Look a printing up, a failure as no card. `signal`: the look's (decision 549). */
async function lookUp(lookup, [set, number], onFail, signal = null) {
  try {
    return await lookup(set, number, { signal, timeoutMs: LOOKUP_MS });
  } catch (e) {
    onFail();
    if (!signal?.aborted) console.warn('A Scryfall lookup for the scanner failed', set, number, e);
    return null;
  }
}

/**
 * The card a collector strip's text names, by elimination: the quick way
 * first (the printing looked up directly, taken when the rarity and artist
 * read agree with it); then Scryfall asked for the set and number clues
 * together; then, if no card is clearly ahead, that set's cards of the
 * rarity and the artist's cards. A card printed in another language is
 * refused ({ foreign }), as before, except a Japanese-only printing the app
 * knows.
 * @param {string} text  what the OCR read
 * @param {Set<string>} known  every set code, upper case
 * @param {{ manual?: boolean, pattern?: RegExp, search?: (q: string, opts?: object) => Promise<object[]>,
 *   lookup?: (set: string, number: string, opts?: object) => Promise<object|null>, signal?: AbortSignal,
 *   onCandidates?: (likely: { card: object, score: number }[]) => void }} [opts]
 *   manual: a card a little less clearly ahead is taken; pattern: mtgscan's set-code pattern,
 *   whose own parse is a clue too (a set code run into its number: "HOB0113"); search and
 *   lookup: Scryfall's (tests pass their own); signal: the look's, its requests dropped when the
 *   card's time is up; onCandidates: told the likeliest cards found, whether or not one is taken
 *   (decision 549)
 * @returns {Promise<{ card: object, score: number, quick?: boolean, sure?: boolean }|{ foreign: string }|null>}
 *   quick: taken on the direct lookup, no search asked; sure: every clue agrees (isSure)
 */
export async function resolveText(text, known, {
  manual = false, pattern = null, search = scry.searchQuick, lookup = scry.cardBySetNumber,
  signal = null, onCandidates = null,
} = {}) {
  const key = `${manual ? 'm' : 'a'}:${String(text).trim()}`;
  if (remembered.has(key)) {
    const kept = remembered.get(key);
    onCandidates?.(kept.likely);
    return kept.out;
  }
  const { clues, top, direct, narrow, wider } = planFor(text, known, pattern);
  const take = manual ? TAKE.manual : TAKE.auto;
  const pool = new Map();
  let failed = false;
  const ask = async (q) => {
    try {
      for (const c of await search(q, { signal, timeoutMs: SEARCH_MS })) pool.set(c.id, c);
    } catch (e) {
      failed = true;
      if (!signal?.aborted) console.warn('A Scryfall search for the scanner failed', q, e);
    }
  };
  let found = null;

  // The quick way: the printings looked up directly; taken when the rarity and artist read agree
  // with it (and only one such card).
  const looked = await Promise.all(direct.map((d) => lookUp(lookup, d, () => { failed = true; }, signal)));
  const agreed = [...new Map(looked.filter((c) => confirms(c, clues)).map((c) => [c.id, c])).values()];
  const quick = agreed.length === 1 ? scoreCard(agreed[0], clues) : 0;
  if (quick >= QUICK) found = { card: agreed[0], score: quick, quick: true, sure: isSure(agreed[0], clues, top) };

  if (!found && narrow) {
    await ask(narrow);
    found = pickBest(pool, clues, take);
  }
  // Still no card clearly ahead: that set's cards of that rarity, and the artist's cards, in one search.
  if (!found && wider) {
    await ask(wider);
    found = pickBest(pool, clues, take);
  }
  const out = refuseForeign(found, clues);
  // The likeliest, for the pick list at 3 s: the printings looked up as well as the searches' cards.
  // None from a strip in another language: it's added on the computer.
  const likely = out?.foreign ? [] : likeliest([...looked, ...pool.values()], clues);
  if (!failed) remembered.set(key, { out, likely });
  onCandidates?.(likely);
  return out;
}

/**
 * The card the OCR's readings name: each reading that holds a digit, best
 * first, resolved by elimination; the first card clearly ahead.
 * @param {{ text: string, score: number }[]} attempts
 * @param {Set<string>} known
 * @param {object} [opts]  as resolveText's (onCandidates told once per reading resolved)
 */
export async function resolveReadings(attempts, known, opts) {
  for (const a of attempts.slice(0, 3)) {
    if (!/\d/.test(a.text ?? '')) continue;
    const found = await resolveText(a.text, known, opts);
    if (found) return found;
  }
  return null;
}

/**
 * Scan card's way, for best accuracy: every reading's clues; every
 * printing they point at looked up and every search they call for asked
 * (none skipped because a card was already found); all the cards found
 * scored together, each by the reading it fits best; the best taken when
 * it's ahead by Scan card's measure (5, and 1 ahead). Steps go on the
 * loading bar as they're planned and done (progress.js), and the `resolve`
 * step planned before the readings were known is dropped.
 * @param {string[]} texts  the readings: the strip's, the card's line's
 * @param {Set<string>} known
 * @param {{ pattern?: RegExp, search?: Function, lookup?: Function, progress?: object, signal?: AbortSignal,
 *   onCandidates?: Function }} [opts]  signal and onCandidates: as resolveText's (decision 549)
 * @returns {Promise<{ card: object, score: number }|{ foreign: string }|null>}
 */
export async function resolveThorough(texts, known, {
  pattern = null, search = scry.searchQuick, lookup = scry.cardBySetNumber, progress = null,
  signal = null, onCandidates = null,
} = {}) {
  const plans = [...new Set(texts.map((t) => String(t ?? '').trim()))]
    .filter((t) => /\d/.test(t))
    .map((t) => planFor(t, known, pattern));
  const direct = new Map(plans.flatMap((p) => p.direct.map(([set, n]) => [`${set}/${n}`.toLowerCase(), [set, n]])));
  const queries = [...new Set(plans.flatMap((p) => [p.narrow, p.wider]).filter(Boolean))];
  progress?.drop('resolve');
  if (direct.size) progress?.plan('lookups', STEP_MS.lookup * Math.ceil(direct.size / 3));
  queries.forEach((q, i) => progress?.plan(`search-${i}`, STEP_MS.search));
  if (!plans.length) return null;

  const pool = new Map();
  if (direct.size) {
    progress?.start('lookups');
    const looked = await Promise.all([...direct.values()].map((d) => lookUp(lookup, d, () => {}, signal)));
    for (const c of looked) if (c) pool.set(c.id, c);
    progress?.finish('lookups');
  }
  for (const [i, q] of queries.entries()) {
    if (signal?.aborted) break;
    progress?.start(`search-${i}`);
    try {
      for (const c of await search(q, { signal, timeoutMs: SEARCH_MS })) pool.set(c.id, c);
    } catch (e) {
      if (!signal?.aborted) console.warn('A Scryfall search for the scanner failed', q, e);
    }
    progress?.finish(`search-${i}`);
  }

  // Each card by the reading it fits best.
  const ranked = [...pool.values()].map((card) => {
    let best = { card, score: -Infinity, clues: null };
    for (const p of plans) {
      const score = scoreCard(card, p.clues);
      if (score > best.score) best = { card, score, clues: p.clues };
    }
    return best;
  }).sort((a, b) => b.score - a.score);
  onCandidates?.(ranked.filter((r) => r.score >= CANDIDATE_MIN).slice(0, CANDIDATES).map(({ card, score }) => ({ card, score })));
  const [first, next] = ranked;
  if (!first || first.score < TAKE.manual.score) return null;
  if (next && first.score - next.score < TAKE.manual.lead) return null;
  return refuseForeign({ card: first.card, score: first.score }, first.clues);
}
