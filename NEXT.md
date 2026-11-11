# NEXT

What's open, newest first. Claude reads this at the start of every session and tells the owner what's open, then
marks each task done here when it's finished, with the exact file and function of anything left. Older history:
`git log -p NEXT.md`, the spec's numbered decisions and `git tag`.

## Open

- **Dev is ahead of prod: migration 0015 is on dev only** (Buy tab session, 2026-11-10; decision 578): the prod push
  waits for the owner's word (`npx supabase db push --linked --project-ref zvxquzcfffmxwizonxuo`, then the
  structure-only compare against `C:/Users/Daisy/AppData/Local/Temp/claude/8622948e51b61e0c/024d6d6e-fc86-4763-9a1b-3034e8336749/scratchpad/dev-run-0015.json`
  or a fresh dev run). The owner agreed to 578's narrowing (2026-11-10), so 0015 goes as it is.

- **Dev is ahead of prod: migration 0016 is on dev only** (Records session, 2026-11-10; decision 580, the three-part
  patch's one migration): it goes to prod with 0015 in one sitting, on the owner's word only (`npx supabase db push
  --linked --project-ref zvxquzcfffmxwizonxuo` takes both, then the structure-only compare against
  `C:/ClaudeProjects/temp/pug-dbrun-0016.json`, the dev run with 0015 and 0016). **The site can't be pushed before
  prod has 0016:** `main` already reads its columns and tables (the Collections tab's list selects
  `buys.cash_location`, Settings reads `stale_files`), so those break on a site without it.

- **Unpushed** (main session; everything since 94ccd17, none of it on prod or the live site): one TCGplayer
  product is one line (decision 578, migration 0015); the three-part patch, all three sessions' parts committed
  2026-11-10: 🖨 Print a walk-in in progress (579), the cash location, who paid and Copy for the buys sheet (580,
  583), the stale cards file, the stale cut and stale in Copies we own (580, 581, 582), on migration 0016; and
  the owner's first QA round on it and Home's cash from the Till (584); NEXT.md's Buy 82 look and the designs. The
  owner has tried parts on dev; the QA round's fixes are untested. Both migrations are on dev only: prod first,
  then the site (the two items above).

- **The three-part patch: the owner's first QA round, given out 2026-11-10** (main session; each session marks
  its own done in its Done entry):
  - *Buy tab:* "backroom needs to be a darker green color when selected" (`CashLocation.jsx`); BUY COMPLETE's
    button renamed with the menus' (the main session's reading of the rename as the button's name everywhere).
  - *Records:* "the copy button needs to be 1 higher on the list so it doesn't get in the way, also rename the
    button from "Copy" to "Copy Details"" (a buy's ⋯: above Print ▸; the paid overnight row's too); "On the "Stale
    cut" panel, display a button "View Stale Cards" button, that displays a scrollable subpanel list of all the
    cards marked stale."; and the sell-price floor's place in migration 0016 (amended in place, dev only).
    Then, the same day: "Also on the Home page. On the TODAY panel: … We now also need a "cash taken from the til
    today" stat, that's super important for closing." (`HomePage.jsx`, the Today card, from `cash_location`;
    asked whether it counts overnight buys paid from the Till today as well as walk-ins, the owner: "Yes, all
    Till cash").
  - *Export:* "The "Stale cards file" panel is too wordy and too long, it has a scrollbar by default, measure it
    better and size to fit, with less words. ALSO add a input for the sell price 35 mirroring the days, to make
    is so that files with different floors can be used."

- **The three-part patch: the plan, given out 2026-11-10 on the owner's "Yes, start"** (main session; the owner: "Shelve the
  sticker sheets for later, but I want to begin work on all 3 of these designs now at once. Let's make a plan of
  action AND I want that plan to include creating only a single combined migration for this 3 part patch."). The
  designs are items 1, 3 and 4 of the entry below. Records, Buy tab and Export each have their part by message.
  - **One migration, one writer:** the next number on disk (0016 while 0015 is the last), written by the Records
    session alone, holding the copy button's part (`buys`: the cash location and who paid; `confirm_buy` and
    `collection_set_status` take and keep them) and the stale cards' part (the uploaded file's products, its load,
    and stale in `owned_copies`' answer or beside it, the recent-export guard included). It must leave the live
    site working between the prod push and the site push: every new parameter has a default and the database
    doesn't refuse a cash buy with no location (the app requires it). `backup_columns` reads `buys`' columns by
    itself; the stale file isn't backed up, as the inventory isn't. On dev only it may be amended in place
    (decision 450), by Records alone, on a message from the session that needs the change.
  - **Step 1, the contract:** Records writes the names first (columns, each function's parameters and what it
    returns, the `stale_cards` setting's keys) as a short list in this entry, so Buy tab and Export build against
    it; then the migration, pug-reviewer, the rehearsal, dev, the snapshot, the test run (`docs/DATABASE.md`).
    **The contract** (Records session, 2026-11-10; the migration is 0016, on no project yet; a change goes to
    Records by message):
    - `buys.cash_location` text: `'till'`, `'backroom'` or null. A credit buy always has null: the database refuses
      a location unless `paid_method = 'cash'`. A cash buy with none is allowed (older buys, and the live site
      between the prod push and the site push); the app requires the pick. The copy row shows Till, Backroom, NA
      for credit, and an empty cell for a cash buy with none.
    - `buys.paid_by` uuid (→ `staff_users`): who took the payment. `confirm_buy` and `project_to_buy` set it to
      their `p_user`, and Mark Paid/Ours sets it to its own. Going back to Processing or Priced clears it and the
      location, along with the payment. Completed and its reopen keep both. Convert to overnight buy and Convert to
      project carry both onto what they make (added after the review).
    - `confirm_buy(…, p_cash_location text default null)`, `collection_set_status(…, p_cash_location text default
      null)` (read only when marking Paid/Ours from Processing or Priced) and `project_to_buy(…, p_cash_location
      text default null)`. Each takes `'till'` or `'backroom'`. On a credit payment it's stored null, whatever is
      sent. Anything else raises `bad_cash_location`. The other parameters and the answers are unchanged.
    - The stale file: `stale_files` (one row, the current upload: `original_filename`, `days`, `products`,
      `in_stock`, `uploaded_by`, `uploaded_at`, `min_price`) and `stale_products` (`product_id` key, `product_name`,
      `total_qty`, `sell_price`). Both are readable by the signed-in role, which can't write them.
      `stale_file_load(p_filename text, p_days integer, p_rows jsonb, p_user uuid, p_min_price numeric default 35)
      returns jsonb` `{uploaded_at, products, in_stock}` replaces the file whole, in one call:
      - `p_rows` is `[{product_id, product_name, total_qty, sell_price}]`, the CSV's Product ID, Product Name,
        Total Qty and Sell Price, up to 20,000 rows. `sell_price` is a number, and may be left out;
      - `p_days` is 1 to 3650, the window the file was made with (the upload panel's days box, 180 unless changed);
      - `p_min_price` is 0 to 9999, the search's sell price floor (its box, 35 unless changed), else
        `bad_min_price` (amended in 2026-11-10, the owner: "add a input for the sell price 35 mirroring the days");
      - a Changelog entry, action `stale_file_uploaded`, is under `p_user`. It ends "…, no sale in 180 days, $35 and
        up."
      The days and the floor live with the file, not in a setting: they describe that file.
    - `stale_cards() returns jsonb`: every stale card as `owned_copies` judges it (Total Qty over 0, past the
      recent-export guard), `[{product_id, product_name, category, total_qty, sell_price}]` by name, and `[]` with no
      file. Only products in the current inventory file are listed, as the Price screen marks a printing through
      the product it matched there; `category` comes from that file. This is for Settings → Stale cut → View Stale
      Cards.
    - `owned_copies` keeps its parameters. Its answer adds `stale_file`: null when no file is up, else `{days,
      uploaded_at}`. It also adds `stale_ids`: the product ids among the card's products, and `p_product_id`'s,
      that are stale. A product is stale when it's in the file with Total Qty over 0 and no line of ours with that
      `cc_product_id` was exported since `uploaded_at` − `days` (the recent-export guard). The printing is stale when
      `stale_ids` holds its matched product (`cc_match.product_id`), since the first call goes without one.
    - The setting `stale_cards`: `{"pct": 10}`, the stale cut in percent of the card's rate, 10 when the key isn't
      there and 0 for off. It's separate from the copies cut's "at most", and goes on top of it.
  - **Step 2, side by side:** *Export and printouts:* the in-progress walk-in printout whole (the sheet and its
    button on the Buy tab's list; no migration), and the stale file's upload panel in Settings with how to make
    the file and the days box (it's the inventory upload's twin). *Records:* the copy row's builder (one pure
    function, tested), Copy on a single buy's ⋯ and on a paid row of the overnight buys list, the cash location on
    Paid/Ours, and the stale multiplier's panel in Settings. *Buy tab:* the cash location on CONFIRM BUY and Copy
    on BUY COMPLETE (Records' builder), and stale in Copies we own: the emoji, the box's line, the change in the
    pill, Apply, Auto apply rates?, a phone's scans. *Phone scanner:* nothing, unless Buy tab finds a scan needs it.
  - **Step 3:** each session's decision row (its number from disk), TEST.md cases and Done entry; the main
    session's QA table; the owner's QA on dev; then, on the owner's word, 0015 and the new migration to prod in one
    sitting and the site after, with the review.
  - **To know going in:** a buy confirmed before this has no cash location and an overnight buy paid before it has
    no payer kept, so their copied rows leave those cells empty (the payer could be filled from the Changelog; not
    planned). One migration means the three parts reach prod together.

- **Home's Today card opens trends: designed with the owner, and given to Records to build 2026-11-10 ("Build the mockup for real, it's great.")**
  (main session, 2026-11-10; the owner: "I'd like to design a feature for clicking on the Today panel on the Home
  page to get a subpanel with a calendar and graphs of the trend of buy numbers over a week, etc. Let's design this
  and mark it as an open to start on once we're done here."). Not built, no decision row. What's there to build
  on: the Today card (`HomePage.jsx`: today's walk-ins, Paid out in cash and credit, and the Till stat of decision
  584), the Calendar tab's month grids (`CalendarPage.jsx`, `buys_in_range`), and no chart library among the
  dependencies. Proposed, unanswered: a panel over Home with a small calendar to pick the week and bar charts a
  day of buys, paid out (cash and credit), cash from the Till, and cards by game, with the week's totals beside
  the week before; drawn by the app itself rather than a new chart package. Asked: which numbers matter; one
  week only or other spans too; what the calendar is for; walk-ins only or overnight buys as well. **The owner's
  direction, which replaces that proposal:** "I want it modeled after the Square Sales Report page, I want you
  to be able to pick any range of dates and get a trend graph for cash and credit (separately) for that range.
  … Default range is last 7 days." Square's page, from its help centre (squareup.com/help, articles 5530 and
  5381; no screenshot seen): a date selector at the top with presets and a calendar for a custom range, a graph
  of the chosen metric over the range as a line or as bars, in hours, days, weeks or months, a comparison with
  the period before, a summary table under it, and print or export. Proposed from that, unanswered: the range
  picker with presets and any two dates, last 7 days to start; one graph with a cash line and a credit line (or
  two graphs), by day, by week on a long range; under it the range's totals (buys, cards, paid out, cash,
  credit, from the Till, from the Backroom) beside the period before; every paid buy by the day it was paid, as
  the Till stat counts; read by the app with no migration; and a chart package to ask about (Recharts, which
  would ship to the site, loaded only when the panel opens) against drawing the graph ourselves. Answered
  (2026-11-10): "2 lines on 1 graph"; and the package is a yes: "let's use the package, recharts sounds good.
  Grab this and use it to make me a mockup of what this panel could look like, using read only real data from
  last 14 days on prod." The mockup is a private page, https://claude.ai/artifact/9Ug6ybJnAtErRxafooX3H7 (Recharts
  2.12.7 from a CDN; 28 days of prod's daily totals by the day paid, one read-only SELECT, sums only; its source
  is outside the repo): presets and a custom range, a Line / Bars switch, cash and credit on one graph, the
  range's totals beside the same span before, a row a day. `recharts` isn't in `package.json` yet: it goes in
  with the build. Then the owner: "Add a way to optionally hide Mondays and Wednesdays from the graph (those are days
  we're closed on and create spikes always)": in the mockup as a tick box, Hide closed days (Mon, Wed), ticked as it
  opens; it leaves those days off the graph only, and the totals and the day rows still count them (the main
  session's reading; whether it starts ticked, and where the closed days are set, unasked). Then: "Build the mockup
  for real, it's great." Records builds it as the mockup has it, opening on the last 7 days and with a calendar for
  Custom, as the owner's words have them; the mockup's source is in the main session's scratchpad, outside the repo.
  Was: waiting on the owner's
  reaction to the mockup; the rest of the proposal is unconfirmed.

- **Four ideas from the owner, 2026-11-10: three designed and in the plan above, the sticker sheet shelved** (main session; nothing
  built; the designs, with the owner's answers quoted; the sticker sheet "for later", when the measurements come):
  1. **Print an in-progress walk-in buy:** "A way to print in-progress walk-in buys." (Buy tab; the printout
     itself is Export and printouts'.) Designed so far with the owner (2026-11-10), not built, no decision row
     yet: walk-ins only ("Feature for walk ins only"); for the customer as an offer sheet and for staff as a
     check sheet ("both of those situations are likely and should be supported"); each card shows what we'd pay
     ("Our rates. What we'd pay."), cash and credit; it carries the customer's name and a "Quote only, not a
     receipt" line ("Yes to both"). Proposed and unanswered: a Print button on the Buy tab's list, one row per
     line as added (count, name, set and number, finish, condition), the foot with the card count and the cash
     and credit offers as the screen has them, the title "Buy in progress, not confirmed" with the date and time
     (a buy has no number before CONFIRM BUY), the list's own prices (no price fetch, no Crystal Commerce
     matching), nothing saved or logged. Settled after: one button and one sheet for both uses, tick boxes and
     all ("Single button on layout, it's ok if it looks a little complex"); the name is a blank "Customer: ____"
     line to write on, since it's only typed at CONFIRM BUY ("Blank is good"); per-card amounts print as they
     are and the offer as the screen has it, with no subtotal or note about the rounding ("Don't worry or call
     attention to the rounding discrepancy"). Ready to build when the owner gives it out; the proposed parts above
     (the button's place, the rows, the title) were not objected to but not confirmed one by one.
  2. **The sticker sheet is still misaligned:** "Fixing the sticker sheet. It's still misaligned." (Export and
     printouts; `src/lib/stickerPdf.js`: `PRINTER_OFFSET` has been zero since decision 573, so what's off now is the
     grid as decision 281 set it, `SHEET`, or the printer's scaling. Worth knowing: only the pitch, 1 in x 1/2 in,
     came from a scan of the sheet; the grid's place, 0.29 in and 0.49 in, was fitted to test prints from the
     owner's own printer, so removing the offset didn't take that printer out of the numbers; and decision 281
     notes the far columns leaning 0.05 in right, which is scale, not offset. To start: which printer, printed at
     100%, which way and how far the stickers are off at the sheet's first and last stickers, and whether it's
     the same on every sheet.) **Waits for the owner's new measurements** (2026-11-10: "The sheet of stickers was
     measured all wrong and we need a new grid template once I get new measurements in."): then a new grid in
     `SHEET` (the page, columns and rows, a sticker's width and height, the first sticker's left and top edge from
     the page's edges, and the step from one sticker to the next each way, best taken across the whole row and
     column), `tests/stickerPdf.test.js` with it, and a decision row. The alignment setting proposed beside it
     (a test page and typed corrections in Settings) wasn't taken up; not built.
  3. **A copy button for record keeping:** "Adding a copy button to the buy confirmed pop up and single buy menus
     that copies the name and number information to the clipboard in a specific way to assist in record keeping.
     More details when we work on it." (Buy tab's `BuyDoneModal.jsx`; the single buy's menu is Records'.)
     Designed so far with the owner (2026-11-10), not built: it's for the store's Google Sheet of buys, so the
     fields are tab-separated and each lands in its own cell ("make them paste into unique cells"). One row, as
     the owner's example has it (customer details left out here): worker, date as 11/10/2026, customer name,
     phone as (555) 555-0100, an empty cell, Cash or Credit, worker again, date again, the amount paid as $90.00,
     and "a new attribute, 'cash location' that we need to create" (the example's reads "Till"). The cash
     location is new stored data: a column on `buys`, so a migration, a decision row and a place to pick it
     (CONFIRM BUY's dialog, and Paid/Ours for an overnight buy). Settled after: the fifth cell is the customer's
     ID number, "blank for all walk in buys though, so yes, make sure to account for it"; the first worker and
     date are who took the buy and when, the second who paid it and when ("exactly correct"; the database keeps
     `confirmed_by` and `paid_at`, but who paid an overnight buy is only in the Changelog, so that needs storing
     too); "the two locations are Till and Backroom, but there's also an NA used on credit buys logs"; and an
     overnight buy gets it too: "put it in the menu on the overnight buy selection page per line on paid ones"
     (the Collections tab's list, a paid row's ⋯). A cash buy must pick Till or Backroom before it's confirmed,
     and a credit buy copies NA by itself ("yes"); the fifth cell carries the ID's last four digits when the buy
     has them (`id_last4`), else it's blank ("use id if it exists"); the migration for the cash location and for
     who paid an overnight buy is accepted ("fair enough"). Ready to build when the owner gives it out.
  4. **A "stale card" tracker, to look into first:** "Investigating if there's a way to create a 'stale card'
     tracker for cards that haven't sold in a long time." (An investigation, not a build.) A first look
     (2026-11-10): the app has no sales data. It knows when each card was bought and exported (`buy_lines`:
     `cc_exported_at`, `cc_product_id`), and the current Crystal Commerce inventory file's products with their
     Total Qty (`cc_products`, `lib/owned.js`); an older file is pruned when a new one goes up
     (`master_inventory_prune`), so no count is kept over time. Ways in, for the owner to pick from: keep each
     upload's counts and call a product stale when its count hasn't dropped in N days (our own exports
     subtracted); or import a sales or last-sold report from Crystal Commerce, if it has one. Looked up for the
     owner (2026-11-10, Crystal Commerce's help centre, articles of 2018 to 2020, nothing tried in the store's
     admin): it has one. Inventory tab, the last filter, "In the past [days] days [> < =] [n] qty [bought or
     sold]": days 180, =, 0, sold lists what hasn't sold in 180 days
     (help.crystalcommerce.com/en/articles/3627487); a search on Inventory > Products exports to CSV, the file
     under Notifications > Generated Reports. Not confirmed by the articles: that the export keeps this filter,
     that it combines with "total qty between" (in stock only), that in-store sales count, and how far back it
     goes; the owner to try it. If it works, the app's part could be small: read that CSV and add what Crystal
     Commerce doesn't know (when we bought each card and what we paid, by `cc_product_id`), or nothing at all.
     The owner tried it the other way round (2026-11-10): "Inventory CSV export: Where the product has been sold
     greater than or equal to 1 time in the past 180 days", and the export keeps the filter: 5,099 products, in
     the Master Crystal Inventory file's own 22 columns (Product ID, Total Qty, Sell Price, CC ID…), one row a
     product, with no count sold and no last-sold date. Against the current inventory file on prod (2026-11-08,
     read-only): 8,790 products in stock, 1,435 of them in the export, so 7,355 in stock with no sale in 180
     days (84%). That share is too high to be a to-do list as it stands: it counts cards that only just went
     into stock, and whether in-store sales count is still unknown. So the tracker needs when a product came
     into stock (the app knows it only for what it exported since 2026-10-19: `cc_exported_at`) and a floor on
     price or copies to be worth reading. Nothing built; the owner's file stayed in Downloads.
     The owner's floor (2026-11-10): a second export, "the products are of type Magic Singles, … under the
     Magic: The Gathering Singles category, the product's sell price is greater than or equal to $35.00, … less
     than or equal to $9,999.00," ("high end cards only"; a card never stocked has a $0.00 price, so the price
     filter leaves those out without a stock filter). The file: 503 products, 217 in stock (259 copies, about
     $18,400 at sell price), 286 at Total Qty 0, so "in stock" still has to come from its Total Qty column. It
     shares no product with the sold-in-180-days export, though 278 of that export's products are $35 and up
     (Rhystic Study, Demonic Tutor in stock among them): so this search most likely still had a not-sold filter
     on it (its description ends on a comma). Confirmed by the owner with a screenshot of the search: Sell price
     is between 35 and 9999, and "In the past 180 days (=) equal to 0 quantity sold"; the form also has an
     "In-Store Only" box, unticked, so the filter looks to count every sale unless narrowed, and a "Total
     quantity is between" filter. So the tracker's input is this one export (Inventory, that search, Export
     Search to CSV), and its in-stock rows are the list (217 on 2026-11-10); recent arrivals still to be left
     out (`cc_exported_at`). **What it's for, from the owner (2026-11-10), which replaces the list idea:** "The
     goal is to mark down the buy price for already currently stale cards. EG: if someone adds a 'stale' card
     to a walk-in buy, they'll be warned and offered a chance to apply a negative multiplier (set in settings)".
     No page of its own: "This lives in the settings tab, a place to upload the master file from CC (with an
     explanation on how to create it.) AND another panel besides it, that allows us to set base multipliers like
     -10% or -20% to stale cards. All other info on stale/not stale lives in the Copies we own widget area, that
     rollover should report the stale status, and it should display the mult there with the others, and apply
     like the others. Show an emoji on stale cards clearly. etc". So it rides on Copies we own (decisions 448,
     474, 518; `lib/ownedRates.js`, `OwnedCounter.jsx`, `OwnedCopiesPanel.jsx`, `lib/owned.js` `matchPrinting`):
     a card is stale when the Crystal Commerce product its printing matches is in the uploaded file with Total
     Qty over 0; the box gets a reason line and the change joins the cut and the bonuses in the one pill, Apply
     and Auto apply rates? as they are. Needs a migration (the file's products kept, as `cc_products` are).
     Settled after: the design as laid out ("yes": the upload panel with how to make the file, its date and its
     count; the multiplier panel beside it; an emoji on the counter; a line in the box such as "Stale: no sale
     in 180 days (−10%)"; Magic only, on walk-ins and open overnight buys); a card the app exported within the
     window isn't called stale ("yes"); one multiplier ("For now, 1 tier of stale cards at 180 days BUT if the
     file is made with a different window like 90, would it use that naturally? That would be useful."); "For
     now, just exact printings." On the window: which cards are stale follows whatever search made the file, but
     the file doesn't say its window (no column for it), so the box's wording and the recent-export guard need
     the number from somewhere: a days box in the upload panel, 180 unless changed ("yes"). The stale cut and
     the copies cut's "at most" are separate ("Have them be separate."): the cap limits the copies cut alone and
     the stale cut goes on top of it, so a card can pass the cap by the stale percentage. Ready to build when the
     owner gives it out.

- **Buy 82 (2026-11-10): the price that changed after two cards came off and went back on; looked into, nothing
  changed yet** (main session; the owner asked for the records only, no code). What prod's records show (read-only:
  `buys`, `buy_lines`, `events`, `internal.done_requests`, `price_cache`; copies in
  `C:/ClaudeProjects/temp/buy82-records/`, outside the repo): 21 cards went on (cash $88), then two came off
  (4:24:56 and 4:25:00 pm), and the two lines that are gone are the first card added (Team Magma's Rhydon) and the
  sixth (added 4:12:51 pm, 18 s after the buy's only lookup then, Pikachu EX XY174; at LP $26.00 it makes the $88
  and the $70 to the cent). The first Mr. Mime (the second card added) never came off. Rhydon and a Mr. Mime were
  added back (twice: on, off, on again), so the buy was confirmed with Mr. Mime twice and no Pikachu EX: $83.50,
  paid $90. The arithmetic is the app's own (`internal.lines_totals`), so the price didn't move by itself; what
  isn't in the records is why the sixth line came off rather than Mr. Mime (the × removes by the row's own id,
  `BuyList.jsx` `startRemove` → `RemoveModal` → `useDraft.js` `remove`; a draft's edits aren't in the Changelog, and
  the list's sort is the screen's only). Still for the owner to decide on, not built: a draft's removes and adds
  leave no record once the request ids go after a day. (The second Mr. Mime not joining the first as ×2 is fixed
  on dev: decision 578, Buy tab session.)

- **From the 2026-10-26 review of work mode, still open** (main session, decision 540; the rest fixed by 541): a
  fork's prod or delete approval relayed by message isn't the owner's consent to the harness, so it may stall on a
  prompt in its own chat; whether the UserPromptSubmit hook fires on a turn started by a message is untried;
  `/main`'s hub jobs don't list relaying questions.

- **From the v1.0.5-rainbow review, not acted on** (main session): `OwnedCounter.jsx`'s header comment still puts
  Apply in the verdict line (decision 521 moved it). The rest: the Skip pricing items have their own entry above;
  the Secret Lair foils generator is in the repo (decision 544, Buy tab, `89cae2b`); the collection SKU `-1` vs
  `-10` search is closed, the owner checked it in CC.
- **The backup fix's leftovers** (Records session, decision 577's review, not acted on): a restore whose answer is
  lost reads "The restore failed, and nothing was changed" though it may have gone through, and Restore again
  restores the same file twice (`backupIO.js` `restoreBackup`, `dbMessage`'s fallback; a restore may now run up to
  60 s, so the window is wider); the test run's Backup pass can still hit 8 s once in a while, since a function's
  own limit applies only to the app's calls, not to `db query`.
- **Matching leftovers (decisions 484–487):**
  - The two wrong exported lines' stamps on prod stay unless that day's file must be downloaded again
    (`git show 681c5c6:MATCHING.md`, item 3).
  - From 0010's review: the test-run check of an `auto` sent over a staff row is done (decision 515, Export
    session). ("Retro Schematic": done, decision 516.)
- **The owner's part of the smoke test** (`docs/TEST.md`, dev only): section 10 (the phone), the two-computer and
  network-off cases, and section 19.
- **Copies we own: ×0 vs ×1 on this printing's row** (the owner's, Buy tab; decision 520's "none" was rolled back,
  it took too much room): tell ×0 from ×1 on that row in a way that takes no more room (`OwnedCounter.jsx`, the
  rows' render).
- **Known limit, left as is:** how long a copies-we-own count takes on the live site isn't measured.

## Done

- 2026-11-10 (Records session): **The owner's QA on Records' part, and Home's cash from the Till** (decisions 580
  amended and 584; 0016 amended in place on dev, decision 450, so prod still gets it whole; untested in the app, the
  dev test run passed 671 checks).
  - **Copy Details** (renamed from Copy) is first on a buy's ⋯ after Mark as completed, above Print ▸. It's also
    first on a paid overnight buy's ⋯ in the Overnight buys table. Its rollover is now short: "Copy this buy as a
    row for the buys sheet" (`buyCopy.js` `COPY_TITLE`, BUY COMPLETE's too).
  - **Settings → Stale cut → View Stale Cards…**: a highlighted button under the box. It opens a window like Browse
    remembered products, with a search by name, the count, the window and the floor, and the list. The first build
    swapped the panel's body for the list, which the owner corrected. The list is `stale_cards()`: the cards the
    Price screen marks 🕸️, so only products in the current inventory. Whether the panel's text and button fit its
    height without a scrollbar isn't measured (dev's sign-in). The two stale panels now sit above Crystal Commerce
    matching, which moved down one (the owner; `SettingsPage.jsx`). On dev, upload
    the stale file again first: the one there from before the amendment has no sell prices.
  - **0016's amendment:** `stale_files.min_price` (0 to 9999, 35 unless changed, put last so a fresh apply matches
    dev's order), `stale_products.sell_price`, `stale_file_load`'s `p_min_price` and its Changelog's "$35 and up",
    and `stale_cards()`. Reviewed by pug-reviewer; its points fixed: the range matched to the box, the list matched
    to the 🕸️, the race on Hide, and the list's own scroll.
  - **Home → Today → From the Till** (decision 584; "Yes, all Till cash"): a third stat, the cash paid from the Till
    today (walk-ins, overnight buys marked Paid/Ours, projects made buys; by `paid_at`) and its count. The card's
    stats are three across (`home.css` `.home-stats.three`). **Not measured:** dev's sign-in needs the store
    password, so the card's width wasn't checked in the browser. Check the three amounts don't wrap at the store's
    width (TEST.md 4).
  - **The test run:** its Backup and restore checks were four full restores in one statement. That went over the
    time limit twice today as dev's data grew, so they're now three statements (`scripts/db-test-run.sql`).

