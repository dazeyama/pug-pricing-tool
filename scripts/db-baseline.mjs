// Writes the migration-squash baseline (DESIGN_SPEC decision 192) from the
// linked Supabase project's catalog, without Docker (`supabase db dump` needs
// it; this machine has none). Read-only: it runs catalog queries through
// `npx supabase db query --linked` and writes one SQL file that rebuilds the
// `public` and `internal` schemas as they stand: sequences, tables, every
// function, constraints, indexes, triggers, row security and its policies,
// privileges (as they are, entry by entry), comments, the storage bucket and
// its policies, Realtime, and the starting rows.
//
//   node scripts/db-baseline.mjs /c/ClaudeProjects/temp/pug-squash/0001_baseline.sql
//   node scripts/db-baseline.mjs --rehearse /c/ClaudeProjects/temp/pug-squash/0001_baseline.sql
//
// The baseline is 0001 (SQUASH.md, decision 332), written outside
// supabase/migrations/ while the old files are still there: its header names
// the last of them, read from that folder.
//
// It refuses to run against anything but the dev project (the baseline is
// dev's structure). Nothing from dev's data is copied: the starting rows are
// the ones the old migrations seeded (0001 settings, 0028 Can't upload cards).
//
// --rehearse runs a written baseline on dev inside one transaction that is
// rolled back, with every `public.` and `internal.` renamed to scratch
// schemas, so the whole file (syntax, order, every function signature, every
// constraint, index, trigger, policy and grant) is proved against a real
// Postgres without touching dev's own objects. Storage, Realtime and the
// starting rows are left out of the rehearsal (they'd collide with dev's);
// they're the parts copied from 0002, 0023, 0028 and 0035, proved on prod.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, projects, query } from './lib/linked.mjs';

const rehearse = process.argv.includes('--rehearse');
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!out) fail('Usage: node scripts/db-baseline.mjs [--rehearse] <path of the baseline .sql>');

const { ref, devRef, isDev } = projects();
if (!isDev) fail(`Linked to ${ref}, not dev (${devRef}). The baseline is written from, and rehearsed on, dev only.`);

if (rehearse) {
  rehearsal(fs.readFileSync(out, 'utf8'));
  process.exit(0);
}

const SCHEMAS = `('public', 'internal')`;
const ROLES = ['anon', 'authenticated', 'service_role'];   // the roles the app grants to; PUBLIC is the empty grantee
// ACL letters (pg_class.relacl & co.) as grant words.
const PRIV = {
  table: { a: 'insert', r: 'select', w: 'update', d: 'delete', D: 'truncate', x: 'references', t: 'trigger', m: 'maintain' },
  sequence: { r: 'select', w: 'update', U: 'usage' },
  function: { X: 'execute' },
  schema: { U: 'usage', C: 'create' },
};

// ------------------------------------------------------------- the catalog
const q = (sql) => query(sql);

const schemas = q(`select nspname as name, nspacl::text as acl from pg_namespace where nspname in ${SCHEMAS} order by 1`);
const extensions = q(`select e.extname as name, n.nspname as schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname not in ('plpgsql', 'pg_stat_statements', 'pgcrypto', 'uuid-ossp', 'supabase_vault', 'pg_graphql', 'pgsodium') order by 1`);
const sequences = q(`select n.nspname as schema, c.relname as name, s.data_type, s.start_value, s.increment_by, s.min_value, s.max_value, s.cycle,
         (select format('%I.%I.%I', tn.nspname, t.relname, a.attname) from pg_depend d
            join pg_class t on t.oid = d.refobjid join pg_namespace tn on tn.oid = t.relnamespace
            join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
           where d.objid = c.oid and d.deptype = 'a' limit 1) as owned_by,
         c.relacl::text as acl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_sequences s on s.schemaname = n.nspname and s.sequencename = c.relname
   where c.relkind = 'S' and n.nspname in ${SCHEMAS} order by 1, 2`);
