// Promo cards that print "PRM" for their set (owner, 2026-10-19: Etali,
// Primal Storm "refused to scan in any way"; decision 313). Promos of about
// 2018–2019 print "100/196 P / PRM ★ EN": PRM where the set code goes. On
// Scryfall "prm" is Magic Online's promos (digital, so the scanner never
// takes it as a set), and the paper card sits in its main set's promo set
// ("prix", Rivals of Ixalan Promos) numbered 100p, 100s or 100★. So the
// "100/196" names the main set by its size (196: Rivals of Ixalan), that
// set's card 100 names the card, and its promo printings of that number are
// the ones it can be.

import * as scry from '../lib/scryfall.js';
import { artistIn } from './printingMatch.js';
import { titleKey } from './nameMatch.js';
import { editDistance } from './resolve.js';

/** The strip prints PRM where a set code goes. Pure. */
export const isPromoStrip = (text) => /(^|[^A-Z0-9])P ?R ?M([^A-Z0-9]|$)/.test(String(text ?? '').toUpperCase());

/** The "100/196" on a strip: { number: '100', size: 196 }, or null. Pure. */
export function promoNumber(texts) {
  for (const text of texts) {
    const m = /(?<![\d/])0*(\d{1,4})\s*\/\s*0*(\d{2,4})(?![\d/])/.exec(String(text ?? ''));
    if (m && Number(m[1]) <= Number(m[2]) + 40) return { number: m[1], size: Number(m[2]) };
  }
  return null;
}

/**
 * The promo printings a PRM strip can be (decision 313), each main set of
 * the size read tried (sizes repeat: 280 is Zendikar Rising and Core Set
 * 2019).
 * @param {string[]} texts  the strip's readings
 * @param {{ sets?: Map<string, object>, lookup?: (set: string, number: string) => Promise<object|null>,
 *   printings?: (name: string) => Promise<object[]> }} [deps]  Scryfall's (tests pass their own)
 * @returns {Promise<{ name: string, cards: object[], all: object[] }|null>}  null: not a PRM strip,
 *   no number read, or no promo found
 */
export async function resolvePromo(texts, {
  sets = null, lookup = scry.cardBySetNumber, printings = (name) => scry.searchQuick(`!"${name.replace(/"/g, '')}"`),
} = {}) {
  if (!texts.some(isPromoStrip)) return null;
  const read = promoNumber(texts);
  if (!read) return null;
  const all = sets ?? await scry.loadSets();
  const sizeOf = (s) => s.printed_size ?? s.card_count ?? null;
  const parents = [...all.values()].filter((s) => !s.digital && s.set_type !== 'promo' && sizeOf(s) === read.size);
  const numbered = new RegExp(`^0*${read.number}(?!\\d)`);
  let name = null;
  const found = [];
  for (const parent of parents) {
    const base = await lookup(parent.code, read.number).catch(() => null);
    if (!base) continue;
    const prints = await printings(base.name).catch(() => []);
    const promos = prints.filter((c) => {
      const s = all.get(String(c.set).toLowerCase());
      return s && s.set_type === 'promo' && s.parent_set_code === parent.code && numbered.test(String(c.collector_number));
    });
    if (promos.length) {
      name ??= base.name;
      found.push(...promos);
    }
  }
  return found.length ? { name, cards: found, all: found } : null;
}

// ---------------------------------------------------------------- FNM

// Friday Night Magic promos of mid-2014 to 2018 (owner, 2026-10-19: Renegade
// Rallier went in as Prodigal Sorcerer three times; decision 327) print
// "009/012 P / FNM ★ EN": FNM where the set code goes. On Scryfall "fnm" is
// the 2000 promos (old frame, no such line), and these sit in year sets,
// f14 to f18, each numbered from 1 to 12. So a number names up to four
// cards, one a year. The artist printed on the line tells them apart (they
// differ but at number 1: Kev Walker drew 2015's and 2017's), else the title.

/** Scryfall's year sets of the FNM promos that print FNM on their line (the 2015 frame's). */
export const FNM_YEARS = ['f14', 'f15', 'f16', 'f17', 'f18'];

/** The strip prints FNM where a set code goes. Pure. */
export const isFnmStrip = (text) => /(^|[^A-Z0-9])F ?N ?M([^A-Z0-9]|$)/.test(String(text ?? '').toUpperCase());

// The artist read names one: this much of the name read, this far ahead of the next.
const ARTIST = { seen: 0.6, lead: 0.3 };
// The title read names one: this close, this far ahead of the next.
const TITLE = { near: 0.6, lead: 0.15 };

/**
 * Which of these cards a title reading names (decision 327), or null: the
 * front face's name in it, or close to it and clearly ahead. Pure.
 * @param {string} text  a reading of the title
 * @param {object[]} cards  Scryfall cards
 */
export function cardNamed(text, cards) {
  const read = titleKey(text);
  if (read.replace(/ /g, '').length < 3 || !cards.length) return null;
  const scored = cards.map((c) => {
    const key = titleKey(String(c.name ?? '').split(' // ')[0]);
    const near = key && read.includes(key) ? 1 : 1 - editDistance(read, key) / Math.max(read.length, key.length, 1);
    return { c, near };
  }).sort((a, b) => b.near - a.near);
  const [best, next] = scored;
  return best.near >= TITLE.near && best.near - (next?.near ?? 0) >= TITLE.lead ? best.c : null;
}

/**
 * The FNM promos an FNM strip can be (decision 327): each year's card of the
 * number read, the one whose artist the strip names first.
 * @param {string[]} texts  the strip's readings
 * @param {{ number?: string|null, lookup?: (set: string, number: string) => Promise<object|null> }} [opts]
 *   number: the number when the readings have no "009/012" (the one the strip's own lookup used)
 * @returns {Promise<{ cards: object[], by: 'only'|'artist'|null }|null>}  one card: it (by: why);
 *   several: the title or a pick to tell them apart; null: not an FNM strip, no number, or none found
 */
export async function resolveFnm(texts, { number = null, lookup = scry.cardBySetNumber } = {}) {
  if (!texts.some(isFnmStrip)) return null;
  const n = promoNumber(texts)?.number ?? (number == null ? null : String(number).replace(/^0+(?=\d)/, ''));
  if (!n) return null;
  const cards = (await Promise.all(FNM_YEARS.map((s) => lookup(s, n).catch(() => null))))
    .filter((c) => c && c.frame === '2015');
  if (cards.length <= 1) return cards.length ? { cards, by: 'only' } : null;
  const text = texts.join(' ');
  const scored = cards.map((c) => ({ c, seen: artistIn(text, c.artist ?? '') })).sort((a, b) => b.seen - a.seen);
  const [best, next] = scored;
  if (best.seen >= ARTIST.seen && best.seen - next.seen >= ARTIST.lead) return { cards: [best.c], by: 'artist' };
  return { cards: scored.map((s) => s.c), by: null };
}
