# NEXT

What's open, newest task first. Claude reads this at the start of every session and tells the owner what's open,
then marks each task done here when it's finished, listing anything pending or half-finished with the exact file
and function.

## Open

- **Copies we own (decisions 448–483), live in v1.0.2-quantity, tested by the owner on dev as it was built.** The counter
  (`OwnedCounter.jsx`, `useOwnedCopies.js`, `owned.js`), the suggestion (`ownedRates.js`), Apply and Auto apply
  rates? (`PricingScreen.jsx`, `useScanReceiver.js`, `useDraft.js` `setAutoRates`, `CollectionPage.jsx`
  `list.autoRates`), Settings → Copies we own (`OwnedCopiesPanel.jsx`). TEST.md section 7 and 16 have its cases.
  Not checked: how long a count takes on the live site. Known limit: the app can't tell when CC's CSV was taken, so
  cards exported between taking it and uploading it count as in it. **On the live site the CC counts start with the
  next Master Crystal Inventory upload** (the owner's to do: one uploaded before 0008 has no quantities, so the
  boxes read n/a until then). Help has it (Buy tab and Settings tab → Copies we own).
- **Past totals after v1.0.2-quantity** (decision 478): what's worked out again from saved lines (a past buy's
  Cash/Credit on its day page, a Quote, a folded Changelog run) now takes the new rounding steps, so it can read up
  to 50 cents more (or $4 from $100) than when it was confirmed; a paid price and a buy's own Changelog entry don't
  change. Nothing to do unless the team asks about it.
- **The backup key, left open** (decisions 436–439): there's no usage meter for it (would need a migration; the
  owner: not worth it), and the app isn't told when a call used it (only the `prices` function's log says so). A
  big export on the backup's Free plan can wait on its per-minute limit (`call`'s backoff, `_shared/justtcg.ts`);
  untested how long. TEST.md has no case for it: on dev, it needs the main key capped (or a capped key saved as
  the main one).
- **F2 reopened: the backup can hit the 8 s statement limit** (decision 430): a Download backup failed with a 500
  once, and Restore's first press with "canceling statement due to statement timeout" (`backup_export`, one call for
  every table, 2 to 7.7 s on dev). The paged read that fixed it (decision 426) could leave cards out of the file
  when anything changed while it read, so it was undone. A fix must keep one read at one instant, so it needs the
  database (a migration): take it with the next one, 0010 (0008 is owned copies only, decision 448; 0009 the
  rounding only, 478). The test run's Backup pass hit the same limit once on 2026-10-23 (`restore_backup`,
  `staff_users`) and passed on the retry.
- **From the 2026-10-21 pre-push review, small, not fixed:** reopening a closed customer search shows Show all off
  until a letter is typed (`SearchBox.jsx`, the search effect keyed on `[text, showAll]`); a list whose every card
  is low-end (one rate, not the list's) shows no "*" (`rates.js` `mixedRateLines`, as decision 426 words it);
  TEST.md has no cases for decisions 426 and 427's changes (the lock on a finish switch, CONFIRM BUY closing,
  "Ours", today's prints, Show all staying off, the one-rate *, the Convert count), nor for 430's CONFIRM BUY
  (wifi pulled mid-press so the buy saves and its answer is lost; wifi back: the dialog stays open at 0 cards and
  the next press gives BUY COMPLETE). Plausible, not confirmed: if the connection comes back while that press is
  still checking its own answer, and the check fails anyway, the dialog can still close (`useDraft.js` clears
  `unsure` before `confirm_buy` and sets it again only after `run` returns).
- **Not run by Claude in the 2026-10-21 smoke pass, still the owner's:** section 10 (the phone), the two-computer,
  network-off and store cases.
- **The live site's first inventory upload on v1.0.1-day1** (decision 414): the live site most likely holds a
  second full copy of the Master Crystal Inventory (~152k products) from the owner's timed-out upload on the old
  build, and any uploads since. The first upload from the new build clears them ("Clearing the old file…").
- **For the next migration, 0010, when there's a reason to write one** (the v1.0.1-day1 pre-push review; 0008
  is owned copies only, decision 448, and 0009 the rounding only, 478): retire
  `master_inventory_abort`, unused by the new build (decision 414), with its test-run checks and its place in the
  security-definer list. (The database's "under $1" and "Collection started from…" texts stay: the owner, 2026-10-21,
  "don't bother, no one will ever see that".) A stored `.gz` can be left in the `master-inventory` bucket if
  the clearing's last answer is lost (`pruneProducts`, `src/lib/masterInventory.js`).
