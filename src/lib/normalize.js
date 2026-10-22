// Name folding for search (Collection Manager README "Card names", spec 3.1):
// trim and collapse whitespace, fold typographic quotes and dashes to ASCII,
// Æ → ae, strip accents, casefold. Japanese kana keep their marks.

const FOLDS = [
  [/[‘’‚‛′`´]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[‐-―−]/g, '-'],
];

/** @param {string} input */
export function nameKey(input) {
  let s = String(input ?? '');
  for (const [pattern, ascii] of FOLDS) s = s.replace(pattern, ascii);
  s = s.replace(/Æ/g, 'Ae').replace(/æ/g, 'ae');
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

// Scryfall's and TCGdex's name searches don't fold accents: "nazgul" finds no Nazgûl, "flabebe" no
// Flabébé (checked 2026-10-22). The names already loaded for the typo correction say which plain
// word is which accented one (decision 446).

const PLAIN = /^[\x20-\x7e]+$/;

/**
 * Every word with an accent (or Æ) in a list of card names, under its plain spelling:
 * "nazgul" → ["Nazgûl"], "lim-dul's" → ["Lim-Dûl's"]. Built once a list loads.
 * @param {string[]} names
 * @returns {Map<string, string[]>}
 */
export function accentedWords(names) {
  const out = new Map();
  for (const name of names) {
    if (PLAIN.test(name)) continue;
    for (const word of name.split(/\s+/)) {
      if (!word || PLAIN.test(word)) continue;
      const key = nameKey(word);
      const list = out.get(key);
      if (!list) out.set(key, [word]);
      else if (!list.includes(word)) list.push(word);
    }
  }
  return out;
}

/**
 * The accented words a word typed without accents may stand for: those whose plain spelling
 * contains it ("nazgu" → ["Nazgûl"]), at most `max`. None for a word typed with its accents, or
 * under 3 letters.
 * @param {string} word
 * @param {Map<string, string[]>} accented  accentedWords'
 * @returns {string[]}
 */
export function spellingsOf(word, accented, max = 4) {
  const key = nameKey(word);
  if (key.length < 3 || !PLAIN.test(word)) return [];
  const out = [];
  for (const [plain, words] of accented) {
    if (plain.includes(key)) out.push(...words);
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

/**
 * A name with each word typed without accents put back as the one accented word it stands for
 * ("flabebe" → "Flabébé", "pokemon center lady" → "Pokémon Center Lady"), for a search that takes
 * one name (TCGdex's). A word that could be several, or none, stays as typed.
 * @param {string} name
 * @param {Map<string, string[]>} accented  accentedWords'
 * @returns {string}
 */
export function withAccents(name, accented) {
  return String(name ?? '').split(/(\s+)/).map((w) => {
    if (!PLAIN.test(w) || !w.trim()) return w;
    const words = accented.get(nameKey(w));
    return words?.length === 1 ? words[0] : w;
  }).join('');
}
