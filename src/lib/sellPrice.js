// The Sell Price (docs/EXPORT_FUNCTION.md 5): each exported card's full
// market price for its condition right now, worked out the same way as when
// it was bought (the same price ladder, with the same override), rounded UP
// by the store's steps, never below the Export sell floor ($0.40 unless Settings says more;
// decision 417). A manual price gets the higher of
// it and today's price. Pure: today's data comes in.

import { ladderFor } from './ladder.js';
import { SELL_FLOOR, roundUpPrice } from './money.js';

/**
 * @typedef {object} Today
 * @property {Record<string, number|null>} market  today's JustTCG prices, NM…DMG, for the printing and finish
 * @property {{ price: number, source: string }|null} fallback  today's Scryfall price for the finish
 * @property {number|null} cardmarketUsd  today's Cardmarket price in dollars (euros × today's rate)
 * @property {Record<string, number>} pct  today's Master Fallback Percentages (Magic)
 * @property {string} [fetchedAt]
 * @property {number} [floor]  the Export sell floor (decision 417); $0.40 if left out
 */

/**
 * @param {{ condition: string, unit_price: number, market_price: number|null, price_source: string,
 *   price_snapshot?: { override?: string|null, manual?: number|null } }} line
 * @param {Today} today
 * @returns {{ price: number, value: number, basis: object }}
 *   price: the Sell Price (rounded up by steps, at least the floor); value: the same price before
 *   that rounding and floor, for the Pokémon stickers' whole dollars (decision 384)
 */
export function sellPriceFor(line, today) {
  // The ladder as the Price screen builds it (spec 8.7), with today's data and
  // the buy's override where it can apply today (ladder.js).
  const { ladder, wanted, override } = ladderFor(line, today, today.pct);
  const usable = override != null;
  const raw = ladder[line.condition]?.raw ?? null;
  const manual = line.price_source === 'manual' ? Number(line.unit_price) : null;

  let value;
  let used;
  if (manual != null) {
    // The higher of the manual price and today's price (owner, 2026-10-01);
    // with nothing to compare, the manual price alone.
    value = raw != null && raw > manual ? raw : manual;
    used = raw != null && raw > manual ? 'today' : 'manual';
  } else if (raw != null) {
    value = raw;
    used = 'today';
  } else {
    // No price at all today (no JustTCG price, no fallback): the market price
    // recorded at the buy (export spec 5.2; flagged in the build report).
    value = Number(line.market_price ?? line.unit_price);
    used = 'at_buy';
  }
  // The Export sell floor (decision 417), from Settings; $0.40 without one.
  const floor = today.floor ?? SELL_FLOOR;
  const price = Math.max(floor, roundUpPrice(value) ?? floor);
  return {
    price,
    value,
    basis: {
      source: line.price_source,
      override: wanted,
      overrideApplied: wanted ? usable : null,
      today: raw != null ? Math.round(raw * 10000) / 10000 : null,
      todayFrom: ladder[line.condition]?.source ?? null,
      manual,
      used,
      floored: price === floor && roundUpPrice(value) !== floor,
      floor,
      fetchedAt: today.fetchedAt ?? null,
    },
  };
}
