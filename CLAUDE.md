# PUG Pricing Tool — rules for Claude Code

## Start of a session

Read, in this order: **NEXT.md**, then tell me what's open; **FABLE.md** (how to scope, gather evidence, plan for
what breaks and verify here); then the sections of **docs/DESIGN_SPEC.md** the task touches.

**A new session only:** `node scripts/code-map.mjs`, then read **CODE_MAP.md** whole, in two reads (the spec's
sections and every decision's title; each file's header and exports, the database, the docs); it's rebuilt each time
and git-ignored. Then `.claude/skills/release/SKILL.md` and `.claude/agents/pug-reviewer.md` (about 3.5k together,
recommended), so every fork knows the push and review steps. **A fork skips this:** it holds CODE_MAP.md's text from
the session it was forked from, and looks up only the files added since.

**The main session** starts only when I run `/main` (`.claude/skills/main/SKILL.md`: the four area forks, their
briefs, the hub's jobs). Any other session is a side session; neither it nor a fork starts sessions (decision 527).

### Working beside the other sessions

The main session and the four forks share this folder and `main`: no branches, so what one writes the others see at
once, and what one leaves half-done is in the others' checks.

- **Numbers collide.** Every session's "next number" is stale. Right before writing a decision row, read the highest
  on disk (`grep -oE '^\| [0-9]+ \|' docs/DESIGN_SPEC.md | tr -dc '0-9\n' | sort -n | tail -1`); before writing a
  migration, the last file in `supabase/migrations/` (`ls supabase/migrations | tail -1`; decision 529). Never
  CODE_MAP's, memory's, Where it stands' or this conversation's number. Take the next and commit it straight away (a
  migration unapplied is fine) so it's claimed. A code comment cites the number the row ended up with.
- **Shared docs collide.** Another session may have changed NEXT.md or TEST.md since you read it: re-read the part
  you'll touch, change only your own entries with small Edits (never a rewrite), and name your session in each.
  TEST.md cases go in your area's section. The main session's alone: NEXT.md's Unpushed line and TEST.md's case count
  in the header.
- **Git: one index for all.** Stage by path and commit in the same call (`git add <path>… && git commit …`); never
  `-A`, `.`, `-u` or `commit -a` (a sweep takes another session's edits, and files left staged go out in whoever
  commits next); never `--amend` (the last commit may be another session's). Never stash, reset, `checkout --`,
  `restore` or `clean` (decision 532): the folder's uncommitted edits may be another session's half-done change, and
  those throw them away with no trace. Undo your own edit with Edit; see a file as committed with `git show
  HEAD:<path>`. A shared doc may also hold another session's edit; committing it with yours is fine, said in the
  handoff.
- **Checks run on the whole folder.** When lint, a test or the build fails, look at which file first: another
  session's half-done work isn't yours to fix; say so.
- **After a compaction** (decision 535), before the next edit, re-read NEXT.md's entries for your area and the
  `/main` skill's area table: the summary keeps the gist of your work, not the exact state; both are on disk.
- **Only the main session pushes**, and only when I ask; a fork never runs the release skill. A push sends every
  session's commits, so first the main session gives the QA table of everything since the last push (`/main`,
  decision 530).

### Outside your area

- **Just do it, and name it in the handoff:** the small changes your task needs in another area's files (a caller of
  something you changed, a shared helper or component, `src/state/`, a migration your feature needs, the shared
  docs). First `git status --short <path>` (decision 534): a file modified that you didn't touch is another session
  mid-edit; message that session (or the main session, if you don't know whose) and wait. The shared docs are the
  exception: the small-Edits rule covers them.
- **Ask me first:** changing how another area behaves (what staff see or what gets exported there), or a large edit
  to another area's main file (`PricingScreen.jsx`, `DayPage.jsx`, `ExportDialog.jsx`, `Scanner.jsx`): another
  session may be mid-edit in it.

### Messages

`SendMessage` to the session's `local_…` id. Short, one message per thing, never a progress report (the main session
gets a note each time a fork ends a turn). Look before asking: `git log`, NEXT.md and the files say what another
session did.

- **A fork → the main session:** when blocked on something another area or I must answer; a heads-up when its change
  touches another area's files or behaviour, so the main session can pass it on; when it finished what another area
  waits on. A fork still asks me before anything outward-facing: a push, a prod migration, deleting data.
