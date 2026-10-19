// Import Collection's data side (owner, 2026-10-09): reading the file,
// looking its rows' printings up on Scryfall, the picks staff made before,
// and saving the cards as a project or into an empty collection. The
// matching rules are in importMatch.js.

import Papa from 'papaparse';
import { supabase } from './supabase.js';
import { cardImage, cardsByTcgplayerIds, keptLanguage, loadSets, searchAll } from './scryfall.js';
import { fetchPrices } from './prices.js';
import { inChunks } from './inChunks.js';
import { scryfallCards, scryfallCollection } from './todaysPrices.js';
import { normNumber } from './query.js';
import { saveLink } from './ccExport.js';
import { fold } from './ccMatch.js';
import { nameKey } from './normalize.js';
import { magicTreatments } from './printings.js';
import { lineText } from './lineFormat.js';
import {
  cardsForRow, categorySets, choosePrinting, fileFormat, finishOf, finishOfPrinting, importKey, missingColumns,
  namesFor, readRows, readTcgplayerRows,
} from './importMatch.js';

/**
 * Every printing a Scryfall search finds, in the languages the Buy tab's
 * searches keep (decision 271): English, and the Japanese-only printings
 * English packs carry (Mystical Archive's Japanese alternate art), never the
 * Japanese copies of English cards. No lang: term, so Scryfall gives each
 * printing once, in English where there is one.
 */
const printings = async (q, opts) => (await searchAll(q, opts)).filter(keptLanguage);

const fail = (error, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

// Scryfall cuts a query off at about 1,000 characters ("unclosed
// parentheses"), so a query holds at most 20 set codes and 600 characters of names.
const SET_CHUNK = 20;        // set codes in one Scryfall query
const QUERY_MAX = 600;       // characters of names in one query
const FALLBACK_PAGES = 3;    // pages (175 each) for a name looked up in every set

/**
 * Read an import file: a Mass Create CSV, or TCGplayer's inventory format
 * (each card by its SKU), told apart by the header.
 * @param {File} file
 * @returns {Promise<{ format: 'cc'|'tcgplayer', rows: object[], missing: string[] }>}
 */
export function readImportFile(file, pct) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (res) => {
        const format = fileFormat(res.meta.fields);
        resolve({
          format,
          rows: format === 'tcgplayer' ? readTcgplayerRows(res.data) : readRows(res.data, pct),
          missing: missingColumns(res.meta.fields, format),
        });
      },
      error: (e) => reject(new Error(`Couldn't read the file: ${e.message}`)),
    });
  });
}

/** Scryfall's exact-name terms for names, quotes dropped. */
const exact = (names) => names.map((n) => `!"${n.replace(/"/g, '')}"`);

