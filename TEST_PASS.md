# TEST_PASS.md — smoke test for FABLE_REPORT Phase 6

A focused smoke test of everything Phase 6 touched, run **together, in the
app's preview browser, right after Phase 6 is implemented**: Claude drives,
the owner watches and signs in. This is an exception the owner asked for
(2026-10-16) to the usual "owner is QA, no browser checks by Claude".

Phase 6 changes structure, not features: every check below asks "does it
still do exactly what it did?". Each section names the commit it tests, so a
finding points at one commit to fix or revert.

- **Build under test:** the Phase 6 commits on top of `55bab42` (listed per
  section). Settings footer: 0.9.9.8-day1.
- **Where:** the local dev server, http://localhost:5180 (`npm run dev --
  --port 5180`, started by the preview as `.claude/launch.json` "pug-dev").
  It uses the **dev** database, which is **also the live store's** until
  launch. **Never prod.**
- **Who:** the owner signs in (Claude never types the store password).
  Claude drives the rest and records what it sees.

## Result of the run (2026-10-16, early morning, owner away)

**No Phase 6 regression found.** Every section passed. The run turned up
four things that were already there before Phase 6 (the same code is in
`77d8c84`, the live build): one P2 and three P3 observations, in Findings
below. Nothing was fixed during the run. Some lines of this document were
wrong about how the app behaves; they're marked **Doc:** where they occur.
Items that couldn't be run from one browser are marked **NOT RUN**.

- Preview at 1393–2560 px wide (emulated sizes for 3a), signed in by the
  owner, user `SMOKE P6 Ash`, backup downloaded by the owner first.
- JustTCG: 198 → 210 today (12 requests).
- Every SMOKE P6 record was deleted at the end; Settings read their start
  values; the preview was stopped and `.claude/launch.json` removed.

## Ground rules

- **Test data is named `SMOKE P6 …`** (customers, collections, projects),
  with 555 phone numbers (`(555) 010-0601`), so it's easy to find and delete
  at the end. **Never change a real customer's buy or collection.**
- **No EXPORT is saved.** Export dialogs are opened, checked and cancelled.
  COMPLETE and EXPORT on a day are never confirmed: they'd mark real buys.
- **Watch JustTCG's budget:** note Settings → JustTCG usage at the start
  and end; this run should take well under 60 requests.
- **Settings values are put back.** Where a check changes a percentage or a
  value, the original is noted first and typed back after.
- **Findings** go in the table at the bottom: steps, what happened, what
  should have, the commit, and a priority (P1 breaks something staff rely
  on; P2 wrong or misleading with a workaround; P3 cosmetic).
- **Nothing is fixed during the run.** Fixes come after, from the findings.

---

## 0. Setup

- [x] Claude adds `.claude/launch.json` ("pug-dev": `npm run dev -- --port 5180 --strictPort`, port 5180) and starts the preview.
- [x] The owner signs in. The computer has a name; a user is picked (add `SMOKE P6 Ash` if needed).
- [x] The console shows no errors on load (Claude reads it).
- [x] Note JustTCG usage: **198 / 1,000 today (4,073 / 10,000 month)** and Settings values that sections change: Cash % **33.34**, Credit % **66.68**.
- [x] **Download backup** (Settings → Backups): a JSON file saves; keep it until the run is over. *(The owner did this before leaving.)*

## 1. A collection's "why not" tooltips (B8, CollectionPage) — PASS

Every reason is the same words in the same order as before (checked
string by string when it was written); this checks they still show at
the right moments. Hover each button and read its tooltip.

- [x] **Make `SMOKE P6 Collection`** (Collections → + Price Collection, phone `(555) 010-0601`). Empty and Processing:
  - [x] REPRICE? reads **No cards to reprice**.
  - [x] EXPORT ▾ → Print?'s tooltip: **Mark it Paid/Ours first**.
    **Doc:** this reason is on the details ⋯ → "Print collection" item; EXPORT ▾ → Print? shows it as a toast ("Mark it Paid/Ours first."). Both right, as before B8.
- [x] Add one Magic card (Lightning Bolt 117/331 2X2). REPRICE? is usable (its tooltip is the plain "Bring every card's buy price up to today's prices").
- [x] **No user picked** (pick none in the header): REPRICE? reads **Pick a user first**; the status buttons too. Pick the user again.
- [ ] **Hold a CSV over it** (any small CSV from the scratchpad): the drop overlay says **It already has cards: a file only goes into an empty collection or project.** Drop nothing.
  **NOT RUN:** the preview can't drag a real file in.
- [x] **Mark as Priced** (offer $1 cash), then **Mark as Paid/Ours** ($1 cash):
  - [x] Searching to add a card: blocked with **Paid/Ours: unlock it to edit**; × still strikes (that's Paid/Ours).
  - [x] Print? is usable now.
- [x] Unlock it → back to Priced → **Reject**: Print?'s tooltip **Rejected: there is nothing to print**; editing says **Rejected: reopen it to edit**. Reopen it.
- [x] **Can't upload cards** (Collections → System): the search field reads **Cards arrive here from exports: they can't be added by hand**; holding a CSV over it says **Can't upload cards only takes cards from exports.**
  *(The search field reason checked; the CSV drag NOT RUN, as above.)*
- [x] **A project:** + Start Project `SMOKE P6 Project`, empty: ⋯ → Convert to buy… reads **No cards to convert**. Add a card: it's usable (open it, then Cancel). *(Print project, empty: "No Magic cards here" too.)*
- [x] Delete collection… and Delete project… open their dialogs (Cancel both for now; section 6 cleans up).
- Not testable from one browser: "View only: … is editing", the delete/convert takeover wording, and "No connection" (two computers, or offline). Their words are the same strings as before. **NOT RUN.**

## 2. Settings boxes (B11, useSettingField) — PASS

The four kinds of box share one hook now. Their checks and words are the
same; the one difference is the owner's: Master Buy Percentages says a bad
value in a **toast**, like the others, not under the box. Settings are
shared by every computer and dev is the live store, so saving is only
checked on the least-used boxes, and each value is typed back at once.

- [x] **Master Buy Percentages:** type `101` in Cash %, press Enter: a red toast **Enter a number from 0 to 100, with up to 2 decimals.** and the box shows the saved value again. Nothing appears under the box. Same with `abc` in Credit %.
- [x] Click into Cash % and out without typing: no toast (nothing changed).
- [x] **Low-end and high-end rates:** low end `$` box → type the high end's amount or more: **The low end has to stay below the high end ($…).**; high end → `0`: **Enter a dollar amount over $0, with up to 2 decimals.** Both put the value back.
- [x] **Master Fallback Percentages**, Pokémon **DMG**: note it (**40**), type one more, Enter: a green toast **Pokémon DMG fallback saved: …%.** Type the original back: saved again.
- [x] **Bulk values**, one Pokémon item: note it (**PKM 10 Bulk 50¢ cards: 2.5**), type `$` and a new amount: **… saved: $… per ….** (the `$` is taken off). Type the original back.
  **Doc:** a `$` can't be typed into these number boxes at all, so "the `$` is taken off" can't be reached from the keyboard. The saves and toasts were right ("…saved: $3 per 10.", then "$2.50 per 10.").
- [ ] Another tab on Settings sees the change arrive while you're not typing in that box (open a second preview tab; optional).
  **NOT RUN** (optional; that code is unchanged by B11).

## 3. The Buy tab (C1, PricingScreen in five pieces) — PASS

PricingScreen was split into hooks, each a block of it called at the same
spot, so its effects still run in the same order. The parts that tie the
blocks together (selecting a card, editing a line, CLEAR, ADD CARD, the
keys) stayed where they were. Each part below names its commit.

**3a. Layout and SAVE EDIT's search (C1a: useStageRoom.js, editQuery)**
- [x] Buy tab at the preview's full size: the list sidebar is wider than 340px when the suggestions leave room; two rows of suggestions.
  **Doc:** at 1920 wide the card's growth takes the spare room (list stays 340); the list widens on a very wide screen (2560: +220px, its maximum).
- [x] Resize the preview to 1200 × 650 (a laptop): 2 rows of 4, the list narrower; back to full size: as before. At under 650px tall: one row of 5.
- [x] On a tall window the selected card grows to fill its column. *(1920 × 1080: +84px; 1393 × 922: +55px.)*
- [x] SAVE EDIT finds each kind of line again (click the line in the list; the search bar shows its search and the card is selected):
  - [x] a Magic card: "Lightning Bolt 117 2X2";
  - [x] an English Pokémon card from TCGdex (e.g. `Charizard 4/102 BS`): "Charizard 4/102 BS";
  - [x] a Japanese Pokémon card (JP, `025/165 SV2a`): "025/165 SV2a", JP switched on;
  - [x] a bulk item: "BULK mtg" or "BULK pkm"; a placeholder: the same, with its typed name back. *("BULK pkm" for both; the placeholder's name and $0.50 came back.)*
  - Then CANCEL each (Esc): the line stays as it was. ✓
  - Also: a Pikachu SVP line opened while JP was on switched back to EN by itself ("Pikachu 027/225 SVP").

**3b. Finish and version (C1b: usePrinting.js)**
- [x] Magic `Lightning Bolt 117/331 2X2`: NON-FOIL by default; FOIL switches it, and Alt+F toggles back and forth; the price table follows.
- [x] A card with an etched printing (e.g. `Sol Ring 472 CMR` → its etched sibling in Details): Alt+F leaves etched alone. *(Tested on the STA #105 etched printing.)*
- [x] Details: click another printing of the same card in the set; it's selected with the finish you clicked, and the suggestion highlight moves. *(Sol Ring CMR → Extended art #700 selected; it wasn't among the suggestions, so no highlight to move.)*
- [ ] Select a different card, then the first again: back on its defaults (a choice is forgotten once another card is picked).
  **NOT RUN separately for the finish.** For the condition and price source this doesn't hold, before Phase 6 as well: see Findings #2.
- [x] Pokémon `Pikachu 027 SVP`: TCGdex's holo is the default; the version list includes TCGplayer-only ones once they load; picking one changes the prices. *(HOLO NM $18; the Pokémon Center stamp version: NM $160.)*
- [x] A Base Set Pokémon (e.g. `Charizard 4/102 BS`): 1st Edition / Unlimited / Shadowless versions; Alt+F cycles finishes.
  **Doc:** Charizard is holo only (NORMAL and REVERSE read "Not printed…"), so Alt+F has nothing to cycle to. The versions were all there (plus 1999–2000 Copyright and TCGplayer ones).
- [x] JP `025/165 SV2a`: its versions and prices load (Pokémon detail through usePrinting). *(NORMAL NM $0.28; Alt+F goes to REVERSE (Poké Ball), skipping HOLO, which isn't printed.)*

**3c. Condition, manual price, override, placeholder name (C1c: usePricing.js)**
- [x] A Magic card: NM by default; Alt+2 → LP, Alt+5 → DMG, clicking a condition too; the big price follows.
- [x] Alt+M opens the manual price box; type `3.21`, Enter: "✎ manual" tag, $3.21. Pick another condition: the manual price is cleared.
- [x] Use Fallback, then Use Cardmarket (where it has a Cardmarket price): the tag reads fallback / cardmarket; only one is on at a time.
  **Doc:** the first button is "Use TCGplayer" now (tag TCGPLAYER).
- [x] Select another card: NM, no manual price, no override, the manual box closed.
- [ ] Back to the first: its defaults too. **Not so, before Phase 6 too:** the first card's override (and condition, manual price) come back. Findings #2.
- [x] Search `placeholder`, pick the Pokémon one, type a name `SMOKE P6 Meowth 117` and a price: both stay while it's selected.
- [ ] Pick something else and come back: empty again. **Not so, before Phase 6 too:** the name and price come back. Findings #2.
- [x] A7: a placeholder with no price reads "Type its price: a placeholder has none of its own"; with `0`, ADD CARD reads **A placeholder's price has to be over $0**.

**3d. Prices (C1d: usePriceQuote.js)** — the ladder, fallbacks, Cardmarket, warnings and trends, unchanged
- [x] A Magic card with JustTCG prices: five conditions, each at or below the one above, rounded down; the price panel's Credit and Cash at the card's rate. *(Bolt $2 / 1.50 / 1.25 / 1 fallback / 0.90.)*
- [x] A Pokémon card with JustTCG prices: the same. *(Charizard Unlimited $950 / 525 / 360 / 245 / 200, each "rounded down from $954.65…"; Pikachu LP $120 → Credit $84, Cash $48 at the high-end 70/40.)*
- [ ] A 1st Edition version shows its prices, and ⚠️ if they look off against the Unlimited one. **Charizard 1st Edition had no price at all** (every condition "no price: enter a manual price", no fallback), so the ⚠️ couldn't be checked. The code is line for line what it was. Findings #3.
- [x] A card with no JustTCG price for a condition: "fallback" on it (NM × the Master Fallback %). *(JP Pikachu MP/HP/DMG; Bolt HP.)*
- [x] JP `025/165 SV2a` with no JustTCG prices: Cardmarket in dollars on its own ("cardmarket" tag); the English name shows beside the Japanese one. *(Its REVERSE has no JustTCG price: NM $2.50 … DMG $1, CARDMARKET; "ピカチュウ Pikachu".)*
- [x] Use TCGplayer / "TCGplayer" tag where every price is TCGplayer's (as before).
- [ ] 📈 / 📉 beside a price that moved sharply (if one turns up; not every card has one). Hovering it opens its box. **None turned up on the cards used.**
- [x] A project (`SMOKE P6 Project`): prices round **up**. *(Bolt NM $2.25.)*
- [x] ADD CARD a priced card, then open the line (SAVE EDIT): the same price, condition and source come back. *(JP REVERSE LP $2 Cardmarket.)*

**3e. The line under the search bar (C1e: useSearchNote.jsx)**
- [x] Open a list line (SAVE EDIT): **Editing 1 Lightning Bolt … : SAVE EDIT saves the changes, Esc leaves it as it was.** Esc: the note goes.
- [x] With EN on, type `No. 121`: **No. 121 finds old Japanese Pokémon cards by Pokédex number: switch to JP**; click it: JP is on and the search runs.
- [x] Back to EN, type `2/184 S8b`: **S8b is a Japanese Pokémon set: switch to JP**; click it: JP on. With JP on, an English set code (`4/102 BS`): **… is an English Pokémon set: switch to EN**. *("BS is an English Pokémon set: switch to EN".)*
- [x] A misspelling (`Lightnig Bolt`): **Showing results for Lightning Bolt**.
- [x] After each switch, typing goes straight into the search field (focus came back).

**3f. What ties the pieces together (stayed in PricingScreen)** — the most likely place for a seam to show
- [x] Type `Lightning Bolt 117/331 2X2`: the one match is selected by itself; Enter adds it; the new line flashes; the stage clears and the search is empty, focus in it.
- [x] Type `Lightning Bolt`: nothing selected; Enter says **Select a card first: ↓ picks the first suggestion.**; ↓ selects the first, ↑/↓ move, ↓ past the last highlights "… show all", Enter opens it; Esc closes it.
- [x] Alt+Q jumps to Qty; type 3, Enter adds 3. *(Merged into the Bolt line: 1 → 4, flashed.)* But Qty still reads 3 afterwards: Findings #1 (before Phase 6 too).
- [x] CLEAR (or Esc in the search): stage empty, the list untouched.
- [x] Right-click a suggestion: its name becomes the search.
- [x] SAVE EDIT on a Pokémon line with a TCGplayer-only version: the version comes back once the TCGplayer search lands; change the condition, SAVE EDIT: the line updates in place (flashes), not a new line. *(Pikachu stamp: $160 → $120 [LP], same line.)*
- [x] Remove the edited line with × while editing: the edit stops (the note goes). *("Remove card?" → Remove; ADD CARD back.)*
- [x] **CONFIRM BUY** a walk-in `SMOKE P6 Ash`, `(555) 010-0601`, $1 cash, with **🚩 Flag check for condition** ticked: the stage resets, MTG | PKM both on, sort back to newest (the resetKey). *(Magic was off and Oldest first before; both reset. Toast: "Buy confirmed — Buy 1 today (Magic + Pokémon). 🚩 Flagged…".)*
- [x] Console: no new errors or React warnings through all of section 3.
  *(12 "Failed to load resource" lines: the one traced was Scryfall's 404, its normal "no cards found" for a Pokémon-only query; one 500 from an outside API before tracing began. No app errors, no React warnings, no dev-server errors.)*

## 4. A day page (C2, DayPage in files) — PASS

DayPage's buy panel, its condition chip and its two dialogs moved to
`src/pages/day/` word for word; the actions stayed in DayPage. Use the
`SMOKE P6 Ash` buy confirmed in 3f (today's Magic day page); **never act
on a real customer's buy**.

- [x] Calendar → today → Magic: the SMOKE buy's panel shows its number, customer, phone, time, user, its cards with prices, and Market / Cash / Credit at the rates kept when it was confirmed.
- [x] Hover a card line: its picture shows beside the panel. Right-click a card: the browser's own menu (nothing of ours); right-click a struck card: **Restore**.
- [x] × on a card: **Strike card?**; Strike → crossed out, still in the totals; right-click → Restore → back.
  **Doc:** strike 1 of 4, not "Strike all": with every Magic card struck there's nothing left to export, so the Magic side reads Completed and EXPORT (0) (by design). Restore put it back to Paid/Ours, EXPORT (4).
- [x] ⋯ menu, while flagged: **✅ Condition checked** first, then Mark as completed, Export single buy, Print buy, Edit in project view, Convert to project, Delete buy….
- [x] The 🚩 chip (flagged at CONFIRM BUY in 3f): click it → **✅ Condition checked?** → click elsewhere: it closes; again → Yes: green ✅ with who and when, and ⋯ no longer offers ✅ Condition checked.
- [x] ⋯ → **Mark as completed** on the SMOKE buy: its cards lock, a × says **Completed (marked by hand, not exported): its ⋯ → Mark Paid/Ours again to change it**. ⋯ → Mark Paid/Ours again: unlocked.
- [x] ⋯ → **Convert to project**: the name is the customer's; Cancel. ⋯ → **Delete buy…**: its card count; Cancel (section 6 deletes it). *("all 7 cards + 100 bulk".)*
- [x] If the buy has both games: **Also has N Pokémon cards →** goes to that day's Pokémon page. *(It said 4: three cards and the bulk item. Findings #4.)*
- [ ] Day-page EXPORT and COMPLETE: open, check the counts, **Cancel** (never confirm: real buys).
  **NOT RUN:** both are blocked on today's page ("Today can't be exported until it's over…", "Today can't be marked Completed until it's over…"), and every other day's buys are real. Those dialogs stayed in DayPage (C2 didn't move them).

## 5. Styles (C4) — PASS

**5a. Dead rules removed (C4a)** — seven classes no code had used since late September; nothing should look different
- [x] Changelog: a panel's card lines show their **+** in green and **−** in red (the `.ch-mark` rules stayed).
- [x] Buy tab: the stage's areas sit where they did (the "space kept for later phases" boxes went, but nothing drew them).
- [x] A day page's buy table and an exported collection's list: prices and the Custom SKU chip as before. *(Oct 8 Pokémon day's Sell prices green; "Test Upload" collection: Custom SKU 100126 chip, Sell prices green.)*

**5b. price.css split into its areas (C4b)** — the built stylesheet is byte-for-byte the same as before (compared when it was done), so this is a glance, not a hunt
- [x] The Buy tab looks as it did: search bar, the card with its foil sheen on a foil, suggestions, Finish & Details, the price table, the price panel, the buy list.
- [x] The local dev server serves the split files: no "Failed to load" in the console, and the Buy tab isn't unstyled for a moment after a reload.
  **Doc:** the dev server inlines the 11 parts into price.css (one request, 431 rules, every area's rules present). A flash of unstyled page can't be seen by Claude's tools; after the reload it looked right.
- [x] A collection's screen (its flipped background and amber accent) and a project's look as they did.
  **Doc:** each kind has its own colour since 2026-10-01: a collection is cyan, a project pink. Both backgrounds mirrored.

## 6. Clean up — DONE

- [x] Day page (today, Magic): the `SMOKE P6 Ash` buy → ⋯ → **Delete buy…** → delete. (Its customer stays in Past customers: there's no delete for those, as after the last smoke test.)
- [x] Collections: `SMOKE P6 Collection` → Delete collection… (type its name); `SMOKE P6 Project` → Delete project….
- [x] Settings: the fallback % and bulk value from section 2 read what they did at the start (noted in section 0). *(All of Cash, Credit, low/high end, fallbacks and bulk values.)*
- [x] The user `SMOKE P6 Ash`, if added: remove from the user list.
- [x] Note JustTCG usage at the end: **210 / 1,000 today** (12 requests since the start).
- [x] Claude stops the preview server and removes `.claude/launch.json` (unless the owner wants to keep it for next time).
- [x] The Changelog keeps the run's entries (history is never deleted).
- The computer name the owner set for the preview (`SMOKE-RUN-6`) is this preview browser's own setting; left as it was.

## Findings

None is a Phase 6 regression: each is in the live build `77d8c84` too.

| # | Priority | Section | Commit | What happened | Expected | Steps |
|---|---|---|---|---|---|---|
| 1 | P2 | 3f | before Phase 6 (`ActionRow.jsx`) | After Enter in Qty adds a card, Qty still reads the number typed. The next card goes in at that quantity unless someone looks. By the code, clicking ADD CARD instead resets it to 1 (not tried in the run). | Qty back to 1 after every add. | Select a card, Alt+Q, type 3, Enter: 3 added; Qty shows 3. Cause: Qty's blur puts back its old value after CLEAR sets 1, when focus moves to the search. |
| 2 | P3, owner's call | 3c | before Phase 6 (keyed state) | A card's condition, manual price and Use TCGplayer/Cardmarket choice, and a placeholder's name and price, come back when you go back to that card. They're forgotten only by CLEAR, ADD CARD, SAVE EDIT, or by setting something on another card. | TEST_PASS said "its defaults" / "empty again". Whether that's wanted is the owner's call. | Bolt: Use Cardmarket → pick Sol Ring → back to Bolt: CARDMARKET still on. Placeholder: name + price → MTG placeholder → back: both still there. |
| 3 | P3, data | 3b / 3d | before Phase 6 | Charizard 4/102 BS **1st Edition** has no price in any condition and no fallback ("no price: enter a manual price"). Unlimited prices fine ($950 NM). | A price, or at least a fallback. JustTCG seems to have no 1st Edition match for it. | Search `Charizard 4/102 BS`, Details → 1st Edition. |
| 4 | P3 | 4 | before Phase 6 | Counts that include a bulk item call it one card: "Also has 4 Pokémon cards →" (3 cards + 1 bulk line), and the changelog's "8 cards bought". CONFIRM BUY and Delete buy say "7 cards + 100 bulk". | Bulk counted as bulk, as CONFIRM BUY does. | A walk-in with cards in both games plus a bulk item; open the other game's day page. |

**The owner's calls (2026-10-16), all committed locally, unpushed:**
- #1 fixed: Qty goes back to 1 after Enter adds (`41c8ed0`).
- #2 "always start fresh": picking another card forgets its condition, manual price, override and placeholder name (`4fe0015`, decision 272).
- #3 left as is: a printing that rare can go without a price; use a manual price.
- #4 bulk counted apart everywhere, placeholders as cards: the day page's "Also has" (`d6934e7`) and the Changelog's sentences, chips and folded runs (`5f20237`, migration 0066 on dev, decision 273).

## Sign-off

- [x] Every section passed, or its findings are listed above.
- [ ] Owner's call: push Phases 1–6 together (43 commits ahead of `origin/main` when Phase 6 was done, `5d275e7`; 45 with this run's results), fix findings first, or revert a commit (each section names its own).
