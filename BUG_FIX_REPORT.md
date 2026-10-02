# Bug fix report: pre-launch smoke test

**Date:** 2026-10-02
**Source:** [BUGS.md](BUGS.md), 13 findings.
**Result:** 12 fixed and checked; 1 can't be fixed in the app (item 13).
**One extra bug** turned up while checking the fixes; it's fixed too.

Everything is committed locally and **not pushed**. The database change (migration **0040**) is on **dev** only. The live site (0.9.9-day0, which also runs on dev) keeps working: it never calls the functions that moved or were dropped. I checked that against its code.

**Checks:** build, lint and all 114 tests pass. Each fix was also checked in the browser at the window sizes listed below, against the dev database, or both. Every database test ran in a transaction that was **rolled back**, so no dev data was changed by the checks.

## Summary

| # | Priority | Bug | Result |
|---|---|---|---|
| 1 | P1 | Home on the 1366×768 laptop: Days to export listed no days | ✅ Fixed, checked at 1366×768 and 1366×680 |
| 2 | P1 | Home on the 1366×768 laptop: Recent activity disappeared | ✅ Fixed, checked at 1366×768 and 1920×1080 |
| 3 | P2 | Internal database helpers could be called directly through the API | ✅ Fixed (migration 0040), checked from the browser and in SQL |
| 4 | P2 | The search bar's sample card didn't exist | ✅ Fixed, checked: the new example finds the card |
| 5 | P2 | "Recently exported" counted days only marked Completed by hand | ✅ Fixed, checked in SQL against both versions of the query |
| 6 | P2 | Home kept yesterday's numbers after midnight | ✅ Fixed, checked by moving the page's clock past midnight |
| 7 | P3 | `buys_in_range` could be called without signing in | ✅ Fixed (0040), checked: the request is refused |
| 8 | P3 | "all 1 card" in Convert to project | ✅ Fixed, checked in the dialog |
| 9 | P3 | The day page's ⋯ menu wrapped onto two lines | ✅ Fixed, checked at 1366×768 |
| 10 | P3 | Changelog chip said "BUY" on a cash-buys download | ✅ Fixed, checked: it says "MONTH" |
| 11 | P3 | Small helpers had no fixed `search_path` | ✅ Fixed (0040), checked: no function is left without one |
| 12 | P3 | Launch clean-up: the unused `day_mark` | ✅ Dropped (0040), checked |
| 13 | P3 | Scryfall's "no match" shows as a red 404 | ⏸ Can't be fixed in the app (explained below) |
| + | | Found while checking: React "key" warning and possible blank lines on Home's Can't upload tile | ✅ Fixed, checked: the warning is gone |

---

## P1

### 1. Days to export listed no days on the laptop

**What was wrong.** When only one row fit, the code gave that row to "+N more on the Calendar". No actual day was shown.

**What changed:** `src/pages/HomePage.jsx`
- When only one row fits, the panel now shows the **oldest waiting day**. The heading's red "N waiting" chip already says how many there are, so "+N more" only appears when there's room for it.
- Shorter windows also get more room, from the item 2 changes.

**How I checked it.**
- **At 1366×768:** both waiting days are listed (September 30 and October 1), with no overflow.
- **At 1366×680** (forcing the one-row case): the panel shows "September 30, 2026 · Magic · 3 buys · 3 cards · 2 days old" instead of only "+2 more".

### 2. Recent activity disappeared on the laptop

**What was wrong.** The right-hand column of the bottom row needed 198px but had 171px. Recent activity was the part allowed to shrink, so it shrank to nothing.

**What changed:** `src/styles/home.css`, and the Can't upload tile in `HomePage.jsx`
- Recent activity now keeps at least enough room for its heading and two entries.
- **Windows 820px tall or less** (the laptop) get:
  - a slimmer band (10px margin and 12px padding instead of 16px and 20px);
  - slightly tighter gaps and card padding;
  - the **Can't upload cards tile as a single line**: its heading and an "N waiting" chip in the system colour. It's still clickable, and the full tile comes back on taller screens.

**Update (owner, same day): laptop-sized screens only.** The compact layout first switched on for any window 820px tall or less. That also caught 1080p screens in a shorter browser window (125% scaling or zoom), where the elements looked too small. It now needs the window to be **820px tall or less and 1440px wide or less**. Wider screens keep the original full-size Home: normal spacing, the full Can't upload tile, and Recent activity as before. On those screens a very short window can still crowd the bottom row, as it did before the fixes; the item 1 fix still keeps at least one waiting day visible there.

**How I checked it** (measured in the browser):

| Size | Can't upload | Recent activity | Overflow |
|---|---|---|---|
| 1366×768 | 42px, one line, "1 waiting" | 115px, 3 entries | none |
| 1920×1080 | full tile, with the waiting card's line | 11 entries | none |

