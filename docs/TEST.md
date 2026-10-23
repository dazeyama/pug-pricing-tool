# Smoke test

One pass through the whole app, tab by tab, before a release or the move to prod. Each case says what to do and
what happens. The findings are reported when the pass ends.

- **Build under test:** the Settings footer shows it (0.9.9.15-review or later).
- **Where:** the dev project only (`psucrzljraxeootwnltf`), through the local dev server (`start.bat` →
  http://localhost:5180). **Never prod.**
- **Who:** the owner, or Claude in the browser pane at the owner's request (FABLE.md, "a smoke pass the owner asks
  for"). The owner does the phone, two-computer and store cases.
- **How long:** about two hours, 237 cases.

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
- [ ] **Inventory reminder** (decision 451; dev): with the current inventory uploaded more than 7 days ago, every tab
      shows "Master Crystal Inventory uploaded N days ago." with **Upload inventory** (opens Settings) and **×**
      (hidden until the browser is closed). Upload a fresh inventory: it goes, on the other computer too. Within 7
      days it doesn't show.
- [ ] Two users exist to switch between (`SMOKE Ash` and `SMOKE Misty`, added if needed).

## 2. The header

- [ ] **A new tab starts on Pick user**; a reload of a tab keeps its user.
- [ ] **With no user picked**, ADD CARD, + Overnight buy and Home's quick actions look disabled and pulse the
      user button; nothing is created.
- [ ] **An unused tab forgets its user after 30 minutes.** To skip the wait, the page's console runs
      `const real = Date.now; Date.now = () => real() + 31 * 60000;`; within 30 seconds the user is un-picked and a
      yellow message says why. A reload undoes the trick.
- [ ] The sign-out icon un-picks the user; the user button and the coloured band show the picked user's colour.
- [ ] **Who's on** (decision 284), left of Changelog: a green dot with **N Connected** and a dot per picked user with
      **N Users selected**; hovering names them. A second tab adds one to each.
- [ ] **Header search** `bolt`: Paid/Ours overnight buys at the top (Projects and System under their own headings,
      decision 421), then buys under their dates; **Show all** adds the rest, faded.
- [ ] **A buy's customer** (decision 454): search a card from a buy with a customer name: its first line ends
      "· Customer: <name>", the name in bold (before a Completed chip with Show all); a buy with no customer name ends
      at its time. In the Customers section the name shows once, on the line below.
- [ ] **A customer by name** (decision 424): type the first name of a customer with a Completed buy: a **Customers**
      section at the top lists their buys and collections (Buy N · who · when, the name, phone and card count), **Show
      all** has flipped on by itself and the Completed ones show faded; untick Show all: it stays off and the
      Completed ones go; type another letter: it flips on again. Clicking a buy opens its day page with the buy
      flashing; a collection opens its screen. The placeholder reads "Search cards, customers, phone numbers…".
- [ ] **A customer by phone** (decision 424): `(555) 123-4567`, `555-123-4567`, `5551234567` and the last seven digits
      all find the same customer, with no card results and no "contain that card" message; `117` and `117/331` still
      search cards. A number nobody has says "No buy or collection has that phone number."
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
- [ ] **The List in number searches** (decision 329): `rootborn def 26` shows RVR 26 first, then PLST RVR-26; `26 rvr`
      shows both (the number first, as printed); `rootborn def 21` shows MM3 21 and PLST MM3-21, not RVR-26.
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
- [ ] **Enter waits for the search** (decision 358): with a card selected, type a new search and press Enter at once:
      nothing is added ("Waiting for the search"); once the results are in, Enter adds the new card.

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
- [ ] **Play! Pokémon stamp:** `Super Rod 188` (Paldea Evolved) has a **Play! Pokémon stamp** version, under
      **Other TCGplayer versions…** (decision 289), that puts the logo bottom right; its REVERSE shine covers everything except the art box, lined up with it.
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
      read JustTCG's five conditions as their own product. A condition can still show "fallback" when JustTCG prices
      it above a better one, as the rules throw that price out.
- [ ] **The name search by the set's home** (decision 288): `Purugly 36/130` (Diamond & Pearl) and a Sun & Moon base
      card get prices.
- [ ] **A TCGplayer version still loading** (decision 359): pick a stamped version TCGplayer sells apart and press
      ADD CARD at once: "Waiting for its TCGplayer versions", then it adds at the version's own price.
- [ ] **A failed TCGplayer versions search** (decision 369): with the `prices` request blocked (DevTools → Network),
      ADD CARD on such a version says to enter a manual price; Alt+M with a price adds it. Editing a line saved on a
      TCGplayer-only version while the search is blocked shows it as **As saved**, and SAVE EDIT keeps its version.

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
- [ ] **A failed price lookup isn't kept** (decisions 357, 368): with the `prices` request blocked (DevTools →
      Network), select a card: "Couldn't load prices" with Retry; unblock it and press Retry: the prices come in
      without a reload.
