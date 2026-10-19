# PUG Pricing Tool — Team Feedback Plan: Printout, Individual Rates, Bulk

| | |
|---|---|
| **Product** | PUG Pricing Tool: three changes from the team's demo |
| **Owner** | Players' Union Games (PUG) |
| **Plan version** | 1.0 — 2026-10-14 |
| **Status** | Approved by the owner (2026-10-14). Phase T1 built (2026-10-14); Phase T2 built and checked by the owner (2026-10-15). Phase T3 (bulk) built and checked by the owner (2026-10-15). All three phases live as v0.9.9.7-feedback. |
| **Extends** | `docs/DESIGN_SPEC.md` (the app) and `docs/EXPORT_FUNCTION.md` (the export; retired 2026-10-18, `git show d158ee3:docs/EXPORT_FUNCTION.md`). Both stay the source of truth for everything not changed here. |
| **Project folder** | `C:\ClaudeProjects\pug-pricing-tool` |
| **Built after** | v0.9.9.6-cosmetics |

---

## 0. How to use this document

1. **Read the whole document before starting**, and the parts of `DESIGN_SPEC.md` and `EXPORT_FUNCTION.md` each phase names. Sections 1–5 describe the finished result; Section 6 lists every database change; Section 7 splits the work into phases T1–T3.
2. **One phase at a time, in order** (CLAUDE.md). Each phase ends at something the owner can check on `localhost`; don't start the next until the owner reports back.
3. **The owner is QA.** Build, run `npm test` and `npm run build`, run the database test run after a migration (`node scripts/db-test-run.mjs`, docs/TEST.md §21), fix what fails, then hand off with the phase's "Where to look".
4. **Database changes are new migration files, applied to the dev project only.** Rehearse SQL inside `begin … rollback` first; apply with `npx supabase db push`.
5. **Where it says must, it's a requirement; should, use judgement.** If something here conflicts with the owner's later word, the owner wins: update this file so it doesn't come back.
6. **No secrets, no customer data, no CSV files** in this document, the repo or the code.

---

## 1. Overview

### 1.1 The three changes, and why

| | What | The team's concern |
|---|---|---|
| **A** | **Audit printout** (Section 3): every EXPORT gets **Print?** beside **Export csv**, and every Magic buy's ⋯ gets **Print buy**. A 2-column PDF of the cards, by Crystal Commerce category, ticked off by hand. | A batch has to be checked by hand before it goes up to Crystal Commerce; a sheet in Crystal Commerce's own order makes that one walk through the stack. |
| **B** | **Individual rates** (Section 4): cards under $3 and over $35 get their own default rates, and any card can get its own rate by right-clicking it. Confirming a buy says which cards have their own rate and what it changes. | One flat rate overpays on cheap cards (the margin is handling) and underpays on high-end ones (a Revised dual land at 75–80% credit is normal), while the rest of the trade stays standard. |
| **C** | **Bulk** (Section 5): eight "cards" standing for unsorted bulk (100 commons/uncommons, 10 $1 cards…), priced from Settings, found only by searching "bulk". | Pricing a box of bulk card by card is slow, and stand-in cards would end up in the inventory. Bulk only helps price a buy; it never goes into the inventory. |

### 1.2 Order

T1 Printout → T2 Individual rates → T3 Bulk. The printout is self-contained (no database change). The rates change how every total is worked out, so they go before bulk, whose **Set value** is a variant of **Set Rate**.

### 1.3 Non-goals

- **No printout for Pokémon** for now (owner, 2026-10-14: a similar one may follow). Pokémon days keep COMPLETE; nothing about them changes in T1.
- **No prices on the printout.**
- **No user input while printing**: no matching dialog, nothing remembered (Section 3.3).
- **Bulk is never inventory**: never exported, never in a Mass Create file, never in Can't upload cards, never on a printout.
- **No change to past buys**: every rate is fixed on each card when its buy is confirmed (Section 4.6).

---

## 2. The owner's decisions (2026-10-14)

From the owner's notes and answers. Each is a rule below; the section is in brackets.