At 1920×1080, Recently exported is also back.

After the laptop-only update:
- **1366×768:** compact, as above.
- **1536×740** (a 1080p screen at 125%): full-size, with 20px gaps and the full tile.
- **1919×912:** full-size and unchanged.

---

## P2

### 3. Internal database helpers could be called directly

**What was wrong.** 13 helper functions were callable through the API by anyone signed in, skipping the checks the public functions wrap around them: `buy_event`, `collection_event`, `collection_for_write`, `cant_upload_copy`, `cant_upload_return`, `export_stamp`, `export_learn`, `export_check`, `export_line_text`, `collection_totals`, `buy_target_name`, `cc_custom_sku`, `norm_number`.

**What changed:** migration `0040_internal_helpers.sql`, applied to dev.
- **New `internal` schema.** The 13 helpers moved into a new `internal` schema, which the API (PostgREST) doesn't serve. Signed-in users keep the rights to the schema and its functions, because the public functions run as the caller and need them.
- **Every function's `search_path` is now `public, internal`** (security-definer ones `public, internal, pg_temp`), so the existing functions find the helpers without rewriting their bodies.
- **CLAUDE.md** gets a rule: any function written later that calls a helper must set `search_path = public, internal`, because `= public` alone won't find it.
- **The migration-squash plan** in DESIGN_SPEC.md now carries the `internal` schema into the baseline. Decision 203 records the fixes.

**How I checked it.**
- **From the signed-in browser:** calling `buy_event`, `export_stamp`, `cant_upload_return` or `norm_number` through the API now fails with "Could not find the function public.…" (PGRST202).
- **The whole app still works on the database side.** Everything below ran as the signed-in role, the way the app calls it, before and after applying 0040, rolled back each time:
  - **Walk-in:** a draft with a merging add, confirm (cash), header search, remove a copy, today's COMPLETE refused, Mark as completed (hidden from search), Convert refused while Completed, then Paid/Ours again and Convert (phone and payment kept).
  - **Collection:** create, lock, add, Priced (the credit offer worked out), Paid/Ours, Completed-by-status refused, back to Priced, delete. Deleting the system collection and a stale version are both refused.
  - **A real day export:** `export_lines` on September 30 with 1 card matched and 2 sent to Can't upload. It returned SKU 100226, 3 buys, 1 card and 2 can't-upload, and Can't upload cards went from 1 to 3. Then `export_undo_day` put all 3 cards back to Paid/Ours.
  - **Every other function the app calls:**
    - **Reads and searches:** `backup_counts`, `backup_export`, `cant_upload_ensure`, `cant_upload_note`, `cc_categories`, `search_set_codes`, `cc_products_search`, `global_search`, `master_pct`.
    - **Drafts:** `draft_update_line`, `draft_remove_line`, `draft_set_custom_rates`, `draft_cancel`.
    - **Projects and collections:** `project_create`, `lock_acquire`, `lock_heartbeat`, `lock_release`, `collection_add_line`, `collection_update_info`, `collection_update_line`, `collection_reprice`, `collection_remove_line`.
  - **Backup restore:** `restore_backup` of a fresh `backup_export` round-tripped with identical counts; the one extra event is the restore's own changelog entry.
  - **Security audit after 0040:** no function can be run without signing in, and no function lacks a fixed `search_path`. `public` now holds 53 functions (was 67: 13 moved, 1 dropped).

### 4. The search bar's sample card didn't exist

**What was wrong.** The sample text suggested "Lightning Bolt 161/295 2X2". Double Masters 2022's Lightning Bolt is #117 of 331, so typing the example found nothing.

**What changed.** The sample text now reads **"Type what's printed on the card: Lightning Bolt 117/331 2X2"** (`SearchBar.jsx`). The Japanese tip is unchanged. The spec's mock-up and examples were updated to match. The parser tests keep "161/295" because they only test how text is split up, not a real card.

**How I checked it.** Typing the new example exactly selects Lightning Bolt, Double Masters 2022 #117/331, with its prices. It's the same card the old example was meant to show; if you'd rather have a different one, it's a one-line change.

### 5. "Recently exported" counted days only marked Completed by hand

**What changed.** Home's "Recently exported" query now also requires the export stamp (`cc_status` set), not just `completed_at` (`HomePage.jsx`).

**How I checked it.** In a rolled-back transaction, I marked the October 1 Magic buy Completed by hand and ran both versions of the query:
- the old query listed **September 29 and October 1**;
- the new one lists **September 29** only.

Home still shows September 29 under Recently exported with its SKU.

### 6. Home kept yesterday's numbers after midnight

