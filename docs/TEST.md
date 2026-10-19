# Smoke test

One pass through the whole app, tab by tab, before a release or the move to prod. Each case says what to do and
what happens. The findings are reported when the pass ends.

- **Build under test:** the Settings footer shows it (0.9.9.13-scanner2.0 or later).
- **Where:** the dev project only (`psucrzljraxeootwnltf`), through the local dev server (`start.bat` →
  http://localhost:5180). **Never prod.**
- **Who:** the owner, or Claude in the browser pane at the owner's request (FABLE.md, "a smoke pass the owner asks
  for"). The owner does the phone, two-computer and store cases.
- **How long:** about two hours, 181 cases.

## Ground rules

- **Test data is named `SMOKE …`** (customers, collections, projects, users), so the clean-up finds it all. Test
  customers use 555 numbers: `(555) 010-0001`, `(555) 010-0002`.
- **Nothing goes to Crystal Commerce.** EXPORT runs on dev and its file is checked here.
- **The JustTCG budget:** note Settings → JustTCG usage at the start and the end. The pass uses well under 150 of the
  day's 1,000 requests.
- **Test files stay outside the repo** (CSV files for Import Collection go in a scratch folder).
- **Every finding is noted** with its steps, what happens, what should happen, and a priority, and the list is
  reported when the pass ends: **P1** breaks or hides something staff rely on; **P2** is wrong or misleading, with a workaround; **P3**
  is cosmetic.
- **Nothing is fixed during the pass.** Fixes come afterwards, from the findings.

---

## 1. Setup

- [ ] The app loads and signs in; the Settings footer shows the build under test.
- [ ] The computer has a name (Settings → This computer).
- [ ] Settings → JustTCG usage and the time are noted: ________
- [ ] **Download backup** (Settings → Backups) saves a JSON file, kept until the pass is over.
- [ ] Two users exist to switch between (`SMOKE Ash` and `SMOKE Misty`, added if needed).

## 2. The header

- [ ] **A new tab starts on Pick user**; a reload of a tab keeps its user.
- [ ] **With no user picked**, ADD CARD, + Price Collection and Home's quick actions look disabled and pulse the
      user button; nothing is created.
- [ ] **An unused tab forgets its user after 30 minutes.** To skip the wait, the page's console runs
      `const real = Date.now; Date.now = () => real() + 31 * 60000;`; within 30 seconds the user is un-picked and a
      yellow message says why. A reload undoes the trick.
- [ ] The sign-out icon un-picks the user; the user button and the coloured band show the picked user's colour.
- [ ] **Who's on** (decision 284), left of Changelog: a green dot with **N Connected** and a dot per picked user with
      **N Users selected**; hovering names them. A second tab adds one to each.
- [ ] **Header search** `bolt`: Paid/Ours collections at the top, then buys under their dates; **Show all** adds the
      rest, faded.
- [ ] **Show all finds struck cards** (decision 275): a struck card shows crossed out with a grey **Struck** chip whose
      tooltip says who and when; without Show all it isn't there.
- [ ] **From the address bar:** `…/#/price/Wild Growth-342-5ED` opens the Buy tab with that search, on a fresh stage.

## 3. Help

- [ ] **?** beside the sign-out icon opens Help on About the app: contents on the left, one page on the right; the
      Preamble fits at 1366×768 without a scroll.
- [ ] **← / →** turn the pages, and do nothing while typing in a box; the prev/next buttons work; the contents panel
      opens only the current chapter; a picture zooms, Esc closes it.
- [ ] **Help search** (decision 299): "stickers" lists the Print PKM Stickers? pages first, each with its chapter, a
      count and a line with the word marked; ↓ ↑ Enter opens one at the word, highlighted; "pokemon" finds "Pokémon";
      "zzz" says no page has it; Esc clears the box and the highlights.
- [ ] Help covers the latest changes: **Promos** and **A tall stack?** under Scanning from a phone, The List in the
      search bar, special foils under Finish and Details: Magic.

## 4. Home tab

- [ ] Today, Quick actions, Collections and projects (with the Can't upload cards tile), Days to export and Recent
      activity all show.
- [ ] **Cards by game on a name** (decision 276): pointing at a collection's name shows a chip per game ("MTG 4
      cards", "PKM 3 cards + 100 bulk"), "No cards yet" when empty; the same on the Collections tab, not cut off on
      the table's last row.
- [ ] A project's oldest price turns amber after 14 days.

## 5. Buy tab: searching

- [ ] **One match is selected at once** (decisions 247, 325): `Sol Ring 472 CMR` selects its card as soon as the
      picture shows, the prices after; Enter adds it.
- [ ] **Several matches:** nothing is selected; ↓ picks the first; Enter with nothing selected says to select a card
      first. A name with results in both games ("Lightning") selects nothing by itself.
- [ ] Clicking the selected card un-selects it; a search that drops the selected card clears it.
- [ ] A misspelt name still finds the card, with "Showing results for …" under the bar.
- [ ] A name that ends in a number is searched as that name: `Spider-Man 2099` (Magic), `Energy Removal 2` (Pokémon).
- [ ] **A number finds the promo pack printing too:** `Nashi 223` shows DSK 223 and PDSK 223p.
- [ ] **The List in number searches** (decision 329): `rootborn def 26` shows RVR 26 first, then PLST RVR-26; `rvr 26`
      shows both; `rootborn def 21` shows MM3 21 and PLST MM3-21, not RVR-26.
- [ ] **Japanese Magic printings:** `Cyclonic Rift SOA 79` is marked **JP**; where the set has the card in English too,
      the **Japanese** checkbox in Details flips between the two.
- [ ] Right-click on a suggestion searches its name; Newest / Oldest first sorts the printings; **… show all** opens
      every match (arrows move, Enter picks, Esc closes).
- [ ] **Japanese Pokémon prices:** JP on, `025/165 SV2a` (Pikachu) shows JustTCG prices, not only Cardmarket.
- [ ] **"No." search:** JP on, `No. 121` shows TCGdex's old Starmies, then TCGplayer's extras marked **From
      TCGplayer** (Misty's Starmie, CGD No. 121), no modern Starmie. With EN on, `No. 121` shows the yellow
      "switch to JP" hint, as does `125/197 OBF` with JP on; the link switches and searches again.
- [ ] A Japanese card shows its English name beside the Japanese one, a trainer's included (*Misty's Starmie*).
- [ ] An English card TCGdex doesn't list comes up from TCGplayer, marked **From TCGplayer**.

## 6. Buy tab: the card, finish and versions

- [ ] **FOIL switch:** green FOIL ON or red FOIL OFF; 🔒 on a printing made one way; **Etched** shows only where an
      etched printing exists. Foils shine; ⟲ Flip shows a two-faced card's back.
- [ ] **Tick boxes** move to the printing with that trait (Borderless, Showcase); **grey chips** are traits every
      printing in the set shares.
- [ ] **Special foils go with FOIL** (decision 326): `Kefka, Dancing Mad FIC 84` opens FOIL OFF, Surge foil unticked;
      ticking Surge foil turns FOIL ON; Alt+F off unticks it; ADD CARD with FOIL off stores no Surge foil tag, with
      FOIL on it does; from FIC 174 (extended art), ticking Surge foil moves to 84 with FOIL ON.
- [ ] Card details' **View on Scryfall / TCGplayer / Cardmarket** each open a pop-up window.
- [ ] **Missing printing:** `Staryu 33` (XY): a moment after selecting, REVERSE turns on with a **TCGplayer** chip, at
      JustTCG's reverse holo prices, with no extra search.
- [ ] **Jumbo left out, stamp merged:** `Mimikyu ex 069` (Journey Together), HOLO: just Standard and Journey Together
      Stamped, the stamped one priced above; no second stamped version, no jumbo.
- [ ] **Play! Pokémon stamp:** `Super Rod 188` (Paldea Evolved) has a **Play! Pokémon stamp** version that puts the
      logo bottom right; its REVERSE shine covers everything except the art box, lined up with it.
- [ ] **Pokémon Center stamp:** `Snorlax 051` (SV promos) reads **Pokémon Center stamp** and shows the round emblem
      bottom right.
- [ ] **Patterns:** JP `121/165 SV2a` (Starmie), reverse: the Poké Ball and Master Ball versions show their ball badge,
      and the Poké Ball one is never priced above the Master Ball one.
- [ ] **No World Championship deck cards:** `Pidgeot 10/112`, HOLO, offers no player-named stamp.
- [ ] **The default version is TCGdex's:** `Pikachu 027 SVP` opens on the holo (~$18), not TCGplayer's NORMAL "Baby".
- [ ] **Shine:** `Pikachu 027` (SV promos, holo) shines whole; a Sword & Shield promo (`SWSH050` Charizard V) keeps
      its frame's shine; full arts and rule-box cards shine across the card; a normal holo and JP Neo Premium File 1
      **Typhlosion** (`No. 157`) only on the art box.
- [ ] **TCGplayer versions on request** (decision 289): `Charizard ex 223/197 OBF` shows no TCGplayer versions until
      **Other TCGplayer versions…** ("Looking on TCGplayer…", then the extra versions or "No other TCGplayer
      versions."); Settings → JustTCG usage climbs about one per Pokémon card.
- [ ] **Wrong products put right** (decision 286): `Charmander 44/225 SVP` prices as Charmander (~$50, not ~$5) and
      View on TCGplayer opens Charmander 044; `Mimikyu V TG16/TG30` prices ~$80.
- [ ] **Own products read as the version** (decision 287): `Exeggcute 1/131 PRE` Master Ball pattern and `Rowlet SM01`
      show JustTCG's five conditions, with no fallback tag.
- [ ] **The name search by the set's home** (decision 288): `Purugly 36/130` (Diamond & Pearl) and a Sun & Moon base
      card get prices.

## 7. Buy tab: prices and rates

- [ ] Hovering a price button explains where the price came from; Use TCGplayer and Use Cardmarket price from those.
- [ ] A card with no price at all asks for a manual price at ADD CARD (Alt+M).
- [ ] **Better conditions from JustTCG's best price** (decision 338): `blastoise 2 bs` 1st Edition, Holo shows NM and
      LP at MP's price tagged "fallback", MP JustTCG's own, HP and DMG lower, each a fallback; hovering NM says
      "JustTCG's MP …, as JustTCG has no NM price".
- [ ] **Surge foils priced** (decision 316): `Altered Ego FIC 317` with FOIL is priced (~$0.40, JustTCG's conditions);
      its non-foil ~$0.20.
- [ ] **Totals** show Cash and Credit at the master 33.34% / 66.68%; cards under $3 or over $35 use the low-end and
      high-end rates.
- [ ] **Right-click a card → Set Rate:** its own Cash % and Credit %, Maintain ratio, a red box when Cash is over
      Credit; the line is tinted with ✎; **Clear Rate** takes it off.
- [ ] A custom rate for the whole buy shows its percentage with ✎ in the totals.

## 8. Buy tab: the buy list and CONFIRM BUY

- [ ] A Magic card, an English Pokémon and a Japanese Pokémon go under their headings; the totals add up.
- [ ] **Qty:** Alt+Q, 3, Enter adds 3, and Qty reads 1 again.
- [ ] **Every card starts fresh** (decision 272): Lightning Bolt in LP with Use Cardmarket, another card, then Bolt again
      opens NM with no tag; a placeholder's typed name and price go the same way.
- [ ] **Editing a line shows every printing** (decisions 319, 324): clicking a Sol Ring CMR line searches "Sol Ring",
      the line's own printing first and selected, with its condition and price; another search mid-edit (Counterspell)
      keeps the edited card first; Esc returns the line as it was; SAVE EDIT saves over it.
- [ ] A basic land's line still edits (its exact search); a Japanese Pokémon line keeps its number search.
- [ ] **SAVE EDIT finds every kind of line:** Magic, TCGdex Pokémon (`Charizard 4/102 BS`), Japanese, a TCGplayer-only
      version, bulk (`BULK pkm`) and a placeholder (its name back).
- [ ] Hovering a line shows its picture; × removes it after asking, and with several copies asks how many.
- [ ] **mimp mode** (decisions 293, 323): 🌼 lit to start, ADD CARD clears the card area; 🦇 keeps the search and the
      card with Qty back to 1; kept from buy to buy, 🌼 again when the screen opens; SAVE EDIT always clears.
- [ ] **CONFIRM BUY** asks for name, phone and purchase price (Cash or Credit); each is required.
- [ ] **Past customers:** `SMOKE` in the name suggests earlier SMOKE customers; ↓/Enter fills the last phone, which
      can still change; Esc closes only the list.
- [ ] Confirming as `SMOKE Ash`, `(555) 010-0001`, $10 cash ends "Pick your user for the next one" and un-picks the
      user.
- [ ] **BUY COMPLETE** (decision 292): "Cards saved in the Calendar page: Magic · <today>" in green, Buy N · customer,
      the count and what was paid; Print MTG? / Print PKM? open that buy's printout; No thanks, × and Esc close it.
- [ ] **Buys numbered forever** (decision 290): the confirm says "Buy 42" (one more than the last buy of either game);
      the day page, the Changelog, the header search and the printout show the same number; the next buy is 43.
- [ ] The buy is on today's day page, in the user's colour, with a green Paid/Ours chip.

## 9. Buy tab: bulk

- [ ] `bulk` finds the bulk items; 10 × MTG 100 Commons & Uncommons goes in as one line (1,000 cards), at the top of
      its heading.
- [ ] Right-click a bulk line → **Set value** shows live Cash and Credit; **Back to $1.50** returns to Settings' value.
- [ ] **Bulk counted apart** (decision 273): a buy with cards in both games and bulk: the other game's day page says
      "Also has 3 Pokémon cards + 100 bulk →", the Changelog "… cards + 100 bulk bought", the green chip counts cards
      only; a placeholder counts as a card.

## 10. Buy tab: scanning from a phone

On a phone, the laptop runs `npm run dev:lan` and the phone opens `https://<laptop's address>:5180/#/scan`
(docs/SETUP.md). Without a phone, `#/scan` in a second browser on the laptop uses the webcam. The run log
(`C:\ClaudeProjects\temp\scan-run\scan-log.jsonl`) records each card on the LAN server.

- [ ] **Pairing:** the phone lists the laptop's Buy tab, a project and a collection as they open and close; Pokémon
      only or a Paid/Ours collection greys the row with why; a tap pairs, and the laptop shows **📱 <phone> · 0
      scanned** with ×; × or leaving the price screen sends the phone back to its list, saying why.
- [ ] A second phone pairing replaces the first, which says so; after a minute without the phone the chip says
      **away**.
- [ ] **Awake while scanning** (decision 320): with the laptop's display set to sleep after 2 minutes, 5 minutes of
      scanning keeps it on; 10 minutes after the last card it sleeps as usual.
- [ ] **Scan card on a modern card:** the strip goes Sending → Pricing → ✓ Added at $…, with a chime (two notes, three
      for a foil); the laptop's line flashes in at the Use TCGplayer price; JustTCG's usage doesn't move.
- [ ] **Condition and finish:** LP + Foil adds `*F* [LP]`; a non-foil-only card stays non-foil; Detect reads the foil
      star (★) as foil and the dot as normal.
- [ ] **Auto scan:** cards laid one after another go in once each, once the card stops moving (decision 322); a card
      left in the holder isn't added twice.
- [ ] **+1** and a tap on the middle of the picture add another copy of the last card; **↶ Undo** takes one copy back;
      **✦ FOIL? / NON FOIL?** swaps its finish, priced again.
- [ ] **No price:** an obscure promo makes the phone ask; Add at $… adds it as a manual price; Skip this card adds
      nothing.
- [ ] **Refused:** a German card ("Not English"), the back of a card ("Couldn't read"), the laptop's user signed out
      ("Pick a user on …", then fine once picked).
- [ ] **Blurry:** the info box gets an amber border and auto scan waits; after a few blurry looks the camera refocuses.
- [ ] **Too dark** (decision 306): in a dim corner the strip suggests 💡; light clears it; a black-bordered card in good
      light never gets the hint.
- [ ] **Rest when idle** (decision 304): after a minute with an empty holder, a card laid in is read within about a
      second.
- [ ] **The view keeps up** (decisions 312, 317): over a 150-card stack the view shifts slightly around every 20th card
      without adding a card twice, and the info box keeps both collector lines whole near the top of the stack.
- [ ] **A tall stack** (decision 331): at 100 cards (+1 copies count) an amber note under the picture says "100 cards on
      the stack…" while scanning carries on; a tap hides it; at 200 it's back; ■ Stop, then START CAMERA, starts the
      count over.
- [ ] **Reset view** lets go of the card and the next card locks it again; Stop leaves the view alone.
- [ ] **The List:** a List card (planeswalker mark at its bottom-left) goes in as its List printing.
- [ ] **Older card titles** (decisions 308, 309): Courser of Kruphix, a 4th Edition card and a Mercadian Masques card
      (white title): **Title** shows the name level and whole in the info box and opens the right printings, also
      with the card a little high or low.
- [ ] **An older card's printing:** a 2005 card goes in by its "123/350" or opens its printings; a 1995 card opens its
      printings to pick by set symbol; **View all** lists every printing.
- [ ] **Which card is it?** (decision 311): Heaven's Gate (Legends), or any unreadable title: Title opens the box with a
      guess; × clears it; "heav" lists Heaven's Gate; tapping it opens its printings; auto scan opens the box by itself
      after a few looks; Skip this card sets the card aside for good.
- [ ] **Stamped promos** (decision 328): Nashi, Searcher in the Dark with the 2024 stamp goes in as PDSK 223s, foil
      (`+prerelease` in the run log); Aziza, Mage Tower Captain with the planeswalker stamp as PSOS 174p (`+promopack`);
      the plain DSK 223 and SOS 174 go in plain.
- [ ] **Stamp check timing:** in a run, unstamped rares' `stamp` log lines keep both spots under 0.53, and cards go in at
      the usual pace but for the first card of each set.
- [ ] **FNM promos** (decision 327): Renegade Rallier ("009/012 P / FNM") goes in as F17 9, foil (`fnm-artist`); a
      2015 or 2017 FNM promo numbered 1 goes in by its title (`fnm-title`), or the Which FNM promo? list opens.
- [ ] **PRM promos** (decision 313): Etali, Primal Storm ("100/196 P / PRM ★ EN") opens "Which Etali, Primal Storm? A
      promo: match the stamp." with its promo printings; the pick goes in as foil when the strip shows the star.
- [ ] **A scan saved once** (decision 302): with the laptop's network throttled, a slow send goes in once; only after
      three tries does the phone say "No answer from the computer after three tries".
- [ ] **The camera cut off** (decision 303): a call (or the phone's own camera) makes the strip say the phone has the
      camera; back, scanning carries on with the view still locked; a frozen picture restarts itself within seconds.
- [ ] **Never stuck** (decision 300): on a slow network Scan card ends within 20 s with "That took too long…"; after
      3 s the button reads "Reading… tap to stop", and a tap stops it; holding Scan card (a buzz) starts over and reads
      the card in the holder, opening no menu or text selection.
- [ ] **Stop is an abort** (decision 321): ■ Stop mid-read or mid-refocus takes the picture and the phone's green
      camera dot away at once; the camera stays off until START CAMERA.
- [ ] **The computer never stuck** (decision 307): with the laptop on Slow 3G, scans finish or fail with a reason within
      30 s and the next go in once the connection's back; a scan waiting over 15 s says "still waiting on <computer>"
      in amber.
- [ ] **🔔 resets the sound** (decision 318): when the chimes go quiet, 🔔 off and on plays a chime at once and the next
      cards chime, with the iPhone's silent switch on too.
- [ ] The desktop app is unchanged at 1200 × 650 and up.

## 11. Collections tab: collections

- [ ] The tab has System, Projects and Collections tables; the status chips filter Collections, Rejected included.
- [ ] **Every row's ⋯:** Delete collection… everywhere, Convert to buy… on projects only, none on System; clicking ⋯
      doesn't open the row; the menu isn't cut off on the last row.
- [ ] A row open on another tab or computer greys its ⋯ items with who's editing it.
- [ ] **+ Price Collection** needs a name, a 10-digit phone and the Last 4 ID; Create shows what's missing; the name
      suggests past customers and fills the phone, never the Last 4 ID.
- [ ] `SMOKE Collection`: cards added, **Mark as Priced** (an offer), **Mark as Paid/Ours** (the price paid).
- [ ] **EXPORT stamps, doesn't complete** (decision 294): EXPORT on the Paid/Ours collection stamps its Magic cards (the
      Custom SKU chip shows, prices turn green) and leaves it Paid/Ours; EXPORT again says every Magic card is exported.
- [ ] **Completed by hand:** the status menu or "Mark as Completed →" sets Completed from Paid/Ours; Reopen puts it back
      to Paid/Ours with the stamps kept.
- [ ] **Undo export…** (decision 298): on an exported Paid/Ours collection, ⋯ → Undo export… asks, then the SKU chip
      goes, the prices turn white, the Changelog says "Export undone", and EXPORT offers the cards again; on a
      collection never exported the item is greyed.
- [ ] **Rejected:** `SMOKE Rejected`, from Priced, rejected with a reason, locks (no adding, editing, REPRICE? or
      EXPORT), shows $0 paid in red and is left out of the header search unless Show all; **Reopen** goes back to Priced
      with its offer; the Paid/Ours dialog's **Mark as Rejected?** switches to the Reject dialog.
- [ ] 📞 on a Priced collection counts calls, each in the Changelog.
- [ ] REPRICE? on a Processing collection says "rounded down as always".
- [ ] ⋯ → **Print collection** opens its Magic cards' printout.
- [ ] A second tab of the same computer shares the collection's lock.
- [ ] **Delete collection…** (from the details ⋯ and the table's ⋯) takes two steps and the typed name.

## 12. Collections tab: projects

- [ ] **+ Start Project** `SMOKE Project` opens it as Ours, with no phone, ID, offer or paid rows.
- [ ] **Prices round up:** the same card and condition costs as much or more in the project as in a collection ($12.40
      → $13 here, $12 there); the tooltips, Use TCGplayer and Use Cardmarket say "rounded up from"; Cash and Credit
      still round down.
- [ ] REPRICE? on the project says "rounded up, as in every project".
- [ ] **Convert to buy…** (from the details ⋯ and the table's ⋯) asks CONFIRM BUY's questions; with `SMOKE Misty`,
      `(555) 010-0002`, $5 credit, the buy lands on today's day page, the project is gone and the day page opens.
- [ ] Convert to buy… is greyed on a Completed project and stops with a message on an empty one; on an exported
      project it's greyed on the project's own ⋯, and the table's ⋯ stops with the same message before the dialog
      ("Part of this project is exported: Undo export… first, only if…"; decision 339).
- [ ] A project can be marked Completed with no export.

## 13. Collections tab: Import Collection

- [ ] **Import Collection** with a small CardBot-style Mass Create file: Matching, then Review (Needs a choice, Matched,
      Can't import); picks and skips; **Next: name the project**; it opens.
- [ ] A **TCGplayer-format** file matches rows by SKU; a blank price takes TCGplayer's, marked so.
- [ ] **The app's own export file** imports back: its 0-quantity Near Mint rows are left out, and its blank-priced rows
      take the file's Near Mint price, marked **(from NM)** (MP at $110 NM → $88).
- [ ] A row with no price and no Near Mint price waits for its printing, then shows TCGplayer's price.
- [ ] A Sell Price that isn't a number is **Can't import**, with its line number.
- [ ] A CSV dropped on an **empty** collection or project imports into it; on one with cards, a message says it can't.
- [ ] Picks are remembered: the same file again matches them straight away.

## 14. Calendar tab and day pages

- [ ] The Calendar shows the Magic and Pokémon months side by side, a dot per buy in its user's colour; a day whose
      buys are all done is grey and says Exported or Completed.
- [ ] **Export Cash Buys (N)** downloads the month's cash buys as a CSV; hovering it says when it was last downloaded.
- [ ] **A past Magic day's EXPORT** opens matching, review and confirm, with that day's Custom SKU (`101626`, decision
      291) in the Confirm step and the file.
- [ ] Today's EXPORT is blocked ("until it's over").
- [ ] **Export single buy…** works on any day, today included, with the SKU `101626-42`; only that buy becomes Completed,
      and the day's EXPORT skips it.
- [ ] **Mark Paid/Ours again…** undoes that buy's export alone, after asking.
- [ ] **Mark as completed** (decisions 295, 277): a Magic buy's cards cross out and its names turn grey; Mark Paid/Ours
      again brings them back; a Pokémon buy has nothing struck.
- [ ] **Striking:** × on one copy strikes that copy; every card of one game struck makes that side Completed; Restore
      brings a card back.
- [ ] **Convert to project…** makes a project with the same prices (and Convert to buy… back again); a buy with one game
      Completed moves only its live cards, the dialog says so (decision 296); a buy with nothing live is blocked.
- [ ] **Convert to collection…** (decision 335) asks once with nothing to type, showing the buy's name, phone and Last
      4 ID 1312; the collection opens, Paid/Ours, with the buy's cards, rates and what was paid; the Changelog says "Buy
      converted to collection"; Completed cards stay on the buy; with no customer name it's greyed.
- [ ] **Delete buy…** asks first.
- [ ] A buy with both games links "Also has N Pokémon cards →" to the other game's day.
- [ ] **A Pokémon day's COMPLETE** works out today's Sell Prices and shows them in green.
- [ ] **Print MTG?** (EXPORT ▾) opens a "Building the printout…" tab, then the day's audit PDF; a Magic buy's ⋯ →
      **Print buy** prints that buy.
- [ ] **Flagged buys** (decision 301): a day with a 🚩 flagged buy prints a red CHECK CONDITION banner naming it on every
      page, on Print MTG?, its Print buy and a BUY COMPLETE printout; after ✅ Condition checked, no banner; the same on
      a Pokémon day's Print PKM?.
- [ ] **Print PKM?** prints a Pokémon day by set and number.
- [ ] **Print PKM Stickers?** (decision 297) prints price-tag stickers on the 160-sticker sheet, then asks "Complete the
      day?"; Complete day… opens the usual step, Not yet closes; today, or a Completed day, doesn't ask.

## 15. The export file

On each export in sections 11 and 14, the downloaded CSV is opened:

- [ ] The header reads `Add Qty,Product Name,Category,Condition,Language,Sell Price,Custom SKU`.
- [ ] Conditions use the inventory's words: `Near Mint`, `Lightly Played`, `Moderately Played`, `Heavily Played`,
      `Damaged`.
- [ ] Only Near Mint rows carry a price; every LP/MP/HP/DMG row's Sell Price is blank.
- [ ] A card with only worse-condition copies gets a 0-quantity Near Mint row first, priced at the best condition's Sell
      Price ÷ its percentage, rounded up (MP $87 at 80% → $110); a card with Near Mint copies gets no extra row.
- [ ] The review screen shows **sets NM $X** on such a card, with the working on hover.
- [ ] EXPORT on a day or collection already exported downloads the same file again; nothing changes.
- [ ] A card that can't match goes to **Can't upload cards** and isn't in the file.

## 16. Settings tab

- [ ] **Master Buy Percentages** read 33.34 / 66.68 (decision 333); a value the app can't use shows red and goes back to
      what was saved.
- [ ] Low-end and high-end rates, Master Fallback Percentages and Bulk values show and save.
- [ ] **API keys:** the JustTCG key shows masked; **Test** shows the plan and today's and this month's lookups.
- [ ] **JustTCG usage** shows Today and This month bars, the plan and the reset time.
- [ ] **Master Crystal Inventory** shows the current file, who uploaded it and its rows.
- [ ] **Crystal Commerce matching** lists remembered sets and products; Browse remembered products… searches them.
- [ ] **Backups:** Last backup updates after the download; **Restore from backup…** shows the file beside what's here
      (cancelled, not restored).
- [ ] **This computer:** Sign out signs out only this computer; the footer shows the version and the data sources.

## 17. Changelog tab

- [ ] It opens on **Buys**; Ctrl+click adds categories; All / Magic / Pokémon filter; the text filter narrows; the funnel
      shows one buy's history.
- [ ] The pass's entries are all there, in the right categories: Project converted to buy and Buy converted to project
      (Buys); Cards imported (Collections); Buy exported, Buy export undone, Export undone, the rejection with its
      reason, Collection repriced, the calls (Actions).
- [ ] A card a phone scanned ends "· 📱 scanned on <phone>".
- [ ] Names link to their day page or collection; deleted ones aren't links; ‹ Newer / Older › page through 20 at a time.

## 18. Across the app

- [ ] Every tab at **1366×768** (the store laptop): nothing cut off or overlapping, the Finish & Details panel with a
      version list included.
- [ ] A window narrower than the app supports shows "Please use a wider window".
- [ ] A missing JustTCG key or the daily limit makes the price line say so, and a manual price still works (the message
      only: the real key stays).
- [ ] A slow Scryfall or TCGdex puts a yellow line over the suggestions that retries by itself.
- [ ] Two tabs on one computer share the walk-in draft; a stale write reloads instead of losing anything.

## 19. At the store (the owner)

- [ ] **Two computers on one collection:** the second is view only, **Take over** works and the edit goes through; a
      delete or convert while the other has it open is refused.
- [ ] **Wi-Fi off mid-buy**, then back: nothing is lost, and the draft survives a refresh.
- [ ] Every store computer's browser is at the zoom staff use, with pop-ups allowed for the card links.
- [ ] The store's phone pairs with a store computer on the live site's address and scans a stack at the counter.

## 20. Clean up

- [ ] Every `SMOKE` collection and project is deleted (the table's ⋯ → Delete collection…).
- [ ] Today's SMOKE buys are deleted (day page ⋯ → Delete buy…), any exported one marked Paid/Ours again first.
- [ ] The `SMOKE` users are deleted.
- [ ] JustTCG usage is noted again: ________ (the pass used ______).
- [ ] What can't be deleted stays, harmless on dev: the computer name, the SMOKE past-customer names, the pass's
      Changelog entries.

## 21. The database test run

- [ ] `node scripts/db-test-run.mjs` on dev calls every server function (buys, collections and their statuses, the
      conversions, REPRICE?, export and undo, Can't upload cards, import, delete, the locks, restore) inside one
      transaction that's rolled back, and prints "All passed: N checks". It runs after every migration, and on prod
      after the squash (SQUASH.md section 8).
