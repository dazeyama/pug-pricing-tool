# PUG Pricing Tool — Export Function Specification

| | |
|---|---|
| **Product** | PUG Pricing Tool: the EXPORT function (Crystal Commerce Mass Create) |
| **Owner** | Players' Union Games (PUG) |
| **Spec version** | 1.0 — 2026-10-01 |
| **Status** | Approved for build, Phases E1–E5. Before the first real batch: one test upload (Appendix D #1). |
| **Extends** | `docs/DESIGN_SPEC.md` (Section 14, "Export: placeholders only", is replaced by this document) |
| **Project folder** | `C:\ClaudeProjects\pug-pricing-tool` |

---

## 0. How to use this document

This spec is written for an engineer building the export with Claude Code. It sits beside `docs/DESIGN_SPEC.md`, which describes the rest of the app and stays the source of truth for everything outside the export. Where it says **must**, that is a requirement. Where it says **should**, use judgement. If something here conflicts with the owner's later instructions, the owner wins. Update this file so the conflict doesn't come back.

1. **Read the whole document before starting**, and read `DESIGN_SPEC.md` Sections 6 (data model), 9 (collections), 10 (Calendar and day pages), 11.1 (Master Crystal Inventory) and Appendix A (working rules) if you haven't. Sections 1–14 here describe the finished export. Section 15 splits the build into five phases, E1–E5.
2. **Build one phase at a time, in order.** Each phase ends at a state the owner can check on `localhost`. Don't start the next phase until the owner has reported back.
3. **The owner is QA** (`DESIGN_SPEC.md` Appendix A). Build, run `npm run build` and `npm test`, fix errors, then hand off with the phase's "Where to look" list.
4. **The real Crystal Commerce inventory is store data.** The owner keeps a copy outside the repo (`D:\Users\Daisy\Downloads\playersuniongames-inventory-search-31.csv`, 39 MB, 152,115 products, 2026-09-30). It **must never be committed**, copied into the repo, pasted into a test fixture, or sent anywhere. Read it locally when you need to measure something (Appendix A was measured that way). Tests use small hand-made fixtures that follow the same patterns.
5. **Every figure in Section 3 and Appendix A was measured** on the files named there on 2026-09-30. Re-measure before relying on one if the owner has uploaded a newer inventory.
6. **No secrets in this document, the repo or the code** (`DESIGN_SPEC.md` 0.6).

---

## 1. Overview

### 1.1 Purpose

Every card the store buys has to reach Crystal Commerce ("CC"), the store's inventory and web shop, so it can be sold. CC has a bulk import called **Mass Create**: upload a CSV and it adds stock to existing products. EXPORT produces that CSV from a finished day of walk-in buys or a finished collection, and marks what it exported **Completed**.

The hard part is naming. The app records each card the way Scryfall describes it: set code, set name, collector number, finish and printing traits. CC knows the same card by its own **Product Name** and **Category**: "Brazen Borrower // Petty Theft - Foil - Showcase" in "Throne of Eldraine". Mass Create only finds a product when both match **exactly**. The export's job is to bridge the two, using the Master Crystal Inventory the store uploads (the full list of CC products), and to set aside every card it can't place.

### 1.2 What EXPORT does, in one paragraph

On a Magic day page (or a Paid/Ours collection), EXPORT matches each card to one CC product. Most match on their own. Where a few products could fit, staff pick one, and the app remembers the choice. Cards that match nothing are listed in red: staff must pull them out of the physical batch, and they go to a permanent **"Can't upload cards"** collection. Then the app marks the buys (or the collection) **Completed** and downloads the Mass Create CSV, one row per product and condition, with **Add Qty**.

### 1.3 Scope

- **Magic only** (owner's decision, 2026-09-30). Pokémon can't be exported for now: the Pokémon side's EXPORT is greyed out, and Pokémon cards in a collection are ignored entirely (Section 8.5).
- **Mass Create in "Only Update Products" mode** (owner's decision): CC only adds stock to products that already exist. A card with no matching product can't be uploaded at all (Section 9).
- **Add Qty** (adds to the stock on hand), never **Qty** (which overwrites it). Owner's decision.
- **English only.** Every row's Language is `English`. The store doesn't buy Japanese Magic.

### 1.4 Non-goals

- **Pokémon export.** Possibly later, possibly a different function (owner, 2026-09-30).
- **Creating CC products.** Mass Create's create mode isn't used.
- **Uploading to CC from the app.** The app downloads a CSV; staff upload it in CC's admin by hand.
- **Prices in CC beyond the Sell Price column.** The Sell Price has its own section (Section 5).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **CC** | Crystal Commerce, the store's inventory system and web shop. |
| **Mass Create** | CC's CSV import for quantities and prices (Section 3.1). |
| **Master Crystal Inventory** | The full CC inventory export, uploaded in Settings (`DESIGN_SPEC.md` 11.1). Only the current one is kept. |
| **CC product** | One row of the Master Crystal Inventory: one card in one set, one finish and one variant. Foil and non-foil are separate products. |
| **Product Name** | CC's name for a product, suffixes and all: `Fabricate (2090) - Rainbow Foil`. |
| **Category** | CC's name for a set: `Commander: Duskmourn: House of Horror`, `Secret Lair Drop Series`. |
| **Base name** | A Product Name before its first ` - ` and bracket: `Fabricate`. For a Universes Beyond card with a flavor name, the flavor name and card name together (Section 7.2). |
| **Suffix** | One ` - `-separated part after the base name: `Foil`, `Extended Art`, `The List`. |
| **Foil kind** | The suffix that names the finish: `Foil`, `Foil Etched`, `Surge Foil`, `Rainbow Foil`… Absent on non-foil products. |
| **Variant** | Any other suffix: `Borderless`, `Showcase`, `Retro Frame`, `Prerelease Promo`… |
| **Set map** | Which CC Category a Scryfall set's cards belong to (Section 7.3). |
| **Product link** | A remembered match: this Scryfall printing in this finish is this CC product (Section 7.5). |
| **Can't upload** | A card that matched no CC product. Left out of the file, flagged, and copied to the "Can't upload cards" collection (Section 9). |
| **Mass Create file** | The CSV the export downloads (Section 4). |

---

## 3. Reference material and findings

### 3.1 Mass Create (CC's help page)

Source: <https://www.crystalcommerce.com/blog/2020/05/13/update-your-quantity-and-prices-for-your-cards-and-games-easily-with-mass-create/> (read 2026-09-30).

- **Price updates** need `Product Name`, `Category`, `Sell Price`.
- **Quantity updates** need those plus `Condition` and `Language`.
- `Qty` sets the quantity; **`Add Qty` adds to it**.
- **Products are matched by Product Name + Category together.** CC's import screen asks for both as the match fields.
- **"Only Update Products"** updates existing products and creates nothing.
- **Conditions:** `Near Mint`, `Light Play`, `Moderate Play`, `Heavy Play`, `Damaged`. **Language:** `English` (owner: use the help page's wording exactly).
- The page says nothing about foil. The inventory shows why: foil is part of the Product Name (Section 3.3).

### 3.2 The owner's sample Mass Create file

`D:\Users\Daisy\Downloads\export_crystalcommerce_1790637677.csv` (not in the repo): 837 rows, all Magic, all `Near Mint`, all `English`.

```
Add Qty,Product Name,Category,Condition,Language,Sell Price
1,Increasing Vengeance,Dark Ascension,Near Mint,English,1.0
1,Guul Draz Assassin - The List,The List,Near Mint,English,2.3
1,"Numot, the Devastator",Commander 2011,Near Mint,English,1.87
```

- UTF-8 **without** a byte-order mark, `\n` line endings, fields quoted only when they contain a comma or quote.
- **Checked against the store's inventory: 791 of 837 rows match a product exactly; 46 don't**, because CC renamed things since (there's no `Commander 2011` category any more; `Teenage Mutant Ninja Turtles: Eternal-Legal` is now `Teenage Mutant Ninja Turtles Eternal-Legal`, without the colon). **So the export must take every Product Name and Category from the current Master Crystal Inventory, never from rules or memory alone** (Section 7.1).

### 3.3 The real Master Crystal Inventory (2026-09-30)

`playersuniongames-inventory-search-31.csv`: **152,115 products, 382 categories, 39 MB.** Full figures in Appendix A.

- **Columns:** `Product ID`, `Product Name`, `Category`, `Total Qty`, `Wishlists`, `Buy Price`, `Sell Price`, `URL`, `Barcode`, `Manufacturer SKU`, `ASIN`, `MSRP`, `Brand`, `Weight`, `Description`, `Max Qty`, `Domestic Only`, `Tax Exempt`, `GST Exempt`, `PST Exempt`, `HST Exempt`, `CC ID`.
- **Magic only: no Pokémon products at all.** (Another reason the export is Magic only.)
- **Most of the size is the `URL` column** (20 MB): `…/catalog/magic_the_gathering_singles-ice_age_block-alliances/ashnods_cylix/1`. `Description`, `Brand` and `Manufacturer SKU` are empty.
- **`Product ID` and `CC ID` are different numbers** on every row. Product ID is the store's product (it ends the URL); CC ID is CC's catalog number.
- **Product Name grammar** (Appendix A has the counts): `Name[ (number)][ - Foil kind][ - Variant][ - Variant]`.
  - 69,957 names have no suffix; 64,007 have one; 17,647 two; 503 three.
  - **Foil comes before the variant**: `Foil - Extended Art` (3,008), `Foil - Borderless` (2,167), `Surge Foil - Extended Art` (407). The reverse order occurs only 477 times, nearly all in Secret Lair and Unfinity (`Showcase - Galaxy Foil`).
  - **The collector number appears in brackets** only where CC needs it to tell printings apart: 9,226 names, 1,555 of them Secret Lair (`Fabricate (2090)`).
  - **Double-faced cards keep both names**: `Brazen Borrower // Petty Theft - Foil - Showcase` (6,374 names contain ` // `), the same as Scryfall's `name`.
  - **Universes Beyond flavor names come first**: `Aggro Amalgam - Voracious Hydra` is Scryfall's `flavor_name` (`Aggro Amalgam`) then `name` (`Voracious Hydra`).
  - **Quirks:** 162 names contain a double space (`Fabricate (332) - Foil  - Borderless`); 69 name + category pairs appear twice (tokens in `Tenth Edition`).
- **Categories vs. Scryfall set names:** 244 of 382 categories are exactly a Scryfall set name (ignoring case and punctuation), covering 108,658 products (71%). The rest follow patterns: `Commander: <set>`, `Promo Pack: <set>`, `Prerelease Promo: <set>`, `Universes Beyond: <set>`, renamed old sets, and catch-alls (`Pre-Release Promos`, `Unique & Misc. Promos`, `The List`). Appendix B lists them.

### 3.4 Matching what the app already holds

The 26 distinct Magic printings in dev's buys on 2026-09-30, looked up in the inventory by name:

- **18 had their set under the same name**, and within it a short list of candidates that differed only by finish and variant (`Chrome Host Seedshark`, `- Foil`, `- Extended Art`, `- Foil - Extended Art`).
- **8 sat in a category with CC's own name:** Secret Lair Drop (`Secret Lair Drop Series`), Avatar: The Last Airbender Eternal (`Avatar: The Last Airbender: Eternal-Legal`), Teenage Mutant Ninja Turtles Eternal (`… Eternal-Legal`), Unlimited Edition (`Unlimited`).
- **Scryfall's traits don't always become CC words:** our "borderless + showcase" Deadly Rollick is plain `Deadly Rollick - Showcase`; Scryfall calls Fabricate #2090 borderless and its foil plain foil, but CC sells `Fabricate (2090)` and `Fabricate (2090) - Rainbow Foil`.

**Conclusion:** exact name-building alone can't work. The matcher builds the expected name in CC's order (Section 7.4) **and** scores real candidates on the evidence, and a person decides the leftovers once.

---

## 4. The Mass Create file

### 4.1 Columns, in this order

| # | Column | Value |
|---|---|---|
| 1 | `Add Qty` | The number of copies (a positive whole number) |
| 2 | `Product Name` | The matched CC product's name, **copied exactly from the Master Crystal Inventory**, double spaces and all |
| 3 | `Category` | The matched product's Category, copied exactly |
| 4 | `Condition` | `Near Mint`, `Light Play`, `Moderate Play`, `Heavy Play` or `Damaged`, from the line's NM / LP / MP / HP / DMG |
| 5 | `Language` | `English`, always |
| 6 | `Sell Price` | **The card's Sell Price** (Section 5): today's full market price for its condition, worked out as at the buy, rounded up, at least $0.40 |
| 7 | `Custom SKU` | **The export's code** (Section 4.4): the export's date as a number, `61726` for 06/17/26, the same on every row. **It must always be the last column** (owner's decision) |

The header row is exactly `Add Qty,Product Name,Category,Condition,Language,Sell Price,Custom SKU`.

### 4.2 Rows

- **One row per product, condition and price.** Lines whose Product Name, Category, Condition and Sell Price are all the same become one row, their quantities added. Lines that differ in any of those stay separate rows.
- **Sorted** by Category, then Product Name, then Condition in NM → DMG order, so staff can check the file against a sorted pile.
- **Prices** are written with two decimals (`1.50`), no `$`.
- **Can't upload cards are never in the file** (Section 9). Neither are Pokémon cards.

### 4.3 Format and name

- UTF-8 without a byte-order mark, `\n` line endings, fields quoted only when they contain a comma, a quote or a line break (PapaParse's `unparse` does this).
- **File names** (they end in `.csv`, which `.gitignore` already blocks):
  - a day: `cc-mass-create-magic-2026-09-30.csv`;
  - a collection: `cc-mass-create-<name>-20261001-154210.csv` (the name made file-safe, the stamp from `fileStamp`);
  - the Can't upload collection: `cc-mass-create-cant-upload-20261001-154210.csv`.
- The file is built in the browser and downloaded (`URL.createObjectURL`), like a backup (`DESIGN_SPEC.md` 11.5).

### 4.4 Custom SKU: the export's code

Owner's decision, 2026-10-01. **Every row of an export carries the same Custom SKU: a number-only code made from the export's date**, so the batch can be tracked in CC.

- **The format: month, day, year, digits only.** The **month has no leading zero**; the **day is always two digits**; the year is its last two digits (owner's decision, 2026-10-01):

  | Date | Custom SKU |
  |---|---|
  | 06/17/26 | `61726` |
  | 06/05/26 | `60526` |
  | 01/11/26 | `11126` |
  | 11/01/26 | `110126` |
  | 12/31/26 | `123126` |

  Keeping the day's zero gives every date its own code: with no zeros at all, 1/11/26 and 11/1/26 would both be `11126`. One function makes it, `customSkuFor(date)` (store time), tested with the table above.
- **The date is the day the export is made**, in store time (`STORE_TZ`), not the day of the buys (owner's decision): exporting September 30's buys on October 1 gives October 1's code.
- **Stamped** on every exported line (`cc_custom_sku`, Section 6.4). A re-download of a Completed day or collection uses the stamp, so the code never changes after the export. An undone and repeated export gets the new day's code.
- **Exports from Can't upload cards** get the code of the day they're made.
- **Shown on the day page** once it's exported: a chip in the header, labelled very clearly, **`Custom SKU 61726`** (Section 10). **The same chip on an exported collection's screen** (owner's decision), in its details panel's header bar.

---

## 5. Sell Price

Owner's decision, 2026-10-01. Mass Create **replaces** a product's sell price in CC (Section 3.1), so this column sets what the shop charges for the card. It must be right on every row.

### 5.1 The rule

**Each exported card's Sell Price is its full market price for its condition right now, worked out the same way as when it was bought, rounded *up* by the store's steps, and never below $0.40.**

- **Full** market price: the condition's price itself, not a Cash or Credit payout.
- **Right now:** fetched fresh at export time (5.4), not the price recorded at the buy.
- **The same way:** the same printing, finish and condition, through the same price ladder (`DESIGN_SPEC.md` 8.7) with the same override the buy used (Use Fallback or Use Cardmarket, saved in `price_snapshot.override`). Table in 5.2.
- **Rounded up**, never down, then **at least $0.40** (5.3).
- **A manual price** is compared with today's price for its condition, and the higher one is used (5.2).

### 5.2 Worked out by how the card was priced

A line's `price_source` (`DESIGN_SPEC.md` 6.1; migration 0004) says how its buy price was reached. Each is worked out again with today's data:

| `price_source` | At the buy | Sell Price, now |
|---|---|---|
| `justtcg` | JustTCG's price for the condition | Today's JustTCG prices for the printing and finish, through the ladder, for the line's condition |
| `justtcg_fallback` | JustTCG's NM × the condition's Master Fallback Percentage | The same ladder, with today's JustTCG prices and today's percentages |
| `scryfall_fallback` | Scryfall's price × the percentage | The same, with today's Scryfall price for the finish (`prices.usd`, `usd_foil` or `usd_etched`) |
| `cardmarket` | Cardmarket's euro price × the day's euro rate × the percentage | Today's Cardmarket price × today's euro rate × the percentage |
| `manual` | Typed in by staff | **The higher of** the manual price and today's ladder price for the condition |

- **The ladder runs with the buy's override:** Use Fallback stays Use Fallback; Use Cardmarket stays Use Cardmarket.
- **The ladder's own rules still apply** (`DESIGN_SPEC.md` 8.7: prices never rise as the condition drops, and so on). The Sell Price starts from the ladder's **unrounded** value for the condition (`raw`), never its rounded-down `price`.
- **A card the buy priced by fallback**, because JustTCG had nothing for its condition then, gets JustTCG's price if it has one today: the ladder takes it, as it would for a new buy (owner's decision, 2026-10-01).
- **A manual price with no price at all today** (no JustTCG price, no fallback) is used on its own, rounded up and floored (owner's decision).

### 5.3 Rounding up, and the floor

`roundUpPrice` (`src/lib/money.js`, beside `roundDownPrice`) uses the **same steps as the buys, upward**:

| Unrounded price | Up to the next | Examples |
|---|---|---|
| under $1 | cent | 0.333 → 0.34; 0.30 → 0.30 |
| $1 to under $10 | quarter | 1.01 → 1.25; 2.10 → 2.25; 9.80 → 10.00 |
| $10 to under $100 | dollar | 10.01 → 11.00; 99.50 → 100.00 |
| $100 to under $1,000 | $5 | 100.01 → 105.00 |
| $1,000 and up | $10 | 1,000.01 → 1,010.00 |

- The step comes from the unrounded price's band. A price already on a step stays where it is.
- Work in whole cents, trimmed to 6 places first, as `roundDownPrice` does, so float error can't push a price up a cent.
- **Then the floor: never below $0.40** — `max(0.40, rounded)` — on every card, manual ones too.
- **A manual price is rounded up the same way** after the comparison ("whichever is higher, rounded").
- Tests cover each band's edges, prices already on a step, the floor, and the manual comparison both ways.

### 5.4 Fetching today's prices

- **JustTCG, fresh:** the `prices` Edge Function gains a `fresh: true` option that skips its 6-hour `price_cache` for that request (and refreshes the cache). Exported lines carry `justtcg_card_id` / `justtcg_variant_id`, so it's a direct batch lookup: **100 cards per request**. A day of 60 cards costs 1 request; a 1,000-card collection, 10 (the Starter plan allows 1,000 a day, `DESIGN_SPEC.md` 5.3). The dialog says "Fetching today's prices (1 JustTCG request)…".
- **Cards that never had a JustTCG match** go through the same lookup as the Price screen (its `price_map` memory makes repeats cheap).
- **Scryfall:** the cards fetched for matching (Section 7.4) already carry today's prices.
- **Cardmarket and the euro rate:** fetched as the Price screen does (`DESIGN_SPEC.md` 8.7).
- **If today's prices can't be fetched** (the daily limit, an outage), the export stops before anything is saved: "Today's prices couldn't be fetched: <reason>. Nothing was exported." (owner's decision: never export on stale prices).
- Prices are fetched during the dialog's Matching step (Section 8.3), so the Review step can show every card's Sell Price before anything is saved.
- **As built (E3):** `fresh: true` makes the `prices` function accept only prices fetched in the **last 15 minutes** (instead of 6 hours), so going Back and exporting again, or a retry, doesn't spend another request. Lookups are sent 100 at a time. An override that can't apply today is dropped as the Price screen drops it (Use Cardmarket with no Cardmarket price today → the normal ladder; recorded in the basis as `overrideApplied: false`). If a Cardmarket-priced card needs today's euro rate and it can't be fetched, the export stops like any other missing price.

### 5.5 Where it's kept, and shown

- **Stamped at export** on each line (Section 6.4): `cc_sell_price`, and `cc_sell_basis`, a small record of how it was reached (the source, today's unrounded price, the manual price if any and which won, the override, when it was fetched).
- **The file** writes `cc_sell_price`, two decimals. **Rows merge only when their Sell Prices are equal** (Section 4.2).
- **A re-download** of a Completed day or collection uses the stamps. Nothing is fetched again.
- **In the Review step** each card shows both: "Bought $1.00 → Sell $1.25".
- **After the export, the app shows the Sell Price in place of the buy price** (owner's decision): on the day page's card rows and in a collection's card list, marked "Sell", with a tooltip "Bought at $1.00 · sell price from the export". The buy price stays in the database (`unit_price`).
- **The totals follow** (owner's decision, 2026-10-01): an exported day page's panels and an exported collection's sidebar show Market as the sum of the Sell Prices, and Cash / Credit as that at the buy's or collection's own percentages (rounded down as always). The price actually paid stays as it was: the **Paid** chip (walk-ins) and the Paid/Ours details (collections) are the record of the deal. Undo brings the buy totals back.
- **Undo** (Mark Paid/Ours again, or Reopen) clears the stamps, and the buy prices show again.
- **Can't upload cards** get their Sell Price when they're exported later, from Can't upload cards (Section 9.3).

---

## 6. Data model changes

New migrations continue from `0025`. Never edit an applied migration (`DESIGN_SPEC.md` Appendix A).

### 6.1 `cc_products`: the inventory, ready to search (Phase E1)

One row per CC product in the **current** Master Crystal Inventory. Only the columns the export needs; the rest of the CSV stays in the stored file.

| Column | Type | Notes |
|---|---|---|
| file_id | uuid → master_inventory_files on delete cascade | Which upload the row came from |
| product_id | text | CC's `Product ID` |
| cc_id | text null | CC's `CC ID` |
| product_name | text | **Exactly as in the CSV** (never trimmed or collapsed) |
| category | text | Exactly as in the CSV |
| base_key | text | The base name folded for search (`nameKey`, `DESIGN_SPEC.md` 3.1), double spaces collapsed |
| bracket | text null | What's in the brackets after the base name: `2090`, `0008`, `M3C`, `PAGL` |
| foil_kind | text null | `Foil`, `Foil Etched`, `Surge Foil`… (Section 7.2); null when non-foil |
| variants | text[] | The other suffixes, in order |
| catalog_path | text | The URL's catalog path without the host and Product ID: `magic_the_gathering_singles-zendikar_block-worldwake/stoneforge_mystic` |

- **Primary key** `(file_id, product_id)`. **Indexes:** `(category, base_key)`; a trigram index on `base_key` (staff searching in the review, Section 8.3).
- **Size:** about 150,000 rows of short text, a few tens of MB with indexes, well inside the Free plan's 500 MB database.
- **RLS:** the store's role may read, and insert or delete through the loading functions only (Section 6.6). The table isn't in backups (`DESIGN_SPEC.md` 11.5): it's rebuilt from the stored file.

### 6.2 `cc_set_map`: Scryfall set → CC Category (Phase E2)

| Column | Type | Notes |
|---|---|---|
| scryfall_set | text PK | Scryfall's set code, lower case (`buy_lines.source_set_id`) |
| promo_kind | text default '' | `''`, `prerelease` or `promopack` (Section 7.3): part of the key, so a set's promo pack cards can map elsewhere |
| category | text | CC Category |
| source | text | `staff` (picked in the review) or `rule` (kept only when a rule's answer is confirmed by staff) |
| updated_at / updated_by | timestamptz / uuid → staff_users | |

Primary key `(scryfall_set, promo_kind)`. Rows are **only** what staff confirmed; automatic answers (Section 7.3 steps 2–4) are worked out on the fly and never stored.

### 6.3 `cc_product_links`: remembered matches (Phase E2)

| Column | Type | Notes |
|---|---|---|
| scryfall_id | text | The printing |
| finish | text | `nonfoil`, `foil` or `etched` |
| product_id | text | CC's Product ID |
| product_name / category | text | As they were when linked (shown if the product has since gone) |
| source | text | `staff` (picked) or `auto` (matched alone and exported) |
| linked_at / linked_by | timestamptz / uuid | |

Primary key `(scryfall_id, finish)`. Linking by **Product ID** means a later inventory with renamed products still finds the right one (Section 7.6).

### 6.4 `buy_lines`: what each card exported as (Phase E3)

| Column | Type | Notes |
|---|---|---|
| cc_status | text null | `exported` or `cant_upload`; null until exported |
| cc_product_id, cc_product_name, cc_category | text null | The product it exported as (so a re-export rebuilds the same file) |
| cc_condition | text null | The Condition word written (`Near Mint`…) |
| cc_sell_price | numeric(10,2) null | The Sell Price written (Section 5) |
| cc_sell_basis | jsonb null | How it was reached (Section 5.5) |
| cc_custom_sku | text null | The export's code written in the Custom SKU column (Section 4.4) |
| cc_exported_at | timestamptz null | |
| source_line_id | uuid null → buy_lines on delete set null | Only on lines in the Can't upload collection: the card's line in its original buy or collection |

`completed_at` / `completed_by` (migration 0018) keep their meaning: Completed. A can't-upload line is still Completed in its own buy (Section 9.2).

### 6.5 `buys`: the system collection (Phase E4)

- **`system_key text null unique`.** The Can't upload collection has `system_key = 'cant_upload'`; every other buy has null.
- The constraint `buys_collection_needs_name_phone` becomes: a collection needs a name, and a phone **unless it has a system key**.
- A migration **creates the collection once**: `kind = 'collection'`, `status = 'paid'`, `customer_name = 'Can't upload cards'`, `phone` null, `paid_price` / `paid_method` null, `notes` = the fixed note (Section 9.1).

### 6.6 New database functions

All security invoker unless noted, granted to `authenticated` only, refusals as short codes (`DESIGN_SPEC.md` 6.2).

| Function | Phase | Does |
|---|---|---|
| `cc_products_load(file_id, rows jsonb)` | E1 | Inserts a batch of parsed products for an upload (Section 6.7) |
| `master_inventory_start` / `master_inventory_finish` / `master_inventory_abort` | E1 | The upload in steps (as built, Section 6.7): replaces the planned `cc_products_activate` |
| `cc_candidates(wants jsonb)` | E2 | For a list of `{ key, category, base_keys }`, every product with that category and one of those base keys; with no category, any category. One call for a whole export (as built: `base_keys` is a list, the card name and its flavor name) |
| `cc_categories()`, `cc_products_by_id(ids)`, `cc_products_search(text)` | E2 | The current inventory's categories; products by Product ID (are remembered links still there?); the review's search. As built, `cc_set_map` and `cc_product_links` are written directly (RLS) instead of through save / forget functions |
| `export_lines(target jsonb, matches jsonb, cant_upload uuid[], user, device)` | E3 | **The export itself, in one transaction** (Section 8.4). As built: `export_lines(p_target, p_matches, p_cant, p_set_maps, p_user, p_device)`, with staff's set choices as their own argument; it returns the counts, the Custom SKU and the stamped lines, so the file is built without reading them back |
| `export_undo_day(day, game, user, device)` | E3 | Replaces `day_mark(…, false)`: back to Paid/Ours, clears the stamps, takes the day's copies out of Can't upload (Section 9.4) |
| `cc_custom_sku(at)`, `cc_condition_word(condition)` | E3 | As built: the Custom SKU (`to_char(…, 'FMMMDDYY')` in store time) and CC's condition words, in SQL, so the stamps never depend on the browser's clock |

### 6.7 Loading the inventory at upload (Phase E1)

The upload (`DESIGN_SPEC.md` 11.1, as built: chunked check, gzip, current file only) gains one step between **Uploading…** and **Saving…**:

1. The check already reads the CSV in 2 MB chunks. A second pass reads it again in chunks, parses each Product Name (Section 7.2), and sends the slim rows to `cc_products_load` **in batches of 2,000** (about 76 calls for 152,000 products). The panel shows **"Loading products… 45%"**.
2. `master_inventory_add` (now also calling `cc_products_activate`) makes the file current and drops every other file's products, so the matcher only ever sees the current inventory.
3. If loading fails part-way, the new file's products are removed, the stored file is removed, and the previous inventory stays current. Nothing half-loaded is ever matched against.
4. The Master Crystal Inventory panel shows **"152,115 products loaded for export"** under Rows.

An Edge Function isn't used for this: parsing 40 MB takes far longer than an Edge Function's CPU limit on the Free plan.

**As built (Phase E1, migration 0025):**
- The products belong to their upload's `master_inventory_files` row, so the upload runs in steps: **`master_inventory_start`** creates the row, not yet current → **`cc_products_load`** in batches of 2,000 (security definer; the store's role can only read `cc_products`) → **`master_inventory_finish`** makes it current, sets `master_inventory_files.products_loaded`, and deletes every other file's row (their products go with it, `on delete cascade`), returning their storage paths for the app to delete. On any failure, **`master_inventory_abort`** removes the new row and its products, and the app removes its stored file. These replace the spec's `cc_products_activate`. `master_inventory_add` (0024) stays for the older live build; a file it uploads has no products loaded.
- The check now also requires the **Product ID, Product Name and Category** columns.
- Loading re-reads the CSV in 2 MB chunks (PapaParse, pausing while each batch is sent).
- `scripts/cc-report.mjs` on the real inventory matched Appendix A (the parser counts multi-word foils like `First-Place Foil` as foil kinds and splits `Foil DCI Judge Promo` into `Foil` + `DCI Judge Promo`, so its shape counts differ by a few hundred).

---

## 7. Matching

### 7.1 The rules everything else follows

1. **The file's Product Name and Category always come from `cc_products`, copied exactly.** Nothing the app builds is ever written to the file.
2. **A card is matched within one category.** The category comes first (Section 7.3); then the product within it (Section 7.4).
3. **A remembered answer wins** (Sections 7.3 step 1, 7.5), as long as it still exists in the current inventory.
4. **One clear candidate is matched automatically.** Several, or none, go to staff in the review (Section 8.3). Staff can always choose **"None of these (can't upload)"**.
5. **Magic lines only.** Pokémon lines never reach the matcher.

### 7.2 Reading a CC Product Name

The parser (`src/lib/ccNames.js`, pure, tested) turns a Product Name into parts. CC's order, from 152,115 names (Appendix A), **must** be read in exactly this order:

```
<Base name>[ (<bracket>)][ - <Foil kind>][ - <Variant 1>][ - <Variant 2>][ - <Variant 3>]
```

1. **Collapse runs of spaces** for parsing only (the stored `product_name` keeps them).
2. **Split on ` - `.** The first part is the base name, with its bracket if any.
3. **The bracket** is the last `(…)` on the base name: a collector number (`2090`, `0008`, `263s`) or a set code (`M3C`, `PAGL`).
4. **A suffix is the foil kind if it ends in `Foil` or `Foil Etched`**: `Foil`, `Foil Etched`, `Surge Foil`, `Rainbow Foil`, `Galaxy Foil`, `Ripple Foil`, `Halo Foil`, `Textured Foil`, `Fracture Foil`, `Mana Foil`, `Gilded Foil`, `Raised Foil`, `Confetti Foil`, `Gateway Foil`, `Silver Foil Etched`, `First-Place Foil`, `Step-and-Compleat Foil`, `Silver Scroll Foil`, `Chocobo Track Foil`, `Oil Slick Raised Foil`, `WPN Foil`… Normally it's the first suffix. In the 477 names where a variant comes first (`Showcase - Galaxy Foil`, `Thick Stock - Foil Etched`), it's still recognised wherever it is.
5. **Every other suffix is a variant**, kept in order.
6. **Flavor names:** in the Universes Beyond "Eternal" categories (`Teenage Mutant Ninja Turtles Eternal-Legal`, `Avatar: The Last Airbender: Eternal-Legal`), a first suffix that is a Scryfall card name belongs to the base name: `Aggro Amalgam - Voracious Hydra` is flavor name + card name. The parser can't know which suffixes are card names, so the matcher handles this (Section 7.4, step 1) and the parser records the plain split.

`base_key` is the folded base name. Suffix text keeps its case for display; comparisons use a folded copy.

### 7.3 Scryfall set → CC Category

Worked out per line from its set (`source_set_id`, the set's Scryfall name and type, and the card's `promo_types`), in this order. **Every answer must be a category that exists in `cc_products`**; one that doesn't falls through to the next step.

1. **Staff's choice**, from `cc_set_map`, for this set and promo kind.
2. **Promo kinds first:**
   - promo type `prerelease` → `Prerelease Promo: <set name>` if that category exists, else **`Pre-Release Promos`** (3,358 products);
   - promo type `promopack` → **`Promo Pack: <set name>`** (27 categories), where `<set name>` is the main set's name (Scryfall's `parent_set_code`, or the promo set's name without ` Promos`).
3. **The same name:** the Scryfall set name equals a category once both are folded (lower case, letters and digits only). Covers 71% of products.
4. **The rules in Appendix B**, tried in order: `<set> Commander` → `Commander: <set>`; `Universes Beyond: <set>`; `<set> Eternal` → `<set>: Eternal-Legal` or `<set> Eternal-Legal`; `Secret Lair Drop` → `Secret Lair Drop Series`; `The List` → `The List`; renamed old sets (`Limited Edition Alpha` → `Alpha`, `Classic Sixth Edition` → `Sixth Edition`, `Ravnica: City of Guilds` → `Ravnica`…).
5. **No category.** The line goes to the review with its whole card's candidates from every category (`cc_candidates` without a category). Staff pick the product; the review offers to remember that set → category (Section 8.3).

A set's answer is worked out once per export, not per line.

### 7.4 The product within the category

Each line brings what the app saved (`name`, `collector_number`, `finish`, `treatments`, `set_code`) and, fetched at export time by `scryfall_id` (`POST /cards/collection`, 75 per request, cached for 7 days like other Scryfall data), the card's `flavor_name`, `promo_types`, `frame_effects`, `border_color`, `full_art` and `finishes`.

**Step 1: candidates.** Products in the category whose `base_key` equals the card's `name`, folded. For a card with a `flavor_name`, also those whose base name plus first suffix is `<flavor name> - <name>` (the flavor suffix is then not a variant).

**Step 2: the expected name, in CC's order.** The matcher builds the name CC would most likely use, **exactly in this order**:

```
<name>[ (<collector number>)][ - <foil kind>][ - <variants…>]
```

- **Collector number in brackets** when any candidate with this base name carries a bracketed number. Then it must match (`0008` = `8`, compared like `normNumber`).
- **Foil kind:**
  - `nonfoil` → none;
  - `foil` → the special foil from `promo_types` if there is one (`surgefoil` → `Surge Foil`, `rainbowfoil` → `Rainbow Foil`, `galaxyfoil` → `Galaxy Foil`, `halofoil` → `Halo Foil`, `ripplefoil` → `Ripple Foil`, `fracturefoil` → `Fracture Foil`, `textured` → `Textured Foil`, `manafoil` → `Mana Foil`, `gilded` → `Gilded Foil`, `raisedfoil` → `Raised Foil`, `confettifoil` → `Confetti Foil`, `stepandcompleat` → `Step-and-Compleat Foil`), else `Foil`;
  - `etched` → `Foil Etched`.
- **Variants, in this order** (the order CC uses them together, Appendix A): `Prerelease Promo` (promo type `prerelease`), `Promo Pack` (`promopack`), `The List` (set `plst`), `Extended Art` (`extendedart`), `Borderless` (border `borderless`), `Showcase` (`showcase`), `Retro Frame` (old frame on a modern set), `Full Art` (`full_art`, non-land), `Japanese Alternate Art`, `Serialized` (`serialized`).

**Step 3: scoring.** The expected name is a guide, not a requirement (Section 3.4). Each candidate is scored on evidence:

| Evidence | Effect |
|---|---|
| Exact equality with the expected name (spaces collapsed, folded) | Wins outright |
| Bracket number equals the card's number | Required when the candidate has a number |
| Foil kind | Required to agree in kind: none ↔ non-foil; `Foil Etched` ↔ etched; any other foil kind ↔ foil. A named special foil that equals ours scores above plain `Foil` |
| Each of our variants found in the candidate's suffixes (word families: `Showcase` ↔ `Showcase`, `Showcase Scrolls`, `Japan Showcase`; `Borderless` ↔ `Borderless`, `Anime Borderless`, `Borderless Manga`, `Borderless Poster`…) | + |
| Each candidate variant we have no evidence for | − |

- **One best candidate, ahead of the next** (or the only candidate) → matched automatically.
- **A tie, or no candidate passes the required checks** → the review.
- The 69 duplicate name + category pairs (Section 3.3) are always a tie, so they always reach the review.

### 7.5 Remembering

- **Staff's picks are links** (`cc_product_links`, `source = 'staff'`), keyed by printing and finish. Next time the same printing and finish match straight away, in any day or collection, if the linked Product ID is still in the inventory.
- **Automatic matches that were exported are links too** (`source = 'auto'`), so a later inventory can't change a card's match without a review.
- **"None of these" is not remembered.** The next export tries again; CC may have added the product.
- A Settings panel lists them (Section 11.2).

### 7.5a As built (Phase E2)

- **`src/lib/ccMatch.js`** holds the rules (pure, tested): `categoryFor` (steps 1–4 of 7.3), `expectedName` (7.4 step 2, CC's order), `scoreCandidate` and `chooseProduct` (7.4 step 3). Most printing evidence comes from the line's own `treatments` (borderless, showcase, extended art, full art, retro frame, serialized, special foils, prerelease / promo pack / buy-a-box / bundle stamps, saved at the buy); Scryfall is fetched only for the `flavor_name`.
- **Scores:** a numbered bracket that matches +5 (required to match when the bracket is a number); a set-code bracket matching the card number's prefix +3; the expected special foil +2 (another foil kind −1); each of our variants found +3, missing −1; each of the product's variants we can't explain −2 (another word −1); the exact expected name +100. **When CC lists a product with our collector number, products with no number lose 4** (an older Secret Lair drop of the same card is another printing). One passing candidate, or a lead of **2 or more**, is matched automatically.
- **With no category**, candidates come from every category and always go to the review.
- **Results on the real inventory (2026-10-01, `scripts/cc-report.mjs <inventory> <printings.json>`):** all **26** distinct Magic printings in dev's buys matched automatically; of **200 random English paper printings** from Scryfall (half foil where possible), **190 matched automatically**, 2 went to a choice (Unfinity attraction cards, rightly), and 8 found no category: 5 from *Reality Fracture* (not in the store's inventory at all: they'd be can't upload), Unfinity sticker sheets, *Mystery Booster Commander Edition* and *Game Night* (since added as a rename).
- **Rules added while testing** (Appendix B): a set's Commander decks use its **main set's full name** (`New Capenna Commander` → `Commander: Streets of New Capenna`, from Scryfall's `parent_set_code`); `Conspiracy: Take the Crown` → `Conspiracy 2: Take the Crown`; `Game Night` → `Game Night 2018`; a two-part card CC lists **by its front only** (a Kamigawa flip card, `Homura, Human Ascendant`) is found by its front name when nothing has the full name.
- **The dry run** is **⋯ → Check Crystal Commerce matches** on a Magic day page (it needs a picked user, since picks are saved with who made them). A pick applies to every line of the same printing and finish in the dialog.
- **Database (migration 0026):** `cc_set_map` and `cc_product_links` are written straight from the browser (store-role RLS, like settings) rather than through save / forget functions; reads go through `cc_categories`, `cc_candidates`, `cc_products_by_id` and `cc_products_search` (all on the current file, `cc_current_file()`).
- **Scryfall cards** are fetched fresh for each dialog (`/cards/collection`, 75 at a time), not cached for 7 days: the Sell Price needs today's prices anyway (Section 5.4).
- `loadSets` now keeps each set's `parent_set_code` (its cache key moved to `.v3`), for promo pack categories.

### 7.6 A new inventory

- Uploading a new Master Crystal Inventory replaces `cc_products` (Section 6.7).
- **Links survive by Product ID.** If CC renamed a product, the link finds it under the new name.
- A link whose Product ID is gone is ignored: that card goes through steps 1–3 again (and to the review if needed), and the review says it used to be linked to `<old name>` in `<old category>`.
- A set map whose category is gone is ignored the same way.

---

## 8. The export flows

### 8.1 Before anything starts

EXPORT checks, in this order, and stops with a toast (and nothing changed) when one fails:

1. **A picked user** (`GuardButton`), and a connection.
2. **A Master Crystal Inventory with products loaded.** Otherwise: "Upload the Master Crystal Inventory in Settings first." (The required banner, `DESIGN_SPEC.md` 7.5, already says so.)
3. **Magic.** On a Pokémon day page EXPORT is greyed out: "Pokémon export isn't available yet." (owner's decision, 2026-09-30). The server refuses too.
4. **A day page: not today** (`DESIGN_SPEC.md` 10.2, decision 166).
5. **A collection: Paid/Ours or Completed.** Processing or Priced: "Mark it Paid/Ours first."

### 8.2 What EXPORT does, by state

| Where | State | EXPORT |
|---|---|---|
| Magic day page | Has Paid/Ours buys | The export (8.3–8.4): match, review, confirm, mark **Completed**, download |
| Magic day page | All Completed | **Downloads the same file again** from the lines' stamps. No matching, no status change, no new Can't upload copies |
| Pokémon day page | Any | Greyed out |
| Collection | Paid/Ours | The export: Magic lines only; the collection becomes **Completed** |
| Collection | Completed | Downloads the same file again |
| Collection | Processing / Priced | Blocked: "Mark it Paid/Ours first" |
| Can't upload cards | Always Paid/Ours | Warns first, then the export (Section 9.3) |

### 8.3 The export dialog

A wide modal with three steps. It can't be closed while it's saving.

**Step 1: Matching.** "Matching 34 cards…" while it fetches the Scryfall facts, works out each set's category and calls `cc_candidates` once, then "Fetching today's prices…" for the Sell Prices (Section 5.4). Usually a few seconds.

**Step 2: Review.** Three groups, each with a count, in this order:

1. **Needs a choice** (amber), if any. Each card on its own row: what we have (`2 Brazen Borrower // Petty Theft (ELD) 51 *F* [LP]`, the card picture on hover as elsewhere), and under it its candidates as radio buttons, exactly as CC names them, with their category:
   - the best guesses first, most likely pre-selected only if they're a clear favourite;
   - **"None of these (can't upload)"** as the last choice;
   - a small search box, "Find another CC product…", searching `cc_products` by name (trigram) when the right product isn't listed;
   - when the category itself was unknown (Section 7.3 step 5), a checkbox, on by default: **"Always use <Category> for <Scryfall set>"**.

   Export stays disabled until every card here has a choice.
2. **Matched** (green): "31 cards matched", collapsed. Opened, each card with the CC product it matched, its prices ("Bought $1.00 → Sell $1.25", Section 5.5), and a small **Change** link, which moves it to Needs a choice.
3. **Can't upload** (red), if any: each card that matched nothing, or that staff set to "None of these".

**Step 3: Confirm.**

- With no can't-upload cards: **[Cancel] [Export 34 cards]**.
- With some, a red panel above the buttons, impossible to miss:
  - **"Pull these 3 cards out of the batch before uploading."** in large type;
  - the list: quantity, card, set and number, finish, condition, and which buy it came from (`Buy 4`) or the collection;
  - a note: "They won't be in the file. They'll be marked Can't upload here and copied to the Can't upload cards collection.";
  - a required checkbox, **"I've pulled these cards out of the batch"**. **Export** stays disabled until it's ticked.

### 8.4 Saving the export

On **Export**, the app calls **`export_lines`** once. In one transaction it:

1. checks the target is still exportable (the day's buys Paid/Ours and not today; the collection Paid/Ours; nothing changed since the dialog opened: the buys' or collection's `version`), else refuses (`stale_version`) and nothing changes;
2. stamps every matched line: `cc_status = 'exported'`, `cc_product_id / name / category`, `cc_condition`, `cc_sell_price`, `cc_sell_basis`, `cc_custom_sku`, `cc_exported_at`;
3. stamps every can't-upload line `cc_status = 'cant_upload'`, and **copies it into the Can't upload collection** (Section 9.2);
4. saves staff's links and set maps from the review (and `auto` links for automatic matches);
5. **a day:** marks the day's Magic cards Completed (what `day_mark` did); **a collection:** marks it Completed (`collection_set_status`, from Paid/Ours, keeping its price);
6. logs the changelog entries (Section 12).

Then the browser builds the Mass Create file from the stamped lines (Section 4) and downloads it, and a toast says what happened: "Exported 31 cards (28 rows). 3 can't upload: they're in Can't upload cards." If the download fails, EXPORT on the now-Completed day or collection downloads it again.

### 8.4a As built (Phase E3)

- **Migration 0027:** the `buy_lines` columns of 6.4, `cc_custom_sku`, `cc_condition_word`, `export_lines` (days only until E4/E5), `export_undo_day`. Tested in a rolled-back transaction against dev's real September 30 buys (every refusal, the stamps with CC's double spaces kept, links, set choices, the changelog line), then applied to dev.
- **`export_lines` checks, in order:** a user; a day target; Magic (`pokemon_export_unavailable`); not today (`day_not_over`); **products loaded** (`no_inventory`); the day's buys locked and **their versions as the dialog saw them** (`stale_version`); **every Paid/Ours Magic line given exactly once**, matched or can't upload (`stale_version`); every product still in the current inventory (`stale_inventory`, and the dialog matches again); every Sell Price at least $0.40 (`bad_price`). Nothing left to export: `nothing_to_export`.
- **The product's name and category are copied from `cc_products` on the server**, never from the browser, so the file always has CC's exact text.
- **Links saved with the export:** `staff` for picks, `auto` for automatic matches; matches that came from a remembered link aren't saved again. Set choices are saved only when their category exists.
- **Picks in the export dialog are saved with the export**, not as they're made: Cancel saves nothing (the dry run still saves as it goes).
- **`day_mark` stays** for the older live build (v0.9.1), whose EXPORT only marks a day Completed; its "back to Paid/Ours" now goes through `export_undo_day`, so the stamps are cleared whichever build does it. A day marked Completed by the older build has no stamps: EXPORT on it says to mark the day Paid/Ours again and export.
- **Every card can't upload:** no file is made; the cards are still stamped and Completed (the toast says there's no file).
- **The changelog's `day_exported` summary** carries the counts and the Custom SKU: "2 Magic cards exported (Custom SKU 100126); 1 can't upload."
- **The Mark Paid/Ours again dialog** now also says the downloaded file isn't undone: if it was uploaded, fix CC by hand.
- **The day page after an export:** each exported row shows its Sell Price with a green **SELL** tag (the buy price in the tooltip); a can't-upload row shows the red **Can't upload** chip; the panel's first total reads **Sell** (the sum of Sell Prices) and Cash / Credit follow it; the header has the **Custom SKU** chip; the note under the title gives the counts.

### 8.5 Pokémon cards

- **Pokémon day pages:** EXPORT is greyed out (Section 8.1). Their buys stay Paid/Ours.
- **Collections with Pokémon cards** behave as if the Pokémon cards weren't there (owner's decision, 2026-09-30): they aren't matched, aren't in the file, aren't flagged can't upload, and the collection still becomes Completed. A collection with **only** Pokémon cards still becomes Completed; no file is downloaded, and the toast says "No Magic cards to export."
- **Mixed walk-in buys:** the Magic day page exports the buy's Magic cards (as now, `DESIGN_SPEC.md` 10.1); its Pokémon cards stay Paid/Ours.

---

### 8.6 As built (Phase E5)

- **Migration 0029:** `export_lines` takes `{ kind: 'collection', buy_id, version }`: the collection's editing lock is needed (`not_lock_holder`), it must be Paid/Ours (`collection_not_paid`; Completed: `nothing_to_export`), its Magic lines are checked, stamped and copied like a day's, Pokémon lines are left untouched, and it becomes **Completed** (logged as `collection_status_changed` with the counts and Custom SKU). With only Pokémon cards it just becomes Completed. The inventory is only required when something is matched.
- **`collection_set_status`:** leaving Completed (Reopen, or Unlock to Priced / Processing) clears the export stamps and takes the collection's copies out of Can't upload cards, and its changelog summary says so. The manual **Mark as Completed** (status dropdown and step button) is kept: it completes without a file, and EXPORT on such a collection says to reopen it and export.
- **The collection screen:** EXPORT on Paid/Ours opens the export dialog (only Pokémon: "No Magic cards to export" → Mark Completed); on Completed it downloads the same file again (named with the export's own time); on Processing / Priced it says "Mark it Paid/Ours first." The **Custom SKU** chip sits in the details' header bar; the sidebar shows **SELL** prices and its totals follow them. The Reopen dialog explains the undo.
- **EXPORT's placeholder is gone** (`ExportButton` just runs the page's export).
- **Settings → Crystal Commerce matching** (11.2): a wide panel split like Backups; set choices on the left, remembered products on the right (the latest 20, or a search by product name; Scryfall's card names aren't stored in the links, so the search is on CC's product name), each with Forget.

## 9. The "Can't upload cards" collection

### 9.1 What it is

A permanent collection, created once by migration (Section 6.5), that holds every card an export couldn't place, so the physical card has somewhere to live.

- **Name:** `Can't upload cards`. **Can't be renamed.**
- **Status:** always **Paid/Ours**. No status dropdown, no step button, no Unlock or Reopen.
- **Phone:** none. Last 4 ID: none.
- **Note, fixed** (not editable): "Cards that couldn't be matched to a Crystal Commerce product during an export. Pull them out of the upload batch. They stay here until they're exported from here or deleted."
- **Can't be deleted.** Its ⋯ menu has no Delete collection.
- **Its cards can be removed as normal** (×, the Remove card dialog). Paid/Ours already allows removing and not editing (`DESIGN_SPEC.md` 9.4, decision 12).
- **Nothing can be added by hand.** Cards only arrive from exports; the search bar and ADD CARD are disabled with "Cards arrive here from exports".
- **The server refuses** a rename, status change, info edit, delete or card add on it (`system_collection`), whatever the client does.

### 9.2 How cards arrive

During `export_lines` (Section 8.4), each can't-upload line is **copied** into this collection: a new `buy_lines` row with the same card, finish, condition, quantity and prices, and `source_line_id` = the original line.

- **The original line stays where it was** (owner's decision): Completed, with `cc_status = 'cant_upload'`. On its day page or collection, its row shows a red **Can't upload** chip.
- The copy carries a small note of where it came from in the collection's list: `from Buy 4 · September 30, 2026` or `from <collection name>`.

### 9.3 Exporting from it

- EXPORT here first warns: **"These cards couldn't be matched before. Exporting them again is unlikely to work, unless the Master Crystal Inventory has changed or you can pick their products by hand."** [Cancel] [Try anyway].
- Then the same dialog (Section 8.3) for its cards.
- **Cards that now match:** in the file, **removed from this collection**, and their original line's stamp becomes `exported` (the Can't upload chip goes). The changelog is the only record of the move (owner's decision).
- **Cards that still don't match** stay. No new copies, no pull-out list (they're already out of the batch): the confirm step just says "3 still can't upload and stay here."
- The collection stays Paid/Ours.

### 9.4 Undo

**Mark Paid/Ours again** on a day page (`DESIGN_SPEC.md` 10.2) now calls `export_undo_day`, which also **removes that day's copies from this collection** (owner's decision: "undo the move") and clears the day's export stamps. **Reopen** on an exported collection does the same for its copies. If a copy was already deleted from the collection, there's nothing to remove.

### 9.4a As built (Phase E4)

- **Migration 0028:** `buys.system_key` (unique), the relaxed name/phone constraint, `buy_lines.source_note` (the copy's "from Buy 2 · September 30, 2026", kept as text so it survives its buy being deleted), the collection itself (`cant_upload_ensure()`, which also remakes it if it's ever missing), and the export's steps split into `export_check`, `export_stamp`, `export_learn`, `cant_upload_copy` and `cant_upload_return`, shared by `export_lines` and `export_undo_day`. Tested in a rolled-back transaction against dev's September 30 buys, then applied.
- **The refusals** (`system_collection`): adding, editing, details and rates through `collection_for_write` (when it changes contents or details), and `collection_set_status` and `collection_delete` in their own checks. Removing cards stays allowed.
- **Exporting from it** (`export_lines` with `{ kind: 'cant_upload', version }`) needs this computer to hold the collection's editing lock, like any collection write. Matched copies are stamped, give the file its rows, restamp their original lines `exported` (the chip goes; the originals' buys reload), and are deleted. Copies whose original was since deleted just leave. If nothing matches, nothing changes (Export stays disabled).
- **Its screen:** the details panel is a fixed version (name, System chip, the note, a line on how it works), no ⋯ menu, no status controls; the search bar is switched off and reads "Cards arrive here from exports…"; ADD CARD says the same; each card shows where it came from under its name. EXPORT warns first ("Try anyway"), then the export dialog without the pull-out list.
- **Restore:** a backup made before the collection existed is restored as it was, then the collection is made again (`cant_upload_ensure`), empty.
- **Collections table:** first row whatever the sort or status filter, with a red **System** chip; Phone, Offer and Paid read `—`.

### 9.5 Where it shows

- **Collections table:** pinned as the **first row**, with a red **System** chip beside the name, whatever the sort or filter (it hides only when the text filter excludes it). Its Phone cell is `—`.
- **Header search:** its cards are Paid/Ours, so they come up by default, under Collections. That's how staff find where a pulled card went.
- **Backups:** included like any collection. A restore keeps the system key.

---

## 10. Day pages and the Calendar

- **Pokémon EXPORT** greyed out, with its tooltip (Section 8.1).
- **Can't upload chip** on a card row whose line is `cc_status = 'cant_upload'`, after the export: a red chip, `Can't upload`, after the card text. Its tooltip: "Not matched to Crystal Commerce: pulled from the upload. It's in Can't upload cards."
- **The exported note** (`DESIGN_SPEC.md` 10.2) adds the counts: "Exported … by ● Daisy: 31 cards, 3 can't upload."
- **Sell prices** replace the buy prices on exported card rows, marked "Sell", and the panel's totals follow (Section 5.5).
- **The Custom SKU chip** in the header of an exported day, beside the date and game, labelled very clearly: **`Custom SKU 61726`** (Section 4.4).
- **Calendar:** unchanged. An exported Magic day is still tagged Exported.

---

## 11. Settings

### 11.1 Master Crystal Inventory

The upload gains **Loading products…** (Section 6.7), and the panel shows how many products are loaded for export. Everything else stays as built (current file only, compressed).

### 11.2 Crystal Commerce matching (new panel, Phase E5)

A wide panel, like Backups, at the same fixed height (`DESIGN_SPEC.md` 11):

- **Sets** (left): every staff set choice, `Scryfall set → CC Category`, with who and when, and **Forget** on each.
- **Products** (right): how many cards have remembered products (staff and automatic), a search by card name showing each link (`Brazen Borrower // Petty Theft (ELD) foil → Brazen Borrower // Petty Theft - Foil - Showcase · Throne of Eldraine`), and **Forget** on each.
- Forgetting is immediate and logged nowhere (settings changes aren't logged, `DESIGN_SPEC.md` 12).

---

## 12. Changelog

New entries, in the Buys or Collections category as noted (`DESIGN_SPEC.md` 12):

| Action | Category | Headline | Shows |
|---|---|---|---|
| `day_exported` (now from `export_lines`) | Buys | Day exported | `status: Paid/Ours → Completed`; summary "31 Magic cards exported; 3 can't upload." |
| `day_unexported` (from `export_undo_day`) | Buys | Export undone | `status: Completed → Paid/Ours`; "… 3 taken back out of Can't upload cards." |
| `collection_status_changed` (an exported collection) | Collections | Status changed | `status: Paid/Ours → Completed`; summary "Exported 40 cards; 2 can't upload." |
| `cant_upload_added` | Collections | Cards can't upload | Target: Can't upload cards. The copied lines (+), "from Magic · September 30, 2026" or the collection's name |
| `cant_upload_exported` | Collections | Exported from Can't upload | The removed lines (−) |
| `cant_upload_returned` | Collections | Cards returned | Copies removed by an undo (−) |

---

## 13. Edge cases

- **Two lines of the same product, condition and price** in one export become one row with their quantities added (Section 4.2).
- **The same card in two buys of the day matched differently** (staff picked differently): allowed; they're different rows.
- **A card removed after the export:** impossible on a Completed day or collection (`DESIGN_SPEC.md` 10.2). From Can't upload it's a normal removal.
- **The inventory is replaced while a dialog is open:** `export_lines` checks the chosen Product IDs still exist (`stale_inventory`), and the dialog reopens its review.
- **Double spaces** in CC names: copied as they are (Section 7.1).
- **Etched:** `Foil Etched`; `Silver Foil Etched` counts as etched too.
- **Art Series and oversized products** (`Art Series: …`, `Oversized`): never auto-matched; the app doesn't buy them (`DESIGN_SPEC.md` 1.4), so they only appear if staff search for them.

---

## 14. What stays the same

- **The Completed rules** from `DESIGN_SPEC.md` 10.1–10.2: game by game, today can't be exported, Completed cards are locked and out of the default search, Mark Paid/Ours again undoes.
- **The Master Crystal Inventory upload**, apart from loading its products (Section 6.7).
- **The EXPORT buttons' places**: the day page's header row, the collection's sidebar foot.

---

## 15. Build phases

Each phase ends with the owner checking it on `localhost`. Apply migrations to **dev** only; prod is migrated at launch (`DESIGN_SPEC.md` Phase 10).

### Phase E1: The inventory, ready to match

**Build**
- `src/lib/ccNames.js`: the Product Name parser (Section 7.2), with tests built from hand-made names following Appendix A's patterns (never the real file).
- Migration: `cc_products` (6.1), `cc_products_load`, `cc_products_activate`; `master_inventory_add` calls the activation.
- The upload's **Loading products…** step (6.7), the "products loaded" line, and clean-up if loading fails.
- **Pokémon EXPORT greyed out** on Pokémon day pages; `day_mark` refuses Pokémon (`pokemon_export_unavailable`).
- A local-only script, `scripts/cc-report.mjs <path to a CC CSV>`: parses a CC inventory with `ccNames.js` and prints the shapes and counts of Appendix A. It reads a path given on the command line and writes nothing to the repo.

**Owner tasks**
- Upload the real inventory (`playersuniongames-inventory-search-31.csv`) from the local app.

**Where to look**
- [ ] Settings → upload the real inventory: Checking… → Compressing… → Uploading… → **Loading products… %** → Saving…; the panel then says **152,115 products loaded for export**.
- [ ] Upload a small CSV after it: the products count changes to the small file's, and the old products are gone.
- [ ] A Pokémon day page's EXPORT is greyed out and says why.
- [ ] `node scripts/cc-report.mjs "D:\Users\Daisy\Downloads\playersuniongames-inventory-search-31.csv"` prints counts that agree with Appendix A.

### Phase E2: Sets and products: the matcher

**Build**
- `src/lib/ccMatch.js`: the set → category steps (7.3) with Appendix B's rules, and the product scoring (7.4). Pure functions, tested with fixtures covering every Section 3.4 example (Chrome Host Seedshark's four products, Fabricate (2090) and its Rainbow Foil, Aggro Amalgam - Voracious Hydra, Deadly Rollick - Showcase, Sinkhole in `Unlimited`, a prerelease promo, a promo pack card, a double-faced card).
- Scryfall facts by `scryfall_id` (`/cards/collection`, batched, cached 7 days) and `/sets` for set types and parents.
- Migrations: `cc_set_map`, `cc_product_links`, `cc_candidates`, the save and forget functions.
- **A dry run:** "Check Crystal Commerce matches" in a Magic day page's ⋯ menu opens the export dialog's Matching and Review steps (8.3) **without exporting**. Choices made here are saved (links, set maps). This is how the owner tests the matcher before the export exists.
- `scripts/cc-report.mjs` gains a second mode: given the inventory and a list of printings (a small JSON the owner can make), print how each would match.

**Where to look**
- [ ] On a Magic day with a few buys, ⋯ → Check Crystal Commerce matches: most cards land in **Matched**, each showing the exact CC name and category.
- [ ] A Secret Lair card from dev's buys (Fabricate #2090) offers `Fabricate (2090)` (non-foil); a foil one offers `Fabricate (2090) - Rainbow Foil`.
- [ ] A card in a set CC names differently (Avatar Eternal, the Turtles set) finds its category; one with no category at all offers its candidates from every category and an "Always use … for …" box.
- [ ] Pick a product in Needs a choice, close, run the check again: that card is now in Matched.
- [ ] "None of these" moves a card to Can't upload in the dialog (nothing is saved for it).

### Phase E3: Exporting a day

**Build**
- Migration: the `buy_lines` export columns (6.4), `export_lines` for days, `export_undo_day`.
- The full dialog (8.3) with the Confirm step and its red pull-out list and required checkbox.
- The Mass Create file (Section 4) from stamped lines, downloaded; re-download on a Completed day.
- **The Custom SKU** (Section 4.4): `customSkuFor(date)` with tests, the `cc_custom_sku` stamp, and the header chip.
- **The Sell Price** (Section 5): `roundUpPrice` and `src/lib/sellPrice.js` (pure: a line plus today's data → the Sell Price and its basis), with tests for every row of 5.2 and 5.3; the `prices` function's `fresh` option, deployed to dev; the stamps; sell prices shown in place of buy prices on exported rows.
- The **Can't upload** chip on day rows (10).
- Changelog: `day_exported` / `day_unexported` with the counts.
- *The Can't upload collection arrives in E4; until then can't-upload lines are stamped and chipped but not copied anywhere. Don't do real uploads with E3's file until the test upload (Appendix D #1) has worked.*

**Where to look**
- [ ] Export a past Magic day: the file downloads; open it in a text editor. The header is `Add Qty,Product Name,Category,Condition,Language,Sell Price,Custom SKU`; names and categories are exactly the inventory's; conditions read `Near Mint`, `Light Play`…; same-product rows are merged.
- [ ] Set one card to "None of these": the red pull-out list appears and Export waits for the checkbox; afterwards that card is not in the file, and its row on the day page has a **Can't upload** chip.
- [ ] Sell Prices in the file: a $1.01 card reads `1.25`, a $0.12 card `0.40`, a $10.01 card `11.00`; a manual-priced card shows the higher of its manual price and today's price, rounded up.
- [ ] After the export the day page shows each card's Sell price ("Sell" on the price, the buy price in its tooltip).
- [ ] Every row's last column is the export's code (06/17/26 would be `61726`, 11/01/26 `110126`), and the day page's header shows the **Custom SKU** chip with the same number.
- [ ] The exported day's panels show Market / Cash / Credit from the Sell Prices; the **Paid** chip still shows what was paid. Mark Paid/Ours again, and the buy totals come back.
- [ ] EXPORT on the now-Completed day downloads the same file again (same prices), and nothing else changes.
- [ ] ⋯ → Mark Paid/Ours again: the chips go, and the buys are Paid/Ours.

### Phase E4: The Can't upload cards collection

**Build**
- Migration: `buys.system_key`, the relaxed name/phone constraint, the collection itself; refusals (`system_collection`) in `collection_update_info`, `collection_set_status`, `collection_delete`, `collection_add_line`, `collection_update_line`.
- `export_lines` copies can't-upload lines into it (9.2); `export_undo_day` takes them back out (9.4).
- Its screen (9.1): fixed name and note, no status controls, no Delete, search and ADD CARD disabled, cards removable, each copy showing where it came from.
- Collections table: pinned first with the System chip (9.5).
- Its EXPORT (9.3): the warning, the dialog without the pull-out list, matched cards exported and removed, their originals restamped `exported`.
- Changelog: `cant_upload_added`, `cant_upload_exported`, `cant_upload_returned`.

**Where to look**
- [ ] The Collections table's first row is **Can't upload cards** with a System chip, whatever the sort.
- [ ] Its screen: no rename, no status changes, no Delete; the note can't be edited; the search bar says cards arrive from exports.
- [ ] Export a day with a "None of these" card: the card is in Can't upload cards (marked "from Buy N · date"), and still on its day page with the chip.
- [ ] Remove a card from Can't upload cards: it goes, as in any Paid/Ours collection.
- [ ] Mark that day Paid/Ours again: the copies leave Can't upload cards.
- [ ] Export from Can't upload cards: the warning first; a card you now pick a product for leaves the collection and its day row loses the chip; the others stay.
- [ ] The header search finds a card in Can't upload cards.

### Phase E5: Exporting collections, and the matching panel

**Build**
- Collection EXPORT (8.2): Paid/Ours → the export, then **Completed**; Completed → re-download; Processing / Priced → blocked. Pokémon lines ignored (8.5). Reopen takes its copies back out of Can't upload cards.
- On an exported collection: the **Custom SKU** chip in its details panel's header bar (4.4), Sell prices on its cards, and its sidebar totals from them (5.5).
- The **Crystal Commerce matching** panel in Settings (11.2).
- Replace `DESIGN_SPEC.md` Section 14 with a pointer to this document, and add the export's decisions to its log.

**Where to look**
- [ ] A Paid/Ours collection with Magic and Pokémon cards: EXPORT matches only the Magic ones; afterwards the collection is Completed and the file has no Pokémon.
- [ ] That collection's screen shows the **Custom SKU** chip, Sell prices on its Magic cards, and totals from them.
- [ ] A Priced collection: EXPORT says to mark it Paid/Ours first.
- [ ] A collection with only Pokémon cards: it becomes Completed and "No Magic cards to export." shows.
- [ ] Settings → Crystal Commerce matching lists the set choices and remembered products; Forget one, and the next dry run asks about that card again.

---

## Appendix A: The inventory's names, measured (2026-09-30)

From `playersuniongames-inventory-search-31.csv`, 152,115 products. Suffixes split on ` - ` after collapsing double spaces.

**Suffixes per name:** none 69,957 · one 64,007 · two 17,647 · three 503 · four 1.

**Shapes** (FOIL = a foil kind, V = any other suffix):

| Shape | Count |
|---|---|
| (none) | 69,957 |
| FOIL | 45,167 |
| V | 18,840 |
| FOIL - V | 16,679 |
| V - V | 489 |
| V - FOIL | 477 |
| FOIL - V - V | 258 |
| V - FOIL - V | 235 |
| V - V - FOIL | 7 |

**Most common suffix sequences:** `Foil` 41,074 · `Foil - Prerelease Promo` 3,733 · `Extended Art` 3,605 · `Foil - Extended Art` 3,008 · `The List` 2,931 · `Foil - Promo Pack` 2,480 · `Promo Pack` 2,406 · `Foil - Borderless` 2,167 · `Borderless` 2,137 · `Surge Foil` 1,752 · `Foil - Showcase` 1,393 · `Showcase` 1,341 · `Gold-Stamped Signature` 1,179 · `Retro Frame` 980 · `Foil Etched` 921 · `Foil - Retro Frame` 733 · `Rainbow Foil` 580 · `Surge Foil - Extended Art` 407 · `Showcase Scrolls` 350 · `Foil - Showcase Scrolls` 349 · `Ripple Foil` 336 · `Modern Frame` 297 · `Galaxy Foil` 224 · `Planeswalker Deck Exclusive` 167 · `Japanese Alternate Art` 166 · `Surge Foil - Borderless` 143 · `Theme Deck Exclusive` 139 · `Foil DCI Judge Promo` 128 · `Halo Foil` 125 · `Future Frame` 121 · `White Border` 120 · `Foil - Future Frame` 116 · `Foil Prerelease Promo` 107 · `Galaxy Foil - Borderless` 105 · `Foil Etched - Retro Frame` 104 · `Surge Foil - Showcase` 101.

**Foil kinds:** `Foil` 57,153 · `Surge Foil` 2,469 · `Foil Etched` 1,152 · `Rainbow Foil` 741 · `Ripple Foil` 385 · `Galaxy Foil` 371 · `Halo Foil` 135 · `Textured Foil` 98 · `Fracture Foil` 90 · `Mana Foil` 60 · `Gilded Foil` 48 · `Raised Foil` 42 · `Confetti Foil` 38 · `Gateway Foil` 9 · `Silver Foil Etched` 5; plus multi-word kinds seen in the minority shapes: `First-Place Foil`, `Step-and-Compleat Foil`, `Silver Scroll Foil`, `Chocobo Track Foil`, `Oil Slick Raised Foil`, `WPN Foil`. 1,248 distinct suffix words in all.

**Variant-first exceptions** (`V - FOIL`, 477): `Showcase - Galaxy Foil` 30, `Thick Stock - Foil Etched` 24, `Borderless - Galaxy Foil` 12, `Borderless - Surge Foil` 6; 239 of the 477 are in `Secret Lair Drop Series`, 42 in `Unfinity`.

**Two variants** (`FOIL - V - V`): `Foil - Retro Schematic - Serialized` 63, `Foil - Showcase - Japanese` 26, `Foil - Display Commander - Thick Stock` 25, `Fracture Foil - Showcase - Japanese` 20.

**Bracketed collector numbers:** 9,226 names; `Secret Lair Drop Series` 1,555, `Edge of Eternities: Stellar Sights` 270, `Final Fantasy` 183, `March of the Machine` 169, `The Lost Caverns of Ixalan` 164.

**Where promo words live:** `Prerelease Promo` → `Pre-Release Promos` 3,358 and per-set `Prerelease Promo: <set>` (Final Fantasy 106; Tarkir: Dragonstorm, Edge of Eternities, Avatar: The Last Airbender 80 each). `Promo Pack` → 27 `Promo Pack: <set>` categories. `The List` → `The List` (3,024). `Japanese Alternate Art` → `Strixhaven: Mystical Archives`, `Secrets of Strixhaven: Mystical Archive`, `War of the Spark - Japanese Alternate Art`.

## Appendix B: Category rules (starting set)

Tried in order after staff's choices and promo kinds (Section 7.3). Each rule's answer must exist in `cc_products`. Grow this table as the review finds new ones; a rule is better than many staff choices.

| Scryfall | CC Category | Example |
|---|---|---|
| Same name, folded | the same | `Throne of Eldraine` |
| `<set> Commander` (set type `commander`) | `Commander: <set>` | `Duskmourn: House of Horror Commander` → `Commander: Duskmourn: House of Horror` |
| `Commander: <universe>` for Universes Beyond commander decks | `Commander: Universes Beyond: <universe>`, else `Commander: <universe>` | `Doctor Who` → `Commander: Universes Beyond: Doctor Who` |
| Universes Beyond main sets | `Universes Beyond: <set>`, else the same name | `Fallout` → `Universes Beyond: Fallout` |
| `<set> Eternal` | `<set>: Eternal-Legal`, else `<set> Eternal-Legal` | `Avatar: The Last Airbender Eternal` → `Avatar: The Last Airbender: Eternal-Legal`; `Teenage Mutant Ninja Turtles Eternal` → `Teenage Mutant Ninja Turtles Eternal-Legal` |
| `Secret Lair Drop` (`sld`) | `Secret Lair Drop Series` | |
| `The List` (`plst`) | `The List` | |
| `Limited Edition Alpha` / `Beta`, `Unlimited Edition` | `Alpha`, `Beta`, `Unlimited` | |
| `Classic Sixth Edition` | `Sixth Edition` | |
| `Ravnica: City of Guilds` | `Ravnica` | |
| `Conspiracy: Take the Crown` | `Conspiracy 2: Take the Crown` | (as built, E2) |
| `Game Night` (`gnt`) | `Game Night 2018` | (as built, E2) |
| A Commander deck set with a parent (`parent_set_code`) | `Commander: <main set name>` first | `New Capenna Commander` → `Commander: Streets of New Capenna` (as built, E2) |
| Promo type `prerelease` | `Prerelease Promo: <set>`, else `Pre-Release Promos` | |
| Promo type `promopack` | `Promo Pack: <set>` | `Promo Pack: Core Set 2020` |

Categories with no rule yet (from Section 3.3's 138 unmatched): `Mystery Booster`, `Unique & Misc. Promos`, `Strixhaven: Mystical Archives`, `Conspiracy 2: Take the Crown`, `Commander Anthology Vol. II`, `March of the Machine: Multiverse Legends`, `The Brothers' War: Retro Frame Artifacts`, `Duel Deck Anthology`, `Timeshifted`, `FNM Promos`… The review (7.3 step 5) and the dry run (E2) will show which matter.

## Appendix C: Decisions log

| # | Topic | Decision |
|---|---|---|
| E1 | What EXPORT makes | A CSV for CC's **Mass Create**, in **"Only Update Products"** mode (owner, 2026-09-30) |
| E2 | Columns | `Add Qty, Product Name, Category, Condition, Language, Sell Price` as in the owner's sample, plus **`Custom SKU` as the last column** (its date comes later) |
| E3 | Quantity | **Add Qty**, adding to stock |
| E4 | Wording | Conditions and language exactly as CC's help page: Near Mint, Light Play, Moderate Play, Heavy Play, Damaged; English |
| E5 | Language | Always English; the store doesn't buy Japanese Magic |
| E6 | Games | **Magic only.** Pokémon EXPORT greyed out on the Calendar side; maybe later, maybe another function |
| E7 | Matching | Our Scryfall data is matched to the store's own CC inventory: sets to categories, and finishes and treatments to CC's suffixes in CC's exact order; **names always copied from the inventory** |
| E8 | Several candidates | Staff pick in a review before the file; the choice is remembered |
| E9 | No match | **Can't upload:** flagged very clearly, staff must pull the card from the physical batch (a required checkbox), the file is made without it, its row gets a **Can't upload** chip on its day page |
| E10 | Can't upload cards collection | Permanent, can't be renamed or deleted, always Paid/Ours, no phone, a fixed note; cards copied in during exports and removable as normal; its own EXPORT warns it's unlikely to work; cards that export leave it, the rest stay |
| E11 | Where a can't-upload card lives | **Both:** it stays on its buy (with the chip) and a copy goes into Can't upload cards |
| E12 | Undo | Marking a day Paid/Ours again (or reopening a collection) takes its cards back out of Can't upload cards |
| E13 | Collections | Exporting a collection marks it **Completed**; its Pokémon cards are ignored entirely, as if they weren't there |
| E14 | Record of cards exported from Can't upload | The changelog only |
| E15 | Sell Price | Today's full market price for the card's condition, worked out the same way as at the buy (same source and override, fetched fresh), **rounded up** by the buy steps, **never below $0.40**; a manual price gets the higher of it and today's price, rounded (owner, 2026-10-01) |
| E16 | Prices after export | The app shows each exported card's Sell Price in place of its buy price (owner, 2026-10-01) |
| E17 | Custom SKU | A number-only code from **the export's date**: month without a leading zero, day always two digits, two-digit year (`61726` for 06/17/26, `110126` for 11/01/26), on every row; shown in a clearly labelled chip on an exported day page's header and an exported collection's screen (owner, 2026-10-01) |
| E18 | Sell Price details | A fallback-priced card gets JustTCG's price if it has one today; a manual price with nothing to compare is used alone (rounded up, floored); if today's prices can't be fetched, nothing is exported (owner, 2026-10-01) |
| E19 | Totals after export | Market / Cash / Credit totals follow the Sell Prices; the price paid stays the record of the deal (owner, 2026-10-01) |
| E20 | Build choices (2026-10-01) | Made during the unattended build so it could go on, each waiting for the owner in `docs/EXPORT_BUILD_REPORT.md` → Needs your answer: the older live build's EXPORT keeps working (no file, no stamps); a day where nothing matched still becomes Completed; a collection can still be marked Completed by hand; links and set choices stay out of backups; a later export from Can't upload cards restamps the original row (a day's re-download then includes it); automatic picks need a 2-point lead; "fresh" prices are at most 15 minutes old |
| E21 | Picks in the export dialog | Saved with the export, not as they're made: Cancel saves nothing (the dry run still saves as it goes) (build, 2026-10-01) |
| E22 | Product names and categories | Copied from the inventory on the server when the export is saved, never from the browser (build, 2026-10-01) |
| E23 | A Sell Price by hand (owner, 2026-10-01) | In the export dialog's Needs a choice (and after **Change**), an optional **Sell price** box sets that card's Sell Price by hand: at least $0.40, used as typed (not rounded), shown as "set by hand", and recorded in its basis (`used: 'staff'`, with the worked-out price). **Change** opens the card in place in Matched with its product still selected (the app's own match marked "detected"), as a draft with **Cancel** and **Done** (nothing applies until Done; Cancel leaves the card as it was): typing a price changes nothing else, only picking a different product makes it staff's pick (remembered as `staff`), and picking the detected one again undoes that. Cards matched from a remembered product list their other candidates there too. A collection's Custom SKU chip sits on its own line under the details' header bar |

## Appendix D: Open items

1. **A test upload** of a small E3 file in CC before the first real batch: one or two cards the store has in stock, through Mass Create in "Only Update Products" mode, to confirm CC accepts the columns (above all **Custom SKU**, which the owner's sample didn't have), the condition words and the Sell Prices, and that **Add Qty adds**. It changes real stock and prices, so use cards whose quantity and price are easy to set back by hand in CC.
2. **Pokémon:** none of this applies yet (owner, 2026-09-30).
