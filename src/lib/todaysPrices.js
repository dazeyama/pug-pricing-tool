// Today's prices for saved card lines: where EXPORT's Sell Prices (export
// spec 5.4) and a collection's REPRICE? (owner, 2026-10-01) both start.
// JustTCG fetched fresh (the `prices` function's `fresh` option), Scryfall's
// prices (Magic) or TCGdex's (Pokémon) for the fallback, and Cardmarket ×
// today's euro rate. Each line is looked up the way the Price screen looks
// up the card it was added from.

import { callFunction } from './functions.js';
import {
  cardmarketPrice, conditionPrices, conditionVariants, fallbackPrice, lookupsFor, resultFor,
} from './prices.js';
import { pokemonVersions } from './printings.js';
import { loadEurUsd } from './useEurUsd.js';
import * as dex from './tcgdex.js';

const SCRYFALL_BATCH = 75;
const PRICE_BATCH = 100;   // JustTCG's batch size: one request per 100 lookups
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Full Scryfall cards by id (POST /cards/collection, 75 at a time), today's
 * data: flavor names for matching, prices for the fallbacks.
 * @param {string[]} ids
 * @returns {Promise<Map<string, object>>}
 */
export async function scryfallCards(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < unique.length; i += SCRYFALL_BATCH) {
    const body = JSON.stringify({ identifiers: unique.slice(i, i + SCRYFALL_BATCH).map((id) => ({ id })) });
    let data = null;
    for (let attempt = 0; attempt < 4 && !data; attempt++) {
      if (i || attempt) await sleep(150 * (attempt + 1));
      try {
        const res = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body,
        });
        if (res.ok) data = await res.json();
        else if (res.status !== 429 && res.status !== 503) throw new Error(`Scryfall answered ${res.status}`);
      } catch (e) {
        if (attempt === 3) throw new Error(`Scryfall couldn't be reached: ${e.message}`);
      }
    }
    if (!data) throw new Error("Scryfall couldn't be reached.");
    for (const card of data.data ?? []) out.set(card.id, card);
  }
  return out;
}

/** A saved Pokémon line's version among its card's versions (as editing a line finds it). */
function versionOf(line, versions) {
  const key = (t) => JSON.stringify([...(t ?? [])].sort());
  const first = Boolean(line.first_edition);
  return versions.find((v) => v.id === line.price_snapshot?.version)
    ?? versions.find((v) => v.finish === line.finish && Boolean(v.firstEdition) === first
      && key(v.treatments) === key(line.treatments))
    ?? versions.find((v) => v.finish === line.finish && Boolean(v.firstEdition) === first)
    ?? versions.find((v) => v.finish === line.finish)
    ?? null;
}

/**
 * @typedef {{ market: Record<string, number|null>, fallback: { price: number, source: string }|null,
 *   cardmarketUsd: number|null, cardmarketEur: number|null, rate: number|null, fetchedAt: string|null,
 *   result: object|null, variants: Record<string, object|null> }} Today
 */

/**
 * Today's data for each line, by line id. Throws (with the reason) if
 * JustTCG or a needed euro rate can't be had: nothing is ever priced on
 * stale data. A line whose card can't be found gets an empty entry (no
 * prices), so callers keep what it had.
 * @param {object[]} lines  buy_lines rows
 * @param {{ cards?: Map<string, object>|null, onStep?: (text: string) => void }} [options]
 *   cards: Scryfall cards already fetched (the export's matching)
 * @returns {Promise<Map<string, Today>>}
 */