- [ ] **A locked condition** (decision 401): right-click LP: a 🔒 on LP, and the next card selected starts on LP;
      clicking MP changes this card only; CONFIRM BUY, then a new card: still LP; right-click LP: unlocked; leave the
      tab and come back: NM again.
- [ ] **A locked price source** (decision 402): right-click Use TCGplayer: "🔒 Use TCGplayer", and the next card is
      priced from TCGplayer; select a card with no TCGplayer price: the lock goes, with a toast saying why.
- [ ] **Sorting the list** (decision 403): a list of Magic and Pokémon cards: **$ ↓** orders each game's cards by
      price, high first; **WUBRG** orders the Magic ones white, blue, black, red, green, multicolor, colorless,
      lands (A–Z in each), the Pokémon ones as added; **Added** puts them back; bulk stays on top throughout. On a
      long list (decision 410), WUBRG fades the list and shows "Sorting by color…" until the colors come back, clicks
      on the list do nothing meanwhile, and it reorders once at the end.
- [ ] **Copies we own** (decision 448; dev, after an inventory upload from this build): pick Force of Will. Right of
      its details, **This printing** and **All printings** show counts ("…" first). A card we own 3+ of: All
      printings turns amber with "−5%?" (one copy over 2), "−10%?" (two)… Point at the boxes: the box below says
      "We own X copies of this printing and Y copies of this card.", then each printing: In Crystal Commerce (set ·
      foil / variant ×N) and Ours, not in it yet (set #number ×N), the one picked marked "this printing", and the
      suggestion with its Credit / Cash. Pick a Pokémon card: "Copies we own: Magic only for now".
- [ ] **Bonus and cut** (decision 457): a card we've never had (0 and 0): a green "+10% first" chip under the boxes;
      its box's The rate section lists "+5% first of this printing" and "+5% more, first of this card", So +10%.
      Another printing of a card we own 1–2 of: "+5% first". A card we own 4 of, this printing none: a green "+5%
      first" and a red "−10% owned" chip side by side, the box says "Together −5%". 3 of the card, this printing
      none: both chips, "They cancel out". With the inventory unknown (none uploaded): no bonus. A low-end card
      (under $3) we've never had: no green chip, and the box says "No first-copy bonus on a low-end card" (decision
      458); one we own 4 of still gets the red chip.
- [ ] **Stamps** (decision 459): with a rate to apply, a red **NOT APPLIED** ink stamp under the chips; Apply (or
      Auto apply rates? checked) turns it into a green **APPLIED** one; no stamp when nothing changes the rate.
      Click the stamp (decision 461): it switches, the new one dropping in larger over the old, shaking and
      settling, the old one fading only at the very end (decision 462), all in 0.3 s; APPLIED tilts up to the
      right, NOT APPLIED down, and the price panel's Credit / Cash change with it; click again to switch back.
      With Auto apply rates? checked the stamp doesn't switch, and pointing at it says why.
- [ ] **Apply**: click the boxes to keep the box open, then **Apply ±N%**: the chips go solid with ✓, the price
      panel's Credit and Cash change, ↑ and a green ring for a bonus, ↓ and a red ring for a cut. ADD CARD: the line
      shows ✎ Credit / Cash at those rates. Apply, then pick another card: it isn't applied there. Editing a line:
      the box says to use Set Rate. On a project: "A project has no rates."
