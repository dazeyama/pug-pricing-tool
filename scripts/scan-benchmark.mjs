// The phone scanner's recognition benchmark (docs/SCAN_FUNCTION.md 11.3):
// runs the same reading the phone does (src/scan/recognition/, mtgscan's
// modules, and Tesseract with the same English model) on photos of real
// cards, and says how many it reads right, and how surely.
//
//   node scripts/scan-benchmark.mjs [folder]          default: scan-fixtures/
//   node scripts/scan-benchmark.mjs [folder] --titles  tiers 2 and 3: the card's name from its title (S4)
//
// Collector-line photos (tier 1) are named with their truth: the set code and
// the number somewhere in the name, e.g. "FDN-125-nonfoil.jpg" or mtgscan's
// "C 0064 BLB DE.JPG". Title photos (--titles) are named "<anything>__<card
// name>.jpg", e.g. "TMP-x__Ancestral Memories.jpg", with the card filling the
// picture as the phone's guide asks. The photos stay out of the repo
// (.gitignore: scan-fixtures/). Reads Scryfall's set list (and, for titles,
// its card names); writes nothing.

import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import Tesseract from 'tesseract.js';
import { locateCollectorTextBlocks } from '../src/scan/recognition/textLocator.js';
import { generateDetectionVariants, MAX_CANDIDATES } from '../src/scan/recognition/pipeline.js';
import { cleanOCRText, parseCollectorNumber, scoreCollectorNumberResult } from '../src/scan/recognition/parsing.js';

const args = process.argv.slice(2);
const titles = args.includes('--titles');
const folder = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'scan-fixtures');
const HIGH = 80;
const MEDIUM = 40;
const make = (w, h) => createCanvas(w, h);
// Scryfall asks every script to say who it is.
const SCRYFALL_HEADERS = { Accept: 'application/json', 'User-Agent': 'PUGPricingTool-ScanBenchmark/1.0' };

if (!fs.existsSync(folder)) {
  console.error(`No folder ${folder}. Put the photos there (docs/SCAN_FUNCTION.md 11.3).`);
  process.exit(1);
}
const files = fs.readdirSync(folder).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
if (!files.length) {
  console.error(`No photos in ${folder}.`);
  process.exit(1);
}

const sets = await (await fetch('https://api.scryfall.com/sets', { headers: SCRYFALL_HEADERS })).json();
const codes = sets.data.filter((s) => !s.digital).map((s) => s.code.toUpperCase())
  .filter((c) => /^[A-Z0-9]+$/.test(c)).sort((a, b) => b.length - a.length || a.localeCompare(b));
const pattern = new RegExp(`(?<collection>${codes.join('|')})`);
const known = new Set(codes);

const worker = await Tesseract.createWorker('eng', 1, {
  langPath: path.resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
  cacheMethod: 'none',
});

/** The truth in a collector-line photo's name: { set, number }. */
function truthOf(name) {
  const tokens = path.parse(name).name.split(/[\s_\-.]+/).filter(Boolean);
  const number = tokens.find((t) => /^\d+[a-z★]?$/i.test(t))?.replace(/^0+(?=\d)/, '').toLowerCase() ?? null;
  const set = tokens.map((t) => t.toUpperCase()).find((t) => known.has(t) && !/^\d+$/.test(t)) ?? null;
  return { set, number };
}

async function readLine(canvas) {
  const blocks = locateCollectorTextBlocks(canvas, { maxCandidates: MAX_CANDIDATES }, make);
  const attempts = [];
  for (const variant of generateDetectionVariants(canvas, make, blocks)) {
    const { data } = await worker.recognize(variant.canvas.toBuffer('image/png'));
    const raw = data.text ?? '';
    const cleaned = cleanOCRText(raw);
    const rs = scoreCollectorNumberResult(raw, pattern);
    const cs = scoreCollectorNumberResult(cleaned, pattern);
    attempts.push({ text: rs > cs ? raw : cleaned, score: Math.max(rs, cs) });
    if (Math.max(rs, cs) >= HIGH) break;
  }
  return { blocks: blocks.length, attempts: attempts.sort((a, b) => b.score - a.score) };
}

let right = 0;
let sure = 0;
let fair = 0;
let total = 0;
let ms = 0;

