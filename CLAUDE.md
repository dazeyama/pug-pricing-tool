# PUG Pricing Tool — rules for Claude Code

## Start of a session

Read, in this order: **NEXT.md** (repo root), then tell me what's open; **FABLE.md** (how to scope, gather
evidence, plan for what breaks and verify here); then the sections of **docs/DESIGN_SPEC.md** the task touches.

## NEXT.md

After each task I give you, mark it done in NEXT.md and list anything pending or half-finished with the exact file
and function involved.

## QA Handoff

Do NOT run smoke tests, browser tests, or ad-hoc verification after a change unless I explicitly ask for a test.
Hand code off untested so I can QA it myself. The checks before each commit still run every time: lint, the unit
tests (`npm test`, commit only on `fail 0`) and the build.

- End each handoff with where to look: the tab, the button or entry, and what should happen. Say plainly when
  something is untested rather than implying it's proven.
- The one browser use allowed without asking: measuring a live element when I ask for a size, height or
  alignment change (UI Sizing & Layout below).

## How we work

- **One small change at a time**, handed over, then the next. When a request implies several mechanisms, list them
  as separately shippable items and let me pick the order.
- The spec, `docs/DESIGN_SPEC.md`, is the source of truth. Record each decision I make as a numbered decision row.
- Don't add settings, features or dependencies beyond the spec without asking first. New settings ideas are
  welcome: propose them, don't just build them.
- Do ask about dependencies whenever one would help, rather than hand-rolling around it: stop, name the package,
  what it's for and whether it ships to the site. Dev-only tools (lint, test, build helpers) that never reach the
  site are usually a yes (owner, 2026-10-16).
- Commit when a fix or task is done. **NEVER push unless I explicitly ask**: pushing to main deploys the live site.
  The steps are the release skill, `.claude/skills/release/SKILL.md`.
- **Stay in this project.** Work only in `C:\ClaudeProjects\pug-pricing-tool`. Never create, edit or delete anything
  in another project, its config or its memory file; collection-manager and audit-tool are READ-ONLY references.
  If something elsewhere looks wrong, say so instead. Claude's own memory notes about this project are fine to keep
  up, wherever the session stores them; the release state itself lives in NEXT.md and Where it stands below.
- Scratch files go in the session's scratchpad or `C:\ClaudeProjects\temp`, never in the repo, and never in the
  `klug alters` folder a session may start in.

## Help and team write-ups

- `README.md` is the app's Help. Don't edit it with each change, only when I ask. For a large change (a new
  feature, a changed workflow, a renamed or removed button), end the report with a one-line flag naming the Help
  section that's now out of date.
- Anything my team reads (Help, one-pagers, release notes, version names, tag messages) never mentions the AI,
  model names or how it was made: no "Fable", "Claude", FABLE.md or "code review by". A tag like `v0.9.9.9-fable`
  is written "v0.9.9.9-refactor".
- A "1 pager" is one printed page: a one-line lead, emoji section headers, one-line bullets with bold lead-ins,
  about 25 lines.

## Secrets and accounts

- Never put API keys, the Supabase secret key (`sb_secret_…`), customer data or CSV files in the repo, code, docs
  or commit messages. Never commit "PUG Pricing Tool.txt" (contains a live key).
- The JustTCG key goes in only through Settings → API keys, by me. Never read my key file. Never type the store
  password: I sign in.

## Database

- Database changes are new migration files, applied to the dev project (`psucrzljraxeootwnltf`) only unless I say
  otherwise.
- Each migration, in order. The migrations written for one piece of work (a batch of review findings, say) go
  through these steps together: one review of all of them, one rehearsal of them in order, then applied in order,
  one snapshot and one test run (owner, 2026-10-19).
  1. **Review it before it's applied.** The live site runs on the dev database, so applying a migration changes the
     live store at once. Hand the new migration file, with the app code and test-run checks that go with it, to the
     **pug-reviewer** agent. A confirmed finding that would break the site or its data: fix it first (it's my call
     if unsure). Report the rest with the handoff.
  2. Rehearse it inside `begin; … rollback;` (`npx supabase db query --linked -f`). A rollback doesn't undo a
     counter: `setval` and `nextval` on a sequence stay changed on the live store. Rehearse a copy with those lines
     taken out, and check the counter (`select last_value, is_called from buys_number_seq`) before and after.
  3. `npx supabase db push --linked`.
  4. `node scripts/db-snapshot.mjs` (commit `supabase/current/` with it).
  5. `node scripts/db-test-run.mjs` ("All passed").
- Helpers only the database's own functions call live in the `internal` schema (migration 0040), which the API
  doesn't serve. A function that calls one must `set search_path = public, internal` (security-definer:
  `public, internal, pg_temp`); a plain `= public` can't find them.
- The squash and the move to prod: `SQUASH.md`. The baseline is `0001_baseline.sql` and the Changelog lock is
  migration 0002; prod starts empty; localhost always uses dev.

## Where things are

- `docs/TEAM_FEEDBACK.md`: the team feedback plan (printout, individual rates, bulk; phases T1–T3).
- `docs/SCAN_LEARNINGS.md`: what the first attempt at auto scanning taught us (rolled back 2026-10-16).
- `docs/TEST.md`: the smoke test, one pass, tab by tab; a pass reports its findings when it ends.
- `docs/SETUP.md`: running, deploying, and the phone scanner's LAN link.
- `.claude/agents/pug-reviewer.md`: the standard review. When I ask for a review, hand it to this agent (read-only;
  it reports, it doesn't fix) and relay its findings.
- `.claude/skills/release/SKILL.md`: the push, with or without a version bump.
- Retired docs (the export and scanner specs, the completion map, the Pokémon price audit, smoke test results): the
  "Retired documents" row at the top of `docs/DESIGN_SPEC.md`. Code comments citing them mean those copies,
  `git show d158ee3:<path>`.

## Where it stands (2026-10-19)

- Live: v0.9.9.15-review, then pushes without a bump, the last on 2026-10-19 (decisions through 373).
  The live site runs on the dev project until launch.
- Dev has migrations 0001–0084.
- Phase 10 launch (the squash, then prod) waits for my go.
- The release history is the spec's decisions and `git tag`; what's open is NEXT.md.

## Coding Conventions

### Checks

`export PATH="/c/Program Files/nodejs:$PATH"`, then `npx eslint .`, `npm test` and `npm run build`. Edits made with
Write or Edit are also linted as they're saved (the hook in `.claude/settings.json`).

### Writing Code Files

Never write Python, JS, or other source files through Bash heredocs or echo, and don't edit them in place with
`sed -i` either: the lint hook only sees Write and Edit. Always use the Write/Edit tools so backslashes, regexes,
and encodings are preserved. A patch script written with Write is fine for many-file changes; the full lint before
the commit covers what it changed.

## UI Work

### UI Sizing & Layout

When I ask for a size, height, or alignment change, measure the live element in the browser (getBoundingClientRect
via the browser tool) before picking a value. Don't guess from the CSS alone. Keep fixes minimal and don't change
unrelated separators, labels, or formatting in the same edit.