- [ ] **Auto apply rates?** above the boxes (decision 456): check it, add a card we own 3+ of: it goes on at the lower rate
      without clicking Apply; a card we've never had: the +10% rate; one we own 1–2 of, this printing included: its
      usual rate. The cards already on the list keep theirs.
      Reload: still checked. CONFIRM BUY: the next buy starts unchecked. On an overnight buy, checking it puts
      "auto apply rates: off → on" in the Changelog. With the phone paired and the box checked, a scanned card we
      own 3+ of goes on at the lower rate.

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
- [ ] **Buys numbered forever, without gaps** (decisions 290, 349): the confirm says the next number after the
      highest buy of either game (Buy 44 after the 2026-10-19 renumber); the day page, the Changelog, the header search
      and the printout show the same number; the next buy is one more. After a database test run the next number
      hasn't moved.
- [ ] The buy is on today's day page, in the user's colour, with a green Paid/Ours chip.
- [ ] **CONFIRM BUY with the connection gone** (decisions 363, 367, 371): wifi off, press Confirm buy: an error, then
      "Its answer was lost: it may have gone through. Press Confirm buy again to find out."; wifi on, press again:
      the buy is confirmed once (BUY COMPLETE, one buy on the day page).
- [ ] **Two tabs, one confirm** (decision 367): the Buy tab open twice, same user; confirm in one; in the other,
      change the price and press Confirm buy: "This buy changed on another computer — reloaded.", no BUY COMPLETE.
- [ ] **ADD CARD after a lost answer** (decision 388): add a card with the wifi pulled mid-press, so the toast says
      it couldn't add; wifi back, press ADD CARD again: one copy in the list, and "Done once: …"; press again: two.
- [ ] **CANCEL with another tab's cards** (decision 395): open the Buy tab in two tabs; add a card in the first; in
      the second (still empty), CANCEL: it shows the first tab's buy and says so, nothing is discarded.
- [ ] **Settings not loaded** (decision 389): with Settings failing to load (block the request in the browser), a red
      bar with **Retry** shows; ADD CARD and CONFIRM BUY say "Settings haven't loaded yet…"; unblock, Retry: they work.

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
- [ ] **One copy on slow wifi** (decision 344): with the phone's network throttled (or wifi dropped for a few seconds
      mid-send), auto scan one card: it goes in once; pressing Scan card while it's sending says "Still sending that
      card".
- [ ] **A walk-in's scans stay with its buy** (decision 350): auto scan a stack into the Buy tab and press CONFIRM BUY
      mid-stack; the cards not yet added say "Buy N was confirmed first: scan it again for the next buy" on the
      phone, and none lands in the next buy.
- [ ] **Waiting scans kept** (decision 343): scanning into a collection with auto scan, open Help on the laptop
      mid-stack; the phone says stopped. Open another collection and pair: none of the first one's cards land there,
      and the phone doesn't list them. Go back to the first collection and pair: its waiting cards come in.
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
- [ ] **A List card by its mark** (decision 355): scan an older The List or Mystery Booster card showing its mark: it
      goes in as its List printing (set PLST), not the original.
- [ ] **The camera stops with the screen** (decision 356): leave the scanning screen while it's refocusing: the
      phone's camera indicator goes off.
- [ ] **A card waiting for a price stays listed** (decision 356): with more than ten cards scanned while the computer
      is behind, one waiting for a price still shows on the phone until it's priced.
- [ ] **A refused Undo says why** (decision 392): scan a card, unpick the user on the computer, Undo on the phone: the
      phone says "Pick a user on …, then Undo again." with the error sound.
- [ ] **FOIL? one at a time** (decision 392): FOIL? on the last card, and at once FOIL? on the next: the second says
      it's still waiting; the first's foil copy goes in when its normal one is off.
- [ ] **A scan's buy cancelled** (decision 395): with nothing on the computer's list, scan a card the computer can't
      price (it asks the phone for a price); CANCEL on the computer: the phone lists it "The buy was cancelled…".
- [ ] **Let me type it** (decision 420): on a "Which …?" printing list, Let me type it (left of Skip this card) opens
      the name box empty, "Which card is it? Type its name."; type a name and Find printings: that name's printings
      list; pick one: it goes in. Skip from the box sets the card aside as before.

## 11. Collections tab: collections

- [ ] The tab has Overnight buys, Projects and System tables; the status chips filter Overnight buys, Rejected included.
- [ ] **Every row's ⋯:** Delete overnight buy… (Delete project… on a project) everywhere, Convert to buy… on projects
      only, none on System; clicking ⋯ doesn't open the row; the menu isn't cut off on the last row.
