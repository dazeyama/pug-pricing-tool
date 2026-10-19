# SQUASH.md — the migration squash, step by step

The runbook for DESIGN_SPEC decision 192 ("Migration squash at launch",
Phase 10). The spec says *what* and *why*; this file says exactly *how*, with
the commands, what each must print, the gate before the next step, and the
way back if it doesn't. Written by Claude Fable 5.1 on 2026-10-16 after
reading all 62 migrations, the CLI's help, and dev's catalog, and after
**rehearsing the baseline on dev** (section 4): all nine structure
fingerprints came back the same as dev's.

Read FABLE.md first (the gates apply here more than anywhere), then this.

*Renumbered 2026-10-16 (the code review's Phase 5), again that day, and a
third time for the phone scanner:* migrations 0063–0067 landed on dev before
the squash (0066: bulk counted apart in the Changelog, after the Phase 6
smoke test; 0067: Show all finds struck cards), then 0068–0070 (the phone
scanner, docs/SCAN_FUNCTION.md: scan sessions, scans, undo), then 0071–0075 (buys numbered
forever, the day's Custom SKU, the completion rules, a collection's Undo export, a scan saved once), so N is 0075.

*Renumbered for launch, 2026-10-19 (DESIGN_SPEC decision 332):* the baseline is
**`0001_baseline.sql`** whatever N is (the owner: "is there any way we can rename
the post squash single migration to 001 again? It would feel cleaner"), and the
first migration after launch is **0002**. **Prod starts empty** (the owner, the
same day): the store's data so far stays on dev, which becomes the test copy,
and nothing is restored into prod. Localhost always uses dev; only the Pages
site moves to prod.
The generator and its rehearsal were last run at 0065 (92 functions, 4,281
lines; nine of nine the same); dev has 107 functions now, so section 1 runs
them again.

---

## 0. The shape of it

Dev has 75 migrations (0001–0075), 17,455 lines, many rewriting the same
function. Prod is empty and not live. The squash replaces the 75 files with
**one baseline file that builds the database as dev has it**, applies it to
prod, proves prod matches dev, and then tells dev's migration record that the
baseline is what it has. Nothing in the app changes. Dev's data is never
touched.

**N** is the last migration on dev when the squash starts (today 0075). The
baseline is always `0001_baseline.sql`, standing in for 0001–N; the first
migration after launch is 0002. The commands below use 0075 as N; substitute
if more migrations land first, and if they do, **start again from section 1**:
a baseline written before the last migration is wrong by definition.

**Reusing 0001.** The CLI tells migrations apart by their number only. Prod's
record gets 0001 and nothing else. Dev's record has the old 0001–N: section 9
marks them all reverted and 0001 applied again, now meaning the baseline. Two
files numbered 0001 must never sit in `supabase/migrations/` together, so the
baseline is written outside it (section 3) and copied in only after the old
files are archived (section 5).

### What's different from the spec's text (and why)

1. **`supabase db dump` doesn't run here.** It needs Docker (or Podman), and
   this machine has neither (`DockerRunError`, checked 2026-10-16). Spec steps
   3–4 ("dump, then add by hand what a dump leaves out") are replaced by
   **`scripts/db-baseline.mjs`**, which reads dev's catalog through
   `npx supabase db query --linked` (no Docker; the same path
   `scripts/db-test-run.mjs` uses) and writes the whole baseline, including
   the parts a dump leaves out: the extension, the `internal` schema, the
   storage bucket and its policies, Realtime, every grant entry by entry, and
   the starting rows. It refuses to run against anything but dev.
2. **A rehearsal before prod.** `node scripts/db-baseline.mjs --rehearse <file>`
   runs the written baseline **on dev, in one transaction that is rolled
   back**, with `public.`/`internal.` renamed to scratch schemas, then compares
   the scratch copy's structure fingerprints with dev's (the same formulas
   `db-test-run.sql` uses). It proves the file end to end — syntax, order,
   all 92 function signatures, 78 constraints, 16 indexes, the trigger, 17
   policies, every grant — without a prod attempt. Passed 2026-10-16 in under 4 s,
   nine of nine the same.
3. **Prod is inspected before it's touched** (section 6). The spec assumes
   prod has no tables; the step here checks, and says what to do if it has.
4. **Who types what.** `supabase link` asks for the database password, which
   Claude never handles: the owner runs every `link`. Claude runs the rest
   and shows the output.

Everything else follows the spec's ten steps in order.

---

## 1. Before anything: the freeze

Owner's go first ("Phase 10 launch … waits for the owner's go", CLAUDE.md).
Then, in the project folder, with dev linked:

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cat supabase/.temp/project-ref            # must print psucrzljraxeootwnltf (dev)
git status --short                        # must be empty: commit or stash first
npm test && npm run build                 # green
npx supabase migration list --linked      # every local file applied, nothing pending
node scripts/db-test-run.mjs              # "All passed: N checks"
```

**Gate:** all five clean. From here until section 9 is done, **no new
migration files, and no `db push` while dev is linked** (after section 5 a
push to dev would try the baseline against existing objects; it fails at the
first `create sequence`, inside its transaction, but there is no reason to
find out).

---

## 2. Safety copies (outside the repo)

Folder: `C:\ClaudeProjects\temp\pug-squash\` (never inside the project; the
spec's clean-up deletes it after launch).

```bash
git tag pre-squash                                   # the files, as they were
mkdir -p /c/ClaudeProjects/temp/pug-squash
node scripts/db-test-run.mjs --save /c/ClaudeProjects/temp/pug-squash/dev-run.json
```

- `pre-squash` tag: `git tag` lists it. Not pushed (nothing is pushed until launch).
- `dev-run.json`: every check passed; its `fingerprints` block is what prod is compared with in section 8. **Made after the freeze**: any later migration would change it.
- **Owner:** Settings → Backups → Download backup on the live site (dev), move the file into the same folder. Dev's data isn't touched by the squash, but this is the copy if something unrelated goes wrong the same day.
- There is no `dev-schema-before.sql` (that was the dump). The baseline itself, written in the next step from the same catalog, is the structure copy; keep a copy of it in the folder too.

**Gate:** tag exists, `dev-run.json` saved with all checks passing, backup file in the folder.

---

## 3. Write the baseline

```bash
cat supabase/.temp/project-ref                       # dev, still
node scripts/db-baseline.mjs /c/ClaudeProjects/temp/pug-squash/0001_baseline.sql
```

Written in the safety folder, not `supabase/migrations/`: the old
`0001_init.sql` is still there till section 5 (two 0001s in the folder would
confuse the CLI, and section 5's archive pattern would take the baseline
too). The generator reads the old files' numbers from `supabase/migrations/`
for its header ("standing in for 0001–0075"), so it must run before the
archive.

It prints the counts. On 2026-10-16: `17 tables, 184 columns, 1 sequence(s),
92 functions, 78 constraints, 16 indexes, 1 trigger(s), 21 policies, 8
realtime tables, 1 bucket(s)` — 4,281 lines. If a `Note:` lists objects with
default privileges, that is dev's state (none today after 0051) and the
baseline keeps it; mention it in the handoff.

**Read the file** before going on — the whole header, every section title,
and these parts in full (the ones a catalog read can't check for you):

| Section | Must show |
|---|---|
| header | "standing in for migrations 0001–0075"; "write migration 0002 and up" |
| Extensions | `create extension if not exists pg_trgm with schema extensions;` and nothing else (the other extensions on dev — pgcrypto, uuid-ossp, pg_stat_statements, supabase_vault — are Supabase's defaults; prod has them) |
| Schemas | `create schema if not exists internal;` |
| Sequences | `public.events_seq_seq` as bigint … start with 1; later `owned by public.events.seq` |
| Tables | 17 `create table` blocks, columns only — defaults come after the functions |
| Functions | `CREATE OR REPLACE FUNCTION …` ×92, `internal.remember_customer` first (the trigger's); every one with `SET search_path TO 'public', 'internal'` (five security-definer ones also `'pg_temp'`) |
| Indexes | `gin_trgm_ops` written `extensions.gin_trgm_ops` (3 indexes) |
| Triggers | `… ON public.buys FOR EACH ROW EXECUTE FUNCTION internal.remember_customer()` |
| Row security | `enable row level security` ×17; 17 policies, all `to authenticated`; `secrets` has none |
| Privileges | `revoke all on … from public, anon, authenticated, service_role;` then grants, per object; **no line touches `schema public`** (Supabase's; prod has the same) |
| Storage | the `master-inventory` bucket, `52428800` (50 MB, 0023), four `storage.objects` policies |
| Realtime | `alter table public.buy_lines replica identity full;` and `alter publication supabase_realtime add table` with 8 tables: api_usage, buy_lines, buys, collection_locks, events, master_inventory_files, settings, staff_users |
| Starting rows | `cash_pct` 33 / `credit_pct` 66 (0001's values, **not dev's 33.34/66.68** — the store sets its own); `select public.cant_upload_ensure();` |

Nothing in the file is edited by hand. If something is wrong, fix
`scripts/db-baseline.mjs` and run it again; the rehearsal will tell you.

**Gate:** counts as expected and the table above checked line by line.

---

## 4. Rehearse it on dev (rolled back)

```bash
node scripts/db-baseline.mjs --rehearse /c/ClaudeProjects/temp/pug-squash/0001_baseline.sql
```

What it does: one transaction on dev; `create schema scratch`; the baseline
with `public.`→`scratch.` and `internal.`→`scratch_internal.`, minus the
storage, publication and starting-row statements (they'd collide with dev's
own); then nine fingerprints of the scratch copy against dev's, schema names
evened out; then `rollback`. Dev's own objects are never touched; the
transaction holds no locks on them.

Expected, exactly:

```
The whole baseline ran on dev in scratch schemas and was rolled back (about 4s). Its structure against dev's:
  ✓ same  Server functions
  ✓ same  Tables and columns
  ✓ same  Constraints
  ✓ same  Indexes
  ✓ same  Row security policies
  ✓ same  Triggers
  ✓ same  Privileges
  ✓ same  Row security on
  ✓ same  Comments

Rehearsal passed.
```

A `✗ different` prints the lines only one side has (`+` the baseline's copy,
`-` dev). Fix the generator, rewrite (section 3), rehearse again. A refusal
from the database (`The database refused a query: …`) names the failing
statement; same remedy.

What the rehearsal can't prove, and section 8 does: the storage bucket and
policies, the publication, the starting rows, and the default-privilege
starting point on prod (`public` functions on prod start with execute for
anon/authenticated/service_role from Supabase's default ACL; the baseline's
`revoke all … ; grant …` lands them on the same text as dev regardless of
where they start — reasoned, and checked by the Privileges fingerprint in
section 8).

**Gate:** "Rehearsal passed." Keep the output for the handoff.

---

## 5. Archive the old files

```bash
mkdir -p supabase/migrations-archive
git mv supabase/migrations/00{01..75}_*.sql supabase/migrations-archive/
ls supabase/migrations            # empty
ls supabase/migrations-archive | wc -l    # 75
cp /c/ClaudeProjects/temp/pug-squash/0001_baseline.sql supabase/migrations/
ls supabase/migrations            # exactly one file: 0001_baseline.sql
```

Write `supabase/migrations-archive/README.md`:

```markdown
# Archived migrations 0001–0075

History only: how the dev database was built between 2026-09-28 and the
squash (DESIGN_SPEC decisions 192, 332). `supabase/migrations/0001_baseline.sql`
replaced them; it reuses the number 0001, so "migration 0068" in older notes
means the file here. The CLI does not read this folder. Never edit or run
these; to change the database, write migration 0002 and up.
```

**Gate:** `supabase/migrations/` holds only the baseline. **From here to the
end of section 9 do not run `db push` with dev linked.**

---

## 6. Look at prod before touching it

**Owner:** in a terminal in the project folder,
`npx supabase link --project-ref zvxquzcfffmxwizonxuo` (it asks for prod's
database password). Then Claude:

```bash
cat supabase/.temp/project-ref            # must print zvxquzcfffmxwizonxuo (prod)
npx supabase migration list --linked      # what prod thinks it has
```

And this probe (read-only), saved as `/c/ClaudeProjects/temp/pug-squash/probe.sql`
and run with `npx supabase db query --linked -f …`:

```sql
select jsonb_build_object(
  'version', version(),
  'tables', (select count(*) from pg_tables where schemaname in ('public', 'internal')),
  'functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'internal')),
  'internal_schema', exists (select 1 from pg_namespace where nspname = 'internal'),
  'migrations', (select coalesce(jsonb_agg(version order by version), '[]') from supabase_migrations.schema_migrations),
  'buckets', (select coalesce(jsonb_agg(id), '[]') from storage.buckets),
  'storage_policies', (select count(*) from pg_policies where schemaname = 'storage'),
  'publication', (select coalesce(jsonb_agg(tablename), '[]') from pg_publication_tables where pubname = 'supabase_realtime'),
  'extensions', (select jsonb_agg(extname order by extname) from pg_extension),
  'auth_users', (select count(*) from auth.users)
) as prod;
```

Read the answer against this:

| Field | Expected on an untouched prod | If not |
|---|---|---|
| `version` | `PostgreSQL 17.x` (dev is 17.6; `config.toml` says 17) | A different major version: **stop**, tell the owner; the baseline was written from 17 |
| `tables`, `functions` | `0`, `0` | Old objects from an early push: see "Prod isn't empty" below |
| `internal_schema` | `false` | same |
| `migrations` | `[]` | Old versions recorded: same |
| `buckets`, `storage_policies` | `[]`, `0` | same |
| `publication` | `[]` | same |
| `extensions` | Supabase's defaults; `pg_trgm` may or may not be there (the baseline's `if not exists` is fine either way) | — |
| `auth_users` | `1` (the store account, SETUP.md) | `0`: the owner creates it in the dashboard before launch (not part of the squash); the baseline doesn't need it |

**Prod isn't empty** (it had an early push, or a previous attempt at this
squash): the owner decides, then one of:

- `npx supabase db reset --linked` — "Resets the linked project with local
  migrations": it empties prod and applies what's in `supabase/migrations/`
  (now just the baseline) in one go. **Only with prod linked** — check
  `project-ref` first; this command has no guard of its own. If it turns out
  to need Docker like `dump` does, fall back to the next bullet.
- A clean-out by hand, as one transaction via `db query`, in this order:
  `drop schema internal cascade;` · `drop table public.<each table> cascade;`
  (list them from `pg_tables`) · `drop function` each remaining function in
  `public` (list from `pg_proc`) · `drop policy` each storage policy ·
  `delete from storage.buckets where id = 'master-inventory';` ·
  `alter publication supabase_realtime drop table …` for each table it lists ·
  `delete from supabase_migrations.schema_migrations;`. Never `drop schema
  public`: it's Supabase's. Run the probe again: all zeros.

Prod has **data** (buys, staff users): **stop.** Someone used it. The owner
decides whether it's disposable before anything is dropped.

**Gate:** the probe reads as "untouched" (or was made so), `migration list`
shows nothing on the remote side, and the local side lists only `0001`.

---

## 7. Apply the baseline to prod

```bash
cat supabase/.temp/project-ref                    # prod
npx supabase db push --dry-run --linked           # must list only 0001_baseline.sql
npx supabase db push --linked --yes
npx supabase migration list --linked              # 0001 on both sides, nothing else
```

`db push` runs the file in one transaction: it either all lands or none of
it does. A failure prints the statement; fix the generator (never the .sql by
hand), rewrite, rehearse, and because the transaction rolled back, push again
without a reset. (If the push *did* land and something is still wrong, section
8 finds it and section 6's reset path empties prod for another go.)

**Gate:** push succeeded; the list shows 0001 and nothing else.

---

## 8. Prove prod matches dev

```bash
cat supabase/.temp/project-ref                    # prod
node scripts/db-test-run.mjs --confirm zvxquzcfffmxwizonxuo --compare /c/ClaudeProjects/temp/pug-squash/dev-run.json
```

Expected: every section's checks `✓` (the same count as dev's run), "Nothing
the test made was kept", and under "Compared with psucrzljraxeootwnltf":
**every fingerprint `✓ same`** — Server functions, Tables and columns,
Constraints, Indexes, Row security policies, Triggers, Privileges, Live
updates (8 tables), All of the above.

Then the probe from section 6 again, plus the starting rows:

```sql
select (select jsonb_object_agg(key, value) from public.settings) as settings,       -- {"cash_pct": 33, "credit_pct": 66}
       (select count(*) from public.buys where system_key = 'cant_upload') as cant_upload,  -- 1
       (select file_size_limit from storage.buckets where id = 'master-inventory') as bucket, -- 52428800
       (select count(*) from pg_policies where schemaname = 'storage') as storage_policies,  -- 4
       (select jsonb_agg(tablename order by tablename) from pg_publication_tables where pubname = 'supabase_realtime') as realtime, -- the 8
       exists (select 1 from pg_extension where extname = 'pg_trgm') as trgm;                -- true
```

**If a fingerprint differs:** the runner prints which. The usual suspects, in
order: Privileges (a grant on prod that dev lacks or the reverse — compare
`proacl`/`relacl` for the object with a query on each side), Live updates (a
table missing from the publication), Tables and columns (a column default
rendered differently). Fix `scripts/db-baseline.mjs`, rewrite, rehearse
(section 4), empty prod (section 6's reset path), push (section 7), prove
again. **Never patch prod by hand to make it match**: the baseline is what
every future prod comes from.

**Gate:** all checks pass, all fingerprints same, the hand checks read as
listed. Save the run: add `--save /c/ClaudeProjects/temp/pug-squash/prod-run.json`.

---

## 9. Switch dev's record over

**Owner:** `npx supabase link --project-ref psucrzljraxeootwnltf` (dev's
password). Then Claude:

```bash
cat supabase/.temp/project-ref                    # dev
npx supabase migration list --linked              # remote: 0001–0075; local: 0001 only
npx supabase migration repair --linked --status reverted $(printf '%04d ' $(seq 1 75))
npx supabase migration repair --linked --status applied 0001
npx supabase migration list --linked              # 0001 on both sides, nothing else
npx supabase db push --dry-run --linked           # nothing to push
node scripts/db-test-run.mjs --compare /c/ClaudeProjects/temp/pug-squash/dev-run.json
```

`migration repair` edits only `supabase_migrations.schema_migrations` (the
record of what was applied); dev's tables, functions and data don't change,
and the last command proves it: every check passes and every fingerprint
reads `✓ same` against the run saved in section 2.

All 75 reverted first, then 0001 applied: in that order, so 0001 ends up
applied (the first command takes it off with the rest).

**Gate:** list shows 0001 only; dry run has nothing to push; test run same.

**If the repair went wrong** (a version missed, the wrong status): repair is
idempotent — run the two commands again. Worst case, `--status applied` for
0001–0075 returns the record to where section 1 found it (0001 is in both
lists, so nothing to revert), and `git checkout pre-squash -- supabase/migrations`
returns the files.

---

## 10. Commit, then the rest of launch

```bash
git add supabase/migrations supabase/migrations-archive SQUASH.md
git commit   # "Migration squash: 0001–0075 → 0001_baseline.sql (decisions 192, 332)"
```

One commit, with the baseline, the moves, the archive README, and a line in
`docs/DESIGN_SPEC.md` decision 192 noting the date and that steps 3–4 were
done with `scripts/db-baseline.mjs` and its rehearsal (Docker wasn't
available). Not pushed: pushing deploys.

Then the launch steps outside the squash (spec, Phase 10 → Launch):

- **Edge Functions on prod:** `npx supabase functions deploy prices --project-ref zvxquzcfffmxwizonxuo`
  and the same for `secrets`. They read only `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEYS`, which Supabase
  provides; nothing to set. The JustTCG key goes in through Settings → API
  keys on the live site, by the owner. `api_usage` gets its row at the first
  price lookup; the Settings meter says "No usage recorded yet" until then.
- **Auth:** the store account exists on prod (section 6's probe, `auth_users: 1`);
  public sign-ups off (SETUP.md).
- **GitHub Actions variables** back to the `.env.production` values; push on the
  owner's go; confirm the Pages run; sign in on the live site and see prod
  (empty tables, no backup banner history — "No backup has been downloaded
  yet" is right).
- **Owner tasks** from the spec: name the computer, add users, enter the
  JustTCG key, upload the CC CSV, set Cash/Credit % (prod starts at 33/66).
- **Clean-up last**, with the owner's approval, including
  `C:\ClaudeProjects\temp\pug-squash\` once prod has run for a while.

---

## 11. After the squash: how migrations work from now on

- Files are numbered from **0002**. One behaviour per file (FABLE.md): one
  function per file unless two must change together, as 0066's thirteen
  event writers did for one wording rule. The header comment names the
  decision and the *lines* that changed ("export_lines: the `where` gains
  `and l.struck_at is null`").
- Write a migration as a patch of `supabase/current/<schema>.<fn>.sql`
  (the live body, refreshed by `db-snapshot.mjs`): a script that replaces
  exact text, asserts each replacement matches once, and writes the
  migration file. 0066's generator is the model. Never hand-copy a body
  from an older migration.
- Every migration: rehearse `(echo "begin;"; cat f; echo "rollback;")` on
  dev → `db push` to dev → `node scripts/db-snapshot.mjs` (commit
  `supabase/current/` with the migration) → `node scripts/db-test-run.mjs
  --save <fresh dev run>` → (owner links prod) `db push` to prod →
  `node scripts/db-test-run.mjs --confirm zvxquzcfffmxwizonxuo --compare
  <that run>` when the store isn't using the app → (owner links dev again).
- **The first one, 0002, locks the Changelog to the database** (section 11a).
- `scripts/db-baseline.mjs` is **not run again** for prod: the baseline is
  history once applied. It stays useful two ways: `--rehearse` on a
  freshly written file is a free full-structure comparison between "what a
  file builds" and "what dev has", and `scripts/lib/linked.mjs` is the query
  helper it shares with `db-snapshot.mjs`.
- `scripts/db-test-run.*` stays, as the spec says; its fingerprints are the
  dev–prod contract.

---

## 11a. 0002: the Changelog written only by the database

*(Moved here from FABLE_REPORT.md item A2 when that report was retired,
2026-10-16; DESIGN_SPEC decision 274.)*

**Where it stands.** Step 1 is done: migration 0064 added
`public.collection_log_call` (a collection's "Called") and
`public.buy_log_cash_download` (the Cash buys file), and the app since then
calls them, so the browser no longer writes Changelog entries itself. The
live site keeps inserting into `events` directly until the app is pushed,
so the store's role keeps that right until then.

**Why step 2 isn't one line.** The event writers are security invoker:
every entry the database writes is inserted *as the signed-in role*
(`authenticated`), through the `insert` grant (`0002_rls.sql:56`) and the
policy `"store: append"` (`0002_rls.sql:61`). Revoking those alone would
stop every entry, not just the browser's. On dev at 0075 these functions
insert into `events` themselves: `internal.buy_event`,
`internal.collection_event`, `public.buy_log_cash_download`,
`public.confirm_buy`, `public.project_to_buy`, `public.day_complete`,
`public.export_lines`, `public.export_undo_day` (and `public.restore_backup`,
already security definer). Check again with
`grep -l "insert into events" supabase/current/*.sql` before writing it.

**The migration, one file, in this order:**
1. One `security definer` writer does the insert, `set search_path = public,
   internal, pg_temp`, revoked from `public, anon` like every internal
   helper. Either make `internal.buy_event` / `internal.collection_event`
   definers and route the six direct inserts through a small definer
   (`internal.insert_event`, say), or make each inserting function a
   definer. The first keeps the definer list short; pick it unless a body
   makes it awkward.
2. Then `revoke insert on events from authenticated`, `drop policy
   "store: append" on events`, and revoke `usage` on `events_seq_seq`
   (`0002_rls.sql:57`), which only inserts need. `select` and the policy
   "store: read" stay: the Changelog page reads it.

**When.** Only after the pushed app is live (the site before that inserts
directly), and after the squash, so it's 0002. The owner decides the day.

**Verify** in `scripts/db-test-run.sql`:
- Update the check "Only the expected functions run with the owner's
  rights" (its list of definer functions) to the new list.
- Add: signed in, a direct `insert into events` is refused (`42501`).
- The existing checks that every action logs its entry keep passing:
  Called, the Cash buys download, confirm, convert, COMPLETE, export and
  undo, plus every buy and collection action.
- In the app: a collection's Called and the Cash buys download still show
  in the Changelog.

---

## 12. Rollback matrix

| You're at | Something's wrong | Do |
|---|---|---|
| 3–4 (baseline written / rehearsing) | generator output wrong | fix `db-baseline.mjs`, rewrite, rehearse; nothing has been applied anywhere |
| 5 (archived) | want to abandon | `git checkout pre-squash -- supabase/migrations && rm -rf supabase/migrations-archive` (or `git reset --hard pre-squash` if nothing else changed) |
| 7 (push to prod failed) | transaction rolled back | fix, rewrite, rehearse, push again; no reset needed |
| 8 (prod differs) | baseline incomplete | fix generator → rewrite → rehearse → empty prod (6) → push (7) → prove (8) |
| 9 (dev record wrong) | repair missed/duplicated | re-run the two `repair` commands; they're idempotent |
| any | dev's data | untouched by every step here; the backup from section 2 exists anyway |
| any | wrong project linked | `cat supabase/.temp/project-ref` before every `--linked`; `db-baseline.mjs` refuses non-dev, `db-test-run.mjs` refuses non-dev without `--confirm`; `db push`, `db reset` and `migration repair` have **no guard** — the `cat` is the guard |

---

## 13. Gotchas, each one found the hard way or by reading

- **Docker.** `db dump` (and probably `db reset --linked`) wants it. The
  generator and the test runner don't. If the owner installs Docker Desktop
  later, `npx supabase db dump --linked -f …` becomes a second, independent
  copy of the structure worth keeping — but the baseline still comes from
  the generator, which the rehearsal proves.
- **One transaction per `db query` only with `begin`/`rollback` written in
  the file.** The Management API doesn't wrap for you; the rehearsal and
  the test run both write them explicitly.
- **`set check_function_bodies = off;`** heads the baseline, as pg_dump's
  output does, so function order doesn't matter (92 functions referencing
  each other and tables). Row-typed signatures (`internal.same_line(a
  buy_lines, b buy_lines)`, `internal.buy_event(b buys, …)`) still need the
  tables first — that's why tables come before functions, and column
  defaults, constraints, indexes and triggers after.
- **Unqualified names in catalog output.** `pg_get_triggerdef` prints `ON
  buys` and `pg_indexes` prints `gin_trgm_ops` when their schemas are on
  the search path. The generator qualifies both (`public.buys`,
  `extensions.gin_trgm_ops`); `db push` would probably have resolved them
  anyway, but "probably" isn't a baseline.
- **Privileges are text, compared as text.** The fingerprint hashes
  `proacl`/`relacl` strings, whose entry order follows grant order. The
  generator emits `revoke all … from public, anon, authenticated,
  service_role` and then each grant **in the order dev's ACL lists them**, so
  the strings match. `schema public` is left alone: it belongs to Supabase,
  prod has the same, and revoking on it as `postgres` may not even be allowed.
- **Starting rows are seeds, not dev's data.** 33/66 from 0001, the Can't
  upload cards collection from 0028. Dev's `last_backup_at`, its 33.34/66.68,
  its customers and products are not copied; prod starts clean.
- **`internal.customer_key` / `customer_name` / `import_lines`** were open to
  PUBLIC until 0051. The generator writes dev's *current* ACL, so the fix is
  in the baseline. (The test run's Security section checks it on prod.)
- **A return-type change needs a `drop function` first** in any later
  migration (Postgres refuses `create or replace` with a different `RETURNS
  TABLE`); and a drop loses the grants — re-grant to `authenticated`. Not a
  squash problem, but 0063 (`global_search` gaining `bulk_kind`) did exactly
  this; copy its pattern.
- **The baseline is never edited by hand.** If it needs to change, the
  generator changes and the file is rewritten and rehearsed. After it's on
  prod and dev's record is repaired, it is never rewritten at all.
- **Tags aren't pushed** until the owner says push; `pre-squash` stays local
  with everything else.
