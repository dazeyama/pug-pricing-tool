// Cards with no price (decision 513): a project that skips pricing takes its cards without one, so no JustTCG
// request is spent on them: price_source 'unpriced', at $0 (migration 0012). The list shows a dash, the totals
// say how many aren't priced, EXPORT works out their Sell Prices as for any card, and REPRICE? prices them once
// the switch is off. Only a project (and the system collections its export copies them into) holds one.

import { isStruck } from './struck.js';

export const UNPRICED = 'unpriced';

/** A card with no price's tooltip, where its price would be. */
export const NOT_PRICED_TIP = "Not priced: added while Skip pricing was on. EXPORT works out its Sell Price; REPRICE? prices it once Skip pricing is off.";

/** A card added with no price. */
export const isUnpriced = (line) => line?.price_source === UNPRICED;

/**
 * A line's price fields when it goes in with no price (decision 514): $0 'unpriced', no market price, no
 * JustTCG listing, and of what was on screen only `snapshot` (its version, the scan it came from), since
 * nothing was looked up. A manual price typed meanwhile is a price: buildLine keeps it instead.
 * @param {object} [snapshot]
 */
export const unpricedFields = (snapshot = {}) => ({
  unit_price: 0,
  market_price: null,
  price_source: UNPRICED,
  price_snapshot: { ...snapshot, skip_pricing: true },
  priced_at: new Date().toISOString(),
  justtcg_card_id: null,
  justtcg_variant_id: null,
});

/**
 * A line's price as it stands, for an edit to keep (decision 546): its price fields as saved, and its snapshot
 * with what the edit records on top (its version).
 * @param {object} line  the line being edited
 * @param {object} [snapshot]  what the Price screen records of the edit
 */
export const keptPriceFields = (line, snapshot = {}) => ({
  unit_price: line.unit_price,
  market_price: line.market_price ?? null,
  price_source: line.price_source,
  price_snapshot: { ...(line.price_snapshot ?? {}), ...snapshot },
  priced_at: line.priced_at,
  justtcg_card_id: line.justtcg_card_id ?? null,
  justtcg_variant_id: line.justtcg_variant_id ?? null,
});

/**
 * The price fields of a card saved while Skip pricing is on (decision 514): none, since nothing was looked up.
 * But a manual price typed is a price (nothing here: buildLine's own fields stand), and an edit of a card already
 * priced keeps its price as it was (decision 546): an unpriced card is never saved over a priced one. If the edit
 * changed the printing or condition, the kept price is the old one's; REPRICE? puts it right once the switch is off.
 * @param {{ manual: number|null, edited: object|null, snapshot?: object }} p  `edited`: the line being edited, if any
 * @returns {object} the fields to spread over the line
 */
export function skipPricingFields({ manual, edited, snapshot = {} }) {
  if (manual != null) return {};
  if (edited && !isUnpriced(edited)) return keptPriceFields(edited, snapshot);
  return unpricedFields(snapshot);
}

/**
 * A TCGplayer-only Pokémon card's JustTCG card id when nothing was looked up (decision 526): its version carries it,
 * as a card known only from TCGplayer does, so the line keeps it and REPRICE?, SAVE EDIT and Convert to buy find the
 * card again. None for a TCGdex card on its own version, nor for Magic: they're found by their own ids.
 * @param {object} candidate  the selected card (cardSearch candidate)
 * @param {object|null} version  the Pokémon version chosen
 * @returns {string|null}
 */
export function unpricedCardId(candidate, version) {
  if (candidate?.game !== 'pokemon') return null;
  if (version?.tcgplayerOnly && version.justtcgId != null) return String(version.justtcgId);
  return candidate.source === 'justtcg' && candidate.justtcgId != null ? String(candidate.justtcgId) : null;
}

/**
 * A Pokémon line's JustTCG ids while Skip pricing is on: the card the edit names (unpricedCardId: a TCGplayer-only
 * card or version's own product) wins over a kept price's (decision 566), and the kept variant goes with it, since
 * it was the old card's. Otherwise the line's fields stand. Without this, an edit to a sibling product or another
 * card kept the old card's id, and REPRICE? (which finds a TCGplayer-only line by that id) priced the old card.
 * @param {{ justtcg_card_id?: string|null, justtcg_variant_id?: string|null }} fields  the line's fields so far
 * @param {string|null} own  unpricedCardId's answer for the edit's card and version
 * @returns {{ justtcg_card_id: string|null, justtcg_variant_id: string|null }}
 */
export function skippedJusttcgIds(fields, own) {
  const kept = { justtcg_card_id: fields.justtcg_card_id ?? null, justtcg_variant_id: fields.justtcg_variant_id ?? null };
  if (own == null || own === kept.justtcg_card_id) return kept;
  return { justtcg_card_id: own, justtcg_variant_id: null };
}

/** The price a line is said to be at (the phone's strip, decision 514): none for a card with no price. */
export const priceOf = (line) => (isUnpriced(line) ? null : line?.unit_price ?? null);

/** A card that shows no price: one with none, unless an export has given it a Sell Price since. */
export const showsNoPrice = (line) => isUnpriced(line) && line.cc_sell_price == null;

/** How many cards (copies) in a list show no price, struck ones left out. */
export const unpricedCards = (lines) =>
  lines.reduce((n, l) => (showsNoPrice(l) && !isStruck(l) ? n + Number(l.quantity) : n), 0);

/** Whether a list has cards and none of them shows a price, so its totals are no figure at all. */
export const noneShowPrice = (lines) => {
  const live = lines.filter((l) => !isStruck(l));
  return live.length > 0 && live.every(showsNoPrice);
};
