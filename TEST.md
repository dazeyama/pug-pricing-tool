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
