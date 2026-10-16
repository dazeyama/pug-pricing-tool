// Pricing a card a phone scanned (docs/SCAN_FUNCTION.md 7.1), on the
// computer it's paired with. Pure, for tests: the caller fetches what's
// needed (the Scryfall card, JustTCG's prices only if asked for) and builds
// the line with buildLine, as ADD CARD does.
//
// The owner's order (2026-10-16): TCGplayer > JustTCG > Cardmarket > ask.
//  1. TCGplayer's market price, which comes free on the Scryfall card
//     (prices.usd / usd_foil / usd_etched): the ladder run as if Use
//     TCGplayer were pressed (override 'fallback'). No JustTCG request.
//  2. JustTCG, only when Scryfall has no price for the finish: its price for
//     the condition, else its NM × the condition's percentage.
//  3. Cardmarket (prices.eur… on the same card, in dollars at the day's
//     rate), as if Use Cardmarket were pressed (override 'cardmarket').
//  4. Nothing: the phone asks for a price.
import { priceLadder } from './ladder.js';

/**
 * @param {object} p
 * @param {string} p.condition  'NM'…'DMG'
 * @param {{ price: number, source: string }|null} p.tcgplayer  fallbackPrice(): Scryfall's price for the finish
 * @param {Record<string, number|null>|undefined} p.market  JustTCG's prices by condition;
 *   undefined while not fetched (the answer then says whether to fetch them), {} when there are none
 * @param {number|null} p.cardmarketUsd  Cardmarket's price in dollars, or null
 * @param {Record<string, number|string>} p.pct  Magic's Master Fallback Percentages
 * @param {boolean} [p.up]  round up, a project's prices (owner, 2026-10-10)
 * @returns {{ step: 'tcgplayer'|'justtcg'|'cardmarket'|'none'|'needs_justtcg',
 *   ladder: object|null, override: 'fallback'|'cardmarket'|null, entry: object|null }}
 */
export function scanQuote({ condition, tcgplayer, market, cardmarketUsd, pct, up = false }) {
  const opts = { up };
  const priced = (ladder) => ladder[condition]?.price != null;
  if (tcgplayer && tcgplayer.price > 0) {
    const ladder = priceLadder({}, tcgplayer, pct, 'mtg', opts);
    if (priced(ladder)) return { step: 'tcgplayer', ladder, override: 'fallback', entry: ladder[condition] };
  }
  if (market === undefined) return { step: 'needs_justtcg', ladder: null, override: null, entry: null };
  if (Object.values(market ?? {}).some((v) => v != null)) {
    const ladder = priceLadder(market, null, pct, 'mtg', opts);
    if (priced(ladder)) return { step: 'justtcg', ladder, override: null, entry: ladder[condition] };
  }
  if (cardmarketUsd != null && cardmarketUsd > 0) {
    const ladder = priceLadder({}, { price: cardmarketUsd, source: 'cardmarket' }, pct, 'mtg', opts);
    if (priced(ladder)) return { step: 'cardmarket', ladder, override: 'cardmarket', entry: ladder[condition] };
  }
  return { step: 'none', ladder: null, override: null, entry: null };
}

/**
 * The finish a scan is sent as (5.3), from the phone's Normal | Foil switch
 * and the finishes the printing exists in: a foil-only printing is foil
 * whatever the switch says, an etched-only one etched, and Foil on a
 * printing with no foil is its etched, else its non-foil.
 * @param {{ finishes?: string[] }} card  a Scryfall card
 * @param {boolean|'nonfoil'|'foil'|'etched'} wanted  the switch (true = Foil), or a finish asked for
 * @returns {'nonfoil'|'foil'|'etched'}
 */
export function scanFinish(card, wanted) {
  const has = card?.finishes?.length ? card.finishes : ['nonfoil'];
  const want = wanted === true ? 'foil' : wanted === false || wanted == null ? 'nonfoil' : wanted;
  if (has.includes(want)) return want;
  if (want !== 'nonfoil') return has.includes('foil') ? 'foil' : has.includes('etched') ? 'etched' : has[0];
  return has.includes('nonfoil') ? 'nonfoil' : has[0];
}

/** "Lightning Bolt (2X2) 117 *F* [LP]": a scan as the strip shows it, the list's way (spec 8.9). */
export function scanText({ name, set_code: set, collector_number: number, finish, condition }) {
  const mark = finish === 'foil' ? ' *F*' : finish === 'etched' ? ' *E*' : '';
  const cond = condition && condition !== 'NM' ? ` [${condition}]` : '';
  return `${name} (${String(set ?? '').toUpperCase()}) ${number ?? ''}${mark}${cond}`.replace(/\s+/g, ' ').trim();
}

/** Over this TCGplayer price a card gets the brighter chime when it's sent (owner, 2026-10-16). */
export const PRICEY_USD = 3;

/**
 * The card's TCGplayer price for the finish, as Scryfall gives it on the
 * card the phone read (prices.usd / usd_foil / usd_etched), before the
 * condition and rounding the computer applies; null when Scryfall has none.
 */
export function scanTcgPrice(card, finish) {
  const p = card?.prices ?? {};
  const raw = { nonfoil: p.usd, foil: p.usd_foil, etched: p.usd_etched }[finish];
  const price = raw != null ? Number(raw) : NaN;
  return Number.isNaN(price) ? null : price;
}

/** Over $3 at TCGplayer for its finish: the phone's chime for it is the brighter one. */
export function isPricey(card, finish) {
  const price = scanTcgPrice(card, finish);
  return price != null && price > PRICEY_USD;
}
