# NEXT

What's open, newest first. Claude reads this at the start of every session and tells the owner what's open, then
marks each task done here when it's finished, with the exact file and function of anything left. Older history:
`git log -p NEXT.md`, the spec's numbered decisions and `git tag`.

## Open

- **Unpushed** (main session): decisions 541–543: work mode's three fixes, CLAUDE.md trimmed and three sections
  moved (docs and `.claude/` only), and NEXT.md's notes.
- **Skip pricing's rough edges** (the owner, 2026-10-26: "I want to fix this soon"; from the v1.0.5-rainbow
  review): SAVE EDIT on a priced card while Skip pricing is on clears its price with no warning
  (`PricingScreen.jsx` ~615, as decision 514 says; Buy tab); an unpriced card's edit reads "$0.00" in the
  Changelog (`collection_update_line` logs `unit_price` 0; only 0012's add logs none; the remove, strike, restore
  and export rows too). No migration (the owner, 2026-10-26): the first by the owner's rule, "an unpriced card can
  never be saved on top of an already priced one" (SAVE EDIT keeps the line's price fields unless a price was
  typed; Buy tab); the second in the app, the Changelog hiding a row's price when it's exactly $0
  (`ChangelogPage.jsx` ~452; Records), if the owner agrees.
- **From the 2026-10-26 review of work mode, still open** (main session, decision 540; the rest fixed by 541): a
  fork's prod or delete approval relayed by message isn't the owner's consent to the harness, so it may stall on a
  prompt in its own chat; whether the UserPromptSubmit hook fires on a turn started by a message is untried;
  `/main`'s hub jobs don't list relaying questions.

- **From the v1.0.5-rainbow review, not acted on** (main session): the Secret Lair foils list's generator sits
  outside the repo (`C:/ClaudeProjects/temp/sld-foils`, `src/lib/sldFoilProducts.js:12`; passed to the Buy tab
  session 2026-10-26, "Go ahead and move it"); `OwnedCounter.jsx`'s header comment still puts Apply in the verdict
  line (decision 521 moved it). The Skip pricing items: their own entry above. The collection SKU `-1` vs `-10`
  search: closed, the owner checked it in CC.
- **For a migration, when there's a reason to write one** (0014 or later):
  - F2, the backup's 8 s statement limit (decision 430): `backup_export` (one call for every table, 2 to 7.7 s on
    dev) can time out; the fix must keep one read at one instant, so it needs the database. The test run's Backup
    pass hit it once (`restore_backup`, `staff_users`) and passed on the retry.
- **Matching leftovers (decisions 484–487):**
  - The two wrong exported lines' stamps on prod stay unless that day's file must be downloaded again
    (`git show 681c5c6:MATCHING.md`, item 3).
  - From 0010's review: the test-run check of an `auto` sent over a staff row is done (decision 515, Export
    session). ("Retro Schematic": done, decision 516.)
- **The owner's part of the smoke test** (`docs/TEST.md`, dev only): section 10 (the phone), the two-computer and
  network-off cases, and section 19.