const tables = q(`select n.nspname as schema, c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
         c.relreplident as replident, c.relacl::text as acl, obj_description(c.oid, 'pg_class') as comment
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname in ${SCHEMAS} order by 1, 2`);
const columns = q(`select n.nspname as schema, c.relname as table, a.attname as name, a.attnum,
         format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null, a.attidentity as identity, a.attgenerated as generated,
         pg_get_expr(d.adbin, d.adrelid) as default_expr,
         case when a.attcollation <> t.typcollation then (select format('%I.%I', cn.nspname, co.collname) from pg_collation co join pg_namespace cn on cn.oid = co.collnamespace where co.oid = a.attcollation) end as collation,
         col_description(c.oid, a.attnum) as comment
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace join pg_type t on t.oid = a.atttypid
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where c.relkind = 'r' and n.nspname in ${SCHEMAS} and a.attnum > 0 and not a.attisdropped order by 1, 2, a.attnum`);
const constraints = q(`select n.nspname as schema, c.relname as table, k.conname as name, k.contype as type, pg_get_constraintdef(k.oid, true) as def
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ${SCHEMAS} order by case k.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 when 'x' then 3 else 4 end, 1, 2, 3`);
const indexes = q(`select schemaname as schema, tablename as table, indexname as name, indexdef as def from pg_indexes i
   where schemaname in ${SCHEMAS} and not exists (select 1 from pg_constraint k where k.conindid = (quote_ident(i.schemaname) || '.' || quote_ident(i.indexname))::regclass)
   order by 1, 2, 3`);
const functions = q(`select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args, p.prokind as kind,
         pg_get_functiondef(p.oid) as def, p.proacl::text as acl, obj_description(p.oid, 'pg_proc') as comment
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ${SCHEMAS} order by 1, 2, 3`);
const triggers = q(`select n.nspname as schema, c.relname as table, t.tgname as name, pg_get_triggerdef(t.oid, true) as def
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ${SCHEMAS} and not t.tgisinternal order by 1, 2, 3`);
const policies = q(`select n.nspname as schema, c.relname as table, p.polname as name, p.polcmd as cmd, p.polpermissive as permissive,
         (select to_jsonb(array_agg(r.rolname order by r.rolname)) from pg_roles r where r.oid = any(p.polroles)) as roles,
         pg_get_expr(p.polqual, p.polrelid, true) as using_expr, pg_get_expr(p.polwithcheck, p.polrelid, true) as check_expr
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ${SCHEMAS} or (n.nspname = 'storage' and c.relname = 'objects') order by 1, 2, 3`);
const buckets = q(`select id, name, public, file_size_limit, to_jsonb(allowed_mime_types) as allowed_mime_types from storage.buckets order by id`);
const publication = q(`select schemaname as schema, tablename as table from pg_publication_tables where pubname = 'supabase_realtime' and schemaname in ${SCHEMAS} order by 1, 2`);

// --------------------------------------------------------------- the file
const L = [];
const put = (...lines) => L.push(...lines);
const ident = (s) => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`);
const qn = (schema, name) => `${ident(schema)}.${ident(name)}`;
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const fnSig = (f) => `${qn(f.schema, f.name)}(${f.args})`;
// The store's date, not UTC's: the clock is Pacific, and an evening run is already tomorrow in UTC.
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const N = Number(path.basename(out).slice(0, 4));
const num = (n) => String(n).padStart(4, '0');
// The old migrations it stands in for: every numbered file in supabase/migrations/ but this one.
const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const oldNumbers = fs.readdirSync(MIGRATIONS)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f) && path.resolve(MIGRATIONS, f) !== path.resolve(out))
  .map((f) => Number(f.slice(0, 4)));
if (!oldNumbers.length) fail('No old migrations in supabase/migrations/: write the baseline before archiving them (SQUASH.md section 3).');
const lastOld = Math.max(...oldNumbers);

put(`-- PUG Pricing Tool: the database as one migration (DESIGN_SPEC decision 192,`,
  `-- Phase 10 "Migration squash at launch"). Written ${today} by`,
  `-- scripts/db-baseline.mjs from the dev project's catalog (${ref}), standing in`,
  `-- for migrations 0001–${num(lastOld)}, now in supabase/migrations-archive/.`,
  `-- Nothing here is edited by hand except the "Starting rows" at the end; to change`,
  `-- the database, write migration ${num(N + 1)} and up.`,
  ``,
  `-- Function bodies aren't checked as they're created, so their order doesn't`,
  `-- matter (pg_dump does the same).`,
  `set check_function_bodies = off;`,
  ``);

section('Extensions');
for (const e of extensions) put(`create extension if not exists ${ident(e.name)} with schema ${ident(e.schema)};`);

section('Schemas');
for (const s of schemas) if (s.name !== 'public') put(`create schema if not exists ${ident(s.name)};`);

section('Sequences');
for (const s of sequences) {
  put(`create sequence ${qn(s.schema, s.name)} as ${s.data_type} increment by ${s.increment_by} minvalue ${s.min_value} maxvalue ${s.max_value} start with ${s.start_value} ${s.cycle ? 'cycle' : 'no cycle'};`);
}

