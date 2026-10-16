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

- [ ] Claude adds `.claude/launch.json` ("pug-dev": `npm run dev -- --port 5180 --strictPort`, port 5180) and starts the preview.
- [ ] The owner signs in. The computer has a name; a user is picked (add `SMOKE P6 Ash` if needed).
- [ ] The console shows no errors on load (Claude reads it).
- [ ] Note JustTCG usage: ________ and Settings values that sections change: Cash % ____, Credit % ____.

<!-- Sections are added below as each Phase 6 commit lands. -->

## 1. A collection's "why not" tooltips (B8, CollectionPage)

Every reason is the same words in the same order as before (checked
string by string when it was written); this checks they still show at
the right moments. Hover each button and read its tooltip.

- [ ] **Make `SMOKE P6 Collection`** (Collections → + Price Collection, phone `(555) 010-0601`). Empty and Processing:
  - [ ] REPRICE? reads **No cards to reprice**.
  - [ ] EXPORT ▾ → Print?'s tooltip: **Mark it Paid/Ours first**.
- [ ] Add one Magic card (Lightning Bolt 117/331 2X2). REPRICE? is usable (its tooltip is the plain "Bring every card's buy price up to today's prices").
- [ ] **No user picked** (pick none in the header): REPRICE? reads **Pick a user first**; the status buttons too. Pick the user again.
- [ ] **Hold a CSV over it** (any small CSV from the scratchpad): the drop overlay says **It already has cards: a file only goes into an empty collection or project.** Drop nothing.
- [ ] **Mark as Priced** (offer $1 cash), then **Mark as Paid/Ours** ($1 cash):
  - [ ] Searching to add a card: blocked with **Paid/Ours: unlock it to edit**; × still strikes (that's Paid/Ours).
  - [ ] Print? is usable now.
- [ ] Unlock it → back to Priced → **Reject**: Print?'s tooltip **Rejected: there is nothing to print**; editing says **Rejected: reopen it to edit**. Reopen it.
- [ ] **Can't upload cards** (Collections → System): the search field reads **Cards arrive here from exports: they can't be added by hand**; holding a CSV over it says **Can't upload cards only takes cards from exports.**
- [ ] **A project:** + Start Project `SMOKE P6 Project`, empty: ⋯ → Convert to buy… reads **No cards to convert**. Add a card: it's usable (open it, then Cancel).
- [ ] Delete collection… and Delete project… open their dialogs (Cancel both for now; section 9 cleans up).
- Not testable from one browser: "View only: … is editing", the delete/convert takeover wording, and "No connection" (two computers, or offline). Their words are the same strings as before.

## 2. Settings boxes (B11, useSettingField)

The four kinds of box share one hook now. Their checks and words are the
same; the one difference is the owner's: Master Buy Percentages says a bad
value in a **toast**, like the others, not under the box. Settings are
shared by every computer and dev is the live store, so saving is only
checked on the least-used boxes, and each value is typed back at once.

- [ ] **Master Buy Percentages:** type `101` in Cash %, press Enter: a red toast **Enter a number from 0 to 100, with up to 2 decimals.** and the box shows the saved value again. Nothing appears under the box. Same with `abc` in Credit %.
- [ ] Click into Cash % and out without typing: no toast (nothing changed).
- [ ] **Low-end and high-end rates:** low end `$` box → type the high end's amount or more: **The low end has to stay below the high end ($…).**; high end → `0`: **Enter a dollar amount over $0, with up to 2 decimals.** Both put the value back.
- [ ] **Master Fallback Percentages**, Pokémon **DMG**: note it (____), type one more, Enter: a green toast **Pokémon DMG fallback saved: …%.** Type the original back: saved again.
- [ ] **Bulk values**, one Pokémon item: note it (____), type `$` and a new amount: **… saved: $… per ….** (the `$` is taken off). Type the original back.
- [ ] Another tab on Settings sees the change arrive while you're not typing in that box (open a second preview tab; optional).

## 3. The Buy tab (C1, PricingScreen in five pieces)

PricingScreen was split into hooks, each a block of it called at the same
spot, so its effects still run in the same order. The parts that tie the
blocks together (selecting a card, editing a line, CLEAR, ADD CARD, the
keys) stayed where they were. Each part below names its commit.

**3a. Layout and SAVE EDIT's search (C1a: useStageRoom.js, editQuery)**
- [ ] Buy tab at the preview's full size: the list sidebar is wider than 340px when the suggestions leave room; two rows of suggestions.
- [ ] Resize the preview to 1200 × 650 (a laptop): 2 rows of 4, the list narrower; back to full size: as before. At under 650px tall: one row of 5.
- [ ] On a tall window the selected card grows to fill its column.
- [ ] SAVE EDIT finds each kind of line again (click the line in the list; the search bar shows its search and the card is selected):
  - [ ] a Magic card: "Lightning Bolt 117 2X2";
  - [ ] an English Pokémon card from TCGdex (e.g. `Charizard 4/102 BS`): "Charizard 4/102 BS";
  - [ ] a Japanese Pokémon card (JP, `025/165 SV2a`): "025/165 SV2a", JP switched on;
  - [ ] a bulk item: "BULK mtg" or "BULK pkm"; a placeholder: the same, with its typed name back.
  - Then CANCEL each (Esc): the line stays as it was.

**3b. Finish and version (C1b: usePrinting.js)**
- [ ] Magic `Lightning Bolt 117/331 2X2`: NON-FOIL by default; FOIL switches it, and Alt+F toggles back and forth; the price table follows.
- [ ] A card with an etched printing (e.g. `Sol Ring 472 CMR` → its etched sibling in Details): Alt+F leaves etched alone.
- [ ] Details: click another printing of the same card in the set; it's selected with the finish you clicked, and the suggestion highlight moves.
- [ ] Select a different card, then the first again: back on its defaults (a choice is forgotten once another card is picked).
- [ ] Pokémon `Pikachu 027 SVP`: TCGdex's holo is the default; the version list includes TCGplayer-only ones once they load; picking one changes the prices.
- [ ] A Base Set Pokémon (e.g. `Charizard 4/102 BS`): 1st Edition / Unlimited / Shadowless versions; Alt+F cycles finishes.
- [ ] JP `025/165 SV2a`: its versions and prices load (Pokémon detail through usePrinting).

**3c. Condition, manual price, override, placeholder name (C1c: usePricing.js)**
- [ ] A Magic card: NM by default; Alt+2 → LP, Alt+5 → DMG, clicking a condition too; the big price follows.
- [ ] Alt+M opens the manual price box; type `3.21`, Enter: "✎ manual" tag, $3.21. Pick another condition: the manual price is cleared.
- [ ] Use Fallback, then Use Cardmarket (where it has a Cardmarket price): the tag reads fallback / cardmarket; only one is on at a time.
- [ ] Select another card: NM, no manual price, no override, the manual box closed. Back to the first: its defaults too.
- [ ] Search `placeholder`, pick the Pokémon one, type a name `SMOKE P6 Meowth 117` and a price: both stay while it's selected; pick something else and come back: empty again.

**3d. Prices (C1d: usePriceQuote.js)** — the ladder, fallbacks, Cardmarket, warnings and trends, unchanged
- [ ] A Magic card with JustTCG prices: five conditions, each at or below the one above, rounded down; the price panel's Credit and Cash at the card's rate.
- [ ] A Pokémon card with JustTCG prices: the same. A 1st Edition version shows its prices, and ⚠️ if they look off against the Unlimited one.
- [ ] A card with no JustTCG price for a condition: "fallback" on it (NM × the Master Fallback %).
- [ ] JP `025/165 SV2a` with no JustTCG prices: Cardmarket in dollars on its own ("cardmarket" tag); the English name shows beside the Japanese one.
- [ ] Use TCGplayer / "TCGplayer" tag where every price is TCGplayer's (as before).
- [ ] 📈 / 📉 beside a price that moved sharply (if one turns up; not every card has one). Hovering it opens its box.
- [ ] A project (`SMOKE P6 Project`): prices round **up**.
- [ ] ADD CARD a priced card, then open the line (SAVE EDIT): the same price, condition and source come back.

**3e. The line under the search bar (C1e: useSearchNote.jsx)**
- [ ] Open a list line (SAVE EDIT): **Editing 1 Lightning Bolt … : SAVE EDIT saves the changes, Esc leaves it as it was.** Esc: the note goes.
- [ ] With EN on, type `No. 121`: **No. 121 finds old Japanese Pokémon cards by Pokédex number: switch to JP**; click it: JP is on and the search runs.
- [ ] Back to EN, type `2/184 S8b`: **S8b is a Japanese Pokémon set: switch to JP**; click it: JP on. With JP on, an English set code (`4/102 BS`): **… is an English Pokémon set: switch to EN**.
- [ ] A misspelling (`Lightnig Bolt`): **Showing results for Lightning Bolt**.
- [ ] After each switch, typing goes straight into the search field (focus came back).

**3f. What ties the pieces together (stayed in PricingScreen)** — the most likely place for a seam to show
- [ ] Type `Lightning Bolt 117/331 2X2`: the one match is selected by itself; Enter adds it; the new line flashes; the stage clears and the search is empty, focus in it.
- [ ] Type `Lightning Bolt`: nothing selected; Enter says **Select a card first: ↓ picks the first suggestion.**; ↓ selects the first, ↑/↓ move, ↓ past the last highlights "… show all", Enter opens it; Esc closes it.
- [ ] Alt+Q jumps to Qty; type 3, Enter adds 3.
- [ ] CLEAR (or Esc in the search): stage empty, the list untouched.
- [ ] Right-click a suggestion: its name becomes the search.
- [ ] SAVE EDIT on a Pokémon line with a TCGplayer-only version: the version comes back once the TCGplayer search lands; change the condition, SAVE EDIT: the line updates in place (flashes), not a new line.
- [ ] Remove the edited line with × while editing: the edit stops (the note goes).
- [ ] **CONFIRM BUY** a walk-in `SMOKE P6 Ash`, `(555) 010-0601`, $1 cash: the stage resets, MTG | PKM both on, sort back to newest (the resetKey). Section 9 deletes this buy.
- [ ] Console: no new errors or React warnings through all of section 3.

## 4. A day page (C2, DayPage in files)

DayPage's buy panel, its condition chip and its two dialogs moved to
`src/pages/day/` word for word; the actions stayed in DayPage. Use the
`SMOKE P6 Ash` buy confirmed in 3f (today's Magic day page); **never act
on a real customer's buy**.

- [ ] Calendar → today → Magic: the SMOKE buy's panel shows its number, customer, phone, time, user, its cards with prices, and Market / Cash / Credit at the rates kept when it was confirmed.
- [ ] Hover a card line: its picture shows beside the panel. Right-click a card: Set Rate isn't offered here; a struck card offers **Restore**.
- [ ] × on a card: **Strike card?**; Strike → crossed out, still in the totals; right-click → Restore → back.
- [ ] ⋯ menu: its items are there (Edit, Convert to project…, Mark as completed, Delete buy…, Flag check for condition / Condition checked, Export single buy).
- [ ] ⋯ → **🚩 Flag check for condition**: the chip shows; click it → **✅ Condition checked?** → click elsewhere: it closes; again → Yes: green ✅ with who and when.
- [ ] ⋯ → **Mark as completed** on the SMOKE buy: its cards lock, a × says **Completed (marked by hand, not exported): its ⋯ → Mark Paid/Ours again to change it**. ⋯ → Mark Paid/Ours again: unlocked.
- [ ] ⋯ → **Convert to project…**: the name is the customer's; Cancel. ⋯ → **Delete buy…**: its card count; Cancel (section 9 deletes it).
- [ ] If the buy has both games: **Also has N Pokémon cards →** goes to that day's Pokémon page.
- [ ] Day-page EXPORT and COMPLETE: open, check the counts, **Cancel** (never confirm: real buys).

