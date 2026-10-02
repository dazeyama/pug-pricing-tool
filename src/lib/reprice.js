// REPRICE? on a collection (owner, 2026-10-01): every card's buy price
// brought up to today's prices, the way it was priced (the same ladder, its
// Use Fallback / Use Cardmarket, rounded down like any buy price). For a
// project worked on for weeks. Manual prices stay as typed (their market
// figures are refreshed); a card with no price today keeps its price.
// Today's data comes from todaysPrices.js, as the export's does.

import { CONDITIONS, ladderFor } from './ladder.js';
import { priceSource } from './buyLine.js';

const cents = (n) => (n == null ? null : Math.round(n * 100) / 100);

/**
 * One line repriced, as collection_reprice takes it, or { kept: 'no_price' }
 * when today has nothing for it.
 * @param {object} line  a buy_lines row
 * @param {import('./todaysPrices.js').Today} today
 * @param {Record<string, number>} pct  the Master Fallback Percentages for its game
 */
export function repricedLine(line, today, pct) {
  const { ladder, wanted, override, auto } = ladderFor(line, today, pct);
  const entry = ladder[line.condition];
  const manual = line.price_source === 'manual';
  if (!manual && entry?.price == null) return { line_id: line.id, kept: 'no_price' };
  const variant = entry?.source === 'justtcg' ? today.variants?.[line.condition] ?? null : null;
  return {
    line_id: line.id,
    kept: manual ? 'manual' : null,
    unit_price: manual ? Number(line.unit_price) : entry.price,
    market_price: entry?.raw != null ? cents(entry.raw) : line.market_price,
    price_source: manual ? 'manual' : priceSource(entry, null),
    price_snapshot: {
      ...(line.price_snapshot ?? {}),
      conditions: Object.fromEntries(CONDITIONS.map((code) => [code, {
        price: ladder[code]?.price ?? null,
        raw: ladder[code]?.raw ?? null,
        source: ladder[code]?.source ?? null,
        from: ladder[code]?.base?.from ?? null,
      }])),
      justtcg: today.market ?? null,
      fallback: today.fallback ?? null,
      cardmarket: today.cardmarketEur != null ? { eur: today.cardmarketEur, rate: today.rate } : null,
      // The buy's own choice stays, even when it couldn't apply today.
      override: wanted,
      override_applied: wanted ? override != null : null,
      auto_cardmarket: auto,
      repriced_at: new Date().toISOString(),
    },
    priced_at: today.fetchedAt ?? new Date().toISOString(),
    justtcg_card_id: today.result?.card ? String(today.result.card.uuid ?? today.result.card.id) : line.justtcg_card_id ?? null,
    justtcg_variant_id: variant ? String(variant.uuid ?? variant.id) : null,
  };
}
