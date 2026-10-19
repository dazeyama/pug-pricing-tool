// PostToolUse hook for Edit|Write: lint the file just written, so a syntax error or a
// rule break (no-use-before-define caught the blank Buy screen of decision 324) shows at
// once. JS/JSX/MJS: the project's own ESLint (eslint.config.mjs). Python: a syntax check
// that writes nothing (no __pycache__). Exit 2 with the problems on stderr feeds them back
// to Claude; anything else passes. Only files inside this project, on its own drive.
// Reads the hook's JSON on stdin with Node, so it needs nothing else installed.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fail = (text) => {
  process.stderr.write(`${text}\n`);
  process.exit(2);
};

let input = '';
for await (const chunk of process.stdin) input += chunk;
let file;
try {
  const data = JSON.parse(input || '{}');
  file = data.tool_input?.file_path ?? data.tool_response?.filePath;
} catch {
  process.exit(0);
}
if (!file) process.exit(0);
const full = path.resolve(file);
// Inside this project: a relative path that doesn't climb out. Another drive (D:\…) gives an
// absolute "relative" path on Windows, so that's outside too.
const rel = path.relative(root, full);
if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(full)) process.exit(0);

if (/\.(m?js|jsx)$/i.test(full)) {
  let results;
  let eslint;
  try {
    const { ESLint } = await import('eslint');
    eslint = new ESLint({ cwd: root });
    if (await eslint.isPathIgnored(full)) process.exit(0);
    results = await eslint.lintFiles([full]);
  } catch (e) {
    // ESLint itself failed (eslint.config.mjs broken mid-edit, node_modules missing): say so.
    fail(`ESLint couldn't lint ${rel}: ${e.message}`);
  }
  const errors = results.reduce((n, r) => n + r.errorCount, 0);
  if (errors) {
    const formatter = await eslint.loadFormatter('stylish');
    fail(`ESLint found ${errors} error(s) in ${rel}:\n${await formatter.format(results)}`);
  }
} else if (/\.py$/i.test(full)) {
  try {
    // compile() parses without writing bytecode, unlike py_compile.
    execFileSync('python', ['-c', 'import sys; compile(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1], "exec")', full],
      { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    const err = e.stderr?.toString() ?? '';
    // No Python here (not installed, or Windows' Store stub, exit 9009): nothing to check with.
    if (e.code === 'ENOENT' || e.status === 9009 || /Python was not found/i.test(err)) process.exit(0);
    fail(`Python doesn't compile: ${rel}\n${err || e.message}`);
  }
}
process.exit(0);