section('Tables (columns; defaults come after the functions they may call)');
for (const t of tables) {
  const cols = columns.filter((c) => c.schema === t.schema && c.table === t.name);
  put(`create table ${qn(t.schema, t.name)} (`);
  put(cols.map((c, i) => {
    let line = `  ${ident(c.name)} ${c.type}`;
    if (c.collation) line += ` collate ${c.collation}`;
    if (c.generated === 's') line += ` generated always as (${c.default_expr}) stored`;
    if (c.identity) line += ` generated ${c.identity === 'a' ? 'always' : 'by default'} as identity`;
    if (c.not_null) line += ' not null';
    return line + (i < cols.length - 1 ? ',' : '');
  }).join('\n'));
  put(`);`);
}
for (const s of sequences) if (s.owned_by) put(`alter sequence ${qn(s.schema, s.name)} owned by ${s.owned_by};`);

section(`Functions (${functions.length}: ${functions.filter((f) => f.schema === 'public').length} public, ${functions.filter((f) => f.schema === 'internal').length} internal)`);
// Trigger functions first; row-typed signatures (buys, buy_lines) need the tables, which exist by now.
const trigFns = new Set(triggers.map((t) => /execute function (\S+)\(/i.exec(t.def)?.[1]));
const ordered = [...functions].sort((a, b) => Number(trigFns.has(`${b.schema}.${b.name}`)) - Number(trigFns.has(`${a.schema}.${a.name}`)));
for (const f of ordered) {
  if (f.kind !== 'f') fail(`${fnSig(f)} is a ${f.kind === 'p' ? 'procedure' : `kind ${f.kind}`}; add support before squashing.`);
  put(f.def.trimEnd() + ';', '');
}

section('Column defaults');
for (const c of columns) if (c.default_expr && c.generated !== 's') put(`alter table ${qn(c.schema, c.table)} alter column ${ident(c.name)} set default ${c.default_expr};`);

section('Constraints (keys and checks, then foreign keys)');
for (const k of constraints) put(`alter table ${qn(k.schema, k.table)} add constraint ${ident(k.name)} ${k.def};`);

section('Indexes');
// pg_indexes leaves the trigram operator class unqualified when `extensions` is on the search path.
for (const i of indexes) put(`${i.def.replace(/(?<![.\w])gin_trgm_ops\b/g, 'extensions.gin_trgm_ops')};`);

section('Triggers');
// pg_get_triggerdef leaves the table unqualified for the same reason.
for (const t of triggers) put(`${t.def.replace(/ ON (\S+) FOR /, ` ON ${qn(t.schema, t.table)} FOR `)};`);

section('Row security');
for (const t of tables) {
  if (t.rls) put(`alter table ${qn(t.schema, t.name)} enable row level security;`);
  if (t.force_rls) put(`alter table ${qn(t.schema, t.name)} force row level security;`);
}
for (const p of policies.filter((x) => x.schema !== 'storage')) put(policySql(p));

section('Privileges (as on dev, entry by entry: the fingerprints compare their text)');
// `public` is Supabase's schema, with its own grants; prod has the same. Only ours.
for (const s of schemas) if (s.name !== 'public') put(...aclSql('schema', ident(s.name), s.acl));
for (const t of tables) put(...aclSql('table', qn(t.schema, t.name), t.acl));
for (const s of sequences) put(...aclSql('sequence', qn(s.schema, s.name), s.acl));
for (const f of functions) put(...aclSql('function', fnSig(f), f.acl));

section('Comments');
for (const t of tables) if (t.comment) put(`comment on table ${qn(t.schema, t.name)} is ${lit(t.comment)};`);
for (const c of columns) if (c.comment) put(`comment on column ${qn(c.schema, c.table)}.${ident(c.name)} is ${lit(c.comment)};`);
for (const f of functions) if (f.comment) put(`comment on function ${fnSig(f)} is ${lit(f.comment)};`);

section('Storage: the master-inventory bucket and its policies (0002, 0023)');
for (const b of buckets) {
  put(`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)`,
    `values (${lit(b.id)}, ${lit(b.name)}, ${b.public}, ${b.file_size_limit ?? 'null'}, ${b.allowed_mime_types ? `array[${b.allowed_mime_types.map(lit).join(', ')}]` : 'null'})`,
    `on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;`);
}
for (const p of policies.filter((x) => x.schema === 'storage')) put(policySql(p));

section('Realtime (0002, 0035)');
for (const t of tables) {
  if (t.replident === 'f') put(`alter table ${qn(t.schema, t.name)} replica identity full;`);
  else if (t.replident === 'n') put(`alter table ${qn(t.schema, t.name)} replica identity nothing;`);
  else if (t.replident === 'i') fail(`${t.name} uses an index as its replica identity; add support before squashing.`);
}
if (publication.length) put(`alter publication supabase_realtime add table ${publication.map((p) => qn(p.schema, p.table)).join(', ')};`);

section('Starting rows (not from dev: what the old migrations seeded)');
put(`-- The master percentages start at the store's 33.34 / 66.68 (decision 333; 0001 seeded 33 / 66).`,
  `insert into public.settings (key, value) values ('cash_pct', '33.34'), ('credit_pct', '66.68') on conflict (key) do nothing;`,
  `-- 0028: the Can't upload cards collection.`,
  `select public.cant_upload_ensure();`);

const text = L.join('\n') + '\n';
fs.writeFileSync(out, text);
// File lines: a function body is one entry of L but many lines.
console.log(`Wrote ${out}: ${text.split('\n').length - 1} lines — ${tables.length} tables, ${columns.length} columns, ${sequences.length} sequence(s), ${functions.length} functions, `
  + `${constraints.length} constraints, ${indexes.length} indexes, ${triggers.length} trigger(s), ${policies.length} policies, ${publication.length} realtime tables, ${buckets.length} bucket(s).`);
const nullAcl = [...tables, ...sequences, ...functions.map((f) => ({ ...f, name: fnSig(f) }))].filter((x) => x.acl == null);
if (nullAcl.length) console.log(`Note: ${nullAcl.length} object(s) have default privileges (no explicit grants) on dev; the baseline leaves them so: ${nullAcl.map((x) => x.name).join(', ')}`);

// ----------------------------------------------------------------- helpers

function section(title) {
  put('', `-- ${'='.repeat(74)}`, `-- ${title}`, `-- ${'='.repeat(74)}`);
}

function policySql(p) {
  const cmd = { r: 'select', a: 'insert', w: 'update', d: 'delete', '*': 'all' }[p.cmd];
  const roles = (p.roles ?? []).length ? p.roles.map(ident).join(', ') : 'public';
  let s = `create policy ${ident(p.name)} on ${qn(p.schema, p.table)} as ${p.permissive ? 'permissive' : 'restrictive'} for ${cmd} to ${roles}`;
  if (p.using_expr) s += `\n  using (${p.using_expr})`;
  if (p.check_expr) s += `\n  with check (${p.check_expr})`;
  return s + ';';
}

/**
 * Grants that reproduce an ACL exactly (its entries in order): everything the
 * app's roles and PUBLIC could have is revoked first, then each entry granted
 * back. The owner's own entry is never touched. A null ACL (default privileges)
 * is left alone: dev has none, so prod gets none.
 */
function aclSql(kind, target, acl) {
  if (acl == null) return [];
  const on = `${kind} ${target}`;
  const lines = [`revoke all on ${on} from public, ${ROLES.join(', ')};`];
  for (const entry of acl.replace(/^\{|\}$/g, '').split(',')) {
    const m = /^(?:"?([^=]*?)"?)=([a-zA-Z*]*)\/(\w+)$/.exec(entry.trim());
    if (!m) fail(`Can't read ACL entry ${entry} on ${target}`);
    const grantee = m[1] === '' ? 'public' : m[1];
    if (grantee === m[3] || !(grantee === 'public' || ROLES.includes(grantee))) continue;   // the owner, or a Supabase role
    const privs = m[2].replace(/\*/g, '').split('').map((ch) => PRIV[kind][ch] ?? fail(`Unknown privilege ${ch} on ${target}`));
    if (privs.length) lines.push(`grant ${privs.join(', ')} on ${on} to ${grantee};`);
  }
  return lines;
}

/** The written baseline, renamed into scratch schemas, run on dev and rolled back. */
function rehearsal(sql) {
  // A section runs from its title line to the next section's opening rule.
  const cut = (text, title) => {
    const i = text.indexOf(`-- ${title}`);
    if (i < 0) fail(`No "${title}" section in the file`);
    const closingRule = text.indexOf('-- ====', i);
    const j = text.indexOf('-- ====', closingRule + 7);
    return text.slice(0, i) + text.slice(j < 0 ? text.length : j);
  };
  let body = sql;
  for (const title of ['Storage:', 'Starting rows']) body = cut(body, title);
  // Realtime: the replica identities stay (they're part of the structure checked
  // below); only the publication line goes, as it would touch dev's own.
  body = body.replace(/^alter publication supabase_realtime .*$/gm, '');
  body = body
    .replace(/\bpublic\./g, 'scratch.')
    .replace(/\binternal\./g, 'scratch_internal.')
    .replace(/\bschema internal\b/g, 'schema scratch_internal')
    .replace(/create schema if not exists internal;/g, 'create schema if not exists scratch_internal;');
  const script = [
    'begin;',
    'create schema scratch;',
    'set local search_path = scratch, scratch_internal, public, extensions;',
    body,
    // Then the structure fingerprints of the scratch copy against dev's own,
    // the same formulas as scripts/db-test-run.sql uses for dev against prod,
    // with the schema names and the index names evened out.
    fingerprintSql(),
    'rollback;',
  ].join('\n');
  const started = Date.now();
  const rows = query(script);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`The whole baseline ran on dev in scratch schemas and was rolled back (${seconds}s). Its structure against dev's:`);
  let failed = 0;
  for (const r of rows) {
    if (!r.same) failed++;
    const diff = r.diff ? `\n      ${String(r.diff).slice(0, 3000).replace(/\n/g, '\n      ')}` : '';
    console.log(`  ${r.same ? '✓ same' : '✗ different'}  ${r.name}${r.same ? '' : diff}`);
  }
  if (failed) fail(`\n${failed} fingerprint(s) differ: the baseline doesn't rebuild dev exactly. Fix scripts/db-baseline.mjs, not the .sql.`);
  console.log('\nRehearsal passed.');
}