if (!titles) {
  console.log(`Collector lines: ${files.length} photos in ${folder}\n`);
  for (const file of files) {
    const truth = truthOf(file);
    const image = await loadImage(fs.readFileSync(path.join(folder, file)));
    const canvas = createCanvas(image.width, image.height);
    canvas.getContext('2d').drawImage(image, 0, 0);
    const t0 = performance.now();
    const { blocks, attempts } = await readLine(canvas);
    const took = performance.now() - t0;
    ms += took;
    total += 1;
    // As the phone does: the best three readings, parsed, first one that parses.
    let got = null;
    let score = 0;
    for (const a of attempts.slice(0, 3)) {
      const p = parseCollectorNumber(a.text, pattern);
      if (p) {
        got = p;
        score = a.score;
        break;
      }
    }
    const ok = got && truth.set && got.setCode === truth.set && String(got.collectorNumber).toLowerCase() === truth.number;
    if (ok) right += 1;
    if (ok && score >= HIGH) sure += 1;
    if (ok && score >= MEDIUM) fair += 1;
    const read = got ? `${got.setCode} ${got.collectorNumber}${got.language ? ` ${got.language}` : ''}` : '(nothing)';
    console.log(`${ok ? '✓' : '✗'} ${file.padEnd(34)} want ${truth.set ?? '?'} ${truth.number ?? '?'}  read ${read.padEnd(16)} score ${String(score).padStart(3)}  ${blocks} blocks  ${Math.round(took)} ms`);
  }
  console.log(`\nRead right: ${right}/${total}; sure (score ≥ ${HIGH}, auto scan): ${sure}/${total} = ${Math.round((sure / total) * 100)}%;`
    + ` fair (≥ ${MEDIUM}, Scan card): ${fair}/${total}; ${Math.round(ms / total)} ms a photo here.`);
} else {
  const { findTitle, parseOldNumber, readBottom } = await import('../src/scan/titles.js');
  const { matchName } = await import('../src/scan/nameMatch.js');
  const names = (await (await fetch('https://api.scryfall.com/catalog/card-names', { headers: SCRYFALL_HEADERS })).json()).data;
  console.log(`Titles: ${files.length} photos in ${folder}\n`);
  let numbered = 0;
  let numberRight = 0;
  const read = (canvas) => worker.recognize(canvas.toBuffer('image/png')).then(({ data }) => data.text ?? '');
  for (const file of files) {
    const [head, tail] = path.parse(file).name.split('__');
    const want = tail?.trim() ?? null;
    // "SET-NUM__Name": NUM is the "123/350" number a 1998–2014 card has, "x" for none.
    const num = head?.split('-')[1] ?? '';
    const wantNumber = /^\d+$/.test(num) ? num.replace(/^0+(?=\d)/, '') : null;
    const image = await loadImage(fs.readFileSync(path.join(folder, file)));
    const canvas = createCanvas(image.width, image.height);
    canvas.getContext('2d').drawImage(image, 0, 0);
    const t0 = performance.now();
    // As the phone does (src/scan/older.js, decision 308): the title where it's found, each likely
    // place as one line till one names a card, then the best as a block.
    const reads = {
      line: async (c) => { await worker.setParameters({ tessedit_pageseg_mode: '7' }); return read(c); },
      block: async (c) => { await worker.setParameters({ tessedit_pageseg_mode: '6' }); return read(c); },
    };
    const text = await findTitle(canvas, reads, make, (t) => matchName(t, names), { wholeFrame: true });
    const match = matchName(text, names);
    // As the phone does: the "123/350" in what the collector-line reading read, else the bottom band.
    const { attempts } = await readLine(canvas);
    let bottom = attempts.map((a) => a.text).find((t) => parseOldNumber(t)) ?? null;
    if (!bottom) {
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
      bottom = await readBottom(canvas, read, make, { wholeFrame: true });
    }
    const old = parseOldNumber(bottom);
    const took = performance.now() - t0;
    ms += took;
    total += 1;
    const ok = Boolean(want) && match?.name?.toLowerCase() === want.toLowerCase();
    if (ok) right += 1;
    let numberNote = '';
    if (wantNumber) {
      numbered += 1;
      const numberOk = old?.number === wantNumber;
      if (numberOk) numberRight += 1;
      numberNote = `  number ${numberOk ? '✓' : '✗'} ${old ? `${old.number}/${old.size}` : `(read "${bottom.trim().slice(0, 50)}")`}`;
    }
    console.log(`${ok ? '✓' : '✗'} ${file.padEnd(40)} read "${text.trim()}" → ${match?.name ?? '(no name)'}${numberNote}  ${Math.round(took)} ms`);
  }
  console.log(`\nNamed right: ${right}/${total} = ${Math.round((right / total) * 100)}%;`
    + ` numbers read right: ${numberRight}/${numbered}; ${Math.round(ms / total)} ms a photo here.`);
}

await worker.terminate();
