// The database's functions as they stand, one file each, in
// supabase/current/ (FABLE_REPORT C3b). A migration that changes a function
// writes its whole body again; run this after every `db push` and commit
// supabase/current/ with the migration, and `git diff supabase/current/`
// shows exactly what that migration changed. It's also where the next
// migration starts from: copy the current body, change what's needed.
//
//   node scripts/db-snapshot.mjs                      the linked dev project
//   node scripts/db-snapshot.mjs --confirm <ref>      another project (prod), to compare
//
// Read-only. Every file is rewritten, and files of functions that are gone
// are removed.

import fs from 'node:fs';
import path from 'node:path';
import { fail, projects, query, root } from './lib/linked.mjs';

const args = process.argv.slice(2);
const confirm = args[args.indexOf('--confirm') + 1];
const { ref, devRef, isDev } = projects();
if (!isDev && !(args.includes('--confirm') && confirm === ref)) {
  fail(`Linked to ${ref}, not dev (${devRef}). To snapshot it anyway: --confirm ${ref}`);
}

const rows = query(`
  select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
         pg_get_functiondef(p.oid) as def, p.proacl::text as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'internal')
   order by 1, 2, 3`);

const dir = path.join(root, 'supabase', 'current');
fs.mkdirSync(dir, { recursive: true });
const written = new Set();
for (const f of rows) {
  const file = `${f.schema}.${f.name}.sql`;
  if (written.has(file)) fail(`Two functions named ${f.schema}.${f.name}: give overloads their own file names before snapshotting.`);
  written.add(file);
  // Who may run it, as a comment: grants are lost when a function is dropped and made again.
  const body = `${f.def.replace(/\s+$/, '')};\n\n-- Granted: ${f.acl ?? 'default'}\n`;
  fs.writeFileSync(path.join(dir, file), body);
}
let removed = 0;
for (const file of fs.readdirSync(dir)) {
  if (file.endsWith('.sql') && !written.has(file)) {
    fs.rmSync(path.join(dir, file));
    removed++;
  }
}
console.log(`supabase/current/: ${written.size} functions from ${ref}${isDev ? ' (dev)' : ''}${removed ? `, ${removed} gone` : ''}.`);
