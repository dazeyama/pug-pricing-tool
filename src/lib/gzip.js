// Gzip in the browser (CompressionStream), for the Master Crystal Inventory:
// the real Crystal Commerce export is 40 MB and more (owner, 2026-09-30), and
// a CSV packs down to a fraction of that, well under Supabase's 50 MB file
// limit on the Free plan. No dependencies, so the tests run under Node.

/* global CompressionStream, DecompressionStream */

/** @param {Blob} blob @returns {Promise<Blob>} */
export async function gzip(blob) {
  return new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

/** @param {Blob} blob @returns {Promise<Blob>} */
export async function gunzip(blob) {
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
}

/** Stored compressed: the path ends in .gz (older uploads were stored as plain .csv). */
export const isGzipPath = (path) => /\.gz$/i.test(String(path ?? ''));