- **Copies we own: ×0 vs ×1 on this printing's row** (the owner's, Buy tab; decision 520's "none" was rolled back,
  it took too much room): tell ×0 from ×1 on that row in a way that takes no more room (`OwnedCounter.jsx`, the
  rows' render).
- **Known limit, left as is:** how long a copies-we-own count takes on the live site isn't measured.

## Done

- 2026-10-26 (Buy tab session): **The Secret Lair foils generator in the repo** (decision 544; the owner's ask through
  the main session, "Go ahead and move it"): `scripts/sld-foils.mjs` is the temp folder's rainbow.mjs and
  write-sld.mjs as one script (the second only formatted the first's output, so there's no map file between them):
  it reads TCGplayer's Secret Lair groups from tcgcsv.com, pairs each plain product with its "(… Foil)" sibling,
  checks the pairs against Scryfall, and rewrites only the Generated paragraph and `SLD_FOIL_PRODUCTS` in
  `src/lib/sldFoilProducts.js` (`patchModule` stops unless it finds exactly that part; the old writer templated the
  whole module, functions included, so an edit to them would have been lost at the next run). The module's header
  points at the script. Tests in `tests/sldFoils.test.js`: the pairing, the paragraph, the patch, and that the
  module on disk has the part the script looks for. Run once after the move: the same 673 pairs and 533 of 605
  covered as on 2026-10-24, so only the module's header changed ("Generated 2026-10-26"); 226 foil products with no
  plain sibling (Halo Foils and the like) stay unpaired, as before. Where to look: `node scripts/sld-foils.mjs`
  prints each group's pairs and the Scryfall coverage, then "Wrote src/lib/sldFoilProducts.js"; the app is
  unchanged. Left: the temp copy `C:\ClaudeProjects\temp\sld-foils` stays (the owner's to delete); no TEST.md case
  (a dev script, nothing staff see). No migration.
- 2026-10-26: **Closed by the owner** (main session, from its brainstorm of what's missing): a collection SKU
  `102426-1` in CC's search finds only itself, not `-10` and up (the owner checked it: "This worked"); Pokémon on
  the phone scanner, and a third game (One Piece, Lorcana): "Never going to happen" (a memory note, decision 517);
  a trimming pass on the process docs: done (542, 543). The brainstorm's other ideas aren't items until the owner
  picks one.
- 2026-10-26: **CLAUDE.md trimmed and three sections moved** (side session, the owner's ask; decisions 542, 543):
  20,268 → 14,170 bytes, 268 → 200 lines (30%). The wording pass kept every rule (merged bullets, dates dropped
  only beside a decision number); then the Database steps, CLI link, `internal` schema, gotchas and squash moved
  to `docs/DATABASE.md` (read before any migration work), Work mode's four bullets to
  `.claude/skills/workmode/SKILL.md` (What changes while it's on; the hook's line now names it), and the 0002–0013
  history to a pointer. Where to look: CLAUDE.md's Database and Work mode sections, each a pointer plus the rules;
  `docs/DATABASE.md`. Untested: whether a fork reads `docs/DATABASE.md` before its next migration, and the skill's
  rules section the next time work mode is on; the hook's dry run passed (a 12-hour-old switch file stayed silent,
  a fresh one printed the new line). No migration. Unpushed: df651cb, 46ad15a, 68c3065, 0322493 and this entry.
- 2026-10-26: **Work mode for forks only, for 12 hours, never a new item** (decision 541, the owner's ask, main
  session): `.claude/hooks/workmode.sh` (run by both hooks in `.claude/settings.json`) says the line is for the four
  area forks and goes quiet once `.claude/workmode` is 12 hours old; CLAUDE.md's Work mode: the 12 hours, forks
  only, and a blocked fork carries on with its current task or waits; `.claude/skills/workmode/SKILL.md`: the switch
  at the repo's root, the 12 hours in on and the status. The 12 hours is my pick, not the owner's. Tried: the script
  with no file, a fresh one, 11 and 13 hours old, both path styles (all exit 0, quiet at 13). Where to look:
  `/workmode on`, then a fork's turn shows the new line; `/workmode` the next day says it ran out. Untried in a real
  session (hooks load at a session's start). No migration.

- 2026-10-26: **Pushed without a bump** (the owner's ask), decisions 539–540: the Home Screen icon and the name
  "PUG Scanner" on a phone (539, `public/apple-touch-icon.png`, `index.html`), and work mode (540: `/workmode`, its
  hook and CLAUDE.md's rules; `.claude/` and docs only). No migrations (dev and prod both 0001–0013), no Edge
  Function changes. Nothing unpushed.

- 2026-10-26: **Work mode, `/workmode on` / `off`** (side session, the owner's ask; decision 540): the switch is
  `.claude/workmode` (git-ignored); `.claude/skills/workmode/SKILL.md` writes or deletes it and tells each running
  fork; the UserPromptSubmit and SessionStart hooks in `.claude/settings.json` add "Work mode: on since …" to
  every turn while it exists; CLAUDE.md, Work mode: on, a fork's questions go to the main session with its pick, a
  blocked fork reports and keeps working, reversible in-area choices are the fork's ("picked in work mode" in its
  Done entry), outward-facing actions still wait. Where to look: in the main session, `/workmode on`, then any
  turn in any session shows the line; `/workmode off` clears it. Untested: the hook's dry run passed (silent
  without the file, one line with it); not yet seen whether the hook fires on a turn a fork starts from another
  session's message (the CLAUDE.md check of the file is the fallback); the skill not run. No migration. Remote
  Control stays the owner's own setting. Pushed 2026-10-26.
- 2026-10-25: **A Home Screen icon and name on a phone** (decision 539, the owner's ask, main session):
  `public/apple-touch-icon.png` (the logo on `--bg`, 180 × 180, opaque) and two tags in `index.html`
  (`apple-touch-icon`, `apple-mobile-web-app-title` "PUG Scanner"; the name was my pick, the owner didn't choose
  one). TEST.md case in section 10. Where to look: once pushed, the live site in Safari on an iPhone → Share → Add
  to Home Screen: the name PUG Scanner and the logo, not a grey "P" (a shortcut added before keeps its old icon:
  remove it and add it again). Untested on a phone. No migration.

- 2026-10-25: **Pushed without a bump** (the owner's ask, the review skipped on the owner's word), decision 538:
  Mark as Priced and Mark as Paid/Ours show the rates the list pays, and the credit offer's ratio (`590e3ca`,
  Records). No migrations (dev and prod both 0001–0013), no Edge Function changes. Nothing unpushed.

- 2026-10-25 (Records session): **Mark as Priced shows the rates the list pays** (decision 538, the owner's ask):
  Cash and Credit in Mark as Priced and Mark as Paid/Ours read each total over Market (`listRates`,
  `src/lib/rates.js`; `Quote`, `src/pages/collections/DealModals.jsx`), and the hint names the ratio the credit
  offer uses ("the cash offer × 1.79"). No migration. Where to look: a Processing collection with low-end or
  high-end cards → Mark as Priced → the two percentages and the hint; a list all on the master rates still reads
  33.34% / 66.68% and × 2. Untested in the app.
- 2026-10-25: **Pushed without a bump** (the owner's ask, the review skipped on the owner's word: "the changes are
  tiny"), decisions 527–537: the rules for the main session and its forks (527–535, docs and `.claude/` only), the
  launch clean-up (536) and the rollback point's records, and the Copies we own box's stamp 5px lower with this
  printing's full name on pointing (537, Buy tab). No migrations (dev and prod both 0001–0013), no Edge Function
  changes. Nothing unpushed.
- 2026-10-25: **The box's stamp a little lower; this printing's full name on pointing** (decision 537, the owner's
  ask, Buy tab session): `owned.css` `.owned-body .stamp-btn` 5px lower (measured), `ownedRates.js` `ownedRows`
  title. Untested in the app.
- 2026-10-25: **A rollback point at v1.0.5-rainbow** (main session, the owner's ask): the local tag
  `rollback-v1.0.5-rainbow` (`3c226bb`, the app the same as v1.0.5-rainbow's `2077f69`; never pushed) and
  `C:\ClaudeProjects\pug-pricing-tool-backups\backup-20261025-005622-rollback-v1.0.5-rainbow\`: the project copy
  (`.git`, `.env*`, `supabase\.temp`; no `node_modules` or `dist`), `pug-pricing-tool.bundle` (`--all`, verified),
  `db-test-run-dev.json` (641 checks, all passed) and `README.txt` with the roll-back steps. Not in it yet: the
  data backups, the owner's to download (Settings → Download backup, the live site for prod and localhost for
  dev) into that folder. No migration. Unpushed.

- 2026-10-25: **The launch clean-up** (main session, the owner's ask; decision 536): the PUG scratch from finished
  work in `C:\ClaudeProjects\temp`, `temp\pug-squash` and the three pre-launch project copies in
  `C:\ClaudeProjects\pug-pricing-tool-backups` sent to the Recycle Bin (the owner empties it); the tags
  `pre-squash`, `rollback-pre-squash`, `rollback-pre-launch` and `pre-export-build` deleted (commits in the
  decision row). Where to look: those folders, `git tag`. Still the owner's call: `scripts/pokellector-jp.mjs`,
  `scripts/scan-benchmark.mjs` with `temp\line-fixtures`, `title-fixtures` and `scan-run`, and the 2026-10-09
  card-data downloads in temp (`scry_names.json`, `tcgdex_*.json`, `ptcg_sets.json`). No migration. Unpushed.

- 2026-10-25: **After a compaction, re-read the area's state** (side session, the owner's ask; decision 535):
  CLAUDE.md, Working beside the other sessions, one bullet: before the next edit after a compaction, re-read
  NEXT.md's entries for your area and the `/main` skill's area table. Where to look: that section. Untested: seen
  the first time a fork compacts. No migration. Unpushed, with the entries below.
- 2026-10-25: **Three more fork rules** (side session, the owner's ask; decisions 532–534): CLAUDE.md, Working beside
  the other sessions: stage and commit in one call, never `-A`, `.`, `-u`, `commit -a` or `--amend`, and never
  stash, reset, `checkout --`, restore or clean (532); the NEXT.md section: a Done entry carries where to look,
  what's untested and the migration number, so the QA table reads from NEXT.md (533, `/main` section 3 updated);
  Outside your area: `git status --short <path>` before editing another area's file, message and wait if it's
  modified (534). Where to look: the three CLAUDE.md sections named. Untested: whether forks follow them is seen
  in their next commits and entries. No migration. Unpushed, with the entries below.
- 2026-10-25: **The QA table; three tries at a failing check** (side session, the owner's ask; decisions 530, 531):
  `.claude/skills/main/SKILL.md` section 3, one table of everything since the last push when the owner asks what's
  ready to QA and before each push; CLAUDE.md, Checks: three failed fixes, then stop and say. Not tried yet: the
  first QA table comes from the next `/main` session. Unpushed, with the entries below.
- 2026-10-25: **Migration numbers read from disk** (side session, the owner's ask; decision 529): CLAUDE.md, Working
  beside the other sessions: the next migration is the one after the last file in `supabase/migrations/`, committed
  at once to claim it. The suggested HANDOFF.md not made (529 says why). Unpushed, with the entry below.
- 2026-10-25: **The main session starts with /main; a hook runs the tests an edit can affect** (side session, the
  owner's ask; decisions 527, 528): the fork table and briefs moved from CLAUDE.md to `.claude/skills/main/SKILL.md`
  (only the owner can run it), so a session without a task no longer forks; `.claude/hooks/test-edit.mjs`, the
  second Edit / Write hook in `.claude/settings.json`, runs the tests that import the edited file (directly or
  through others) and passes a failure on as a note. Not tried yet: the next `/main`, and the hook's first edit
  in a new session (hooks load at a session's start). Unpushed: 477dc49, 491f4ff and this entry.
- 2026-10-25: **Pushed as v1.0.5-rainbow** (the owner's ask), decisions 507–526: the stale-page reload message
  (507); the owner's six items: the printout's Showcase only (508), the details folding on ADD CARD (509), Secret
  Lair foils priced from their own product (510), collections' and projects' Custom SKUs numbered by the day (511),
  Phyrexian, Dwarven and Elvish printings in English searches (512), projects that skip pricing (513, 514), with
  a TCGplayer-only Pokémon card added unpriced keeping its JustTCG id (526, the pre-push review's finding, Buy tab);
  `master_inventory_abort` retired and an automatic match over a staff pick checked (515); "Retro Schematic" as
  Retro Frame and a schematic family (516); memory notes the main session's (517); the Copies we own box redone
  as one verdict and one list (518–525, 520 rolled back); Help brought up to date for Copies we own, the numbered
  Custom SKUs and Skip pricing. Migrations 0011–0013 went to prod first, the same night (structure-only compare
  the same); no Edge Function changes. Nothing unpushed.

- 2026-10-24 (Records session): **Help says how Skip pricing works** (decisions 513, 514, the owner's ask):
  `README.md`, A collection → **Skip pricing**, a new section between REPRICE? and EXPORT (the switch, the Price
  screen while it's on, the list's — and the Not priced row, EXPORT, REPRICE?, Convert to buy), with a line and a
  link in REPRICE? and Convert to buy…; its own Help page (`src/pages/help/pages.js`, `skip-pricing`).
- 2026-10-24 (Export session): **Help says how collections' and projects' Custom SKUs are numbered** (decision
  511, the owner's ask): `README.md`'s The file → Custom SKU row, Confirm's summary (`102426-#`), Undo export… and
  the collection's list heading.
- 2026-10-24: **Help's Copies we own brought up to date** (the owner's ask, Buy tab session): `README.md` Buy →
  Copies we own for decisions 500 and 518–525 (one verdict and one list, the full CC name on this printing's row,
  the plain Apply under the boxes and the stamp in the box, reasons one to a line, no amounts, "?"). Settings →
  Copies we own needed no change.
- 2026-10-24: **Today's work tested by the owner** (main session): the six items (508–514), Retro Schematic (516)
  and the Copies we own box (518–525), tried in the app as they landed. Closed.

- 2026-10-24: **The stamp a little smaller; Credit / Cash always one line** (decision 525, the owner's ask, Buy tab
  session): `owned.css` `.owned-body .ink-stamp` 170 → 160px (measured with the bold line), `.owned-rates` nowrap.
  Untested in the app.
- 2026-10-24: **The box's stamp as big as its room** (decision 524, the owner's ask, Buy tab session): `owned.css`
  `.owned-body .ink-stamp` 100 → 170px, measured on a rebuilt box (the live one needs the store's sign-in).
  Untested in the app.
- 2026-10-24: **The box's Credit / Cash without their amounts** (decision 523, the owner's ask, Buy tab session):
  `OwnedCounter.jsx` `rates`, its `price` prop dropped (and `PricingScreen.jsx`'s). Untested in the app.
- 2026-10-24: **The box's reasons one to a line** (decision 522, the owner's ask, Buy tab session):
  `ownedRates.js` `ownedReason`, `owned.css` `.owned-why`. Untested in the app.
- 2026-10-24: **A plain Apply button under the boxes, the stamp in the box** (decision 521, the owner's ask, Buy tab
  session): `OwnedCounter.jsx` (`applyButton`, `stampButton`), `owned.css` (`.owned-apply`, `.owned-body`).
  Untested in the app.
- 2026-10-24: **Rolled back: "none" for ×0 on this printing's row** (decision 520, the owner's call, Buy tab
  session): `75c70ca` reverted, it took too much room. Telling ×0 from ×1 on that row: under Open.
- 2026-10-24: **This printing's row names its CC product in full** (decision 519, the owner's ask, Buy tab
  session): `ownedRates.js` `ownedRows`, "Wrath of God · Fourth Edition" on the "this printing" row only. Untested
  in the app.
- 2026-10-24: **The Copies we own box as one verdict and one list** (decision 518, the owner's pick of six mockups,
  https://claude.ai/artifact/5ZCfQSxyU9tfb6gBpD2gJf, Buy tab session): `OwnedCounter.jsx` box rebuilt;
  `ownedRates.js` `ownedRows` (one list, this printing first, its product at ×0 when none) and `ownedReason` (the
  one-line why), tested in `tests/ownedRates.test.js`; `owned.css` new rules, the old box's dropped. Untested in the
  app. Help's Copies we own section now describes the old box.
- 2026-10-24: **Closed, accepted** (the owner's call, main session): the app can't tell when CC's CSV was taken, so
  cards exported between downloading it and uploading it count as in it (`owned_copies` compares `cc_exported_at`
  with `uploaded_at`). The owner uploads right after downloading and never exports in between.

- 2026-10-24: **Closed** (the owner's call, main session): won't fix, Scryfall's other promo types as matching
  families (`planeswalkerdeck`, `gameday`, `storechampionship` and the rest; about 8 of dev's asks, under the
  owner's 20-card bar). Accepted as is: `settings_log` taking the app's sentence as written (the key and match
  entries guarded only by the app); the `settings_save` first-save race tested one save after the other; a `.gz`
  left in the `master-inventory` bucket if the clearing's last answer is lost (`pruneProducts`).

- 2026-10-24 (Export session): **`master_inventory_abort` retired, and an `auto` over a staff pick checked**
  (decision 515, the owner's ask): migration 0013 drops it, on dev; its test-run checks and its place in the
  security-definer list are gone (prune's checks cover both cases); the test run's Export section sends
  `internal.export_learn` an `auto` over a staff pick and checks the pick is left as it was. Test run after 0013:
  `C:/ClaudeProjects/temp/pug-dbrun-0011-0013.json`.
- 2026-10-24: **"Retro Schematic" read as Retro Frame and a schematic family** (decision 516, the owner's ask, Buy
  tab session, in Export's files): `ccMatch.js` `FAMILIES` (`schematic`, joining `retro`) and `evidenceTreatments`
  (`isSchematic`: BRR from 64 on); `importMatch.js` `printingLine` and `scorePrinting` read a printing's Scryfall
  facts as the export does. Tests in `tests/retroSchematic.test.js` and `tests/ccMatch.test.js`. Untested in the
  app (dev has no BRR line).
- 2026-10-24: **Closed, won't fix** (the owner's call, main session): about 15 CC products with "Foil" stuck on
  the name without " - " stay unfound by name at export and in Copies we own (Needs a choice / n/a, never a wrong
  match; only the under-$10 list drops it, decision 498); reopening a closed customer search shows Show all off
  until a letter is typed (`SearchBox.jsx`); CONFIRM BUY's dialog possibly closing when a reconnect lands during
  its read-back (`useDraft.js`, plausible, never seen).

- 2026-10-24: **Skip pricing on the Price screen** (decision 514, item 6 part 2, the owner's ask, Buy tab session):
  `PricingScreen.jsx` reads `list.skipPricing`; `usePriceQuote.js` asks `usePrices` for nothing then (status
  'skipped', no fallback, Cardmarket or warnings); `usePrinting.js` runs no TCGplayer versions search by itself;
  ADD CARD and SAVE EDIT build the line unpriced (`buyLine.js` `buildLine`'s `unpriced`, `unpriced.js`
  `unpricedFields`) unless a manual price is typed; `useScanReceiver.js` adds a phone's scan unpriced and tells the
  phone no price (`priceOf`); `PriceTable.jsx` and `QuotePanel.jsx` say "⚡ Skip pricing is on". Tests in
  `tests/unpriced.test.js`. Needs migration 0012 on prod before it's pushed (the main session's). Untested in the
  app.
- 2026-10-24 (Export session): **A collection's or project's Custom SKU is its day and its number that day**
  (decision 511, the owner's item 4): "102426-1", "102426-2", collections and projects counted together, from 1
  each store day. Migration 0011 (`internal.collection_sku_days`, `internal.collection_sku`, the collection branch
  of `public.export_lines`), on dev; the Confirm step shows "102426-#" (`massCreate.js` `confirmSku`,
  `ExportDialog.jsx`). Tests: `tests/export.test.js`, the test run's Export and Security sections. Untested in the
  app. For the owner to decide: whether Can't upload cards and Bulk pulled from exports get numbers too (now
  today's date, as before); a collection or project exported twice the same day (a project in two batches) gets two
  numbers; a file-only download keeps today's date. Help's The file → Custom SKU row (`README.md`) is out of date.
- 2026-10-24 (Records session): **Projects that skip pricing, part 1** (decision 513, the owner's item 6):
  migration 0012 (`buys.skip_pricing`; `price_source` `'unpriced'` at $0; the trigger
  `buy_lines_unpriced_in_project`; `collection_update_info` takes the switch, `collection_add_line` logs no price),
  reviewed and rehearsed. The switch is in a Paid/Ours project's banner (`CollectionDetails.jsx`); the list shows
  — and a Not priced totals row (`BuyList.jsx`, `src/lib/unpriced.js`); REPRICE? and both Convert to buy… items
  stop with why (`CollectionPage.jsx`, `RowAction.jsx`). Test-run section "Skip pricing (0012)". On dev with
  0011 (the Export session's push, snapshot and test run: all passed, its 13 checks too); **not on prod yet**, with
  0011. Left as is: a card with no price reads "Bought $0" in the export dialog (`ExportDialog.jsx`, the Export
  session's) and $0 in the Changelog's remove, edit and export rows (only the add's row shows none); a Pokémon
  one with no price today prints a 50¢ sticker. Part 2, the Buy tab's: `PricingScreen` reads `list.skipPricing`
  and sends `price_source: 'unpriced'`, `unit_price: 0`, `market_price: null` (`UNPRICED`, `src/lib/unpriced.js`);
  phone scans into the project too. Untested in the app.
- 2026-10-24: **Phyrexian, Dwarven and Elvish printings in English searches** (decision 512, the owner's ask, Buy tab
  session): `scryfall.js` `keptLanguage` keeps `ph`, `dw` and `qya` (`KEPT_LANGUAGES`), so the Buy tab, the
  details' siblings and Import Collection find them; `printings.js` `magicTraits` gives each a language trait;
  `ccMatch.js` reads CC's " - Phyrexian" as a family (`LANGUAGE_FAMILIES`). Tests in `tests/packLanguages.test.js`.
  Left as is: no tag on the line or a JP-style badge on the suggestion (the line stays `lang` en; the database
  allows only en and ja), and the phone scanner's own name search (`src/scan/`) wasn't looked at. Untested in
  the app.
- 2026-10-24: **Secret Lair foils priced from their own product** (decision 510, the owner's ask, Buy tab
  session): `src/lib/sldFoilProducts.js` (`SLD_FOIL_PRODUCTS`, 673 pairs from TCGplayer's catalogue via
  tcgcsv.com; `sldFoilLookup`, `sldFoilResult`) wired into `prices.js` `lookupsFor` and `resultFor` beside the
  surge foils; tests in `tests/sldFoil.test.js`. No JustTCG call was made to check it, so whether JustTCG prices
  each foil product is untested; 72 of Scryfall's 605 SLD foils with no price aren't covered (most have no
  TCGplayer product on Scryfall). A new drop needs the table made again: `C:\ClaudeProjects\temp\sld-foils\`,
  `node rainbow.mjs` then `node write-sld.mjs`. Untested in the app.
- 2026-10-24 (Records session): **Adding a card folds a collection's details** (decision 509, the owner's item 3 of
  6): `CollectionPage.jsx`'s `list.add` counts each add that went through (`folds`); `CollectionDetails.jsx` folds
  on each new count, even if reopened. Covers ADD CARD, Enter and a phone's scan (all through `list.add`),
  overnight buys and projects; SAVE EDIT doesn't fold. `PricingScreen.jsx` unchanged. TEST.md case in section 11.
  Untested in the app.
- 2026-10-24 (Export session): **A showcase card prints as Showcase, never Borderless too** (decision 508, the
  owner's ask, item 2 of 6): every Magic printout drops Borderless from a line that's also Showcase
  (`src/lib/auditPrint.js` `printedTreatments`, used by `auditRow`; test in `tests/auditPrint.test.js`); the Price
  screen and the stored treatments are unchanged. TEST.md case in section 14. Untested in the app.
- 2026-10-24: **A page opened before a push says to reload** (decision 507, the owner's report from work, main
  session): Print MTG on a tab opened before the 11:05 push failed with "Failed to fetch dynamically imported
  module" (the old `auditPdf-DLNn6FRa.js` is a 404 on the live site). `src/main.jsx` listens for
  `vite:preloadError` and `src/lib/staleBuild.js` `explainStaleBuild` (tested) puts the plain words on the
  error, so the toast says to reload (F5). Lint, 503 tests and the build pass; untested in the app. Not
  pushed. Not done: the page doesn't notice a new build by itself; a tab is only told when it next loads a part.
- 2026-10-24: **Pushed without a bump** (the owner's ask), decisions 496–506: `scripts/db-baseline.mjs` retired
  and `.claude/launch.json` ignored (496); Export and printouts: Ctrl+Click Download copies Magic singles under
  $10 (497, 498); Buy tab: the Copies we own box names its Crystal Commerce product (499–504), and the condition
  prices sized to their buttons (505, 506). No migrations (dev and prod both 0001–0010), no Edge Function
  changes. Nothing unpushed. Help out of date: Buy → Copies we own (`README.md`), for the "Crystal Commerce
  Match:" line (499–504) and the new ? "(didn't go through: try again)" (500). The review's other notes, not
  acted on: the under-$10 list drops only a stuck-on " Foil", so a "Galaxy Foil" written without " - " would keep
  "Galaxy" (`underTen.js`); the Ctrl+Click copy likely fails in Safari and Firefox (it runs seconds after the
  click); `priceFit.js`'s widths are Segoe UI's, so a Mac's font may sit closer to the button's edges.
- 2026-10-24: **Condition prices sized to their buttons** (decision 505, the owner's ask, Buy tab session):
  `PriceTable.jsx` `priceStyle` gives the price's width in ems (`src/lib/priceFit.js` `priceEms`, tested in
  `tests/priceFit.test.js`); `conditions.css` `.pc-price` sizes it to 94% of its button (84% at first, decision
  506), 18px at most. Measured
  in the font on dev's sign-in page (the app needs the store's sign-in), not on the live buttons; untested in
  the app.
- 2026-10-24: **"Crystal Commerce Match:"** (decision 504, the owner's ask, Buy tab session): the Copies we own
  box's line in `OwnedCounter.jsx`. Untested in the app.
- 2026-10-24: **The Copies we own box's title a little bigger** (decision 503, the owner's ask, Buy tab session):
  `owned.css` `.owned-pop-head` 12px → 14px. Not measured live (the preview needs the store's sign-in); untested
  in the app.
- 2026-10-24: **The whole matched product in quotes, in blue** (decision 502, the owner's ask, Buy tab session):
  `OwnedCounter.jsx` and `owned.css` `.owned-pop-match-product`. Untested in the app.
- 2026-10-24: **The box's CC product on two lines, its name in blue** (decision 501, the owner's ask, Buy tab
  session): `OwnedCounter.jsx` splits the line; `owned.css` `.owned-pop-match-product` keeps the product on one
  line (… when long), the name bold in `--accent`. Untested in the app.
- 2026-10-24: **A match that didn't go through says so** (decision 500, the owner's ask, Buy tab session): a failed
  match in `owned.js` `lookUp` comes back as `cc_match_failed` and `ownedCopies` doesn't keep it; `ownedRates.js`
  `ownedCounts` gives `matchFailed`; `OwnedCounter.jsx` shows "?" with "(didn't go through: try again)", whose
  click (or the boxes') runs `useOwnedCopies`' `refresh`. Test in `tests/ownedRates.test.js`, case in TEST.md
  section 7. Untested in the app.
- 2026-10-24: **The Copies we own box names its CC product** (decision 499, the owner's ask, Buy tab session):
  `owned.js` `lookUp` returns the matched product as `cc_match`, `ownedRates.js` `ownedCounts` carries it as
  `cc.match`, and `OwnedCounter.jsx` shows "Crystal Commerce: <name> · <category>" under the box's head
  (`owned.css` `.owned-pop-match`), with copies or none; nothing new for n/a or no inventory. Test in
  `tests/ownedRates.test.js`, case in TEST.md section 7. Untested in the app.
- 2026-10-24 (Export session): **Under $10 takes every row, and drops a stuck-on "Foil"** (decision 498, the
  owner's ask): the first list missed about 1,040 names in CC's newer sets, whose URLs lack the
  `magic_the_gathering_singles-` prefix; the URL test is gone (`src/lib/underTen.js` `underTenName`, `STUCK_FOIL`).
  Untested in the app.
- 2026-10-24 (Export session): **Ctrl+Click Download copies Magic singles under $10** (decision 497, the owner's
  ask, a secret like 285): Settings → Master Crystal Inventory's Download, Ctrl or Cmd+Click, copies `1 <name>` a
  line (`src/lib/underTen.js` `underTenName`, `underTenText`, tests in `tests/underTen.test.js`;
  `masterInventory.js` `underTenList`; `MasterInventoryPanel.jsx` `copyUnderTen`). The owner tried it: 3,400 names,
  quick. Not checked: a clipboard refused when the window loses the front during the read (a toast says so).
- 2026-10-24: **`scripts/db-baseline.mjs` retired** (decision 496, the owner's ask): last copy at `a8fb952` (the
  spec's Retired documents row, CLAUDE.md's Where things are); `scripts/lib/linked.mjs`'s comment updated.
- 2026-10-24: **`.claude/launch.json` ignored** (the owner's ask): Claude's preview config stays per computer
  (`.gitignore`), so a push's status check is empty. The v1.0.4-setup review's other notes closed by the owner, no
  change: Help's lone-product and lost-pick wording, `code-map.mjs`'s run-path check.
- 2026-10-24: **Pushed as v1.0.4-setup** (the owner's ask, written "v1.04-setup"; 1.0.4 since npm's versions take
  no leading zero), decisions 489–495: Help's matching sections (484–487), the mixed-rates \* on an all-low-end
  list (489), TEST.md's new cases and SETUP.md's paused-project check, three docs retired (490), CODE_MAP.md for
  new sessions (491), the main session with its four forks (492–494), and a new session reading the release skill
  and the reviewer (495). No migrations (dev and prod both
  0001–0010), no Edge Function changes. Nothing unpushed.
- 2026-10-24: **Outside your area, and when sessions message** (decision 494, the owner's ask): CLAUDE.md's two new
  sections under Start of a session replace the fork brief's "say so before changing anything outside it" and the
  Passing tasks on bullet. Not tried yet.
- 2026-10-24: **Tasks passed on by the main session** (decision 493, the owner's ask): CLAUDE.md, Working beside
  the other sessions: a task the main session passes to a fork, quoting the owner, counts as the owner's; a fork
  still asks before a push, a prod migration or deleting data. Not tried yet.
- 2026-10-24: **The main session and its four forks** (decision 492, the owner's ask): CLAUDE.md, Start of a
  session: a new main session forks Buy tab, Records, Export and printouts, and Phone scanner after its reading,
  with the rules for sharing one folder (decision numbers read from disk, NEXT.md and TEST.md edited in small
  pieces, files staged by path, only the main session pushes). Not tried yet: the next new session is the first
  to start the forks.
- 2026-10-24: **CODE_MAP.md for a new session, not a fork** (decision 491, the owner's ask): `scripts/code-map.mjs`
  (`buildMap`, `headerOf`, `exportsOf`; tests in `tests/codeMap.test.js`) writes the spec map and the code map;
  `.gitignore` keeps it out of git; CLAUDE.md's Start of a session runs it in a new session only. 25 files have no
  header comment or exports, so their line is the name alone (most pages, e.g. `DayPage.jsx`); a header added
  later shows up the next time the map is built.
- 2026-10-24: **Three finished docs retired** (decision 490, the owner's ask): `MATCHING.md`, `SQUASH.md` and
  `docs/TEAM_FEEDBACK.md`, last copies at `681c5c6` (the spec's Retired documents row). SQUASH.md's live facts
  moved first: the migration gotchas to CLAUDE.md's Database section, prod's Max rows to `docs/SETUP.md`.
  References fixed in CLAUDE.md, FABLE.md, TEST.md, SETUP.md and pug-reviewer; code comments keep citing them, as
  with decision 336.
- 2026-10-24: **NEXT.md trimmed**, on the owner's ask (630 lines to about 60): closed items and the Done history
  before v1.0.3-neverguess dropped (in git). Closed by the owner: the live site's setup (the computer named, the
  users added, the CC CSV uploaded, which also starts the copies-we-own counts and clears the second inventory
  copy, decision 414), past totals under the new rounding (478), the backup key's missing meter (436–439), and
  watching JustTCG usage.
- 2026-10-24: **SETUP.md's paused-project check writes nothing on prod** (decision 380): look at Settings and the
  Changelog; no test card, no Test (both move the usage counter, `secrets` `call`'s `record`). Also in TEST.md:
  the store's phone case runs on dev's LAN link.
- 2026-10-24: **TEST.md cases** for decisions 374, 426, 427, 430, 436–445 and 489, and two brought up to date: the
  stamp's press-down (488) and a click on a menu group (442). 269 cases.
- 2026-10-23: **A list whose every card is low-end shows its mixed-rates \*** (decision 489, the owner's ask):
  `rates.js` `mixedRateLines` is empty only when every card is on the list's own rate; a buy-wide custom rate
  still has none. Two unit tests (`tests/rates.test.js`). Lint, 488 tests and the build pass; untested in the app.
- 2026-10-23: **Help brought up to date for the never-guess matcher** (decisions 484–487, the owner's ask,
  `README.md`): Export → 1. Matching's steps and Picking the product (the three cases it takes a product by
  itself, extra words, the Scryfall facts), Remembered matches, and Settings → Crystal Commerce matching's
  Products row.
- 2026-10-23: **Pushed without a bump**, decision 488: the APPLIED / NOT APPLIED stamp presses down when it lands
  (`owned.css` `stamp-in`). No migrations, no Edge Function changes.
- 2026-10-23: **Pushed as v1.0.3-neverguess**, decisions 484–487: the export never guesses a Crystal Commerce
  product; only staff picks are remembered and used; a lost staff pick is asked again. Migration 0010 on dev
  (snapshot, test run: all 626 passed) and on prod the same sitting, the structure-only compare the same. The
  matching audit behind it is `MATCHING.md` (retired, `git show 681c5c6:MATCHING.md`); `C:\ClaudeProjects\temp\pug-matching\` `sweep.mjs` and `rules.mjs`
  re-measure a rule.
