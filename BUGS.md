# Bugs found in the pre-launch smoke test

Smoke test run on 2026-10-02 against the **dev** project, local build `0.9.9-day0` plus the local commits through `99ec143`.
Nothing was fixed during the test. **Update, same day:** items 1–12 are fixed and checked, item 13 can't be fixed in the app; see each item's status and BUG_FIX_REPORT.md.

**Priorities**
- **P1:** breaks or hides something staff rely on.
- **P2:** wrong or misleading, but there's a workaround; or hardening to finish before launch.
- **P3:** cosmetic, or tidying up.

---

## P1

### 1. Home on the 1366×768 laptop: "Days to export" lists no days
- **Status:** ✅ **Fixed and checked** (see BUG_FIX_REPORT.md).
- **Where:** Home, at a window 768px tall (the store laptop, spec 8.1).
- **Steps:** Open Home at 1366×768 with 2 days waiting.
- **Actual:** The panel shows only "+2 more on the Calendar". No day is listed, and the 2 waiting days aren't visible anywhere on Home.
- **Expected:** At least the oldest waiting day is listed, with "+1 more" under it if there's room.
- **Cause:** `src/pages/HomePage.jsx` around line 132. When only one row fits (`daysFit` = 1), `daysShown = Math.max(0, daysFit - 1)` is 0, so the single row goes to "+N more".

### 2. Home on the 1366×768 laptop: Recent activity disappears
- **Status:** ✅ **Fixed and checked** (see BUG_FIX_REPORT.md).
- **Where:** Home, at a window 768px tall.
- **Actual:** The right-hand column shows only the Can't upload cards tile. The Recent activity panel, with its heading and Changelog → link, is gone.
- **Expected:** Recent activity always shows, even if only its heading and a few entries fit.
- **Cause (likely):** In the bottom row (`.home-side`), the activity card has `flex: 1; min-height: 0` inside a parent with `overflow: hidden`. With no spare height, it shrinks to nothing. It needs a minimum height, or the Can't upload tile needs to shrink first.

---

## P2

### 3. Database functions meant for internal use can be called directly by the app (do before launch)
- **Status:** ✅ **Fixed and checked** (see BUG_FIX_REPORT.md).
- **Where:** Supabase dev project; this will carry over to prod.
- **Found:** Signed-in users can call these helpers directly through the API: `buy_event`, `collection_event`, `collection_for_write`, `cant_upload_copy`, `cant_upload_return`, `export_stamp`, `export_learn`, `export_check`, `export_line_text`, `collection_totals`, `buy_target_name`, `cc_custom_sku`, `norm_number`. Some of them change data without the checks the public functions make. For example, `export_stamp` writes export stamps and `cant_upload_return` moves cards.
- **Risk:** Everyone shares one store login, so this isn't an outside threat. But a bug or a stray call could write changelog entries or stamps that bypass the checks.
- **Fix:** Not a plain revoke. The public functions are security-invoker, so the signed-in user needs EXECUTE on every helper they call; revoking it would break them. Instead, move the helpers into a schema the API doesn't serve (e.g. `internal`), keep `grant execute … to authenticated` there, and point the callers at `internal.<name>`. PostgREST only serves `public`. Do it before launch, or as part of the migration squash.

### 4. The search bar's sample card doesn't exist
- **Status:** ✅ **Fixed and checked** (see BUG_FIX_REPORT.md).
- **Where:** The Buy screen and every collection's search bar (placeholder in `SearchBar.jsx`).
- **Steps:** Type exactly what the placeholder suggests: `Lightning Bolt 161/295 2X2`.
- **Actual:** "No cards match. Check the number and set code." Double Masters 2022's Lightning Bolt is #117 of 331; LEA's is #161. A new staff member copying the example gets a miss on day one.
- **Fix:** Use a real printing, e.g. `Lightning Bolt 117/331 2X2`. Ask the owner which card.

### 5. Home's "Recently exported" includes Magic days that were only marked Completed by hand
- **Status:** ✅ **Fixed and checked** (see BUG_FIX_REPORT.md).
- **Where:** Home → Days to export → Recently exported (`HomePage.jsx`, the `exported` query: `completed_at is not null`).
- **Actual:** A Magic day whose buys were all marked Completed from a buy's ⋯ (nothing exported) is listed as "recently exported", with no Custom SKU.
- **Expected:** Only days with export stamps (`cc_status` set). Alternatively, show those days with a "Completed" label instead.

### 6. Home's Today panel keeps yesterday's numbers after midnight
- **Status:** ✅ **Fixed and checked** (see BUG_FIX_REPORT.md).
- **Where:** Home, when left open overnight.
- **Cause (from the code):** `from`/`to` for Today are worked out at render, but `useLiveTable` only re-runs its query when `buys` changes or the connection comes back. Until the next buy anywhere, Today shows yesterday's buys and Paid out. The same applies to "today" in Days to export.
- **Fix:** Re-render when the date changes, or key the page on `storeDay()`.

---

## P3

### 7. `buys_in_range` can be called without signing in
- **Status:** ✅ **Fixed and checked** (see BUG_FIX_REPORT.md).
- **Where:** Supabase. It's the only function anonymous visitors can execute; migration 0038 recreated it without the usual revoke/grant.
- **Impact:** None today: it isn't security-definer, and anonymous visitors can't read `buys`, so it returns nothing. It's inconsistent with every other function, though.
- **Fix:** `revoke execute on function public.buys_in_range(timestamptz, timestamptz) from public, anon; grant … to authenticated;`

