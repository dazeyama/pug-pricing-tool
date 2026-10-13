// The database test run (TEST.md, section 18): runs scripts/db-test-run.sql
// on the linked Supabase project and prints what passed and what didn't.
// Everything the test makes is rolled back; this checks afterwards that
// nothing was left behind.
//
//   node scripts/db-test-run.mjs                      the linked dev project
//   node scripts/db-test-run.mjs --save dev.json      … and keep the results
//   node scripts/db-test-run.mjs --confirm <ref> --compare dev.json
//                                                     another project (prod),
//                                                     its fingerprints checked
//                                                     against a saved dev run
//
// It runs `npx supabase db query --linked`, so the project is whichever one
// `npx supabase link` last linked. A project other than the dev one in
// .env.development needs --confirm with its ref. It reads no secrets and the
// saved file holds only the results (DBTEST data, counts and fingerprints).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const ref = readText(path.join(root, 'supabase', '.temp', 'project-ref'))?.trim();
if (!ref) fail('No linked project: run `npx supabase link` first.');
const devUrl = readText(path.join(root, '.env.development'))?.match(/VITE_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]+)\./)?.[1];
const isDev = ref === devUrl;
if (!isDev && opt('--confirm') !== ref) {
  fail(`Linked to ${ref}${devUrl ? `, not the dev project (${devUrl})` : ''}. To run here anyway: --confirm ${ref}`);
}
console.log(`Database test run on ${ref}${isDev ? ' (dev)' : ''}\n`);

const SNAPSHOT = `select jsonb_build_object(
  'counts', backup_counts(),
  'all_buys', (select count(*) from buys),
  'customers', (select count(*) from customers),
  'devices', (select count(*) from devices),
  'staff', (select count(*) from staff_users),
  'settings', (select jsonb_object_agg(key, value) from settings),
  'inventory_files', (select coalesce(jsonb_agg(id order by id), '[]') from master_inventory_files),
  'products', (select count(*) from cc_products),
  'product_links', (select count(*) from cc_product_links),
  'set_map', (select count(*) from cc_set_map),
  'import_links', (select count(*) from import_links),
  'locks', (select count(*) from collection_locks),
  'dbtest', (select count(*) from staff_users where name like 'DBTEST%')
          + (select count(*) from devices where label like 'DBTEST%')
          + (select count(*) from buys where customer_name like 'DBTEST%')
          + (select count(*) from customers where name like 'DBTEST%')
          + (select count(*) from cc_products where product_id like 'DBTEST%')
          + (select count(*) from master_inventory_files where storage_path like 'dbtest/%'),
  'events_seq', (select last_value from events_seq_seq)) as snapshot`;

const before = query(SNAPSHOT)[0].snapshot;
const started = Date.now();
const rows = query(null, path.join(root, 'scripts', 'db-test-run.sql'));
const seconds = ((Date.now() - started) / 1000).toFixed(1);
const after = query(SNAPSHOT)[0].snapshot;

// The results, section by section.
let failed = 0;
let section = null;
const fingerprints = {};
for (const r of rows) {
  if (r.section === 'Fingerprints') {
    fingerprints[r.name.replace(/ \(.*\)$/, '')] = { label: r.name, hash: r.detail };
    continue;
  }
  if (r.section !== section) {
    section = r.section;
    console.log(`\n${section}`);
  }
  if (!r.ok) failed++;
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${!r.ok && r.detail ? `\n      ${r.detail}` : ''}`);
}

// Nothing left behind: the same rows as before (the Changelog's numbering only moves on).
const leftovers = [];
const changed = [];
for (const key of Object.keys(before)) {
  if (key === 'events_seq') continue;
  if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) (key === 'dbtest' ? leftovers : changed).push(key);
}
if (after.dbtest !== 0) leftovers.push('dbtest');
if (Number(after.events_seq) < Number(before.events_seq)) leftovers.push('events_seq went back');
console.log('\nAfterwards');
console.log(`  ${leftovers.length ? '✗' : '✓'} Nothing the test made was kept${leftovers.length ? `: ${leftovers.join(', ')}` : ''}`);
if (changed.length) {
  console.log(`  ! Changed during the run: ${changed.join(', ')} (someone using the app? Run it again when it's quiet.)`);
}
if (leftovers.length) failed++;

console.log('\nFingerprints');
for (const { label, hash } of Object.values(fingerprints)) console.log(`  ${hash}  ${label}`);

const comparePath = opt('--compare');
if (comparePath) {
  const other = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
  console.log(`\nCompared with ${other.ref} (${other.at})`);
  for (const [key, { label, hash }] of Object.entries(fingerprints)) {
    const theirs = other.fingerprints?.[key]?.hash;
    if (theirs !== hash) failed++;
    console.log(`  ${theirs === hash ? '✓ same' : '✗ different'}  ${label}`);
  }
}

const savePath = opt('--save');
if (savePath) {
  fs.writeFileSync(savePath, JSON.stringify({ ref, at: new Date().toISOString(), seconds, results: rows, fingerprints }, null, 2));
  console.log(`\nSaved to ${savePath}`);
}

const total = rows.filter((r) => r.section !== 'Fingerprints').length;
console.log(`\n${failed ? `${failed} failed` : 'All passed'}: ${total} checks in ${seconds}s.`);
process.exit(failed ? 1 : 0);

// ----------------------------------------------------------------------------

function query(sql, file) {
  let tmp = null;
  if (sql) {
    tmp = path.join(os.tmpdir(), `pug-db-test-${process.pid}.sql`);
    fs.writeFileSync(tmp, sql);
  }
  const res = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${tmp ?? file}"`], {
    cwd: root, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024,
  });
  if (tmp) fs.rmSync(tmp, { force: true });
  const out = res.stdout ?? '';
  const start = out.indexOf('{');
  if (start < 0) fail(`No answer from the database:\n${out}\n${res.stderr ?? ''}`);
  const json = firstJson(out.slice(start));
  if (json._tag === 'Error' || json.error) fail(`The database refused the script:\n${JSON.stringify(json.error ?? json, null, 2)}`);
  return json.rows ?? [];
}

// The CLI prints its JSON, then sometimes a notice: parse just the JSON.
function firstJson(text) {
  for (let end = text.lastIndexOf('}'); end > 0; end = text.lastIndexOf('}', end - 1)) {
    try {
      return JSON.parse(text.slice(0, end + 1));
    } catch {
      // keep looking
    }
  }
  fail(`Couldn't read the database's answer:\n${text.slice(0, 2000)}`);
}

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