- [ ] **Overnight buys** (decision 421): the first table is titled Overnight buys, its button + Overnight buy opens
      "New overnight buy", the ⋯ says Print overnight buy and Delete overnight buy…, Home's tile reads "Overnight buys
      and projects" and its quick action + Overnight buy; a buy's ⋯ → Convert ▸ Convert to overnight buy; the tab is
      still Collections, and the Unlock and Reopen dialogs still say "this collection" ("Unlock this collection?").
- [ ] A row open on another tab or computer greys its ⋯ items with who's editing it.
- [ ] **+ Overnight buy** needs a name, a 10-digit phone and the Last 4 ID; Create shows what's missing; the name
      suggests past customers and fills the phone, never the Last 4 ID.
- [ ] `SMOKE Collection`: cards added, **Mark as Priced** (an offer), **Mark as Paid/Ours** (the price paid).
- [ ] **EXPORT stamps, doesn't complete** (decision 294): EXPORT on the Paid/Ours collection stamps its Magic cards (the
      Custom SKU chip shows, prices turn green) and leaves it Paid/Ours; EXPORT again says every Magic card is exported.
- [ ] **Completed by hand:** the status menu or "Mark as Completed →" sets Completed from Paid/Ours; Reopen puts it back
      to Paid/Ours with the stamps kept.
- [ ] **Undo export…** (decision 298): on an exported Paid/Ours collection, ⋯ → Undo export… asks, then the SKU chip
      goes, the prices turn white, the Changelog says "Export undone", and EXPORT offers the cards again; on a
      collection never exported the item is greyed.
- [ ] **An exported card is frozen** (decision 345): EXPORT that collection again; × on an exported card says "That
      card is exported: Undo export… first". In a project, EXPORT, then: clicking an exported card or its × says
      the same; adding the same card again makes a new line beside it, which the next EXPORT sends; REPRICE? leaves the exported cards' prices (greyed when every card is exported).
