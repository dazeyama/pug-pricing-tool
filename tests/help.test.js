import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  buildHelp, cleanTitle, fold, inline, parseReadme, plainText, renderMarkdown, searchHelp, searchTerms, slugify, wordHits,
} from '../src/lib/help.js';
import { PAGES } from '../src/pages/help/pages.js';

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const SIZES = JSON.parse(readFileSync(new URL('../src/pages/help/images.json', import.meta.url), 'utf8'));

test('headings: emoji dropped from titles, GitHub anchors', () => {
  assert.equal(cleanTitle('📤 Exporting to Crystal Commerce'), 'Exporting to Crystal Commerce');
  assert.equal(cleanTitle('+ Price Collection'), '+ Price Collection');
  assert.equal(slugify('📤 Exporting to Crystal Commerce'), '-exporting-to-crystal-commerce');
  assert.equal(slugify('How prices are worked out'), 'how-prices-are-worked-out');
  assert.equal(slugify('Qty, CLEAR and ADD CARD'), 'qty-clear-and-add-card');
});

test('parseReadme: ### keys name their chapter; the title block is left out', () => {
  const blocks = parseReadme('<h1>x</h1>\n## Intro\ntext\n# 🛒 Buy tab\nmore\n### Review\nhi\n# Import\n### Review\n');
  assert.deepEqual(blocks.map((b) => b.key), ['Intro', 'Buy tab', 'Buy tab > Review', 'Import', 'Import > Review']);
  assert.deepEqual(blocks[0].lines, ['text']);
});

test('inline Markdown', () => {
  assert.equal(inline('**< BACK** returns'), '<strong>&lt; BACK</strong> returns');
  assert.equal(inline('says *"No match"* here'), 'says <em>"No match"</em> here');
  assert.equal(inline('`a<b` and <kbd>Esc</kbd>'), '<code>a&lt;b</code> and <kbd>Esc</kbd>');
  assert.equal(inline('see [Prices](#how-prices)'), 'see <a href="#how-prices">Prices</a>');
  assert.equal(inline('Cash & Credit'), 'Cash &amp; Credit');
});

test('renderMarkdown: paragraphs, lists, tables, HTML', () => {
  const html = renderMarkdown([
    'One line', 'and its next.', '',
    '- a', '  wrapped', '- b', '',
    '1. first', '2. second', '',
    '| | |', '|---|---|', '| **MTG \\| PKM** | Games |', '',
    '| Col | Two |', '|---|---|', '| x | y |', '',
    '<details>', '<br>', '---', '</details>', '',
    '```', '<Card> (<n>) - **not bold**', '```',
  ]);
  assert.match(html, /<p>One line and its next\.<\/p>/);
  assert.match(html, /<ul><li>a wrapped<\/li><li>b<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(html, /<table class="help-table keyed"><tbody><tr><td><strong>MTG \| PKM<\/strong><\/td><td>Games<\/td><\/tr>/);
  assert.match(html, /<thead><tr><th>Col<\/th><th>Two<\/th><\/tr><\/thead>/);
  assert.match(html, /<details open>\n<\/details>/);
  assert.match(html, /<pre><code>&lt;Card&gt; \(&lt;n&gt;\) - \*\*not bold\*\*<\/code><\/pre>/);
});

test('the README splits into the Help pages, in order', () => {
  const help = buildHelp(README, PAGES);
  assert.deepEqual(help.problems, []);
  assert.equal(new Set(PAGES.map((p) => p.id)).size, PAGES.length, 'page ids are unique');
  // Every chapter (# heading) starts a page of its own.
  const starts = new Set(PAGES.map((p) => p.start));
  for (const b of parseReadme(README).filter((x) => x.level === 1)) assert.ok(starts.has(b.key), `"${b.key}" starts a page`);
  for (const p of help.pages) assert.ok(p.html.length > 40, `${p.id} has text`);
});

test('every README link finds a Help page', () => {
  const help = buildHelp(README, PAGES);
  for (const [, slug] of README.matchAll(/\]\(#([^)]+)\)/g)) assert.ok(help.anchors.has(slug), `#${slug}`);
});

test("the README's own pictures exist, and point at the app's base in Help", () => {
  const srcs = [...README.matchAll(/src="(public\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.length > 0);
  for (const src of srcs) assert.ok(existsSync(new URL(`../${src}`, import.meta.url)), src);
  const html = buildHelp(README, PAGES, { base: '/pug-pricing-tool/' }).pages.map((p) => p.html).join('');
  assert.ok(html.includes('src="/pug-pricing-tool/help/from-claude-code.webp"'));
  assert.ok(!html.includes('src="public/'));
});

test('every Help picture exists, with its size', () => {
  for (const p of PAGES) {
    for (const img of p.images ?? []) {
      assert.ok(existsSync(new URL(`../public/help/${img.src}.webp`, import.meta.url)), `${img.src}.webp`);
      assert.ok(SIZES[img.src], `${img.src} in images.json`);
      assert.ok(img.caption, `${img.src} has a caption`);
    }
  }
});

test('search: words, accents and word starts', () => {
  assert.deepEqual(searchTerms('  Pokémon, EXPORT a  export '), ['pokemon', 'export']);
  assert.equal(fold('Poké Ball'), 'poke ball');
  assert.deepEqual(wordHits('export the report; exports', 'export'), [0, 19]);
  assert.equal(plainText('<p>Cash &amp; <strong>Credit</strong></p>'), 'Cash & Credit');
});

test('search: every word must be there; the title outranks the text', () => {
  const pages = [
    { id: 'a', title: 'Buy tab', chapter: 'Buy', headings: [], text: 'Stickers stickers stickers for the buy.' },
    { id: 'b', title: 'Print PKM Stickers?', chapter: 'Calendar', headings: [], text: 'One sticker per copy.' },
    { id: 'c', title: 'Settings', chapter: 'Settings', headings: ['Bulk values'], text: 'Nothing here.' },
  ];
  assert.deepEqual(searchHelp(pages, 'stickers').map((r) => r.page.id), ['b', 'a']);
  assert.deepEqual(searchHelp(pages, 'stickers buy').map((r) => r.page.id), ['a']);
  assert.deepEqual(searchHelp(pages, 'bulk').map((r) => r.page.id), ['c']);
  assert.deepEqual(searchHelp(pages, 'x'), []);
  const [hit] = searchHelp(pages, 'copy');
  assert.equal(hit.snippet.match, 'copy');
  assert.equal(hit.count, 1);
});

test('search: the real Help finds Undo export, on the page that has it first', () => {
  const help = buildHelp(README, PAGES);
  const results = searchHelp(help.pages, 'undo export');
  assert.ok(results.length > 0);
  assert.ok(/undo export/i.test(results[0].page.text));
  assert.deepEqual(searchHelp(help.pages, 'pokemon').length, searchHelp(help.pages, 'Pokémon').length);
});