- **Settings in the Changelog** (decision 412, migration 0006): from the review, left as is: `settings_log` takes
  the app's sentence as written; the key and match entries are guarded for a user only by the app and
  `settings_log`.
- **From the feedback batch:** the `settings_save` first-save race is tested only one save after the other.
- **After the launch push (v1.0.0-launch, 2026-10-19), the owner's setup on the live site.** Done the same night:
  signed in with prod's store password, the JustTCG key saved and a price came back, so `secrets` and `prices` are
  proven on prod. Left as the owner gets to them: name the computer, add the users, upload the CC CSV; every store
  computer signs in again. The Supabase plan: Free for now (decision 376). The clean-up (the spec's Phase 10 list, `C:\ClaudeProjects\temp\pug-squash\` included)
  waits until prod has run a while.
- **The smoke test pass, the owner's part** (`docs/TEST.md`): Claude ran the rest on 2026-10-21 (Done); left are
  section 10 (the phone), the two-computer and network-off cases, and section 19. On dev only, never the live site
  (decision 380); TEST.md's "pair on the live site's address and scan a stack" case and SETUP.md's "price one card"
  check after restoring a paused project write to prod and need rewording to fit that rule.
- **TEST.md has no case for decision 374** (the launch review): the 🚩 following the press that went through, and
  Confirming… while a later press reads back.
- **After launch:**
  - watch JustTCG usage and the plan (Appendix D 4);

## Done

- 2026-10-23: **Pushed as v1.0.2-quantity** (the owner's ask), decisions 435–483: Copies we own (448, 455–483) with
  its Settings panel, the rounding steps from $10 halved (478), the backup JustTCG key (436–439), the Export
  dialog's held pick and Undo (440–441), the menus' group click (442), the Magic printouts' order and Print MTG /
  PKM in buy order (443–445), accents in searches (446), Alt+A (447), Bulk pulled from exports there from the
  start (449), the weekly inventory banner (451), Unlock undoing an export (452), copies we own loading sooner
  (453), a buy's customer in the header search (454), Magic's promos last (435). First, at 2:00 AM, migrations 0008
  and 0009 went to prod (`db push --linked --project-ref zvxquzcfffmxwizonxuo`); the structure-only compare with
  `C:\ClaudeProjects\temp\dev-run-0009.json` was the same on all nine fingerprints, nothing run or written, and
  prod's `buys` has its one `pulled` System collection. Dev and prod are equal again; the CLI stays linked to dev.
  The `prices` and `secrets` functions deployed to prod with it.
- 2026-10-23: **Small fixes before the push** (the owner's go): a key's Changelog entry names the user picked when
  Save or Delete was pressed (decision 483, `ApiKeysPanel.jsx`); the counter reads "…" while a Magic card's finish
  loads, not "Magic only for now" (482, `useOwnedCopies.js`); TEST.md cases for 466–483 and the rounding, and its
  Pokémon and project lines fixed for 477. NEXT.md tidied: the review's other small edge (a Pokémon buy's Print
  buy offline) was already greyed (`BuyPanel.jsx`, "No connection"), so the item is gone. Unpushed.
- 2026-10-23: **Help brought up to date** on the owner's ask (`README.md`, `src/pages/help/pages.js`): Copies we own
  on the Buy tab and in Settings, each its own page (448–481), the rounding steps (478), and the 2026-10-22
  changes (435, 437–441, 443–447, 449, 451, 452, 454); then, from an audit since the 2026-10-20 sweep, the
  Collections tables' note &#42; and no Notes column (431–434), the mixed-rates &#42; (413), AUTO / OFF on the
  pill (418) and the Can't upload cards message (399). A literal asterisk is written `&#42;`: Help's converter
  shows `\*` with its backslash (CONFIRM BUY's *F* example had that, fixed). Not in Help, on purpose: 442
  (Help already says a click opens a group). Unpushed.
- 2026-10-22: **Alt+A switches mimp mode on the Price screen** (decision 447, the owner's ask), in the hint line
  and the 🌼 | 🦇 tooltips (`PricingScreen.jsx` `onKeyDown`, `SearchBar.jsx`). Lint, tests and the build pass;
  untested in the app.
- 2026-10-22: **Names typed without accents find the cards that have them** (decision 446, the owner's ask):
  "nazgul" finds Nazgûl, "flabebe" Flabébé, from the name lists already loaded (`normalize.js` `accentedWords`,
  `spellingsOf`, `withAccents`; `scryfall.js` `printsQuery`; `tcgdex.js` `searchCards`). Lint, tests and the build
  pass; untested in the app. Left: before the name lists have loaded (the first start), a search goes as typed.
- 2026-10-22: **Printouts** (the owner's ask), three commits, lint, 465 unit tests and the build before each;
  untested in the app:
  - 443: Magic printouts' rows go colour pile > name > collector number inside each category (`byPile`,
    `auditPrint.js`).
  - 444: EXPORT ▾ → ◂ Print → **Print MTG in buy order** on a day and a collection: a row per card as added, no
    bands (`buyOrderSections`, a section's `bare` in `auditPdf.js`, `useAuditPrint.js` `buyOrder`).
  - 445: **Print PKM in buy order**, the same for Pokémon.
  - Left as they were: a buy's ⋯ → Print buy, the print after CONFIRM BUY and the Collections tab's Print
    collection have no buy-order version (the owner: leave Print buy and CONFIRM BUY's as they are); TEST.md has
    no case for any of the three.
- 2026-10-22: **A click on a menu group (◂ Print, ◂ Export, ◂ Convert) keeps its flyout open** (decision 442, the
  owner's ask): `GroupRow`'s click only opens it (`MenuItems.jsx`). Lint, tests and the build pass; untested in the
  app.
- 2026-10-22: **The Export dialog's Needs a choice: a pick holds, then folds away, and Undo last pick** (decisions
  440–441, the owner's ask), two commits, lint, 463 unit tests and the build before each; untested in the app.
  `ExportDialog.jsx` (`hold`, `remember`, `undo`, `inOrder`, `dbLinks`), `export.css` (`.xd-fold`,
  `.xd-choose.held`, `.xd-undo`). Not covered: Undo leaves a set's remembered category saved (it says so); no
  unit test (React only, no logic in `lib/`); TEST.md has no case for either.
- 2026-10-22: **A backup JustTCG key for exports, printouts and REPRICE?** (decisions 436–439, the owner's ask),
  four commits, lint, 463 unit tests and the build before each; untested in the app:
  - 436: the `secrets` function keeps `justtcg_backup`; its Test doesn't write the usage meter (`call`'s
    `record: false`, `_shared/justtcg.ts`). Deployed to dev.
  - 437: Settings → API keys has a **JustTCG backup** row (`ApiKeysPanel.jsx` `PROVIDERS`).
  - 438: `prices` with `backup: true` moves to the backup key on the main key's daily or monthly cap, 20 cards a
    batch (`ask`, `OnBackup`, `supabase/functions/prices/index.ts`). Deployed to dev.
  - 439: `todaysPrices`'s `backup` option, on for EXPORT (`ccExport.js` `sellPrices`), COMPLETE (`DayPage.jsx`
    `complete`), the printouts (`useAuditPrint.js`, `useStickerPrint.js`) and REPRICE? (`RepriceModal.jsx`); never
    the Price screen.
- 2026-10-22: Magic searches, newest first with under 10 printings found, list the normal printings before the
  promos within a rank (decision 435; `cardSearch.js` `rank`, `scryfall.js` `isPromo`).
- 2026-10-21: Pushed, no bump (still v1.0.1-day1), on the owner's ask, without the pre-push review (the owner:
  "skip the normally required review because we just did one a second ago"; that review covered decisions 426–430,
  not these): the four Collections-tab commits, decisions 431–434: no Notes column and its width to the name, a
  note's * with the note in the cards-by-game chip, and its NOTE: badge. No migrations (prod and dev on
  0001–0007), no Edge Function changes. Nothing unpushed.

- 2026-10-21: **A NOTE: badge in the note's chip** (decision 434, the owner's ask): before the note text, shaped as
  MTG / PKM, grey (`CollectionsPage.jsx`, `base.css` `.game-badge.note`). Lint, tests and the build pass; untested
  in the app.

- 2026-10-21: **The note's chip like the cards-by-game chip** (decision 433, the owner's ask): pointing at a note's *
  shows the note in the same floating chip, wrapped at 320 px; the chip's placement shared as
  `src/components/HoverChip.jsx`, which `CardCountsName.jsx` uses too. Lint, tests and the build pass; untested in
  the app.

- 2026-10-21: **A note's * after the name on the Collections tab** (decision 432, the owner's ask): a bold * after a
  name with a note, the note in its tooltip; none on the System rows (`CollectionsPage.jsx` name cell,
  `collections.css` `.note-mark`). Lint, tests and the build pass; untested in the app.

- 2026-10-21: **No Notes column on the Collections tab** (decision 431, the owner's ask): the column and its CSS
  gone (`CollectionsPage.jsx` `columns`, `collections.css`), Name 19% → 29% (`export.css`): 232 px → 353 px at
  1366 wide, measured on dev. Lint, tests and the build pass; not looked at with long names (dev's are short).

- 2026-10-21: Pushed, no bump (still v1.0.1-day1), on the owner's ask: the commits since v1.0.1-day1, decisions
  426–430: the smoke pass's fixes and notes (Show all after a customer search, the Convert count, the buy's undo
  naming Bulk pulled, the one-rate *, the lock on a finish switch, CONFIRM BUY closing when its buy is gone but not
  while a lost answer waits, "Ours" for projects, "are empty", today's prints), TEST.md's reworded cases, decision
  329's note, and Help: "the worker" and they/them, then reworded in the plain style. The paged backup (426) was
  undone before the push, on the review's finding (430): Download backup is the one call to `backup_export`, as on
  v1.0.1-day1. No migrations (prod and dev on 0001–0007), no Edge Function changes. Nothing unpushed.

- 2026-10-21: **Help reworded in the plain style, every fact kept** (decision 429, the owner's ask): `README.md`,
  1,836 lines to 1,850, wording only; headings, links, pictures, keys, amounts and bold labels identical. The fact
  inventory and its walk (1,374 facts, none missing) are in `C:\ClaudeProjects\temp\readme-unslop\`
  (`facts-before.md`, `facts-after.md`). Lint, 464 tests and the build pass; the Help tab itself not looked at.

- 2026-10-21: **Help says "worker", and they/them** (decision 428, the owner's ask): 69 lines of `README.md`;
  she/her became they/them, the person using the app "the worker"; on-screen words (**Pick user**, **N Users
  selected**, the Changelog's **User**) kept as the app shows them.

- 2026-10-21: **The smoke pass's notes N2, N3, N5, N8 and N9** (decision 427). The 🔒 price-source lock is checked
  again on each finish or version (`PricingScreen.jsx` `settledFor`); CONFIRM BUY closes when the draft has no
  cards left (`PricePage.jsx`); projects say "Ours" in the Completed question and Convert to buy's reason
  (`CollectionPage.jsx`); the restore dialog says "are empty" (`BackupsPanel.jsx`); EXPORT ▾ opens on today's
  Magic day with its prints working, the Export items greyed (`DayPage.jsx`). Today's EXPORT and COMPLETE stay
  blocked: they'd need a migration, and the owner closed that ("not important enough for 0008"). Lint, 464 tests
  and the build pass; untested in the app.

- 2026-10-21: **The smoke pass's findings, as the owner answered them** (decision 426). Fixed: Show all stays off
  once the header search's list closes (`SearchBox.jsx`); backups read a table and a page at a time
  (`backup.js` `READ_ORDER`, `tidyTables`; `backupIO.js` `readBackup`; on dev the same file as `backup_export`, 2.3 s
  against 7.7 s); the Convert dialog counts cards (`DayModals.jsx`); a buy's Mark Paid/Ours again? names Bulk pulled
  from exports (`DayPage.jsx`); the mixed-rates * needs two rates (`rates.js` `mixedRateLines`); TEST.md's Super
  Rod, Rowlet / Exeggcute, overnight-buy, Rejected and `26 rvr` cases reworded. Closed, no change: a set code
  before the number (a note on decision 329), the four P3s, the database texts for 0008. Blastoise 1st Edition:
  JustTCG lists no 1st Edition printing of Base Set Blastoise today (only Base Set Holofoil and Shadowless
  Unlimited Holofoil, one search on dev), so "no price" is right; TEST.md's decision 338 case can't pass while
  that lasts. Lint, 464 tests and the build pass; untested in the app.

- 2026-10-21: **The smoke pass, run by Claude in the browser pane** on the owner's ask (dev only, v1.0.1-day1, at
  1366×768, 02:30–03:56): sections 1–9 and 11–18 apart from the phone, two-computer and network-off cases, the
  clean-up (section 20) and the database test run (section 21: 565 checks passed, the next buy Buy 46). No P1;
  four P2 and four P3 findings and ten notes, listed under Open; JustTCG 63 requests. The dev server ran as a
  preview from `.claude/launch.json` (`npm run dev`, port 5180), not committed.

- 2026-10-21: Pushed as **v1.0.1-day1** (tag `v1.0.1-day1`), on the owner's ask: the 42 commits since
  v1.0.0-launch's last no-bump push (the version commit, "+ Start project" and TEST.md's cut words included),
  decisions 400–425: the stamp check removed (400), the team's six feedback items
  (401–407), the split exports and prints (408, 409), the by-color sort's loading state (410), the $24 bulk
  defaults (411), settings in the Changelog (412), the mixed-rates * (413), the inventory cleared in batches (414),
  the phone's Undo fix (415), Export rates for bulk and Export sell floor (416, 417), AUTO / OFF on the pill
  (418), the batch of seven (419–424), the flyouts to the left (425), and Help brought up to date for all of it.
  **Migrations 0005–0007 went to prod first**, at about 2:07 AM with the store closed, on the owner's word: the dry run
  listed the three, `db push --linked --project-ref zvxquzcfffmxwizonxuo` applied them, prod's record reads
  0001–0007, and the structure-only comparison with `C:\ClaudeProjects\temp\pug-0007\dev-run-0007.json` read nine
  fingerprints the same in 8.6 s, nothing run or written on prod. Dev and prod are equal; the CLI stays linked to
  dev. No Edge Function changes. Nothing unpushed.

- 2026-10-21: The owner's closures: the live site's Bulk values are 24 (decision 411, done by the owner); no Home
  tile for Bulk pulled from exports ("We don't need it"); the owner QA'd the commits since 400 as they were made
  ("Don't worry. Closed."), the smoke pass still to come.

- 2026-10-21: **Group flyouts open to the left, the arrow on the left** (decision 425), on the owner's screenshot:
  `GroupRow` in `MenuItems.jsx` (right only with no room on the left; ← or → opens, the arrow pointing back closes),
  `.more-item.group::before` and `.more-sub` in `collections.css`; Help and TEST.md say "◂ Print". Untested in
  the app.

- 2026-10-21: **Help brought up to date for every older open item** (401–407, 416, 417, and the review leftovers
  386, 387, 389, 393, 396–398), on the owner's ask (`README.md`): Banners (the red Settings bar), Condition prices
  (the 🔒 locks), The buy list (Added / $ ↓ / WUBRG), Print MTG? and Print PKM? (today's prices, the (>…) print, the
  key's amounts, the connection), Print PKM Stickers? and EXPORT and Moving through the statuses (the "Mark this
  collection Completed?" question), Mark as Paid/Ours's $0 on a kept buy's collection, 2. Review (the Pulled group,
  the floor), 3. Confirm (pulled cards, the lost answer read from the originals), The Sell Price (the floor), The file
  (a buy's file again, pulled cards), A buy's ⋯ menu (a Completed game stays whole, Mark Paid/Ours again partly by
  hand), Backups (Restore's left-out columns and empty lists), and two new Settings sections, **Export rates for
  bulk** and **Export sell floor** (a Help page of their own in `help/pages.js`). No Help item is open.

- 2026-10-21: **Help brought up to date for the batch** (419–424), on the owner's ask (`README.md`): Header search
  (customers and phone numbers, Show all switching itself on, Bulk pulled's cards never shown), a day page's The top
  row and a collection's EXPORT (Print ▸ / Export ▸), A buy's ⋯ menu (the three groups, Download its file again
  under Export ▸), a new Bulk pulled from exports section after Can't upload cards (always Completed, out of the
  search), Older cards (Let me type it) and Print MTG?'s foot line. The older Help items stay open as listed.

- 2026-10-21: **The owner's batch of seven** (decisions 419–424; the owner's answers to 13 questions first, then one
  commit a step; lint, 462 unit tests and the build before each; no migration; untested in the app):
  - 419 (`a4a7812`): the printout's page number at the right margin, clear of the key (`footerKey`, `auditPdf.js`).
  - Item 2, FOIL? after +1: looked at, **closed by the owner, no fix** ("I think I was wrong").
  - 420 (`3234b78`): **Let me type it** on the phone's printing list, the box empty (`PickPrintingSheet.jsx`,
    `NameSheet.jsx`, `Scanner.jsx` `onType`; `older.js` `printingsFor` with no frame).
  - 421 (`c524284`, `8581cd9`): **Overnight buys** for the customer kind of collection, on the screens and in Help;
    `collectionKind()` in `status.js`, `kind-overnight`; the header search pins one section per kind. The database's
    words unchanged.
  - 422 (`cd0ebac`): a buy's ⋯ and EXPORT ▾ in groups, **Print ▸ / Export ▸ / Convert ▸**, hover flyouts, groups of
    one flat (`MenuItems.jsx`, `lib/menuGroups.js`, `MoreMenu.jsx`, `ExportButton.jsx`, `BuyPanel.jsx`,
    `GuardButton.jsx` `looksDisabled`, `collections.css`). The flyout's placement near the window's edge is measured
    live and wasn't tried in a browser.
  - 423 (`81c4d40`): **Bulk pulled from exports** reads Completed and is dropped from the header search; the
    database's status stays Paid/Ours (`isPulled`, `status.js`; `pulledCollectionId`, `SearchBox.jsx`).
  - 424 (`c5587ef`): the header search finds **customers and phone numbers**, a Customers section, Show all flipped
    on once per thing typed (`customerQuery`, `customerPanels`, `globalSearch.js`; `lookUpCustomers`, `SearchBox.jsx`).

- 2026-10-20: **AUTO and OFF on the 🌼 | 🦇 pill** (decision 418), on the owner's ask: `SearchBar.jsx` (`mode-mark`,
  `mode-word`), `src/styles/price/search.css`. The pill's live height wasn't measured (the built-in browser refused
  https://localhost:5180); the words take no layout space instead. Untested in the app.

- 2026-10-20: **Export sell floor, set in Settings; "Export rates for bulk"** (decision 417), on the owner's ask:
  `SellFloorPanel.jsx` (the Floor box, the rounding table with Buy / Sell, help), `sellFloorFrom` in `money.js`,
  `useSellFloor` in `settings.jsx`, `sellPriceFor`'s `floor`, `sellPrices` in `ccExport.js`, `DayPage.jsx`,
  `ExportDialog.jsx`; the Bulk export rates panel renamed. No migration. Untested in the app.

- 2026-10-20: **Export rates for bulk, set in Settings** (decision 416), on the owner's ask: `BulkExportRatesPanel.jsx`
  (slider, EDIT / SAVE / CANCEL, a user for each), `src/lib/bulkCut.js` (defaults red 50¢, amber $1.49; the bands,
  the cut, the words), `useBulkCut` in `settings.jsx`; the prints, exports and their buttons follow it. No migration
  (`targetOf`, `changelog.js`, names the setting in the Changelog). Untested in the app, the slider's drag included.

- 2026-10-20: **The phone's Undo after a network error stays "undoing"** (decision 415, the last of 392), on the
  owner's ask: `remove` in `useDraft.js` / `useCollection.js` returns null for a lost answer, and `undo` in
  `src/pages/price/useScanReceiver.js` leaves those "undoing" to be claimed again. No database change. Untested in the
  app (a network error at the exact moment of an Undo is hard to stage by hand).

- 2026-10-20: **100 bulk rares/mythics and 100 EXs are $24** (decision 411), on the owner's word ("a math error from
  the beginning"): `DEFAULT_BULK_VALUES` in `src/lib/bulk.js`, decision 266, `docs/TEAM_FEEDBACK.md`; dev's saved
  `bulk_values` set to 24 for both (one update, the rest unchanged). The live site's is the owner's (Open).
- 2026-10-20: **The by-color sort says it's loading** (decision 410), on the owner's ask: the list fades, locks and
  shows "Sorting by color…" until Scryfall's colors are in, then reorders once (`BuyList.jsx` `colorLoading`;
  `buylist.css`). Untested in the app.
- 2026-10-20: **Print buy (all) and (>$1)** (decision 409), on the owner's ask: a Magic buy's ⋯ splits Print buy as
  Print MTG is (`BuyPanel.jsx`; `DayPage.jsx` `printBuy`). Untested in the app.
- 2026-10-20: **Export single buy (all) and (>$1)** (decision 408, `2fd6111`), on the owner's ask: a Magic buy's ⋯
  splits like the day's EXPORT (`BuyPanel.jsx`; `DayPage.jsx` `exportingBuy.over1`). No database change (0005 takes
  a buy's pulled cards). Untested in the app.

- 2026-10-20: **The team's six feedback items** (decisions 401–407), on the owner's ask, with their answers (today's
  market price on printouts; the file's Sell Price for the >$1 export; pulled cards to a new system collection like
  Can't upload cards; the Completed question after the export). Lint, 446 unit tests and the build before each
  commit; one pug-reviewer review of the batch, its findings fixed (the pulled collection made only on a pull, the
  test block's lock, the Completed question after the reload and only with a file, printouts and messages for pulled
  cards); migration 0005 on dev, db-test-run 550 checks all passed. Untested in the app (TEST.md cases, 224).
  - 401, 402 (`315f3dd`): right-click locks a condition / Use TCGplayer / Use Cardmarket (`usePricing.js`
    `lockCondition`, `lockSource`, `unlockSource`; `PriceTable.jsx`; `PricingScreen.jsx`).
  - 403 (`f6d4ebc`): Added / $ ↓ / WUBRG on every buy list (`src/lib/listSort.js`; `BuyList.jsx`).
  - 404, 405 (`93d754d`): today's market price on Print MTG / PKM with the key; Print MTG (all) / (>$1)
    (`auditPrint.js` `priceTone`, `OVER_1`; `auditPdf.js`; `useAuditPrint.js`; `ExportButton.jsx`).
  - 406, 407 (`cfd919e`): Export MTG csv (all) / (>$1), Bulk pulled from exports (migration 0005;
    `ExportDialog.jsx` `over1`; `CollectionPage.jsx`, `DayPage.jsx`); the Completed question (`askComplete`).

- 2026-10-20: **The phone's stamp check removed** (decision 400; the owner tried it: "bad, but also, unnecessary"):
  `src/scan/stamps.js` and `tests/scanStamps.test.js` deleted, the check, its 4 s limit and its run-log lines out
  of `src/scan/Scanner.jsx`, `loadPicture` private again in `src/scan/older.js`: the scanner as before decision
  328. Help's Promos says the plain card goes in and staff fix a stamped one on the computer; TEST.md's two stamp
  cases gone (215 cases); the "tune STAMP_SEEN" item gone. Lint, 443 unit tests, the build. Untested in the app;
  not pushed.

- 2026-10-20: Pushed without a bump (still v1.0.0-launch): the 28 commits since it (`e1e8a7d` on), with this record.
  Out with it: the Pokémon stickers in whole dollars (384), the Help sections brought up to date (338–341, 343, 345,
  348, 361, 362, 369, 372, 385), decision 385 (no code), and the review leftovers' fixes (386–399). Migration 0004
  was already on prod; no Edge Function change. The DEV watermark (382) never shows on the live site: its CSS rule
  is in the build, but nothing there turns it on. The pre-push review found nothing that stops a push. Nothing
  unpushed.

- 2026-10-20: **Every review leftover closed** (the owner: "fix every last one of these opens now as a batch"),
  decisions 386–399, one migration (0004) with one pug-reviewer review; lint, 446 unit tests and the build before each
  commit; db-test-run on dev 542 checks, all passed; untested in the app (TEST.md has a case for each, 217 cases).
  The owner's answers: a single buy's file again yes (386); block pricing until Settings loads (389); prefill $0 on a
  kept buy's collection (397). Closed, with where:
  - Left from Batch 2: a single buy's file again (386, `downloadBuyAgain`, `DayPage.jsx`); a Can't upload cards
    export's lost answer read from the originals (387, `ExportDialog.jsx` `save`); a write pressed again after a
    lost answer done once, a 30 s / 120 s request limit, a reload after a short drop (388, `requests.js`,
    `timedFetch.js`, `connection.jsx`, migration 0004); nothing priced until Settings loads (389,
    `useSettingsReady`); the set choices read page by page (390; the import's candidates were already paged, 346).
  - Left from Batch 1: an edit keeps its lines' scans (391, `internal.with_scans`); the phone's Undo and FOIL? once
    each, refusals said (392, `useScanReceiver.js` `undo`, `Scanner.jsx` `refinish`); Convert leaves a Completed
    game whole (393, `buy_to_project`, `buy_to_collection`, `convertLines`); Settings saves one at a time per key and
    a new key's first save once (394, `settings.jsx` `save`, `settings_save`); CANCEL finds an empty buy a scan
    opened (395, `useDraft.js` `cancel`); B19's day EXPORT and COMPLETE checks (db-test-run, "Review leftovers").
  - Small edges: Mark Paid/Ours again on a partly hand-completed buy (396, `BuyPanel.jsx` `someByHand`); $0 and the
    kept buy's number on Mark as Paid/Ours (397, `buys.kept_buy_id`, `useKeptBuy`, `PaidModal`); restore lists the
    columns it would leave out and keeps empty match lists (398, `backup_columns`, `extraColumns`, `restore_backup`);
    a card in Can't upload cards says so (399, `frozenNote`).
  - The review's own findings fixed before applying: CANCEL never discards a buy with cards unseen; the lost-answer
    id is staff's only, once, for two minutes, saying "Done once"; a second FOIL? waits, an unanswered Undo is claimed
    again; the Convert dialog's wording; stronger test-run checks. Its note that the Settings first-save race can't
    be tested in one transaction stands (the check runs the saves one after the other).
  - Applied to dev, then to prod the same sitting on the owner's word (04:32, store closed): `db push --linked
    --project-ref zvxquzcfffmxwizonxuo`, prod's record 0001–0004, the structure-only comparison with
    `C:\ClaudeProjects\temp\pug-0004\dev-run-0004.json`: nine fingerprints the same, 2.7 s, nothing run or written on
    prod. Dev and prod are equal; the CLI stays linked to dev.

- 2026-10-20: **Help brought up to date** for decisions 338–341, 343, 345, 348, 361, 362, 369 and 372, on the
  owner's ask (`README.md`): How prices are worked out (new step 4), Finish and Details: Pokémon (Version row), What
  can change in each status (an exported card can't change), REPRICE?, EXPORT, Convert to buy…, the day's ⋯ and a
  buy's ⋯ menus, 3. Confirm (when Export N cards fails), The file (the same file again), Pairing (waiting scans)
  and Backups (Restore's two presses). The four "Help out of date" items are closed.
- 2026-10-20: **Buy numbers through a project closed** (decision 385): the owner is fine with Convert to buy…
  giving the next number in line, as `project_to_buy` already does. Decision 290's last sentence is struck. No
  code change. The Help's Convert to buy… says so.
- 2026-10-20: The owner believes the review leftovers (Left from Batch 1, Left from Batch 2, Small edges) are done.
  A read-only look found no commit or decision after 366 that covers them, and the code as described:
  `src/lib/supabase.js` has no request timeout, `BuyPanel.jsx` `byHand` is unchanged, and `settings.jsx` still
  prices with `DEFAULTS` before Settings loads. They stay open until the owner says otherwise.

- 2026-10-20: **Help: Print PKM Stickers?** brought up to date with decision 384 (README.md, "Print PKM
  Stickers?"): whole dollars, 50¢ and $1 for the cheap cards, and that a sticker can differ from Complete day's
  green Sell Price. On the owner's ask.
- 2026-10-20: **Pokémon stickers in whole dollars** (decision 384): `stickerPrice` in `src/lib/stickerPdf.js`
  (50¢ up to $0.50, $1 under a dollar, then the nearest dollar) from `sellPriceFor`'s new unrounded `value`
  (`src/lib/sellPrice.js`), used by `useStickerPrint.js`. Complete day's saved Sell Price unchanged. Unit tests in
  `tests/stickerPdf.test.js` and `tests/export.test.js`; TEST.md section 14 has the case. Untested in the app.
- 2026-10-19: **The lint hook doesn't block between edits** (decision 383): in `.claude/hooks/lint-edit.mjs`,
  `BETWEEN_EDITS` (`no-unused-vars`, `no-undef`) alone give Claude a note instead of a blocking error; anything
  else still blocks, and the full lint before each commit catches leftovers. Tried on sample files outside the
  repo (`C:\ClaudeProjects\temp\pug-lint-hook\bed`, can go).
- 2026-10-19: **A DEV watermark on localhost** (decision 382): a faint diagonal DEV DEV DEV over every screen when
  the dev server runs on dev's database. `src/main.jsx` adds the `dev-db` class; the `html.dev-db body::after` rule
  in `src/styles/base.css` draws it. A build drops the check (dev's ref isn't in `dist/`), so never on the live
  site. Then, on the owner's looks, white at 3% and smaller and tighter (20px, a 140×86 tile).
  Untested: the owner checks it on localhost.
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
