// Local-only report on a Crystal Commerce inventory CSV (export spec, Phases
// E1–E2). It reads the paths given and prints; it writes nothing. The
// inventory is store data: never copy it into the repo.
//
// How its Product Names break down with src/lib/ccNames.js, to check against
// the spec's Appendix A:
//   node scripts/cc-report.mjs "D:\path\to\inventory.csv"
//
// How some printings would match (src/lib/ccMatch.js), given a JSON array of
// buy_lines-like objects (name, set_code, set_name, source_set_id,
// collector_number, finish, treatments, scryfall_id). It fetches Scryfall's
// set list and the cards' flavor names:
//   node scripts/cc-report.mjs "D:\path\to\inventory.csv" printings.json

import fs from 'node:fs';
import Papa from 'papaparse';
import { parseProductName, productRow } from '../src/lib/ccNames.js';
import { categoryFor, chooseProduct, fold, promoKind } from '../src/lib/ccMatch.js';

const path = process.argv[2];
const printingsPath = process.argv[3];
if (!path) {
  console.error('Usage: node scripts/cc-report.mjs <inventory.csv> [printings.json]');
  process.exit(1);
}
if (printingsPath) {
  await matchReport(path, printingsPath);
  process.exit(0);
}

async function matchReport(inventoryPath, jsonPath) {
  const lines = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const products = [];
  await new Promise((resolve, reject) => Papa.parse(fs.createReadStream(inventoryPath), {
    header: true,
    skipEmptyLines: 'greedy',
    step: ({ data }) => {
      const row = productRow(data);
      if (row) products.push(row);
    },
    complete: resolve,
    error: reject,
  }));
  const categories = new Map(products.map((p) => [fold(p.category), p.category]));
  const headers = { 'User-Agent': 'PUGPricingTool/cc-report', Accept: 'application/json' };
  const sets = new Map((await (await fetch('https://api.scryfall.com/sets', { headers })).json()).data.map((s) => [s.code, s]));
  const ids = [...new Set(lines.map((l) => l.scryfall_id).filter(Boolean))];
  const cards = new Map();
  for (let i = 0; i < ids.length; i += 75) {
    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: ids.slice(i, i + 75).map((id) => ({ id })) }),
    });
    for (const c of (await res.json()).data ?? []) cards.set(c.id, c);
  }
  const tally = { auto: 0, choose: 0, none: 0, noCategory: 0 };
  for (const line of lines) {
    const set = sets.get(String(line.source_set_id ?? line.set_code).toLowerCase()) ?? { code: line.set_code, name: line.set_name };
    const parent = set.parent_set_code ? sets.get(set.parent_set_code) : null;
    const where = categoryFor({ set, parent, promo: promoKind(line.treatments), categories, setMap: new Map() });
    const card = cards.get(line.scryfall_id);
    const label = `${line.name} (${line.set_code}) ${line.collector_number} ${line.finish} [${(line.treatments ?? []).join(', ')}]`;
    if (!where) {
      tally.noCategory += 1;
      console.log(`? ${label}\n    no category for "${set.name}"`);
      continue;
    }
    const cands = products.filter((p) => p.category === where.category);
    const r = chooseProduct(line, cands, { flavor: card?.flavor_name ?? null });
    tally[r.status] += 1;
    const mark = { auto: '+', choose: '~', none: 'x' }[r.status];
    console.log(`${mark} ${label}\n    ${where.category} (${where.how}) -> ${r.product?.product_name ?? r.status}`
      + (r.status === 'choose'
        ? `\n      candidates: ${r.ranked.slice(0, 5).map((x) => `${x.product.product_name} [${x.score ?? 'fails'}]`).join('; ')}`
        : ''));
  }
  console.log(`\nMatched ${tally.auto} · to choose ${tally.choose} · no product ${tally.none} · no category ${tally.noCategory} (of ${lines.length})`);
}

const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

const stats = {
  rows: 0, categories: new Map(), suffixes: new Map(), shapes: new Map(), sequences: new Map(),
  foilKinds: new Map(), brackets: 0, numbers: 0, pairs: new Map(),
};

Papa.parse(fs.createReadStream(path), {
  header: true,
  skipEmptyLines: 'greedy',
  step: ({ data: row }) => {
    const name = row['Product Name'];
    if (!name) return;
    stats.rows += 1;
    count(stats.categories, row.Category);
    count(stats.pairs, `${name}\u0000${row.Category}`);
    const p = parseProductName(name);
    const suffixCount = (p.foilKind ? 1 : 0) + p.variants.length;
    count(stats.suffixes, suffixCount);
    // FOIL / V in the order they appear in the name.
    const parts = name.replace(/\s+/g, ' ').trim().split(' - ').slice(1);
    count(stats.shapes, parts.map((x) => (/(^|\s)Foil( Etched)?$/i.test(x) ? 'FOIL' : 'V')).join(' - ') || '(none)');
    count(stats.sequences, parts.join(' - ') || '(none)');
    if (p.foilKind) count(stats.foilKinds, p.foilKind);
    if (p.bracket != null) {
      stats.brackets += 1;
      if (/^\d+[a-z★]*$/i.test(p.bracket)) stats.numbers += 1;
    }
  },
  complete: () => {
    const dupes = [...stats.pairs.values()].filter((n) => n > 1).length;
    console.log(`Products: ${stats.rows.toLocaleString()}  Categories: ${stats.categories.size}`);
    console.log('Suffixes per name:', top(stats.suffixes, 10).map(([k, v]) => `${k}: ${v.toLocaleString()}`).join(' · '));
    console.log('Shapes:');
    for (const [k, v] of top(stats.shapes, 10)) console.log(`  ${k.padEnd(18)} ${v.toLocaleString()}`);
    console.log('Most common suffix sequences:');
    for (const [k, v] of top(stats.sequences, 25)) console.log(`  ${k.padEnd(40)} ${v.toLocaleString()}`);
    console.log('Foil kinds:', top(stats.foilKinds, 20).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(' · '));
    console.log(`Brackets: ${stats.brackets.toLocaleString()} (collector numbers ${stats.numbers.toLocaleString()})`);
    console.log(`Name + category pairs that appear more than once: ${dupes}`);
    console.log('Largest categories:', top(stats.categories, 8).map(([k, v]) => `${k} ${v}`).join(' · '));
  },
  error: (e) => {
    console.error(e.message);
    process.exit(1);
  },
});