- [ ] **Unlock undoes the export** (decision 452; dev: Casey Kusz): a Paid/Ours or Completed collection whose cards
      are exported, unlocked to Priced or Processing: the dialog says its export is undone too (how many cards, the
      Custom SKU, Can't upload copies) and its button reads **Unlock and undo export**. After it: the Changelog has
      "Export undone…" then "Unlocked…", the cards are white and editable, and REPRICE? works. With every card still
      exported, REPRICE?'s grey reason says "⋯ → Undo export… first to reprice them". A collection with nothing
      exported unlocks as before.
- [ ] **Rejected:** `SMOKE Rejected`, from Priced, rejected with a reason, locks (no adding, editing or REPRICE?;
      EXPORT downloads the file only), shows $0 paid in red and is left out of the header search unless Show all; **Reopen** goes back to Priced
      with its offer; the Paid/Ours dialog's **Mark as Rejected?** switches to the Reject dialog.
- [ ] 📞 on a Priced collection counts calls, each in the Changelog.
- [ ] REPRICE? on a Processing collection says "rounded down as always".
- [ ] ⋯ → **Print overnight buy** opens its Magic cards' printout.
- [ ] A second tab of the same computer shares the collection's lock.
- [ ] **Delete overnight buy…** (from the details ⋯ and the table's ⋯) takes two steps and the typed name.
- [ ] **The lock after a failed check** (decision 364): open a collection with the connection off: "Couldn't check who
      is editing this collection: trying again."; connection on: it can be edited within 20 seconds.
- [ ] **A Paid/Ours collection's file again** (decisions 362, 372): once every Magic card in a Paid/Ours collection is
      exported, EXPORT downloads the same file again: every round it was exported in, without cards later exported
      from Can't upload cards.
- [ ] **$0 again on a kept buy's collection** (decision 397): Convert to overnight buy a buy with a Completed Magic side;
      on the new collection, 🔒 Unlock, then Mark as Paid/Ours: the price starts at $0 and says "The payment is on
      Buy N…".
- [ ] **A card in Can't upload cards** (decision 399): in a collection whose export sent a card to Can't upload
      cards, click that card: "That card is in Can't upload cards: Undo export… first to change it."
- [ ] **Can't upload cards, lost answer** (decision 387): EXPORT from Can't upload cards with the wifi pulled as it
      saves; wifi back: the dialog says whether it went through, and if it did, the file downloads.
- [ ] **Completed with the export, if asked** (decision 407): a Paid/Ours collection with Magic and Pokémon cards:
      Export MTG csv (all): once the file downloads, "Mark this collection Completed?"; No: it stays Paid/Ours.
      Print PKM Stickers?: the same question; Yes: Completed. A Processing collection's file-only export asks nothing.
- [ ] **Export MTG csv (>$1.49) on a collection** (decisions 406, 416): a Paid/Ours collection with a $5 card and a
      $0.25 card: the $0.25 one is under "$1.49 or under: pulled"; Confirm lists it in amber with the tick; after Export, the
      card shows an amber **Pulled** chip and its copy is in **Bulk pulled from exports** (Collections tab, System).
- [ ] **Bulk pulled from exports** (decision 406): open it: its cards say where they came from; EXPORT sends them
      (no $1 cut) and they leave; Undo export… on the original collection takes a pulled card's copy back out.
- [ ] **Bulk pulled from exports reads Completed** (decision 423): its chip is grey **Completed** in the System table
      and on its own details bar, whose hint says "Always Completed, and left out of the header search"; × still
      removes a card at once and EXPORT still works; the header search for a card in it finds nothing there, with
      Show all on or off, while the same card in Can't upload cards is still found.
- [ ] **Bulk pulled from exports there from the start** (decision 449): on a store that never pulled a card (the
      live site, once 0008 is on it: look, don't pull one), the Collections tab's System table shows it empty
      beside Can't upload cards, grey Completed; opening it shows no cards, and EXPORT has nothing to send. On dev,
      restoring a backup made before it existed brings it back, empty.

## 12. Collections tab: projects

- [ ] **+ Start project** `SMOKE Project` opens it as Ours, with no phone, ID, offer or paid rows.
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
      again brings them back; a Pokémon buy has nothing struck. On a past day with that buy and an exported one, the
      day's ⋯ → Mark Paid/Ours again… says it brings back 1 buy and the hand-completed one stays; after it, that buy
      is still Completed and crossed out, and its own ⋯ → Mark Paid/Ours again brings it back (decision 340).
- [ ] **Striking:** × on one copy strikes that copy; every card of one game struck makes that side Completed; Restore
      brings a card back.
- [ ] **Convert to project…** makes a project with the same prices (and Convert to buy… back again); a buy with one game
      Completed moves only its live cards, the dialog says so (decision 296); a buy with nothing live is blocked. When
      the buy stays like that, the dialog says the payment stays with the buy, the new project is paid $0, and the
      Calendar's **Export Cash Buys** counts the cash once, on the buy (the project's row reads $0; decision 341).
- [ ] **Convert to overnight buy** (decision 335; Convert ▸) asks once with nothing to type, showing the buy's name, phone and Last
      4 ID 1312; the overnight buy opens, Paid/Ours, with the buy's cards, rates and what was paid; the Changelog says "Buy
      converted to overnight buy"; with no customer name it's greyed. With Completed cards the buy stays with them and
      keeps the payment: the collection is paid $0, same colour and filter as the buy's method (decision 341).
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
- [ ] **Sticker prices** (decision 384): every sticker is a whole dollar ("$3", never "$3.25"); a card worth $0.50
      or less reads "50¢", one between $0.51 and $0.99 reads "$1"; the name, number and chip are on those too.
- [ ] **A day's file again** (decisions 361, 372): a day exported with EXPORT, one of its buys exported earlier with
      Export single buy: EXPORT again downloads the day's file without that buy's cards (Custom SKU "<day>-<number>");
      a day exported only one buy at a time says there's no day file.
- [ ] **A single buy's file again** (decision 386): on a buy exported with Export single buy, ⋯ → **Download its file
      again**: the same `…-buy-N.csv`, nothing changes; Export single buy is greyed, pointing to it.
- [ ] **Mark Paid/Ours again, partly by hand** (decision 396): a Magic buy with some cards exported and some Mark as
      completed; the day's ⋯ → Mark Paid/Ours again…; the buy's ⋯ now has both Mark as completed and **Mark Paid/Ours
      again**, which brings the hand-completed cards back.
- [ ] **Convert leaves a Completed game whole** (decision 393): a buy with Magic cards, bulk and a placeholder and
      Pokémon cards; Mark as completed the Magic side; Convert to project: only the Pokémon cards move, the dialog
      saying the Magic bulk and placeholders stay; the buy keeps them.
- [ ] **Prices on the printouts** (decision 404): a past Magic day, EXPORT ▾ → Print MTG (all): each row ends with
      today's price, red at 50¢ or under, amber from 51¢ to $1.49, plain from $1.50 (the Export rates for bulk,
      decision 416); the foot has the key with those amounts. Print PKM? on a Pokémon day the same.
- [ ] **Print MTG (>$1.49)** (decisions 405, 416): the same day: only the rows at $1.50 or more; a day with none says
      so and prints nothing.
- [ ] **Print buy (>$1.49)** (decisions 409, 416): a Magic buy's ⋯ → ◂ Print → Print buy (>$1.49): only its cards at
      $1.50 or more today, with their prices; Print buy (all) prints them all.
- [ ] **A buy's ⋯ in groups** (decisions 422, 425): a Magic buy's ⋯ reads Mark as completed, ◂ Print, ◂ Export,
      ◂ Convert, Edit in project view, Delete buy…; pointing at ◂ Print opens its two items to the left of the menu,
      pointing at ◂ Export swaps to its items, a click on a group toggles it, ← or → opens and → (pointing back at
      the group) closes from the keyboard; a greyed item in a group shows its reason. A Pokémon buy's ◂ Print has
      Print buy and Print stickers.
- [ ] **EXPORT ▾ in groups** (decisions 422, 425): a Magic day's EXPORT ▾ shows ◂ Print (Print MTG (all), (>$1.49))
      and ◂ Export (Export MTG csv (all), (>$1.49)), each opening to the left; a Pokémon day's shows ◂ Print (Print
      PKM?, Print PKM Stickers?) and Complete day… on its own; a collection's ◂ Print has all four prints; Can't upload
      cards' Export csv is on its own. A blocked Export item still says why when clicked. With the window narrowed
      so a flyout can't fit to the left of the day page's ⋯, it opens to the right and the arrow reads "Print ▸".
