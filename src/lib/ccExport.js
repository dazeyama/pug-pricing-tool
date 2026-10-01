// The export's data side (docs/EXPORT_FUNCTION.md 7–8): matching a set of
// Magic lines to the current inventory's CC products, and saving what staff
// teach it. The matching rules themselves are in ccMatch.js.

import { supabase } from './supabase.js';
import { loadSets } from './scryfall.js';
import { nameKey } from './normalize.js';
import { categoryFor, chooseProduct, fold, frontFace, promoKind } from './ccMatch.js';
import { callFunction } from './functions.js';
import { cardmarketPrice, conditionPrices, fallbackPrice, lookupsFor, resultFor } from './prices.js';
import { loadEurUsd } from './useEurUsd.js';
import { sellPriceFor } from './sellPrice.js';
import { massCreateCsv, massCreateRows } from './massCreate.js';

const SCRYFALL_BATCH = 75;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Full Scryfall cards by id (POST /cards/collection, 75 at a time), today's
 * data: flavor names for matching, prices for the Sell Price (export spec 5.4).
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

const fail = (error, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

/** The link key for a printing and finish. */
export const linkKey = (line) => `${line.scryfall_id}|${line.finish}`;

/**
 * Match Magic lines to CC products (export spec 7). Each result says where
 * the line stands:
 *  - 'auto'   matched (by a remembered link, or one clear candidate);
 *  - 'choose' staff must pick (candidates, but no clear one; or no category);
 *  - 'none'   no candidates at all (can't upload, unless staff find one).
 * @param {object[]} lines  buy_lines rows (Magic)
 * @param {(text: string) => void} [onStep]
 * @returns {Promise<{ results: object[], cards: Map<string, object> }>}
 */
export async function matchLines(lines, onStep) {
  onStep?.(`Matching ${lines.length} card${lines.length === 1 ? '' : 's'}…`);
  const [{ data: catList, error: catError }, { data: mapRows, error: mapError }] = await Promise.all([
    supabase.rpc('cc_categories'),
    supabase.from('cc_set_map').select('scryfall_set, promo_kind, category'),
  ]);
  fail(catError, "Couldn't read the inventory's categories");
  fail(mapError, "Couldn't read the set choices");
  if (!catList?.length) {
    const e = new Error('Upload the Master Crystal Inventory in Settings first: no products are loaded for export.');
    e.code = 'no_inventory';
    throw e;
  }
  const categories = new Map(catList.map((c) => [fold(c), c]));
  const setMap = new Map((mapRows ?? []).map((m) => [`${m.scryfall_set}|${m.promo_kind}`, m.category]));

  const ids = [...new Set(lines.map((l) => l.scryfall_id).filter(Boolean))];
  const [sets, cards, { data: linkRows, error: linkError }] = await Promise.all([
    loadSets(),
    scryfallCards(ids),
    supabase.from('cc_product_links').select('*').in('scryfall_id', ids.length ? ids : ['-']),
  ]);
  fail(linkError, "Couldn't read the remembered matches");
  const links = new Map((linkRows ?? []).map((k) => [`${k.scryfall_id}|${k.finish}`, k]));
  const linked = [...new Set([...links.values()].map((k) => k.product_id))];
  const { data: linkedProducts, error: byIdError } = linked.length
    ? await supabase.rpc('cc_products_by_id', { p_ids: linked })
    : { data: [], error: null };
  fail(byIdError, "Couldn't read the remembered products");
  const productById = new Map((linkedProducts ?? []).map((p) => [p.product_id, p]));

  // Where each line's set lives, and what to ask the database for.
  const prepared = lines.map((line) => {
    const code = String(line.source_set_id ?? line.set_code ?? '').toLowerCase();
    const set = sets.get(code) ?? { code, name: line.set_name ?? line.set_code, set_type: null };
    const parent = set.parent_set_code ? sets.get(set.parent_set_code) ?? null : null;
    const card = cards.get(line.scryfall_id) ?? null;
    const flavor = card?.flavor_name ?? null;
    const promo = promoKind(line.treatments);
    const where = categoryFor({ set, parent, promo, categories, setMap });
    const baseKeys = [nameKey(line.name), ...(flavor ? [nameKey(flavor)] : []),
      ...(line.name.includes(' // ') ? [nameKey(frontFace(line.name))] : [])];
    return { line, set, promo, card, flavor, where, baseKeys };
  });
  const wants = prepared.map((p) => ({ key: p.line.id, category: p.where?.category ?? null, base_keys: p.baseKeys }));
  onStep?.('Finding their Crystal Commerce products…');
  const { data: candRows, error: candError } = await supabase.rpc('cc_candidates', { p_wants: wants });
  fail(candError, "Couldn't read the inventory's products");
  const byKey = new Map();
  for (const row of candRows ?? []) {
    if (!byKey.has(row.key)) byKey.set(row.key, []);
    byKey.get(row.key).push(row);
  }

  const results = prepared.map(({ line, set, promo, card, flavor, where }) => {
    const link = links.get(linkKey(line)) ?? null;
    const linkedProduct = link ? productById.get(link.product_id) ?? null : null;
    const candidates = byKey.get(line.id) ?? [];
    const base = { line, set, promo, card, flavor, category: where?.category ?? null, how: where?.how ?? null, candidates };
    if (linkedProduct) {
      return { ...base, status: 'auto', product: linkedProduct, ranked: [], expected: null, via: 'link', link };
    }
    const pick = chooseProduct(line, candidates, { flavor });
    // With no category, the candidates come from every category: staff decide (spec 7.3 step 5).
    const status = !where && pick.status === 'auto' ? 'choose' : pick.status;
    return {
      ...base,
      status,
      product: status === 'auto' ? pick.product : null,
      ranked: pick.ranked,
      expected: pick.expected,
      via: status === 'auto' ? 'match' : null,
      wasLinked: link && !linkedProduct ? link : null,
    };
  });
  return { results, cards };
}

/** Remember a product for a printing and finish (export spec 7.5). */
export async function saveLink(line, product, userId, source = 'staff') {
  const { error } = await supabase.from('cc_product_links').upsert({
    scryfall_id: line.scryfall_id,
    finish: line.finish,
    product_id: product.product_id,
    product_name: product.product_name,
    category: product.category,
    source,
    linked_at: new Date().toISOString(),
    linked_by: userId ?? null,
  });
  fail(error, "Couldn't remember that product");
}

/** Remember a set's category (the review's "Always use … for …"). */
export async function saveSetMap(setCode, promo, category, userId) {
  const { error } = await supabase.from('cc_set_map').upsert({
    scryfall_set: String(setCode).toLowerCase(),
    promo_kind: promo ?? '',
    category,
    source: 'staff',
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  });
  fail(error, "Couldn't remember that set");
}

/** "Find another CC product…": products whose names contain the text. */
export async function searchProducts(text) {
  const { data, error } = await supabase.rpc('cc_products_search', { p_text: text, p_limit: 30 });
  fail(error, "Couldn't search the inventory");
  return data ?? [];
}

// ------------------------------------------------------------ the Sell Price

const PRICE_BATCH = 100;   // JustTCG's batch size: one request per 100 cards

/**
 * Today's Sell Price for each line (export spec 5.4): JustTCG fetched fresh
 * (the `prices` function's `fresh` option), Scryfall's prices from the cards
 * the matching already fetched, Cardmarket × today's euro rate. Throws if
 * any of it can't be had: an export never uses stale prices.
 * @param {object[]} lines
 * @param {Map<string, object>} cards  Scryfall cards by id (matchLines)
 * @param {Record<string, number>} pct  the Master Fallback Percentages (Magic)
 * @param {(text: string) => void} [onStep]
 * @returns {Promise<Map<string, { price: number, basis: object }>>} by line id
 */
export async function sellPrices(lines, cards, pct, onStep) {
  const byCard = new Map();
  const lookups = [];
  for (const line of lines) {
    const card = cards.get(line.scryfall_id);
    if (!card || byCard.has(card.id)) continue;
    const c = { game: 'mtg', scryfall: card };
    byCard.set(card.id, c);
    lookups.push(...lookupsFor(c, {}));
  }
  const requests = Math.ceil(lookups.length / PRICE_BATCH);
  onStep?.(`Fetching today's prices (${requests || 'no'} JustTCG request${requests === 1 ? '' : 's'})…`);
  const results = {};
  try {
    for (let i = 0; i < lookups.length; i += PRICE_BATCH) {
      Object.assign(results, await callFunction('prices', { lookups: lookups.slice(i, i + PRICE_BATCH), fresh: true })
        .then((d) => d?.results ?? {}));
    }
  } catch (e) {
    const why = e.code === 'DAILY_LIMIT_EXCEEDED' ? "JustTCG's daily limit is used up" : e.message;
    throw new Error(`Today's prices couldn't be fetched: ${why}. Nothing was exported.`);
  }
  const needsRate = lines.some((l) => l.price_snapshot?.override === 'cardmarket' || l.price_source === 'cardmarket');
  const rate = needsRate ? await loadEurUsd() : null;
  if (needsRate && rate == null) {
    throw new Error("Today's euro rate couldn't be fetched (for the cards priced from Cardmarket). Nothing was exported.");
  }
  const out = new Map();
  for (const line of lines) {
    const c = byCard.get(line.scryfall_id) ?? null;
    const result = c ? resultFor(c, results, { finish: line.finish }) : null;
    const eur = c ? cardmarketPrice(c, { finish: line.finish }) : null;
    out.set(line.id, sellPriceFor(line, {
      market: conditionPrices(result?.card, { game: 'mtg', lang: 'en', finish: line.finish }),
      fallback: c ? fallbackPrice(c, { finish: line.finish }) : null,
      cardmarketUsd: eur != null && rate != null ? eur * rate : null,
      pct,
      fetchedAt: result?.fetchedAt ?? null,
    }));
  }
  return out;
}

// ------------------------------------------------------------ the export

const EXPORT_ERRORS = {
  stale_version: 'Something changed on another computer since this opened: nothing was exported. Try again.',
  stale_inventory: 'The Master Crystal Inventory was replaced while this was open: matching again.',
  no_inventory: 'Upload the Master Crystal Inventory in Settings first: no products are loaded for export.',
  day_not_over: "Today can't be exported until it's over.",
  pokemon_export_unavailable: "Pokémon export isn't available yet.",
  nothing_to_export: 'Nothing is left to export here: it was already exported.',
  bad_price: 'A Sell Price was missing: nothing was exported.',
  collection_not_paid: 'Mark it Paid/Ours first.',
  not_lock_holder: 'Another computer is editing this collection now: take over to export.',
  no_user: 'Pick a user first.',
};

/**
 * Save the export (export spec 8.4): `export_lines` in one transaction.
 * Rejects with .code for the refusals above.
 * @returns {Promise<{ buys: number, cards: number, cant: number, sku: string, lines: object[] }>}
 */
export async function saveExport({ target, matches, cant, setMaps, userId, deviceId }) {
  const { data, error } = await supabase.rpc('export_lines', {
    p_target: target,
    p_matches: matches,
    p_cant: cant,
    p_set_maps: setMaps,
    p_user: userId,
    p_device: deviceId,
  });
  if (error) {
    const code = Object.keys(EXPORT_ERRORS).find((c) => error.message?.includes(c)) ?? null;
    const e = new Error(code ? EXPORT_ERRORS[code] : `Couldn't export: ${error.message}`);
    e.code = code;
    throw e;
  }
  return data;
}

/** Hand the browser the Mass Create file (export spec 4.3). */
export function downloadMassCreate(lines, name) {
  const rows = massCreateRows(lines);
  const url = URL.createObjectURL(new Blob([massCreateCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return rows.length;
}
