# PUG Pricing Tool: the database

How a migration goes from a file to dev and then prod, and what to know about the two projects. The rules
themselves stay in CLAUDE.md's Database section (decisions 380 and 381: prod holds the store's data and nothing
else; dev and prod stay on the same migrations at all times). Read this before any migration work (decision 543).

## The two projects

- **Dev** is `psucrzljraxeootwnltf`: localhost and the phone scanner's LAN link (`.env.development`), with the
  store's data from before launch as the test copy. The database test run, the smoke test, scans, imports and every
  other try-out run here only.
- **Prod** is `zvxquzcfffmxwizonxuo`, the live site's project since v1.0.0-launch (2026-10-19); the GitHub Actions
  variables point there. The only checks on prod are read-only: `migration list`,
  `node scripts/db-test-run.mjs --structure-only` (the fingerprints; nothing run or written) and the live check.
  Whatever must be checked on prod is checked by looking, never by making something there.
- **The CLI stays linked to dev** (`supabase/.temp/project-ref`). Anything aimed at prod names it:
  `--linked --project-ref zvxquzcfffmxwizonxuo` for `migration list`, `db push` and `db query` (the flag overrides
  the link for that one command; the function deploys take `--project-ref` alone); no password was asked for it
  (decision 377). `db push` and `--project-ref` have no guard: the ref typed in the command is the check, so read it
  before pressing Enter.

## A migration, step by step

Changes are new migration files (0002 and up), numbered after the last file in `supabase/migrations/` and committed
at once to claim the number (decision 529). The migrations written for one piece of work go through the steps
together: one review of all of them, one rehearsal in order, applied in order, one snapshot, one test run (owner,
2026-10-19). A batch isn't done until it's on both projects, in one sitting (decision 381); app code that needs a
migration isn't pushed before prod has it.

1. **Review before applying.** Prod is the live store, so a migration applied there changes it at once; dev, where
   it's applied first, is the test copy. Hand the file, with its app code and test-run checks, to the
   **pug-reviewer** agent. A confirmed finding that would break the site or its data: fix it first (the owner's call
   if unsure); report the rest with the handoff.
2. **Rehearse** inside `begin; … rollback;` (`npx supabase db query --linked -f`). A rollback doesn't undo a
   counter: `setval` and `nextval` on a sequence stay changed on the live store. Rehearse a copy with those lines
   taken out, and check the counter (`select last_value, is_called from buys_number_seq`) before and after.
3. `npx supabase db push --linked`.
4. `node scripts/db-snapshot.mjs`; commit `supabase/current/` with it.
5. `node scripts/db-test-run.mjs --save <a fresh dev run, outside the repo>`: "All passed".
6. **Prod, the same sitting.** The prod push has the owner's standing go; the one thing to pick is the moment (the
   store not using the app; see the prod-push-hours memory note). `npx supabase db push --linked --project-ref
   zvxquzcfffmxwizonxuo`, then `node scripts/db-test-run.mjs --structure-only --project-ref zvxquzcfffmxwizonxuo
   --confirm zvxquzcfffmxwizonxuo --compare <that dev run>`: every fingerprint the same. The CLI stays linked to dev.

No session ends with dev ahead of prod: if prod can't take it, the handoff's first line and NEXT.md's first Open
item say so. A migration on dev only may be amended in place rather than given a new number; never once prod has it
(decision 450). To amend: apply the changed functions or data lines to dev by hand from the file, so dev matches
what prod will get; have pug-reviewer review the change; run the full test run; say in the handoff that the
migration changed after dev had it.

## The `internal` schema

Helpers only the database's own functions call live in `internal` (migration 0040), which the API doesn't serve. A
function that calls one must `set search_path = public, internal` (security-definer: `public, internal, pg_temp`);
a plain `= public` can't find them.

## Gotchas

- A function whose `returns table` changes needs `drop function` first, and a drop loses its grants, so grant it to
  `authenticated` again (0063's pattern).
- `db query` runs one transaction only when the file itself has `begin;` and `rollback;`.

## The squash

Done on 2026-10-19 (decision 332): `0001_baseline.sql` stands in for the old 0001–0084 (now in
`supabase/migrations-archive/`), 0002 is the Changelog lock, prod started empty, localhost always uses dev. The
runbook is retired: `git show 681c5c6:SQUASH.md`; the baseline generator, `git show a8fb952:scripts/db-baseline.mjs`.
What each later migration did is in the spec's decisions and the files' names.
