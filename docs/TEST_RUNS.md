# Smoke test runs

The results of each run of the smoke test (`docs/TEST.md`), oldest first, with their findings. The first smoke test
was on 2026-10-02, on 0.9.9-day0. Past checklists are in git history (the second smoke test's:
`git show a4da062:docs/TEST.md`; the Phase 6 pass's: `git show 4412187:TEST_PASS.md`). Section numbers in a run's notes are its own checklist's.

## Run 1: 2026-10-11, 9:40–10:26 PM

Claude, in the browser pane at 1366×768, on the local dev server (`start.bat`, dev database). Build 0.9.9.5-final
plus `36be5e6` (footer 0.9.9.5-final). About **35 JustTCG requests** (1,807 → 1,842 this month). Backup taken first
(`pug-pricing-backup-20261011-214110.json`).

**Result:** sections 0–16 run. No P1 findings. **3 P2** and **7 P3** findings, below. The three P2s were fixed the
same night, and the P3s (all but F5, which the owner doesn't need) the next morning; each was checked in the
browser. Everything else passed,
including every 🆕 headline feature: user forgetting (new tab, after a buy, 30 minutes idle), Help, no auto-select,
Japanese prices and "No." searches, Staryu's reverse, Mimikyu's merged stamp, the Play! Pokémon and Pokémon Center
logos, SV promo and Trainer shine classes, past customers, Export single buy and its undo, the Near-Mint-only file
(checked row by row, and identical when downloaded again), Rejected and Reopen, projects rounding up, Convert to buy
and back, the Collections ⋯ menu, all four kinds of import, Home, the Changelog and 1366×768 layouts.

**Not tested** (on purpose, or not possible from one browser):
- A card that can't match going to Can't upload cards: it would have put SMOKE cards in the owner's real list.
- Saving EXPORT on a past day, and COMPLETE on a Pokémon day: only the owner's data was there; both were opened,
  checked and cancelled. Export single buy was saved instead, on a SMOKE buy.
- Convert to buy greyed on a Completed project (no Completed project to try).
- View only, and the table's ⋯ greyed, when another computer has a collection open: needs two computers (section 17).
- Remembered import picks (no test row needed a pick), a project's price turning amber at 14 days (none old enough),
  the JustTCG limit or a missing key, a card with no price at all, a slow Scryfall or TCGdex.

**Left on dev after the clean-up:** the computer name `SMOKE Test Pane` (there's no way to delete a computer); the
SMOKE names in the past-customer list (SMOKE Ash, SMOKE Misty, SMOKE Collection, SMOKE Rejected; no delete for those
either); the run's Changelog entries (history is never deleted); and the export's remembered matches for the 2X2, M10
and M11 Lightning Bolts, which are correct.

## Findings

| # | Priority | Section | What happened | Expected | Steps |
|---|---|---|---|---|---|
| F1 | P3 ✅ fixed | 1 | With no user picked, Home's **+ Price Collection** / **+ Start Project** open their forms; Create then only says "Pick a user first." Nothing is created. | Quick actions guarded like the Collections tab's buttons: look disabled, pulse the user button. | New tab (no user) → Home → + Price Collection → fill → Create. |
| F2 | P3 ✅ fixed | 2 | Help's **Preamble** is 134px taller than its panel at 1366×768; the "From Claude Code" picture needs a scroll. | Fits without scrolling on the store laptop. | Help → About the app → Preamble at 1366×768. |
| F3 | P2 ✅ fixed | 3 | **Enter with no card selected does nothing and says nothing.** (ADD CARD's tooltip says "Select a card first", but Enter is silent.) With auto-select gone, staff will type, press Enter and see nothing happen. | A message: press ↓ to pick a card first. | Buy tab → type `Lightning Bolt 117/331 2X2` → Enter. |
| F4 | P3 ✅ fixed | 3 | A TCGplayer card with no rarity shows the word **"None"**: "No. 121 · None" in the card info and a "None" chip in Details. | No rarity shown. | JP → `No. 121` → CGD Misty's Starmie. |
| F5 | P3 — won't fix (owner) | 4 | TCGplayer's **League & Championship Cards** products are labelled with that set name, as Prize Pack ones were (Super Rod 188, REVERSE). | Owner to decide: a name like "League stamp"? | `Super Rod 188/193` → REVERSE. |
| F6 | P2 ✅ fixed | 4 | **World Championship deck cards still show**, from TCGdex: Pidgeot (FireRed & LeafGreen 10) HOLO lists "Takashi Yoneda / Jeremy Maron / Hiroki Yano / Jimmy Ballard stamp". TCGdex marks them as stamps named after the player, so the TCGplayer-only rule doesn't catch them. | Left out, like the TCGplayer ones. Their TCGplayer products are in "World Championship Decks", which the backfill already fetches. | `Pidgeot 10/112` → HOLO. |
| F7 | P2 ✅ fixed | 4 | **The default version can be a TCGplayer-only product**: Pikachu SVP 027 opens on **NORMAL "Baby"** (TCGplayer, NM $97) instead of TCGdex's holo ($18). | Default to TCGdex's own versions; TCGplayer ones only when picked. | `Pikachu 027 SVP` → ↓. |
| F8 | P3 ✅ fixed | 8, 9 | REPRICE?'s sentence is missing a space: "…Use Cardmarket as it was,rounded down as always" (and "was,rounded up" in a project). | "as it was, rounded …" | REPRICE? on any collection or project. |
| F9 | P3 ✅ fixed | 9, 11, 12 | Projects are called collections in places: the delete dialog ("Delete collection", "All 0 cards in this collection"), and the Changelog / Home headline **Collection created** for "Project started". | "project" for projects; "1 card" / "no cards". | Delete an empty project; Changelog after + Start Project. |
| F10 | P3 ✅ fixed | 14 | At 1366×768 the **Finish & Details** panel needs its own scroll once a card has a version list; the rarity and language chips are cut off. | Fits, or the chips stay visible. | `Mimikyu ex 069` at 1366×768. |
| F11 | P3 ✅ fixed | 18 | Three helper functions in the `internal` schema are open to everyone (PUBLIC) instead of the app's role only: `customer_key`, `customer_name` (0048) and `import_lines` (0047). Signed out they're out of reach (anon can't use `internal`), so nothing can misuse them. | Granted to the app's role only, like every other function. | `node scripts/db-test-run.mjs`: Security → "No server function is open to everyone". |

## Database test run 1: 2026-10-12

Claude, on **dev**, with `node scripts/db-test-run.mjs` (the SQL is `scripts/db-test-run.sql`). One transaction, about
18 seconds, rolled back: the runner's before and after snapshots match, and no DBTEST user, computer, buy, customer,
product or inventory file was kept. The Changelog's numbering skipped the numbers the run's entries used, which is
harmless.

**Result: 297 of 298 checks pass.** The one failure is F11 (above, P3). Everything else does what it should and
refuses what it should, as the app's signed-in role:
- **Security:** row security on every table, policies for the signed-in role only, nothing runnable signed out, the
  stored API key unreadable signed in or out, the Changelog append-only, past customers and the price cache written
  only by the server, five functions with the owner's rights (as designed), and a fixed search path on all 74.
- **Buy tab, day pages, Convert to project / buy, collections and their five statuses, projects, import, delete, the
  locks, the Master Inventory upload, EXPORT (a day, a single buy, a collection, Can't upload cards) and its undo,
  COMPLETE, Can't upload cards, backup and restore:** every result, Changelog entry and refusal checked.

**Also found:** `master_inventory_add`, the old one-step inventory upload, is no longer called by the app (the upload
uses start, load and finish).

**Fixed the same day** (owner's go): migration **0051** grants the three helpers to the app's role only (F11) and
drops `master_inventory_add`. **Run 2, after it: all 297 checks pass** (the old upload's check went with it), about
17 seconds, nothing kept. Fingerprints (dev): all of the structure together, `4d371f766e770cae5e7a48280472becf`. Any
later migration changes them, so a fresh dev run is saved at the squash, after the freeze (DESIGN_SPEC Phase 10, "Migration squash at launch", step 2), and prod is compared with it (step 7).

## Phase 6 smoke test: 2026-10-16

Claude, in the preview browser on **dev**, unattended (the owner signed in, approved the run's writes and left),
after the code review's Phase 6 split the Buy tab, the day page, the Settings boxes and price.css into smaller
files. The checklist was TEST_PASS.md (in git history: `git show 4412187:TEST_PASS.md`).

**Result: every section passed; no Phase 6 regression.** Not run: dragging a CSV onto a collection, the
two-computer and offline messages, and the day's EXPORT / COMPLETE dialogs (blocked on today's page; other days'
buys are real). JustTCG: 12 requests. All SMOKE P6 data deleted; Settings as they started.

Four findings, all in the live build too, and the owner's calls:

| # | Priority | What happened | Outcome |
|---|---|---|---|
| 1 | P2 | After Enter in Qty added a card, Qty kept its number, so the next card went in at that quantity. | ✅ fixed (`41c8ed0`) |
| 2 | P3 | Going back to a card brought back its condition, manual price, Use TCGplayer / Cardmarket and a placeholder's name. | ✅ every card starts fresh (decision 272, `4fe0015`) |
| 3 | P3 | Charizard 4/102 BS 1st Edition has no price at all. | Won't fix (owner): JustTCG has none; use a manual price |
| 4 | P3 | "Also has 4 Pokémon cards" and the Changelog's "8 cards bought" counted a 100-card bulk item as a card. | ✅ bulk counted apart everywhere (decision 273, migration 0066, `d6934e7`, `5f20237`) |
