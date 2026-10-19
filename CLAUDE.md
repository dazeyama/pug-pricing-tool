# PUG Pricing Tool — rules for Claude Code

## QA Handoff

Do NOT run smoke tests, browser tests, or ad-hoc verification after a change unless I explicitly ask for a test.
Hand code off untested so I can QA it myself. The checks before each commit still run every time: lint, the unit
tests (`npm test`, commit only on `fail 0`) and the build.

## NEXT.md

At the start of every session, read NEXT.md (repo root) first and tell me what's open. After each task I give you,
mark it done there and list anything pending or half-finished with the exact file and function involved.

## Project rules

- The spec is docs/DESIGN_SPEC.md. Read the relevant sections before each task. Update it
  when the owner changes a decision.
- Read FABLE.md once per session: how to scope, gather evidence, plan for what breaks and
  verify here. The code review's fixes (FABLE_REPORT.md) are all done; the report is in git history.
  What's left of it, the migration squash and the Changelog lock (0072), is in SQUASH.md.
- Work only in C:\ClaudeProjects\pug-pricing-tool. collection-manager and audit-tool are
  READ-ONLY references: never edit, move or commit anything in them.
- One phase at a time (spec Section 15). Don't start the next phase until the owner reports back.
- Don't add settings, features or dependencies beyond the spec without asking the owner
  first. New settings ideas are welcome: propose them, don't just build them.
- Do ask about dependencies whenever one would help, rather than hand-rolling around it: stop,
  name the package, what it's for and whether it ships to the site. Dev-only tools (lint, test,
  build helpers) that never reach the site are usually a yes (owner, 2026-10-16).
- Commit when a phase or fix is done. NEVER push unless the owner explicitly asks. Pushing
  to main deploys the live site.
- Never put API keys, the Supabase secret key (sb_secret_…), customer data or CSV files in the repo,
  code, docs or commit messages. Never commit "PUG Pricing Tool.txt" (contains a live key).
- Database changes are new migration files; apply to the dev project only unless told otherwise.
- Helpers only the database's own functions call live in the `internal` schema (migration 0040), which
  the API doesn't serve. A function that calls one must `set search_path = public, internal`
  (security-definer: `public, internal, pg_temp`); a plain `= public` can't find them.
- The owner is QA — see memory `user-is-qa`.
- The export's spec was docs/EXPORT_FUNCTION.md, retired 2026-10-19 (decision 336): `git show d158ee3:docs/EXPORT_FUNCTION.md`.
- The team feedback plan (printout, individual rates, bulk; phases T1–T3) is docs/TEAM_FEEDBACK.md.
- The phone scanner's spec (phases S1–S5) was docs/SCAN_FUNCTION.md, retired 2026-10-19 (decision 336):
  `git show d158ee3:docs/SCAN_FUNCTION.md`. Comments citing it, EXPORT_FUNCTION.md, AUTO_COMPLETE.md or PKM_PRICES.md mean those copies.
  What its first attempt at auto scanning taught us (rolled back 2026-10-16) is docs/SCAN_LEARNINGS.md.
