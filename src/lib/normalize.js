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