- [ ] **The printout's foot** (decision 419): on Print MTG (all), "Page 1 of N" sits at the right margin and the key
      ("Today's market price: amber = …, red = …") runs from the left without touching it.
- [ ] **Export single buy (>$1.49)** (decisions 408, 416): a Magic buy's ⋯ → ◂ Export → Export single buy (>$1.49):
      its cards at $1.49 or under are pulled as on the day's export; Export single buy (all) exports them all.
- [ ] **Export MTG csv (>$1.49) on a day** (decisions 406, 416): a past day with cards over and under the cut: the
      file has only the ones whose Sell Price is $1.50 or more; the rest are Completed with an amber **Pulled** chip,
      the day's line says "N pulled as bulk", and **Export MTG csv (all)** on another day exports everything as before.

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
- [ ] **An export with the connection gone** (decisions 362, 371): wifi off, press Export: it says it may have
      exported and to look at the page; wifi on, press Export again: it exports once, or, if the first went through,
      downloads that file. A retry never exports the same cards twice.

## 16. Settings tab

- [ ] **Master Buy Percentages** read 33.34 / 66.68 (decision 333); a value the app can't use shows red and goes back to
      what was saved.
- [ ] Low-end and high-end rates, Master Fallback Percentages and Bulk values show and save.
- [ ] **Export sell floor** (decision 417), beside Export rates for bulk: Floor 0.40; the table shows Sell, $0.23 →
      $0.40 (floor), every amount with two decimals ($12.40 → $13.00). Buy shows "Rounded down", $0.23 → $0.23.
      Bulk values' boxes show two decimals too (24.00). With no user, changing the floor is refused. Set
      0.75: "Export sell floor saved", and the Changelog has "Setting changed: Export sell floor". 0.30 or 11 are
      refused. An export's Review then shows a cheap card's Sell at $0.75 ("raised to the $0.75 floor"), and typing
      0.50 as its Sell price says "At least $0.75". Put it back to 0.40 after.