- Current phase: docs/TEAM_FEEDBACK.md Phases T1 (audit printout) and T2 (individual rates, migrations
  0055–0057) and T3 (bulk, migration 0058) are done, live as v0.9.9.7-feedback.
  Then live as v0.9.9.8-day1: struck cards (DESIGN_SPEC decision 267, migrations 0059–0060), confirmed
  buys keeping their custom rates (decision 268, migration 0061), Japanese-only Magic printings in English
  searches (decision 269) and placeholders (decision 270, migration 0062), all migrations on dev.
  Then live as v0.9.9.9-fable: the code review's fixes (FABLE.md; migrations 0063–0065), the Phase 6
  smoke test (results in git history, decision 336) and its fixes (decisions 272–273, migration 0066), all on dev.
  Then pushed without a version change: Show all finds struck cards (decision 275, migration 0067, on dev)
  and cards by game on a collection's name (decision 276).
  Then the phone scanner (docs/SCAN_FUNCTION.md Phases S1–S5, decisions 278–279, migrations 0068–0070 on dev;
  the repo is GPL-3.0 since), with the owner's live-testing rounds, the address-bar search, bulk pinned in the
  buy list and print/export in any status: live as v0.9.9.10-scanner (2026-10-16), all migrations on dev.
  Then live as v0.9.9.11-stickers (2026-10-17): Print MTG? / Print PKM? / Print PKM Stickers? (decisions 280–283;
  the 160-sticker sheet in lib/stickerPdf.js with the store printer's offset), a Pokémon day's EXPORT ▾ with
  Complete day…, a Pokémon buy's prints, TCGdex four at a time, the scanner's double-add guard. No new migrations. The squash's
  numbers moved on: baseline 0071, the Changelog lock 0072.
  Then live as v0.9.9.12-henry (2026-10-17): the Pokémon price audit (PKM_PRICES.md) and its fixes: TCGdex's wrong
  TCGplayer products put right (WRONG_PRODUCTS, decision 286; Charmander SVP 044), own products read as the version
  (287), the name search by each set's TCGplayer home + the wrong-card guard (288), the siblings search on request and
  kept a week (289), who's on in the tab row (284), Ctrl+Click EXPORT decklist (285), Help on how scanning works.
  No new migrations. The `prices` function (288/289's server half) needs `npx supabase functions deploy prices
  --project-ref psucrzljraxeootwnltf --use-api --no-verify-jwt` after the push (done 2026-10-17).
  Then, local: the team's six items (decisions 290–293; migrations 0071–0072 on dev): buys numbered once forever
  (`buys.number`), the day's Custom SKU and "101626-42" for a single buy, BUY COMPLETE after CONFIRM BUY with
  Print MTG? / Print PKM?, mimp mode (🦇/🌼 after EN | JP), and docs/AUTO_COMPLETE.md (the map of what becomes
  Completed, for the owner to chart). Then the owner's chart (decisions 294–296; migration 0073 on dev):
  collections never complete themselves (Completed by hand; EXPORT only stamps), Mark as completed strikes a
  Magic buy's cards, Convert to project skips Completed cards. Then Undo export… on a collection's ⋯ (decision 298;
  migration 0074 on dev); the scanner's time limits, Stop and hold to start over (decision 300), the
  flagged-buy banner on printouts (301), a scan saved once (302, migration 0075 on dev). The squash's numbers
  moved on: baseline 0076, the Changelog lock 0077. (Since decision 332, 2026-10-19: the baseline is always
  `0001_baseline.sql`, the Changelog lock 0002, and prod starts empty; localhost always uses dev.)
  Then live as v0.9.9.13-scanner2.0 (2026-10-19; v0.9.9.12 was already henry): the scanner's smoothness and
  accuracy round (decisions 302–322: a scan saved once, the camera cut off noticed, idle rest, the reader recycled,
  too dark, the computer's time limits, older titles found and read white, trailing words, Which card?, re-crops
  every 20 cards / after an interruption / once settled, PRM promos, the bell reset, Stop as an abort, the
  computer kept awake, a dev-only run log), surge foils priced from their own product (316), edit opening every
  printing with the edited card pinned (319, 324), mimp reversed (323), auto-select sooner (325), special foils
  only with FOIL (326), FNM promos by year (327), stamped promos by their stamp (328), The List and Mystery
  Booster in number searches, after the main printings (329), Help for all of it (330). Migration 0075 on dev.
  Then the tall-stack note (331, pushed without a bump), the squash renumbered to a 0001 baseline (332), the
  33.34/66.68 default rates (333), the smoke test as one pass (334, docs/TEST.md),
  and Convert to collection on a buy's ⋯ (335, migration 0076 on dev); five finished docs retired (336).
  Phase 10 launch (the migration squash, SQUASH.md, then prod) waits for the owner's go; the live site runs on the
  dev project until then. docs/TEST.md is the smoke test (one pass, tab by tab); a pass reports its findings when it ends.

## Coding Conventions

### Writing Code Files

Never write Python, JS, or other source files through Bash heredocs or echo. Always use the Write/Edit tools so
backslashes, regexes, and encodings are preserved.

## UI Work

### UI Sizing & Layout

When I ask for a size, height, or alignment change, measure the live element in the browser (getBoundingClientRect
via the browser tool) before picking a value. Don't guess from the CSS alone. Keep fixes minimal and don't change
unrelated separators, labels, or formatting in the same edit.
