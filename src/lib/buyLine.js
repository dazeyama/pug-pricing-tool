// Building a buy line (spec 6.1, 8.8) from what the Price screen shows: the
// selected printing, its finish or version, the condition, quantity and the
// price the table gives it.
import { CONDITIONS } from './prices.js';
import { magicTreatments } from './printings.js';
import { nameKey } from './normalize.js';
import * as scry from './scryfall.js';
import { skipPricingFields, unpricedCardId } from './unpriced.js';

// Where a fallback price came from → price_source (owner, 2026-09-29).
const FALLBACK_SOURCES = {
  JustTCG: 'justtcg_fallback', Scryfall: 'scryfall_fallback', TCGdex: 'tcgdex_fallback', Cardmarket: 'cardmarket',
};

/**
 * The line's price_source: 'manual'; 'justtcg' for JustTCG's own price for
 * the condition; or where a fallback's base price came from.
 * @param {{ source: string|null, base: { from: string }|null }} entry  the price ladder's entry
 */
export function priceSource(entry, manual) {
  if (manual != null) return 'manual';
  if (entry?.source === 'justtcg') return 'justtcg';
  return FALLBACK_SOURCES[entry?.base?.from] ?? 'manual';
}

const cents = (n) => (n == null ? null : Math.round(n * 100) / 100);

/**
 * A Magic printing in a finish as a line names it, without its price or
 * quantity: what buildLine saves, and what the owned-copies counter matches
 * to a Crystal Commerce product as the export would (decision 448).
 * @param {object} c  the selected card (cardSearch candidate, Magic)
 * @param {string} finish
 */
export function magicPrinting(c, finish) {
  const card = c.scryfall;
  return {
    game: 'mtg',
    // A Japanese-only printing is a Japanese card: "[JP]" on the line (owner, 2026-10-16).
    lang: card.lang === 'ja' ? 'ja' : 'en',
    name: card.name,
    name_en: null,
    name_key: nameKey(card.name),
    set_code: card.set.toUpperCase(),
    set_name: card.set_name ?? null,
    source_set_id: card.set,
    collector_number: card.collector_number,
    printed_size: c.printedSize ?? null,
    rarity: card.rarity ?? null,
    finish,
    first_edition: false,
    treatments: magicTreatments(card, finish),
    scryfall_id: card.id,
    oracle_id: card.oracle_id ?? card.card_faces?.[0]?.oracle_id ?? null,
    tcgdex_id: null,
    tcgplayer_id: String((finish === 'etched' && card.tcgplayer_etched_id) || card.tcgplayer_id || '') || null,
  };
}

/**
 * The line to save (a buy_lines row without ids or position).
 * @param {object} p
 * @param {object} p.candidate  the selected card (cardSearch candidate)
 * @param {string|null} p.finish  Magic finish
 * @param {object|null} p.version  Pokémon version (printings.pokemonVersions)
 * @param {object|null} p.pokemonCard  TCGdex full card
 * @param {string} p.condition
 * @param {number} p.quantity
 * @param {Record<string, object>} p.ladder  priceLadder's entries
 * @param {number|null} p.manual
 * @param {object} p.snapshot  what else was on screen, kept as price_snapshot
 * @param {object|null} p.result  the JustTCG result for the printing ({ card, fetchedAt })
 * @param {object|null} p.variant  the JustTCG variant for the condition
 * @param {string|null} p.imageUrl
 * @param {string|null} [p.englishName]  a Japanese card's English name (pokemonNames.js)
 * @param {boolean} [p.unpriced]  a project's Skip pricing is on (decision 514): no price, unless one was typed
 * @param {object|null} [p.edited]  the line being edited (SAVE EDIT): while Skip pricing is on, its price is kept
 *   when it has one (decision 546)
 */
export function buildLine({
  candidate: c, finish, version, pokemonCard, condition, quantity, ladder, manual, snapshot, result, variant, imageUrl,
  englishName, unpriced = false, edited = null,
}) {
  const entry = ladder[condition];
  const unitPrice = manual ?? entry?.price;
  const common = {
    condition,
    quantity,
    unit_price: unitPrice,
    // The market price for this condition before rounding (JustTCG's, or the
    // fallback it came to), even when a manual price was typed (spec 6.1).
    market_price: cents(entry?.raw),
    price_source: priceSource(entry, manual),
    price_snapshot: {
      conditions: Object.fromEntries(CONDITIONS.map((code) => [code, {
        price: ladder[code]?.price ?? null,
        raw: ladder[code]?.raw ?? null,
        source: ladder[code]?.source ?? null,
        from: ladder[code]?.base?.from ?? null,
      }])),
      ...snapshot,
    },
    priced_at: result?.fetchedAt ?? new Date().toISOString(),
    justtcg_card_id: result?.card ? String(result.card.uuid ?? result.card.id) : null,
    justtcg_variant_id: variant ? String(variant.uuid ?? variant.id) : null,
    image_url: imageUrl ?? null,
    // Skip pricing (decision 514): nothing was looked up, so no price; a manual price typed is still one, and an
    // edit of a card already priced keeps its price (decision 546).
    ...(unpriced ? skipPricingFields({ manual, edited, snapshot }) : {}),
  };

  if (c.game === 'mtg') {
    return {
      ...common,
      ...magicPrinting(c, finish),
      image_url: imageUrl ?? scry.cardImage(c.scryfall, 'small') ?? null,
    };
  }
  return {
    ...common,
    game: 'pokemon',
    lang: c.lang,
    name: c.name,
    name_en: c.lang === 'ja' ? englishName || null : null,
    name_key: nameKey(c.name),
    set_code: c.setCode,
    set_name: c.setName ?? null,
    source_set_id: c.setId,
    collector_number: c.number,
    printed_size: c.printedSize ?? pokemonCard?.set?.cardCount?.official ?? null,
    rarity: pokemonCard?.rarity ?? c.rarity ?? null,
    finish: version.finish,
    first_edition: Boolean(version.firstEdition),
    treatments: [...(version.treatments ?? [])].sort(),
    scryfall_id: null,
    oracle_id: null,
    tcgdex_id: c.tcgdexId ?? null,   // none for a card known only from TCGplayer
    tcgplayer_id: version.tcgplayerId ?? null,
    // Skip pricing (decision 526): no price result to take the JustTCG card id from, so a TCGplayer-only card keeps
    // its own; without it the line could never be found again (REPRICE?, SAVE EDIT, Convert to buy).
    justtcg_card_id: common.justtcg_card_id ?? (unpriced ? unpricedCardId(c, version) : null),
  };
}