1. **Bulk values are market values**, set in Settings; Cash and Credit are taken from them like any card's market price (5.2).
2. **The low-end and high-end rates never apply to bulk**: bulk uses the master rates, or the buy's custom rates (4.1, 5.6).
3. **Bulk comes along on Convert to project and Convert to buy**, for now; this may change once the workflow is seen in use (5.8).
4. **Bulk is counted separately**: "42 cards + 1,000 bulk", so card counts keep meaning real cards (5.5).
5. **Rate order**, strongest first: the card's own rate (Set Rate) → the buy's or collection's custom rates → the low-end / high-end rates → the master rates. A buy or collection with custom rates set turns the low/high rules off for all its cards (4.1).
6. **Thresholds are strict and use the card's own unit price**: under $3.00, over $35.00; exactly $3.00 or $35.00 gets the master rates. They apply to walk-in buys, collections and projects alike (4.2).
7. **No Set Rate in Edit in project view**: the customer was paid already, as the buy's rates are locked there now (4.3).
8. **Confirming a buy alerts** on every card with its own rate, and what difference it makes (4.5).
9. **Printing asks nothing**: matching does its best on its own, and anything it can't place goes to **Unmatched**. Hand matching stays the export's job (3.3).
10. **"Unmatched" means no Crystal Commerce product** for the card (what the export calls Can't upload). A card still waiting on a staff choice goes under its set's category (3.3).
11. **Magic only**, for now (1.3).
12. **Printing changes nothing**: no Completed marks, no export record, no remembered matches; no bulk, no prices (3.2).
13. **Every Magic buy's ⋯ menu gets Print buy**, for single-buy exports (3.1).
14. **Custom rates only help price a buy** (owner, 2026-10-15): "Custom rates are a tool for pricing buys, but not important to persist", forgotten the way bulk is (5.8). CONFIRM BUY, Convert to project and Convert to buy put the buy on the default rates; **projects have no rates or rate controls at all** ("Projects are just cards we already own"), and REPRICE? doesn't touch rates (4.3, 4.6).

---

## 3. Part A: the audit printout (Phase T1)

### 3.1 Where Print appears

Every **EXPORT** button becomes a button with a small menu (the same look as the ⋯ menus): **Print?** and **Export csv**. **Export csv** is exactly today's EXPORT, whatever state it's in (`EXPORT_FUNCTION.md` 8.2: the export, or downloading the same file again). The button's label, count and blocked states are unchanged; a blocked EXPORT blocks both items, with the same reason.

| Where | Print? prints |
|---|---|
| Magic day page, **EXPORT** | The cards EXPORT would take (Paid/Ours buys' Magic cards); on a fully exported day, the day's exported cards (3.2) |
| Collection or project, **EXPORT** | Its Magic cards (Paid/Ours), or what it exported once Completed |
| **Can't upload cards**, EXPORT | Its Magic cards |
| A Magic buy's ⋯ menu, new item **Print buy**, under Export single buy | That buy's Magic cards (Paid/Ours, or exported: 3.2) |
| A collection's or project's ⋯ (its screen, and its row on the Collections tab), **Print collection / Print project** (owner, 2026-10-14) | Its Magic cards, as its EXPORT ▾ → Print? does; from a row, its cards fetched once the tab is open |

Pokémon days keep **COMPLETE** with no menu. Print needs no picked user (it changes nothing), but it needs the connection, like EXPORT: matching reads the inventory from the database.

### 3.2 Which cards, and from where

- **Bulk is left out**, always (Section 5).
- **Cards not yet exported** (Paid/Ours): matched now (3.3).
- **Cards already exported** (Completed by an export: `cc_status = 'exported'`): printed from what the export saved, their `cc_category` and product. No matching, so a reprint of an exported day is exactly what went up.
- **Cards that went to Can't upload** (`cc_status = 'cant_upload'`): in **Unmatched**.
- **Cards Completed by hand** (Mark as completed) aren't printed: they weren't exported and won't be.
- **The same card twice** (same printing, finish, condition and treatments, from different buys) prints once with the quantities added.

Printing never writes anything: no Completed marks, no export record, no `cc_product_links`, no `cc_set_map` rows, no Changelog entry.

### 3.3 Categories, with no questions asked

Print runs the export's own matching (`matchLines`, `EXPORT_FUNCTION.md` 7) on the cards to print, then places each card without asking:

| The match | Section |
|---|---|
| A remembered match (`cc_product_links`), or one clear product | **That product's category** |
| Several possible products (the export would ask), and the set has a category (7.3 steps 1–4) | **The set's category** |
| No product with this name in the category, or no category for the set | **Unmatched** |

Nothing is remembered, and staff picks are never asked for: those happen in the export afterwards (owner, 2026-10-14). With no Master Crystal Inventory loaded, Print says so ("Upload the Master Crystal Inventory in Settings first") and prints nothing, since no card has a category to go under.

### 3.4 Order

1. **Sections by category, A to Z**: case- and accent-insensitive, numbers in natural order ("Commander 2015" before "Commander 2021"), **Unmatched last**.
2. **Inside a section** (owner, 2026-10-14): **the NM cards by collector number, then every other condition together by collector number**, the same card's lower conditions in order down (LP, MP, HP, DMG). Numbers naturally: 7 < 12 < 120 < 120a; a number with a prefix (The List's `CMA-216`) sorts by its prefix, then its number. Then by name, then non-foil before foil before etched.

### 3.5 What each row says

```
[symbol]  Double Masters 2022 [2X2]                    42
▌☐  3x Lightning Bolt [Foil] [Borderless]              [117] [NM]
```

- **One line a card** (owner, 2026-10-14: compact, more cards a page): a **tick box**, the **count first** in a column of its own so every name starts at the same place (`3x` in bold; a single card's `1x` quieter), the **card name** (in full; a long one ends in "…"), its **finish and treatments** in small chips after it (Foil / Etched, then Borderless, Showcase, Extended art, Promo pack stamp…; under the name when they don't fit), and on the right, each in its own column so they line up down the page: the **collector number** chip ("117"; the set's code is on the band, owner 2026-10-14: a card from another set than its band's, or in Unmatched, keeps its code, "PLST CMA-216"), and the **condition** chip (tinted in the condition's colour). Every chip's text black and bold, easy to read at a glance.
- **Light on ink** (owner, 2026-10-14: colour kept, outlines over shading): rows and chips are outlines. Each row a hairline outline; chips outlines only, the condition chip's outline in its condition's colour (deepened to read on paper). **The category bands stay solid black with white words** (owner, 2026-10-14: outlined bands lost the eye).
- The row's **left chip is the card's colour**, pull-pdf's chip colours (owner, 2026-10-14; pull-pdf's row tints left off to save ink): White, Blue, Black, Red, Green, Multicolor, Artifact (colourless), Lands (a land on either face), Unknown; from the Scryfall card, looked up while printing.
- **A line between a category's NM cards and its lower conditions**, when it has both (owner, 2026-10-14).
- **No prices.**

### 3.6 Layout

Based on pull-pdf (`C:\ClaudeProjects\pull-pdf`, read-only: its `render.py` and `out\example-preview.png`):

- **US Letter, portrait, 2 columns** (pull-pdf solves up to 8 columns onto one page; these rows carry more detail, and a day's batch runs to several pages).
- **Page header**: the title (**Audit — Magic, Tuesday, October 14, 2026**; **Audit — Buy 3, October 14, 2026**; **Audit — "CU Intake"** for a collection), the printing time, and the card count (cards, not lines). Page numbers in the footer ("Page 2 of 5").
- **Section bands**: solid black, tall enough to see **the set's symbol in white** (owner, 2026-10-14: 24pt bands, 17pt symbols; the set most of the section's cards are from; none for Unmatched), then the category name in bold and **the set's code in brackets** ("Alpha [LEA]", owner 2026-10-14). A set without a symbol of its own (none, Scryfall's generic `default.svg`, or one that won't load) gets **Scryfall's promo shooting star**, Secret Lair's own symbol (owner, 2026-10-14); the section's card count on the right (as pull-pdf's). A section broken by a column or page repeats its band as **"Commander 2015 [C15] (cont.)"**.
- **Compact and fixed** (owner, 2026-10-14): 8.6pt names, 6.6pt chips, 13pt rows, 0.39" margins: about 100 cards a page, every printout reading the same.
- Names outside the PDF's built-in fonts degrade rather than break (as pull-pdf's `_safe`); a card's name is never dropped.

### 3.7 Building and opening the PDF

The app runs in the browser, so the PDF is built there: **a new dependency, `jspdf`** (MIT, pinned to an exact version; owner to approve with this plan). pull-pdf itself (Python, run by Collection Manager) isn't called.

Print opens the new tab at once with a **"Building the printout…"** page in the app's dark look (owner, 2026-10-14: big bold white words, the printout's name, a spinner; all inline, so it shows instantly), then **downloads the PDF and shows it in that tab** (the browser's PDF viewer prints it). File names: `audit-magic-2026-10-14.pdf`, `audit-magic-2026-10-14-buy-3.pdf`, `audit-cu-intake.pdf`.

### 3.8 Code

- `src/lib/auditPrint.js` (pure, tested): match results → sections and rows (3.2–3.5).
- `src/lib/auditPdf.js`: rows → the PDF (3.6).
- `ExportButton.jsx` gains the menu; `DayPage.jsx` (EXPORT, and **Print buy** in the buy ⋯), `CollectionPage.jsx` (EXPORT, Can't upload cards).
- No database change.

---

## 4. Part B: individual rates (Phase T2)

### 4.1 Which rate a card gets

Each card's Cash rate and Credit rate, strongest first:

1. **Its own rate** (Set Rate, 4.3).
2. **The buy's or collection's custom rates** (the ✎ rates in the list's totals). If either is set, the low/high rules are off for every card in it.
3. **The low-end or high-end rates** (4.2), for a card under or over the thresholds. **Never for bulk.**
4. **The master rates** (Settings → Master Buy Percentages).

Cash and Credit come from the same step: a card with its own Credit rate and no Cash rate takes Cash from the next step down.

### 4.2 Low-end and high-end rates

A new Settings panel, **Low-end and high-end rates**, beside Master Buy Percentages:

| | Threshold | Credit | Cash |
|---|---|---|---|
| **Low end** | Cards under **$3.00** | **50%** | **25%** |
| **High end** | Cards over **$35.00** | **70%** | **40%** |

- The threshold is the card's **unit price**: the price shown on its condition button, after rounding, or its manual price. **Strictly** under or over: a $3.00 or $35.00 card gets the master rates.
- For walk-in buys, collections and projects alike.
- Saved like every setting (live on every computer, with who changed it). Percentages 0–100, up to 2 decimals; dollars over 0. The low threshold must stay below the high one.

### 4.3 A card's own rate: Set Rate

- **Right-click a card in a list** (the Buy list on the Price tab, a collection's list; not a project's, which has no rates, decision 14) → a small menu with **Set Rate**. It opens the same Cash / Credit editor the list's totals use, **beside that card**.
- **Clear** in the editor removes the card's own rate.
- A card with its own rate is **highlighted** in the list (a tinted row and a small **✎ 75% / 45%** tag); its tooltip says which rate applies and why ("Own rate: Credit 75%, Cash 45%"). Cards on the low-end or high-end rates get a quieter tag ("low end" / "high end") in the tooltip only.
- **Not in Edit in project view**, not on Completed cards, not on confirmed buys on the day page. An edited card (SAVE EDIT) keeps its own rate.
- **Bulk**: Set Rate opens **Set value** instead (5.6).

### 4.4 Totals

- **Cash = the cards' market prices, each times its own Cash rate, added up**, then rounded the way a payout is rounded today (`payout`, `money.js`); Credit the same. With every card on one rate it comes to exactly what it does today.
- The totals' **Cash (33%)** and **Credit (66%)** labels keep showing the buy's base rate; when some cards have other rates they gain a small "mixed" mark, whose tooltip breaks it down ("8 cards at the low-end rates, 1 at its own rate").
- The **price panel's** Credit and Cash chips use the selected card's rate (so a $40 card shows 70% / 40% credit / cash), and say why in their tooltip.
- **Every total uses this**: the Buy list, CONFIRM BUY, a collection's Paid/Ours dialog and details, the day page's buy totals, the Changelog's totals, Home's figures and the cash-buys report. The database's own totals (`collection_totals`, buy events) too.

### 4.5 The alert when confirming

CONFIRM BUY's dialog (and a collection's Paid/Ours, and Convert to buy) lists **every card with its own rate** and the difference it makes, against the rate it would otherwise get:

```
⚠ 2 cards have their own rates
  Volcanic Island (3ED) NM — Credit 75% (not 70%): +$22.50 credit · Cash 45% (not 40%): +$22.50 cash
  Sol Ring (CMR) LP — Credit 40% (not 66%): −$0.52 credit
```

Then the totals with them. Nothing to confirm separately: the alert informs, CONFIRM BUY still confirms.

### 4.6 Fixed when confirmed

- When a buy is confirmed (and when a collection is marked Paid/Ours, or a project converted to a buy), **each card's Cash and Credit rate is saved on the card**. Changing the settings later never changes a confirmed buy.
- **Custom rates are forgotten there** (owner, 2026-10-15, decision 14): CONFIRM BUY and Convert to buy save each card's **default** rate (the Master Buy Percentages, or the low-end / high-end rates), not the buy's custom rates or a card's own; they only helped price it. Convert to project leaves the project, and its cards, with no rates.
- Existing confirmed buys get their buy's rates copied onto their cards by the migration, so every past total stays exactly what it was.
- REPRICE? doesn't touch rates: a project has none.

### 4.7 Code

- `src/lib/rates.js` (pure, tested): a card's rates (4.1–4.2), totals (4.4), the alert's differences (4.5). Every total in 4.4 calls it; nothing works out a payout on its own any more.
- Settings: a new `RatesTiersPanel.jsx`; `DEFAULTS` gains the two settings (Section 6.2).
- `BuyList.jsx`: the right-click menu, the editor beside a card, the highlight. `ConfirmBuyModal.jsx`, `DealModals.jsx`: the alert. `QuotePanel.jsx`: the chips.
- Migration (Section 6.3) and the database test run's new checks.

---

## 5. Part C: bulk (Phase T3)

### 5.1 The eight items

| Item | Game | Cards per item | Value per item (default) |
|---|---|---|---|
| MTG 100 Bulk commons/uncommons | Magic | 100 | **$1.50** |
| MTG 100 Bulk rares/mythics | Magic | 100 | **$2.40** |
| MTG 10 Bulk $1 cards | Magic | 10 | **$8.00** |
| MTG 10 Bulk 50¢ cards | Magic | 10 | **$3.00** |
| PKM 100 Bulk | Pokémon | 100 | **$0.75** |
| PKM 100 Bulk EXs | Pokémon | 100 | **$2.40** |
| PKM 10 Bulk $1 cards | Pokémon | 10 | **$7.00** |
| PKM 10 Bulk 50¢ cards | Pokémon | 10 | **$2.50** |

The values are **market values** (owner, 2026-10-14): Cash and Credit are taken from them like any card's market price. The MTG items count as Magic and the PKM items as Pokémon everywhere (game toggles, day pages, totals by game).

### 5.2 Settings: Bulk values

A new panel, **Bulk values**, laid out like Master Fallback Percentages: two tables side by side, **Magic** and **Pokémon**, one row per item, its **$ per item** in a box (dollars, up to 2 decimals, saved on leaving the box, live on every computer). Changing a value changes bulk added afterwards; bulk already in a list keeps its value until REPRICE? (projects) or Set value.

### 5.3 Finding bulk

- **Only by searching "bulk"**: they never appear for any other search.
- **"bulk"** in any other case: the bulk items first, then the cards that match as usual (the Magic card *Bulk Up*).
- **"BULK"** in capitals: **only** the bulk items.
- More words narrow them: "bulk rares", "BULK pkm", "bulk $1". The MTG / PKM toggles apply; EN / JP doesn't (bulk has no language).

### 5.4 Selected, and in the suggestions

- Drawn as a **stack of card backs**: the game's card back (Pokémon's, already in the app; Magic's, a new image in `public/`) three times, offset, on the usual card box. On it, a short label: **100 · Commons & Uncommons**, **10 · $1 cards**, **100 · EXs**…
- No condition, finish or versions: the five condition buttons give way to one price, **$1.50 per 100**; Finish & Details says "Bulk: no finish or condition". The zoom view and price movement don't apply.
- **Qty** counts items: Qty 10 of "MTG 100 Bulk commons/uncommons" is 1,000 cards. **ADD CARD** adds them like a card (merging with the same item already in the list).

### 5.5 In lists, and counted separately

- A bulk line reads in **total cards**: 10 × "MTG 100 Bulk commons/uncommons" shows as **1,000 MTG Bulk commons/uncommons**, with **$1.50 per 100** beside it.
- **Counted separately** (owner, 2026-10-14): "42 cards + 1,000 bulk" on the Buy list, CONFIRM BUY, day pages and collections. Card counts everywhere else (exports, Home, the calendar) count real cards only.
- Cash and Credit: like any card's, at the buy's base rate (5.6).

### 5.6 Rates for bulk

- **Always the master rates, or the buy's or collection's custom rates**; never the low-end or high-end rates (owner, 2026-10-14).
- **Set Rate** on a bulk line opens **Set value**: a dollar value per item instead of a rate, with **live Cash and Credit** for the line as it's typed. Clear goes back to the Settings value. The line shows ✎ like a manual price, and CONFIRM BUY's alert (4.5) lists it ("1,000 MTG Bulk commons/uncommons — $2.00 per 100, not $1.50: +$1.65 credit").

### 5.7 Stored like a card, marked as bulk

A bulk item is a `buy_lines` row with a new **`bulk_kind`** (which of the eight; null for every real card), `game` mtg / pokemon, its label as `name`, `quantity` = items, `unit_price` = value per item, `price_source` `'bulk'` (or `'manual'` after Set value). The columns a card needs and bulk doesn't (set code, collector number, finish, condition) hold fixed placeholders the migration allows only for bulk.

### 5.8 Where bulk is not there

Bulk only helps price; it is **treated as if it isn't there** in:

| | |
|---|---|
| **Exports** | Never in the export dialog, never in a Mass Create file, never Completed by an export, never copied to Can't upload cards. A buy or day counts as **exported / Completed once all its real cards are**. |
| **Mark as completed / COMPLETE** | Skipped, with the same rule for "fully Completed". |
| **Printouts** | Never on one (Section 3). |
| **The header search** | Not found by it. |
| **Card counts** | Separate (5.5). |

It **is** there in: totals and payouts, CONFIRM BUY, the Changelog's lines, backups, Edit in project view (it can be edited or taken out), and **Convert to project / Convert to buy**, where it comes along (owner, 2026-10-14; may change once the workflow is seen in use).

### 5.9 Code

- `src/lib/bulk.js` (pure, tested): the eight items, search, line text, counts.
- Search (`useCardSearch`), the card box (`SelectedCard.jsx`, a `BulkStack` drawing), the price table and Finish & Details, `BuyList.jsx` line text and counts, the day pages and collections' counts.
- Settings: a new `BulkValuesPanel.jsx`; `DEFAULTS` gains `bulk_values` (Section 6.2).
- Migration (Section 6.4): the column, the price source, and the export / complete / Can't upload / search functions skipping bulk; the database test run's new checks.

---

## 6. Data model changes

### 6.1 Phase T1

None.

### 6.2 Settings rows (`settings`, key / value)

| Key | Value (default) | Phase |
|---|---|---|
| `rate_tiers` | `{ "low": { "under": 3, "credit": 50, "cash": 25 }, "high": { "over": 35, "credit": 70, "cash": 40 } }` | T2 |
| `bulk_values` | `{ "mtg_100_common": 1.5, "mtg_100_rare": 2.4, "mtg_10_dollar": 8, "mtg_10_fifty": 3, "pkm_100": 0.75, "pkm_100_ex": 2.4, "pkm_10_dollar": 7, "pkm_10_fifty": 2.5 }` | T3 |

### 6.3 Migration for T2 (next number after 0052)

- `buy_lines`: `custom_cash_pct`, `custom_credit_pct` (Set Rate; null = none), and `cash_pct`, `credit_pct` (the rates fixed at confirm / Paid/Ours, 4.6). Confirmed buys' cards get their buy's rates copied in.
- New functions: set or clear a card's own rate (a walk-in draft's card, a collection's card), checked like every list change (version, locks, Completed).
- Changed: `confirm_buy`, `collection_set_status` (Paid/Ours), `project_to_buy`, `buy_to_project`, `collection_reprice` (fix or carry the cards' rates); `collection_totals` and the buy events (totals as 4.4).
- The low/high rule itself lives in one place in the database too (an `internal` helper), so the database's totals and the app's agree.

### 6.4 Migration for T3

- `buy_lines.bulk_kind` (one of the eight keys, or null), `price_source` allows `'bulk'`, placeholders allowed only when `bulk_kind` is set.
- `export_check`, `export_lines`, `cant_upload_copy`, `buy_mark_completed`, `day_complete` and the "fully Completed" checks skip bulk; `global_search` leaves it out.

---

## 7. Phases

Each phase: build, `npm test`, `npm run build`, lint, the database test run after a migration (dev only), then hand off with "Where to look". The spec (`DESIGN_SPEC.md`: decisions, the sections named) is updated as each lands; README and Help get one line per feature when the owner asks.

### Phase T1: the audit printout

- [x] `jspdf` added (owner's approval with this plan), pinned.
- [x] EXPORT's menu (**Print?** / **Export csv**) on the day page, collections, projects and Can't upload cards; **Print buy** in every Magic buy's ⋯.
- [x] `auditPrint.js` with tests: sections (3.3), order (3.4), merged lines and rows (3.5), exported cards from their saved category (3.2).
- [x] `auditPdf.js`: Letter, 2 columns, bands with counts and "(cont.)", tick boxes, condition strips, header and page numbers (3.6).
- [x] Downloads and opens in a new tab; no inventory → says so; nothing written.

**As built (2026-10-14):**
- `jspdf` **4.2.1** (2026-03-17), pinned. It loads only when something is printed (its own 402 kB file), so the app starts as light as before.
- **EXPORT ▾**: the button gains a small ▾; a click opens **Print?** / **Export csv** (upward at the foot of a collection's list). A blocked EXPORT still just says why. Pokémon days' COMPLETE has no menu. **Print buy** sits under Export single buy in a Magic buy's ⋯ and needs no picked user.
- **Which cards** (`printLines`): a batch's Magic cards not yet Completed; once all are, the ones an export took (exported, or sent to Can't upload). Cards Completed by hand print nothing (Print says so).
- **Characters**: the PDF's built-in font draws Windows-1252 (accents, curly quotes, dashes, "…"); one character outside it garbled a whole line (tested: "120★"), so those become plain letters ("★" → "*", others their unaccented letter, else "?") (`pdfSafe`).
- **Inside a category: NM by number, then the other conditions by number** (owner, 2026-10-14). Collector numbers sort by prefix, number, then suffix: 12 < 120 < 120a, and a prefixed one (The List's `2XM-120`) after the plain ones; categories differing only in capitals share a section.
- The page title: **Audit — Magic, Tuesday, October 14, 2026**, **Audit — Buy 3, October 14, 2026**, **Audit — CU Intake**, **Audit — Can't upload cards**; printing time and card count at the right; "Page 2 of 5" at the foot.
- Checked by rendering a 150-line sample (10 sections, 4 pages) to images: bands, "(cont.)", Unmatched last, strips, tick boxes, counts, long names cut with "…".
- **Compact rework (owner, 2026-10-14)**: one-line rows with black chips (set and number, condition, finish and treatments), pull-pdf's colour chip and tint (`cardBucket`; Scryfall cards from the matching, and fetched for exported cards), the set's symbol on each band (Scryfall's SVG drawn white on a canvas, fetched with `?print=1` for its own CORS copy; one that won't load is just left off). A 230-line sample with real set symbols came to 3 pages (about 100 a page, from 50). The symbols' canvas step runs in the browser only: the sample stood in for it with the same SVGs drawn white.

**Where to look**: a Magic day with Paid/Ours buys → EXPORT ▾ → Print?; a buy's ⋯ → Print buy; an exported day → Print? (its exported categories); a card with no CC product → Unmatched.

### Phase T2: individual rates

- [x] Migration (6.3), dev only; database test run extended (rates fixed at confirm, totals, set/clear a card's rate, refusals).
- [x] `rates.js` with tests: the order (4.1), thresholds (4.2, strictly), totals (4.4), alert differences (4.5); every total in 4.4 uses it.
- [x] Settings → Low-end and high-end rates.
- [x] Right-click → Set Rate beside the card, Clear, the highlight; not in Edit in project view or on Completed cards.
- [x] The price panel's chips, the totals' "mixed" mark, the confirm / Paid/Ours / Convert to buy alert.

**As built (2026-10-15):**
- **Migration 0055** (dev): `buy_lines.custom_cash_pct / custom_credit_pct` (Set Rate) and `cash_pct / credit_pct` (kept). The rule is `internal.line_pct` (kept → own → the buy's custom rates, tiers off → low / high → base), the settings row `rate_tiers` read over the shipped defaults by `internal.rate_tiers`; totals by `internal.lines_totals`. The functions that log totals were re-created from their live definitions with only that changed: `buy_event` takes the totals, `collection_totals` is gone. Each past buy's rates were copied onto its cards; on dev every one of the 39 buys with kept rates totals exactly as before. Rehearsed in a rolled-back transaction first.
- **Kept and cleared** (4.6): kept at CONFIRM BUY, Paid/Ours, Rejected and Convert to buy; cleared when a collection goes back to Processing / Priced or is reopened from Rejected.
- **Custom rates only help price** (owner, 2026-10-15; migration 0057): CONFIRM BUY and Convert to buy forget the buy's custom rates and its cards' own rates, keeping each card's default rate; Convert to project leaves the project and its cards with no rates; a project refuses custom rates and Set Rate (`project_rates`), and its list shows Cash (33%) / Credit (66%) as plain text with no right-click menu; REPRICE? leaves rates alone. The one project on dev that came from a buy forgot its rates (57 cards); no confirmed buy's totals changed. A customer collection keeps its custom rates and Set Rate, kept at Paid/Ours as before.
- **Merging** (owner, 2026-10-15; migration 0056): the same card in the same condition still merges, own rate or not: added copies take the line's own rate, and an edited card merged into its copy keeps an own rate either had (each side on its own). 0055 had kept them apart; the owner: "I can't imagine a situation where I would actually want to treat it as a different rate."
- **Set Rate**: right-click a card in the Buy list or a collection's list → **Set Rate** → Cash and Credit beside the card, each saved on blur or Enter like the list's rates, with what it would otherwise get beside the box ("high end 40%"); typing that back, **Clear**, or **Clear Rate** in the right-click menu of a card with its own rate (owner, 2026-10-15) removes the card's own rate. **Maintain ratio** (owner, 2026-10-15): ticked, only Cash is typed and Credit is twice it, saved together (Cash at most 50%); ticking it on a card off 2:1 sets its Credit to twice its Cash; it starts ticked when the card is on 2:1. Cash above Credit turns the Cash box red with "⚠ Cash is higher than Credit." (a warning; it still saves). Blocked (with why) in Edit in project view, on locked collections and on Completed cards. A collection's change is in the Changelog (**Card rate set**, Actions), with each rate's before and after.
- **Totals**: rate by rate, so a list on one rate comes to exactly what it did. The labels keep the base rate, with a **CUSTOM** chip only when a card in the list has its own rate (Set Rate; "2 cards have their own rates (Set Rate)."). The low-end and high-end rates show no chip: almost every trade has some cards on them (owner, 2026-10-15, replacing a MIXED chip for any card off the base rate). The day page uses the rates kept on each card.
- **Priced's credit offer**: as before on one rate; with mixed rates, the cash offer × the cards' Credit ÷ their Cash, so it's still the same deal.
- **The alert** (4.5) on CONFIRM BUY, Paid/Ours and Convert to buy: "⚠ 2 cards have their own rates", then one line per card: the card in full, then its rates ("1 Mental Misstep (NPH) 38 *F* [MP] — Credit 80% · Cash 50%"; owner, 2026-10-15, replacing each rate's "(not 70%)" and difference in dollars).
- Tests: `tests/rates.test.js` (10), a folded Changelog run; database test run 350 checks. The sections written before T2 run with the tiers out of the way, so their numbers stand.

**Where to look**: a $1 card and a $40 card in one buy (their chips and the totals); Set Rate on one card (highlight, totals, the alert at CONFIRM BUY); custom rates on the buy (low/high rules off); a past buy's totals unchanged.

### Phase T3: bulk

- [x] Migration (6.4), dev only; database test run extended (bulk never exported, completed, copied or searched; "fully Completed" ignores it).
- [x] `bulk.js` with tests: the items, search (bulk / BULK / more words), line text, separate counts.
- [x] Settings → Bulk values (Magic | Pokémon).
- [x] Search, the card-back stack and labels, the one-price table, Qty in items, ADD CARD.
- [x] Lists: "1,000 MTG Bulk commons/uncommons", "$1.50 per 100", "42 cards + 1,000 bulk"; master or buy rates only; Set value with live Cash / Credit, and the confirm alert.
- [x] Exports, COMPLETE, Mark as completed, Can't upload, the header search and printouts leave bulk out; conversions bring it along.

**As built (2026-10-15):**
- **Migration 0058** (dev): `buy_lines.bulk_kind` (one of the eight keys), `price_source` allows `'bulk'`, and a check that bulk, and only bulk, has the placeholders (set `BULK`, no number, NM; priced `bulk` or `manual`). Adds and edits save `bulk_kind` and merge only with the same item. `export_lines` (day, one buy, a collection), `day_complete` and `buy_mark_completed` skip bulk; `buys_in_range` counts a game Completed once all its real cards are; `global_search` leaves bulk out; `internal.line_pct` never gives bulk the low-end / high-end rates. Re-created from the live definitions with only that changed. Database test run: 359 checks ("Bulk", 9 new).
- **`src/lib/bulk.js`** (tested): the eight items, `bulkSearch`, `buildBulkLine`, the line text, `cardCounts` / `countText`, `repricedBulk`. `lineText` reads bulk in cards; `rates.js` gives bulk no tiers.
- **Settings → Bulk values**: beside Master Fallback Percentages, Magic and Pokémon side by side, "100 · Commons & Uncommons  $ [1.5]".
- **Search**: a word "bulk" lists the matching items first, then the cards; "BULK" only the items (no card search); other words narrow them; MTG / PKM apply.
- **The stage**: three of the game's card backs, offset, labelled "100 · Commons & Uncommons" (Magic: Scryfall's card back, from its image host; Pokémon: the app's); "✦ BULK" under it; the details say the cards per item and the Settings value. The prices give way to one box, "$1.50 per 100"; Finish: "Bulk: no finish or condition"; the price panel reads "BULK price per 100", at the base rates. No zoom, price movement or warnings. ADD CARD adds items (Qty 10 = 1,000 cards); a bulk line opens for editing by its game's "BULK mtg" / "BULK pkm" search.
- **Lists**: "1,000 MTG Bulk commons/uncommons" with "$1.50 per 100" after it (✎ and the accent colour when it's the line's own); the Buy list's head and its game chips, CONFIRM BUY's and Convert to buy's titles, CANCEL, Delete buy / collection and Convert to project count "42 cards + 1,000 bulk"; the day page shows bulk rows in cards with their value per item.
- **Set value**: right-click a bulk line → **Set value** (and **Clear value** when it has one): dollars per item beside the line, headed by the line in short ("1,000 BULK c/u"), with what it pays as it's typed; the Settings value typed back, or **Back to $1.50**, goes back to it (owner, 2026-10-15: one clean line each). Saved as an edit of the line. Allowed wherever the list can change (projects too: it's a value, not a rate). CONFIRM BUY's alert lists it ("1,000 MTG Bulk commons/uncommons — $2 per 100").
- **Left out**: every export (and Check Crystal Commerce matches), COMPLETE, Mark as completed, printouts, the header search, and Home's card counts. A buy (or a game's part of it) is Completed once all its real cards are, so a buy of only bulk reads Completed at once. REPRICE? puts bulk back on its Settings value, keeping a value of its own as it keeps a manual price.
- **Not changed**: the Changelog's counts (the +n chips and "5 cards bought…") count bulk items as they count cards; its card rows read in cards ("1,000 MTG Bulk …"). *Changed 2026-10-16 (DESIGN_SPEC decision 273, migration 0066): the sentences count bulk apart ("7 cards + 100 bulk bought…") and the chips count cards only.*

**Where to look**: search "bulk" and "BULK"; add 10 × MTG 100 Bulk commons/uncommons to a buy with a few cards; Set value on it; confirm; export the day (bulk not in the file, the buy still Completed); Convert to project with bulk in it.

---

## 8. Later, or to decide when it comes up

- ~~**A Pokémon printout**~~: built as **Print PKM?** (DESIGN_SPEC decisions 280–283), by set and number.
- ~~**Bulk on conversions**~~: closed for now (owner, 2026-10-18): bulk moves with conversions as 5.8 says.
- ~~**The low/high rates on the alert**~~: closed for now (owner, 2026-10-18): the alert lists cards with their own rate only (4.5).
