// A card's name from its title as the camera read it (docs/SCAN_FUNCTION.md
// 6.2), matched against every Magic card name (Scryfall's catalog, which
// the search already keeps for typo correction). Strict on purpose: the
// best name has to be clearly ahead of the next, or there's no answer, and
// the phone says it couldn't read the card rather than add the wrong one.

import Fuse from 'fuse.js';
import { nameKey } from '../lib/normalize.js';

// Fuse's scores: 0 is exact, 1 is nothing alike.
const ACCEPT = 0.22;
const LEAD = 0.08;
// A read this much shorter than the name it matches is only part of a title
// ("Shivan" of Shivan Dragon, or of Shivan Wurm?): no answer.
const MIN_LENGTH = 0.7;
// Words cut off a read's end are short ones only (owner, 2026-10-19: "Fix this"; decision 310): the
// mana cost read as letters ("Chromatic Sphere Bh"), a stray mark. A real word of the title isn't
// cut: "{lUrza's Tower N" cut down to "Urza" named another card.
const CUT_UP_TO = 3;

/** Letters, digits and single spaces, lower case: how an OCR'd title and a name are compared. */
export const titleKey = (text) => nameKey(text).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

let built = null;   // { names, entries, byKey, fuse } for the last names list

function indexFor(names) {
  if (built?.names === names) return built;
  // A two-faced card's title is its front face's name: find it by that too.
  const entries = [];
  for (const name of names) {
    entries.push({ key: titleKey(name), name });
    if (name.includes(' // ')) entries.push({ key: titleKey(name.split(' // ')[0]), name });
  }
  const byKey = new Map();
  for (const e of entries) if (!byKey.has(e.key)) byKey.set(e.key, e.name);
  built = { names, entries, byKey, fuse: null };
  return built;
}

/** One reading of the title against every name: the clear match, or null. */
function matchKey(key, index) {
  if (key.replace(/ /g, '').length < 3) return null;
  const exact = index.byKey.get(key);
  if (exact) return { name: exact, score: 0 };
  index.fuse ??= new Fuse(index.entries, { keys: ['key'], includeScore: true, threshold: 0.4, ignoreLocation: true });
  const hits = index.fuse.search(key, { limit: 8 });
  const best = hits[0];
  if (!best || best.score > ACCEPT) return null;
  const next = hits.find((h) => h.item.name !== best.item.name);
  if (next && next.score - best.score < LEAD) return null;
  if (key.length < best.item.key.length * MIN_LENGTH) return null;
  return { name: best.item.name, score: best.score };
}

/**
 * The readings of a title worth trying, best first: as read, then without
 * the short words at its end (the mana cost read as letters, "Chromatic
 * Sphere Bh"; CUT_UP_TO letters at most, decision 310), and without a stray
 * letter or two at its start (the box's edge).
 */
export function titleKeys(text) {
  const words = titleKey(text).split(' ').filter(Boolean);
  const starts = [0];
  if (words.length > 1 && words[0].length <= 2) starts.push(1);
  const out = [];
  for (const start of starts) {
    for (let end = words.length; end > start; end--) {
      const key = words.slice(start, end).join(' ');
      if (!out.includes(key)) out.push(key);
      // The next cut drops words[end - 1]: only a short one.
      if (words[end - 1].length > CUT_UP_TO) break;
    }
  }
  return out;
}

/**
 * The card name a read title names, or null when it's not clear.
 * @param {string} text  what the OCR read
 * @param {string[]} names  every card name (scryfall.loadNames)
 * @returns {{ name: string, score: number }|null}
 */
export function matchName(text, names) {
  const index = indexFor(names);
  for (const key of titleKeys(text)) {
    const match = matchKey(key, index);
    if (match) return match;
  }
  return null;
}

// Which card? (decision 311): a looser search for the box's first guess and the names as typed.
let loose = null;
function looseFuse(names) {
  const index = indexFor(names);
  if (loose?.index !== index) {
    loose = { index, fuse: new Fuse(index.entries, { keys: ['key'], includeScore: true, threshold: 0.6, ignoreLocation: true }) };
  }
  return loose.fuse;
}

/**
 * The reader's closest name when none was clear (decision 311): the best
 * of a loose search over every reading, for the Which card? box to start
 * with; null when nothing comes near. Often wrong (the readings it's for
 * are the bad ones), so it's only ever a suggestion to correct.
 * @param {string[]} texts  the title's readings
 * @returns {{ name: string, score: number }|null}
 */
export function guessName(texts, names) {
  const fuse = looseFuse(names);
  let best = null;
  for (const text of texts) {
    for (const key of titleKeys(text)) {
      if (key.replace(/ /g, '').length < 3) continue;
      const [hit] = fuse.search(key, { limit: 1 });
      if (hit && (!best || hit.score < best.score)) best = { name: hit.item.name, score: hit.score };
    }
  }
  return best;
}

/**
 * The names that fit what's typed (decision 311), for the box's list:
 * those starting with it, then those with a word starting with it; a loose
 * search's only when none do (a typo); each name once. Pure but for the
 * shared index.
 */
export function nameSuggestions(query, names, limit = 6) {
  const key = titleKey(query);
  if (key.replace(/ /g, '').length < 2) return [];
  const index = indexFor(names);
  const out = [];
  const add = (name) => {
    if (out.length < limit && !out.includes(name)) out.push(name);
  };
  for (const e of index.entries) {
    if (out.length >= limit) break;
    if (e.key.startsWith(key)) add(e.name);
  }
  for (const e of index.entries) {
    if (out.length >= limit) break;
    if (e.key.includes(` ${key}`)) add(e.name);
  }
  // Nothing starts with it: a typo, so the loose search's closest names.
  if (!out.length) for (const h of looseFuse(names).search(key, { limit })) add(h.item.name);
  return out;
}
