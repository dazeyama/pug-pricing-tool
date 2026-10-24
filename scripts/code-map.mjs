// The map a new session reads first (CLAUDE.md, Start of a session): the
// spec's sections and every decision's title, then every source file with the
// first sentence of its header comment and what it exports, the database's
// tables, functions and migrations, and the docs. Written to CODE_MAP.md at
// the repo root, which git ignores: it's rebuilt at the start of each new
// session from the files as they are, so it never goes stale, and sessions
// working side by side never conflict over it.
//
//   node scripts/code-map.mjs        writes CODE_MAP.md
//
// Reads files only; writes nothing else.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => {
  const text = fs.readFileSync(path.join(root, p), 'utf8');
  return (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n/g, '\n');
};
const exists = (p) => fs.existsSync(path.join(root, p));

/** Every file under a folder, as repo paths ("src/lib/rates.js"), node_modules left out. */
function walk(dir) {
  if (!exists(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') out.push(...walk(p));
    } else out.push(p);
  }
  return out.sort();
}

/** The first sentence, cut at a word at about 160 characters. */
function firstSentence(text) {
  const m = text.match(/^(.+?[.!?])(?=\s+[A-Z(`"*]|$)/);
  let s = (m ? m[1] : text).trim();
  if (s.length > 160) s = `${s.slice(0, 160).replace(/\s+\S*$/, '')}…`;
  return s;
}

const IMPORT_END = /from\s+['"][^'"]+['"];?$|^import\s+['"][^'"]+['"];?$/;

/**
 * What a file says about itself: the first paragraph of the comment that comes
 * before its first line of code (after the imports), as one sentence.
 */
export function headerOf(text) {
  const lines = text.split('\n');
  let i = 0;
  let importing = false;
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (importing) {
      if (IMPORT_END.test(l)) importing = false;
      continue;
    }
    if (!l || /^['"]use strict['"];?$/.test(l) || /^\/[/*]\s*(eslint|global)\b/.test(l)) continue;
    if (/^import\b/.test(l)) {
      if (!IMPORT_END.test(l)) importing = true;
      continue;
    }
    break;
  }
  const first = lines[i]?.trim() ?? '';
  const words = [];
  if (first.startsWith('//') || first.startsWith('--')) {
    const mark = first.slice(0, 2);
    for (; i < lines.length && lines[i].trim().startsWith(mark); i++) {
      const t = lines[i].trim().slice(2).trim();
      if (!t) {
        if (words.length) break; // a blank comment line ends the first paragraph
        continue;
      }
      words.push(t);
    }
  } else if (first.startsWith('/*')) {
    for (; i < lines.length; i++) {
      const raw = lines[i];
      const t = raw.trim().replace(/^\/\*+/, '').replace(/\*+\/$/, '').replace(/^\*\s?/, '').trim();
      if (!t && words.length) break;
      if (t && !t.startsWith('@')) words.push(t);
      if (raw.includes('*/')) break;
    }
  }
  return words.length ? firstSentence(words.join(' ')) : '';
}

/** The names a file exports, the default's included. */
export function exportsOf(text) {
  const names = [];
  for (const m of text.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|class\s+)([A-Za-z_$][\w$]*)/gm)) names.push(m[1]);
  for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.push(name);
    }
  }
  for (const m of text.matchAll(/^export default ([A-Za-z_$][\w$]*);/gm)) names.push(m[1]);
  return [...new Set(names)];
}

const DESCRIBED = /\.(js|jsx|mjs|ts|css|sql)$/;

/** One line per file in a folder: "- `rates.js`: what it says. Exports: a, b". */
function fileLines(files, dir) {
  return files.map((f) => {
    const name = f.slice(dir.length + 1);
    if (!DESCRIBED.test(f)) return `- \`${name}\``;
    const text = read(f);
    const about = headerOf(text);
    const names = /\.(js|jsx|mjs|ts)$/.test(f) ? exportsOf(text) : [];
    const shown = names.length > 12 ? `${names.slice(0, 12).join(', ')} +${names.length - 12}` : names.join(', ');
    return `- \`${name}\`${about ? `: ${about}` : ''}${shown ? ` Exports: ${shown}.` : ''}`;
  });
}

/** Files grouped by their folder, each folder a heading. */
function codeSection(files) {
  const byDir = new Map();
  for (const f of files) {
    const dir = f.slice(0, f.lastIndexOf('/'));
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(f);
  }
  const out = [];
  for (const [dir, list] of [...byDir].sort(([a], [b]) => a.localeCompare(b))) {
    out.push('', `### ${dir}/ (${list.length})`, '', ...fileLines(list, dir));
  }
  return out;
}

/** The spec's sections (## and ###, Appendix A's copied CLAUDE.md left out) and every decision's title. */
function specSection() {
  const lines = read('docs/DESIGN_SPEC.md').split('\n');
  const headings = [];
  let inAppendixA = false;
  for (const l of lines) {
    if (/^## /.test(l)) inAppendixA = l.startsWith('## Appendix A');
    if (!inAppendixA && /^#{2,3} /.test(l)) headings.push(l.startsWith('### ') ? `  - ${l.slice(4)}` : `- ${l.slice(3)}`);
  }
  const decisions = [];
  for (const l of lines) {
    const m = l.match(/^\| (\d+) \| (.+?) \|/);
    if (!m) continue;
    const title = m[2].replace(/\*\*/g, '').replace(/\s*\(\d{4}-\d{2}-\d{2}[^)]*\)\s*$/, '').trim();
    decisions.push([Number(m[1]), title]);
  }
  decisions.sort((a, b) => a[0] - b[0]);
  const next = decisions.length ? decisions[decisions.length - 1][0] + 1 : 1;
  return [
    '## The spec: `docs/DESIGN_SPEC.md`',
    '',
    'The source of truth. Read only the parts a task touches: a section by its heading, a decision by its row',
    "(`grep -n '^| 426 |' docs/DESIGN_SPEC.md`, then Read at that line). Decisions live in Appendix C; the newest are",
    `inserted above the older ones. **The next decision number is ${next}.**`,
    '',
    '### Sections',
    '',
    ...headings,
    '',
    `### Decisions (${decisions.length}, by number)`,
    '',
    ...decisions.map(([n, t]) => `- ${n} ${t}`),
  ];
}

/** Tables, the functions' live bodies and the migrations. */
function databaseSection() {
  const tables = new Set();
  for (const f of walk('supabase/migrations').filter((p) => p.endsWith('.sql'))) {
    for (const m of read(f).matchAll(/create table (?:if not exists )?((?:public|internal)\.[a-z_]+)/gi)) tables.add(m[1].toLowerCase());
  }
  const fns = { public: [], internal: [] };
  for (const f of walk('supabase/current')) {
    const m = f.match(/supabase\/current\/(public|internal)\.(.+)\.sql$/);
    if (m) fns[m[1]].push(m[2]);
  }
  const migrations = walk('supabase/migrations').filter((p) => p.endsWith('.sql')).map((p) => p.split('/').pop());
  return [
    '## The database (Supabase Postgres)',
    '',
    'Every function\'s live body is `supabase/current/<schema>.<name>.sql` (refreshed by `node scripts/db-snapshot.mjs`',
    'after each migration). `internal` helpers aren\'t served by the API; a function calling one sets',
    '`search_path = public, internal`.',
    '',
    `- **Tables (${tables.size}):** ${[...tables].sort().join(', ')}.`,
    `- **public functions (${fns.public.length}):** ${fns.public.join(', ')}.`,
    `- **internal functions (${fns.internal.length}):** ${fns.internal.join(', ')}.`,
    `- **Migrations (${migrations.length}, \`supabase/migrations/\`):** ${migrations.join(', ')}. Older ones are in \`supabase/migrations-archive/\`.`,
  ];
}

/** The docs, each by its title line. */
function docsSection() {
  const docs = ['CLAUDE.md', 'NEXT.md', 'FABLE.md', 'README.md',
    ...walk('docs').filter((p) => p.endsWith('.md')),
    ...walk('.claude/agents').filter((p) => p.endsWith('.md')),
    ...walk('.claude/skills').filter((p) => p.endsWith('SKILL.md'))].filter(exists);
  return [
    '## Docs',
    '',
    ...docs.map((d) => {
      const title = read(d).split('\n').find((l) => /^#\s|^name:/.test(l)) ?? '';
      return `- \`${d}\`: ${title.replace(/^#\s+|^name:\s*/, '')}`;
    }),
  ];
}

export function buildMap() {
  const pkg = JSON.parse(read('package.json'));
  const app = [...walk('src'), ...walk('supabase/functions'), ...walk('scripts')];
  const tests = walk('tests').map((p) => p.split('/').pop());
  return [
    '# CODE_MAP',
    '',
    'Generated by `node scripts/code-map.mjs` at the start of a new session (CLAUDE.md); git ignores it, so it',
    "always matches the files on disk. Don't edit it: change a file's header comment and run the script again.",
    '',
    `**${pkg.name} ${pkg.version}.** Runs on: ${Object.keys(pkg.dependencies ?? {}).join(', ')}. Dev only:`,
    `${Object.keys(pkg.devDependencies ?? {}).join(', ')}.`,
    '',
    ...specSection(),
    '',
    `## The code (${app.length} files)`,
    '',
    'Each file with the first sentence of its header comment (none shown when it has none) and its exports. Logic',
    'lives in `src/lib/` (pure, tested under Node); `src/pages/` and `src/components/` are React; the Edge Functions',
    'are `supabase/functions/`.',
    ...codeSection(app),
    '',
    `## Tests (${tests.length}, \`tests/\`, \`npm test\`)`,
    '',
    tests.join(', '),
    '',
    ...databaseSection(),
    '',
    ...docsSection(),
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const map = buildMap();
  fs.writeFileSync(path.join(root, 'CODE_MAP.md'), map);
  console.log(`CODE_MAP.md written: ${map.split('\n').length} lines, ${Math.round(map.length / 1024)} KB.`);
}