**What changed.** Home now checks the store's date every minute. When the date changes, the page reloads its own content, so Today, Days to export and every other list are worked out for the new day (`useStoreDay` and the `key` on `HomeScreen` in `HomePage.jsx`).

**How I checked it.** With Home open, I moved the page's clock 17 hours ahead, past midnight Pacific. Within a minute, Days to export changed on its own:
- **September 30:** "2 days old" → "3 days old";
- **October 1:** "yesterday" → "2 days old".

Supabase's token refresh was paused during the test, and the clock was put back afterwards.

---

## P3

### 7. `buys_in_range` could be called without signing in
**What changed.** Migration 0040 revokes it from `public, anon` and grants it to `authenticated`, like every other function.
**How I checked it.**
- Calling it with only the publishable key (not signed in) now returns **401, "permission denied for function buys_in_range"**.
- Signed in, it still returns September's 7 buys, including the `exported_games` field, and the Calendar loads.

### 8. "all 1 card" in Convert to project
**What changed.** The dialog says **"its 1 card moves there as it is"** for one card, and "all N cards … move there as they are" for more. "both games" only appears when the buy really has both (`DayPage.jsx`).
**How I checked it.** I opened the dialog on September 30's Buy 1 (one Tundra): "Buy 1 (Daisy, 10:50 PM) becomes a new project: its 1 card moves there as it is, with the buy's notes and rates, and the buy is deleted from this day." Then I cancelled.

### 9. The ⋯ menu wrapped onto two lines
**What changed.** Every ⋯ menu is now as wide as its longest item, on one line, up to 360px or 90% of the window (`collections.css`).
**How I checked it.** At 1366×768, the Magic day's ⋯ shows "Check Crystal Commerce matches" on one line. The buy menus are unchanged.

### 10. "BUY" chip on a cash-buys download
**What changed.** Month-level entries get a **MONTH** chip, the way day-level entries get DAY (`MONTH_ACTIONS` in `changelog.js`, used in `ChangelogPage.jsx`).
**How I checked it.** In Changelog → Actions, the cash-buys download reads "CASH BUYS DOWNLOADED / MONTH". The other entries keep their chips: Customer called / Collection, Day completed / Day, Buy marked Completed / Buy.

### 11. Small helpers had no fixed `search_path`
**What changed.** Covered by 0040's `search_path` pass (item 3).
**How I checked it.** The audit query finds no function in `public` or `internal` without `search_path = public, internal`.

### 12. Launch clean-up: `day_mark`
**What changed.** 0040 drops `day_mark`. It was only kept for the old v0.9.1 live build; I checked that the current live build (0.9.9-day0) and the local code never call it.
**Still to do at launch:** the squash plan's other clean-ups still apply. The only other "kept for the older build" function, the 9-argument `confirm_buy`, was already dropped in 0022.
**How I checked it.** Calling `day_mark` now fails with "Could not find the function".

### 13. Scryfall's "no match" shows as a red 404: can't be fixed in the app
**Why it stays.** The 404 is Scryfall's own answer to a search with no results. I traced it to the exact request (`/cards/search?q=… set:2x2 …`). The app already treats it as "no match" and shows the right message. The red line is the **browser's** log of a 404 response; page code can't hide it. Avoiding it would mean replacing Scryfall's search with another lookup, which is a bigger change than a console line is worth.

---

## Extra bug found while checking

**React "key" warning, and possible blank lines on Home's Can't upload tile.**

**What was wrong.** The tile listed its card lines from whichever query finished first. One of those queries (the collections list) doesn't fetch the lines' IDs or names. If it won the race, React warned about missing keys, and the lines could show without card names.

**What changed.** The tile now takes its lines only from its own query, which has the whole lines (`HomePage.jsx`).

**How I checked it.** After a reload, the console has no key warning. The tile shows "1 Blessed Ghoul (FRA) 123".

---

## Left as they are

- **Windows shorter than about 760px** (below the 1366×768 laptop) can still cut off the bottom of Recent activity. At 680px tall there's only about 80px for the whole bottom row. The app targets the store computers, all 768px or taller.
- **The "Smoek Test" device** (the browser pane used for testing) is still in the device list. Rename or ignore it.

## Files changed

- **Code:**
  - `src/pages/HomePage.jsx`
  - `src/styles/home.css`
  - `src/pages/price/SearchBar.jsx`
  - `src/pages/DayPage.jsx`
  - `src/styles/collections.css`
  - `src/lib/changelog.js`
  - `src/pages/ChangelogPage.jsx`
- **Database:** `supabase/migrations/0040_internal_helpers.sql` (applied to dev).
- **Docs:**
  - `CLAUDE.md` (the `internal` schema rule)
  - `docs/DESIGN_SPEC.md` (squash plan, decision 203, the example card)
  - `BUGS.md` (a status on every item)
  - this report
