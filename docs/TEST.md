# Second smoke test

A pre-demo smoke test of the whole app, weighted toward everything added since the first smoke test
(2026-10-02, on 0.9.9-day0). Items marked **🆕** are new or changed since then. The rest is a quick pass
to make sure nothing old broke.

- **Build under test:** 0.9.9.5-final plus `36be5e6` (the Settings footer reads 0.9.9.5-final).
- **Where:** the dev project only (`psucrzljraxeootwnltf`), through the local dev server
  (`start.bat` → http://localhost:5180) or the live site, which also runs on dev. **Never prod.**
- **Who:** Claude drives the browser, with the owner's go-ahead. The owner does the two-computer and
  Crystal Commerce checks at the store (section 17).

## Ground rules

- **Test data is named `SMOKE …`** (customers, collections, projects, notes), so it's easy to find and
  delete in section 16. Test customers use 555 phone numbers: `(555) 010-0001`, `(555) 010-0002`.
- **No real Crystal Commerce upload.** EXPORT is run on dev and its file is checked here. Uploading a
  file to the store's inventory is the owner's job (section 17).
- **Watch JustTCG's budget.** Note **Settings → JustTCG usage** at the start and the end. The whole run
  should take well under 150 of the day's 1,000 requests.
- **Test files stay outside the repo.** Any CSV made for an import goes in Claude's scratchpad, never
  in the project folder.
- **Record every finding** in the Findings section at the bottom, with the steps, what happened,
  what should have happened, and a priority:
  - **P1:** breaks or hides something staff rely on.
  - **P2:** wrong or misleading, with a workaround.
  - **P3:** cosmetic.
- **Nothing is fixed during the run.** Fixes come afterwards, from the Findings list.

---

## 0. Setup

- [ ] The app loads, signs in, and the Settings footer shows **0.9.9.5-final**.
- [ ] The computer has a name (Settings → This computer).
- [ ] Note **Settings → JustTCG usage** and the time: ________
- [ ] **Download backup** (Settings → Backups): a JSON file saves. Keep it until the run is over.
- [ ] Two users exist to switch between (add `SMOKE Ash` and `SMOKE Misty` if needed).

## 1. Users and who's working 🆕

- [ ] 🆕 **A new tab starts on Pick user.** Pick a user, then open the app in a second tab: it shows **Pick user**.
- [ ] 🆕 **A reload keeps the user.** Reload the first tab: the same user is still picked.
- [ ] 🆕 **Anything that changes data pulses the user button** when no one is picked (ADD CARD, + Price Collection).
- [ ] 🆕 **An unused tab forgets its user after 30 minutes.** To test without waiting, in the page's console run
      `const real = Date.now; Date.now = () => real() + 31 * 60000;`, then wait up to 30 seconds: the user is
      un-picked and a yellow message says no one used the tab for 30 minutes. Reload afterwards to undo.
- [ ] The sign-out icon un-picks the user.
- [ ] The user button and the coloured band show the picked user's colour.

## 2. Header, Help and search 🆕

- [ ] 🆕 **?** beside the sign-out icon opens **Help**: contents on the left, one page on the right.
- [ ] 🆕 Help opens on **About the app** (Preamble with its "From Claude Code" picture, JustTCG, Other Sources).
- [ ] 🆕 **←/→** turn the pages; they do nothing while typing in a box. Prev/next buttons work too.
- [ ] 🆕 The contents panel opens only the current chapter. Clicking a picture zooms it; Esc closes the zoom.
- [ ] 🆕 Hovering the tabs on Help doesn't make the page shake.
- [ ] 🆕 Help says projects round up, describes **Convert to buy…**, and the TCGplayer tag reads "a version only TCGplayer lists".
- [ ] Header search `bolt`: Paid/Ours collections at the top, then buys under their dates. **Show all** adds the rest, faded.

## 3. Buy tab: searching 🆕

- [ ] 🆕 **No auto-select** (put back on 2026-10-12, decision 247: one printing is selected again). `Lightning Bolt 117/331 2X2` shows one printing, but **nothing is selected**. **↓** selects
      it, **Enter** adds it. Enter with nothing selected should say to select a card first (run 1: it says nothing, F3).
- [ ] Clicking the selected card again un-selects it. A search that drops the selected card clears it.
- [ ] 🆕 A name that ends in a number is searched as that name: `Spider-Man 2099` (Magic), `Energy Removal 2` (Pokémon).
- [ ] 🆕 **Japanese prices:** JP on, `025/165 SV2a` (Pikachu) shows **JustTCG** prices, not only Cardmarket.
- [ ] 🆕 **Patterns:** JP `121/165 SV2a` (Starmie): the Poké Ball pattern is never priced above the Master Ball pattern.
- [ ] 🆕 **"No." search:** JP on, `No. 121`: TCGdex's old Starmies, then TCGplayer's extras a moment later, marked
      **From TCGplayer** (Misty's Starmie, CGD No. 121…). No modern Starmie appears.
- [ ] 🆕 With **EN** on, `No. 121` shows a yellow hint, "**No. 121** finds old Japanese Pokémon cards…: **switch to JP**";
      the link switches and searches again.
- [ ] 🆕 A number and set code from the other language (`125/197 OBF` with JP on) shows the yellow switch hint too.
- [ ] 🆕 A Japanese card shows its English name beside the Japanese one, a trainer's included (*Misty's Starmie*).
- [ ] 🆕 An English card TCGdex doesn't list comes up from TCGplayer, marked **From TCGplayer**.
- [ ] Right-clicking a suggestion searches its name. Newest/Oldest first sorts the printings.

## 4. Buy tab: versions, stamps and shine 🆕

- [ ] 🆕 **Missing printing:** `Staryu 33` (XY): a moment after selecting, **REVERSE** turns on, with a **TCGplayer**
      chip in Details; its prices are JustTCG's reverse holo prices.
- [ ] 🆕 **Jumbo left out, stamp merged:** `Mimikyu ex 069` (Journey Together), HOLO: just **Standard** and
      **Journey Together Stamped**, the stamped one priced above the plain one. No second "Journey Together Stamped",
      no jumbo card.
- [ ] 🆕 **Play! Pokémon stamp:** `Super Rod 188` (Paldea Evolved): a version **Play! Pokémon stamp** (TCGplayer tag).
      Picking it puts the **Play! Pokémon logo** bottom right on the card.
- [ ] 🆕 **Pokémon Center stamp:** `Snorlax 051` (SV promos): the version reads **Pokémon Center stamp** (with the é),
      and picking it shows the round **Pokémon Center emblem** bottom right.
- [ ] Poké Ball / Master Ball pattern versions (SV2a Starmie, reverse) show their ball badge in the same spot.
- [ ] 🆕 No **World Championship deck** card is ever offered as a version.
- [ ] 🆕 **Trainer mask:** `Super Rod 188`, REVERSE: the shine covers everything **except** the art box, lined up with it.
- [ ] 🆕 **SV promos shine whole:** `Pikachu 027` (SV promos, holo): the shine covers the whole card. A Sword & Shield
      promo holo (e.g. `SWSH050` Charizard V) still has its own frame's shine.
- [ ] 🆕 **Vintage Japanese from TCGplayer:** JP `No. 157`, pick Neo Premium File 1's **Typhlosion**: holo only on the art box.
- [ ] Full arts and rule-box Pokémon (ex, V, VMAX) shine across the whole card; a normal holo only on its art box.
- [ ] Hovering a price button explains where the price came from.

## 5. Buy tab: a walk-in buy 🆕

- [ ] Add a Magic card, an English Pokémon and a Japanese Pokémon. The Buy list and totals add up.
- [ ] ✎ on a line re-opens that exact card with its finish, condition and price; SAVE EDIT saves over it.
- [ ] CONFIRM BUY asks for name, phone and purchase price (Cash or Credit, typed in). Each is required.
- [ ] 🆕 **Past customers:** type `SMOKE` in the name: earlier SMOKE customers are suggested ("Past customers");
      ↓/Enter picks one and fills its last phone number, which can still be changed. Esc closes only the list.
- [ ] Confirm as `SMOKE Ash`, `(555) 010-0001`, $10 cash.
- [ ] 🆕 The message ends "Pick your user for the next one", and **the user is un-picked**.
- [ ] The buy is on today's day page, in the user's colour, with a green Paid/Ours chip.

## 6. Day pages 🆕

- [ ] A past Magic day with Paid/Ours buys: **EXPORT** opens the export (matching, review, confirm).
- [ ] Today's EXPORT is blocked ("until it's over").
- [ ] 🆕 A buy's ⋯ → **Export single buy…** works on any day, today included; only that buy becomes Completed and
      the day's EXPORT skips it.
- [ ] 🆕 That buy's ⋯ → **Mark Paid/Ours again…** undoes its export alone, after asking.
- [ ] ⋯ → **Mark as completed** and back; **Convert to project…** (checked again in section 9); **Delete buy…** asks first.
- [ ] 🆕 A Pokémon day's **COMPLETE** works out today's Sell Prices and shows them in green.
- [ ] The Calendar shows exported days greyed and tagged.

## 7. The export file 🆕

On any export run in sections 6 and 8, open the downloaded CSV:

- [ ] Header: `Add Qty,Product Name,Category,Condition,Language,Sell Price,Custom SKU`. Custom SKU is the date (`101126`).
- [ ] 🆕 Conditions use the inventory's words: `Near Mint`, `Lightly Played`, `Moderately Played`, `Heavily Played`, `Damaged`.
- [ ] 🆕 **Only Near Mint rows carry a price.** Every LP/MP/HP/DMG row's Sell Price is **blank**.
- [ ] 🆕 A card with only worse-condition copies gets a **0-quantity Near Mint row** first, priced at the best condition's
      Sell Price ÷ its percentage, rounded up (MP $87 at 80% → $110).
- [ ] 🆕 A card with Near Mint copies in the file gets no extra row.
- [ ] 🆕 On the review screen, a worse-condition card whose product gets the row shows **sets NM $X**, with the working on hover.
- [ ] EXPORT on a Completed day or collection downloads the same file again; nothing changes.
- [ ] A card that can't match goes to **Can't upload cards** and isn't in the file.

## 8. Collections 🆕

- [ ] The Collections tab: System, Projects and Collections tables; the status chips filter Collections, **Rejected** included 🆕.
- [ ] 🆕 Every row ends in a **⋯**: Delete collection… everywhere, **Convert to buy…** on projects only, none on System.
      Clicking ⋯ doesn't open the row; the menu isn't cut off on the last row.
- [ ] 🆕 A row open on another tab or computer greys its ⋯ items with who's editing it.
- [ ] + Price Collection needs name, a 10-digit phone and the Last 4 ID 🆕; Create shows what's missing.
- [ ] 🆕 The name suggests past customers and fills the phone, **never the Last 4 ID**.
- [ ] Make `SMOKE Collection`, add cards, **Mark as Priced** (offer), **Mark as Paid/Ours** (price paid), **EXPORT**:
      Completed, Custom SKU in the heading, prices in green.
- [ ] 🆕 **Rejected:** a second collection, `SMOKE Rejected`: from Priced choose Rejected, with a reason. It locks
      (no adding, editing, REPRICE? or EXPORT), shows $0 paid in red, is left out of the header search unless Show all.
      **Reopen** goes back to Priced with its offer.
- [ ] 🆕 The Paid/Ours dialog's **Mark as Rejected?** switches to the Reject dialog.
- [ ] 📞 on a Priced collection counts calls; each is in the Changelog.
- [ ] REPRICE? on a Processing collection says "rounded down as always".
- [ ] One computer edits at a time: a second tab of the same computer shares the lock (the store check is in section 17).
- [ ] **Delete collection…** (from the details ⋯ and from the table's ⋯ 🆕): two steps, the typed name.

## 9. Projects 🆕

- [ ] + Start Project `SMOKE Project` opens it, **Ours**, with no phone, ID, offer or paid rows.
- [ ] 🆕 **Prices round up.** The same card and condition shows a higher-or-equal price in the project than in a
      collection (e.g. $12.40 → $13 here, $12 there). The price tooltip says "rounded up from".
- [ ] 🆕 Use TCGplayer / Use Cardmarket tooltips round up too. Cash and Credit still round down.
- [ ] 🆕 REPRICE? on the project says "rounded up, as in every project".
- [ ] 🆕 **Convert to buy…** from the details ⋯: CONFIRM BUY's questions with an intro; fill `SMOKE Misty`,
      `(555) 010-0002`, $5 credit. The buy is on today's day page, the project is gone, and the app opens the day page.
- [ ] 🆕 Convert to buy… is greyed on a Completed project and stops with a message on an empty one.
- [ ] 🆕 A day page buy's ⋯ → **Convert to project…** makes a project again (round trip), its prices unchanged.
- [ ] 🆕 **Convert to buy…** from the **Collections table ⋯** works the same.

## 10. Import Collection 🆕

Make the test files in Claude's scratchpad.

- [ ] 🆕 **Import Collection** (Collections header) with a small CardBot-style Mass Create file: Matching, then Review
      (Needs a choice, Matched, Can't import); pick or skip; **Next: name the project**; it opens.
- [ ] 🆕 A **TCGplayer-format** file (TCGplayer Id column): rows match *by SKU*; a blank price takes TCGplayer's, marked so.
- [ ] 🆕 **Our own export file** (from section 7) imports back: the 0-quantity Near Mint rows are left out quietly, and the
      blank-priced rows are priced from the file's Near Mint price, marked **(from NM)** (MP at $110 NM → $88).
- [ ] 🆕 A row with no price and no Near Mint price waits for its printing, then shows TCGplayer's price.
- [ ] 🆕 A Sell Price that isn't a number is **Can't import** with its line number.
- [ ] 🆕 Dropping a CSV on an **empty** collection or project imports into it; on one with cards, a message says it can't.
- [ ] 🆕 Picks are remembered: importing the same file again matches them straight away.

## 11. Home

- [ ] Today, Quick actions, Collections and projects (with the Can't upload cards tile 🆕), Days to export, Recent activity.
- [ ] A project's oldest price turns amber after 14 days.
- [ ] At **1366×768**, Days to export still lists a day and Recent activity still shows.

## 12. Changelog 🆕

- [ ] Opens on **Buys**. Ctrl+click adds categories; Magic / Pokémon filters; the funnel shows one buy's history.
- [ ] 🆕 The run's new entries are all there, in the right categories: **Project converted to buy** and **Buy converted to
      project** (Buys), **Cards imported** (Collections), **Buy exported / Buy export undone**, a rejection with its
      reason, **Collection repriced** (Actions).
- [ ] Names link to their day page or collection; deleted ones aren't links.

## 13. Settings

- [ ] API keys (the JustTCG key), JustTCG usage, Master Buy Percentages, Master Fallback Percentages.
- [ ] Master Crystal Inventory: upload status and row count.
- [ ] Crystal Commerce matching lists remembered matches.
- [ ] The footer version; the backup reminder after a download.

## 14. Wide and narrow

- [ ] Every tab at **1366×768** (the store laptop): nothing cut off or overlapping.
- [ ] A window narrower than the app supports shows its "Please use a wider window" message.

## 15. Errors and edge cases

- [ ] JustTCG's daily limit or a missing key: the price line says so, and a manual price still works (check the
      message only; don't remove the real key).
- [ ] A card with no price at all: ADD CARD asks for a manual price (Alt+M).
- [ ] A slow Scryfall or TCGdex: the yellow line over the suggestions says so and retries.
- [ ] Two tabs on one computer share the walk-in draft; a stale write reloads instead of losing anything.

## 16. Clean up the test data

- [ ] Delete every `SMOKE` collection and project (the table's ⋯ → Delete collection…).
- [ ] Delete today's SMOKE buys (day page ⋯ → Delete buy…), after marking any exported ones Paid/Ours again.
- [ ] Delete the `SMOKE` users (⋯ → Delete…).
- [ ] Note JustTCG usage now: ________ (requests used by the run: ______)
- [ ] The SMOKE customer names stay in the past-customer list (there's no delete for them); they're harmless on dev.

## 17. At the store (the owner)

- [ ] **Two computers on the same collection:** view only, Take over, the edit goes through; a delete or convert
      while the other computer has it open is refused.
- [ ] **Wi-Fi off mid-buy**, then back: nothing is lost, the draft survives a refresh.
- [ ] **A real Crystal Commerce upload** of a deliberate small batch (NM only; LP only; one card in LP and HP; NM and
      LP of one card; one that can't match). In Crystal Commerce: NM prices set as expected, worse conditions'
      quantities added with no price change, the Custom SKU on every row.
- [ ] Every store computer's browser at the zoom staff use; pop-ups allowed for the TCGplayer / Scryfall links.

## 18. Make a database test run

- [x] **Make a database test run:** call every server function (confirm buy, collections and their statuses,
      Convert to project and Convert to buy, REPRICE?, export and undo, Can't upload cards, import, delete, the
      locks, backup restore…) on **dev**, each inside a transaction that's rolled back afterwards, and check its
      results and refusals. Keep the script, to run the same checks on **prod** after the migration squash and
      prove the two match. **Done 2026-10-12:** `node scripts/db-test-run.mjs` (results below, under "Database
      test run 1").

---

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

### For the next smoke test

- [ ] 🆕 **Settled reads (decision 322):** in a run, the run log's failed reads just before a card goes in (no-card about 0.6 s before a sent) fall from about half to few; cards go in at the same pace or faster; the collector box stays whole past card 100.
- [ ] 🆕 **Stop is an abort (decision 321):** press Stop mid-read (Reading…) and while the camera's refocusing: the picture and the phone's green camera dot go at once and the camera doesn't come back by itself; START CAMERA starts it again.
- [ ] 🆕 **Awake while scanning (decision 320):** with the computer's display set to sleep after 2 minutes, scan cards from the phone for 5: the screen stays on; 10 minutes after the last card it sleeps as usual.
- [ ] 🆕 **Edit opens every printing (decision 319):** click a Magic line (Sol Ring CMR): the search reads "Sol Ring", every printing shows, the line's own is selected with its condition and price; SAVE EDIT saves over it. A basic land still edits (falls back to its exact search). A Japanese Pokémon line keeps its number search.
- [ ] 🆕 **🔔 resets the sound (decision 318):** when the chimes go quiet, tap 🔔 (to 🔇) and again (to 🔔): a chime plays at once, and the next cards chime; with the iPhone's silent switch on too.
- [ ] 🆕 **The collector box keeps up (decision 317):** a long run, 150+ cards in one stack: the info box keeps both collector lines whole near the top of the stack, and the strip keeps reading (few cards going to the title or the name box); the run log's quick strip reads don't fall away after card 100.
- [ ] 🆕 **Surge foils priced (decision 316):** Altered Ego (FIC 317) scanned as foil, or picked on the Buy tab with FOIL: priced (~$0.40, JustTCG's conditions), not asking for a price; its nonfoil still ~$0.20.
- [ ] 🆕 **Promos that print PRM (decision 313):** Etali, Primal Storm with "100/196 P / PRM ★ EN" (or another 2018–2019 promo): Scan card (or auto scan) opens "Which Etali, Primal Storm? A promo: match the stamp." with its promo printings; picking one adds it as foil when the strip shows the star; auto scan doesn't switch to reading the title.
- [ ] 🆕 **The view found again every 20 cards (decision 312):** scan a stack of 25+ cards with auto scan: around the 20th the view shifts slightly to fit the card (no message, never the whole picture), and the card in the holder isn't added twice; the reads stay right as the stack grows.
- [ ] 🆕 **Which card? (decision 311):** Heaven's Gate (Legends) or any card the title can't be read on: Title opens "Couldn't read the name. Which card is it?" with a guess in the box; × clears it; typing "heav" lists Heaven's Gate; tapping it (or Find printings) opens its printings; picking one adds it. With auto scan, the same card left in the holder opens the box by itself after a few looks. Skip sets it aside and auto scan doesn't ask again for that card.
- [ ] 🆕 **White titles read (decision 309):** a Mercadian Masques card (Statecraft, Misdirection), an Apocalypse or Urza's Destiny card: Title (or the older-card mode) names it and opens its printings, where before it said it couldn't read the title.
- [ ] 🆕 **Older card titles found (decision 308):** an older card (Courser of Kruphix, a 4th Edition card, a Mirrodin card): Title shows the name itself in the info box, level and whole, not the frame's line; the printing list opens with the right name, also when the card sits a little high or low in the holder.
- [ ] 🆕 **The computer never stuck (decision 307):** with Chrome's network throttling on the computer (Slow 3G) while scanning, scans still finish or fail with a reason within 30 s, and the next scans go in once the connection's back; on the phone, a scan waiting over 15 s says "still waiting on <computer>" or "still pricing it" in amber.
- [ ] 🆕 **Too dark (decision 306):** scan in a dim corner: after a few looks the strip suggests 💡; turning it on (or more light) clears it; a Scan card that fails in the dark says it's too dark. A black-bordered card in good light never gets the hint.
- [ ] 🆕 **Auto scan rests (decision 304):** leave the scanner on with an empty holder for a minute, then lay a card: it's read within about a second, and the next cards go in at the usual pace.
- [ ] 🆕 **The camera cut off (decision 303):** scanning, take a call (or open the phone's own camera from the control centre): the strip says the phone has the camera, auto scan waits; back, scanning carries on with the view still locked. A picture that freezes restarts by itself within a few seconds.
- [ ] 🆕 **A scan saved once (decision 302):** on a weak connection (Chrome's throttling on the laptop's `#/scan`), a card whose send is slow goes in once, not twice; only after three tries does the phone say "No answer from the computer after three tries".
- [ ] 🆕 **Flagged buys on the printout (decision 301):** a day with a 🚩 flagged Magic buy and an unflagged one: EXPORT ▾ → Print MTG? has the red CHECK CONDITION banner naming that buy on every page, the rows as before; the flagged buy's ⋯ → Print buy has it too; after ✅ Condition checked, no banner; a BUY COMPLETE printout of a buy flagged at CONFIRM BUY has the banner; the same on a Pokémon day (Print PKM?) and a flagged Pokémon buy's Print buy.
- [ ] 🆕 **Never stuck (decision 300):** on a slow or flaky network (phone on weak Wi-Fi, or Chrome's network throttling on the laptop's `#/scan`), Scan card ends within 20 s with "That took too long…" instead of Reading… for good; the next press works without a refresh.
- [ ] 🆕 **Stop and start over (decision 300):** while reading, after 3 s the button says "Reading… tap to stop": tapping it says Stopped and the next Scan card reads; holding Scan card (a buzz) starts over and reads the card in the holder, even the same card auto scan just sent; the long press opens no menu or text selection on the phone.
- [ ] 🆕 **Help search (decision 299):** in Help, type "stickers" in the box at the header's right: Print PKM Stickers? pages first, each with its chapter, a count and a line with the word marked; ↓ ↑ Enter opens one and scrolls to the word, highlighted; "pokemon" finds "Pokémon"; "zzz" says no page has it; Esc clears the box and the highlights; ← → still turn pages when the box isn't focused.
- [ ] 🆕 **Undo export… (decision 298):** on an exported Paid/Ours collection, ⋯ → Undo export… asks, then the Custom SKU chip goes, the green prices turn white, the Changelog says "Export undone (Custom SKU …)", and EXPORT offers the cards again; with a Can't upload copy, the copy leaves Can't upload cards; on a collection never exported the item is greyed "Nothing here is exported"; from a view-only computer it says to take over first.
- [ ] 🆕 **Stickers, then the day (decision 297):** on a past Pokémon day with Paid/Ours buys, EXPORT ▾ → Print PKM Stickers? opens the PDF tab and then asks "Complete the day?"; Complete day… opens the usual step; Not yet closes it; on today, or a day already Completed, no ask.
- [ ] 🆕 **Collections by hand (decision 294):** EXPORT on a Paid/Ours collection stamps its Magic cards and leaves it Paid/Ours (toast without "Marked Completed"; the SKU chip shows); EXPORT again says every Magic card is exported already; the status dropdown and "Mark as Completed →" set Completed from Paid/Ours; Reopen puts it back to Paid/Ours with the stamps kept; a project can be marked Completed with no export.
- [ ] 🆕 **Mark as completed strikes (decision 295):** on a Magic buy its cards cross out and the buy reads Completed; Mark Paid/Ours again brings them back unstruck; on a Pokémon buy nothing is struck.
- [ ] 🆕 **Convert to project skips Completed (decision 296):** a buy with one game Completed converts: the live cards move, the buy stays with the Completed ones; the dialog says so; a buy with nothing live is blocked.
- [ ] 🆕 **Buys numbered forever (decision 290):** CONFIRM BUY says "Buy 42" (one more than the last buy of either game, any day); the day page, the changelog entry, the header search and the buy's ⋯ printout title all show the same number; a Pokémon buy confirmed next is 43.
- [ ] 🆕 **The SKU is the day's (decision 291):** EXPORT on a past Magic day page says Custom SKU `101626`-style for that day in the Confirm step and in the file; Export single buy says `101626-42`; a collection's export still says today's.
- [ ] 🆕 **BUY COMPLETE (decision 292):** after CONFIRM BUY a dialog: "Cards saved in the Calendar page: Magic · <today>" in green, Buy N · customer, the count, what was paid; Print MTG? / Print PKM? open the audit printout for that buy; No thanks, × and Esc close it and the search is focused.
- [ ] 🆕 **mimp mode (decisions 293, 323):** the 🌼 | 🦇 pill after EN | JP, 🌼 lit to start: ADD CARD clears the card area as before. 🦇 (mimp mode, tooltip "mimp mode: keep the search after each card"): ADD CARD leaves the search and card in place with Qty back to 1 (Enter again adds another). Kept from buy to buy, back to 🌼 when the screen opens; saving an edit always clears.
- [ ] 🆕 **Wrong products put right (decision 286):** Charmander `44/225 SVP` prices as Charmander (~$50, not Fuecoco's ~$5) and View on TCGplayer opens Charmander 044; Mimikyu V `TG16/TG30` (Brilliant Stars Trainer Gallery) prices ~$80, not the plain card's.
- [ ] 🆕 **Own products read as the version (decision 287):** Exeggcute `1/131 PRE` Master Ball pattern shows JustTCG's five conditions, no "fallback" tag; an SM Black Star Promo (Rowlet SM01) likewise.
- [ ] 🆕 **TCGplayer versions on request (decision 289):** a card with all its products (Charizard ex 223/197 OBF) shows no "TCGplayer" versions until **Other TCGplayer versions…** is clicked (then "Looking on TCGplayer…", and the Prize Pack / stamped ones or "No other TCGplayer versions."); Mimikyu ex 069 JTG (a stamp TCGdex gives no product) still gets its "Journey Together Stamped" version by itself; Staryu 33/146 XY still offers REVERSE without the search; editing a saved Cosmos Holo line finds its version again; Settings → JustTCG usage climbs by about one per Pokémon card, not two.
- [ ] 🆕 **The name search by the set's home (decision 288, after the function is deployed):** Purugly `36/130` (Diamond & Pearl) and a Sun & Moon base card get prices; a Base Set card without its own product (a 4th-print version) no longer says "no match" for being ambiguous.

New since 0.9.9.8-day1, worth a check:
- [ ] **Qty:** Alt+Q, type 3, Enter: 3 added, and Qty reads 1 again.
- [ ] **Every card starts fresh:** Lightning Bolt, LP + Use Cardmarket; pick another card, then Bolt again: NM, no tag.
      A placeholder's typed name and price are gone the same way. SAVE EDIT on a line still brings back its own.
- [ ] **Bulk counted apart:** a walk-in with cards in both games plus a bulk item. The other game's day page says
      "Also has 3 Pokémon cards + 100 bulk →"; its Changelog entry reads "… cards + 100 bulk bought …" and its
      green chip counts cards only. A placeholder counts as a card.
- [ ] **SAVE EDIT finds every kind of line:** Magic ("Lightning Bolt 117 2X2"), TCGdex Pokémon ("Charizard 4/102 BS"),
      Japanese (JP switched on), a TCGplayer-only version (it comes back once loaded), bulk ("BULK pkm") and a
      placeholder (its name back). Esc leaves each as it was.
- [ ] **Strike one copy, not all:** striking every card of one game makes that side Completed (by design).
- [ ] **The background** behind the Buy tab looks as before (re-encoded to 28 KB, `0ef948c`).
- [ ] **Show all finds struck cards** (decision 275): strike a card, search it in the header. Paid/Ours only: not
      there. Show all: crossed out with a grey **Struck** chip, its tooltip saying who and when, apart from the
      card's live copies.
- [ ] **Cards by game on a name** (decision 276): point at a collection's or project's name on the Collections tab
      and on Home: a chip with a line per game ("MTG 4 cards", "PKM 3 cards + 100 bulk"), "No cards yet" when empty;
      it isn't cut off on the table's last row.
- [ ] **A Completed buy's names in grey** (decision 277): ⋯ → Mark as completed on a test buy: every card name turns
      the struck cards' grey (not faded); Mark Paid/Ours again: white again.

**The phone scanner** (decisions 278–279, docs/SCAN_FUNCTION.md; every phase's "Where to look" list is in its
Section 15). On a phone: `npm run dev:lan` on the laptop, the phone at `https://<laptop>:5180/#/scan` (docs/SETUP.md);
without one, `#/scan` in a second browser on the laptop uses the webcam.
- [ ] **Pairing:** the phone lists the laptop's Price tab, a project and a collection as they open and close;
      Pokémon only or a Paid/Ours collection greys the row with why; tapping pairs, and the laptop's list shows
      **📱 <phone> · 0 scanned** with ×; × or leaving the price screen sends the phone back to its list, saying why.
- [ ] **Scan card, a modern card:** the strip goes Sending → Pricing → ✓ Added at $…, with a chime; the laptop's
      line flashes in at the price the stage shows with **Use TCGplayer** on; clicking the line opens it with
      Use TCGplayer on; JustTCG's usage in Settings hasn't moved.
- [ ] **Condition, Foil, a second copy:** LP + Foil → `*F* [LP]`; a non-foil-only card stays non-foil; Scan card on
      the same card → ×2.
- [ ] **By itself:** cards laid in the frame one after another are added with a chime each; one left there is
      added once ("Same card in view").
- [ ] **No price:** an obscure promo → the phone asks; a price adds it as ✎ manual; Skip adds nothing.
- [ ] **↶ Undo** takes one copy back off the laptop's list; the count goes down.
- [ ] **Refused:** a German card ("Not English"); the back of a card ("Couldn't read"); the laptop's user signed out
      ("Pick a user on …"), then picked again.
- [ ] **An older card,** filling the frame, with Scan card: a 2005 card's printing, or its printings to pick from;
      a 1995 card's printings to pick from by set symbol.
- [ ] **The desktop app is unchanged** at 1200 × 650 and up; the Help tab has **Scanning from a phone**.
- [ ] **The benchmark on the store's own photos:** put them in `scan-fixtures/` (docs/SCAN_FUNCTION.md 11.3) and run
      `node scripts/scan-benchmark.mjs` (and `--titles` on old cards in a folder of their own).
