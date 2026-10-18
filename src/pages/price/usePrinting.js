import { useEffect, useState } from 'react';
import { usePokemonSiblings } from './usePrices.js';
import { usePokemonDetail, useMagicSiblings } from './usePrintingDetail.js';
import { justtcgVersions, withTcgplayerVersions } from '../../lib/justtcgCards.js';
import { defaultMagicFinish, pokemonVersions, defaultPokemonVersion } from '../../lib/printings.js';
import { priceResults } from '../../lib/prices.js';

/** The JustTCG cards already fetched for the card's own products: their printings TCGdex may miss (decision 234). */
const ownProductCards = (versions) => [...new Set(versions.map((v) => v.tcgplayerId).filter(Boolean))]
  .map((id) => priceResults.get(`pokemon:tcgplayer:${id}`)?.card).filter(Boolean);

/**
 * The selected card's printing (PricingScreen; FABLE_REPORT C1): the finish
 * chosen (Magic) or the version (Pokémon), the card's details and siblings
 * they're chosen from, and setPrinting to choose. `selected` is the
 * selection, `card` the same unless it's bulk (then null).
 */
export function usePrinting(selected, card, { needSiblings = false } = {}) {
  // The chosen finish (Magic) or version (Pokémon) of the selected card. Tied
  // to the card's key, so a newly selected card starts on its defaults.
  const [printing, setPrinting] = useState({ key: null, finish: null, version: null });
  const pokemon = usePokemonDetail(card);
  const siblings = useMagicSiblings(card);
  const magic = card?.game === 'mtg' ? card.scryfall : null;
  const own = printing.key === selected?.key;
  const finish = magic ? (own && printing.finish) || defaultMagicFinish(magic) : null;
  // Pokémon versions: TCGdex's, or for a card known only from TCGplayer its
  // printings there; plus TCGplayer-only products with the same name and
  // number (Cosmos Holo, stamped…; owner, 2026-10-09). The TCGplayer search
  // runs by itself only when a version has no product of its own (a stamp
  // TCGplayer sells apart, decision 235) or the line being edited was saved
  // on a TCGplayer-only version; otherwise when asked for (decision 289).
  // Printings of the card's own product that TCGdex misses (decision 234)
  // come from the price result, which has the product whole: no search.
  const ownVersions = card?.game !== 'pokemon' ? []
    : card.source === 'justtcg' ? justtcgVersions(card.justtcg, card.suffix, card.lang) : pokemonVersions(pokemon.card);
  const needed = needSiblings || ownVersions.some((v) => !v.tcgplayerId);
  const tcgSiblings = usePokemonSiblings(card, pokemon, { needed });
  const versions = card?.game !== 'pokemon' ? ownVersions
    : withTcgplayerVersions(ownVersions, tcgSiblings.cards?.length ? tcgSiblings.cards : ownProductCards(ownVersions), card);
  const version = versions.find((v) => own && v.id === printing.version) ?? defaultPokemonVersion(versions);

  // Every card starts on its defaults (owner's decision, 2026-09-29): a choice
  // is forgotten as soon as another card is selected, so coming back to a card
  // doesn't bring back an old finish. A Details jump sets the new printing's
  // finish in the same step, so it survives.
  useEffect(() => {
    if (printing.key && printing.key !== selected?.key) {
      setPrinting({ key: null, finish: null, version: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only when another card is selected; printing.key is what it compares with
  }, [selected?.key]);

  return { setPrinting, pokemon, siblings, magic, finish, tcgSiblings, versions, version };
}
