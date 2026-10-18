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
