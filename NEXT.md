# NEXT

What's open, newest first. Claude reads this at the start of every session and tells the owner what's open, then
marks each task done here when it's finished, with the exact file and function of anything left. Older history:
`git log -p NEXT.md`, the spec's numbered decisions and `git tag`.

## Open

- **Unpushed** (the main session's line), no migrations or Edge Functions: `a8fb952` `.claude/launch.json`
  ignored and `362aec6` `scripts/db-baseline.mjs` retired (496), both from before the forks; Export and printouts:
  `ce1013c` Ctrl+Click Download copies Magic singles under $10 (497), `bcd6a81` every row read and a stuck-on
  "Foil" dropped (498), `b52987c` NEXT.md only; Buy tab: `23515e3` the Copies we own box names its CC product
  (499), `e32e1d2` a match that didn't go through says so (500), `2047b92`, `6f1dbe2`, `0e0d52b` and `f25bd52`
  the product line's look and wording (501–504), `de23ee7` condition prices sized to their buttons (505).
- **For migration 0011, when there's a reason to write one:**
  - F2, the backup's 8 s statement limit (decision 430): `backup_export` (one call for every table, 2 to 7.7 s on
    dev) can time out; the fix must keep one read at one instant, so it needs the database. The test run's Backup
    pass hit it once (`restore_backup`, `staff_users`) and passed on the retry.
  - Retire `master_inventory_abort` (unused since decision 414), with its test-run checks and its place in the
    security-definer list.
- **Matching leftovers (decisions 484–487):**
  - Not built, on purpose: Scryfall's other promo types as families (`planeswalkerdeck`, `gameday`,
    `storechampionship`, `wizardsplaynetwork`, `openhouse`, `themepack`, `release`, `judgegift`). CC spells them
    too many ways, so each needs its spellings read off the inventory first (`src/lib/ccMatch.js` `FAMILIES`,
    `evidenceTreatments`); about 8 of dev's asks would then match by themselves.
  - Left as is, the owner's call (Export session, 2026-10-24): about 15 CC products have "Foil" stuck on the name
    without " - " ("Narset, Enlightened Master Foil - Prerelease Promo", "… Alternate Art Foil"), so
    `parseProductName` (`ccNames.js`) keeps it in the base and the export and Copies we own can't find them by
    name (Needs a choice / n/a, never a wrong match). Only the under-$10 list drops it (decision 498).
  - The two wrong exported lines' stamps on prod stay unless that day's file must be downloaded again
    (`git show 681c5c6:MATCHING.md`, item 3).
  - From 0010's review, not acted on: Import Collection reads "Retro Schematic" as a word, not Retro Frame
    (`importMatch.js`); an `auto` sent over a staff row isn't checked on its own in the test run.
- **Small, from the 2026-10-21 review, not fixed:** reopening a closed customer search shows Show all off until a
  letter is typed (`SearchBox.jsx`, the search effect keyed on `[text, showAll]`). Plausible, not confirmed: if the
  connection comes back while a CONFIRM BUY press checks its own answer and the check fails anyway, the dialog can
  still close (`useDraft.js` clears `unsure` before `confirm_buy` and sets it again only after `run` returns).
- **The owner's part of the smoke test** (`docs/TEST.md`, dev only): section 10 (the phone), the two-computer and
  network-off cases, and section 19.
- **Known limits, left as is:** the app can't tell when CC's CSV was taken, so cards exported between taking it and
  uploading it count as in it (`owned.js`); how long a copies-we-own count takes on the live site isn't measured;
  `settings_log` takes the app's sentence as written, and the key and match entries are guarded for a user only by
  the app; the `settings_save` first-save race is tested only one save after the other; a stored `.gz` can be left
  in the `master-inventory` bucket if the clearing's last answer is lost (`pruneProducts`,
  `src/lib/masterInventory.js`).
- **Later:** the clean-up (the spec's Phase 10 list, `C:\ClaudeProjects\temp\pug-squash\` included) waits until
  prod has run a while.

## Done

- 2026-10-24: **Condition prices sized to their buttons** (decision 505, the owner's ask, Buy tab session):
  `PriceTable.jsx` `priceStyle` gives the price's width in ems (`src/lib/priceFit.js` `priceEms`, tested in
  `tests/priceFit.test.js`); `conditions.css` `.pc-price` sizes it to 84% of its button, 18px at most. Measured
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
