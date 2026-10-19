// PostToolUse hook for Edit|Write: lint the file just written, so a syntax error or a
// rule break (no-use-before-define caught the blank Buy screen of decision 324) shows at
// once. JS/JSX/MJS: the project's own ESLint (eslint.config.mjs). Python: py_compile.
// Exit 2 with the problems on stderr feeds them back to Claude; anything else passes.
// Reads the hook's JSON on stdin (no jq on this machine).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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
// Only this project's files, and only ones still there.
if (path.relative(root, full).startsWith('..') || !fs.existsSync(full)) process.exit(0);

if (/\.(m?js|jsx)$/i.test(full)) {
  const { ESLint } = await import('eslint');
  const eslint = new ESLint({ cwd: root });
  if (await eslint.isPathIgnored(full)) process.exit(0);
  const results = await eslint.lintFiles([full]);
  const errors = results.reduce((n, r) => n + r.errorCount, 0);
  if (errors) {
    const formatter = await eslint.loadFormatter('stylish');
    process.stderr.write(`ESLint found ${errors} error(s) in ${path.relative(root, full)}:\n${await formatter.format(results)}\n`);
    process.exit(2);
  }
} else if (/\.py$/i.test(full)) {
  try {
    execFileSync('python', ['-m', 'py_compile', full], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    process.stderr.write(`Python doesn't compile: ${path.relative(root, full)}\n${e.stderr?.toString() ?? e.message}\n`);
    process.exit(2);
  }
}
process.exit(0);
