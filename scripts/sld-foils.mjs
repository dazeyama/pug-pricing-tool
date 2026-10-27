// Builds the Secret Lair foils table in src/lib/sldFoilProducts.js (decision 510): TCGplayer's plain Secret
// Lair product → its "(… Foil)" product, read from tcgcsv.com (TCGplayer's catalogue, no key: one request for
// the groups, then one per Secret Lair group), then checked against Scryfall's SLD cards in both finishes with
// no foil price, with a report of what's covered. Re-run after a new drop:
//   node scripts/sld-foils.mjs
// It rewrites only the "Generated …" paragraph and SLD_FOIL_PRODUCTS in sldFoilProducts.js, and stops when it
// can't find exactly that; the module's own words and functions around them stay. Nothing touches the app's
// data or a database. Moved into the repo from C:\ClaudeProjects\temp\sld-foils (rainbow.mjs and write-sld.mjs,
// as one script; decision 544).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatInTimeZone } from 'date-fns-tz';
import { STORE_TZ } from '../src/lib/time.js';

const MODULE = 'src/lib/sldFoilProducts.js';
const CATALOGUE = 'https://tcgcsv.com/tcgplayer/1';   // TCGplayer's catalogue; category 1 is Magic
const SCRYFALL = `https://api.scryfall.com/cards/search?q=${encodeURIComponent('set:sld is:nonfoil is:foil')}&unique=prints`;
const HEADERS = { 'User-Agent': 'PUG Pricing Tool (scripts/sld-foils.mjs)', Accept: 'application/json' };
const FOIL_TAG = /^(.*) \(([^()]*Foil)\)$/;   // "Fabricate (2090) (Rainbow Foil)" → "Fabricate (2090)", "Rainbow Foil"
const COMMENT_WIDTH = 115;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function getJson(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}
const numberOf = (product) => product.extendedData?.find((e) => e.name === 'Number')?.value ?? null;

/**
 * One Secret Lair group's pairs: each "(… Foil)" product's plain sibling (the same name and number) → it, both as
 * strings of TCGplayer product ids. Foil Etched is left out (an etched printing has its own product already); so
 * is a plain product with two foil siblings (`twice`: nothing to choose between), and a foil with no plain
 * sibling is listed (`unpaired`). `kinds` counts the pairs by their foil's kind. Pure.
 */
export function pairFoils(products) {
  const byName = new Map(products.map((p) => [`${p.name}|${numberOf(p)}`, p]));
  const siblings = {};
  const unpaired = [];
  for (const p of products) {
    const tag = FOIL_TAG.exec(p.name);
    if (!tag || tag[2] === 'Foil Etched') continue;
    const plain = byName.get(`${tag[1]}|${numberOf(p)}`);
    if (!plain) {
      unpaired.push(`${p.productId} ${p.name} #${numberOf(p)}`);
      continue;
    }
    (siblings[String(plain.productId)] ??= []).push({ id: String(p.productId), kind: tag[2] });
  }
  const pairs = {};
  const kinds = {};
  const twice = [];
  for (const [plain, list] of Object.entries(siblings)) {
    if (list.length > 1) {
      twice.push(`${plain}: ${list.map((s) => `${s.id} ${s.kind}`).join(', ')}`);
      continue;
    }
    pairs[plain] = list[0].id;
    kinds[list[0].kind] = (kinds[list[0].kind] ?? 0) + 1;
  }
  return { pairs, kinds, twice, unpaired };
}

/** A sentence as "// " comment lines of at most `width` characters. Pure. */
export function wrapComment(text, width = COMMENT_WIDTH) {
  const lines = [];
  let line = '//';
  for (const word of text.split(' ')) {
    if (line !== '//' && line.length + 1 + word.length > width) {
      lines.push(line);
      line = '//';
    }
    line += ` ${word}`;
  }
  lines.push(line);
  return lines;
}

/**
 * The generated part of sldFoilProducts.js: the "Generated …" paragraph (the date, the pairs by kind, and how many
 * of Scryfall's SLD cards in both finishes with no foil price they cover) and the table, by product id. Pure.
 */
export function generatedSource(pairs, { date, kinds, covered, noFoil }) {
  const kindText = Object.entries(kinds).sort(([, a], [, b]) => b - a).map(([kind, n]) => `${n} ${kind}`).join(', ');
  const note = `Generated ${date} by scripts/sld-foils.mjs from TCGplayer's catalogue via tcgcsv.com: `
    + `${Object.keys(pairs).length} pairs (${kindText}), covering ${covered} of Scryfall's ${noFoil} SLD cards in both `
    + 'finishes with no foil price.';
  const rows = Object.entries(pairs).sort(([a], [b]) => Number(a) - Number(b))
    .map(([plain, foil]) => `  '${plain}': '${foil}',`);
  return [...wrapComment(note), 'export const SLD_FOIL_PRODUCTS = {', ...rows, '};', ''].join('\n');
}

