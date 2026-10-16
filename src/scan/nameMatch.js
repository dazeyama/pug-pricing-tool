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
 * the words at its end (the mana cost read as letters, "Chromatic Sphere
 * Bh"), and without a stray letter or two at its start (the box's edge).
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