export async function todaysPrices(lines, { cards = null, onStep } = {}) {
  const magic = lines.filter((l) => l.game === 'mtg' && l.scryfall_id);
  const pokemon = lines.filter((l) => l.game === 'pokemon' && l.tcgdex_id);

  let scry = cards ?? new Map();
  const missing = magic.map((l) => l.scryfall_id).filter((id) => !scry.has(id));
  if (missing.length) {
    onStep?.(`Loading ${missing.length} Magic card${missing.length === 1 ? '' : 's'} from Scryfall…`);
    scry = new Map([...scry, ...(await scryfallCards(missing))]);
  }

  // Pokémon: each card's TCGdex record, for its versions and their prices.
  const dexCards = new Map();
  const dexKeys = [...new Set(pokemon.map((l) => `${l.lang}|${l.tcgdex_id}`))];
  for (let i = 0; i < dexKeys.length; i++) {
    if (i % 10 === 0) onStep?.(`Loading Pokémon card data (${i + 1} of ${dexKeys.length})…`);
    const [lang, id] = dexKeys[i].split('|');
    try {
      dexCards.set(dexKeys[i], await dex.fetchCard(lang, id));
    } catch {
      // Gone from TCGdex: that line keeps its price.
    }
  }

  // Each line as the Price screen saw it: the card (c), finish, version.
  const seen = [];
  for (const line of lines) {
    if (line.game === 'mtg') {
      const card = scry.get(line.scryfall_id);
      if (card) seen.push({ line, c: { game: 'mtg', scryfall: card }, finish: line.finish, version: null, versions: [] });
    } else if (line.game === 'pokemon') {
      const card = dexCards.get(`${line.lang}|${line.tcgdex_id}`);
      if (!card) continue;
      const versions = pokemonVersions(card);
      const version = versionOf(line, versions);
      seen.push({
        line,
        card,
        versions,
        version,
        finish: version?.finish ?? line.finish,
        c: {
          game: 'pokemon', lang: line.lang, tcgdexId: line.tcgdex_id, name: line.name, number: line.collector_number,
          setName: line.set_name, setCode: line.set_code, printedSize: line.printed_size,
        },
      });
    }
  }

  const lookups = new Map();
  for (const s of seen) {
    const wanted = lookupsFor(s.c, { pokemonCard: s.card ?? null, versions: s.versions, jaName: s.line.name_en || '' });
    for (const l of wanted) lookups.set(l.key, l);
  }
  const all = [...lookups.values()];
  const requests = Math.ceil(all.length / PRICE_BATCH);
  onStep?.(`Fetching today's prices (${requests || 'no'} JustTCG request${requests === 1 ? '' : 's'})…`);
  const results = {};
  try {
    for (let i = 0; i < all.length; i += PRICE_BATCH) {
      const data = await callFunction('prices', { lookups: all.slice(i, i + PRICE_BATCH), fresh: true });
      Object.assign(results, data?.results ?? {});
    }
  } catch (e) {
    const why = e.code === 'DAILY_LIMIT_EXCEEDED' ? "JustTCG's daily limit is used up" : e.message;
    throw new Error(`Today's prices couldn't be fetched: ${why}.`);
  }

  // Cardmarket is in euros: today's rate, when a card might be priced from it.
  const needsRate = lines.some((l) => l.price_snapshot?.override === 'cardmarket' || l.price_source === 'cardmarket'
    || (l.game === 'pokemon' && l.lang === 'ja'));
  const rate = needsRate ? await loadEurUsd() : null;
  if (needsRate && rate == null) {
    throw new Error("Today's euro rate couldn't be fetched (for the cards priced from Cardmarket).");
  }

  const empty = { market: {}, fallback: null, cardmarketUsd: null, cardmarketEur: null, rate, fetchedAt: null, result: null, variants: {} };
  const out = new Map(lines.map((l) => [l.id, empty]));
  for (const s of seen) {
    const opts = { game: s.c.game, lang: s.c.game === 'mtg' ? 'en' : s.c.lang, finish: s.finish, firstEdition: s.version?.firstEdition };
    const result = resultFor(s.c, results, { finish: s.finish, version: s.version, versions: s.versions }) ?? null;
    const eur = cardmarketPrice(s.c, { finish: s.finish, version: s.version });
    out.set(s.line.id, {
      market: conditionPrices(result?.card, opts),
      fallback: fallbackPrice(s.c, { finish: s.finish, version: s.version }),
      cardmarketEur: eur,
      cardmarketUsd: eur != null && rate != null ? eur * rate : null,
      rate,
      fetchedAt: result?.fetchedAt ?? null,
      result,
      variants: conditionVariants(result?.card, opts),
    });
  }
  return out;
}
