// Prices for the selected card (spec 5.3, 8.7): which JustTCG lookups a card
// needs, and how a JustTCG card becomes NM / LP / MP / HP / DMG prices for
// the chosen finish. The lookups themselves run in the `prices` Edge Function.
//
// JustTCG names, confirmed from its documentation (2026-09-29):
// - Games: `magic-the-gathering`, `pokemon`. Japanese Pokémon is not its own
//   game any more: its prices are variants with `language: "Japanese"`.
// - Conditions: "Near Mint", "Lightly Played", "Moderately Played",
//   "Heavily Played", "Damaged".
// - Printings: "Normal" and "Foil" (Magic); "Normal", "Holofoil",
//   "Reverse Holofoil", "1st Edition", "1st Edition Holofoil", "Unlimited",
//   "Unlimited Holofoil" (Pokémon; TCGplayer's names). Matched loosely below
//   in case a name differs.
// - Etched Magic foils are their own TCGplayer product (Scryfall's
//   tcgplayer_etched_id), priced through that product.
import { callFunction } from './functions.js';
import { roundDownPrice } from './money.js';

export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const CONDITION_CODES = {
  'near mint': 'NM', 'lightly played': 'LP', 'moderately played': 'MP', 'heavily played': 'HP', damaged: 'DMG',
};

/** "Near Mint" → "NM" (also accepts the codes themselves). */
export function conditionCode(name) {
  const n = String(name ?? '').trim().toLowerCase();
  return CONDITION_CODES[n] ?? (CONDITIONS.includes(n.toUpperCase()) ? n.toUpperCase() : null);
}

/**
 * The lookups one selected card needs, all sent in a single request so that
 * switching finish or condition never costs another one.
 * @returns {{ key: string, game: string, lang: string, [k: string]: any }[]}
 */
export function lookupsFor(c, { pokemonCard, versions, typedName }) {
  if (!c) return [];
  if (c.game === 'mtg') {
    const card = c.scryfall;
    const out = [{ key: `mtg:scryfall:${card.id}`, game: 'mtg', lang: 'en', scryfallId: card.id }];
    if ((card.finishes ?? []).includes('etched') && card.tcgplayer_etched_id) {
      out.push({ key: `mtg:etched:${card.tcgplayer_etched_id}`, game: 'mtg', lang: 'en', tcgplayerId: String(card.tcgplayer_etched_id) });
    }
    return out;
  }
  // Pokémon: every version's TCGplayer product (stamped versions are their own
  // products); without any, a name + number search.
  const ids = [...new Set(versions.map((v) => v.tcgplayerId).filter(Boolean))];
  if (ids.length) {
    return ids.map((id) => ({ key: `pokemon:tcgplayer:${id}`, game: 'pokemon', lang: c.lang, tcgplayerId: id }));
  }
  const name = c.lang === 'ja' ? (typedName || '') : c.name;
  if (!pokemonCard && !c.number) return [];
  return [{
    key: `pokemon:${c.lang}:${c.tcgdexId}`, game: 'pokemon', lang: c.lang,
    name, number: c.number, setName: c.lang === 'en' ? c.setName : undefined,
  }];
}

/** Ask the `prices` function. Rejects with .code (e.g. DAILY_LIMIT_EXCEEDED, NO_KEY). */
export async function fetchPrices(lookups) {
  const data = await callFunction('prices', { lookups });
  return data?.results ?? {};
}

// ---------------------------------------------------------------- reading a card

const lower = (s) => String(s ?? '').toLowerCase();
const isJapanese = (v) => lower(v.language) === 'japanese';
const isEnglish = (v) => !v.language || lower(v.language) === 'english';

/** Does a JustTCG printing name fit the chosen finish? */
function printingFits(printing, { game, finish, firstEdition }) {
  const p = lower(printing);
  if (game === 'mtg') {
    if (finish === 'etched') return p.includes('etched') || p === 'foil';
    if (finish === 'foil') return p === 'foil';
    return p === 'normal';
  }
  const reverse = p.includes('reverse');
  const holo = !reverse && p.includes('holo');
  const first = p.includes('1st edition');
  if (Boolean(firstEdition) !== first) return false;
  if (finish === 'reverse') return reverse;
  if (finish === 'holo') return holo;
  return !reverse && !holo;
}

/**
 * NM…DMG prices from a JustTCG card for the chosen finish.
 * @returns {Record<string, number|null>}
 */
