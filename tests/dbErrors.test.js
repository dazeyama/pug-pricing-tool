import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DB_MESSAGES, dbErrorCode, dbMessage, knownCode } from '../src/lib/dbErrors.js';

// The database's refusals, read exactly (FABLE_REPORT A5).

test('a refusal is its code; anything else has none', () => {
  assert.equal(dbErrorCode({ message: 'stale_version' }), 'stale_version');
  assert.equal(dbErrorCode({ message: ' line_gone ' }), 'line_gone');
  assert.equal(dbErrorCode({ message: 'quantity must be at least 1' }), null);
  assert.equal(dbErrorCode({ message: 'TypeError: Failed to fetch' }), null);
  assert.equal(dbErrorCode({ message: 'duplicate key value violates unique constraint "x"' }), null);
  assert.equal(dbErrorCode(null), null);
  assert.equal(dbErrorCode({}), null);
});

test('a page knows only its own codes', () => {
  const page = { ...DB_MESSAGES, stale_version: 'This buy changed — reloaded.' };
  assert.equal(knownCode({ message: 'stale_version' }, page), 'stale_version');
  assert.equal(knownCode({ message: 'stale_version' }), null);
  assert.equal(knownCode({ message: 'bad_target' }, page), null);
});

test("the page's sentence, else the failure and the error", () => {
  const page = { ...DB_MESSAGES, line_struck: 'That card was already struck.' };
  assert.equal(dbMessage({ message: 'no_user' }, "Couldn't save"), 'Pick a user first.');
  assert.equal(dbMessage({ message: 'line_struck' }, "Couldn't strike", page), 'That card was already struck.');
  assert.equal(dbMessage({ message: 'bad_target' }, "Couldn't export", page), "Couldn't export: bad_target");
  assert.equal(dbMessage({ message: 'Failed to fetch' }, "Couldn't save"), "Couldn't save: Failed to fetch");
});

test('a code containing another is not mistaken for it (the old includes() did)', () => {
  const page = { line_struck: 'That card was already struck.' };
  assert.equal(dbMessage({ message: 'line_struck_twice' }, "Couldn't strike", page), "Couldn't strike: line_struck_twice");
});

test('every shared code is one the database raises', () => {
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
  const raised = new Set([...sql.matchAll(/raise exception '([a-z][a-z0-9_]*)'/gi)].map((m) => m[1]));
  for (const code of Object.keys(DB_MESSAGES)) assert.ok(raised.has(code), `${code} is never raised`);
});