- [ ] **Export rates for bulk** (decision 416): red to 50¢, amber to $1.49; the dots don't move. With no user, EDIT
      pulses the user button. EDIT, drag the amber dot (or arrow keys, 1¢; Shift, 10¢): the values follow, the dots
      stay a cent apart. CANCEL puts it back. EDIT again, move it, SAVE: "Export rates for bulk saved", and on another
      computer the slider moves too. The Changelog has "Setting changed: Export rates for bulk" under Actions. A day's
      EXPORT ▾ then reads Print MTG (>$…) and Export MTG csv (>$…) at the new amber, and Print MTG's key gives the
      amounts. Put it back to 50¢ / $1.49 after.
- [ ] **Settings saves don't overwrite** (decision 354): Settings open on two computers; a change on one shows on the
      other within a second or two. Clicking into a box and out again shows no "saved" toast. (A save from a screen
      that missed a change is refused, "Settings changed on another computer: check and save again"; the database
      test run covers that.)
- [ ] **API keys:** the JustTCG key shows masked; **Test** shows the plan and today's and this month's lookups.
- [ ] **JustTCG usage** shows Today and This month bars, the plan and the reset time.
- [ ] **Master Crystal Inventory** shows the current file, who uploaded it and its rows.
- [ ] **Upload Crystal Commerce Database** with a file already there (decision 414): it runs through Loading
      products… and Saving… to **Clearing the old file…** (about half a minute for the full export), then shows the new
      file, with no "statement timeout". The Changelog has "Master Crystal Inventory uploaded" under Actions.
- [ ] **Crystal Commerce matching** lists remembered sets and products; Browse remembered products… searches them.
- [ ] **Backups:** Last backup updates after the download; **Restore from backup…** shows the file beside what's here;
      typing RESTORE and pressing Restore downloads `…-before-restore.json` and says to check it, without restoring
      (decision 348); then Cancel.
- [ ] **This computer:** Sign out signs out only this computer; the footer shows the version and the data sources.
- [ ] **Two fallback boxes quickly** (decision 394): type in Fallback LP, Tab, type in MP, Tab: both save, and LP
      keeps its new value.
- [ ] **Restore with an empty match list** (decision 398): pick a backup file whose `cc_set_map` list is empty: the
      dialog says the set choices stay as they are; then Cancel.
- [ ] **Set choices past the first page** (decision 390): Settings → Crystal Commerce matching lists every set
      choice (only checkable with over 1,000; otherwise it lists them all, newest first).

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
- [ ] **A page loaded offline** (decision 364): load Home with the connection off: it stays "Loading…", not "✓
      Everything's exported"; connection on: it fills in within seconds.
- [ ] **A short drop reloads** (decision 388): a collection open on two computers; pull one's wifi for about 5 s
      (no banner) while the other adds a card; wifi back: the card shows without a refresh.

## 19. At the store (the owner)

- [ ] **Two computers on one collection:** the second is view only, **Take over** works and the edit goes through; a
      delete or convert while the other has it open is refused.
- [ ] **Wi-Fi off mid-buy**, then back: nothing is lost, and the draft survives a refresh.
- [ ] Every store computer's browser is at the zoom staff use, with pop-ups allowed for the card links.
- [ ] The store's phone pairs with a store computer on the live site's address and scans a stack at the counter.

## 20. Clean up

- [ ] Every `SMOKE` collection and project is deleted (the table's ⋯ → Delete overnight buy… / Delete project…).
- [ ] Today's SMOKE buys are deleted (day page ⋯ → Delete buy…), any exported one marked Paid/Ours again first.
- [ ] The `SMOKE` users are deleted.
- [ ] JustTCG usage is noted again: ________ (the pass used ______).
- [ ] What can't be deleted stays, harmless on dev: the computer name, the SMOKE past-customer names, the pass's
      Changelog entries.

## 21. The database test run

- [ ] `node scripts/db-test-run.mjs` on dev calls every server function (buys, collections and their statuses, the
      conversions, REPRICE?, export and undo, Can't upload cards, import, delete, the locks, restore, owned copies)
      in two passes, each a transaction that's rolled back (the restore checks are the second: one pass outgrew the
      API's 100 s, decision 448), and prints "All passed: N checks" (622 at migration 0008, about 90 s). It runs after every
      migration: on dev with `--save`, then, once the migration is on prod, there with `--structure-only
      --project-ref zvxquzcfffmxwizonxuo --confirm zvxquzcfffmxwizonxuo --compare <that dev run>`: the fingerprints
      only, every one the same. The checks themselves never run on prod (decision 380; SQUASH.md section 11).
