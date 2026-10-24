# NEXT

What's open, newest first. Claude reads this at the start of every session and tells the owner what's open, then
marks each task done here when it's finished, with the exact file and function of anything left. Older history:
`git log -p NEXT.md`, the spec's numbered decisions and `git tag`.

## Open

- **Unpushed** (2026-10-24): Help's matching sections (484–487), the mixed-rates \* fix (489), TEST.md's new cases
  and SETUP.md's paused-project check. No migrations; dev and prod both 0001–0010.
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
  - The two wrong exported lines' stamps on prod stay unless that day's file must be downloaded again
    (`MATCHING.md` item 3).
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
  matching audit behind it is `MATCHING.md`; `C:\ClaudeProjects\temp\pug-matching\` `sweep.mjs` and `rules.mjs`
  re-measure a rule.
