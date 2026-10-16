import { useSettings } from '../../state/settings.jsx';
import { useEurUsd } from '../../lib/useEurUsd.js';
import { useEnglishPokemonName } from '../../lib/pokemonNames.js';
import { priceTrend } from '../../lib/priceTrend.js';
import { usePrices } from './usePrices.js';
import {
  CONDITIONS, cardmarketPrice, conditionPrices, conditionVariants, fallbackPrice, priceLadder, priceWarnings,
  resultFor,
} from '../../lib/prices.js';

/**
 * The selected card's prices (PricingScreen; FABLE_REPORT C1): JustTCG's for
 * the chosen printing, the fallbacks, Cardmarket's, the five prices shown and
 * used (the ladder), the reasons to doubt them, and their sharp moves. Worked
 * out afresh every render from what's chosen; no state of its own.
 */
export function usePriceQuote({
  card, selected, bulk, pokemon, versions, version, finish, magic, search, override, roundUp,
}) {
  // A Japanese card's English name (Pokédex number): shown beside the
  // Japanese one, and used for JustTCG, TCGplayer and Cardmarket searches.
  const englishName = useEnglishPokemonName(pokemon.card, card?.lang);
  const prices = usePrices(card, {
    pokemon, versions, jaName: englishName || search.parsed?.name, waitName: englishName === undefined,
  });
  const result = resultFor(card, prices.results, { finish, version, versions });
  const variantOpts = {
    game: card?.game,
    lang: card?.lang,
    finish: magic ? finish : version?.finish,
    firstEdition: version?.firstEdition,
  };
  const market = conditionPrices(result?.card, variantOpts);
  const fallback = fallbackPrice(card, { finish, version });
  const { values: settingValues } = useSettings();
  const fallbackPct = settingValues[selected?.game === 'pokemon' ? 'fallback_pct_pokemon' : 'fallback_pct_mtg'];
  // Use Fallback / Use Cardmarket (owner, 2026-09-29): every JustTCG price
  // thrown out; NM is the Scryfall/TCGdex price, or Cardmarket's in dollars,
  // and the other conditions that × the Master Fallback Percentages. Use
  // Fallback needs JustTCG prices to replace; Use Cardmarket needs a
  // Cardmarket price and the day's euro rate.
  const eurUsd = useEurUsd();
  const cardmarketEur = cardmarketPrice(card, { finish, version });
  const cardmarketUsd = cardmarketEur != null && eurUsd != null ? cardmarketEur * eurUsd : null;
  const canUseFallback = fallback != null && CONDITIONS.some((c) => market[c] != null);
  const activeOverride = (override === 'fallback' && canUseFallback) || (override === 'cardmarket' && cardmarketUsd != null)
    ? override : null;
  // Japanese Pokémon with no JustTCG price for any condition (TCGdex has no
  // dollar price for them either): Cardmarket is the fallback on its own
  // (owner, 2026-09-29), like Scryfall/TCGdex for everything else.
  const autoCardmarket = !activeOverride && card?.game === 'pokemon' && card?.lang === 'ja'
    && cardmarketUsd != null && !CONDITIONS.some((c) => market[c] != null);
  const base = activeOverride === 'cardmarket' || autoCardmarket
    ? { price: cardmarketUsd, source: 'cardmarket' }
    : fallback;
  // The five prices shown and used (JustTCG, fallbacks, never rising, rounded
  // down, or up in a project).
  const ladder = priceLadder(activeOverride ? {} : market, base, fallbackPct, card?.game, { up: roundUp });
  // ⚠️ on NM (spec 8.7): reasons to doubt JustTCG's prices. A 1st Edition is
  // checked against its Unlimited version, whose prices came in the same request.
  const unlimited = !magic && version?.firstEdition
    ? versions.find((v) => v.finish === version.finish && !v.firstEdition && !v.treatments.length)
    : null;
  const unlimitedNM = unlimited
    ? conditionPrices(resultFor(card, prices.results, { finish, version: unlimited, versions })?.card, {
      game: 'pokemon', lang: card.lang, finish: unlimited.finish, firstEdition: false,
    }).NM
    : null;
  const warnings = bulk ? [] : priceWarnings({
    market, fallback, pct: fallbackPct, unlimitedNM, cardmarket: cardmarketEur, eurUsd,
  });
  // 📈 / 📉 (owner, 2026-10-14): a JustTCG price shown that rose or fell
  // sharply lately, by JustTCG's own figures for it (lib/priceTrend.js).
  const marketVariants = conditionVariants(result?.card, variantOpts);
  const trends = Object.fromEntries(CONDITIONS.map((c) => [c,
    ladder[c]?.source === 'justtcg' ? priceTrend(marketVariants[c]) : null]));

  return {
    englishName, prices, result, market, fallback, settingValues, fallbackPct, eurUsd, cardmarketEur, cardmarketUsd,
    activeOverride, autoCardmarket, ladder, warnings, marketVariants, trends,
  };
}
