// The search-line parser (spec 8.2). The expected line is what's printed on
// the card:
//
//   <card name> <collector number>/<printed size> [<set code>]
//
// e.g. "Lightning Bolt 161/295", "Abrade 37/291 SOA", "Pikachu TG05/TG30",
// "Sol Ring". Pure functions only, so the unit tests can run under plain Node.

/**
 * @typedef {{
 *   name: string,            // everything before the number; may be partial or empty
 *   number: string|null,     // as typed: "263s", "TG05", "037"
 *   size: string|null,       // "295", "TG30"
 *   setCode: string|null,    // as typed: "soa", "OBF"
 *   setCodeFrom: 'slash'|'known'|null,  // why the last word was read as a set code
 * }} ParsedQuery
 */

// A set code: 2–6 letters or digits with at least one letter.
const SET_CODE = /^(?=.*[a-z])[a-z0-9]{2,6}$/i;
// "<number>/<size>": one slash with something on both sides.
const NUMBER_SIZE = /^([^/]+)\/([^/]+)$/;
// A collector number on its own: optional letter prefix, digits, optional
// suffix letters or star/dagger symbols ("125", "037", "263s", "TG05", "SV107",
// "123★"), or a bare symbol ("★").
const NUMBER_ONLY = /^(?:[a-z]{0,5}-?\d+[a-z★†]{0,3}|[★†])$/i;

/**
 * @param {string} input
 * @param {(token: string) => boolean} [isKnownSetCode]  true for a code some game uses
 * @returns {ParsedQuery}
 */
export function parseQuery(input, isKnownSetCode = () => false) {
  // 0. Commas are spaces (owner's decision, 2026-09-29): "Gut, True Soul
  //    Zealot" searches as "Gut True Soul Zealot", which matches more cleanly.
  const tokens = String(input ?? '').replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean);
  let setCode = null;
  let setCodeFrom = null;
  let number = null;
  let size = null;

  // 1. A trailing set code, when the word before it is "<number>/<size>" or
  //    the word is a code some game actually uses.
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    const before = tokens[tokens.length - 2];
    if (SET_CODE.test(last) && !last.includes('/')) {
      if (NUMBER_SIZE.test(before)) setCodeFrom = 'slash';
      else if (isKnownSetCode(last)) setCodeFrom = 'known';
      if (setCodeFrom) setCode = tokens.pop();
    }
  }

  // 2. "<number>/<size>" is now the last word, if there is one.
  const last = tokens[tokens.length - 1];
  const slash = last ? NUMBER_SIZE.exec(last) : null;
  if (slash) {
    tokens.pop();
    number = slash[1];
    size = slash[2];
  } else if (last && NUMBER_ONLY.test(last)) {
    // 3. A bare collector number, no slash.
    tokens.pop();
    number = last;
  }

  // 4. Everything before that is the name.
  return { name: tokens.join(' '), number, size, setCode, setCodeFrom };
}

/**
 * The same query read without its set code, for when the last word was only
 * a guess ("Ancient Mew": MEW is also a Pokémon set code). null if there's no
 * other reading.
 * @param {string} input
 * @param {ParsedQuery} parsed
 * @returns {ParsedQuery|null}
 */
export function withoutGuessedSetCode(input, parsed) {
  if (parsed.setCodeFrom !== 'known') return null;
  return parseQuery(input, () => false);
}

/** Collector numbers compare without case or leading zeros: "037" = "37", "TG05" = "tg5". */
export function normNumber(value) {
  if (value == null) return '';
  return String(value).trim().toLowerCase().replace(/^([a-z]*-?)0+(?=\d)/, '$1');
}

/** True when two collector numbers are the same number as printed. */
export function sameNumber(a, b) {
  return normNumber(a) !== '' && normNumber(a) === normNumber(b);
}

/**
 * A printed size is a plain count ("295") or a sub-set like "TG30". Only a
 * plain count can be checked against a set's size.
 * @returns {number|null}
 */
export function numericSize(size) {
  return size != null && /^\d+$/.test(String(size).trim()) ? Number(size) : null;
}

/** The letter prefix of a number or size: "TG05" → "tg", "125" → "". */
export function numberPrefix(value) {
  return (/^([a-z]*)/i.exec(String(value ?? '').trim())?.[1] ?? '').toLowerCase();
}
