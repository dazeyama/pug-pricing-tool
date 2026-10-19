// Is the live site serving this build? (The release skill's step 6.) Fetches the
// Pages site, then its entry chunk and every chunk those load, following references,
// and looks for each string given: the version, and a string from a new feature,
// which may sit in a code-split chunk (the printouts, the stickers, Pokémon names).
//
//   node scripts/live-check.mjs "0.9.9.14-name" "Convert to collection"
//
// Prints each string as found or MISSING, with how many chunks were read; exits 1
// if any is missing. Pages can lag a minute behind a finished deploy: try again
// before calling it missing.

const BASE = 'https://dazeyama.github.io/pug-pricing-tool';
const wanted = process.argv.slice(2);
if (!wanted.length) {
  console.error('Usage: node scripts/live-check.mjs "<string>" ["<string>" …]');
  process.exit(2);
}

const get = async (url) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
};

const page = await get(`${BASE}/?v=${Date.now()}`);
const entry = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(page)?.[1];
if (!entry) {
  console.error('No entry chunk (assets/index-*.js) in the live page.');
  process.exit(1);
}

const seen = new Set();
const texts = [];
let todo = [entry];
while (todo.length) {
  const next = [];
  for (const name of todo) {
    if (seen.has(name)) continue;
    seen.add(name);
    const body = await get(`${BASE}/assets/${name}`);
    texts.push(body);
    for (const m of body.matchAll(/[A-Za-z0-9_.]+-[A-Za-z0-9_-]{8}\.js/g)) next.push(m[0]);
  }
  todo = next;
}

const all = texts.join('\n');
let missing = 0;
for (const w of wanted) {
  const found = all.includes(w);
  if (!found) missing += 1;
  console.log(`${found ? 'found  ' : 'MISSING'}  ${w}`);
}
console.log(`(${seen.size} chunks read from ${BASE})`);
process.exit(missing ? 1 : 0);
