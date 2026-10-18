# PUG Pricing Tool — rules for Claude Code

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
- The export's spec is docs/EXPORT_FUNCTION.md.
- The team feedback plan (printout, individual rates, bulk; phases T1–T3) is docs/TEAM_FEEDBACK.md.
- The phone scanner's spec (a phone scans Magic cards into a computer's buy list; phases S1–S5) is docs/SCAN_FUNCTION.md.
  What its first attempt at auto scanning taught us (rolled back 2026-10-16) is docs/SCAN_LEARNINGS.md.
- Current phase: docs/TEAM_FEEDBACK.md Phases T1 (audit printout) and T2 (individual rates, migrations
  0055–0057) and T3 (bulk, migration 0058) are done, live as v0.9.9.7-feedback.
  Then live as v0.9.9.8-day1: struck cards (DESIGN_SPEC decision 267, migrations 0059–0060), confirmed
  buys keeping their custom rates (decision 268, migration 0061), Japanese-only Magic printings in English
  searches (decision 269) and placeholders (decision 270, migration 0062), all migrations on dev.
  Then live as v0.9.9.9-fable: the code review's fixes (FABLE.md; migrations 0063–0065), the Phase 6
  smoke test (results in docs/TEST.md) and its fixes (decisions 272–273, migration 0066), all on dev.
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
  Magic buy's cards, Convert to project skips Completed cards. The squash's numbers moved on: baseline 0074,
  the Changelog lock 0075.
  Phase 10 launch (the migration squash, SQUASH.md, then prod) waits for the owner's go; the live site runs on the
  dev project until then. docs/TEST.md holds the smoke tests and the database test run.