### 8. "all 1 card" in Convert to project
- **Status:** ✅ **Fixed and checked** (see BUG_FIX_REPORT.md).
- **Where:** Day page → a buy's ⋯ → Convert to project… on a one-card buy.
- **Actual:** "…becomes a new project: all **1 card**, both games, move there…"
- **Fix:** Say "its 1 card" for one card and "all N cards" for more. Also drop "both games" when the buy has only one game.

### 9. The day page's ⋯ menu wraps "Check Crystal Commerce matches" onto two lines
- **Status:** ✅ **Fixed and checked** (see BUG_FIX_REPORT.md).
- **Where:** Magic day page, ⋯ next to EXPORT, at 1366×768. The menu opens narrow and the item wraps.
- **Fix:** Give `.day-actions .more-list` a `min-width`, or set `white-space: nowrap` on its items.

### 10. The Changelog labels a cash-buys download "BUY"
- **Status:** ✅ **Fixed and checked** (see BUG_FIX_REPORT.md).
- **Where:** Changelog → Actions → "Cash buys downloaded". The type chip reads **BUY**, as for a single buy.
- **Fix:** Give month-level entries a chip of their own ("MONTH" or "FILE"), the way day entries get "DAY".

### 11. Small database helpers have no fixed `search_path`
- **Status:** ✅ **Fixed and checked** (see BUG_FIX_REPORT.md).
- **Where:** `format_phone`, `money_text`, `pct_text`, `round_down_price`, `sentence`, `status_label`. Every other function sets `search_path = public`.
- **Impact:** Minimal; none of them are security-definer. Supabase's linter flags them, though.
- **Fix:** Add `set search_path = public` to each, in one migration.

### 12. Clean-up to do at launch (squash, spec Phase 10)
- **Status:** ✅ **Fixed and checked** (see BUG_FIX_REPORT.md).
- `day_mark` is still in the database. It was kept for the v0.9.1 live build, but no current code calls it. Drop it at the squash.
- Check for any other "kept for the older live build" functions noted in the migrations, and drop them in the baseline.

### 13. Console noise: Scryfall's "no match" shows as a red 404 error
- **Status:** ⏸ **Can't be fixed in the app; left as is** (see BUG_FIX_REPORT.md): the browser logs every 404 response itself.
- **Where:** The browser console, after any Magic search with no result.
- **Impact:** None for staff, but it makes real errors harder to spot while testing.
- **Fix:** Optional. The 404 is Scryfall's normal "no results" answer, so it can be left, or checked with `fetch` and treated as an empty result.

---

## Not bugs: notes on the dev data

- **4 walk-in buys on Sept 29–30 have no purchase price or method.** They were confirmed before migration 0020 started requiring one. They show no "Paid" chip and aren't in the Cash buys file. Prod starts empty, so they won't exist there.
- **3 drafts are sitting on devices,** one of them with 2 cards since Oct 1. Drafts never expire, which is by design.
- **The browser pane used for this test is now a device named "Smoek Test",** created when it was signed in and named. Rename or ignore it.
- **A Priced collection ("Vintage Pokemon") has 0 cards and a $0 / $0 offer.** That's valid as test data. The app lets an empty collection be Priced, and Paid/Ours from there. Decide whether that should be blocked.
- **The 16 export-stamped lines without `completed_at` are all in Completed collections.** That's by design: a collection is completed at the collection level.

## What the smoke test covered

**Backend.** Every step ran against dev inside a transaction that was rolled back, so nothing was kept:
- **Walk-in:** draft, add (merge), confirm (cash), header search, remove a copy.
- **Refusals:** COMPLETE today is refused; a buy marked Completed is hidden from search; Convert is refused while Completed; Paid/Ours again, then Convert works (keeping the phone and payment).
- **Collection:** create, lock, add, Priced (the credit offer is worked out from cash), Paid/Ours (cash), Completed by status is refused (`complete_by_export`), back to Priced (payment cleared), delete.
- **Protections:** deleting the system collection is refused; a stale version is refused.
- **Changelog:** every step wrote the expected entry.

All of these passed.

**Security.** Every table has row-level security, anonymous visitors have no table access, the security-definer functions pin their `search_path`, and the Realtime publication includes `events`. The issues are items 3, 7 and 11.

**Data integrity.** No orphan cards, duplicate positions, bad quantities or prices, Paid/Ours collections without a payment, Completed collections without a completion date, or leftover locks.

**UI, at 1600×900 and 1366×768, with no errors in the browser console:**
- **Home**
- **Buy:** Magic search, price ladder, cached JustTCG prices; JP toggle and tip; a Japanese card priced from Cardmarket.
- **Collections:** the three tables; the Priced collection with the 📞 hover card; EXPORT on a Priced collection ("Mark it Paid/Ours first"); Can't upload cards.
- **Calendar:** September and October; Export Cash Buys (n); EXPORTED and COMPLETED chips.
- **Day pages:** Magic EXPORT (3) and a buy's ⋯ menu; Convert dialog (cancelled); Pokémon COMPLETE (5); Check Crystal Commerce matches.
- **Settings:** every panel; percentages loaded.
- **Changelog:** Buys and Actions filters.
- **Header search**
- **Start Project dialog** (Esc closes it)
- **Cash buys file:** its contents for September and October.

**Not exercised, to avoid writing to the shared dev data:**
- Confirming a buy through the UI.
- A real EXPORT.
- Uploading the Crystal Commerce file.
- Downloading or restoring a backup.
- Saving settings.
- REPRICE?

The database side of the first and last was covered by the rolled-back tests above.
