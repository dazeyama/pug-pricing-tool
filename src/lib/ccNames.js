// Crystal Commerce product names (export spec 7.2): the parts of a name like
// "Fabricate (2090) - Rainbow Foil" or "Brazen Borrower // Petty Theft - Foil
// - Showcase". CC's order, measured on the store's 152,115 products:
//
//   <Base name>[ (<bracket>)][ - <Foil kind>][ - <Variant 1>][ - <Variant 2>]…
//
// The foil kind is normally the first suffix; in a few hundred names (mostly
// Secret Lair and Unfinity) a variant comes first, and it's still found.
// Pure functions, so the tests and scripts/cc-report.mjs run under Node.

import { nameKey } from './normalize.js';

/**
 * A suffix that names the finish: "Foil", "Foil Etched", "Surge Foil",
 * "Rainbow Foil", "Step-and-Compleat Foil", "Silver Foil Etched"…
 */
export function isFoilKind(part) {
  return /(^|\s)Foil( Etched)?$/i.test(String(part ?? '').trim());
}

/** Is this foil kind an etched one? */
export const isEtchedKind = (kind) => /Etched$/i.test(String(kind ?? ''));

/**
 * The parts of a CC Product Name. The name itself is never changed: callers
 * keep the original for the file, this is for matching.
 * @param {string} name
 * @returns {{ base: string, baseKey: string, bracket: string|null, foilKind: string|null, variants: string[] }}
 */
export function parseProductName(name) {
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim();
  const [first, ...suffixes] = clean.split(' - ');
  let base = first ?? '';
  let bracket = null;
  const m = /^(.*\S) \(([^()]*)\)$/.exec(base);
  if (m) {
    base = m[1];
    bracket = m[2];
  }
  let foilKind = null;
  const variants = [];
  for (const raw of suffixes) {
    const part = raw.trim();
    if (!part) continue;
    if (!foilKind && isFoilKind(part)) {
      foilKind = part;
    } else if (!foilKind && /^Foil /i.test(part)) {
      // "Foil Prerelease Promo", "Foil DCI Judge Promo": foil and a variant in one.
      foilKind = 'Foil';
      variants.push(part.slice(5).replace(/^\((.*)\)$/, '$1').trim());
    } else {
      variants.push(part);
    }
  }
  return { base, baseKey: nameKey(base), bracket, foilKind, variants };
}

/**
 * The catalog path from a CC product URL, without the host or Product ID:
 * "http://x.crystalcommerce.com/catalog/magic_the_gathering_singles-…/ashnods_cylix/1"
 * → "magic_the_gathering_singles-…/ashnods_cylix".
 */
export function catalogPath(url) {
  return String(url ?? '')
    .replace(/^https?:\/\/[^/]+\/catalog\//i, '')
    .replace(/\/\d+\/?$/, '');
}

/**
 * One inventory CSV row (PapaParse, header: true) as a `cc_products` row, or
 * null when it has no Product ID or name.
 */
export function productRow(row) {
  const productId = String(row?.['Product ID'] ?? '').trim();
  const productName = row?.['Product Name'];
  if (!productId || !productName) return null;
  const p = parseProductName(productName);
  return {
    product_id: productId,
    cc_id: String(row['CC ID'] ?? '').trim() || null,
    product_name: productName,
    category: row.Category ?? '',
    base_key: p.baseKey,
    bracket: p.bracket,
    foil_kind: p.foilKind,
    variants: p.variants,
    catalog_path: catalogPath(row.URL),
  };
}