/** Each fingerprint for the scratch copy and for dev, normalised so only real differences show. */
function fingerprintSql() {
  // Schema qualifiers come and go with the search path (scratch shadows public
  // inside the rehearsal), so both sides are compared without them.
  const norm = (expr, pub, int) => `replace(replace(replace(replace(${expr}, '${int}.', ''), '${pub}.', ''), '${int}', 'internal'), '${pub}', 'public')`;
  const bodies = {
    'Server functions': (pub, int) => `select pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname in ('${pub}', '${int}')`,
    'Tables and columns': (pub, int) => `select format('%s.%s.%s %s %s %s', table_schema, table_name, column_name, data_type, coalesce(column_default, ''), is_nullable) as d from information_schema.columns where table_schema in ('${pub}', '${int}')`,
    Constraints: (pub) => `select conrelid::regclass::text || ' ' || pg_get_constraintdef(oid) as d from pg_constraint where connamespace = '${pub}'::regnamespace`,
    Indexes: (pub) => `select regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX \\S+ ON ', 'CREATE \\1INDEX ON ') as d from pg_indexes where schemaname = '${pub}'`,
    'Row security policies': (pub) => `select format('%s %s %s %s %s %s', tablename, policyname, cmd, roles, qual, with_check) as d from pg_policies where schemaname = '${pub}'`,
    Triggers: (pub) => `select pg_get_triggerdef(t.oid) as d from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = '${pub}'::regnamespace and not t.tgisinternal`,
    Privileges: (pub, int) => `select format('%s.%s(%s) %s', ns.nspname, p.proname, pg_get_function_identity_arguments(p.oid), coalesce(p.proacl::text, 'default')) as d
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname in ('${pub}', '${int}')
      union all select format('%s %s', c.relname, coalesce(c.relacl::text, 'default')) from pg_class c where c.relnamespace = '${pub}'::regnamespace and c.relkind in ('r', 'S', 'v')
      union all select format('schema %s %s', nspname, nspacl) from pg_namespace where nspname = '${int}'`,
    'Row security on': (pub) => `select format('%s %s %s %s', relname, relrowsecurity, relforcerowsecurity, relreplident) as d from pg_class where relnamespace = '${pub}'::regnamespace and relkind = 'r'`,
    Comments: (pub, int) => `select format('%s %s %s', c.relname, d.objsubid, d.description) as d from pg_description d join pg_class c on c.oid = d.objoid join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('${pub}', '${int}')`,
  };
  const rows = (body, pub, int) => `select ${norm('x.d', pub, int)} as d from (${body(pub, int)}) x`;
  const hash = (src) => `(select md5(coalesce(string_agg(d, E'\\n' order by d), '')) from (${src}) h)`;
  const parts = Object.entries(bodies).map(([name, body]) => {
    const copy = rows(body, 'scratch', 'scratch_internal');
    const dev = rows(body, 'public', 'internal');
    // The lines only one side has: "+ " in the baseline's copy, "- " on dev.
    const diff = `(select string_agg(d, E'\\n' order by d) from (
        select '+ ' || d as d from ((${copy}) except (${dev})) a
        union all select '- ' || d from ((${dev}) except (${copy})) b) z)`;
    return `select '${name}' as name, ${hash(copy)} = ${hash(dev)} as same, ${diff} as diff`;
  });
  return parts.join('\nunion all\n') + ';';
}