- 2026-11-10 (Records session): **The three-part patch, Records' part: migration 0016, Copy, the cash location at
  Paid/Ours, the stale cut** (decision 580; **0016 on dev only**, prod with 0015 on the owner's word, the first Open
  items). Untested in the app; the unit tests and the dev test run only (667 checks passed, 18 new).
  - **Migration 0016** (`supabase/migrations/0016_cash_location_stale_cards.sql`): the contract in the plan's
    entry above, with what the review added. Convert to overnight buy and Convert to project carry the cash
    location and who paid, and the stale deletes have a `where`, in case the API refuses one without. It changed
    after its first review and before dev had it; that change itself wasn't reviewed again, but the rehearsal and
    the full test run were done after it. The test run's new section is "Cash location and stale cards (0016)"
    (`scripts/db-test-run.sql`).
  - **Where to look:**
    - A buy on a day page, ⋯ → **Copy** (after Print ▸), then paste into a spreadsheet's first cell: ten cells.
    - The Collections tab's Overnight buys, a Paid/Ours or Completed row's ⋯ → **Copy**.
    - An overnight buy's **Mark as Paid/Ours**, Cash: Till and Backroom chips, and the button waits for one.
    - A project's **Convert to buy…**, Cash: the same.
    - **Settings → Stale cut**, beside Stale cards file: one percentage, 10 unless changed.
    - The cases are TEST.md 11, 12, 14 and 16 (Records session).
  - **The files:** `src/lib/buyCopy.js` (`buyCopyRow`, `copyBuyRow`, `COPY_TITLE`; `tests/buyCopy.test.js`),
    `src/pages/day/BuyPanel.jsx`, `src/pages/CollectionsPage.jsx` (`menu`, the list's select),
    `src/pages/collections/DealModals.jsx` (`PaidModal`), `CollectionModals.jsx` (`ConvertToBuyModal`),
    `useCollection.js` (`setStatus`, `toBuy`, `bad_cash_location`), `src/pages/settings/StaleCutPanel.jsx`,
    `SettingsPage.jsx`, `src/lib/settingText.js` and `changelog.js` (the stale cut in the Changelog).
  - **Untested:**
    - The clipboard in a real browser, and the paste into the store's Google Sheet.
    - The panel's layout beside the upload panel.
    - Whether an upload through the app gets past the API, which the test run can't reach: it runs as the database's
      owner.
  - **Known, left as is:**
    - A wrong Till or Backroom pick is changed only by unlocking back to Processing and paying again; CONFIRM BUY's
      can't be changed at all (`buy_save_edits` doesn't write it).
    - CONFIRM BUY's and Convert to buy's Changelog sentences don't name the location; Paid/Ours's does.
    - Older buys copy with who paid and the location empty.
    - For about a minute, a commit of mine imported the Buy tab's `CashLocation.jsx` before it was committed, so
      HEAD didn't build; the Buy tab committed the file.

