# PUG Pricing Tool — rules for Claude Code

- The spec is docs/DESIGN_SPEC.md. Read the relevant sections before each task. Update it
  when the owner changes a decision.
- Work only in C:\ClaudeProjects\pug-pricing-tool. collection-manager and audit-tool are
  READ-ONLY references: never edit, move or commit anything in them.
- One phase at a time (spec Section 15). Don't start the next phase until the owner reports back.
- Don't add settings, features or dependencies beyond the spec without asking the owner
  first. New settings ideas are welcome: propose them, don't just build them.
- Commit when a phase or fix is done. NEVER push unless the owner explicitly asks. Pushing
  to main deploys the live site.
- Never put API keys, the Supabase secret key (sb_secret_…), customer data or CSV files in the repo,
  code, docs or commit messages. Never commit "PUG Pricing Tool.txt" (contains a live key).
- Database changes are new migration files; apply to the dev project only unless told otherwise.
- Helpers only the database's own functions call live in the `internal` schema (migration 0040), which
  the API doesn't serve. A function that calls one must `set search_path = public, internal`
  (security-definer: `public, internal, pg_temp`); a plain `= public` can't find them.
- The owner is QA — see memory `user-is-qa`.
- The export's spec is docs/EXPORT_FUNCTION.md.
- The team feedback plan (printout, individual rates, bulk; phases T1–T3) is docs/TEAM_FEEDBACK.md.
- Current phase: docs/TEAM_FEEDBACK.md Phases T1 (audit printout) and T2 (individual rates, migrations
  0055–0057) and T3 (bulk, migration 0058) are done, live as v0.9.9.7-feedback.
  Since then: struck cards (DESIGN_SPEC decision 267, migrations 0059–0060 on dev) and confirmed buys
  keeping their custom rates (decision 268, migration 0061), built, waiting for the owner's check; not pushed.
  Phase 10 launch (the migration squash, then prod) waits for the owner's go; the live site runs on the
  dev project until then. TEST.md holds the smoke tests and the database test run.
