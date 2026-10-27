// The dev server on dev's database (decision 382): localhost with `.env.development` pointing at the test copy.
// What the DEV watermark tests (main.jsx), and what the dev-only pages test (the Crystal Commerce matching audit,
// decision 547). Written with `import.meta.env.DEV` itself: a build replaces it with false and drops the rest of
// the line, dev's project ref with it, so the live site's bundle never carries either.

/** Is this the dev server on dev's database? Never true on the live site. */
export function onDevDatabase() {
  return Boolean(import.meta.env.DEV && import.meta.env.VITE_SUPABASE_URL?.startsWith('https://psucrzljraxeootwnltf.'));
}
