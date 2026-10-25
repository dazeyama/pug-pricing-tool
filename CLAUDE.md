# PUG Pricing Tool — rules for Claude Code

## Start of a session

Read, in this order: **NEXT.md** (repo root), then tell me what's open; **FABLE.md** (how to scope, gather
evidence, plan for what breaks and verify here); then the sections of **docs/DESIGN_SPEC.md** the task touches.

**A new session only:** run `node scripts/code-map.mjs` and read **CODE_MAP.md**, the whole of it, in two reads (the spec's
sections and every decision's title, each file's header and exports, the database, the docs). It's built fresh
each time and git ignores it. Then read `.claude/skills/release/SKILL.md` and `.claude/agents/pug-reviewer.md`
(about 3.5k together, recommended), so every fork knows the push and review steps. **A fork skips this:** when
this conversation already holds CODE_MAP.md's text from the session it was forked from, use that, and look up only
the files added since.

### The main session and its four forks

The main session starts only when I run `/main` (`.claude/skills/main/SKILL.md`: the four area forks, their briefs,
the hub's jobs). Any other session is a side session, and neither it nor a fork starts sessions (decision 527).

### Working beside the other sessions

The main session and the four forks share this folder and `main`: no branches, so what one writes the others see at
once, and what one leaves half-done is in the others' checks.

- **Decision numbers collide.** Every fork inherited the same "next number", so it's always out of date. Right before
  writing a decision row, read the highest number on disk (`grep -oE '^\| [0-9]+ \|' docs/DESIGN_SPEC.md | tr -dc
  '0-9\n' | sort -n | tail -1`), never CODE_MAP's, memory's or this conversation's, take the next one, and commit
  the row with its change straight away. A code comment cites the number the row ended up with.
- **Migration numbers collide too.** Right before writing a migration, take the next number after the last file in
  `supabase/migrations/` (`ls supabase/migrations | tail -1`), never Where it stands', NEXT.md's, memory's or this
  conversation's, and commit the file straight away (unapplied is fine) so the number is claimed (decision 529).
- **NEXT.md collides.** Another session may have changed it since you read it: re-read the part you'll touch, change
  only your own entries with small Edits (never a rewrite of the file), and name your session in each entry. The
  Unpushed line is the main session's.
- **TEST.md collides.** Re-read before editing; add your cases in your area's section; leave the case count in the
  header to the main session.
- **Commits:** stage and commit in one call (`git add <path>… && git commit …`), by path, never `-A`, `.`, `-u` or
  `commit -a`: the sessions share one index, so files left staged go out in whichever session commits next, and a
  sweep takes another session's edits. Never `--amend`: the last commit may be another session's. A shared doc may
  also hold another session's edit; committing it with yours is fine, said in the handoff.
- **Never stash, reset, `checkout --`, `restore` or `clean`** (decision 532). The uncommitted edits in the folder may
  be another session's half-done change, and those commands throw them away with no trace. To drop an edit of your
  own, undo it with Edit; to see a file as committed, `git show HEAD:<path>`.
- **Checks run on the whole folder.** When lint, a test or the build fails, look at which file first: another
  session's half-done work isn't yours to fix; say so.
- **After a compaction** (decision 535), before the next edit, re-read NEXT.md's entries for your area and the
  `/main` skill's area table: the summary keeps the gist of your work, not the exact state, and both are on disk.
- **Only the main session pushes**, and only when I ask: a fork never runs the release skill. A push sends every
  session's commits, so before it goes the main session gives the QA table of everything since the last push (the
  `/main` skill, decision 530).

### Outside your area

