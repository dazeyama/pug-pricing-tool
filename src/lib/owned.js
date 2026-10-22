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

async function lookUp(candidate, finish) {
  const line = { id: `owned:${candidate.key}`, ...magicPrinting(candidate, finish) };
  const ctx = await readContext();
  // The printing's product when the export would take one without asking; else none (its copies in the
  // inventory then can't be told apart, and the counter says so).
  let productId = null;
  if (ctx) {
    const { results } = await matchLines([line], null, {
      context: ctx, cards: new Map([[line.scryfall_id, candidate.scryfall]]),
    });
    productId = results[0]?.status === 'auto' ? results[0].product?.product_id ?? null : null;
  }
  const { data, error } = await supabase.rpc('owned_copies', {
    p_product_id: productId,
    p_base_keys: baseKeysFor(line, candidate.scryfall?.flavor_name ?? null),
    p_name_key: line.name_key,
    p_scryfall_id: line.scryfall_id,
    p_finish: finish,
  });
  if (error) throw new Error(`Couldn't count the copies we own: ${error.message}`);
  return data;
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
