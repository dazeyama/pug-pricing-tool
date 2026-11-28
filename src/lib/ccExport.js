// The export's data side (docs/EXPORT_FUNCTION.md 7–8): matching a set of
// Magic lines to the current inventory's CC products, and saving what staff
// teach it. The matching rules themselves are in ccMatch.js.

import { supabase } from './supabase.js';
import { loadSets } from './scryfall.js';
import { nameKey } from './normalize.js';
import {
  alwaysChoose, categoryFor, ccListPrintings, chooseProduct, evidenceTreatments, fold, frontFace, isListCard, promoKind,
  surgeAllows,
  searchCategories, usableLink,
} from './ccMatch.js';
import { scryfallCards, todaysPrices } from './todaysPrices.js';
import { sellPriceFor } from './sellPrice.js';
import { massCreateCsv, massCreateRows } from './massCreate.js';
import { allPages, inChunks } from './inChunks.js';
import { DB_MESSAGES, knownCode } from './dbErrors.js';
import { matchesChanged } from './matchCache.js';
import { listIndex, routeBaseKeys, routeProduct } from './tcgRoute.js';
import { TCG_SET_TABLE } from './tcgSetTable.js';

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
  // The route's side (decision 594), beside everything else: each line's TCGplayer product, then its candidates by
  // TCGplayer's name in every category. Nothing waits on it but the end: with the catalog empty, or every product
  // already read on this page, it costs the Price screen's copies we own no round trip of its own.
  const routed = routeSide(lines);
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
  const [{ data: candRows, error: candError }, { links, productById }, route] = await Promise.all([
    readCandidates(wants),
    remembered,
    routed,
  ]);
  fail(candError, "Couldn't read the inventory's products");
  const byKey = groupByKey(candRows);

  const categoryNamed = (name) => categories.get(fold(name)) ?? null;
  const results = prepared.map(({ line, set, promo, card, flavor, where, also }) => {
    const link = links.get(linkKey(line)) ?? null;
    return matchOne({
      line, set, promo, card, flavor, where, also, link,
      linkedProduct: link ? productById.get(link.product_id) ?? null : null,
      candidates: byKey.get(line.id) ?? [],
      tcg: route.tcgById.get(Number(line.tcgplayer_id)) ?? null,
      routeCandidates: route.byKey.get(line.id) ?? [],
      tcgListPrintings: route.listTcg.get(line.id) ?? 0,
      categoryNamed,
    });
  });
  return { results, cards };
}

/**
 * One line's match, in the order decisions 486, 487, 574, 594, 599 and 607 set: a remembered staff pick; else, unless
 * the pick is staff's to make (a remembered pick whose product left the inventory; a Secret Lair card by its set, its
 * category, the route's category or its TCGplayer set; a The List card with more than one The List printing in CC
 * or on TCGplayer), the TCGplayer route's one product; else today's matcher. A Surge Foil is matched by either only
 * to a product with "Surge" in its name, else it's staff's to pick (607).
 * Pure: matchLines reads everything first.
 * @param {object} p
 * @param {object} p.line  a buy line
 * @param {{ code: string }} p.set  its Scryfall set
 * @param {string} p.promo  promoKind(...)
 * @param {object|null} p.card  its Scryfall card
 * @param {string|null} p.flavor
 * @param {{ category: string, how: string }|null} p.where  categoryFor's answer
 * @param {string[]} p.also  the other categories searched
 * @param {object|null} p.link  its remembered staff pick (usableLink), or null
 * @param {object|null} p.linkedProduct  that pick's product in the current inventory, or null when it's gone
 * @param {object[]} p.candidates  cc_candidates rows for today's matcher
 * @param {object|null} p.tcg  its TCGplayer product (with group_name), or null
 * @param {object[]} p.routeCandidates  cc_candidates rows by TCGplayer's name, any category
 * @param {number} [p.tcgListPrintings]  TCGplayer's The List products of its name (readListProducts)
 * @param {(name: string) => string|null} p.categoryNamed
 * @param {Record<number, Array>} [p.table]  the set table (tcgSetTable.js)
 */
