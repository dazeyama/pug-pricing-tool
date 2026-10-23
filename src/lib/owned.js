// How many copies of a Magic printing and its card we likely own (decision 448): the printing's Crystal
// Commerce product found as the export finds it (ccExport.js matchLines), then `owned_copies` counts the
// inventory's Total Qty and the cards that are ours and not in it yet (migration 0008).
import { supabase } from './supabase.js';
import { magicPrinting } from './buyLine.js';
import { baseKeysFor, matchContext, matchLines } from './ccExport.js';

// The inventory's categories and the set choices change only with an upload or a choice at export: read
// once a few minutes, not for every card picked.
const CONTEXT_MS = 5 * 60 * 1000;
// A printing's counts, so going back to a card shows them at once. They change only as buys are confirmed,
// collections paid or exported, or the inventory uploaded.
const COUNTS_MS = 60 * 1000;

let context = null;   // { at, promise }
const counts = new Map();   // `${scryfall id}|${finish}` → { at, promise }

function readContext() {
  if (!context || Date.now() - context.at > CONTEXT_MS) {
    const promise = matchContext().catch((e) => {
      context = null;   // asked again next time
      if (e?.code === 'no_inventory') return null;
      throw e;
    });
    context = { at: Date.now(), promise };
  }
  return context.promise;
}

/** Start reading what matching needs, so the first card picked doesn't wait for it (decision 453). */
export function warmOwnedCopies() {
  readContext().catch(() => {});
}

async function lookUp(candidate, finish) {
  const line = { id: `owned:${candidate.key}`, ...magicPrinting(candidate, finish) };
  const baseKeys = baseKeysFor(line, candidate.scryfall?.flavor_name ?? null);
  const count = (productId) => supabase.rpc('owned_copies', {
    p_product_id: productId,
    p_base_keys: baseKeys,
    p_name_key: line.name_key,
    p_scryfall_id: line.scryfall_id,
    p_finish: finish,
  });
  // The count and the printing's product at once (decision 453: they were one after the other). The product,
  // when the export would take one without asking; a match that fails just leaves the printing's inventory
  // count unknown, as no clear product does.
  const matching = readContext().then(async (ctx) => {
    if (!ctx) return null;
    const { results } = await matchLines([line], null, {
      context: ctx, cards: new Map([[line.scryfall_id, candidate.scryfall]]),
    });
    return results[0]?.status === 'auto' ? results[0].product ?? null : null;
  }).catch((e) => {
    console.warn("Matching this printing to its Crystal Commerce product failed; its count there isn't known", e);
    return null;
  });
  const [{ data, error }, product] = await Promise.all([count(null), matching]);
  if (error) throw new Error(`Couldn't count the copies we own: ${error.message}`);
  if (!product) return data;

  // A product staff linked at export that's filed under another name isn't among the card's: ask again with
  // it, so it's counted for the card too (rare).
  if (!baseKeys.includes(product.base_key) || String(product.category).startsWith('Art Series')) {
    const again = await count(product.product_id);
    if (again.error) throw new Error(`Couldn't count the copies we own: ${again.error.message}`);
    return again.data;
  }
  // Else it's in the card's list when it has copies: the printing's count is its, 0 when it has none
  // (unknown, as the card's, when the inventory has no quantities).
  const listed = (data.cc_list ?? []).find((p) => p.product_id === product.product_id);
  return {
    ...data,
    cc_printing: data.cc_card == null ? null : Number(listed?.qty ?? 0),
    cc_list: (data.cc_list ?? []).map((p) => ({ ...p, this: p.product_id === product.product_id })),
  };
}

/**
 * `owned_copies`' answer for a Magic printing in a finish (ownedRates.js ownedCounts reads it).
 * @param {object} candidate  a Magic candidate (cardSearch.js), with its Scryfall card
 * @param {string} finish
 * @returns {Promise<object>}
 */
export function ownedCopies(candidate, finish) {
  const key = `${candidate.scryfall?.id}|${finish}`;
  const hit = counts.get(key);
  if (hit && Date.now() - hit.at < COUNTS_MS) return hit.promise;
  const promise = lookUp(candidate, finish).catch((e) => {
    counts.delete(key);
    throw e;
  });
  counts.set(key, { at: Date.now(), promise });
  return promise;
}
