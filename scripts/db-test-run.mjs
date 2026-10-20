// The database test run (docs/TEST.md, section 21): runs scripts/db-test-run.sql
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
//   node scripts/db-test-run.mjs --project-ref <ref> --confirm <ref> --compare dev.json
//                                                     the same, with the CLI
//                                                     still linked to dev
//
// It runs `npx supabase db query --linked`, so the project is whichever one
// `npx supabase link` last linked, unless --project-ref <ref> names another
// (prod, with dev still linked). A project other than the dev one in
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

// Read by fail(), declared before its first call: a run that dies part-way still puts the buy number back.
let before = null;
let buysPutBack = false;

// --project-ref <ref> runs on that project while the CLI stays linked to dev (decision 377).
const named = opt('--project-ref');
if (args.includes('--project-ref') && (!named || named.startsWith('--'))) fail('--project-ref needs the project ref after it.');
const ref = named ?? readText(path.join(root, 'supabase', '.temp', 'project-ref'))?.trim();
if (!ref) fail('No linked project: run `npx supabase link` first, or pass --project-ref <ref>.');
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
  'events_seq', (select last_value from events_seq_seq),
  'buys_seq', (select jsonb_build_object('last', last_value, 'called', is_called) from buys_number_seq)) as snapshot`;

before = query(SNAPSHOT)[0].snapshot;
const started = Date.now();
const rows = query(null, path.join(root, 'scripts', 'db-test-run.sql'));
const seconds = ((Date.now() - started) / 1000).toFixed(1);
const nextBuy = putBuysBack();
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
  if (key === 'events_seq' || key === 'buys_seq') continue;
  if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) (key === 'dbtest' ? leftovers : changed).push(key);
}
if (after.dbtest !== 0) leftovers.push('dbtest');
if (Number(after.events_seq) < Number(before.events_seq)) leftovers.push('events_seq went back');
console.log('\nAfterwards');
console.log(`  ${leftovers.length ? '✗' : '✓'} Nothing the test made was kept${leftovers.length ? `: ${leftovers.join(', ')}` : ''}`);
console.log(`  ✓ Buy numbers put back: the next buy is Buy ${nextBuy}`);
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
  const res = spawnSync('npx', ['supabase', 'db', 'query', ...(named ? ['--project-ref', named] : ['--linked']), '-f', `"${tmp ?? file}"`], {
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

/**
 * Buy numbers are forever (decision 290), and a sequence isn't rolled back. Since decision 349 a
 * confirm takes the highest number + 1 and buys_number_seq is only a floor, but the run's restore
 * test still raises that floor (restore_backup's setval): put it back where it was, or to the
 * highest real buy if one was confirmed meanwhile, so the test run uses up no number (decision 342).
 * The Changelog's numbering only moves on, as before.
 * @returns {number} the next buy's number
 */
function putBuysBack() {
  buysPutBack = true;
  const { last, called } = before.buys_seq;
  const [{ next }] = query(`with top as (select max(number) as n from buys)
    select case when (select n from top) > ${Number(last)} - ${called ? 0 : 1}
                then setval('buys_number_seq', (select n from top), true)
                else setval('buys_number_seq', ${Number(last)}, ${called ? 'true' : 'false'}) end,
           greatest((select coalesce(max(number), 0) from buys),
                    (select case when is_called then last_value else last_value - 1 end from buys_number_seq)) + 1 as next`);
  return next;
}

function fail(message) {
  console.error(message);
  if (before && !buysPutBack) {
    try {
      console.error(`Buy numbers put back: the next buy is Buy ${putBuysBack()}.`);
    } catch {
      console.error('The buy number could not be put back: run the test again, or set buys_number_seq by hand.');
    }
  }
  process.exit(2);
}
