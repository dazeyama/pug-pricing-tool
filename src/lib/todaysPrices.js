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
import { isTcgplayerOnlyLine, lineVersion } from './justtcgCards.js';
import { loadEurUsd } from './useEurUsd.js';
import * as dex from './tcgdex.js';

const SCRYFALL_BATCH = 75;
// /cards/collection allows about two requests a second; a 429 says how long to wait.
const SCRYFALL_SPACING = 550;
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
  const cards = await scryfallCollection(unique.map((id) => ({ id })));
  return new Map(cards.map((card) => [card.id, card]));
}

/**
 * Scryfall cards for any identifiers /cards/collection takes ({ id }, or
 * { set, collector_number }…), 75 a request, two requests a second at most
 * (Scryfall's limit for this endpoint). Ones it doesn't know are left out.
 * @param {object[]} identifiers
 * @returns {Promise<object[]>}
 */
export async function scryfallCollection(identifiers) {
  const out = [];
  for (let i = 0; i < identifiers.length; i += SCRYFALL_BATCH) {
    const body = JSON.stringify({ identifiers: identifiers.slice(i, i + SCRYFALL_BATCH) });
    let data = null;
    let wait = i ? SCRYFALL_SPACING : 0;
    for (let attempt = 0; attempt < 4 && !data; attempt++) {
      if (wait) await sleep(wait);
      wait = SCRYFALL_SPACING * (attempt + 2);
      try {
        const res = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body,
        });
        if (res.ok) data = await res.json();
        else if (res.status === 429 || res.status === 503) {
          const after = parseFloat(res.headers.get('Retry-After'));
          if (!Number.isNaN(after)) wait = after * 1000 + 250;
        } else throw new Error(`Scryfall answered ${res.status}`);
      } catch (e) {
        if (attempt === 3) throw new Error(`Scryfall couldn't be reached: ${e.message}`);
      }
    }
    if (!data) throw new Error("Scryfall couldn't be reached.");
    out.push(...(data.data ?? []));
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
 * @param {{ cards?: Map<string, object>|null, onStep?: (text: string) => void, backup?: boolean }} [options]
 *   cards: Scryfall cards already fetched (the export's matching)
 *   backup: may fall back on the backup JustTCG key once the main one is out (decision 439): only
 *   exports, printouts and REPRICE? say so, never the Price screen
 * @returns {Promise<Map<string, Today>>}
 */
export async function todaysPrices(lines, { cards = null, onStep, backup = false } = {}) {
  const magic = lines.filter((l) => l.game === 'mtg' && l.scryfall_id);
  const pokemon = lines.filter((l) => l.game === 'pokemon' && l.tcgdex_id);

  let scry = cards ?? new Map();
  const missing = magic.map((l) => l.scryfall_id).filter((id) => !scry.has(id));
  if (missing.length) {
    onStep?.(`Loading ${missing.length} Magic card${missing.length === 1 ? '' : 's'} from Scryfall…`);
    scry = new Map([...scry, ...(await scryfallCards(missing))]);
  }

  // Pokémon: each card's TCGdex record, for its versions and their prices. All asked for at
  // once: TCGdex's queue runs a few at a time and paces them (owner, 2026-10-16: one by one, a
  // sheet of 91 took the better part of a minute).
  const dexCards = new Map();
  const dexKeys = [...new Set(pokemon.map((l) => `${l.lang}|${l.tcgdex_id}`))];
  if (dexKeys.length) onStep?.(`Loading Pokémon card data (0 of ${dexKeys.length})…`);
  let landed = 0;
  await Promise.all(dexKeys.map(async (key) => {
    const [lang, id] = key.split('|');
    try {
      dexCards.set(key, await dex.fetchCard(lang, id));
    } catch {
      // Gone from TCGdex: that line keeps its price.
    }
    landed += 1;
    if (landed % 10 === 0 || landed === dexKeys.length) onStep?.(`Loading Pokémon card data (${landed} of ${dexKeys.length})…`);
  }));

  // Each line as the Price screen saw it: the card (c), finish, version.
  const seen = [];
  for (const line of lines) {
    if (line.game === 'mtg') {
      const card = scry.get(line.scryfall_id);
      if (card) seen.push({ line, c: { game: 'mtg', scryfall: card }, finish: line.finish, version: null, versions: [] });
    } else if (line.game === 'pokemon' && !line.tcgdex_id) {
      // A card known only from TCGplayer (owner, 2026-10-09): its JustTCG card.
      if (!line.justtcg_card_id) continue;
      const v = lineVersion(line);
      seen.push({
        line, card: null, versions: [v], version: v, finish: line.finish,
        c: {
          game: 'pokemon', lang: line.lang, source: 'justtcg', justtcgId: line.justtcg_card_id, name: line.name,
          number: line.collector_number, setName: line.set_name, setCode: line.set_code, printedSize: line.printed_size,
        },
      });
    } else if (line.game === 'pokemon') {
      const card = dexCards.get(`${line.lang}|${line.tcgdex_id}`);
      if (!card) continue;
      // A TCGplayer-only version (Cosmos Holo…) isn't among TCGdex's: rebuilt from the line.
      let versions = isTcgplayerOnlyLine(line) ? [...pokemonVersions(card), lineVersion(line)] : pokemonVersions(card);
      let version = versionOf(line, versions);
      // A stamped version TCGdex gives no TCGplayer product, saved with the
      // one TCGplayer matched it to (owner, 2026-10-11): priced from that product.
      if (version && !version.tcgplayerId && !version.tcgplayerOnly && line.tcgplayer_id) {
        const own = { ...version, tcgplayerId: String(line.tcgplayer_id) };
        versions = versions.map((v) => (v === version ? own : v));
        version = own;
      }
      seen.push({
        line,
        card,
        versions,
        version,
        finish: version?.finish ?? line.finish,
        c: {
          game: 'pokemon', lang: line.lang, tcgdexId: line.tcgdex_id, name: line.name, number: line.collector_number,
          setName: line.set_name, setCode: line.set_code, setId: line.source_set_id, printedSize: line.printed_size,
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
      const body = { lookups: all.slice(i, i + PRICE_BATCH), fresh: true };
      if (backup) body.backup = true;
      const data = await callFunction('prices', body);
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
    const opts = {
      game: s.c.game,
      lang: s.c.game === 'mtg' ? (s.c.scryfall?.lang === 'ja' ? 'ja' : 'en') : s.c.lang,
      finish: s.finish,
      firstEdition: s.version?.firstEdition,
    };
    const result = resultFor(s.c, results, { finish: s.finish, version: s.version, versions: s.versions }) ?? null;
    const eur = cardmarketPrice(s.c, { finish: s.finish, version: s.version });
    out.set(s.line.id, {
      market: conditionPrices(result?.card, opts),
      // A product the function refused (another card's: decision 288): no fallback from it either.
      fallback: result?.refused ? null : fallbackPrice(s.c, { finish: s.finish, version: s.version }),
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
