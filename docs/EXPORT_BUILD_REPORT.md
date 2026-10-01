# Export build report

The export function (`docs/EXPORT_FUNCTION.md`, Phases E1–E5), built in one run on 2026-10-01 at the owner's request, without stopping between phases for QA. Everything is committed locally and **not pushed**. Migrations went to the **dev** database only. The rollback point before the build is the local tag `pre-export-build` (and the copy in `C:\ClaudeProjects\pug-pricing-tool-backups\backup-20261001-011023-pre-export-build`).

## Needs your answer

*(Most important first. Each says what was chosen so the build could go on.)*

1. **The older live site and the inventory.** The live GitHub Pages build (v0.9.1-final) still uploads inventories the old way, without loading products for the export. If someone uploads from the live site, Settings will say "Products not loaded for export: upload it again" until it's uploaded from the new build.

## Owner tasks

- **Upload the real inventory** (`playersuniongames-inventory-search-31.csv`) in Settings from the local app, so its 152,115 products load for matching (Phase E1).

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
