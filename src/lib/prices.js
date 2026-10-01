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
import { formatEur, formatMoney, roundDownPrice } from './money.js';

export { CONDITIONS, priceLadder } from './ladder.js';
import { CONDITIONS } from './ladder.js';
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
export function lookupsFor(c, { pokemonCard, versions, jaName }) {
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
  // Japanese cards' own names are Japanese; JustTCG's are English. `jaName`
  // is the English name (Pokédex number) or what was typed (owner, 2026-09-29).
  const name = c.lang === 'ja' ? (jaName || '') : c.name;
  if (!pokemonCard && !c.number) return [];
  return [{
    key: `pokemon:${c.lang}:${c.tcgdexId}`, game: 'pokemon', lang: c.lang,
    name, number: c.number, setName: c.lang === 'en' ? c.setName : undefined, setCode: c.setCode,
    size: c.printedSize ?? pokemonCard?.set?.cardCount?.official ?? undefined,
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
 * The JustTCG variant for each condition (NM…DMG) of the chosen finish: the
 * first priced one that fits.
 * @returns {Record<string, object|null>}
 */
export function conditionVariants(card, { game, lang, finish, firstEdition }) {
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
    if (code && typeof v.price === 'number' && out[code] == null) out[code] = v;
  }
  return out;
}

/**
 * NM…DMG prices from a JustTCG card for the chosen finish.
 * @returns {Record<string, number|null>}
 */
export function conditionPrices(card, opts) {
  const variants = conditionVariants(card, opts);
  return Object.fromEntries(CONDITIONS.map((c) => [c, variants[c]?.price ?? null]));
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
 * Reasons to doubt JustTCG's prices for this printing, each a short line for
 * the warning box under the price panel (spec 8.7; owner, 2026-09-29). All from data already
 * loaded, so they cost no requests:
 *  - TCGplayer's market price (Scryfall/TCGdex × the NM percentage) is 25%+
 *    and $1+ away from JustTCG's NM;
 *  - a worse condition costs more than twice the best one (MP $10,000 over
 *    NM $359.95);
 *  - a 1st Edition's NM is below its Unlimited version's (Pokémon);
 *  - Cardmarket's European price, in dollars, is at least double or half
 *    JustTCG's NM, and $5+ away (markets differ, so only big gaps count).
 * @param {object} p
 * @param {Record<string, number|null>} p.market  JustTCG prices by condition
 * @param {{ price: number, source: string }|null} p.fallback  Scryfall/TCGdex market price
 * @param {Record<string, number>} p.pct  Master Fallback Percentages
 * @param {number|null} p.unlimitedNM  JustTCG NM of the Unlimited version, on a 1st Edition
 * @param {number|null} p.cardmarket  Cardmarket price in euros
 * @param {number|null} p.eurUsd  dollars per euro
 * @returns {string[]}
 */
export function priceWarnings({ market, fallback, pct, unlimitedNM, cardmarket, eurUsd }) {
  const out = [];
  const nm = market?.NM ?? null;
  if (nm != null && fallback && pct?.NM != null) {
    const other = (fallback.price * Number(pct.NM)) / 100;
    const diff = Math.abs(other - nm);
    if (diff >= 1 && diff >= nm * 0.25) {
      const from = fallback.source === 'scryfall_fallback' ? 'Scryfall' : 'TCGdex';
      out.push(`${from} says NM is ${formatMoney(other)} (${Math.round((diff / nm) * 100)}% apart)`);
    }
  }
  const best = CONDITIONS.find((c) => market?.[c] != null);
  if (best) {
    const top = market[best];
    const over = CONDITIONS.filter((c) => c !== best && market[c] != null && market[c] > top * 2);
    if (over.length) {
      const list = over.map((c) => `${c} ${formatMoney(market[c])}`).join(', ');
      out.push(`${list} ${over.length > 1 ? 'are' : 'is'} over 2× ${best} (${formatMoney(top)})`);
    }
  }
  if (nm != null && unlimitedNM != null && nm < unlimitedNM) {
    out.push(`Below Unlimited's NM (${formatMoney(unlimitedNM)})`);
  }
  if (nm != null && cardmarket != null && eurUsd != null) {
    const usd = cardmarket * eurUsd;
    const ratio = Math.max(usd, nm) / Math.min(usd, nm);
    if (ratio >= 2 && Math.abs(usd - nm) >= 5) {
      out.push(`Cardmarket ${formatEur(cardmarket)} ≈ ${formatMoney(Math.round(usd))} (${ratio.toFixed(1)}× ${usd > nm ? 'more' : 'less'})`);
    }
  }
  return out;
}

/**
 * Cardmarket's price in euros for the chosen finish, for the Cardmarket
 * warning: Scryfall's eur / eur_foil / eur_etched for Magic, TCGdex's
 * Cardmarket price for the Pokémon version.
 * @returns {number|null}
 */
export function cardmarketPrice(c, { finish, version }) {
  if (!c) return null;
  if (c.game === 'mtg') {
    const p = c.scryfall.prices ?? {};
    const raw = { nonfoil: p.eur, foil: p.eur_foil, etched: p.eur_etched }[finish];
    const price = raw != null ? Number(raw) : null;
    return price != null && !Number.isNaN(price) && price > 0 ? price : null;
  }
  return version?.cardmarketPrice ?? null;
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
