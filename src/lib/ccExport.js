// The export's data side (docs/EXPORT_FUNCTION.md 7–8): matching a set of
// Magic lines to the current inventory's CC products, and saving what staff
// teach it. The matching rules themselves are in ccMatch.js.

import { supabase } from './supabase.js';
import { loadSets } from './scryfall.js';
import { nameKey } from './normalize.js';
import {
  categoryFor, chooseProduct, evidenceTreatments, fold, frontFace, promoKind, searchCategories, usableLink,
} from './ccMatch.js';
import { scryfallCards, todaysPrices } from './todaysPrices.js';
import { sellPriceFor } from './sellPrice.js';
import { massCreateCsv, massCreateRows } from './massCreate.js';
import { allPages, inChunks } from './inChunks.js';
import { DB_MESSAGES, knownCode } from './dbErrors.js';
import { matchesChanged } from './matchCache.js';

// Full Scryfall cards by id now live with today's prices (todaysPrices.js).
export { scryfallCards };

const fail = (error, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

/** The link key for a printing and finish. */
export const linkKey = (line) => `${line.scryfall_id}|${line.finish}`;

/**
 * Every set choice staff made ("Always use the picked product's category for…"), page by page
 * (decision 390): the API stops at 1,000 rows, and a set past them would lose its choice.
 * @returns {Promise<{ data: object[]|null, error: any }>}
 */
export const readSetMap = () => allPages((from, to) => supabase.from('cc_set_map')
  .select('scryfall_set, promo_kind, category')
  .order('scryfall_set').order('promo_kind')
  .range(from, to));

/**
 * The inventory's categories and staff's set choices, which every match reads first. The
 * owned-copies counter keeps them a while rather than reading them for every card (owned.js).
 * Throws with code 'no_inventory' when no inventory is loaded.
 * @returns {Promise<{ categories: Map<string, string>, setMap: Map<string, string> }>}
 */
export async function matchContext() {
  const [{ data: catList, error: catError }, { data: mapRows, error: mapError }] = await Promise.all([
    supabase.rpc('cc_categories'),
    readSetMap(),
  ]);
  fail(catError, "Couldn't read the inventory's categories");
  fail(mapError, "Couldn't read the set choices");
  if (!catList?.length) {
    const e = new Error('Upload the Master Crystal Inventory in Settings first: no products are loaded for export.');
    e.code = 'no_inventory';
    throw e;
  }
  return {
    categories: new Map(catList.map((c) => [fold(c), c])),
    setMap: new Map((mapRows ?? []).map((m) => [`${m.scryfall_set}|${m.promo_kind}`, m.category])),
  };
}

/** The names CC may file a line's card under: its own, its flavor name, its front face. */
export const baseKeysFor = (line, flavor = null) => [nameKey(line.name), ...(flavor ? [nameKey(flavor)] : []),
  ...(line.name.includes(' // ') ? [nameKey(frontFace(line.name))] : [])];

/**
 * Match Magic lines to CC products (export spec 7). Each result says where
 * the line stands:
 *  - 'auto'   matched (by a remembered link, or one clear candidate);
 *  - 'choose' staff must pick (candidates, but no clear one; or no category);
 *  - 'none'   no candidates at all (can't upload, unless staff find one).
 * @param {object[]} lines  buy_lines rows (Magic)
 * @param {(text: string) => void} [onStep]
 * @param {{ context?: object, cards?: Map<string, object> }} [given]  matchContext() already read, and the
 *   lines' full Scryfall cards already in hand (the owned-copies counter's one card), so neither is fetched
 * @returns {Promise<{ results: object[], cards: Map<string, object> }>}
 */
export async function matchLines(lines, onStep, given = {}) {
  onStep?.(`Matching ${lines.length} card${lines.length === 1 ? '' : 's'}…`);
  const { categories, setMap } = given.context ?? await matchContext();

  const ids = [...new Set(lines.map((l) => l.scryfall_id).filter(Boolean))];
  // The remembered matches and their products, read while the candidates below are (neither needs the
  // other: one round trip fewer, for the owned-copies counter above all; decision 453).
  const remembered = (async () => {
    // In chunks: a big project's printings make too long a URL in one (inChunks.js).
    const { data: linkRows, error: linkError } = await inChunks(
      (part) => supabase.from('cc_product_links').select('*').in('scryfall_id', part), ids);
    fail(linkError, "Couldn't read the remembered matches");
    // Only a person's picks (decision 486): a match the app made by itself is made again, never trusted.
    const links = new Map((linkRows ?? []).filter(usableLink).map((k) => [`${k.scryfall_id}|${k.finish}`, k]));
    const linked = [...new Set([...links.values()].map((k) => k.product_id))];
    const { data: linkedProducts, error: byIdError } = linked.length
      ? await supabase.rpc('cc_products_by_id', { p_ids: linked })
      : { data: [], error: null };
    fail(byIdError, "Couldn't read the remembered products");
    return { links, productById: new Map((linkedProducts ?? []).map((p) => [p.product_id, p])) };
  })();
  remembered.catch(() => {});   // awaited below; this only keeps an early failure from going unhandled
  const [sets, cards] = await Promise.all([loadSets(), given.cards ?? scryfallCards(ids)]);

  // Where each line's set lives, and what to ask the database for.
  const prepared = lines.map((line) => {
    const code = String(line.source_set_id ?? line.set_code ?? '').toLowerCase();
    const set = sets.get(code) ?? { code, name: line.set_name ?? line.set_code, set_type: null };
    const parent = set.parent_set_code ? sets.get(set.parent_set_code) ?? null : null;
    const card = cards.get(line.scryfall_id) ?? null;
    const flavor = card?.flavor_name ?? null;
    const promo = promoKind(line.treatments);
    const where = categoryFor({ set, parent, promo, categories, setMap });
    // The List and Mystery Booster are one at the store: both are searched (ccMatch.js).
    const also = searchCategories(where?.category ?? null, categories).slice(1);
    const baseKeys = baseKeysFor(line, flavor);
    return { line, set, promo, card, flavor, where, also, baseKeys };
  });
  // One want per category searched; their rows come back under the line's key together.
  const wants = prepared.flatMap((p) => [p.where?.category ?? null, ...p.also]
    .map((category) => ({ key: p.line.id, category, base_keys: p.baseKeys })));
  onStep?.('Finding their Crystal Commerce products…');
  // Page by page: a big export's candidates run past the API's row limit (decision 346).
  const [{ data: candRows, error: candError }, { links, productById }] = await Promise.all([
    allPages((from, to) => supabase
      .rpc('cc_candidates', { p_wants: wants })
      .order('key').order('category').order('product_id')
      .range(from, to)),
    remembered,
  ]);
  fail(candError, "Couldn't read the inventory's products");
  const byKey = new Map();
  for (const row of candRows ?? []) {
    if (!byKey.has(row.key)) byKey.set(row.key, []);
    byKey.get(row.key).push(row);
  }

  const results = prepared.map(({ line, set, promo, card, flavor, where, also }) => {
    const link = links.get(linkKey(line)) ?? null;
    const linkedProduct = link ? productById.get(link.product_id) ?? null : null;
    const candidates = byKey.get(line.id) ?? [];
    const base = {
      line, set, promo, card, flavor, category: where?.category ?? null, also, how: where?.how ?? null, candidates,
    };
    // The card's Scryfall facts the line keeps no treatment for ("Showcase Scrolls"), read for every line, old
    // or new (decision 485); without the card, those words stay words the matcher can't read.
    const matched = card
      ? { ...line, treatments: [...new Set([...(line.treatments ?? []), ...evidenceTreatments(card)])] }
      : line;
    const pick = chooseProduct(matched, candidates, { flavor, home: also.length ? where.category : null, evidence: Boolean(card) });
    if (linkedProduct) {
      // Its candidates still ranked, so Change can offer them.
      return { ...base, status: 'auto', product: linkedProduct, ranked: pick.ranked, expected: pick.expected, via: 'link', link };
    }
    // With no category, the candidates come from every category: staff decide (spec 7.3 step 5). A person's pick
    // whose product left the inventory is theirs to make again, never the app's guess (decision 487).
    const status = pick.status === 'auto' && (!where || link) ? 'choose' : pick.status;
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
  matchesChanged();
}

/** Forget a printing and finish's remembered product (the dry run, put back to what the app found). */
export async function forgetLink(line) {
  const { error } = await supabase.from('cc_product_links').delete()
    .eq('scryfall_id', line.scryfall_id).eq('finish', line.finish);
  fail(error, "Couldn't forget that product");
  matchesChanged();
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
  matchesChanged();
}

/** "Find another CC product…": products whose names contain the text. */
export async function searchProducts(text) {
  const { data, error } = await supabase.rpc('cc_products_search', { p_text: text, p_limit: 30 });
  fail(error, "Couldn't search the inventory");
  return data ?? [];
}

// ------------------------------------------------------------ the Sell Price

/**
 * Today's Sell Price for each line (export spec 5.4), from todaysPrices.js
 * (the Scryfall cards the matching fetched are reused). Throws if today's
 * prices can't be had: an export never uses stale prices.
 * @param {object[]} lines
 * @param {Map<string, object>} cards  Scryfall cards by id (matchLines)
 * @param {Record<string, number>} pct  the Master Fallback Percentages (Magic)
 * @param {(text: string) => void} [onStep]
 * @param {number} [floor]  the Export sell floor (decision 417); $0.40 if left out
 * @returns {Promise<Map<string, { price: number, basis: object }>>} by line id
 */
export async function sellPrices(lines, cards, pct, onStep, floor) {
  let today;
  try {
    today = await todaysPrices(lines, { cards, onStep, backup: true });
  } catch (e) {
    throw new Error(`${e.message} Nothing was exported.`);
  }
  return new Map(lines.map((line) => [line.id, sellPriceFor(line, { ...today.get(line.id), pct, floor })]));
}

// ------------------------------------------------------------ the export

const EXPORT_ERRORS = {
  ...DB_MESSAGES,
  stale_version: 'Something changed on another computer since this opened: nothing was exported. Try again.',
  stale_inventory: 'The Master Crystal Inventory was replaced while this was open: matching again.',
  no_inventory: 'Upload the Master Crystal Inventory in Settings first: no products are loaded for export.',
  pokemon_export_unavailable: "Pokémon export isn't available yet.",
  nothing_to_export: 'Nothing is left to export here: it was already exported.',
  bad_price: 'A Sell Price was missing: nothing was exported.',
  collection_not_paid: 'Mark it Paid/Ours first.',
  not_lock_holder: 'Another computer is editing this collection now: take over to export.',
};

/**
 * Save the export (export spec 8.4): `export_lines` in one transaction.
 * Rejects with .code for the refusals above.
 * @returns {Promise<{ buys: number, cards: number, cant: number, sku: string, lines: object[] }>}
 */
export async function saveExport({ target, matches, cant, pulled = [], setMaps, userId, deviceId }) {
  const { data, error } = await supabase.rpc('export_lines', {
    p_target: target,
    p_matches: matches,
    p_cant: cant,
    p_set_maps: setMaps,
    p_user: userId,
    p_device: deviceId,
    // Export MTG csv (>…)'s bulk cards, pulled to Bulk pulled from exports (decisions 406, 416).
    ...(pulled.length ? { p_pulled: pulled } : {}),
  });
  if (error) {
    const code = knownCode(error, EXPORT_ERRORS);
    const e = new Error(code ? EXPORT_ERRORS[code] : `Couldn't export: ${error.message}`);
    e.code = code;
    throw e;
  }
  matchesChanged();   // it learns the picks and set choices, and exports cards (decision 473)
  return data;
}

/**
 * An export whose answer was lost on the way back (flaky wifi; decision 362): did it go through?
 * Its matched cards, read back, each carry the export id the dialog stamped in their Sell Price
 * basis when it did, and not another computer's export of the same cards.
 * @param {string[]} lineIds  the matched cards' line ids
 * @param {string} exportId
 * @returns {Promise<object[]|null>}  the cards as export_lines returns them, or null if it didn't land
 */
export async function exportLanded(lineIds, exportId) {
  if (!lineIds.length) return null;
  const { data, error } = await inChunks((part) => supabase.from('buy_lines')
    .select('id, quantity, cc_status, cc_product_name, cc_category, cc_condition, cc_sell_price, cc_sell_basis, cc_custom_sku')
    .in('id', part), lineIds);
  if (error) throw new Error(`Couldn't check: ${error.message}`);
  const landed = data.length === lineIds.length
    && data.every((l) => l.cc_status === 'exported' && l.cc_sell_basis?.exportId === exportId);
  return landed ? data : null;
}

/**
 * Which of these exported cards' stamp times are Can't upload cards exports (decision 372): a card
 * exported from there is restamped with that export's time, the same moment as the export's
 * changelog entry (both the transaction's now()).
 * @param {object[]} lines  exported lines (cc_exported_at)
 * @returns {Promise<Set<string>>}  rejects when it can't be read
 */
export async function restampTimes(lines) {
  const times = [...new Set(lines.filter((l) => l.cc_status === 'exported' && l.cc_exported_at)
    .map((l) => l.cc_exported_at))];
  if (!times.length) return new Set();
  // An export from Bulk pulled from exports restamps its originals the same way (decision 406).
  const { data, error } = await inChunks((part) => supabase.from('events').select('at')
    .in('action', ['cant_upload_exported', 'pulled_exported']).in('at', part), times, 50);
  if (error) throw new Error(`Couldn't check which cards were exported from Can't upload cards: ${error.message}`);
  return new Set(data.map((e) => e.at));
}

/**
 * Hand the browser the Mass Create file (export spec 4.3).
 * @param {Record<string, number>} pct  Master Fallback Percentages (Magic): worse conditions' NM prices
 */
export function downloadMassCreate(lines, name, pct) {
  const rows = massCreateRows(lines, pct);
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