export function matchOne({
  line, set, promo, card, flavor, where, also, link, linkedProduct, candidates, tcg, routeCandidates, categoryNamed,
  tcgListPrintings = 0, table = TCG_SET_TABLE,
}) {
  const base = {
    line, set, promo, card, flavor, category: where?.category ?? null, also, how: where?.how ?? null, candidates,
  };
  // The card's Scryfall facts the line keeps no treatment for ("Showcase Scrolls"), read for every line, old
  // or new (decision 485). They only confirm: without one, its word stays a word the matcher can't read.
  const matched = card
    ? { ...line, treatments: [...new Set([...(line.treatments ?? []), ...evidenceTreatments(card)])] }
    : line;
  const pick = chooseProduct(matched, candidates, { flavor, home: also.length ? where.category : null });
  if (linkedProduct) {
    // Its candidates still ranked, so Change can offer them.
    return { ...base, status: 'auto', product: linkedProduct, ranked: pick.ranked, expected: pick.expected, via: 'link', link };
  }
  // With no category, the candidates come from every category: staff decide (spec 7.3 step 5). A person's pick
  // whose product left the inventory is theirs to make again, never the app's guess (decision 487). A Secret Lair
  // card is always staff's to pick, until a pick is remembered (decision 574); so is a The List card with more than
  // one The List printing in CC or on TCGplayer (decision 599).
  const tcgList = tcg != null && fold(table[tcg.group_id]?.[1]) === 'thelist';
  const listChoice = isListCard(set, where?.category ?? null, tcgList)
    && (ccListPrintings([...candidates, ...routeCandidates]) > 1 || tcgListPrintings > 1);
  const staffs = alwaysChoose(set, where?.category ?? null) || listChoice;
  // A The List card staff must pick goes to Needs a choice even with no product under its own name (decision 599,
  // after the release review): TCGplayer's count says it has printings, so it isn't Can't upload; what was found by
  // TCGplayer's name is offered there, unscored, beside the search.
  const listNone = listChoice && pick.status === 'none';
  // A Surge Foil the matcher found only a product without "Surge" in its name for is a choice too (decision 607).
  const status = listNone || (pick.status === 'auto' && (!where || link || staffs || !surgeAllows(line, pick.product)))
    ? 'choose' : pick.status;
  const ranked = listNone && !pick.ranked.length
    ? [...new Map(routeCandidates.map((p) => [p.product_id, { product: p, score: null, reasons: [] }])).values()]
    : pick.ranked;
  // The TCGplayer route first (decision 594; tcgRoute.js), never for a pick that's staff's to make (487, 574, 599):
  // its one product wins; with no single answer, today's matcher's stands. A route match is made again at each
  // export, never remembered (decision 486).
  // A TCGplayer set named Secret Lair is a staff pick too, whatever category the set table gives it (574).
  if (tcg && !link && !staffs && !alwaysChoose(null, tcg.group_name)) {
    const a = routeProduct({
      // Its Scryfall card's finishes: a foil-only printing may take a promo's product named without "Foil" (4c).
      line: { ...line, finishes: card?.finishes ?? null },
      tcg, candidates: routeCandidates, table, categoryNamed,
    });
    // A Surge Foil's product must say Surge (decision 607): TCGplayer's product for one is often the plain card's
    // (decision 316), so the route would name the plain foil. Otherwise today's matcher answers, by the same rule;
    // when it found nothing under the card's name, Needs a choice rather than Can't upload (the owner, after the
    // release review: "Yes, Needs a choice"), the route's product and its other candidates offered unscored, as
    // The List's are.
    const surgeOnlyRoute = a.status === 'auto' && !surgeAllows(line, a.product);
    if (surgeOnlyRoute && pick.status === 'none' && !alwaysChoose(null, a.product.category)) {
      const offered = [...new Map([a.product, ...routeCandidates].map((p) => [p.product_id, { product: p, score: null, reasons: [] }])).values()];
      return { ...base, status: 'choose', product: null, ranked: offered, expected: pick.expected, via: null, wasLinked: null };
    }
    if (a.status === 'auto' && !alwaysChoose(null, a.product.category) && !surgeOnlyRoute) {
      // First among its candidates, scored, so Change offers it as the app's own match, whatever the card's name
      // alone made of it (a 4c match the matcher ranks as "a different finish or number").
      const ranked = [{ product: a.product, score: 1000, reasons: ['tcgplayer'] },
        ...pick.ranked.filter((x) => x.product.product_id !== a.product.product_id)];
      // Where today's matcher had no product or another one, the dialog says the route found it.
      const routeOnly = !(status === 'auto' && pick.product?.product_id === a.product.product_id);
      return { ...base, status: 'auto', product: a.product, ranked, expected: pick.expected, via: 'route', routeOnly };
    }
  }
  return {
    ...base,
    status,
    product: status === 'auto' ? pick.product : null,
    ranked,
    expected: pick.expected,
    via: status === 'auto' ? 'match' : null,
    wasLinked: link && !linkedProduct ? link : null,
  };
}

/** cc_candidates for a list of wants, page by page (decision 346). */
const readCandidates = (wants) => (wants.length ? allPages((from, to) => supabase
  .rpc('cc_candidates', { p_wants: wants })
  .order('key').order('category').order('product_id')
  .range(from, to)) : Promise.resolve({ data: [], error: null }));

/** Candidate rows grouped by their want's key. */
function groupByKey(rows) {
  const byKey = new Map();
  for (const row of rows ?? []) {
    if (!byKey.has(row.key)) byKey.set(row.key, []);
    byKey.get(row.key).push(row);
  }
  return byKey;
}

// The TCGplayer products already read on this page, by product id: a printing's product doesn't change between two
// looks at it, so the Price screen's copies we own reads it once (decision 594). Only products found are kept: one
// missing may arrive with the next catalog refresh.
const TCG_SEEN = new Map();

/**
 * The lines' TCGplayer products (`tcg_products`, their set's name beside each), by product id, for the route
 * (decision 594); those read before on this page come from TCG_SEEN without a read.
 * @param {object[]} lines
 * @returns {Promise<Map<number, object>>}
 */
