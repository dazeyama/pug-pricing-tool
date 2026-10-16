# supabase/current/

Generated: every database function (schemas `public` and `internal`) as dev has it now, one file each, with who may run it. Never edit these by hand.

- After every `npx supabase db push`, run `node scripts/db-snapshot.mjs` and commit this folder with the migration. `git diff supabase/current/` then shows exactly what the migration changed.
- To change a function, start the new migration from its file here, not from an old migration.
- The migrations in `supabase/migrations/` are still what builds the database; this folder is for reading.
