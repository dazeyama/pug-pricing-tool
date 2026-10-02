// The price ladder (spec 8.7), on its own so pure code (the Sell Price, its
// tests) can use it without the network helpers in prices.js.

import { roundDownPrice } from './money.js';

export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];

// A fallback that would show the same as (or more than) the condition above
// it goes this far below that condition's price instead (owner, 2026-09-29).
const CAP_STEP = { mtg: 10, pokemon: 15 };
// Where a fallback base price came from, for tooltips.
const BASE_NAMES = { scryfall_fallback: 'Scryfall', tcgdex_fallback: 'TCGdex', cardmarket: 'Cardmarket' };

/**
 * The five prices shown, NM down to DMG (spec 8.7): JustTCG's where it has
 * one, otherwise a fallback, i.e. a base price × the condition's Master
 * Fallback Percentage. The base is JustTCG's own NM price when it has one,
 * else the Scryfall/TCGdex price (owner, 2026-09-29). Prices never rise as
 * the condition drops: a JustTCG price above the better condition's is
 * thrown out and replaced by a fallback; and a fallback that would show the
 * same as or more than the better condition is set 10% (Magic) or 15%
 * (Pokémon) below it instead, or a quarter below where that would still
 * round to the same price. Then every price is rounded down by the store's
 * steps.
 * @param {Record<string, number|null>} market  JustTCG prices by condition (conditionPrices)
 * @param {{ price: number, source: string }|null} fallback  the Scryfall/TCGdex market price
 * @param {Record<string, number>} pct  Master Fallback Percentages for the game
 * @param {'mtg'|'pokemon'} game
 * @returns {Record<string, { price: number|null, raw: number|null, source: 'justtcg'|'fallback'|null,
 *   base: { price: number, from: string }|null, thrownOut: number|null,
 *   cap: { code: string, pct: number, from: number, was: number, quarter: boolean }|null }>}
 */
export function priceLadder(market, fallback, pct, game) {
  const out = {};
  let base = null;
  if (market?.NM != null) base = { price: market.NM, from: 'JustTCG' };
  else if (fallback) base = { price: fallback.price, from: BASE_NAMES[fallback.source] ?? 'fallback' };
  let prev = null;          // the better condition's price, unrounded
  let prevCode = null;
  for (const code of CONDITIONS) {
    let raw = market?.[code] ?? null;
    let thrownOut = null;
    if (raw != null && prev != null && raw > prev) {
      thrownOut = raw;
      raw = null;
    }
    const entry = { raw, source: raw != null ? 'justtcg' : null, base: null, thrownOut, cap: null };
    if (raw == null) {
      let value = base && pct?.[code] != null ? (base.price * Number(pct[code])) / 100 : null;
      // Compared as shown (rounded), so two conditions never show one price.
      if (value != null && prev != null && roundDownPrice(value) >= roundDownPrice(prev)) {
        const step = CAP_STEP[game] ?? CAP_STEP.mtg;
        entry.cap = { code: prevCode, pct: step, from: prev, was: value, quarter: false };
        value = (prev * (100 - step)) / 100;
        // $1–$2.50 rounds to the quarter, so 10% (or 15%) down can still show
        // the same price ($1.20 and $1.08 both show $1): drop a full quarter
        // below the shown price instead (owner, 2026-09-29).
        if (roundDownPrice(value) >= roundDownPrice(prev)) {
          value = Math.max(0, Math.round(roundDownPrice(prev) * 100) - 25) / 100;
          entry.cap.quarter = true;
        }
      }
      Object.assign(entry, { raw: value, source: value != null ? 'fallback' : null, base });
    }
    entry.price = roundDownPrice(entry.raw);
    out[code] = entry;
    if (entry.raw != null) {
      prev = entry.raw;
      prevCode = code;
    }
  }
  return out;
}


/**
 * A saved line's ladder from today's data, as the Price screen would build it
 * now (spec 8.7): the buy's override (Use Fallback / Use Cardmarket) when it
 * can apply today, and Cardmarket on its own for a Japanese Pokémon card
 * with no JustTCG price. Used by the export's Sell Price and REPRICE?.
 * @param {{ game?: string, lang?: string, price_snapshot?: { override?: string|null } }} line
 * @param {{ market?: Record<string, number|null>, fallback?: object|null, cardmarketUsd?: number|null }} today
 * @param {Record<string, number>} pct  Master Fallback Percentages for the line's game
 */
export function ladderFor(line, today, pct) {
  const market = today.market ?? {};
  const anyMarket = CONDITIONS.some((c) => market[c] != null);
  const wanted = line.price_snapshot?.override ?? null;
  const usable = (wanted === 'fallback' && today.fallback != null && anyMarket)
    || (wanted === 'cardmarket' && today.cardmarketUsd != null);
  const override = usable ? wanted : null;
  const auto = !override && line.game === 'pokemon' && line.lang === 'ja' && today.cardmarketUsd != null && !anyMarket;
  const base = override === 'cardmarket' || auto
    ? { price: today.cardmarketUsd, source: 'cardmarket' }
    : today.fallback ?? null;
  return { ladder: priceLadder(override ? {} : market, base, pct, line.game ?? 'mtg'), wanted, override, auto };
}

/** The fallback bases that are TCGplayer's Market Price (Scryfall's usd, TCGdex's marketPrice). */
const TCGPLAYER_BASES = new Set(['Scryfall', 'TCGdex']);

/** Is a fallback's base TCGplayer's Market Price (through Scryfall or TCGdex)? */
export const isTcgplayerBase = (entry) => TCGPLAYER_BASES.has(entry?.base?.from);

/**
 * A ladder price that is TCGplayer's Market Price itself, not a ratio of it
 * (owner, 2026-10-02): from Scryfall / TCGdex, at the condition's 100%, not
 * capped below a better condition. Shown as "TCGplayer"; every other
 * fallback stays "fallback".
 * @param {object} entry  a priceLadder entry
 * @param {number|string} conditionPct  the condition's Master Fallback Percentage
 */
export function isTcgplayerPrice(entry, conditionPct) {
  return entry?.source === 'fallback' && !entry.cap && isTcgplayerBase(entry) && Number(conditionPct) === 100;
}