async function readTcgProducts(lines) {
  const ids = [...new Set(lines.map((l) => String(l.tcgplayer_id ?? '')).filter((s) => /^\d+$/.test(s)).map(Number))];
  const unseen = ids.filter((id) => !TCG_SEEN.has(id));
  if (unseen.length) {
    const { data, error } = await inChunks((part) => supabase.from('tcg_products')
      .select('product_id, group_id, name, number, tcg_groups(name)').in('product_id', part), unseen);
    fail(error, "Couldn't read TCGplayer's catalog");
    for (const t of data ?? []) TCG_SEEN.set(t.product_id, { ...t, group_name: t.tcg_groups?.name ?? null });
  }
  return new Map(ids.filter((id) => TCG_SEEN.has(id)).map((id) => [id, TCG_SEEN.get(id)]));
}

/**
 * The route's side of a match (decision 594), run beside the matcher's reads: the lines' TCGplayer products, then
 * their candidates by TCGplayer's own name in every category (the set table says which category is theirs), keyed
 * by the line's id. A failure leaves both empty: every line is matched as before the route.
 * @param {object[]} lines
 * @returns {Promise<{ tcgById: Map<number, object>, byKey: Map<string, object[]> }>}
 */
async function routeSide(lines) {
  try {
    const tcgById = await readTcgProducts(lines);
    const wants = lines.filter((l) => tcgById.has(Number(l.tcgplayer_id)))
      .map((l) => ({ key: l.id, category: null, base_keys: routeBaseKeys(tcgById.get(Number(l.tcgplayer_id))) }));
    // The List's cards (decision 599), by their Scryfall set or their TCGplayer product's set: how many The List
    // products TCGplayer has of their name, read beside the candidates.
    const listLines = lines.filter((l) => isListCard({ code: l.source_set_id ?? l.set_code }, null,
      LIST_GROUPS.includes(tcgById.get(Number(l.tcgplayer_id))?.group_id)));
    const listName = (l) => nameKey(frontFace(l.name));
    const [{ data, error }, listed] = await Promise.all([
      readCandidates(wants),
      (listLines.length ? readListIndex() : Promise.resolve(new Map())).catch((e) => {
        console.warn("TCGplayer's The List printings couldn't be read: only CC's are counted", e);
        return new Map();
      }),
    ]);
    fail(error, "Couldn't read the inventory's products");
    const listTcg = new Map(listLines.map((l) => [l.id, listed.get(listName(l))?.size ?? 0]));
    // Said, never quiet (the release review): a card whose own TCGplayer product is a The List printing, found under
    // no name, means the names didn't line up; it's counted by CC's printings alone.
    for (const l of listLines) {
      if (listed.size && !listTcg.get(l.id) && LIST_GROUPS.includes(tcgById.get(Number(l.tcgplayer_id))?.group_id)) {
        console.warn(`TCGplayer's The List has no printing named "${listName(l)}", though its own product is one: only CC's are counted`, l);
      }
    }
    return { tcgById, byKey: groupByKey(data), listTcg };
  } catch (e) {
    console.warn("The TCGplayer route didn't run: the cards are matched as before it", e);
    return { tcgById: new Map(), byKey: new Map(), listTcg: new Map() };
  }
}

/** TCGplayer's The List sets, by the set table (decision 599): "The List Reprints" today. */
const LIST_GROUPS = Object.entries(TCG_SET_TABLE).filter(([, row]) => fold(row[1]) === 'thelist').map(([id]) => Number(id));

// TCGplayer's The List, read once on this page (decision 599): a promise of its index, kept as TCG_SEEN keeps products.
let LIST_READ = null;

/**
 * TCGplayer's whole The List (decision 599; about 5,800 products, 1,000 a request), indexed by the route's names
 * (tcgRoute.js listIndex), read once on a page the first time a The List card is matched. Not a search by name
 * (the release review, 2026-11-21): a quoted `ilike` pattern or a folded name could have found nothing without an
 * error, and every card would have been counted by CC's printings alone. A read that fails is read again next time.
 * @returns {Promise<Map<string, Set<number>>>}
 */
function readListIndex() {
  if (!LIST_GROUPS.length) return Promise.resolve(new Map());
  if (!LIST_READ) {
    LIST_READ = (async () => {
      const { data, error } = await allPages((from, to) => supabase.from('tcg_products')
        .select('product_id, name', { count: 'exact' }).in('group_id', LIST_GROUPS).order('product_id').range(from, to));
      fail(error, "Couldn't read TCGplayer's The List");
      return listIndex(data);
    })();
    LIST_READ.catch(() => {
      LIST_READ = null;
    });
  }
  return LIST_READ;
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
 * @param {Map<string, object>} [nearMint]  the NM rows (massCreate.js nearMintPrices), when the lines
 *   don't carry their Sell Price basis; else read from it
 */
export function downloadMassCreate(lines, name, nearMint) {
  const rows = massCreateRows(lines, nearMint);
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
