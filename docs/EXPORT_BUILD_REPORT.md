# Export build report

The export function (`docs/EXPORT_FUNCTION.md`, Phases E1–E5), built in one run on 2026-10-01 at the owner's request, without stopping between phases for QA. Everything is committed locally and **not pushed**. Migrations went to the **dev** database only. The rollback point before the build is the local tag `pre-export-build` (and the copy in `C:\ClaudeProjects\pug-pricing-tool-backups\backup-20261001-011023-pre-export-build`).

## Needs your answer

*(Most important first. Each says what was chosen so the build could go on.)*

1. **Remembered matches and set choices aren't in backup files yet.** Adding them changes the backup format, and older backup files would then fail the restore check. Should they be backed up (a format version 2 that still restores version 1)?
2. **Matching thresholds.** A product is picked automatically when it's the only one that fits, or leads the next by 2 points or more. On the real inventory that matched all 26 of dev's printings and 190 of 200 random ones, with no wrong picks seen in the samples. If a wrong automatic pick ever shows up, the fix is a bigger lead or a new rule.
3. **The older live site and the inventory.** The live GitHub Pages build (v0.9.1-final) still uploads inventories the old way, without loading products for the export. If someone uploads from the live site, Settings will say "Products not loaded for export: upload it again" until it's uploaded from the new build.

## Owner tasks

- **Upload the real inventory** (`playersuniongames-inventory-search-31.csv`) in Settings from the local app, so its 152,115 products load for matching (Phase E1).

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