// The generated part as it sits in the module: the paragraph's lines, then the table, nothing between.
const GENERATED = /^\/\/ Generated \d{4}-\d{2}-\d{2} .*\n(?:\/\/ .*\n)*export const SLD_FOIL_PRODUCTS = \{\n(?: {2}'\d+': '\d+',\n)*\};\n/m;

/** The module's source with its generated part replaced; throws unless there's exactly one. Pure. */
export function patchModule(source, generated) {
  const found = source.match(new RegExp(GENERATED.source, 'gm')) ?? [];
  if (found.length !== 1) {
    throw new Error(`${MODULE}: expected one generated part (a "// Generated …" paragraph, then SLD_FOIL_PRODUCTS), found ${found.length}`);
  }
  return source.replace(GENERATED, () => generated);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  // TCGplayer's Secret Lair groups, one request each.
  const groups = (await getJson(`${CATALOGUE}/groups`)).results.filter((g) => /secret lair/i.test(g.name));
  const pairs = {};
  const kinds = {};
  const twice = [];
  const unpaired = [];
  for (const g of groups) {
    const products = (await getJson(`${CATALOGUE}/${g.groupId}/products`)).results;
    const found = pairFoils(products);
    Object.assign(pairs, found.pairs);
    for (const [kind, n] of Object.entries(found.kinds)) kinds[kind] = (kinds[kind] ?? 0) + n;
    twice.push(...found.twice.map((t) => `${g.abbreviation} ${t}`));
    unpaired.push(...found.unpaired.map((u) => `${g.abbreviation} ${u}`));
    console.log(`${g.groupId} ${g.name}: ${products.length} products, ${Object.keys(found.pairs).length} pairs`);
    await sleep(300);
  }
  console.log('kinds', JSON.stringify(kinds));
  console.log(`two foil siblings (skipped): ${twice.length}`, twice.slice(0, 10).join(' | '));
  console.log(`pairs ${Object.keys(pairs).length}; foil products with no plain sibling: ${unpaired.length}`);
  console.log(unpaired.slice(0, 15).join('\n'));

  // Scryfall: the SLD cards in both finishes, and which of those with no foil price the pairs cover.
  const cards = [];
  let url = SCRYFALL;
  while (url) {
    const page = await getJson(url);
    cards.push(...page.data);
    url = page.has_more ? page.next_page : null;
    await sleep(150);
  }
  const noFoil = cards.filter((c) => c.prices?.usd_foil == null);
  const covered = noFoil.filter((c) => pairs[String(c.tcgplayer_id)]);
  const pricedAnyway = cards.filter((c) => c.prices?.usd_foil != null && pairs[String(c.tcgplayer_id)]);
  console.log(`Scryfall SLD in both finishes: ${cards.length}; no foil price: ${noFoil.length}; of those with a foil product: ${covered.length}`);
  console.log(`with a foil price and a foil product: ${pricedAnyway.length}`);
  console.log('not covered, sample:', noFoil.filter((c) => !pairs[String(c.tcgplayer_id)]).slice(0, 12)
    .map((c) => `${c.name} ${c.collector_number} tcg ${c.tcgplayer_id} ${c.promo_types ?? ''}`).join(' | '));
  console.log('covered, sample:', covered.slice(0, 5)
    .map((c) => `${c.name} ${c.collector_number} ${c.tcgplayer_id}→${pairs[String(c.tcgplayer_id)]}`).join(' | '));

  // The table into the module, its line endings kept.
  const date = formatInTimeZone(new Date(), STORE_TZ, 'yyyy-MM-dd');
  const file = path.join(root, MODULE);
  const source = fs.readFileSync(file, 'utf8');
  const crlf = source.includes('\r\n');
  const generated = generatedSource(pairs, { date, kinds, covered: covered.length, noFoil: noFoil.length });
  const patched = patchModule(source.replace(/\r\n/g, '\n'), generated);
  fs.writeFileSync(file, crlf ? patched.replace(/\n/g, '\r\n') : patched);
  console.log(`Wrote ${MODULE}: ${Object.keys(pairs).length} pairs, generated ${date}`);
}
