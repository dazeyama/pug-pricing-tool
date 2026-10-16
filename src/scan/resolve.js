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

import * as scry from '../lib/scryfall.js';
import { parseCollectorNumber } from './recognition/parsing.js';

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
 * The card a collector strip's text names, by elimination: Scryfall asked
 * for the set and number clues together; then, if no card is clearly
 * ahead, every card of that rarity in that set; then the artist's cards.
 * A card printed in another language is refused ({ foreign }), as before,
 * except a Japanese-only printing the app knows.
 * @param {string} text  what the OCR read
 * @param {Set<string>} known  every set code, upper case
 * @param {{ manual?: boolean, pattern?: RegExp, search?: (q: string) => Promise<object[]>,
 *   lookup?: (set: string, number: string) => Promise<object|null> }} [opts]
 *   manual: Scan card takes a card a little less clearly ahead; pattern: mtgscan's set-code
 *   pattern, whose own parse is a clue too (a set code run into its number: "HOB0113"); search
 *   and lookup: Scryfall's (tests pass their own)
 * @returns {Promise<{ card: object, score: number, quick?: boolean }|{ foreign: string }|null>}
 *   quick: taken on the direct lookup, no search asked
 */
export async function resolveText(text, known, {
  manual = false, pattern = null, search = scry.searchQuick, lookup = scry.cardBySetNumber,
} = {}) {
  const key = `${manual ? 'm' : 'a'}:${String(text).trim()}`;
  if (remembered.has(key)) return remembered.get(key);
  const clues = readClues(text, known);
  const parsed = pattern ? parseCollectorNumber(text, pattern) : null;
  if (parsed?.setCode && !clues.sets.includes(parsed.setCode)) {
    clues.sets.push(parsed.setCode);
    clues.setWeight[parsed.setCode] = 1.5;
  }
  const parsedNumber = parsed?.collectorNumber ? plainNumber(parsed.collectorNumber) : null;
  if (parsedNumber && !clues.numbers.includes(parsedNumber)) clues.numbers.push(parsedNumber);
  const take = manual ? TAKE.manual : TAKE.auto;
  const pool = new Map();
  let failed = false;
  const ask = async (q) => {
    try {
      for (const c of await search(q)) pool.set(c.id, c);
    } catch (e) {
      failed = true;
      console.warn('A Scryfall search for the scanner failed', q, e);
    }
  };
  const sets = clues.sets.map((s) => s.toLowerCase());
  let found = null;

  // The quick way: the printing the set read as printed and the number point at, and mtgscan's own
  // reading of the line (the detection before the searches), looked up directly; taken when the
  // rarity and artist read agree with it (and only one such card).
  const direct = new Map();
  const top = clues.sets.find((s) => clues.setWeight[s] === 3);
  if (top && clues.numbers[0]) direct.set(`${top}/${clues.numbers[0]}`, [top, clues.numbers[0]]);
  if (parsed?.setCode && parsedNumber) direct.set(`${parsed.setCode}/${parsedNumber}`, [parsed.setCode, parsedNumber]);
  const looked = await Promise.all([...direct.values()].map(async ([set, number]) => {
    try {
      return await lookup(set, number);
    } catch (e) {
      failed = true;
      console.warn('A Scryfall lookup for the scanner failed', set, number, e);
      return null;
    }
  }));
  const agreed = [...new Map(looked.filter((c) => confirms(c, clues)).map((c) => [c.id, c])).values()];
  const quick = agreed.length === 1 ? scoreCard(agreed[0], clues) : 0;
  if (quick >= QUICK) found = { card: agreed[0], score: quick, quick: true };

  if (!found && sets.length && clues.numbers.length) {
    await ask(`(${sets.map((s) => `set:${s}`).join(' or ')}) (${clues.numbers.map((n) => `cn:${quote(n)}`).join(' or ')})`);
    found = pickBest(pool, clues, take);
  }
  // Still no card clearly ahead: that set's cards of that rarity, and the artist's cards, in one search.
  const likely = clues.sets.filter((s) => clues.setWeight[s] >= 2);
  const word = clues.artist.split(/\s+/).map(nameLetters).sort((a, b) => b.length - a.length)[0] ?? '';
  const wider = [];
  if (likely.length && clues.rarity) wider.push(`(set:${likely[0].toLowerCase()} r:${clues.rarity})`);
  if (word.length >= 4) {
    wider.push(`(a:${quote(word.toLowerCase())}${sets.length ? ` (${sets.map((s) => `set:${s}`).join(' or ')})` : ''})`);
  }
  if (!found && wider.length) {
    await ask(wider.join(' or '));
    found = pickBest(pool, clues, take);
  }
  let out = found;
  if (found && clues.lang && clues.lang !== 'EN' && !(found.card.lang === 'ja' && /^J[PA]$/.test(clues.lang))) {
    out = { foreign: clues.lang };
  }
  if (!failed) remembered.set(key, out);
  return out;
}

/**
 * The card the OCR's readings name: each reading that holds a digit, best
 * first, resolved by elimination; the first card clearly ahead.
 * @param {{ text: string, score: number }[]} attempts
 * @param {Set<string>} known
 * @param {object} [opts]  as resolveText's
 */
export async function resolveReadings(attempts, known, opts) {
  for (const a of attempts.slice(0, 3)) {
    if (!/\d/.test(a.text ?? '')) continue;
    const found = await resolveText(a.text, known, opts);
    if (found) return found;
  }
  return null;
}