- **The main session → a fork:** a task from me, quoting my words (it counts as mine), or another session's change
  that affects the fork's work.
- **Fork → fork directly** only about a file both are changing right now; anything else goes through the main
  session.
- **Memory notes are the main session's** (decision 517): one memory folder for all, so a fork writes none; it
  messages the main session a rule worth remembering, and a rule the main session passes on is already saved.

### Work mode

I switch it with `/workmode on` / `off` in the main session, for the days I work from the main thread alone
(decision 540). The switch is `.claude/workmode` (git-ignored); the hook (`.claude/hooks/workmode.sh`) adds "Work
mode: on" to every turn while it's on, and it runs out 12 hours after it's switched on (the file's age, decision
541): then it's off even if the file is left behind. It's for the four area forks only: a side session, and a fork
while it's off, follow the rules above as written. **On, a fork follows `.claude/skills/workmode/SKILL.md`, What
changes while it's on** (decision 543): in short, every question for me goes to the main session with your pick;
blocked, tell it and keep working on your current task, never a new item; a reversible choice in your own area is
yours, recorded in your Done entry; outward-facing actions and the Ask me first items still wait for me. Check for
the hook's line before asking me anything and when blocked.

## NEXT.md

After each task I give you, mark it done in NEXT.md and list anything pending or half-finished with the exact file
and function. The Done entry is the handoff's record (decision 533), since the main session can't read a fork's chat
(its note of a turn is a few hundred characters): it also carries where to look (the tab, the button or entry, what
should happen), what's untested, and the migration's number if there is one; the QA table (530) is built from these.

## QA Handoff

No smoke tests, browser tests or ad-hoc verification after a change unless I explicitly ask: hand code off untested
so I can QA it myself. The checks before each commit still run every time (Checks below).

- End each handoff with where to look: the tab, the button or entry, and what should happen. Say plainly when
  something is untested rather than implying it's proven.
- The one browser use allowed without asking: measuring a live element when I ask for a size, height or alignment
  change (UI Sizing & Layout below).
- Testing is dev only: nothing is ever tried out on the live site or its database, prod (decision 380, Database).

## How we work

- **One small change at a time**, handed over, then the next. When a request implies several mechanisms, list them
  as separately shippable items and let me pick the order.
- **The spec is the source of truth** (`docs/DESIGN_SPEC.md`). Record each decision I make as a numbered row.
- **Nothing beyond the spec without asking:** no settings, features or dependencies. New settings ideas are welcome:
  propose them, don't build them. Ask about a dependency whenever one would help rather than hand-rolling around
  it: name the package, what it's for and whether it ships to the site; dev-only tools (lint, test, build helpers)
  are usually a yes (owner, 2026-10-16).
- **Commit when a fix or task is done. NEVER push unless I explicitly ask:** pushing `main` deploys the live site.
  The steps are the release skill, `.claude/skills/release/SKILL.md`.
- **Stay in this project**, `C:\ClaudeProjects\pug-pricing-tool`. Never create, edit or delete anything in another
  project, its config or its memory file; collection-manager and audit-tool are READ-ONLY references. If something
  elsewhere looks wrong, say so. Claude's memory notes about this project are fine to keep up, wherever the session
  stores them; the release state lives in NEXT.md and Where it stands below.
- **Scratch files** go in the session's scratchpad or `C:\ClaudeProjects\temp`, never in the repo, and never in the
  `klug alters` folder a session may start in.

## Help and team write-ups

- `README.md` is the app's Help. Edit it only when I ask, not with each change. A large change (a new feature, a
  changed workflow, a renamed or removed button) ends its report with a one-line flag naming the Help section
  that's now out of date.
- Nothing my team reads (Help, one-pagers, release notes, version names, tag messages) mentions the AI, model names
  or how it was made: no "Fable", "Claude", FABLE.md or "code review by". A tag like `v0.9.9.9-fable` is written
  `v0.9.9.9-refactor`.
- A "1 pager" is one printed page: a one-line lead, emoji section headers, one-line bullets with bold lead-ins,
  about 25 lines.

## Secrets and accounts

