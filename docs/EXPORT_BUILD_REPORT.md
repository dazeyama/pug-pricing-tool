# Export build report

The export function (`docs/EXPORT_FUNCTION.md`, Phases E1–E5), built in one run on 2026-10-01 at the owner's request, without stopping between phases for QA. Everything is committed locally and **not pushed**. Migrations went to the **dev** database only. The rollback point before the build is the local tag `pre-export-build` (and the copy in `C:\ClaudeProjects\pug-pricing-tool-backups\backup-20261001-011023-pre-export-build`).

## Needs your answer

*(Most important first. Each says what was chosen so the build could go on.)*

1. **Remembered matches and set choices aren't in backup files yet.** Adding them changes the backup format, and older backup files would then fail the restore check. Should they be backed up (a format version 2 that still restores version 1)?
2. **Matching thresholds.** A product is picked automatically when it's the only one that fits, or leads the next by 2 points or more. On the real inventory that matched all 26 of dev's printings and 190 of 200 random ones, with no wrong picks seen in the samples. If a wrong automatic pick ever shows up, the fix is a bigger lead or a new rule.
3. **The older live site's EXPORT.** The live build (v0.9.1-final) still has the old EXPORT, which marks a day Completed without a file. Kept working for compatibility; a day it marks has no export stamps, and the new build's EXPORT on it says to mark the day Paid/Ours again and export. Should the old EXPORT be refused from now on instead?
4. **How fresh "fresh" is.** The export's Sell Prices accept JustTCG prices fetched in the last 15 minutes (not 6 hours), so a Back-and-export-again or a retry doesn't spend another request. Say if it should always fetch.
5. **A day where nothing matched** (every card Can't upload): it still becomes Completed, with no file. Say if it should stay Paid/Ours instead.
6. **Can't upload cards and the live site.** The live build (v0.9.1-final) shows the new collection in its Collections table like any other (no System chip, a blank phone); editing it there is refused by the server with a plain error. Nothing breaks, but it looks rough until the new build goes live.
7. **Mark as Completed by hand.** A Paid/Ours collection can still be marked Completed from its status controls without exporting (kept, since cards sometimes move on another way). EXPORT on it then says to reopen and export. Should Completed only come from EXPORT now?
8. **Searching remembered products** in Settings is by CC's product name (the remembered links don't store Scryfall's card name). Fine for finding a card, but a two-faced card is found by CC's spelling of it.
9. **The older live site and the inventory.** The live GitHub Pages build (v0.9.1-final) still uploads inventories the old way, without loading products for the export. If someone uploads from the live site, Settings will say "Products not loaded for export: upload it again" until it's uploaded from the new build.

## Owner tasks

- **Upload the real inventory** (`playersuniongames-inventory-search-31.csv`) in Settings from the local app, so its 152,115 products load for matching (Phase E1). Dev has no products loaded yet: the check and the export both say to upload it first.
- **A test upload in Crystal Commerce** before the first real batch (spec Appendix D #1): export a day with one or two cards whose stock and price are easy to put back by hand, run the file through Mass Create in "Only Update Products" mode, and check CC took the Custom SKU column, the condition words and the Sell Prices, and that Add Qty added.

## Phase E5: Exporting collections, and the matching panel

**Built**
- Migration **0029** (applied to dev after a rolled-back test with a made-up collection of dev's September 30 Magic cards plus a Pokémon card): `export_lines` for collections (Paid/Ours only, the editing lock, Magic only, then **Completed**; only Pokémon → Completed with no file) and `collection_set_status` undoing the export when a collection leaves Completed.
- **The collection screen:** EXPORT exports (Paid/Ours), downloads the same file again (Completed) or says "Mark it Paid/Ours first" (Processing / Priced); the **Custom SKU** chip in the details' header bar; **SELL** prices in the sidebar, with the totals following; the Reopen dialog explains the undo.
- **Settings → Crystal Commerce matching:** set choices and remembered products, each with Forget.
- `DESIGN_SPEC.md` Section 14 is now a pointer to the export spec, and decisions 173–180 record the export.
- The old "EXPORT COMING SOON" placeholder is gone.

**Checks:** build OK · 109 tests pass · lint clean · migration tested in a rolled-back transaction, then applied.

**Where to look**
- [ ] A Paid/Ours collection with Magic and Pokémon cards: EXPORT matches only the Magic ones; afterwards it's Completed and the file has no Pokémon.
- [ ] That collection's screen: the **Custom SKU** chip in the details' header bar, **SELL** prices on its Magic cards, totals from them; the Paid figure unchanged.
- [ ] EXPORT on it again downloads the same file.
- [ ] Reopen it: the chip and the Sell prices go; a can't-upload card's copy leaves Can't upload cards.
- [ ] A Priced collection: EXPORT says to mark it Paid/Ours first.
- [ ] A collection with only Pokémon cards: EXPORT asks, then it's Completed and "No Magic cards to export" shows.
- [ ] Settings → **Crystal Commerce matching** lists set choices and remembered products; Forget one, and the next dry run asks about that card again.

## Phase E4: The Can't upload cards collection

**Built**
- Migration **0028** (applied to dev after a rolled-back test): `buys.system_key`, the collection itself (always Paid/Ours, no phone, the fixed note), `buy_lines.source_note`, the `system_collection` refusals (rename, details, rates, status, delete, adding or editing cards; removing stays allowed), copies made by the day export and taken back by its undo, and exporting from the collection itself.
- **Collections table:** Can't upload cards is always the first row, with a red **System** chip.
- **Its screen:** fixed name and note, no status controls, no Delete, the search bar off ("Cards arrive here from exports"), cards removable with ×, each copy showing where it came from.
- **Its EXPORT:** a warning first ("unlikely to work, unless…" → Try anyway), then the export dialog without the pull-out list; matched cards are exported and leave, their original rows lose the chip; the rest stay.
- **Changelog:** "Cards can't upload", "Exported from Can't upload", "Cards returned" (in Collections).
- **Restore:** a backup from before this phase gets the collection made again after the restore.

**Checks:** build OK · 109 tests pass · lint clean · migration tested in a rolled-back transaction, then applied.

**Where to look**
- [ ] The Collections table's first row is **Can't upload cards** with a System chip, whatever the sort or status filter.
- [ ] Its screen: no rename, no status changes, no ⋯ / Delete; the note can't be edited; the search bar says cards arrive from exports.
- [ ] Export a day with a "None of these" card: the card appears in Can't upload cards ("from Buy N · date"), and stays on its day page with the chip.
- [ ] Remove a card from Can't upload cards with its ×: it goes, as in any Paid/Ours collection.
- [ ] Mark that day Paid/Ours again: the copies leave Can't upload cards.
- [ ] EXPORT on Can't upload cards: the warning first; pick a product for a card, Export: the file downloads, the card leaves the collection, and its day row loses the chip. Cards set to "None of these" stay.
- [ ] The header search finds a card in Can't upload cards, under Collections.
- [ ] The changelog (Collections) shows "Cards can't upload", "Exported from Can't upload" and "Cards returned".

## Phase E3: Exporting a day

**Built**
- Migration **0027** (applied to dev after a rolled-back test against dev's September 30 buys): the `buy_lines` export stamps, `export_lines` (one transaction: checks, stamps, Completed, links, set choices, changelog), `export_undo_day`, `cc_custom_sku`, `cc_condition_word`; `day_mark` kept for the live build, its undo now clearing stamps too.
- The `prices` Edge Function's **`fresh`** option, **deployed to dev**.
- **Sell Prices** (`sellPrice.js`, `roundUpPrice`): today's JustTCG prices fetched fresh, Scryfall's from the matching, Cardmarket × today's euro rate; tests for every row of spec 5.2 and 5.3. The export stops if prices can't be fetched.
- **The dialog's export mode:** Matching → "Fetching today's prices (1 JustTCG request)…" → Review with "Bought $1.00 → Sell $1.25" → **Continue** → Confirm (the file's card and row count and Custom SKU, the red **pull-out list** with its required checkbox) → **Export** saves and downloads `cc-mass-create-magic-<day>.csv`.
- **The day page:** EXPORT opens the export; on a Completed day it downloads the same file again from the stamps; ⋯ → Mark Paid/Ours again uses `export_undo_day`; Sell prices on exported rows with the totals following; the **Can't upload** chip; the **Custom SKU** chip in the header; counts in the exported note.

**Checks:** build OK · 109 tests pass · lint clean · migration tested in a rolled-back transaction, then applied.

**Where to look** (needs the real inventory uploaded first)
- [ ] Export a past Magic day: Matching, then today's prices, then Review shows "Bought → Sell" on each matched card. Continue → Export: the file downloads.
- [ ] Open the file in a text editor: the header is `Add Qty,Product Name,Category,Condition,Language,Sell Price,Custom SKU`; names and categories exactly as in the inventory; conditions `Near Mint`, `Light Play`…; same-product rows merged; the last column today's code (`100126` on October 1).
- [ ] Set one card to "None of these": the red **pull-out list** appears and Export waits for the checkbox; afterwards that card isn't in the file and its row has the **Can't upload** chip.
- [ ] Sell Prices: a $1.01 card reads `1.25`, a $0.12 card `0.40`, a $10.01 card `11.00`; a manual-priced card the higher of its manual price and today's, rounded up.
- [ ] After the export the rows show **SELL** prices (the buy price in the tooltip), the first total reads **Sell**, the **Paid** chip is unchanged, and the header has the **Custom SKU** chip.
- [ ] EXPORT again on the Completed day downloads the same file; nothing else changes.
- [ ] ⋯ → Mark Paid/Ours again: the chips go, the buy prices come back, and the buys are Paid/Ours.
- [ ] The changelog shows "Day exported" with the counts and the Custom SKU, and "Export undone".

## Phase E2: Sets and products, the matcher

**Built**
- `src/lib/ccMatch.js` (pure, 7 tests): set → category (staff choices, promo kinds, same name, rules) and the product within it (the expected name in CC's order, then evidence scoring). Evidence comes mostly from each line's saved treatments; Scryfall only adds flavor names.
- Migration **0026** (applied to dev): `cc_set_map`, `cc_product_links`, and the reads `cc_categories`, `cc_candidates`, `cc_products_by_id`, `cc_products_search`.
- `src/lib/ccExport.js`: the matching run (Scryfall cards by id, one call for every candidate), saving picks and set choices, product search.
- **The dry run:** a Magic day page's **⋯ → Check Crystal Commerce matches** opens the review (Needs a choice / Matched / Can't upload) without exporting; picks are remembered.
- `scripts/cc-report.mjs` second mode: how a list of printings would match.
- Tested on the real inventory: **26 of 26** dev printings and **190 of 200** random printings matched automatically; the rest are explained in the spec (7.5a). Rules added from that: Commander decks under their main set's full name, two renames, flip cards by their front name.

**Checks:** build OK · 109 tests pass · lint clean.

**Where to look**
- [ ] On a Magic day with a few buys, ⋯ → **Check Crystal Commerce matches**: most cards land in **Matched**, each showing the exact CC name and category.
- [ ] A Secret Lair card (Fabricate #2090) matches `Fabricate (2090)`; a foil one would match `Fabricate (2090) - Rainbow Foil`.
- [ ] A card in a set CC names differently (the Avatar or Turtles sets) finds its category.
- [ ] **Change** on a matched card moves it to Needs a choice; pick a product, close, run the check again: it's matched, marked "remembered".
- [ ] "None of these" moves a card to Can't upload in the dialog (nothing is saved for it).

## Phase E1: The inventory, ready to match

**Built**
- `src/lib/ccNames.js`: the Product Name parser (`Name (bracket) - Foil kind - Variants`), and `productRow` for each CSV row; 6 tests from hand-made names.
- Migration **0025** (applied to dev): `cc_products`, `master_inventory_start` / `cc_products_load` / `master_inventory_finish` / `master_inventory_abort`, `master_inventory_files.products_loaded`, and `day_mark` refusing Pokémon exports (`pokemon_export_unavailable`; putting a Pokémon day back still works). Tested in a rolled-back transaction first.
- The upload's new **Loading products… %** step, the "N products loaded for export" line in Settings, the required-columns check, and clean-up if loading fails.
- **Pokémon EXPORT** greyed out on Pokémon day pages ("Pokémon export isn't available yet").
- `scripts/cc-report.mjs`: run on the real inventory, it agreed with the spec's Appendix A.

**Checks:** build OK · 95 tests pass · lint clean.

**Where to look**
- [ ] Settings → upload the real inventory: Checking… → Compressing… → Uploading… → **Loading products… %** → Saving…; the panel then says **152,115 products loaded for export**.
- [ ] Upload a small CSV (it needs Product ID, Product Name and Category columns): the products count changes to the small file's, and the old products are gone.
- [ ] A Pokémon day page's EXPORT is greyed out and says why.
- [ ] `node scripts/cc-report.mjs "D:\Users\Daisy\Downloads\playersuniongames-inventory-search-31.csv"` prints counts that agree with Appendix A.
