// PostToolUse hook for Edit|Write: run the unit tests the file just written can affect, so a
// regression shows at once instead of at the commit's `npm test` (decision 528). A test file
// runs itself; a source file (src/, scripts/) runs every test that imports it, directly or
// through other files. A failure is a note Claude reads, never a blocking error: a change made
// in several edits fails between them, and the five sessions share this folder, so the cause
// may be another session's half-done work. The full `npm test` before each commit stays the check.
// Reads the hook's JSON on stdin with Node, so it needs nothing else installed.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CODE = /\.(m?js|jsx)$/i;
// Relative imports only: `from './x.js'`, `import './x.js'`, `import('./x.js')`.
const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
// The tool's path and the walk's can differ in a drive letter's case on Windows.
const key = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);

let input = '';
for await (const chunk of process.stdin) input += chunk;
let file;
try {
  const data = JSON.parse(input || '{}');
  file = data.tool_input?.file_path ?? data.tool_response?.filePath;
} catch {
  process.exit(0);
}
if (!file || !CODE.test(file)) process.exit(0);
const full = path.resolve(file);
const rel = path.relative(root, full);
const top = rel.split(path.sep)[0];
// Inside this project (see lint-edit.mjs) and in a folder the tests reach.
if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(full)) process.exit(0);
if (!['src', 'scripts', 'tests'].includes(top)) process.exit(0);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.isDirectory()) return walk(p);
  return CODE.test(d.name) ? [p] : [];
});
const resolveImport = (from, spec) => {
  const base = path.resolve(path.dirname(from), spec);
  return [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, path.join(base, 'index.js')]
    .find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
};

// Who imports whom, reversed: each file's importers.
const files = ['src', 'scripts', 'tests'].flatMap((d) => (fs.existsSync(path.join(root, d)) ? walk(path.join(root, d)) : []));
const importers = new Map();
for (const f of files) {
  for (const [, spec] of fs.readFileSync(f, 'utf8').matchAll(IMPORT)) {
    const target = resolveImport(f, spec);
    if (!target) continue;
    const k = key(target);
    if (!importers.has(k)) importers.set(k, new Set());
    importers.get(k).add(f);
  }
}
const isTest = (p) => p.endsWith('.test.js') && key(path.dirname(p)) === key(path.join(root, 'tests'));
const tests = new Set();
const seen = new Set([key(full)]);
const queue = [full];
while (queue.length) {
  const f = queue.pop();
  if (isTest(f)) tests.add(path.relative(root, f));
  for (const by of importers.get(key(f)) ?? []) {
    if (seen.has(key(by))) continue;
    seen.add(key(by));
    queue.push(by);
  }
}
if (!tests.size) process.exit(0);

const list = [...tests].sort();
const run = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...list],
  { cwd: root, encoding: 'utf8', timeout: 50_000 });
if (run.status === 0) process.exit(0);
const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
// The spec reporter repeats the failures after "failing tests:"; without it (a crash, the
// timeout), the output's last lines.
const at = out.indexOf('failing tests:');
const detail = (at >= 0 ? out.slice(at) : out.split('\n').slice(-40).join('\n') || run.error?.message || '').slice(0, 4000);
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: `Not blocking: the tests ${rel} can affect failed (${list.join(', ')}). `
      + `If the change is mid-edit or the failure is in another session's file, carry on; `
      + `otherwise fix it before the commit's npm test:\n${detail}`,
  },
}));
process.exit(0);
