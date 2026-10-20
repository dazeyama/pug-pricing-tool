# NEXT

What's open, newest task first. Claude reads this at the start of every session and tells the owner what's open,
then marks each task done here when it's finished, listing anything pending or half-finished with the exact file
and function.

## Open

- **Help out of date** (only when the owner asks), from the release review's fixes: a TCGplayer-only Pokémon version
  whose search failed is added at a manual price, and an edit keeps it as **As saved** (decision 369); "the same
  file again" leaves out cards exported from Can't upload cards, and needs the connection (decision 372).
- **Help out of date** (only when the owner asks), from Batch 2: a day's EXPORT once exported downloads the day's
  own export only, not Export single buy's cards (decision 361); a Paid/Ours collection with every Magic card
  exported downloads its file again (decision 362); a failed export that went through downloads its file after all
  (decision 362).
- **Help out of date** (only when the owner asks), besides the list below: Backups → Restore (two presses; backups
  hold the learned matches, decision 348); REPRICE? ("every card": not exported ones, decision 345); nothing says
  an exported card can't be changed (decision 345); scanning: waiting cards come in when the phone pairs with
  their list again (decision 343).
- **Help out of date** (only when the owner asks): `README.md` "A buy's ⋯ menu" Convert to collection row ("what was
  paid": only when the whole buy moves, decision 341) and the day's **Mark Paid/Ours again…** row (~line 1059:
  hand-completed Magic buys stay, decision 340); "Convert to buy…" (~line 968: a kept-buy project starts at $0, and
  an exported project can't convert, decision 339); "How prices are worked out" / "Condition prices" (decision 338).
- **The full launch review's 20 B findings, planned (owner, 2026-10-19)** (details in
  `C:\ClaudeProjects\temp\launch-review-full-2026-10-19.md`, raw reports in `launch-review-full\`):
  1. **Batch 1, the database: done** (decisions 350–354, migration 0084; see Done; what's left of it is under "Left
     from Batch 1" below).
  2. **Batch 2, app only: done** (decisions 355–366; see Done; what's left of it is under "Left from Batch 2"
     below).
  Then the first review's leftover B items.
- **Left from Batch 2 (owner's call on each):**
  - a single buy's file has no "download it again": Export single buy is blocked once the buy is Completed, and the
    day's EXPORT now leaves single-buy cards out (decision 361). A proposal, not built: "Download its file again" in
    the buy's ⋯ (`src/pages/day/BuyPanel.jsx`, `DayPage.jsx`);
  - a Can't upload cards export whose answer was lost can't be told apart, since its exported copies are deleted:
    the dialog says it may have gone through (`ExportDialog.jsx` `save`, decision 362);
  - the rest of B18: ADD CARD, × and creating a collection repeated after a lost answer happen twice; a short drop
    with the wifi up never reloads; the Supabase client has no request timeout (`src/lib/supabase.js`,
    `src/state/connection.jsx`, decision 363);
  - the rest of B15: Settings that failed their first load are now "not loaded" (decision 364), but the Price screen
    still prices with the built-in defaults meanwhile (`src/state/settings.jsx` `values`);
  - the rest of B16: Import Collection's remembered picks past 1,000 (`importCollection.js`; loses saved matches,
    never picks a wrong product).
- **Buy numbers through a project** (the owner's answer, 2026-10-19, not done yet): a project converted back to a buy
  keeps its original number, as decision 290 says; `project_to_buy` gives a new one today.
- **Left from Batch 1 (0084):**
  - edits that fold two lines together keep only the surviving line's scan id, so a scan re-claimed later can't
    find its line (`draft_update_line`, `collection_update_line`; decision 351);
  - the rest of B3: an Undo after a lost answer takes two copies off; FOIL?/NON FOIL? can leave none; refusal notes
    never shown after a plain Undo (`Scanner.jsx`, `useScanReceiver.js`);
  - Convert to project / collection still moves bulk and placeholders off a Completed side (`buy_to_project`,
    `buy_to_collection`; decision 353);
  - `settings_save` edges: two first saves of a new key both pass; a quick Tab between two boxes of one object
    setting (Fallback, Tiers, Bulk) can be refused falsely (decision 354);
  - a scan can open a walk-in buy the computer doesn't know about until its next write; if that scan never adds,
    Cancel on the computer doesn't fail it (decision 350);
  - B19's day EXPORT and COMPLETE checks with struck, bulk and placeholder lines (only Export single buy is tested).
- **Small edges left from the reviews:**
  - a buy with both exported and hand-completed Magic cards, after its export is undone, shows Mark as completed
    instead of Mark Paid/Ours again (`src/pages/day/BuyPanel.jsx`, `byHand`): Mark as completed, then Mark Paid/Ours
    again, brings everything back;
  - unlocking a kept-buy collection and marking it Paid/Ours again asks for a price: typing the buy's payment there
    counts it twice (decision 341);
  - a backup with columns the database lacks restores without them, silently; a hand-edited backup with empty rows in
    a learned-match table empties it (decision 348);
  - the "Exported: Undo export… first" wording also shows on Can't upload cards (decision 345).
- **After the launch push (v1.0.0-launch, 2026-10-19), the owner's setup on the live site.** Done the same night:
  signed in with prod's store password, the JustTCG key saved and a price came back, so `secrets` and `prices` are
  proven on prod. Left as the owner gets to them: name the computer, add the users, upload the CC CSV; every store
  computer signs in again. The Supabase plan: Free for now (decision 376). The clean-up (the spec's Phase 10 list, `C:\ClaudeProjects\temp\pug-squash\` included)
  waits until prod has run a while.
- **The smoke test pass** (`docs/TEST.md`, 200 cases): planned before the squash and the switch, not done; neither
  changed behaviour, so it still covers this build (on dev, or on the live site once it has data).
- **TEST.md has no case for decision 374** (the launch review): the 🚩 following the press that went through, and
  Confirming… while a later press reads back.
- **After launch:**
  - watch JustTCG usage and the plan (Appendix D 4);
  - tune the stamp cutoff `STAMP_SEEN = 0.53` in `src/scan/stamps.js` from the run log's `stamp` lines
    (`C:\ClaudeProjects\temp\scan-run\scan-log.jsonl`, LAN dev server only).

## Done

- 2026-10-19: **Prod's Changelog counter put back to 1** (decision 380), on the owner's word: one guarded statement
  on prod (`setval('events_seq_seq', 1, false)` only if `events` is empty; it was, 0 rows), read back as not yet
  called, so prod's first Changelog entry is number 1. Dev's counter untouched (9,067, called). Not a migration.
  Prod now has no trace of any test.
- 2026-10-19: **Migrations 0002 and 0003 on prod**, and the rule that dev and prod stay on the same migrations at
  all times (decision 381; CLAUDE.md Database, step 6). The dry run listed the two; pushed with `db push --linked
  --project-ref zvxquzcfffmxwizonxuo` (the CLI linked to dev throughout); prod's record 0001–0003; the structure-only
  comparison with `C:\ClaudeProjects\temp\pug-migrations\dev-run-0003.json`: nine fingerprints the same, 2.7 s,
  nothing run or written on prod. Dev and prod are equal.
- 2026-10-19: **The hard rule: prod holds the store's data and nothing else, ever; testing is dev only** (decision
  380; CLAUDE.md QA Handoff and Database; the reviewer's brief). `scripts/db-test-run.mjs` refuses its full run on
  any project but dev, before it touches the database, and gained `--structure-only` (the kit and the Fingerprints
  block inside begin/rollback: nine catalog reads, no DBTEST row, no counter moved), tried on dev: 9 fingerprints
  the same as the saved run in 3.0 s. Every doc's prod step now reads `--linked --project-ref zvxquzcfffmxwizonxuo`
  (`db query` insists on both flags; the flag overrides the link for that one command) and, for the test run,
  `--structure-only`. A read-only look at prod found no DBTEST row anywhere and the buy counter never called; the
  one trace of the launch night's full run is `events_seq_seq` at 162 with no entries (Open, After launch).
- 2026-10-19: **Migrations 0002 and 0003 on dev** (decisions 378, 379), as one batch: one pug-reviewer review (every
  one of the eight mappings traced; nothing blocking), one rehearsal inside begin/rollback on dev, applied in order,
  one snapshot (`supabase/current/`: `internal.insert_event.sql` new, eight bodies changed), one test run (526
  checks; four new: neither counter open to anon, the Changelog read-only for the app, a direct insert and a
  `nextval` refused 42501). 0002: the Changelog is written only by the database through `internal.insert_event`
  (SQUASH.md 11a). 0003: `buys_number_seq` revoked from anon. The migration files were written by a one-off
  generator outside the repo as exact-text patches of `supabase/current/`. **Not on prod yet** (Open, After launch).
- 2026-10-19: The release skill names the live site's project with `--project-ref` (decision 377): step 1's
  migration check, and `scripts/db-test-run.mjs --project-ref <ref>` for a prod test run, so the CLI stays linked to
  dev; CLAUDE.md, SQUASH.md sections 11 and 12, SETUP.md's new-project steps agree. The Supabase plan closed: Free
  for now (decision 376; Appendix D 2 struck), and `docs/SETUP.md` → "Restoring a paused project" written from
  Supabase's own page (7 idle days to pause; Resume project in the dashboard; a 1-year restore window).
- 2026-10-19: Pushed as **v1.0.0-launch** (tag `v1.0.0-launch`): **the launch**. The live site now builds against
  **prod** (`zvxquzcfffmxwizonxuo`): the Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
  set from `.env.production` (decision 375); `prices` and `secrets` deployed to prod; sign-ups off and Max rows
  1,000 checked by the owner. Out with it: decision 374, the squash (`0001_baseline.sql` on both projects), SQUASH.md
  and the generator at 0084. No migrations to push (both projects record `0001`); no Edge Function changes in the
  range. Localhost stays on dev (`.env.development`). Nothing unpushed.
- 2026-10-19: **The migration squash (decisions 192, 332; SQUASH.md sections 1–9).** The freeze (0001–0084 all
  applied; the test run's 522 checks, saved as `C:\ClaudeProjects\temp\pug-squash\dev-run.json`); tag `pre-squash`
  (ea030c8) and the owner's dev backup in that folder; the baseline written at 0084 (5,118 lines) and rehearsed nine
  of nine; the 84 files moved to `supabase/migrations-archive/` (README there); prod probed untouched (PostgreSQL
  17.6, no tables, no `supabase_migrations` schema yet, one auth user); the baseline pushed by the owner in one
  transaction (`npx.cmd`, since PowerShell's script policy blocks `npx`; the session's permission mode refused the
  push itself); prod's test run 522 checks, nine of nine fingerprints the same as dev's, and section 8's hand checks
  as listed (`prod-run.json` saved); dev's record repaired to `0001`, `db push --dry-run` up to date, dev's test run
  the same after as before (its next buy still 44). Records: CLAUDE.md Where it stands, decision 192's row,
  SQUASH.md's Done note, this file. The unit tests pass with the baseline as the only file in `supabase/migrations/`
  (`tests/dbErrors.test.js` reads that folder for the raised codes).
- 2026-10-19: SQUASH.md checked against the scripts, the CLI's flags and dev's catalog (nothing on dev outside what
  the generator writes: no enums, domains, views, procedures or rules; the counts as section 3 says) and brought up
  to date: 19,692 lines of migrations, the baseline's 5,118 file lines, Realtime's 10 tables in section 8's hand
  check, section 11a's nine event writers re-checked at 0084; the spec's Phase 10 block now points at decision 332
  and the runbook. `scripts/db-baseline.mjs`: the header dated by the store's clock, not UTC, and file lines
  counted. The rehearsal at 0084 passed with no generator change (ea030c8). Found and left for a migration after
  launch: `buys_number_seq` carries Supabase's default grant to `anon` (0071 didn't revoke it); the baseline copies
  dev as it is, and the rehearsal's Privileges fingerprint depends on that.
- 2026-10-19: The 2026-10-19 push's seven review notes (lint, 432 unit tests and the build; untested in the browser):
  - notes 2 and 3, decision 374: `src/pages/price/useDraft.js` `confirm` keeps each press's 🚩 box
    (`attempt.flagCondition`) and returns it with the answer, so `src/pages/PricePage.jsx` `confirmBuy` flags the buy
    from the press that went through (either press's 🚩 when both match); the later press's read-back
    (`unsure.current`'s branch) sets busy, so Confirm buy shows Confirming… until it's answered;
  - notes 1, 4, 5, 6 and 7: closed by the owner without a change (listed in decision 374).
- 2026-10-19: Pushed without a bump: decisions 367–373 (the v0.9.9.15-review release review's ten notes) and
  TEST.md's new cases. No migrations (dev has 0001–0084). The `prices` and `secrets` Edge Functions deployed with it
  (decision 370). Nothing unpushed.
- 2026-10-19: The v0.9.9.15-review release review's ten notes, all fixed (lint, 432 unit tests and the build before
  each commit; untested in the browser):
  - notes 1 and 2, decision 367: CONFIRM BUY's read-back must match what this tab sent, and a press after a lost
    answer finds out what happened (`confirmReadBack.js` `readBack`, `useDraft.js` `confirm`, `PricePage.jsx`);
  - note 3, decision 369: a TCGplayer-only version whose search failed is added at a manual price; an edit keeps
    its saved version ("As saved"; `usePrinting.js` `savedVersion`, `PricingScreen.jsx`);
  - notes 4 and 9, decision 370: the prices function answers a missing remembered card as not answered, not with
    an old price; an unreadable reply is tried once more, then fails (`prices/index.ts` `unanswered`,
    `_shared/justtcg.ts` `call`; not deployed yet);
  - note 5, decision 368: only answers are kept in the page-long price cache (`priceAnswers.js` `keepAnswers`);
  - note 6, decision 371: a lost answer is looked at twice, two seconds apart (`timeout.js` `pause`,
    `ExportDialog.jsx`, `useDraft.js`);
  - note 7, decision 372 (the owner: every round of its own): "the same file again" leaves out cards exported from
    Can't upload cards, found by that export's changelog time (`ccExport.js` `restampTimes`, `massCreate.js`
    `withoutRestamps`, `dayRules.js`, `CollectionPage.jsx`, `DayPage.jsx`);
  - note 8, decision 373: a paged read with its count takes one request (`inChunks.js` `allPages`; SQUASH.md's Max
    rows note);
  - note 10: `docs/TEST.md` has cases for decisions 355–372, 200 in all.
- 2026-10-19: Pushed as **v0.9.9.15-review** (tag `v0.9.9.15-review`; the owner's "subagent" became "review", since
  version names are team-facing): decisions 337–366, the launch reviews' A fixes and the full review's B Batches 1
  and 2, the Help's struck-cards wording. Migrations 0077–0084 were already on dev (it has 0001–0084). The `prices`
  and `secrets` Edge Functions deployed with it (decisions 347 and 360). Nothing unpushed.
- 2026-10-19: Batch 2 of the full review's B findings, app only, in small commits by area (lint, 424 unit tests
  and the build before each; untested in the browser):
  - scanner, decisions 355–356: B4 List / Mystery Booster cards by their mark (`listMark.js`, `older.js`); B5 the
    camera, stale sheets, waiting scans, pictures (`camera.js`, `Scanner.jsx`, `useScans.js`, `printingMatch.js`);
  - pricing, decisions 357–359: B7 a failed search isn't kept (`priceAnswers.js`, `usePrices.js`); B10 Enter waits
    for the search; B9 TCGplayer versions (`PricingScreen.jsx`);
  - B6, decision 360: a JustTCG reply that didn't answer isn't remembered as "no match" (`prices/index.ts`,
    `_shared/justtcg.ts`; takes effect when deployed);
  - B12, decision 361: a day's file again is the day's export only (`dayRules.js` `dayExportLines`);
  - B13, decision 362: export retry after a changed buy or a lost answer, and a Paid/Ours collection's file again
    (`ExportDialog.jsx`, `ccExport.js` `exportLanded`, `CollectionPage.jsx`, `DayPage.jsx`);
  - B18, decision 363: a CONFIRM BUY that saved but lost its answer goes on (`useDraft.js` `confirmedBuy`);
  - B14 and B17, decision 364: a failed first lock check or live-table load is asked again (`useCollectionLock.js`,
    `useLiveTable.js`);
  - B16, decision 365: long lists read page by page (`cashBuys.js`, `CollectionsPage.jsx`, `HomePage.jsx`,
    `CalendarPage.jsx`);
  - B20, decision 366: tests for rounding, the Cash buys file, CSV quoting and stay awake; `supabase.js` loads under
    `node --test`.
- 2026-10-19: Batch 1 of the full review's B findings, the database ones, as one migration with one review (and a
  re-review after its findings), migration 0084, db-test-run 522 checks:
  - B1/B2, decision 350: a walk-in scan knows its buy (`scans.target_draft_id`, opened by the scan if none);
    confirm and cancel fail its scans not added yet with a note the phone shows; `draft_add_line`'s `p_draft_id`
    (locked, `draft_gone`) and `scan_claim`'s `p_draft_id`; `useDraft.js`, `PricePage.jsx`, `useScanReceiver.js`;
  - B3 (part), decision 351: a merge records the scan id (`price_snapshot.scans`), `lineOfScan` reads it;
  - B8, decision 352: `internal.same_card` keeps TCGplayer-only cards from two sets apart;
  - B11, decision 353: a walk-in's Completed side locked, bulk, placeholders and struck cards too (strike, ×,
    Restore, `buy_save_edits`; `BuyPanel.jsx` `sideDone`);
  - B15, decision 354: `settings_save` refuses a stale save; `settings.jsx`; `useSettingField.js` saves nothing if
    the box is unchanged;
  - B19 (part): Export single buy leaves out bulk, a placeholder and a struck card; two older tests updated to the
    new lock (they struck and removed bulk on a Completed side).
- 2026-10-19: Buy numbers without gaps (decision 349, migration 0083; reviewed twice by pug-reviewer): a confirm
  takes the highest number + 1 under a lock (`internal.next_buy_number`), the old sequence only a floor; the 43
  buys renumbered 1–43 (only 137 → 42 and 154 → 43 changed; list in `C:\ClaudeProjects\temp\buy-renumber-2026-10-19.txt`)
  and 84 Changelog titles of existing buys rewritten to match; next buy is Buy 44; db-test-run 503 checks, the next
  number unmoved. A backup from just before is in `C:\ClaudeProjects\pug-pricing-tool-backups\` (`…-before-0083.json`).
  On the way, the 0083 rehearsal's setval (not undone by rollback) left the live counter at 43 for about 15 minutes;
  no buy was confirmed meanwhile, and it was put back to 154 before the migration.
- 2026-10-19: The full launch review's seven fix-before-launch findings, one commit each, every migration reviewed
  by pug-reviewer (and re-reviewed after its findings) before dev; db-test-run 499 checks:
  - A4, decision 342 (prod's buys start at 1): `scripts/db-test-run.mjs` `putBuysBack` puts `buys_number_seq` back
    after a run, failed runs too (`a2728a7`);
  - A2, decision 343, migration 0080: scans belong to the computer (key to `devices`) and remember their list
    (`target_kind`, `target_buy_id`); `scan_claim` takes only its list's; the receiver stops a batch when its screen
    goes; the phone lists only its list's scans (`ed771ed`);
  - A3, decision 344: one send per card at a time, its id kept until answered, lost connections retried
    (`Scanner.jsx` `sendCard`, `useScans.js` `send`; `80abb9e`);
  - A1, decision 345, migration 0081: a stamped line is frozen (`line_exported`; seven SQL functions, `BuyList.jsx`,
    `RepriceModal.jsx`, the file-only export; `fc0de17`);
  - A5, decision 346: `allPages` in `src/lib/inChunks.js` for the `cc_candidates` reads (export, audit print,
    import); SQUASH.md's Max rows step (`9ed1577`);
  - A6, decision 347: the another-card check on every price answer (`refusedFor` in the `prices` function,
    `src/lib/anotherCard.js` in the browser; not deployed yet; `82b57a4`);
  - A7, decision 348, migration 0082: restore moves the buy counter on, older backups restore with defaults, backups
    hold the learned matches, Restore takes two presses, `docs/SETUP.md` has the new-project steps (`9227fe6`);
  - SQUASH.md: N is 0082 and the counts at 0082.
- 2026-10-19: The launch review's six fix-before-launch findings (each reviewed by pug-reviewer before dev):
  - A1, decision 339, migration 0077: `project_to_buy` refuses a project with exported or Can't upload cards
    (`project_exported`); the project's ⋯ greys Convert to buy… and the Collections table's ⋯ stops before its
    dialog (`PROJECT_EXPORTED` in `src/pages/collections/useCollection.js`);
  - A2, decision 340, migration 0078 (the owner chose "leave them Completed"): `export_undo_day` and `buy_unexport`
    skip Magic cards Mark as completed struck; the day's dialog counts only the buys it brings back
    (`undoable`, `keptByHand` in `src/pages/DayPage.jsx`; `struckByCompletion` in `src/pages/day/dayRules.js`);
  - A3, decision 341, migration 0079 (the owner chose "the original buy only"): a kept buy's new project or
    collection is paid $0 with the buy's method; the convert dialog says so (`src/pages/day/DayModals.jsx`);
  - A4: `SQUASH.md`'s N (0079) and expected counts, from a trial `db-baseline.mjs` run into the scratchpad;
  - A5: `scripts/db-test-run.sql`'s Privileges fingerprint leaves `schema public` out;
  - A6: `SQUASH.md`'s prod Edge Function deploy has `--use-api --no-verify-jwt`.
  No old rows needed fixing (each checked with a read-only query). db-test-run: 485 checks pass.
- 2026-10-19: Decision 338, better conditions from JustTCG's best price: `priceLadder` in `src/lib/ladder.js` (a
  `filled` field on each entry), the tooltip in `src/pages/price/PriceTable.jsx`, three tests in
  `tests/ladder.test.js`, spec 8.7 and a `docs/TEST.md` case. No database change (`justtcg_fallback` was already
  allowed). The Help's price section doesn't mention it yet.
- 2026-10-19: The v0.9.9.14-nightb4 review's notes:
  - decision 337: CONFIRM BUY's Customer name stops at 80 characters (`src/pages/price/ConfirmBuyModal.jsx`, was
    120), as `buy_to_collection` and `buy_to_project` require; no buy on dev had a longer name. Left as they are:
    the collection name fields (120 typed, "Keep the name to 80 characters" past 80) and `confirm_buy`, which has no
    length check of its own (no migration);
  - Help, `README.md` "A buy's ⋯ menu": struck cards stay on the buy if it stays, and the Changelog keeps them if
    it's deleted (was "stay behind");
  - the published tag `v0.9.9.9-fable`: closed by the owner, left as it is.
- 2026-10-19: Pushed as **v0.9.9.14-nightb4** (tag `v0.9.9.14-nightb4`), the release skill's first run in its new
  order (record edits reviewed before the record commit, the deploy run found by commit): the Help's Convert to
  collection row, the release skill and `scripts/live-check.mjs` fixes, and the NEXT.md notes. No migrations (dev
  has 0001–0076) and no Edge Functions. Nothing unpushed.
- 2026-10-19: The lint hook works (`.claude/settings.json` → `.claude/hooks/lint-edit.mjs`): an Edit adding an unused
  `const` to `scripts/live-check.mjs` came back at once with `no-unused-vars` at 13:7, as a blocking hook error.
  The probe line was taken out straight after; no file changed. A passing edit gives no message.
- 2026-10-18: Help: `README.md` "A buy's ⋯ menu" has a **Convert to collection** row (decision 335), and the struck
  cards and locked lines name it next to Convert to project.
- 2026-10-18: The pre-push review's three notes fixed:
  - `.claude/skills/release/SKILL.md`: the record edits (steps 2 and 3) stay uncommitted until the review (now step
    4) has seen them, then step 5 commits them; the steps after are renumbered (secrets 6, push 7, deploy 8, Edge
    Functions 9, live check 10, report 11);
  - the same file, step 8: the deploy run is found by the pushed commit (`gh run list --commit "$sha"`), and its
    success with a matching `headSha` is the proof; step 10 says a no-bump push with no new text can't be told
    apart by the live check;
  - `scripts/live-check.mjs` line 43: chunk names may contain hyphens.
- 2026-10-18: pug-reviewer reached from a session started in this folder (first use): it loaded with Read, Grep,
  Glob and Bash, read CLAUDE.md and reviewed the one unpushed commit (`df6f846`, NEXT.md only). One docs note: the
  push entry below says "five small notes" but Open lists three, and "Nothing unpushed" is stale until the next push.
- 2026-10-18: Pushed without a bump (the release skill's first run): the CLAUDE.md rules and cleanup, NEXT.md, the
  release skill and `scripts/live-check.mjs`, the lint hook, pug-reviewer, the review checkpoints, the date fixes.
  The pre-push review found nothing that stops a push; its five small notes are in the push report. Nothing
  unpushed.
- 2026-10-18: pug-reviewer wired in at the two regular points: before every push (release skill step 1b; a
  confirmed serious finding stops the push) and before every migration is applied to dev (CLAUDE.md, Database,
  step 1).
- 2026-10-18: The standard review agent: `.claude/agents/pug-reviewer.md` (read-only tools, this project's rules,
  ranked findings, no fixes); listed in CLAUDE.md "Where things are". First use: in a session started in this
  folder (this session started in `klug alters`, so it can't load it).
- 2026-10-18: The review's 13 findings fixed:
  - the release skill (`.claude/skills/release/SKILL.md`): a secrets check for real keys only, on added lines (no
    hits in all of history; catches fake keys); the push recorded in NEXT.md and CLAUDE.md "Where it stands" before
    it, so nothing's left unpushed; Edge Functions checked in pre-flight for both modes; the live site's project
    read from the repo variable (`gh variable get VITE_SUPABASE_URL`), not hard-coded; `git fetch`; tags sorted by
    date; the store's date from `date +%F` (Git Bash doesn't know `America/Los_Angeles`);
  - `scripts/live-check.mjs`: the live check reads every chunk, following references (9 of 9);
  - the hook (`.claude/hooks/lint-edit.mjs`): files on another drive skipped; Python checked with `compile()`, no
    `__pycache__`, skipped when there's no Python; an ESLint failure reported back (exit 2); `.claude/settings.json`
    pinned to bash, with `node` found even off the PATH;
  - the hook commit and its ESLint fix folded into one (`a47a862`), so no commit fails lint alone;
  - 99 dates in 40 files corrected from 2026-10-19 (UTC) to 2026-10-18 (two applied migrations left as run);
  - CLAUDE.md: no `sed -i` on source files; Claude's own memory notes on this project are allowed.
- 2026-10-18: Review of the unpushed diff (read-only, a review agent).
- 2026-10-18: CLAUDE.md cleaned up: the release history cut to a short "Where it stands", stale lines fixed (the
  Changelog lock is 0002; one small change at a time instead of phases), the duplicate QA line gone and the browser
  rule's one exception spelled out, the rules from memory added (Help edits only when asked, nothing about the AI
  in team write-ups, one-pager style, the JustTCG key and store password, the migration routine, scratch files),
  the retired-doc pointers in one line and a start-of-session order.
- 2026-10-18: NEXT.md started, and CLAUDE.md told to read it first.
- 2026-10-18: jq 1.8.2 installed (winget `jqlang.jq`); on the PATH for new sessions.
- 2026-10-18: Lint hook: `.claude/settings.json` + `.claude/hooks/lint-edit.mjs` (`a47a862`).
- 2026-10-18: Release skill: `.claude/skills/release/SKILL.md` (`9769a39`).
- 2026-10-18: CLAUDE.md: QA Handoff (pre-commit lint, tests, build stay), Writing Code Files, UI Sizing & Layout
  (`bbf06b4`, `aeccf61`).
- 2026-10-18: Pushed without a bump through `d565452`: 332 squash renumbered to a 0001 baseline, 333 default
  rates 33.34/66.68, 334 one-pass smoke test, 335 Convert to collection (migration 0076 on dev), 336 five finished
  docs retired.