/** Names into queries no longer than QUERY_MAX each. */
function nameChunks(names) {
  const chunks = [];
  let chunk = [];
  let size = 0;
  for (const term of exact(names)) {
    if (chunk.length && size + term.length > QUERY_MAX) {
      chunks.push(chunk);
      chunk = [];
      size = 0;
    }
    chunk.push(term);
    size += term.length + 4;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

const SKU_BATCH = 200;
// Remembered picks are read by key (a category and product name, up to ~150
// characters): 40 a request keeps the URL short (inChunks.js).
const KEY_CHUNK = 40;   // SKUs in one call to the prices function (two JustTCG requests)

/** A JustTCG card's name as Scryfall has it: "Klothys, God of Destiny (Showcase)" → "Klothys, God of Destiny". */
function plainName(name) {
  const base = String(name ?? '').replace(/\s*\([^()]*\)\s*$/, '').trim();
  // Godzilla Series and the like: "Anguirus, Armored Killer - Gemrazer" is flavor name - card name.
  return base.includes(' - ') ? base.split(' - ').pop().trim() : base;
}

/**
 * TCGplayer-format rows (owner, 2026-10-09): each SKU looked up on JustTCG
 * (through the prices function, cached like any price), which names the
 * card and the exact version, condition and printing; then its Scryfall
 * printing, by the Scryfall ID JustTCG has, else by the TCGplayer product.
 * A SKU JustTCG doesn't know, or a product Scryfall doesn't, goes to staff.
 * Same results as matchImport.
 */
async function matchSkus(rows, onStep) {
  const ok = rows.filter((r) => !r.problem);
  const keys = [...new Set(ok.map(importKey))];
  const { data: picked, error: pickError } = await inChunks(
    (part) => supabase.from('import_links').select('*').in('key', part), keys, KEY_CHUNK);
  fail(pickError, "Couldn't read the remembered picks");
  const remembered = new Map((picked ?? []).map((k) => [k.key, k]));

  const skus = [...new Set(ok.map((r) => r.sku))];
  const found = {};
  for (let i = 0; i < skus.length; i += SKU_BATCH) {
    onStep?.(`Looking up TCGplayer SKUs: ${Math.min(i + SKU_BATCH, skus.length)} of ${skus.length}…`);
    Object.assign(found, await fetchPrices(skus.slice(i, i + SKU_BATCH).map((sku) => ({
      key: `mtg:sku:${sku}`, game: 'mtg', lang: 'en', tcgplayerSkuId: sku,
    }))));
  }

  // Each row as JustTCG names it: the card, its set, the SKU's version.
  const named = rows.map((row) => {
    if (row.problem) return row;
    const jt = found[`mtg:sku:${row.sku}`]?.card ?? null;
    if (!jt) return { ...row, jt: null };
    const variant = (jt.variants ?? []).find((v) => String(v.tcgplayerSkuId) === row.sku)
      ?? ((jt.variants ?? []).length === 1 ? jt.variants[0] : null);
    const next = { ...row, jt, variant, productName: jt.name, category: jt.set_name ?? 'TCGplayer' };
    if (!/magic-the-gathering$/.test(String(jt.set ?? ''))) return { ...next, problem: 'Not a Magic card' };
    if (!Number.isFinite(row.price)) {
      if (variant?.price == null) return { ...next, problem: 'No price in the file, and none on TCGplayer' };
      return { ...next, price: Math.round(Number(variant.price) * 100) / 100, priceFrom: 'TCGplayer' };
    }
    return next;
  });

  // Their Scryfall printings: by id (remembered, or JustTCG's); else by set
  // and collector number, 75 a request, kept only where Scryfall's TCGplayer
  // product is this one; else one by one by product (owner, 2026-10-09: as
  // fast as Scryfall's limits allow, never over them).
  const live = named.filter((r) => !r.problem);
  const ids = live.map((r) => remembered.get(importKey(r))?.scryfall_id ?? r.jt?.scryfallId).filter(Boolean);
  onStep?.('Finding their printings on Scryfall…');
  const byId = await scryfallCards(ids);
  const byProduct = new Map();
  const product = (r) => String(r.jt?.tcgplayerId ?? '');
  const unsolved = () => live.filter((r) => r.jt && product(r) && !(r.jt.scryfallId && byId.has(r.jt.scryfallId))
    && !byProduct.has(product(r)));

  const sets = await loadSets();
  const setNames = new Map(unsolved().map((r) => [fold(r.jt.set_name), r.jt.set_name]));
  const codesFor = categorySets({ sets, categories: setNames, setMap: new Map() });
  const identifiers = new Map();
  for (const r of unsolved()) {
    const codes = codesFor.get(fold(r.jt.set_name)) ?? [];
    const number = normNumber(String(r.jt.number ?? '').split('/')[0]);
    if (!number || !/^\d/.test(number) || !codes.length || codes.length > 4) continue;
    for (const code of codes) {
      // A promo pack's printing is numbered "46p" on Scryfall, "46" on TCGplayer.
      const numbers = sets.get(code)?.set_type === 'promo' ? [number, `${number}p`] : [number];
      for (const n of numbers) identifiers.set(`${code}|${n}`, { set: code, collector_number: n });
    }
  }
  if (identifiers.size) {
    onStep?.('Finding their printings on Scryfall by set and number…');
    for (const card of await scryfallCollection([...identifiers.values()])) {
      for (const id of [card.tcgplayer_id, card.tcgplayer_etched_id].filter(Boolean)) {
        if (!byProduct.has(String(id))) byProduct.set(String(id), card);
      }
    }
  }

  const rest = [...new Set(unsolved().map(product))];
  if (rest.length) {
    const found = await cardsByTcgplayerIds(rest, (done, total) => onStep?.(`Finding their printings on Scryfall: ${done} of ${total}…`));
    for (const [id, card] of found) if (card) byProduct.set(id, card);
  }
  // Not found by product either: their names, for staff to choose from.
  const lost = live.filter((r) => r.jt && !(r.jt.scryfallId && byId.has(r.jt.scryfallId))
    && !byProduct.has(String(r.jt.tcgplayerId ?? '')));
  const named2 = new Map();
  for (const name of [...new Set(lost.map((r) => plainName(r.jt.name)))]) {
    named2.set(name, await printings(`!"${name.replace(/"/g, '')}" game:paper`, { maxPages: 1 }));
  }

  return named.map((row) => {
    if (row.problem) return { row, status: 'skip', card: null, finish: null, ranked: [] };
    const base = { row, product: null, elsewhere: false };
    const finish = row.variant ? finishOfPrinting(row.variant.printing) : 'nonfoil';
    const pick = remembered.get(importKey(row));
    if (pick && byId.has(pick.scryfall_id)) {
      const card = byId.get(pick.scryfall_id);
      return { ...base, status: 'auto', card, finish: pick.finish, via: 'remembered', ranked: [{ card, score: 0, reasons: [] }] };
    }
    if (!row.jt) return { ...base, status: 'none', card: null, finish, ranked: [] };
    const card = (row.jt.scryfallId && byId.get(row.jt.scryfallId)) || byProduct.get(String(row.jt.tcgplayerId ?? '')) || null;
    if (card) {
      // A version JustTCG didn't say: the printing's own finish, non-foil first.
      const f = row.variant ? finish : ((card.finishes ?? []).includes('nonfoil') ? 'nonfoil' : card.finishes?.[0] ?? 'nonfoil');
      return { ...base, status: 'auto', card, finish: f, via: 'sku', ranked: [{ card, score: 0, reasons: [] }] };
    }
    const cards = named2.get(plainName(row.jt.name)) ?? [];
    return {
      ...base,
      status: cards.length ? 'choose' : 'none',
      card: null,
      finish,
      ranked: cards.map((c) => ({ card: c, score: 0, reasons: [] })),
    };
  });
}

/**
 * Match the file's rows to printings (importMatch.js). Each result:
 *  - status 'auto' (via 'remembered', 'link' or 'match'), 'choose', 'none',
 *    or 'skip' for a row that can't be imported (its `problem`);
 *  - `card` and `finish` when matched; `ranked` the printings it could be;
 *  - `product`, the inventory's CC product with exactly this name and
 *    category, if there is one (a pick is remembered for it too).
 * @param {object[]} rows  readRows(...)
 * @param {(text: string) => void} [onStep]
 */
export async function matchImport(rows, onStep, format = 'cc') {
  if (format === 'tcgplayer') return matchSkus(rows, onStep);
  const ok = rows.filter((r) => !r.problem);
  onStep?.('Reading the inventory and remembered picks…');
  const keys = [...new Set(ok.map(importKey))];
  const [{ data: catList, error: catError }, { data: mapRows, error: mapError }, sets, { data: picked, error: pickError }] = await Promise.all([
    supabase.rpc('cc_categories'),
    supabase.from('cc_set_map').select('scryfall_set, promo_kind, category'),
    loadSets(),
    inChunks((part) => supabase.from('import_links').select('*').in('key', part), keys, KEY_CHUNK),
  ]);
  fail(catError, "Couldn't read the inventory's categories");
  fail(mapError, "Couldn't read the set choices");
  fail(pickError, "Couldn't read the remembered picks");
  // The inventory's categories, and the file's too: a file's category the
  // inventory lacks still finds its sets by the same rules.
  const inventory = new Map((catList ?? []).map((c) => [fold(c), c]));
  const categories = new Map([...inventory, ...ok.map((r) => [fold(r.category), r.category])]);
  const setMap = new Map((mapRows ?? []).map((m) => [`${m.scryfall_set}|${m.promo_kind}`, m.category]));
  const back = categorySets({ sets, categories, setMap });
  const remembered = new Map((picked ?? []).map((k) => [k.key, k]));

  // The inventory's own product for each row, where it has this exact name,
  // and the printing the export already links to it.
  const wants = ok.filter((r) => inventory.has(fold(r.category))).map((r) => ({
    key: String(r.index),
    category: inventory.get(fold(r.category)),
    base_keys: [r.parsed.baseKey],
  }));
  const product = new Map();
  if (wants.length) {
    onStep?.('Finding them in the inventory…');
    const { data: candRows, error: candError } = await supabase.rpc('cc_candidates', { p_wants: wants });
    fail(candError, "Couldn't read the inventory's products");
    const byRow = new Map(ok.map((r) => [String(r.index), r]));
    for (const c of candRows ?? []) {
      const r = byRow.get(c.key);
      const same = (a) => String(a ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (r && same(c.product_name) === same(r.productName)) product.set(r.index, c);
    }
  }
  const productIds = [...new Set([...product.values()].map((p) => p.product_id))];
  const { data: linkRows, error: linkError } = await inChunks(
    (part) => supabase.from('cc_product_links').select('scryfall_id, finish, product_id').in('product_id', part), productIds);
  fail(linkError, "Couldn't read the remembered matches");

  // Rows already answered: a pick remembered for this name, or the one
  // printing the export links to this product.
  const known = new Map();
  for (const r of ok) {
    const finish = finishOf(r.parsed);
    const pick = remembered.get(importKey(r));
    if (pick) {
      known.set(r.index, { id: pick.scryfall_id, finish: pick.finish, via: 'remembered' });
      continue;
    }
    const p = product.get(r.index);
    const ids = [...new Set((linkRows ?? []).filter((k) => p && k.product_id === p.product_id && k.finish === finish)
      .map((k) => k.scryfall_id))];
    if (ids.length === 1) known.set(r.index, { id: ids[0], finish, via: 'link' });
  }
  const knownCards = await scryfallCards([...known.values()].map((k) => k.id));

  // The rest: their names in the sets their category exports from. Small
  // categories share a query (Scryfall allows about two searches a second):
  // up to SET_CHUNK set codes and QUERY_MAX characters of names in each, and
  // every row keeps only the printings from its own category's sets.
  const looking = ok.filter((r) => !known.has(r.index) || !knownCards.has(known.get(r.index).id));
  const byCategory = new Map();
  for (const r of looking) {
    const key = fold(r.category);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(r);
  }
  const size = (terms) => terms.reduce((n, t) => n + t.length + 4, 0);
  const queries = [];   // { codes: Set, terms: Set }
  for (const [key, group] of byCategory) {
    const codes = back.get(key) ?? [];
    const names = [...new Set(group.flatMap((r) => namesFor(r.parsed)))];
    for (let i = 0; i < codes.length; i += SET_CHUNK) {
      const part = codes.slice(i, i + SET_CHUNK);
      for (const chunk of nameChunks(names)) {
        const fits = queries.find((q) => new Set([...q.codes, ...part]).size <= SET_CHUNK
          && size([...new Set([...q.terms, ...chunk])]) <= QUERY_MAX);
        if (fits) {
          part.forEach((c) => fits.codes.add(c));
          chunk.forEach((t) => fits.terms.add(t));
        } else {
          queries.push({ codes: new Set(part), terms: new Set(chunk) });
        }
      }
    }
  }
  const pool = [];
  for (const [i, q] of queries.entries()) {
    onStep?.(`Looking up printings: ${i + 1} of ${queries.length}…`);
    const setTerms = [...q.codes].map((c) => `set:${c}`).join(' or ');
    pool.push(...await printings(`(${setTerms}) (${[...q.terms].join(' or ')}) game:paper`));
  }
  const inItsSets = (row) => {
    const codes = new Set(back.get(fold(row.category)) ?? []);
    return cardsForRow(row, pool).filter((c) => codes.has(c.set));
  };

  // Anything not found in its category's sets (or whose category exports
  // from no set the app knows) is looked up in every set: staff will see
  // which.
  const missing = looking.filter((r) => !inItsSets(r).length);
  const everywhere = [];
  if (missing.length) {
    const names = [...new Set(missing.flatMap((r) => namesFor(r.parsed)))];
    const chunks = nameChunks(names);
    for (const [i, chunk] of chunks.entries()) {
      onStep?.(`Looking further for ${missing.length} card${missing.length === 1 ? '' : 's'}: ${i + 1} of ${chunks.length}…`);
      everywhere.push(...await printings(`(${chunk.join(' or ')}) game:paper`, { maxPages: FALLBACK_PAGES }));
    }
  }

  return rows.map((row) => {
    if (row.problem) return { row, status: 'skip', card: null, finish: null, ranked: [] };
    const base = { row, product: product.get(row.index) ?? null };
    const k = known.get(row.index);
    const kc = k ? knownCards.get(k.id) : null;
    const inCategory = inItsSets(row);
    const cards = inCategory.length ? inCategory : cardsForRow(row, everywhere);
    const pick = choosePrinting(row, cards);
    if (kc) {
      const ranked = pick.ranked.length ? pick.ranked : [{ card: kc, score: 0, reasons: [] }];
      return { ...base, ...pick, ranked, status: 'auto', card: kc, finish: k.finish, via: k.via, elsewhere: false };
    }
    // Found only outside its category's sets: a guess, so staff decide (owner's
    // CardBot file: Outlaws' Merriment under Breaking News had matched Eldraine's).
    const elsewhere = !inCategory.length;
    const status = elsewhere && pick.status === 'auto' ? 'choose' : pick.status;
    return { ...base, ...pick, status, card: status === 'auto' ? pick.card : null, via: status === 'auto' ? 'match' : null, elsewhere };
  });
}

/**
 * The buy lines for the matched rows: one per printing, finish, condition and
 * price (rows that are the same card add up), in the file's order.
 * @param {{ row: object, card: object, finish: string }[]} chosen
 * @param {Map<string, object>} sets  Scryfall sets (loadSets), for the printed size
 * @param {string} fileName
 */
export function importLines(chosen, sets, fileName) {
  const out = new Map();
  for (const { row, card, finish } of chosen) {
    const key = [card.id, finish, row.condition, row.price.toFixed(2)].join('|');
    const had = out.get(key);
    if (had) {
      had.quantity += row.qty;
      continue;
    }
    out.set(key, {
      game: 'mtg',
      // A Japanese-only printing is a Japanese card: "[JP]" on the line, as on the Buy tab (decision 269).
      lang: card.lang === 'ja' ? 'ja' : 'en',
      name: card.name,
      name_key: nameKey(card.name),
      set_code: card.set.toUpperCase(),
      set_name: card.set_name ?? null,
      source_set_id: card.set,
      collector_number: card.collector_number,
      printed_size: sets?.get(card.set)?.printed_size ?? null,
      rarity: card.rarity ?? null,
      finish,
      first_edition: false,
      treatments: magicTreatments(card, finish),
      condition: row.condition,
      quantity: row.qty,
      unit_price: row.price,
      market_price: row.price,
      price_source: 'import',
      // Where the card came from: the file and its row.
      price_snapshot: {
        imported: {
          file: fileName,
          product_name: row.productName,
          category: row.category,
          sell_price: row.price,
          ...(row.sku ? { tcgplayer_sku: row.sku } : {}),
          ...(row.priceFrom ? { price_from: row.priceFrom } : {}),
          ...(row.nearMint ? { near_mint: row.nearMint } : {}),
        },
      },
      priced_at: new Date().toISOString(),
      scryfall_id: card.id,
      oracle_id: card.oracle_id ?? card.card_faces?.[0]?.oracle_id ?? null,
      tcgplayer_id: String((finish === 'etched' && card.tcgplayer_etched_id) || card.tcgplayer_id || '') || null,
      image_url: cardImage(card, 'small') ?? null,
    });
  }
  return [...out.values()].map((line) => ({ ...line, text: lineText(line) }));
}

/**
 * Remember staff's picks (owner, 2026-10-09): by the file's product name and
 * category for the next import, and, where the inventory has that exact
 * product, as the export's match for the printing too.
 * @param {{ row: object, card: object, finish: string, product: object|null }[]} picks
 */
export async function rememberPicks(picks, userId) {
  if (!picks.length) return;
  const rows = [...new Map(picks.map((p) => [importKey(p.row), {
    key: importKey(p.row),
    category: p.row.category,
    product_name: p.row.productName,
    scryfall_id: p.card.id,
    finish: p.finish,
    linked_at: new Date().toISOString(),
    linked_by: userId ?? null,
  }])).values()];
  const { error } = await supabase.from('import_links').upsert(rows);
  fail(error, "Couldn't remember the picks");
  for (const p of picks) {
    if (p.product) await saveLink({ scryfall_id: p.card.id, finish: p.finish }, p.product, userId, 'staff');
  }
}

/**
 * Save the import: a new project, or into an empty collection (the server
 * refuses one with cards, `not_empty`).
 * @param {object} p
 * @param {{ kind: 'project' } | { kind: 'into', buyId: string, version: number }} p.target
 * @param {string} [p.name]  the new project's name
 * @returns {Promise<string>}  the collection's id
 */
export async function saveImport({ target, name, lines, fileName, userId, deviceId }) {
  if (target.kind === 'project') {
    const { data, error } = await supabase.rpc('project_import', {
      p_name: name, p_notes: '', p_lines: lines, p_user: userId, p_device: deviceId, p_file: fileName,
    });
    if (error) throw error;
    return data;
  }
  const { error } = await supabase.rpc('collection_import', {
    p_buy_id: target.buyId,
    p_lines: lines,
    p_user: userId,
    p_device: deviceId,
    p_expected_version: target.version ?? null,
    p_file: fileName,
  });
  if (error) throw error;
  return target.buyId;
}

/** Printings by name, for staff's own search in the review. */
export async function findPrintings(text) {
  const name = String(text ?? '').trim();
  if (name.length < 2) return [];
  return printings(`${name.split(/\s+/).map((w) => `"${w.replace(/"/g, '')}"`).join(' ')} game:paper`, { maxPages: 1 });
}
