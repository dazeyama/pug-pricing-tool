// Local-only report on a Crystal Commerce inventory CSV (export spec, Phase E1):
// how its Product Names break down with src/lib/ccNames.js, to check against
// the spec's Appendix A. It reads the path given and prints counts; it writes
// nothing. The inventory is store data: never copy it into the repo.
//
//   node scripts/cc-report.mjs "D:\path\to\inventory.csv"

import fs from 'node:fs';
import Papa from 'papaparse';
import { parseProductName } from '../src/lib/ccNames.js';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/cc-report.mjs <inventory.csv>');
  process.exit(1);
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