- **Just do it, and name it in the handoff:** small changes your own task needs in someone else's files: a caller of
  something you changed, a shared helper or component, `src/state/`, a migration your feature needs, the shared docs.
  First `git status --short <path>` (decision 534): a file already modified that you didn't touch is another session
  mid-edit, so message that session (or the main session if you don't know whose it is) before you edit it, and
  wait; the shared docs are the exception, where the small-Edits rule above already covers it.
- **Ask me first:** changing how another area behaves (what staff see or what gets exported there), or a large edit
  to another area's main file (`PricingScreen.jsx`, `DayPage.jsx`, `ExportDialog.jsx`, `Scanner.jsx`): another
  session may be mid-edit in it.

### Messages

Sessions message each other with `SendMessage` (the session's `local_…` id). Short and to the point, one message
per thing, and never a progress report: the main session already gets a note each time a fork ends a turn. Look
before asking: what another session did is in `git log`, NEXT.md and the files.

- **A fork messages the main session** when it's blocked on something another area or I must answer, when its
  change touches another area's files or behaviour (a heads-up, so the main session can pass it on), or when it
  finished something another area is waiting on.
- **The main session messages a fork** to pass on a task from me, quoting my words (it counts as mine), or to pass
  on another session's change that affects that fork's work.
- **Forks message each other directly** only about a file they're both changing right now; anything else goes
  through the main session.
- A fork still asks me before anything outward-facing: a push, a prod migration, deleting data.
- **Memory notes are the main session's** (decision 517): the sessions share one memory folder, so a fork writes
  none; it messages the main session a rule worth remembering, and a rule the main session passes on is already
  saved.

## NEXT.md

After each task I give you, mark it done in NEXT.md and list anything pending or half-finished with the exact file
and function involved. The Done entry is the handoff's record (decision 533): the main session can't read a fork's
chat (its note of a turn is a few hundred characters), so the entry also carries where to look (the tab, the button
or entry, what should happen), what's untested, and the migration's number if there is one; the QA table (decision
530) is built from these.

## QA Handoff

Do NOT run smoke tests, browser tests, or ad-hoc verification after a change unless I explicitly ask for a test.
Hand code off untested so I can QA it myself. The checks before each commit still run every time: lint, the unit
tests (`npm test`, commit only on `fail 0`) and the build.

- End each handoff with where to look: the tab, the button or entry, and what should happen. Say plainly when
  something is untested rather than implying it's proven.
- The one browser use allowed without asking: measuring a live element when I ask for a size, height or
  alignment change (UI Sizing & Layout below).
- Testing is dev only: nothing is ever tried out on the live site or its database, prod (owner, 2026-10-19;
  Database below).

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

- **Prod holds the store's data and nothing else, ever** (owner, 2026-10-19; decision 380). No test rows, test
  users, test files or test scans on prod, and no counter moved by a test. The database test run, the smoke test,
  scans, imports and every other try-out run on dev (localhost) only. On prod the only checks are read-only:
  `migration list`, `node scripts/db-test-run.mjs --structure-only` (the fingerprints, nothing run or written) and
  the live check. Whatever must be checked on prod is checked by looking, never by making something there.
- **Dev and prod stay on the same migrations at all times** (owner, 2026-10-19; decision 381). A migration batch
  isn't done until it's on both, in one sitting: the steps below on dev, then the prod push and the structure-only
  comparison (step 6). That prod push has my standing go; the one thing to pick is the moment (the store not using
  the app). No session ends with dev ahead of prod: if prod can't take it, the handoff's first line and NEXT.md's
  first Open item say so.
- Database changes are new migration files (0002 and up), applied to the dev project (`psucrzljraxeootwnltf`)
  first and to prod (`zvxquzcfffmxwizonxuo`, the live site's project since v1.0.0-launch) in the same sitting.
  App code that needs a migration isn't pushed before prod has it.
- Each migration, in order. The migrations written for one piece of work (a batch of review findings, say) go
  through these steps together: one review of all of them, one rehearsal of them in order, then applied in order,
  one snapshot and one test run (owner, 2026-10-19).
  1. **Review it before it's applied.** Prod is the live store, so a migration applied there changes it at once;
     dev, where it's applied first, is the test copy. Hand the new migration file, with the app code and test-run checks that go with it, to the
     **pug-reviewer** agent. A confirmed finding that would break the site or its data: fix it first (it's my call
     if unsure). Report the rest with the handoff.
  2. Rehearse it inside `begin; … rollback;` (`npx supabase db query --linked -f`). A rollback doesn't undo a
     counter: `setval` and `nextval` on a sequence stay changed on the live store. Rehearse a copy with those lines
     taken out, and check the counter (`select last_value, is_called from buys_number_seq`) before and after.
  3. `npx supabase db push --linked`.
  4. `node scripts/db-snapshot.mjs` (commit `supabase/current/` with it).
  5. `node scripts/db-test-run.mjs --save <a fresh dev run, outside the repo>` ("All passed").
  6. Prod, the same sitting (decision 381): `npx supabase db push --linked --project-ref zvxquzcfffmxwizonxuo`,
     then `node scripts/db-test-run.mjs --structure-only --project-ref zvxquzcfffmxwizonxuo --confirm
     zvxquzcfffmxwizonxuo --compare <that dev run>`: every fingerprint the same. The CLI stays linked to dev.
- Helpers only the database's own functions call live in the `internal` schema (migration 0040), which the API
  doesn't serve. A function that calls one must `set search_path = public, internal` (security-definer:
  `public, internal, pg_temp`); a plain `= public` can't find them.
- The squash (decision 332) is done: the baseline is `0001_baseline.sql` and the Changelog lock is migration 0002;
  prod started empty; localhost always uses dev. Its runbook is retired (`git show 681c5c6:SQUASH.md`).
- Gotchas: a function whose `returns table` changes needs `drop function` first, and a drop loses its grants, so
  grant it to `authenticated` again (0063's pattern). `db query` runs one transaction only when the file itself
  has `begin;` and `rollback;`. `db push` and `--project-ref` have no guard: the ref typed in the command is the
  check, so read it before pressing Enter.

## Where things are

- `docs/SCAN_LEARNINGS.md`: what the first attempt at auto scanning taught us (rolled back 2026-10-16).
- `docs/TEST.md`: the smoke test, one pass, tab by tab; a pass reports its findings when it ends.
- `docs/SETUP.md`: running, deploying, and the phone scanner's LAN link.
- `.claude/agents/pug-reviewer.md`: the standard review. When I ask for a review, hand it to this agent (read-only;
  it reports, it doesn't fix) and relay its findings.
- `.claude/skills/release/SKILL.md`: the push, with or without a version bump.
- Retired docs (the export and scanner specs, the completion map, the Pokémon price audit, smoke test results, the
  team feedback plan, the squash runbook, the matching audit) and the squash's baseline generator: the "Retired
  documents" row at the top of `docs/DESIGN_SPEC.md`. Code comments citing them mean those copies: `git show
  d158ee3:<path>` for the first five, `git show 681c5c6:<path>` for the next three, `git show
  a8fb952:scripts/db-baseline.mjs` for the generator.

## Where it stands (2026-10-25)

- Live: **v1.0.5-rainbow** (2026-10-25, decisions through 526), on **prod** (`zvxquzcfffmxwizonxuo`, the live
  site's project since v1.0.0-launch, 2026-10-19): the GitHub
  Actions variables point there. Localhost and the phone scanner's LAN link stay on dev (`.env.development`), which
  keeps the store's data from before launch as the test copy.
- The migrations were squashed on 2026-10-19: the baseline `0001` stands in for the old 0001–0084 (now in
  `supabase/migrations-archive/`). Prod and dev both have 0001–0013 (0002 the Changelog lock, 0003 the counter
  grant, 2026-10-19; 0004 the review leftovers, 2026-10-20; 0005 pulled bulk, 0006 settings logged and 0007 the
  inventory cleared in batches, on prod 2026-10-21; 0008 owned copies and Bulk pulled from exports there from the
  start, decisions 448–449, 0009 the rounding steps, 478, and 0010 staff picks only remembered, 486, on prod
  2026-10-23; 0011 the collection SKU numbers, 511, 0012 projects that skip pricing, 513, and 0013
  `master_inventory_abort` retired, 515, on prod 2026-10-24, the structure-only compare the same). They stay equal
  (decision 381). The next migration is 0014.
- The CLI stays linked to dev (`supabase/.temp/project-ref`). Anything aimed at prod names it:
  `--linked --project-ref zvxquzcfffmxwizonxuo` for `migration list`, `db push` and `db query` (the flag overrides
  the link for that one command; the function deploys take `--project-ref` alone); no password was asked for it
  (decision 377).
- The release history is the spec's decisions and `git tag`; what's open is NEXT.md.

## Coding Conventions

### Checks

`export PATH="/c/Program Files/nodejs:$PATH"`, then `npx eslint .`, `npm test` and `npm run build`. Edits made with
Write or Edit are also linted as they're saved, and the unit tests they can affect run (the hooks in
`.claude/settings.json`; a test failure there is a note, not a block, decision 528).

Three tries, then stop (decision 531): when lint, a test or the build still fails after three attempts at fixing it,
stop and tell me what's failing, in which file, and what you tried, instead of digging further. Look first at whose
file it is (Working beside the other sessions): another session's half-done work isn't a try of yours.

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
