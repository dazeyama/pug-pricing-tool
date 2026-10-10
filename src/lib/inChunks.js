// PostgREST sends `.in(column, values)` in the request's URL, so a few hundred
// values make the URL too long and the server answers 400 Bad Request (an
// 837-row Import Collection's remembered picks, owner 2026-10-09). Reads with
// many values go in chunks instead.

/**
 * Run a read for `values` in chunks: `build(part)` makes the query for one
 * chunk (its `.in(column, part)`); the rows come back together, or the first
 * error. The same shape as a Supabase result, `{ data, error }`; no values,
 * no request.
 * @param {(part: any[]) => PromiseLike<{ data: any[]|null, error: any }>} build
 * @param {any[]} values
 * @param {number} [size]  values per request
 * @returns {Promise<{ data: any[]|null, error: any }>}
 */
export async function inChunks(build, values, size = 100) {
  const data = [];
  for (let i = 0; i < values.length; i += size) {
    const { data: part, error } = await build(values.slice(i, i + size));
    if (error) return { data: null, error };
    data.push(...(part ?? []));
  }
  return { data, error: null };
}
