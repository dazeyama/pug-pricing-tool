import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportsOf, headerOf } from '../scripts/code-map.mjs';

// CODE_MAP.md's one line per file (CLAUDE.md, Start of a session).
test('a file is described by the first sentence of its comment after the imports', () => {
  const js = [
    "import { a } from './a.js';",
    'import {',
    '  b, c,',
    "} from './b.js';",
    '',
    '// Rates for each card (decision 413). Every total comes from here.',
    '// A second line of the same paragraph.',
    '//',
    '// A second paragraph, never shown.',
    'export const x = 1;',
  ].join('\n');
  assert.equal(headerOf(js), 'Rates for each card (decision 413).');
  assert.equal(headerOf('/** The footer (spec 11.7). */\nexport default function F() {}'), 'The footer (spec 11.7).');
  assert.equal(headerOf('/* global __APP_VERSION__ */\n// The page.\nexport default 1;'), 'The page.');
  assert.equal(headerOf('-- Only staff picks (decision 486).\nselect 1;'), 'Only staff picks (decision 486).');
  assert.equal(headerOf("import x from 'y';\nexport default x;"), '', 'no comment: nothing');
});

test("a file's exports, the default and lists included", () => {
  const js = [
    'export function a() {}',
    'export async function b() {}',
    'export const C = 1;',
    'export default function Page() {}',
    'export { d, e as f };',
  ].join('\n');
  assert.deepEqual(exportsOf(js), ['a', 'b', 'C', 'Page', 'd', 'f']);
});