export function conditionPrices(card, { game, lang, finish, firstEdition }) {
  const out = Object.fromEntries(CONDITIONS.map((c) => [c, null]));
  if (!card) return out;
  const variants = (card.variants ?? []).filter((v) => (lang === 'ja' ? isJapanese(v) : isEnglish(v)));
  // Etched: prefer an "etched" printing on the card; the etched product's own
  // card only has plain printings, any of which is the etched price.
  let fits = variants.filter((v) => printingFits(v.printing, { game, finish, firstEdition }));
  if (game === 'mtg' && finish === 'etched' && fits.some((v) => lower(v.printing).includes('etched'))) {
    fits = fits.filter((v) => lower(v.printing).includes('etched'));
  }
  for (const v of fits) {
    const code = conditionCode(v.condition);
    if (code && typeof v.price === 'number' && out[code] == null) out[code] = v.price;
  }
  return out;
}

/**
 * The JustTCG card to read for the chosen finish/version, from the results.
 * @returns {{ card: object|null, fetchedAt: string|null } | undefined} undefined = not fetched yet
 */
export function resultFor(c, results, { finish, version, versions = [] }) {
  if (!c || !results) return undefined;
  if (c.game === 'mtg') {
    const card = c.scryfall;
    if (finish === 'etched' && card.tcgplayer_etched_id) {
      const etched = results[`mtg:etched:${card.tcgplayer_etched_id}`];
      const main = results[`mtg:scryfall:${card.id}`];
      // An etched printing listed on the main card wins; else the etched product.
      if (main?.card?.variants?.some((v) => lower(v.printing).includes('etched'))) return main;
      return etched ?? main;
    }
    return results[`mtg:scryfall:${card.id}`];
  }
  // The version's own TCGplayer product; failing that, the plain version's of
  // the same finish (a stamped version is a different product, never a stand-in).
  const plain = versions.find((v) => v.finish === version?.finish && v.tcgplayerId
    && !v.treatments.length && !v.firstEdition);
  const id = version?.tcgplayerId ?? plain?.tcgplayerId;
  if (id) return results[`pokemon:tcgplayer:${id}`];
  return results[`pokemon:${c.lang}:${c.tcgdexId}`];
}

/**
 * The five prices shown, NM down to DMG (spec 8.7): JustTCG's where it has
 * one, otherwise a fallback, i.e. a base price × the condition's Master
 * Fallback Percentage. Prices never rise as the condition drops (owner,
 * 2026-09-29): a JustTCG price above the better condition's is thrown out
 * and replaced by a fallback based on JustTCG's own NM price when there is
 * one; and no fallback is allowed above the better condition either. Then
 * every price is rounded down by the store's steps.
 * @param {Record<string, number|null>} market  JustTCG prices by condition (conditionPrices)
 * @param {{ price: number, source: string }|null} fallback  the Scryfall/TCGdex market price
 * @param {Record<string, number>} pct  Master Fallback Percentages for the game
 * @returns {Record<string, { price: number|null, raw: number|null, source: 'justtcg'|'fallback'|null,
 *   base: { price: number, from: string }|null, thrownOut: number|null, cappedBy: string|null }>}
 */
export function priceLadder(market, fallback, pct) {
  const out = {};
  const fallbackBase = fallback
    ? { price: fallback.price, from: fallback.source === 'scryfall_fallback' ? 'Scryfall' : 'TCGdex' }
    : null;
  let prev = null;          // the better condition's price, unrounded
  let prevCode = null;
  for (const code of CONDITIONS) {
    let raw = market?.[code] ?? null;
    let thrownOut = null;
    if (raw != null && prev != null && raw > prev) {
      thrownOut = raw;
      raw = null;
    }
    const entry = { raw, source: raw != null ? 'justtcg' : null, base: null, thrownOut, cappedBy: null };
    if (raw == null) {
      const base = thrownOut != null && market?.NM != null
        ? { price: market.NM, from: 'JustTCG' }
        : fallbackBase;
      let value = base && pct?.[code] != null ? (base.price * Number(pct[code])) / 100 : null;
      if (value != null && prev != null && value > prev) {
        value = prev;
        entry.cappedBy = prevCode;
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
 * The fallback NM price (spec 8.7) when JustTCG has none: Scryfall's
 * usd / usd_foil / usd_etched for Magic, TCGdex's TCGplayer market price for
 * Pokémon (English only: TCGdex has no USD prices for Japanese cards).
 * @returns {{ price: number, source: 'scryfall_fallback'|'tcgdex_fallback' } | null}
 */
export function fallbackPrice(c, { finish, version }) {
  if (!c) return null;
  if (c.game === 'mtg') {
    const p = c.scryfall.prices ?? {};
    const raw = { nonfoil: p.usd, foil: p.usd_foil, etched: p.usd_etched }[finish];
    const price = raw != null ? Number(raw) : null;
    return price != null && !Number.isNaN(price) ? { price, source: 'scryfall_fallback' } : null;
  }
  const price = version?.marketPrice;
  return typeof price === 'number' ? { price, source: 'tcgdex_fallback' } : null;
}