- 2026-11-10 (Buy tab session): **The three-part patch, the Buy tab's part** (decisions 582 and 583; the database
  is Records' migration 0016, decision 580; untested in the app, the unit tests only).
  - **Stale in Copies we own** (582, committed): `src/lib/ownedRates.js` (`staleFrom`, `DEFAULT_STALE`,
    `STALE_EMOJI`; `ownedCounts`' `stale` from `stale_ids` and `stale_file`; `ownedAdjust`'s `stale`, `staleCut`,
    `staleDays`; `ownedReason`'s line), `OwnedCounter.jsx` (🕸️ on This printing, the "−10% stale" chip),
    `PricingScreen.jsx` (`staleCfg`, the applied line), `useScanReceiver.js` (scans). Where to look: the Buy tab, a
    stale Magic printing (TEST.md section 7, "A stale card in Copies we own"): 🕸️, the chip, the box's
    "Stale: no sale in 180 days (−10%)", the pill. The multiplier's panel is Records' and reads `staleFrom`.
  - **The cash location at CONFIRM BUY and Copy on BUY COMPLETE** (583): `src/components/CashLocation.jsx` (also
    for Records' Paid/Ours), `ConfirmBuyModal.jsx` (`cashLocation` prop; Records can turn it on for Convert to buy,
    `project_to_buy`'s `p_cash_location`), `PricePage.jsx`, `useDraft.js` `confirm` (`p_cash_location`),
    `confirmReadBack.js` (the lost answer checks it), `BuyDoneModal.jsx` (**Copy Details 📋**, Records' `copyBuyRow`). From the owner's QA (2026-11-10):
    Backroom picked is a darker green (`buylist.css`, `--pal-green`) and the button is Copy Details; untested.
    Where to look: TEST.md section 8, "CONFIRM BUY's cash location and BUY COMPLETE's Copy".
  - **Commits:** 87c2573 (582); c7a85b6 (the chooser and the dialog's option) and d161579 (CONFIRM BUY's
    `p_cash_location`, the read-back, Copy), after 0016 went on dev. Also wired for Export: the 🖨 print button
    in `PricePage.jsx` (b5de53e, decision 579). Copy builds its row from what CONFIRM BUY sent, not a read-back
    (`confirm_buy` sets the confirmer, payer and both times together), so it matches the buy's ⋯ Copy.

- 2026-11-10 (Export session): **Settings → Stale cards file** (decision 581; the three-part patch, part 2; its
  tables and `stale_file_load` are Records' migration 0016, decision 580): `src/pages/settings/StaleFilePanel.jsx`
  (the panel: what it's for, How to make the file, the days box, the upload, the current file),
  `src/lib/staleFile.js` (`staleFromText`, `readStaleCsv`: the checks and rows; `loadStaleFile`,
  `currentStaleFile`). Outside my area, small: the panel in `src/pages/SettingsPage.jsx` after Crystal Commerce
  matching (on the left; Records' stale cut panel goes right after it, beside it), its CSS in
  `src/styles/settings.css`, and the Changelog's name for `stale_file_uploaded` in `src/lib/changelog.js`. The
  owner's sample (Downloads, read where it is) reads as 503 products, 217 in stock, 259 copies. Where to look
  (needs 0016 on dev): Settings → Stale cards file: upload the stale search CSV with "No sale in 180 days": the
  toast and the panel say 503 products and 217 stale cards in stock; the Changelog (Settings) has the upload; the
  Master Crystal Inventory's file is refused. Untested in the app (unit tests and the sample read only). No
  migration of mine.
  **Amended after the owner's QA** (decision 581 amended; "too wordy and too long… ALSO add a input for the sell
  price 35 mirroring the days"): one line of explanation, a two-line how-to that follows the boxes, **Sell price
  from $35** beside the days (sent as `p_min_price`, shown on the current file's line), each row's Sell Price sent
  for View Stale Cards, the current file in two lines, the button "Upload file". Where to look: Settings → Stale
  cards file: no scrollbar; change either box and the how-to's line follows; upload with 90 and $20: the line
  reads "no sale in 90 days, $20 and up". Measured on dev (the panel's body is 287 px inside the Settings
  panels' one height, 332): with no file, 114 px used at 1920×1080; with a current file's two lines (laid in for
  the measure, nothing uploaded), about 132 px at 1200×650 (the laptops' 80%); no scrollbar either way, with room
  for an error banner. The height stays the Settings panels' own, matching Records' Stale cut panel beside it.
- 2026-11-10 (Export session): **🖨 Print a walk-in in progress** (decision 579; the three-part patch, part 1):
  `src/lib/quotePrint.js` (`quoteRow`, `quoteSheet`: the rows and the foot, pure), `src/lib/quotePdf.js` (the
  sheet), `src/pages/export/QuotePrintButton.jsx` (the button; the PDF library loads on the click). The button
  goes in the walk-in list's heading through `PricingScreen`'s `listBadge` prop, set in `src/pages/PricePage.jsx`
  (one prop; no change to `PricingScreen.jsx` or `BuyList.jsx`), added by the Buy tab session (b5de53e) since
  PricePage.jsx had its uncommitted edits. Where to look: the Buy tab with a few walk-in cards →
  🖨 Print beside "Buy list": a PDF titled "Buy in progress, not confirmed" with the date and time, "Quote only,
  not a receipt", a blank Customer line, a row per card as added with Cash each and Credit each, and the foot's
  card count and Cash and Credit offers equal to the list's totals; nothing saved or logged. Picked by me, for the
  owner to reverse: the amounts are per card ("each", a bulk line per item), the rows go in the order added
  whatever the screen's sort, and the button is in the list's heading rather than by CONFIRM BUY. Untested in
  the app (unit tests only). No migration. `printedTreatments` in `src/lib/auditPrint.js` is now exported.

- 2026-11-10 (Buy tab session): **One TCGplayer product is one line** (decision 578, migration 0015 on dev only;
  the owner's ask through the main session: "When any two products have the same tcgplayer ID they should collapse
  together", from Buy 82's two Mr. Mime lines). `internal.same_card`, the merge rule of ADD CARD, a phone's scan
  and SAVE EDIT's fold on walk-ins, overnight buys and projects (`draft_add_line`, `draft_update_line`,
  `collection_add_line`, `collection_update_line`): two lines with the same TCGplayer product and name are one card
  when one has no Scryfall or TCGdex id to tell them apart, whatever their set and number. Condition, finish, 1st
  edition, treatments, price and its source, bulk kind, own rates and export stamps still keep copies apart; strike
  and restore twins (`internal.same_line`) and lines already on a list are unchanged; the merged line keeps the
  first line's details. *Narrower than the owner's words, and the owner agreed ("I'm ok with that design, it seems logical and
  sound. Proceed."):* two cards that each have their own
  TCGdex (or Scryfall) id, different ones, stay two even on one product, since TCGdex links some different cards
  to one product (the Trainer Kit's Great Ball and Lightning Energy; `printings.js` `WRONG_PRODUCTS` fixes only
  some) and merging them would export one card as the other; the name check keeps such a card from joining a find
  of the product's own card. Known limits: a stamped or Cosmos version found both ways can name its treatment
  differently and stays two lines; a name TCGdex and TCGplayer spell differently ("Impostor Professor Oak") stays
  two. Reviewed by pug-reviewer twice (the narrowing came from the first), rehearsed, on dev, snapshot, test run
  all passed (649 checks; 6 new under "578 (0015)" in `scripts/db-test-run.sql`). TEST.md case in section 8. Where
  to look (dev, a walk-in): add Mr. Mime 6/64 Jungle holo picked through its TCGdex card, then `mr mime 6` and the
  same card as a JustTCG find (number "06") at the same condition and price: one line, ×2, number "6"; in another
  condition, or with a manual price, its own line. Untested in the app. Prod waits (first Open item).

- 2026-11-07: **Migration 0014 on prod, and pushed without a bump** (the owner's ask, "Push to prod and apply the
  migration now. Update the live pages site asap."): 0014 (the backup's 60 s, decision 577, Records) pushed to prod
  during the store's day on the owner's word, the structure-only compare against the dev run
  (`C:/ClaudeProjects/temp/pug-dbrun-0014.json`) the same; prod and dev equal at 0014. The site: decision 577's
  comments and Help's (>$1.49) wording (main session). Untested in the app on prod: the owner's Download backup is
  the check. Prod's PostgREST version (12 or later, which the 60 s rests on) wasn't looked at on the dashboard; if a
  backup still times out there, that's the first thing to check.
- 2026-11-07 (Records session): **Download backup no longer times out** (F2, decision 577; the owner's ask through the
  main session, hitting it at work: "complete the work on this fix in entirety including the migration, apply to
  dev"). Migration **0014, on dev only** (prod waits for the owner's word, first Open item): `backup_export` builds
  the file as `json` (same rows, order and values, checked on dev; 0.5–0.7 s instead of 2.4–5.7 s, up to 9 s seen)
  and carries its own `statement_timeout` of 60 s; `restore_backup` the same 60 s. Still one call, one read at one
  instant (decision 430). Checked on dev through the API with throwaway functions (dropped): a call with its own
  60 s ran 25 s and answered. Reviewed (pug-reviewer: nothing that breaks the site or data; its notes are in the
  leftovers entry above and decision 577), rehearsed, pushed to dev, snapshot, test run all 643 passed (two new
  checks in the Backup pass, `scripts/db-test-run.sql`). App: comments only (`timedFetch.js`, `backup.js`); both
  calls were already on the 120 s list. TEST.md case in section 16. Where to look: localhost (dev) → Settings →
  Backups → Download backup, three times: each file in a few seconds, never "canceling statement due to statement
  timeout"; the file has format `pug-pricing-backup`, version 1, nine tables; Restore from backup… reads it as
  before. Untested in the app; a restore through the app past 8 s not tried (the probe covers the mechanism);
  prod's PostgREST version unchecked.
- 2026-10-28 (main session): **Help: the (>$1.49) cut by the market price bought at** (the owner's "Yes, update
  Help", on the push review's finding): `README.md`'s Print MTG?, Review (the Pulled group), Bulk pulled from
  exports and Export rates for bulk now say every (>…) button cuts by the card's market price when it was bought,
  a card with none recorded by today's or its Sell Price, and that the rows and colours are still today's. Where
  to look: Help, those four sections. No migration. Unpushed.
- 2026-10-28: **Pushed without a bump** (the owner's ask, "Push no bump, with the review"), decisions 574–576, the
  Export session's three: a Secret Lair card always a choice (574), Print MTG and Print buy (>$1.49) by the market
  price bought at (575), Export MTG csv and Export single buy (>$1.49) the same (576), with their TEST.md cases
  (the header at 297). All three untested in the app. No migrations: prod and dev stay at 0013. The review (no
  stop) found: Help's "Print MTG", "The export dialog" and "Export rates for bulk" sections still say the cut is by
  today's price or Sell Price, out of date (README is edited on the owner's ask); a manual-priced card is cut by
  its looked-up market price, not the price typed (plausible: `boughtAt` in `src/lib/bulkCut.js` reads
  `market_price`, which `buyLine.js` keeps as the ladder's price); after a collection's REPRICE? the cut is on
  the repriced figure (`reprice.js` overwrites `market_price`); TEST.md's "Export single buy (>$1.49)" case
  still cites 408 and 416 only.
- 2026-10-28 (Export session): **Export MTG csv (>$1.49) by the market price bought at too** (decision 576; the
  owner: "make Export MTG csv (>$1.49) pull by the market price bought at too, so the print and the export
  agree"): the (>…) export and Export single buy (>…) pull the cards bought at a market price up to the amber,
  not by their Sell Price; a line with none recorded goes by its Sell Price. A kept card's Sell Price in the file is
  still today's. `stateOf` and `pulledAt` in `src/pages/export/ExportDialog.jsx`, `boughtAt` in
  `src/lib/bulkCut.js`; hover texts in `ExportButton.jsx` and `day/BuyPanel.jsx`, the Settings → Export rates for
  bulk hint in `BulkExportRatesPanel.jsx` (outside my area, wording only). Where to look: a day with a card
  bought at $2 that's $1.20 today and one bought at $1.20 that's $2 today: EXPORT ▾ → Export MTG csv (>$1.49)
  keeps the first and pulls the second ("Bought at $1.20" on its row and in Confirm's list); Print MTG (>$1.49)
  prints the same cards. Untested in the app (unit test only). No migration.
- 2026-10-27 (Export session): **Print MTG (>$1.49) by the market price bought at** (decision 575; the owner: "it
  would be more clear to workers if it was based on the market price we bought them for instead"): the (>…) cut on
  Print MTG and Print buy goes by the line's `market_price` (the market price behind its buy price), not today's;
  a line with none (Skip pricing) goes by today's. `boughtPrice` in `src/lib/bulkCut.js`, used in
  `src/pages/export/useAuditPrint.js`. Hover texts follow in `ExportButton.jsx` and `day/BuyPanel.jsx`, and the
  Settings → Export rates for bulk hint in `BulkExportRatesPanel.jsx` (outside my area, wording only). Where to
  look: a day or collection with a card bought at a market price over $1.50 that's under it today, and one the
  other way round: EXPORT ▾ → Print → Print MTG (>$1.49) prints the first (an amber row at today's price), not the
  second; a buy's ⋯ → Print buy (>$1.49) the same. Each row's price and colour are still today's; the export
  follows in decision 576 (the entry above). Untested in the app (unit test only). No migration.
- 2026-10-27 (Export session): **A Secret Lair card is always a choice** (decision 574; the owner: "SLD or Secret
  Lair category cards are too difficult to be auto match and I ALWAYS want them to go to "needs a choice""): a
  Magic line in the SLD set, or in a CC category named Secret Lair, never matches by itself; a remembered pick still
  applies. `alwaysChoose` in `src/lib/ccMatch.js`, used in `matchLines` (`src/lib/ccExport.js`), so the Price
  screen's copies we own follow it too (an SLD card there asks for its match until one is picked). Where to look:
  EXPORT on a day or collection with an SLD card never picked before: it's in Needs a choice, likeliest first; pick
  it, and the next export matches it by itself. Untested in the app (unit test only). No migration.
- 2026-10-27: **Pushed without a bump, no review** (the owner's ask, "Push without a review"), decision 573, the
  Pokémon sticker sheet's printer offset removed (main session, untested on paper). No migrations: prod and dev
  stay at 0013.
- 2026-10-27 (main session): **The Pokémon sticker sheet's printer offset removed** (decision 573; the owner:
  "remove the offset we calibrated for my person[al] printer from the print pokemon stickers sheet"):
  `PRINTER_OFFSET` in `src/lib/stickerPdf.js` is `{ dx: 0, dy: 0 }`, so the stickers print at the grid's place
  (0.29 in from the left, 0.49 in from the top, decision 281) with no shift; `stickerBox` and `stickerPdf` still
  take an `offset`, for a measurement from the store's printer later. The test's default-offset check follows
  (`tests/stickerPdf.test.js`). Where to look: a collection with Pokémon cards, EXPORT ▾ → Print PKM Stickers?,
  the PDF printed at 100%: the content sits 0.06 in further right and 0.05 in higher than before. Untested on
  paper. No migration. Made in the main session, not by the Export fork (the owner's "quickly"); the Export fork
  told.
- 2026-10-27: **Pushed without a bump, no review** (the owner's ask, "push no bump, no review"), decisions
  568–572, the 2026-10-27 push review's scanner fixes: the camera's timer holding the card's real time (568), a
  card's ranking by look ending with the card (569), the name-only 3 s choice in 4 s at most (570), no 3 s choice
  after Stop or a Scan card press (571), Scan card listing a modern card's printing picked by look instead of
  sending it (572), with TEST.md's two new cases, the spec rows and the pick sheet's comment put right (Phone
  scanner, untested on the phone). No migrations: prod and dev stay at 0013.
- 2026-10-27 (Phone scanner session): **Scan card lists a modern card's printing picked by look** (decision 572,
  the owner's "yes"): `src/scan/Scanner.jsx`, on the name path, a modern card whose printing would be a look
  winner opens the printing list instead, best look first (`PICK_LOOK_MAX` 12, View all by look); a printing
  fixed by number and set size, and an older card's look winner, still go in. Row 567 notes it; TEST.md's "A
  modern card's printings by look" case extended (no new case). Where to look: the phone, Scan card on Lightning
  Bolt with its bottom covered: the list opens, the matching printing first. Untested on a phone. No migration.
- 2026-10-27 (Phone scanner session): **The push review's doc findings** (the owner's pass-on): `docs/TEST.md`
  section 10, two cases, "The timer's tenths" (565, 568) and "A modern card's printings by look" (567, 569–571);
  `PickPrintingSheet.jsx`'s header says best first, by look where worked out; spec row 567 says Scan card still
  takes a printing clearly ahead by look (the "nothing sent on look alone" is auto scan's: amended, not changed;
  making Scan card list instead is the owner's call); row 557's file list marks what 562 removed. TEST.md's
  "older card's printing" case left as is: View all is still oldest to newest for an older card. Docs only.
- 2026-10-27 (Phone scanner session): **No 3 s choice after Stop or a Scan card press** (decision 571, the push
  review's finding): `src/scan/Scanner.jsx` `timeUp` notes its `readRun`; the waits drop their list or Which card?
  when it has moved on; `stopReading` and `abortCamera` free auto scan at once. Where to look: the phone, a card
  whose 3 s run out while its printings are being ordered, ■ Stop straight away: no list opens after. Untested on
  a phone. No migration.
- 2026-10-27 (Phone scanner session): **The name-only 3 s choice in 4 s at most** (decision 570, the push review's
  finding): `src/scan/Scanner.jsx` `offerChoice` gives its `printingsFor` a signal ended at `LOOK_WAIT_MS`; past
  it the printings come unranked, or Which card? opens when they didn't come. Where to look: the phone with the
  wifi off after a name's read (dev): at 3 s, within 4 s more, a list or Which card?, never a minute's wait.
  Untested on a phone. No migration.
- 2026-10-27 (Phone scanner session): **A card's ranking by look ends with the card** (decision 569, the push
  review's finding): `src/scan/Scanner.jsx` gives each card's ranking a signal (`t.stop`), ended by
  `dropCardTime` wherever the card is let go (sent, taken away, another laid, Stop, the camera stopped, a list or
  Which card? opened) and once its 3 s choice is made; the look's order kept as `t.lookBonus`, a tie-break in the
  3 s list, so a later higher clue score still counts. Left as is: the name's printings, once asked for, are
  fetched to the end (564, kept for the page). Where to look: the phone, a modern card with its bottom covered,
  ■ Stop at once: no list opens after; the dev run log stays quiet. Untested on a phone. No migration.
- 2026-10-27 (Phone scanner session): **The camera's timer holds the card's real time** (decision 568, the push
  review's finding): `src/scan/Scanner.jsx` `cardEnd` keeps how the last card ended (its 3 s, or its time when
  sent), `readCardClock` gives it, `CardTimer.jsx` holds it. Where to look: the phone, a card whose 3 s run out on
  auto scan: the timer holds "3.0" red, never "2.9" amber; a card sent at 1.4 holds "1.4" amber. Untested on a
  phone. No migration.
- 2026-10-27: **Pushed without a bump** (the owner's ask, "quietly push no bump"), decisions 564–567, the
  v1.0.6-badscanner review's six findings fixed: a name's printings fetched once and ended by no one caller (564),
  the camera's timer showing tenths cut down (565), a modern card's printings ordered by how it looks (567),
  TEST.md's Never stuck case and spec rows 557 and 561 put right (Phone scanner, untested on the phone); a kept
  price's line taking the JustTCG card the edit names (566, Buy tab, untested in the app). No migrations: prod and
  dev stay at 0013.
- 2026-10-27 (Buy tab session): **A kept price's line takes the JustTCG card the edit names** (decision 566; the
  v1.0.6-badscanner review's finding, the owner's ask through the main session): with Skip pricing on, SAVE EDIT on a
  priced TCGplayer-only Pokémon card kept the old card's `justtcg_card_id` (decision 546) when the edit chose a
  sibling product or another card, so REPRICE? priced the old card. Now the id the edit's card or version names wins,
  the old variant id dropped with it (`skippedJusttcgIds`, `src/lib/unpriced.js`, used by `buildLine`'s Pokémon
  branch in `buyLine.js`; tested in `tests/unpriced.test.js`). The same card in another finish keeps its id (its
  versions share it), and TCGdex cards on their own versions and Magic are unchanged. TEST.md case in section 7. No
  migration. Where to look: a project with a priced TCGplayer-only Pokémon card (no TCGdex record, e.g. a
  "(Cosmos Holo)" product found only on TCGplayer), Skip pricing on, click the line, pick a sibling product in the
  versions, SAVE EDIT: the price stays; turn Skip pricing off and REPRICE?: the line is priced as the new product;
  click it again and the edit opens on the new product. Untested in the app.

- 2026-10-27 (Phone scanner session): **A modern card's printings ordered by how it looks** (decision 567, the
  review's finding, the owner's pick: "by how the card looks … even if it's slower"): `src/scan/Scanner.jsx`
  ranks a modern card's printings by look in the background once the strip's clues don't settle it
  (`printingsFor` with `older: false`, `bottom: false`, its new `byLook`); the 3 s choice waits up to 4 s more for
  that order (`LOOK_WAIT_MS`, `offerChoice`), the list opens in it, View all shows every printing in it
  (`PickPrintingSheet.jsx` `allNote`); Scan card ranks a card that isn't plainly older as modern. Nothing is sent
  on a modern card's look alone. Where to look: the phone, a modern card with its bottom line covered (a
  much-reprinted one, Lightning Bolt): at 3 s "…: ordering its printings by look…", then the list with the
  matching printing first; View all "the likeliest by look first". Untested on a phone; the look ranking
  downloads each printing's picture, so a card with many printings may take the full 4 s. No migration.
- 2026-10-27 (Phone scanner session): **The review's doc findings** (the owner's pass-on): `docs/TEST.md` Never
  stuck now expects the printing list or Which card? (561); spec rows 557 and 561 say 562 took the background
  printings fetch out (the look with a name fetches them itself). Docs only.
- 2026-10-27 (Phone scanner session): **The camera's timer shows tenths cut down** (decision 565, the review's
  finding): `src/scan/CardTimer.jsx` floors to tenths, so "3.0" is only a card whose 3 s ran out (held red); one
  done at 2.96 reads "2.9", held amber. Where to look: the phone, a card done just under 3 s: amber, not "3.0" red.
  Untested on a phone. No migration.
- 2026-10-27 (Phone scanner session): **A name's printings fetched once, ended by no one caller** (decision 564,
  the v1.0.6-badscanner review's finding, passed on by the owner): `src/scan/older.js` `printingsOf` shares one
  fetch with no caller's signal; each caller's signal gives up only its own wait. Tests in
  `tests/scanPrintings.test.js`. Where to look: the phone, an older card whose name reads but whose printings are
  slow to come (a busy connection): at 3 s its printings list opens, not an empty Which card?. Untested on a phone
  (timing-dependent). No migration.
- 2026-10-27: **Pushed as v1.0.6-badscanner** (the owner's ask), decisions 541–563, 68 commits since the 2026-10-26
  push: the scanner made fast (3 s a card with the timer on the camera, the name read on every look by a second
  reader, the title's box above the camera, a choice at 3 s, the older-card mode and Title / Number retired, no
  re-crop by itself; 549–563, tested by the owner on the phone over dev's LAN link) and Help's Scanning from a
  phone rewritten; the Changelog showing no price on a card with none (545) and SAVE EDIT keeping a priced card's
  price under Skip pricing (546), with Help's Skip pricing line; the Secret Lair foils generator in the repo (544);
  the matching audit page built and reverted the same day (547, nothing in the app); work mode's fixes, CLAUDE.md
  trimmed with the Database and Work mode docs moved out, the affected-tests hook removed, two memory notes folded
  in (541–543, 548, docs and `.claude/` only). No migrations: prod and dev stay at 0013. Tag `v1.0.6-badscanner`.
- 2026-10-27 (main session): **Help: Skip pricing's SAVE EDIT line brought up to date** (decision 546; the owner,
  before the push: "Yes, fix Help's Skip pricing line about SAVE EDIT now"): README.md's Skip pricing bullets now
  say SAVE EDIT keeps a priced card's price, even when the edit changed its printing or condition (REPRICE? puts it
  right once the switch is off), and a card with no price stays without one; ADD CARD and a phone's scan as
  before. A Buy tab Help section, edited here as a one-line fix and told to the Buy tab. Where to look: Help →
  Skip pricing, "While it's on". No migration.
- 2026-10-27 (Phone scanner session): **The scanner made fast, closed: the owner tested** (the owner: "I've been
  testing this whole time, testing is looking good. Close as done."): decisions 549–563 and Help, below, tried
  on the phone over dev's LAN link as they landed. The analysis and its scripts stay in
  `C:\ClaudeProjects\temp\scan-run\` (`scanstats.mjs`, `gaps.mjs`, `compare-match.mjs`). Not taken up: a card
  index on the phone instead of Scryfall calls (the owner's call, if ever).
- 2026-10-27 (Phone scanner session): **Help: Scanning from a phone brought up to date** (the owner's ask, for
  decisions 549–563): `README.md`, Scanning from a phone: the two readers, the name box, the timer, 3 s a card and
  the choice it ends in, Scan card's 3 s, Stop after 1.5 s, the slow-connection line, older cards with no button
  (the Title / Number lines gone), Which card? at 3 s. `src/scan/older.js` `readOlderCard` removed (nothing used
  it). Where to look: the Help page Scanning from a phone. No migration.
- 2026-10-27 (Phone scanner session): **No re-crop by itself on a strip that names no set** (decision 563, the
  owner's call): `src/scan/Scanner.jsx` `askRecrop` and `lineRelockArt` removed; Reset view is the manual step;
  the re-crop every 20 cards (312) and the strip zone following the stack (`straighten.js`) stay. Where to look:
  the phone, a modern card with its bottom covered: no "relock-asked" in the dev run log, the view stays put till
  Reset view. Untested on a phone. No migration.
- 2026-10-27 (Phone scanner session): **The name's printings scored on the strip; the older-card mode and Title /
  Number retired** (decision 562, the owner's pick of all three): `src/scan/resolve.js` `bestOfName` scores the
  name's printings (`older.js` `printingsOf`, kept) on the strip's clues and an older card's "123/350"; one clearly
  ahead is sent, modern or older, with no strip search. `Scanner.jsx`: the card's age from each look's strip
  (`olderLook`: set code, copyright year, blank strip with ink, or `NO_SET_LOOKS` looks with no set code on one
  card); the strip read on every look; `askRecrop` for decision 317's re-crop; `noLineAgain`, `leaveOlder`,
  `titleMode`, `readTitleNow`, `backToNumber` and the button gone (`.scan-cutout-mode` in `scan.css`). Tests in
  `tests/scanResolve.test.js`; TEST.md section 10's Title cases rewritten. Where to look: the phone, auto scan: a
  modern card with its number covered goes in by name and set code; Goblin Electromancer and a 1995 card go in or
  open their printings; no Title / Number button, the strip box's whole width showing. Untested on a phone. Left in
  `older.js`: `readOlderCard`, now used by nothing in the app. Help: Scanning from a phone's Title / Number
  description is out of date. No migration.
- 2026-10-27 (Phone scanner session): **3 s with nothing likely: a choice, not a retry** (decision 561, the
  owner's call, undoes 556's retry): `src/scan/Scanner.jsx` `timeUp` opens the read name's printings in the
  printing list (`printingsFor`, auto scan held off by `finding` while they come), else Which card? with the
  title's closest guess (`cardRead.guess`); the same when Scan card's 3 s run out. Where to look: the phone, a
  card that won't read (Goblin Electromancer): at 3 s its printings to pick from, or Which card?; never "Still
  reading". Untested on a phone. Not changed: Scan card ending inside its 3 s with nothing at all still says to
  set the card aside. No migration.
- 2026-10-27 (Phone scanner session): **The camera's timer red from 2.1 s** (decision 560, the owner's ask):
  `src/scan/CardTimer.jsx` and `.scan-card-timer.late` (`--bad`): red while counting from 2.1, held red and bold
  when the 3 s ran out; a card done sooner stays amber. Where to look: the phone, a slow card: red from 2.1, red at
  3.0 when its list opens or it retries. Untested on a phone. Picked by me: a card done between 2.1 and 3.0 is held
  amber, not red. No migration.
- 2026-10-27 (Phone scanner session): **The camera's timer counts up and holds the card's time** (decision 559,
  the owner's ask, amends 558): `src/scan/CardTimer.jsx` counts up in tenths, then holds the last time bold and
  amber (`.scan-card-timer.done`) till the next card; `Scanner.jsx` `readCardClock`, and an empty holder ends a
  card's time (`cardTime` cleared). Where to look: the phone, lay a card: 0.0 counting up, then the card's time
  held in bold amber after it goes in. Untested on a phone. No migration.
- 2026-10-27 (Phone scanner session): **The card's 3 s on the camera** (decision 558, the owner's ask):
  `src/scan/CardTimer.jsx` counts down in tenths in the camera's top right while a card's 3 s run (auto scan's
  `cardTime`, Scan card's and Title's `pressClock`), amber in the last second; `src/styles/scan.css`
  `.scan-card-timer`. Where to look: the phone, lay a card: "3.0" counting down, small and see-through, gone when
  the card goes in. Untested and not measured on a phone. Picked by me, reversible: tenths, 14 px, amber under 1 s.
  No migration.
- 2026-10-27 (Phone scanner session): **Older cards by name as soon as auto scan can tell** (decision 557, the
  owner's pick of three ideas): `src/scan/titles.js` `olderStripYear` (a copyright year before 2015, read loosely;
  the 14 of 479 failed strips in the logs that have one are all older cards) makes `noLineAgain` go to the
  older-card mode at once and skip the re-crop (`copyright`); `Scanner.jsx` keeps a name read before that mode
  (`cardRead.name`, used by the look that goes by name when its own read misses) and fetches its printings in the
  background (`printingsFor` with no frame), `older.js` `printingsOf` keeping them for the page's life. Tests in
  `tests/scanOlder.test.js`. Where to look: the phone, auto scan, Goblin Electromancer and Guardian of Vitu-Ghazi:
  each goes in, or opens its printings, inside 3 s, no "Still reading" first; modern cards as before. Untested on
  a phone. No migration.
- 2026-10-27 (Phone scanner session): *(undone by 561, above)* **Auto scan keeps trying when its 3 s find nothing** (decision 556, the
  owner's ask with a screenshot): `src/scan/Scanner.jsx` `timeUp` on auto scan, with nothing found, says "Still
  reading this card…" (no error sound, the card not held) and the next look starts a fresh 3 s; the pick list at
  3 s and Scan card's message are unchanged. Where to look: the phone, auto scan, a pre-2014 card like Goblin
  Electromancer: no "Couldn't read this card in time", it goes in or opens its list on a later try. Untested on a
  phone. No migration.
- 2026-10-26 (Phone scanner session): **The name at the title box's left edge** (decision 555, the owner's ask):
  `src/scan/Scanner.jsx` `showCutout` draws the title box's name from its left edge; the strip's box stays centred.
  Where to look: the phone, a short name (Opt) and a long one: both start at the box's left, the short one leaving
  room on its right. Untested on a phone. No migration.
- 2026-10-26 (Phone scanner session): **A sheet takes the two boxes' room** (decision 554, the owner's ask with a
  screenshot): `src/scan/Scanner.jsx` `sheetOpen` hides the title's box and the strip's box (`.covered`,
  `src/styles/scan.css`) while the printing list, a price to answer or Which card? is open, so the sheet fills
  their room; `showCutout` leaves a hidden box's picture alone. Where to look: the phone, a printing list (an older
  card with several printings): the list reaches from the finish buttons down to the last scan's strip, each
  printing's set name in full; close it: both boxes back with their pictures. Untested and not measured on a
  phone. No migration.
- 2026-10-26 (Phone scanner session): **The title's box shows the name alone** (decision 553, the owner's ask with
  a screenshot): `src/scan/titles.js` `nameSpan` and `nameCutout` cut the name out of the title band for the box
  above the camera (the reader still reads the whole band); tests in `tests/scanTitleFind.test.js`; on the owner's
  screenshot it cuts out "Auger Spree" alone (`C:\ClaudeProjects\temp\scan-run\name-crop-check.mjs`). Where to
  look: the phone, a card locked: the name fills the box's height, no mana cost or rules beside it; a card whose
  name isn't found shows the whole bar as before. Untested on a phone. Picked by me, reversible: a word gap up to
  half the band's height, a little room round the name. No migration.
- 2026-10-26 (Phone scanner session): **The title's box above the camera** (decision 552, the owner's ask):
  `src/scan/Scanner.jsx` `titleRef`, drawn by `showCutout` on every settled look and on Title's press;
  `src/styles/scan.css` `.scan-title-box`, 48 px tall. The box under the camera now always shows the strip (it showed
  the title in the older-card mode). Where to look: the phone, camera on, a card locked: the title band, black on
  white, above the camera, the strip below; the camera a little shorter. Untested on a phone and not measured
  there. Picked by me, reversible: 48 px (the strip's box is 64 px), the strip always below. No migration. Help:
  Scanning from a phone's screen description is out of date.
- 2026-10-26 (Phone scanner session): **The name read on every look, by a second card reader** (decision 551, the
  owner's ask after trying 549–550; that night's run log in `C:\ClaudeProjects\temp\scan-run\scan-log.jsonl`):
  `src/scan/ocr.js` two readers (`readTitleText` beside `readText`); `nameMatch.js` `nearHits` narrows each
  reading by letter pairs before Fuse (junk 1.2 s → 3 ms on the laptop, the Which card? guess 2.7 s → 31 ms; the
  same answer on 1,504 of 1,505 misread names, `C:\ClaudeProjects\temp\scan-run\compare-match.mjs`); `older.js`
  `readTitleName`, `printingsFor`'s `read` and `onPrintings`; `Scanner.jsx`: `nameRead` on every settled look, the
  name making an unsure strip sure, a strip candidate of that name taken (set code as printed, clearly ahead),
  older cards by their name's printings on the look it's read; `setPick` stops the 3 s, a pick holds the card at
  once; `timeUp` offers only the name's cards, else cards whose set code was read as printed (`resolve.js`
  `printed`, `CANDIDATES_KEPT` 12). Auto scan asks no search without a set code read. Tests in
  `tests/scanOlder.test.js` and `tests/scanResolve.test.js`. Where to look: the phone on dev's LAN link, auto scan
  on: a black-bordered pre-2014 card (Colossal Might) goes in, or its printings list opens, within 3 s; a
  white-bordered one the same; a modern card goes in as fast as before; the Benalish case (a strip that reads
  flavour text) offers only cards of the name read, or the set-aside message; Branching Bolt's list opens once;
  the phone never freezes on a title it can't read. Untested on a phone: the second reader's memory and warmth on
  an iPhone, and whether two readers truly read at once there. Picked by me, reversible: four letter pairs in ten
  (two for the guess), 300 names scored, a candidate 1.5 ahead of others of its name. Not covered: the FNM title
  read and Title's own press still use the first reader. No migration.
- 2026-10-26 (Phone scanner session): **The scanner's waits cut** (decision 550, the owner's ask: every Tighten
  and Cut item at once): `src/scan/Scanner.jsx` `REST_MS` 0.1 s (was 0.3 s); the settle check on the card's art
  before the strip is cut out and set level; `FIRST_LOOK_MS` 0 (was 0.8 s); `noLineAgain`'s `now`, a blank strip
  with ink in the title straight to older-card mode; one title read on auto scan (was two that agreed): one
  printing sent, several open the list; `SCAN_CARD_BLOCKS` 2. `resolve.js` `resolveText`: no Scryfall searches on
  auto scan without a number read (Scan card still asks them). `older.js` and, in the Buy tab's file,
  `src/lib/scryfall.js` `searchAll` take a `signal`: an older card's printings search and pictures dropped when its
  3 s are up. Tests in `tests/scanResolve.test.js` (the no-number test split: Scan card finds it, auto scan asks
  nothing). Where to look: with 549 below, on the phone over dev's LAN link: a stack of modern cards, each in
  sooner than before; an older white-bordered card goes to its title on the first look and in, or its printings
  list, within 3 s; Scan card done within 3 s. Untested on a phone. Not covered: the phone runs warmer while cards
  come (three looks for one before); a single title read can send the wrong card where two reads would have
  disagreed (only when one printing is left, by its number or clearly by look). No migration.
- 2026-10-26 (Phone scanner session): **3 s a card, then a pick list or set aside** (decision 549, the owner's
  ask after the demo): `src/scan/Scanner.jsx` `CARD_MS`, `cardTime` (the card's 3 s from its first settled look on
  auto scan, from the press on Scan card and Title) and `timeUp` (the three likeliest printings in the printing
  list, else "Couldn't read this card in time: set it aside…"); `resolve.js` `likeliest` and `onCandidates` (the
  candidates whether or not one is taken) and `signal` (a look's Scryfall requests dropped at its end); per try, a
  lookup 1 s and a search 1.5 s; `ocr.js` `READ_MS` 1.5 s (was 5 s); Stop after 1.5 s (was 3 s); the typed name's
  search keeps 10 s (`NAME_MS`). In the Buy tab's file: `src/lib/scryfall.js` `cardBySetNumber` and `searchQuick`
  take `{ signal, timeoutMs }`, the scanner their only callers, defaults unchanged. Tests in
  `tests/scanResolve.test.js`; TEST.md section 10, two new cases and Never stuck brought to 3 s. Where to look:
  the phone on dev's LAN link, auto scan on, a stack of modern cards: each in by about 3 s; a card half out of the
  holder: within 3 s the "Which card? Not sure: match the picture." list or the set-aside message; Scan card on a
  hard card: the list. Untested on a phone. Picked by me, reversible: the reader's 1.5 s rather than the 1 s I first
  proposed (tighter restarts the reader on a slow phone's good reads), Stop at 1.5 s, the list's wording. Not
  covered: a blurry card that stays blurry is set aside at 3 s rather than waiting for focus; an older card's
  printings search isn't dropped at a look's end. No migration. Help: Scanning from a phone is out of date (the
  pick list at 3 s).

- 2026-10-26: **The affected-tests hook removed** (side session, the owner's ask; decision 548, 528 struck):
  `.claude/hooks/test-edit.mjs` deleted with its `.claude/settings.json` entry; the lint hook stays, and the commit's
  `npm test` is the test check again. Where to look: an Edit in a new session shows only "Linting the edited file".
  Untested: nothing to test. No migration. Unpushed, with the entry below.
- 2026-10-26 (main session): **The CC matching audit page, built and reverted the same day** (decision 547; the
  owner: "That was a dead end. I want to go back to the commit before any work began on the repo in regards to the
  audit page."): the seven commits 238e459–1774c4d (the page as that day's decisions 547–549, and their NEXT.md
  entries) reverted by bc2a3ab, the tree 5e28569's again; lint, 531 tests and the build pass. `src/lib/auditCc.js`,
  `src/lib/devDb.js`, `src/pages/export/audit/`, `src/styles/auditcc.css` and `tests/auditCc.test.js` are gone;
  `ChooseRow.jsx`, `App.jsx` and `main.jsx` are as before. The data file and the count stay outside the repo
  (`C:\ClaudeProjects\temp\pug-matching\`). Where to look: nothing to QA; `#/audit-cc` is no longer a route. No
  migration.
- 2026-10-26 (Buy tab session): **SAVE EDIT never saves an unpriced card over a priced one** (decision 546; the
  owner's ask through the main session: "What if we just made it so that an unpriced card can never be saved ontop of
  an already priced one?"): while Skip pricing is on, SAVE EDIT on a line that has a price keeps its price fields as
  they are (`unit_price`, `market_price`, `price_source`, `price_snapshot` with the edit's version written in,
  `priced_at`, the JustTCG ids) unless a manual price was typed; an unpriced line's edit stays unpriced; ADD CARD and
  a phone's scan are unchanged. `skipPricingFields` and `keptPriceFields` in `src/lib/unpriced.js` (tested in
  `tests/unpriced.test.js`), used by `buildLine` (`buyLine.js`), which `PricingScreen.jsx` hands `editing.line`.
  Known and accepted: an edit that changes the printing or condition keeps the old one's price; REPRICE? puts it
  right once the switch is off. TEST.md case in section 7. No migration. Where to look: a project with a priced card,
  Skip pricing turned on, click the card → SAVE EDIT: its price stays (no —, and Not priced doesn't grow); with a
  manual price typed it goes in at that; an unpriced card edited stays —. Untested in the app.
- 2026-10-26 (Records session): **The Changelog shows no price on a card with none** (decision 545; the owner's ask
  through the main session, "I don't want to do a migration for this"): a card row whose price is exactly $0 shows
  none after its text (`rowPrice`, `src/lib/changelog.js`, tested in `tests/changelog.test.js`;
  `ChangelogPage.jsx`), so an unpriced card's edit, removal, strike, restore and export rows no longer read "$0.00"
  (only its add logged none, 0012). Trade-off accepted: a card priced $0 by hand shows no price there too. The
  totals are untouched. TEST.md case in section 17. No migration. Where to look: Changelog → Collections, the entries
  of a card edited, removed, struck or restored on a Skip-pricing project: no price after the card's text; a priced
  card's rows keep theirs. Untested in the app.
- 2026-10-26 (Buy tab session): **The Secret Lair foils generator in the repo** (decision 544; the owner's ask through
  the main session, "Go ahead and move it"): `scripts/sld-foils.mjs` is the temp folder's rainbow.mjs and
  write-sld.mjs as one script (the second only formatted the first's output, so there's no map file between them):
  it reads TCGplayer's Secret Lair groups from tcgcsv.com, pairs each plain product with its "(… Foil)" sibling,
  checks the pairs against Scryfall, and rewrites only the Generated paragraph and `SLD_FOIL_PRODUCTS` in
  `src/lib/sldFoilProducts.js` (`patchModule` stops unless it finds exactly that part; the old writer templated the
  whole module, functions included, so an edit to them would have been lost at the next run). The module's header
  points at the script. Tests in `tests/sldFoils.test.js`: the pairing, the paragraph, the patch, and that the
  module on disk has the part the script looks for. Run once after the move: the same 673 pairs and 533 of 605
  covered as on 2026-10-24, so only the module's header changed ("Generated 2026-10-26"); 226 foil products with no
  plain sibling (Halo Foils and the like) stay unpaired, as before. Where to look: `node scripts/sld-foils.mjs`
  prints each group's pairs and the Scryfall coverage, then "Wrote src/lib/sldFoilProducts.js"; the app is
  unchanged. Left: the temp copy `C:\ClaudeProjects\temp\sld-foils` stays (the owner's to delete); no TEST.md case
  (a dev script, nothing staff see). No migration.
- 2026-10-26: **Closed by the owner** (main session, from its brainstorm of what's missing): a collection SKU
  `102426-1` in CC's search finds only itself, not `-10` and up (the owner checked it: "This worked"); Pokémon on
  the phone scanner, and a third game (One Piece, Lorcana): "Never going to happen" (a memory note, decision 517);
  a trimming pass on the process docs: done (542, 543). The brainstorm's other ideas aren't items until the owner
  picks one.
- 2026-10-26: **CLAUDE.md trimmed and three sections moved** (side session, the owner's ask; decisions 542, 543):
  20,268 → 14,170 bytes, 268 → 200 lines (30%). The wording pass kept every rule (merged bullets, dates dropped
  only beside a decision number); then the Database steps, CLI link, `internal` schema, gotchas and squash moved
  to `docs/DATABASE.md` (read before any migration work), Work mode's four bullets to
  `.claude/skills/workmode/SKILL.md` (What changes while it's on; the hook's line now names it), and the 0002–0013
  history to a pointer. Where to look: CLAUDE.md's Database and Work mode sections, each a pointer plus the rules;
  `docs/DATABASE.md`. Untested: whether a fork reads `docs/DATABASE.md` before its next migration, and the skill's
  rules section the next time work mode is on; the hook's dry run passed (a 12-hour-old switch file stayed silent,
  a fresh one printed the new line). No migration. Unpushed: df651cb, 46ad15a, 68c3065, 0322493 and this entry.
- 2026-10-26: **Work mode for forks only, for 12 hours, never a new item** (decision 541, the owner's ask, main
  session): `.claude/hooks/workmode.sh` (run by both hooks in `.claude/settings.json`) says the line is for the four
  area forks and goes quiet once `.claude/workmode` is 12 hours old; CLAUDE.md's Work mode: the 12 hours, forks
  only, and a blocked fork carries on with its current task or waits; `.claude/skills/workmode/SKILL.md`: the switch
  at the repo's root, the 12 hours in on and the status. The 12 hours is my pick, not the owner's. Tried: the script
  with no file, a fresh one, 11 and 13 hours old, both path styles (all exit 0, quiet at 13). Where to look:
  `/workmode on`, then a fork's turn shows the new line; `/workmode` the next day says it ran out. Untried in a real
  session (hooks load at a session's start). No migration.

- 2026-10-26: **Pushed without a bump** (the owner's ask), decisions 539–540: the Home Screen icon and the name
  "PUG Scanner" on a phone (539, `public/apple-touch-icon.png`, `index.html`), and work mode (540: `/workmode`, its
  hook and CLAUDE.md's rules; `.claude/` and docs only). No migrations (dev and prod both 0001–0013), no Edge
  Function changes. Nothing unpushed.

- 2026-10-26: **Work mode, `/workmode on` / `off`** (side session, the owner's ask; decision 540): the switch is
  `.claude/workmode` (git-ignored); `.claude/skills/workmode/SKILL.md` writes or deletes it and tells each running
  fork; the UserPromptSubmit and SessionStart hooks in `.claude/settings.json` add "Work mode: on since …" to
  every turn while it exists; CLAUDE.md, Work mode: on, a fork's questions go to the main session with its pick, a
  blocked fork reports and keeps working, reversible in-area choices are the fork's ("picked in work mode" in its
  Done entry), outward-facing actions still wait. Where to look: in the main session, `/workmode on`, then any
  turn in any session shows the line; `/workmode off` clears it. Untested: the hook's dry run passed (silent
  without the file, one line with it); not yet seen whether the hook fires on a turn a fork starts from another
  session's message (the CLAUDE.md check of the file is the fallback); the skill not run. No migration. Remote
  Control stays the owner's own setting. Pushed 2026-10-26.
- 2026-10-25: **A Home Screen icon and name on a phone** (decision 539, the owner's ask, main session):
  `public/apple-touch-icon.png` (the logo on `--bg`, 180 × 180, opaque) and two tags in `index.html`
  (`apple-touch-icon`, `apple-mobile-web-app-title` "PUG Scanner"; the name was my pick, the owner didn't choose
  one). TEST.md case in section 10. Where to look: once pushed, the live site in Safari on an iPhone → Share → Add
  to Home Screen: the name PUG Scanner and the logo, not a grey "P" (a shortcut added before keeps its old icon:
  remove it and add it again). Untested on a phone. No migration.

- 2026-10-25: **Pushed without a bump** (the owner's ask, the review skipped on the owner's word), decision 538:
  Mark as Priced and Mark as Paid/Ours show the rates the list pays, and the credit offer's ratio (`590e3ca`,
  Records). No migrations (dev and prod both 0001–0013), no Edge Function changes. Nothing unpushed.

- 2026-10-25 (Records session): **Mark as Priced shows the rates the list pays** (decision 538, the owner's ask):
  Cash and Credit in Mark as Priced and Mark as Paid/Ours read each total over Market (`listRates`,
  `src/lib/rates.js`; `Quote`, `src/pages/collections/DealModals.jsx`), and the hint names the ratio the credit
  offer uses ("the cash offer × 1.79"). No migration. Where to look: a Processing collection with low-end or
  high-end cards → Mark as Priced → the two percentages and the hint; a list all on the master rates still reads
  33.34% / 66.68% and × 2. Untested in the app.
- 2026-10-25: **Pushed without a bump** (the owner's ask, the review skipped on the owner's word: "the changes are
  tiny"), decisions 527–537: the rules for the main session and its forks (527–535, docs and `.claude/` only), the
  launch clean-up (536) and the rollback point's records, and the Copies we own box's stamp 5px lower with this
  printing's full name on pointing (537, Buy tab). No migrations (dev and prod both 0001–0013), no Edge Function
  changes. Nothing unpushed.
- 2026-10-25: **The box's stamp a little lower; this printing's full name on pointing** (decision 537, the owner's
  ask, Buy tab session): `owned.css` `.owned-body .stamp-btn` 5px lower (measured), `ownedRates.js` `ownedRows`
  title. Untested in the app.
- 2026-10-25: **A rollback point at v1.0.5-rainbow** (main session, the owner's ask): the local tag
  `rollback-v1.0.5-rainbow` (`3c226bb`, the app the same as v1.0.5-rainbow's `2077f69`; never pushed) and
  `C:\ClaudeProjects\pug-pricing-tool-backups\backup-20261025-005622-rollback-v1.0.5-rainbow\`: the project copy
  (`.git`, `.env*`, `supabase\.temp`; no `node_modules` or `dist`), `pug-pricing-tool.bundle` (`--all`, verified),
  `db-test-run-dev.json` (641 checks, all passed) and `README.txt` with the roll-back steps. Not in it yet: the
  data backups, the owner's to download (Settings → Download backup, the live site for prod and localhost for
  dev) into that folder. No migration. Unpushed.

- 2026-10-25: **The launch clean-up** (main session, the owner's ask; decision 536): the PUG scratch from finished
  work in `C:\ClaudeProjects\temp`, `temp\pug-squash` and the three pre-launch project copies in
  `C:\ClaudeProjects\pug-pricing-tool-backups` sent to the Recycle Bin (the owner empties it); the tags
  `pre-squash`, `rollback-pre-squash`, `rollback-pre-launch` and `pre-export-build` deleted (commits in the
  decision row). Where to look: those folders, `git tag`. Still the owner's call: `scripts/pokellector-jp.mjs`,
  `scripts/scan-benchmark.mjs` with `temp\line-fixtures`, `title-fixtures` and `scan-run`, and the 2026-10-09
  card-data downloads in temp (`scry_names.json`, `tcgdex_*.json`, `ptcg_sets.json`). No migration. Unpushed.

- 2026-10-25: **After a compaction, re-read the area's state** (side session, the owner's ask; decision 535):
  CLAUDE.md, Working beside the other sessions, one bullet: before the next edit after a compaction, re-read
  NEXT.md's entries for your area and the `/main` skill's area table. Where to look: that section. Untested: seen
  the first time a fork compacts. No migration. Unpushed, with the entries below.
- 2026-10-25: **Three more fork rules** (side session, the owner's ask; decisions 532–534): CLAUDE.md, Working beside
  the other sessions: stage and commit in one call, never `-A`, `.`, `-u`, `commit -a` or `--amend`, and never
  stash, reset, `checkout --`, restore or clean (532); the NEXT.md section: a Done entry carries where to look,
  what's untested and the migration number, so the QA table reads from NEXT.md (533, `/main` section 3 updated);
  Outside your area: `git status --short <path>` before editing another area's file, message and wait if it's
  modified (534). Where to look: the three CLAUDE.md sections named. Untested: whether forks follow them is seen
  in their next commits and entries. No migration. Unpushed, with the entries below.
- 2026-10-25: **The QA table; three tries at a failing check** (side session, the owner's ask; decisions 530, 531):
  `.claude/skills/main/SKILL.md` section 3, one table of everything since the last push when the owner asks what's
  ready to QA and before each push; CLAUDE.md, Checks: three failed fixes, then stop and say. Not tried yet: the
  first QA table comes from the next `/main` session. Unpushed, with the entries below.
- 2026-10-25: **Migration numbers read from disk** (side session, the owner's ask; decision 529): CLAUDE.md, Working
  beside the other sessions: the next migration is the one after the last file in `supabase/migrations/`, committed
  at once to claim it. The suggested HANDOFF.md not made (529 says why). Unpushed, with the entry below.
- 2026-10-25: **The main session starts with /main; a hook runs the tests an edit can affect** (side session, the
  owner's ask; decisions 527, 528): the fork table and briefs moved from CLAUDE.md to `.claude/skills/main/SKILL.md`
  (only the owner can run it), so a session without a task no longer forks; `.claude/hooks/test-edit.mjs`, the
  second Edit / Write hook in `.claude/settings.json`, runs the tests that import the edited file (directly or
  through others) and passes a failure on as a note. Not tried yet: the next `/main`, and the hook's first edit
  in a new session (hooks load at a session's start). Unpushed: 477dc49, 491f4ff and this entry.
- 2026-10-25: **Pushed as v1.0.5-rainbow** (the owner's ask), decisions 507–526: the stale-page reload message
  (507); the owner's six items: the printout's Showcase only (508), the details folding on ADD CARD (509), Secret
  Lair foils priced from their own product (510), collections' and projects' Custom SKUs numbered by the day (511),
  Phyrexian, Dwarven and Elvish printings in English searches (512), projects that skip pricing (513, 514), with
  a TCGplayer-only Pokémon card added unpriced keeping its JustTCG id (526, the pre-push review's finding, Buy tab);
  `master_inventory_abort` retired and an automatic match over a staff pick checked (515); "Retro Schematic" as
  Retro Frame and a schematic family (516); memory notes the main session's (517); the Copies we own box redone
  as one verdict and one list (518–525, 520 rolled back); Help brought up to date for Copies we own, the numbered
  Custom SKUs and Skip pricing. Migrations 0011–0013 went to prod first, the same night (structure-only compare
  the same); no Edge Function changes. Nothing unpushed.

- 2026-10-24 (Records session): **Help says how Skip pricing works** (decisions 513, 514, the owner's ask):
  `README.md`, A collection → **Skip pricing**, a new section between REPRICE? and EXPORT (the switch, the Price
  screen while it's on, the list's — and the Not priced row, EXPORT, REPRICE?, Convert to buy), with a line and a
  link in REPRICE? and Convert to buy…; its own Help page (`src/pages/help/pages.js`, `skip-pricing`).
- 2026-10-24 (Export session): **Help says how collections' and projects' Custom SKUs are numbered** (decision
  511, the owner's ask): `README.md`'s The file → Custom SKU row, Confirm's summary (`102426-#`), Undo export… and
  the collection's list heading.
- 2026-10-24: **Help's Copies we own brought up to date** (the owner's ask, Buy tab session): `README.md` Buy →
  Copies we own for decisions 500 and 518–525 (one verdict and one list, the full CC name on this printing's row,
  the plain Apply under the boxes and the stamp in the box, reasons one to a line, no amounts, "?"). Settings →
  Copies we own needed no change.
- 2026-10-24: **Today's work tested by the owner** (main session): the six items (508–514), Retro Schematic (516)
  and the Copies we own box (518–525), tried in the app as they landed. Closed.

- 2026-10-24: **The stamp a little smaller; Credit / Cash always one line** (decision 525, the owner's ask, Buy tab
  session): `owned.css` `.owned-body .ink-stamp` 170 → 160px (measured with the bold line), `.owned-rates` nowrap.
  Untested in the app.
- 2026-10-24: **The box's stamp as big as its room** (decision 524, the owner's ask, Buy tab session): `owned.css`
  `.owned-body .ink-stamp` 100 → 170px, measured on a rebuilt box (the live one needs the store's sign-in).
  Untested in the app.
- 2026-10-24: **The box's Credit / Cash without their amounts** (decision 523, the owner's ask, Buy tab session):
  `OwnedCounter.jsx` `rates`, its `price` prop dropped (and `PricingScreen.jsx`'s). Untested in the app.
- 2026-10-24: **The box's reasons one to a line** (decision 522, the owner's ask, Buy tab session):
  `ownedRates.js` `ownedReason`, `owned.css` `.owned-why`. Untested in the app.
- 2026-10-24: **A plain Apply button under the boxes, the stamp in the box** (decision 521, the owner's ask, Buy tab
  session): `OwnedCounter.jsx` (`applyButton`, `stampButton`), `owned.css` (`.owned-apply`, `.owned-body`).
  Untested in the app.
- 2026-10-24: **Rolled back: "none" for ×0 on this printing's row** (decision 520, the owner's call, Buy tab
  session): `75c70ca` reverted, it took too much room. Telling ×0 from ×1 on that row: under Open.
- 2026-10-24: **This printing's row names its CC product in full** (decision 519, the owner's ask, Buy tab
  session): `ownedRates.js` `ownedRows`, "Wrath of God · Fourth Edition" on the "this printing" row only. Untested
  in the app.
- 2026-10-24: **The Copies we own box as one verdict and one list** (decision 518, the owner's pick of six mockups,
  https://claude.ai/artifact/5ZCfQSxyU9tfb6gBpD2gJf, Buy tab session): `OwnedCounter.jsx` box rebuilt;
  `ownedRates.js` `ownedRows` (one list, this printing first, its product at ×0 when none) and `ownedReason` (the
  one-line why), tested in `tests/ownedRates.test.js`; `owned.css` new rules, the old box's dropped. Untested in the
  app. Help's Copies we own section now describes the old box.
- 2026-10-24: **Closed, accepted** (the owner's call, main session): the app can't tell when CC's CSV was taken, so
  cards exported between downloading it and uploading it count as in it (`owned_copies` compares `cc_exported_at`
  with `uploaded_at`). The owner uploads right after downloading and never exports in between.

- 2026-10-24: **Closed** (the owner's call, main session): won't fix, Scryfall's other promo types as matching
  families (`planeswalkerdeck`, `gameday`, `storechampionship` and the rest; about 8 of dev's asks, under the
  owner's 20-card bar). Accepted as is: `settings_log` taking the app's sentence as written (the key and match
  entries guarded only by the app); the `settings_save` first-save race tested one save after the other; a `.gz`
  left in the `master-inventory` bucket if the clearing's last answer is lost (`pruneProducts`).

- 2026-10-24 (Export session): **`master_inventory_abort` retired, and an `auto` over a staff pick checked**
  (decision 515, the owner's ask): migration 0013 drops it, on dev; its test-run checks and its place in the
  security-definer list are gone (prune's checks cover both cases); the test run's Export section sends
  `internal.export_learn` an `auto` over a staff pick and checks the pick is left as it was. Test run after 0013:
  `C:/ClaudeProjects/temp/pug-dbrun-0011-0013.json`.
- 2026-10-24: **"Retro Schematic" read as Retro Frame and a schematic family** (decision 516, the owner's ask, Buy
  tab session, in Export's files): `ccMatch.js` `FAMILIES` (`schematic`, joining `retro`) and `evidenceTreatments`
  (`isSchematic`: BRR from 64 on); `importMatch.js` `printingLine` and `scorePrinting` read a printing's Scryfall
  facts as the export does. Tests in `tests/retroSchematic.test.js` and `tests/ccMatch.test.js`. Untested in the
  app (dev has no BRR line).
- 2026-10-24: **Closed, won't fix** (the owner's call, main session): about 15 CC products with "Foil" stuck on
  the name without " - " stay unfound by name at export and in Copies we own (Needs a choice / n/a, never a wrong
  match; only the under-$10 list drops it, decision 498); reopening a closed customer search shows Show all off
  until a letter is typed (`SearchBox.jsx`); CONFIRM BUY's dialog possibly closing when a reconnect lands during
  its read-back (`useDraft.js`, plausible, never seen).

- 2026-10-24: **Skip pricing on the Price screen** (decision 514, item 6 part 2, the owner's ask, Buy tab session):
  `PricingScreen.jsx` reads `list.skipPricing`; `usePriceQuote.js` asks `usePrices` for nothing then (status
  'skipped', no fallback, Cardmarket or warnings); `usePrinting.js` runs no TCGplayer versions search by itself;
  ADD CARD and SAVE EDIT build the line unpriced (`buyLine.js` `buildLine`'s `unpriced`, `unpriced.js`
  `unpricedFields`) unless a manual price is typed; `useScanReceiver.js` adds a phone's scan unpriced and tells the
  phone no price (`priceOf`); `PriceTable.jsx` and `QuotePanel.jsx` say "⚡ Skip pricing is on". Tests in
  `tests/unpriced.test.js`. Needs migration 0012 on prod before it's pushed (the main session's). Untested in the
  app.
- 2026-10-24 (Export session): **A collection's or project's Custom SKU is its day and its number that day**
  (decision 511, the owner's item 4): "102426-1", "102426-2", collections and projects counted together, from 1
  each store day. Migration 0011 (`internal.collection_sku_days`, `internal.collection_sku`, the collection branch
  of `public.export_lines`), on dev; the Confirm step shows "102426-#" (`massCreate.js` `confirmSku`,
  `ExportDialog.jsx`). Tests: `tests/export.test.js`, the test run's Export and Security sections. Untested in the
  app. For the owner to decide: whether Can't upload cards and Bulk pulled from exports get numbers too (now
  today's date, as before); a collection or project exported twice the same day (a project in two batches) gets two
  numbers; a file-only download keeps today's date. Help's The file → Custom SKU row (`README.md`) is out of date.
- 2026-10-24 (Records session): **Projects that skip pricing, part 1** (decision 513, the owner's item 6):
  migration 0012 (`buys.skip_pricing`; `price_source` `'unpriced'` at $0; the trigger
  `buy_lines_unpriced_in_project`; `collection_update_info` takes the switch, `collection_add_line` logs no price),
  reviewed and rehearsed. The switch is in a Paid/Ours project's banner (`CollectionDetails.jsx`); the list shows
  — and a Not priced totals row (`BuyList.jsx`, `src/lib/unpriced.js`); REPRICE? and both Convert to buy… items
  stop with why (`CollectionPage.jsx`, `RowAction.jsx`). Test-run section "Skip pricing (0012)". On dev with
  0011 (the Export session's push, snapshot and test run: all passed, its 13 checks too); **not on prod yet**, with
  0011. Left as is: a card with no price reads "Bought $0" in the export dialog (`ExportDialog.jsx`, the Export
  session's) and $0 in the Changelog's remove, edit and export rows (only the add's row shows none); a Pokémon
  one with no price today prints a 50¢ sticker. Part 2, the Buy tab's: `PricingScreen` reads `list.skipPricing`
  and sends `price_source: 'unpriced'`, `unit_price: 0`, `market_price: null` (`UNPRICED`, `src/lib/unpriced.js`);
  phone scans into the project too. Untested in the app.
- 2026-10-24: **Phyrexian, Dwarven and Elvish printings in English searches** (decision 512, the owner's ask, Buy tab
  session): `scryfall.js` `keptLanguage` keeps `ph`, `dw` and `qya` (`KEPT_LANGUAGES`), so the Buy tab, the
  details' siblings and Import Collection find them; `printings.js` `magicTraits` gives each a language trait;
  `ccMatch.js` reads CC's " - Phyrexian" as a family (`LANGUAGE_FAMILIES`). Tests in `tests/packLanguages.test.js`.
  Left as is: no tag on the line or a JP-style badge on the suggestion (the line stays `lang` en; the database
  allows only en and ja), and the phone scanner's own name search (`src/scan/`) wasn't looked at. Untested in
  the app.
- 2026-10-24: **Secret Lair foils priced from their own product** (decision 510, the owner's ask, Buy tab
  session): `src/lib/sldFoilProducts.js` (`SLD_FOIL_PRODUCTS`, 673 pairs from TCGplayer's catalogue via
  tcgcsv.com; `sldFoilLookup`, `sldFoilResult`) wired into `prices.js` `lookupsFor` and `resultFor` beside the
  surge foils; tests in `tests/sldFoil.test.js`. No JustTCG call was made to check it, so whether JustTCG prices
  each foil product is untested; 72 of Scryfall's 605 SLD foils with no price aren't covered (most have no
  TCGplayer product on Scryfall). A new drop needs the table made again: `C:\ClaudeProjects\temp\sld-foils\`,
  `node rainbow.mjs` then `node write-sld.mjs`. Untested in the app.
- 2026-10-24 (Records session): **Adding a card folds a collection's details** (decision 509, the owner's item 3 of
  6): `CollectionPage.jsx`'s `list.add` counts each add that went through (`folds`); `CollectionDetails.jsx` folds
  on each new count, even if reopened. Covers ADD CARD, Enter and a phone's scan (all through `list.add`),
  overnight buys and projects; SAVE EDIT doesn't fold. `PricingScreen.jsx` unchanged. TEST.md case in section 11.
  Untested in the app.
- 2026-10-24 (Export session): **A showcase card prints as Showcase, never Borderless too** (decision 508, the
  owner's ask, item 2 of 6): every Magic printout drops Borderless from a line that's also Showcase
  (`src/lib/auditPrint.js` `printedTreatments`, used by `auditRow`; test in `tests/auditPrint.test.js`); the Price
  screen and the stored treatments are unchanged. TEST.md case in section 14. Untested in the app.
- 2026-10-24: **A page opened before a push says to reload** (decision 507, the owner's report from work, main
  session): Print MTG on a tab opened before the 11:05 push failed with "Failed to fetch dynamically imported
  module" (the old `auditPdf-DLNn6FRa.js` is a 404 on the live site). `src/main.jsx` listens for
  `vite:preloadError` and `src/lib/staleBuild.js` `explainStaleBuild` (tested) puts the plain words on the
  error, so the toast says to reload (F5). Lint, 503 tests and the build pass; untested in the app. Not
  pushed. Not done: the page doesn't notice a new build by itself; a tab is only told when it next loads a part.
- 2026-10-24: **Pushed without a bump** (the owner's ask), decisions 496–506: `scripts/db-baseline.mjs` retired
  and `.claude/launch.json` ignored (496); Export and printouts: Ctrl+Click Download copies Magic singles under
  $10 (497, 498); Buy tab: the Copies we own box names its Crystal Commerce product (499–504), and the condition
  prices sized to their buttons (505, 506). No migrations (dev and prod both 0001–0010), no Edge Function
  changes. Nothing unpushed. Help out of date: Buy → Copies we own (`README.md`), for the "Crystal Commerce
  Match:" line (499–504) and the new ? "(didn't go through: try again)" (500). The review's other notes, not
  acted on: the under-$10 list drops only a stuck-on " Foil", so a "Galaxy Foil" written without " - " would keep
  "Galaxy" (`underTen.js`); the Ctrl+Click copy likely fails in Safari and Firefox (it runs seconds after the
  click); `priceFit.js`'s widths are Segoe UI's, so a Mac's font may sit closer to the button's edges.
- 2026-10-24: **Condition prices sized to their buttons** (decision 505, the owner's ask, Buy tab session):
  `PriceTable.jsx` `priceStyle` gives the price's width in ems (`src/lib/priceFit.js` `priceEms`, tested in
  `tests/priceFit.test.js`); `conditions.css` `.pc-price` sizes it to 94% of its button (84% at first, decision
  506), 18px at most. Measured
  in the font on dev's sign-in page (the app needs the store's sign-in), not on the live buttons; untested in
  the app.
- 2026-10-24: **"Crystal Commerce Match:"** (decision 504, the owner's ask, Buy tab session): the Copies we own
  box's line in `OwnedCounter.jsx`. Untested in the app.
- 2026-10-24: **The Copies we own box's title a little bigger** (decision 503, the owner's ask, Buy tab session):
  `owned.css` `.owned-pop-head` 12px → 14px. Not measured live (the preview needs the store's sign-in); untested
  in the app.
- 2026-10-24: **The whole matched product in quotes, in blue** (decision 502, the owner's ask, Buy tab session):
  `OwnedCounter.jsx` and `owned.css` `.owned-pop-match-product`. Untested in the app.
- 2026-10-24: **The box's CC product on two lines, its name in blue** (decision 501, the owner's ask, Buy tab
  session): `OwnedCounter.jsx` splits the line; `owned.css` `.owned-pop-match-product` keeps the product on one
  line (… when long), the name bold in `--accent`. Untested in the app.
- 2026-10-24: **A match that didn't go through says so** (decision 500, the owner's ask, Buy tab session): a failed
  match in `owned.js` `lookUp` comes back as `cc_match_failed` and `ownedCopies` doesn't keep it; `ownedRates.js`
  `ownedCounts` gives `matchFailed`; `OwnedCounter.jsx` shows "?" with "(didn't go through: try again)", whose
  click (or the boxes') runs `useOwnedCopies`' `refresh`. Test in `tests/ownedRates.test.js`, case in TEST.md
  section 7. Untested in the app.
- 2026-10-24: **The Copies we own box names its CC product** (decision 499, the owner's ask, Buy tab session):
  `owned.js` `lookUp` returns the matched product as `cc_match`, `ownedRates.js` `ownedCounts` carries it as
  `cc.match`, and `OwnedCounter.jsx` shows "Crystal Commerce: <name> · <category>" under the box's head
  (`owned.css` `.owned-pop-match`), with copies or none; nothing new for n/a or no inventory. Test in
  `tests/ownedRates.test.js`, case in TEST.md section 7. Untested in the app.
- 2026-10-24 (Export session): **Under $10 takes every row, and drops a stuck-on "Foil"** (decision 498, the
  owner's ask): the first list missed about 1,040 names in CC's newer sets, whose URLs lack the
  `magic_the_gathering_singles-` prefix; the URL test is gone (`src/lib/underTen.js` `underTenName`, `STUCK_FOIL`).
  Untested in the app.
- 2026-10-24 (Export session): **Ctrl+Click Download copies Magic singles under $10** (decision 497, the owner's
  ask, a secret like 285): Settings → Master Crystal Inventory's Download, Ctrl or Cmd+Click, copies `1 <name>` a
  line (`src/lib/underTen.js` `underTenName`, `underTenText`, tests in `tests/underTen.test.js`;
  `masterInventory.js` `underTenList`; `MasterInventoryPanel.jsx` `copyUnderTen`). The owner tried it: 3,400 names,
  quick. Not checked: a clipboard refused when the window loses the front during the read (a toast says so).
- 2026-10-24: **`scripts/db-baseline.mjs` retired** (decision 496, the owner's ask): last copy at `a8fb952` (the
  spec's Retired documents row, CLAUDE.md's Where things are); `scripts/lib/linked.mjs`'s comment updated.
- 2026-10-24: **`.claude/launch.json` ignored** (the owner's ask): Claude's preview config stays per computer
  (`.gitignore`), so a push's status check is empty. The v1.0.4-setup review's other notes closed by the owner, no
  change: Help's lone-product and lost-pick wording, `code-map.mjs`'s run-path check.
- 2026-10-24: **Pushed as v1.0.4-setup** (the owner's ask, written "v1.04-setup"; 1.0.4 since npm's versions take
  no leading zero), decisions 489–495: Help's matching sections (484–487), the mixed-rates \* on an all-low-end
  list (489), TEST.md's new cases and SETUP.md's paused-project check, three docs retired (490), CODE_MAP.md for
  new sessions (491), the main session with its four forks (492–494), and a new session reading the release skill
  and the reviewer (495). No migrations (dev and prod both
  0001–0010), no Edge Function changes. Nothing unpushed.
- 2026-10-24: **Outside your area, and when sessions message** (decision 494, the owner's ask): CLAUDE.md's two new
  sections under Start of a session replace the fork brief's "say so before changing anything outside it" and the
  Passing tasks on bullet. Not tried yet.
- 2026-10-24: **Tasks passed on by the main session** (decision 493, the owner's ask): CLAUDE.md, Working beside
  the other sessions: a task the main session passes to a fork, quoting the owner, counts as the owner's; a fork
  still asks before a push, a prod migration or deleting data. Not tried yet.
- 2026-10-24: **The main session and its four forks** (decision 492, the owner's ask): CLAUDE.md, Start of a
  session: a new main session forks Buy tab, Records, Export and printouts, and Phone scanner after its reading,
  with the rules for sharing one folder (decision numbers read from disk, NEXT.md and TEST.md edited in small
  pieces, files staged by path, only the main session pushes). Not tried yet: the next new session is the first
  to start the forks.
- 2026-10-24: **CODE_MAP.md for a new session, not a fork** (decision 491, the owner's ask): `scripts/code-map.mjs`
  (`buildMap`, `headerOf`, `exportsOf`; tests in `tests/codeMap.test.js`) writes the spec map and the code map;
  `.gitignore` keeps it out of git; CLAUDE.md's Start of a session runs it in a new session only. 25 files have no
  header comment or exports, so their line is the name alone (most pages, e.g. `DayPage.jsx`); a header added
  later shows up the next time the map is built.
- 2026-10-24: **Three finished docs retired** (decision 490, the owner's ask): `MATCHING.md`, `SQUASH.md` and
  `docs/TEAM_FEEDBACK.md`, last copies at `681c5c6` (the spec's Retired documents row). SQUASH.md's live facts
  moved first: the migration gotchas to CLAUDE.md's Database section, prod's Max rows to `docs/SETUP.md`.
  References fixed in CLAUDE.md, FABLE.md, TEST.md, SETUP.md and pug-reviewer; code comments keep citing them, as
  with decision 336.
- 2026-10-24: **NEXT.md trimmed**, on the owner's ask (630 lines to about 60): closed items and the Done history
  before v1.0.3-neverguess dropped (in git). Closed by the owner: the live site's setup (the computer named, the
  users added, the CC CSV uploaded, which also starts the copies-we-own counts and clears the second inventory
  copy, decision 414), past totals under the new rounding (478), the backup key's missing meter (436–439), and
  watching JustTCG usage.
- 2026-10-24: **SETUP.md's paused-project check writes nothing on prod** (decision 380): look at Settings and the
  Changelog; no test card, no Test (both move the usage counter, `secrets` `call`'s `record`). Also in TEST.md:
  the store's phone case runs on dev's LAN link.
- 2026-10-24: **TEST.md cases** for decisions 374, 426, 427, 430, 436–445 and 489, and two brought up to date: the
  stamp's press-down (488) and a click on a menu group (442). 269 cases.
- 2026-10-23: **A list whose every card is low-end shows its mixed-rates \*** (decision 489, the owner's ask):
  `rates.js` `mixedRateLines` is empty only when every card is on the list's own rate; a buy-wide custom rate
  still has none. Two unit tests (`tests/rates.test.js`). Lint, 488 tests and the build pass; untested in the app.
- 2026-10-23: **Help brought up to date for the never-guess matcher** (decisions 484–487, the owner's ask,
  `README.md`): Export → 1. Matching's steps and Picking the product (the three cases it takes a product by
  itself, extra words, the Scryfall facts), Remembered matches, and Settings → Crystal Commerce matching's
  Products row.
- 2026-10-23: **Pushed without a bump**, decision 488: the APPLIED / NOT APPLIED stamp presses down when it lands
  (`owned.css` `stamp-in`). No migrations, no Edge Function changes.
- 2026-10-23: **Pushed as v1.0.3-neverguess**, decisions 484–487: the export never guesses a Crystal Commerce
  product; only staff picks are remembered and used; a lost staff pick is asked again. Migration 0010 on dev
  (snapshot, test run: all 626 passed) and on prod the same sitting, the structure-only compare the same. The
  matching audit behind it is `MATCHING.md` (retired, `git show 681c5c6:MATCHING.md`); `C:\ClaudeProjects\temp\pug-matching\` `sweep.mjs` and `rules.mjs`
  re-measure a rule.