- Never put API keys, the Supabase secret key (`sb_secret_…`), customer data or CSV files in the repo, code, docs or
  commit messages. Never commit "PUG Pricing Tool.txt" (it holds a live key).
- The JustTCG key goes in only through Settings → API keys, by me. Never read my key file. Never type the store
  password: I sign in.

## Database

Dev is `psucrzljraxeootwnltf` (localhost and the phone scanner's LAN link, `.env.development`; the store's data
from before launch as the test copy). Prod is `zvxquzcfffmxwizonxuo`, the live site's project since v1.0.0-launch.
**Before any migration work, read `docs/DATABASE.md`** (decision 543): the six steps (review, rehearsal, push,
snapshot, test run, prod the same sitting), the CLI's link and the `--project-ref` flag, the `internal` schema, the
gotchas and the squash.

- **Prod holds the store's data and nothing else, ever** (decision 380): no test rows, users, files or scans, and no
  counter moved by a test. Every try-out runs on dev; on prod only the read-only checks (`docs/DATABASE.md`), and
  whatever must be checked there is checked by looking, never by making something.
- **Dev and prod stay on the same migrations at all times** (decision 381): a batch isn't done until it's on both,
  in one sitting (the prod push has my standing go; pick the moment), and app code that needs a migration isn't
  pushed before prod has it. No session ends with dev ahead of prod: if prod can't take it, the handoff's first
  line and NEXT.md's first Open item say so.

## Where things are

- `docs/DATABASE.md`: the two projects, a migration step by step, the `internal` schema, the gotchas, the squash.
  `docs/TEST.md`: the smoke test, one pass, tab by tab; a pass reports its findings when it ends. `docs/SETUP.md`:
  running, deploying, and the phone scanner's LAN link. `docs/SCAN_LEARNINGS.md`: what the first attempt at auto
  scanning taught us (rolled back 2026-10-16).
- `.claude/agents/pug-reviewer.md`: the standard review. When I ask for a review, hand it to this agent (read-only;
  it reports, it doesn't fix) and relay its findings. `.claude/skills/release/SKILL.md`: the push, with or without
  a version bump.
- Retired docs (the export and scanner specs, the completion map, the Pokémon price audit, smoke test results, the
  team feedback plan, the squash runbook, the matching audit) and the squash's baseline generator: the "Retired
  documents" row at the top of `docs/DESIGN_SPEC.md`. Code comments citing them mean those copies: `git show
  d158ee3:<path>` for the first five, `git show 681c5c6:<path>` for the next three, `git show
  a8fb952:scripts/db-baseline.mjs` for the generator.

## Where it stands (2026-10-26)

- Live: **v1.0.5-rainbow** (2026-10-25, decisions through 526), then pushes without a bump, the last on 2026-10-26
  (decisions through 540), on prod: the GitHub Actions variables point there.
- Prod and dev both have migrations 0001–0013 and stay equal (decision 381; the last on prod 2026-10-24, the
  structure-only compare the same). What each did: the spec's decisions and the files' names. The next is 0014.
- The release history is the spec's decisions and `git tag`; what's open is NEXT.md.

## Coding Conventions

### Checks

`export PATH="/c/Program Files/nodejs:$PATH"`, then `npx eslint .`, `npm test` (commit only on `fail 0`) and
`npm run build`. The hook in `.claude/settings.json` lints each Edit or Write as it's saved (the affected-tests hook
of decision 528 was removed, decision 548: the commit's `npm test` is the test check).

**Three tries, then stop** (decision 531): when lint, a test or the build still fails after three attempts at
fixing it, stop and tell me what's failing, in which file, and what you tried. Look first at whose file it is
(Working beside the other sessions): another session's half-done work isn't a try of yours.

### Writing code files

Never write source files (JS, Python or other) through Bash heredocs or echo, and don't edit them in place with
`sed -i`: the lint hook only sees Write and Edit. Use Write/Edit so backslashes, regexes and encodings are preserved.
A patch script written with Write is fine for many-file changes; the full lint before the commit covers it.

### UI Sizing & Layout

When I ask for a size, height or alignment change, measure the live element in the browser (getBoundingClientRect
via the browser tool) before picking a value; don't guess from the CSS alone. Keep fixes minimal and don't change
unrelated separators, labels or formatting in the same edit.
