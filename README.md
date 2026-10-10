<h1 align="center">PUG Pricing Tool</h1>

<p align="center">
  <strong>Price a trading card in seconds, buy it, and send it on to Crystal Commerce.</strong>
</p>

<p align="center">
  <img alt="Games" src="https://img.shields.io/badge/games-Magic%20%C2%B7%20Pok%C3%A9mon-4b5bd6?style=flat-square">
  <img alt="Prices" src="https://img.shields.io/badge/prices-JustTCG-2b9e8b?style=flat-square">
  <img alt="Inventory" src="https://img.shields.io/badge/exports%20to-Crystal%20Commerce-e8202a?style=flat-square">
  <img alt="Shared" src="https://img.shields.io/badge/every%20computer-shared%2C%20live-3f9c53?style=flat-square">
</p>

<p align="center">
  <em>The buy counter for Players' Union Games, a worker-owned game store.<br>
  Every computer in the store sees the same buys, collections and settings, as they change.</em>
</p>

---

# 📜 Preamble and sources

PUG Pricing Tool was made for Players' Union Games. The store decided how it should work, tested
every feature, and approved every change before it went live.

**AI tools helped write the program's code.** The app itself uses no AI. It never contacts an AI
service, and no AI runs inside it. It is an ordinary program: it asks card databases and price
services for their data, shows it, and saves what staff do with it.

**Nothing in the app is made up by AI.** Every card name, set, number and picture comes from a card
database. Every market price comes from a price service. What the app works out for itself follows
fixed, written rules: the percentages, the rounding, the Sell Price and the Crystal Commerce
matches. This guide describes each one. The same cards and prices always give the same answer.

**The data is stable.**

- Everything lives in one database, shared by every computer in the store.
- A card's price is saved with it, along with where it came from. A later price change never alters
  a past buy. Only **REPRICE?** changes saved prices, and only when someone presses it.
- Two computers can't overwrite each other. The database refuses any change that breaks its rules.
- Every change is written to the **Changelog**, with who made it and when.
- A full backup can be downloaded at any time, and put back with **Restore**.
- A source being down never touches saved data. Prices can be typed by hand until it's back.

**Players' Union Games (PUG) does not endorse the use of AI.**

<figure>
<img src="public/help/from-claude-code.webp" alt="Claude Code, checking the app for AI services" width="744">
<figcaption>From Claude Code</figcaption>
</figure>

### JustTCG

JustTCG is where the app's condition prices come from. This is a summary of its website and FAQ,
read on October 9, 2026, followed by how the store uses it. JustTCG's plans and figures may change.

**What it is.** A price service for trading card games, made for programs like this one. It covers
more than 279,000 cards in 20 games, Magic and Pokémon (English and Japanese) among them. It gives
each card a separate price for every condition, Near Mint to Damaged, and every printing (normal,
foil and so on).

**Where its prices come from.** Two kinds of sales, blended together:

- Sales on large online trading card marketplaces.
- Real sales in game stores that belong to its **Partner Program** (more than 65 stores). Each store
  sends its card sales as they happen. Customer details are thrown away when they arrive.

The two are blended as a volume-weighted average, so no single sale or store sets a price.
Suspicious sales are held for a person to review. A store caught manipulating prices is removed.

**How fresh.** Prices are worked out again every 6 hours. Each price also carries its changes over
the last day, week, month and 90 days, and its price history. Graded cards (PSA, BGS, CGC) and
prices by region are in testing.

**Plans.** Prices before sales tax.

| Plan | Price | Requests a month | A day | A minute | Cards a request |
|---|---|---|---|---|---|
| Free | $0 | 1,000 | 100 | 10 | 20 |
| Starter | $19 a month | 10,000 | 1,000 | 50 | 100 |
| Professional | $49 a month | 50,000 | 5,000 | 100 | 100 |
| Enterprise | $149 a month | 500,000 | 50,000 | 500 | 200 |

- The daily count resets at midnight UTC. The monthly count resets at the start of each billing
  cycle.
- Too many requests in a minute are refused for a short time.
- Every paid plan allows business use. The free plan is for personal, non-commercial use only.
- Paid plans may show the prices, work out figures from them, and keep their history while
  subscribed. They may not resell the raw prices, publish them in bulk, or build a competing price
  service.
- Paid plans may also use the prices to train machine-learning models for their own products.
  PUG Pricing Tool doesn't.
- JustTCG also offers a connection for AI assistants. PUG Pricing Tool doesn't use it.

**Account and support.** A key comes straight away when an account is made, with no approval and
no card. Paid plans are paid by Visa, Mastercard or American Express, and have a 30-day money-back
guarantee. Support answers tickets in about 24 hours, sooner on paid plans. Its uptime is shown at
status.justtcg.com.

**How the store uses it.**

- The store has one JustTCG key. It's kept on the server, never on a computer, and every computer
  shares it (**Settings → API keys**).
- **Settings → JustTCG usage** shows the store's plan and how much of it is used. On October 9,
  2026 it was the **Starter** plan.
- A card's prices are kept for 6 hours, for every computer, matching JustTCG's own 6-hour update.
  Looking up the same card again in that time uses no request. An export takes prices up to 12
  hours old.
- One request covers up to 100 cards. An export, a **REPRICE?** or a **COMPLETE** uses about one
  request for every 100 different cards.
- Home shows a warning once 80% of the day's requests are used. When they run out, a yellow bar
  says so, and prices are typed by hand until midnight UTC.

### Other Sources

Besides JustTCG, the app gets its card data from these sources. Each is named at the foot of the
**Settings** tab.
Only searches for cards, and card IDs, are ever sent to them. Nothing about customers leaves the
store's database.

| | |
|---|---|
| **Scryfall**<br>Magic card data and images | A free Magic: The Gathering card database, run independently of Wizards of the Coast. Every Magic search, card detail, picture and set symbol comes from it. It also reports TCGplayer's Market Price and Cardmarket's price for each printing, updated once a day. |
| **TCGdex**<br>Pokémon card data and images | A free, open-source Pokémon card database in ten languages, run by its community. Every Pokémon search, English and Japanese, comes from it: each card's details, picture and versions (holo, reverse holo, 1st Edition…). It also reports TCGplayer's and Cardmarket's prices. |
| **pokemontcg.io and TCGplayer**<br>Backup Pokémon images | The Pokémon TCG API (pokemontcg.io, now part of Scrydex) and TCGplayer's own product pictures. Used only when TCGdex has no picture of an English card. |
| **Limitless TCG**<br>Japanese Pokémon images | A Pokémon tournament and card database site with Japanese cards. Used for Japanese cards TCGdex has no picture of. |
| **Pokellector**<br>Vintage Japanese Pokémon images (1996–2001) | A Pokémon card checklist site for English and Japanese sets. Used for the ten oldest Japanese sets, whose pictures neither TCGdex nor Limitless has. |
| **PokeAPI**<br>English names for Japanese Pokémon | A free, open-source database of Pokémon game data. The app's list of 1,025 English Pokémon names came from it once, on September 29, 2026, and is kept inside the app. A Japanese card's English name comes from the Pokédex number printed on it. |
| **TCGplayer's catalogue, through JustTCG**<br>Pokémon cards TCGdex doesn't list yet | TCGplayer is a US online marketplace for trading cards. When TCGdex doesn't list a card or a version yet, the app finds it in TCGplayer's list of products, through JustTCG. Those cards are marked **From TCGplayer**. |
| **Scryfall and TCGdex**<br>Cardmarket prices | Cardmarket is a European online marketplace for trading cards, with prices in euros. Scryfall reports them for Magic, TCGdex for Pokémon. They're used by **Use Cardmarket**, for Japanese Pokémon with no JustTCG price, and to spot a JustTCG price that may be wrong. |
| **Frankfurter**<br>Euro to dollar rate | A free, open-source exchange-rate service. Its rate comes from the European Central Bank, which publishes one every working day. The app turns Cardmarket's euros into dollars with it. |

<br>

---

<br>

# 👋 Getting started


## What it does

The app is for buying cards from customers. She types what's printed on a card. The app finds that
exact printing and shows its price in every condition. One key adds it to the buy.

There are three ways cards come in:

- **Walk-in buys.** A customer at the counter. Priced, paid and finished in one go on the **Buy** tab.
- **Collections.** A bigger lot, priced over hours or days. It moves through statuses until it's paid for.
- **Projects.** Cards the store already owns, priced so they can go into the inventory.

Every card bought lands in one shared record. Magic cards then go to Crystal Commerce, the store's
inventory and web shop, as a Mass Create file.

Six tabs do the work: **Home**, **Buy**, **Collections**, **Calendar**, **Settings** and
**Changelog**.

<br>

## Quick start

1. Open the app in a web browser: <code>https://dazeyama.github.io/pug-pricing-tool/</code>
2. Type the store password and press **Sign in**.
3. The first time on a computer, she names the computer and presses **Save**.
4. She picks her name from **Pick user**, at the top right.
5. She opens **Buy** and types a card.

<details>
<summary><strong>What the app needs</strong></summary>
<br>

- **A wide window.** At least 1200 pixels. A narrower window shows *"PUG Pricing Tool is built for
  store computers. Please use a wider window."* instead of the app.
- **An internet connection.** Without one, a yellow bar says *"No connection — changes are
  paused."* Nothing can change until it comes back. Everything reloads by itself when it does.
- **A user picked.** Anything that changes data needs one. With no user picked, those buttons look
  greyed out and the user button pulses when one is pressed.

</details>

<br>

---

<br>

# Core ideas

Five things make the rest of the app make sense.

**A buy** is one customer at the counter. She builds it on the **Buy** tab and finishes it with
**CONFIRM BUY**. It then sits on that day in the **Calendar**.

**A collection** is a larger lot. It gets a customer's name, phone number and the last 4 of their
ID. It's priced card by card, then offered, then paid for. Its **status** says where it is.

**A project** is a box of the store's own cards. It has no customer. It's priced so it can be
exported.

**Market, Cash and Credit.** Market is what the cards sell for. The store pays a share of it:
**Cash** at one percentage, **Credit** at a higher one. Both are set in **Settings**. Cash is green
everywhere in the app. Credit is blue.

**Export.** Magic cards go to Crystal Commerce as a **Mass Create** file. Exporting marks the cards
**Completed**. Pokémon cards can't be exported yet.

### Statuses

<table>
<tr><th align="left">Status</th><th align="left">Colour</th><th align="left">Meaning</th></tr>
<tr><td><strong>Processing</strong></td><td>🟠 amber</td><td>Being priced.</td></tr>
<tr><td><strong>Priced</strong></td><td>🔴 red</td><td>An offer was made. Waiting on the customer.</td></tr>
<tr><td><strong>Paid/Ours</strong></td><td>🟢 green or 🔵 blue</td><td>Paid for, in cash (green) or credit (blue). Locked. Waiting to be exported.</td></tr>
<tr><td><strong>Ours</strong></td><td>⚪ white</td><td>Paid/Ours for the store's own cards: projects and Can't upload cards.</td></tr>
<tr><td><strong>Completed</strong></td><td>⚫ grey</td><td>Exported, or marked done. Locked, and left out of the header search.</td></tr>
<tr><td><strong>Rejected</strong></td><td>faded red</td><td>The customer said no. Locked, and left out of the header search.</td></tr>
</table>

A walk-in buy is **Paid/Ours** from the moment it's confirmed. It becomes **Completed** once it's
exported.

### Rounding

Prices are always rounded **down** by these steps. Cash and Credit amounts are too.

<table>
<tr><th align="left">Price</th><th align="left">Rounded down to the nearest</th></tr>
<tr><td>Under $1</td><td>cent</td></tr>
<tr><td>$1 to $10</td><td>quarter</td></tr>
<tr><td>$10 to $100</td><td>dollar</td></tr>
<tr><td>$100 to $1,000</td><td>$5</td></tr>
<tr><td>$1,000 and up</td><td>$10</td></tr>
</table>

A price she types by hand is never rounded. Sell Prices on an export use the same steps, rounded
**up** (see [Exporting](#-exporting-to-crystal-commerce)).

<br>

---

<br>

# 🔝 The header

The header is the same on every tab.

| | |
|---|---|
| **Logo and name** | Go to **Home**. |
| **User button** | Shows who's working at this computer, in her colour. Reads **Pick user** when no one is picked. |
| **Sign-out icon** | Beside the user button. Un-picks the current user. The next person picks a user before doing anything. |
| **?** | Opens **Help**: this guide, inside the app, a section at a time, with pictures. <kbd>←</kbd> and <kbd>→</kbd> turn the pages. |
| **Search buys & collections…** | Finds cards already bought. See below. |
| **Tabs** | Home, Buy, Collections, Calendar, Settings. **Changelog** sits apart on the right. Clicking the tab she's already on takes it back to its start. |

### Users

Clicking the user button opens the list of users.

| | |
|---|---|
| **A name** | Picks that user. A ✓ marks the current one. |
| **⋯** | Opens that user's colour swatches and **Delete…**. |
| **Colour swatches** | Change the user's colour. It shows on everything she does. |
| **Delete…** | Asks first. A deleted user disappears from the list. Past buys still show her name. |
| **+ Add user…** | Type a name and press **Add**. A colour is given automatically. |

Esc or a click outside closes the list.

### Header search

She types two or more characters: a card name, a collector number, a set code, or any mix. Results
list every buy and collection holding a matching card.

- **Collections** come first, then **buys** filed under their day (*Today*, *Yesterday*, then the date).
- Each result shows where it is and every matching card, with its condition.
- Hovering a result shows the card's picture.
- **↓ ↑** move through results. **Enter** opens one. **Esc** closes the list.
- Opening a buy goes to its day page. Opening a collection goes to its screen. The matching cards
  flash.

By default it searches **Paid/Ours** only. **Show all** adds Processing, Priced, Completed and
Rejected. Completed and Rejected results are faded. Show all switches itself off when the list
closes.

At most the newest 200 matching cards show. Adding a number or a set code narrows it.

### Banners

Bars under the header appear when something needs attention.

| Banner | When it shows |
|---|---|
| **Master Crystal Inventory required** (red) | No inventory file has been uploaded. **Open Settings** goes there. Exports can't run without it. |
| **No connection — changes are paused** (yellow) | The connection dropped. |
| **JustTCG daily limit reached** (yellow) | The day's price lookups are used up. It says when they come back. Until then, prices are typed by hand. |
| **Last backup downloaded N days ago** (yellow) | The last backup is more than 7 days old. **Download backup** saves one. **×** hides the bar until the browser is closed. |

<br>

---

<br>

# 🏠 Home tab

The first tab, and where the app opens. It shows what needs doing today. Everything on it updates
by itself. Nothing on Home changes data: every button goes somewhere else.

The background band takes the current user's colour.

### Today

| | |
|---|---|
| **Buys** | Walk-in buys confirmed today, and how many cards. |
| **Paid out** | What those buys paid in all, split into cash and credit. |
| **Magic / Pokémon** | Cards bought today in each game. |

### Quick actions

| | |
|---|---|
| **Buy cards** | Opens the **Buy** tab. |
| **Today's day** | Opens today's Magic day page. |
| **+ Start Project** | Opens **Collections** with the new project form. |
| **+ Price Collection** | Opens **Collections** with the new collection form. |

### Collections and projects

Five counts. **Collections →** opens the Collections tab.

| | |
|---|---|
| **To price** | Collections in Processing. |
| **Offer out** | Collections in Priced. |
| **To export** | Collections in Paid/Ours. |
| **Projects open** | Projects not yet Completed. |
| **Can't upload** | Cards waiting in Can't upload cards. Click to open it. |

Under the counts are the open projects and the Paid/Ours collections, three at a time. Each shows
its cards and their value. A collection says *ready to export*. A project says how old its oldest
price is. That turns amber at 14 days: time for a **REPRICE?**. **+N more on Collections** shows
the rest.

### Days to export

Past days with Magic buys not exported yet, oldest first. The heading counts them. A day 3 or more
days old shows its age in red. Click a day to open it. Today never appears: a day can't be exported
until it's over.

With nothing waiting it says **✓ Everything's exported**. Below that, **Recently exported** lists
the last few exported days with their Custom SKU.

### Recent activity

The latest Changelog entries: the time, what happened, and who did it. **Changelog →** opens the full
log.

A yellow bar at the top warns when 80% of the day's JustTCG lookups are used.

<br>

---

<br>

# 🛒 Buy tab

The pricing screen. A collection uses the same screen, so everything here applies there too.

The screen has six parts:

- **The search bar** across the top.
- **The selected card**, large, on the left, with its condition prices under it.
- **The card details** beside it, with the **suggestions** under them.
- **The price panel**, showing what the store pays.
- **Finish and Details** on the right, with **Qty**, **CLEAR** and **ADD CARD** under them.
- **The buy list** down the right edge.

The buy in progress is saved after every change, on this computer. A refresh or a crash loses
nothing. Each computer has its own buy in progress.

### The search bar

She types what's printed on the card: the name, then the collector number, then the set code. Any
part can be left out. The sample text shows one: `Lightning Bolt 117/331 2X2`.

- The number works with or without the set size (`117` or `117/331`).
- A misspelt name still finds the card. The line under the bar says *"Showing results for …"*.
- With no match it says *"No cards match. Check the number and set code."*

| | |
|---|---|
| **MTG \| PKM** | Which games to search. Both are on to start. One always stays on. |
| **EN \| JP** | English or Japanese Pokémon. EN to start, every time the screen opens. |

**Japanese Pokémon** are found by number and set code: `025/165 SV2a`. The oldest Japanese sets
(1996 to 2001) have no set numbers. Those are found by the Pokédex number printed on the card:
`No. 32`. JP is Pokémon only, so MTG is greyed out while it's on. A **JP** chip shows in the bar.

A set code from the other language gets a note under the bar, with a **switch to JP** (or **EN**)
link.

### Suggestions

Up to 10 matching printings, in two rows of 5. A shorter window shows one row of 5.

| | |
|---|---|
| **Click** | Selects the card. Clicking the selected card again un-selects it. |
| **Right-click** | Searches the card's name, to show every printing of it. |
| **Newest first / Oldest first** | Sorts the printings by release date. |
| **… show all (N)** | Opens every match in a window. Arrow keys move, **Enter** picks, **Esc** closes. |
| **Hover** | Shows the set symbol in its rarity colour. |

A search with one match selects it straight away. When Scryfall or TCGdex is slow or busy, a line
above the suggestions says so and retries by itself.

### The selected card

The card, large. Foils, holos and reverse holos shine. The finish is named under the card:
**✦ FOIL**, **✦ ETCHED FOIL**, **✦ HOLO** or **✦ REVERSE HOLO**. Poké Ball and Master Ball
pattern reverse holos get a ball badge.

**⟲ Flip** shows the back of a two-faced card.

### Card details

The name, set and set code, number and set size, rarity, game and language. A Japanese card shows
its English name beside the Japanese one. Pokémon cards show their regulation mark.

Three links open the card on other sites, each in its own pop-up window:

| | |
|---|---|
| **View on Scryfall / TCGdex** | The card's page on the site the app found it on. |
| **View on TCGplayer** | The exact product. **Find on TCGplayer** means it's a search instead. |
| **View on Cardmarket** | The exact product. **Find on Cardmarket** means it's a search instead. |

### Finish and Details: Magic

| | |
|---|---|
| **FOIL switch** | Green **FOIL ON** or red **FOIL OFF**. A 🔒 means this printing only comes one way. |
| **Etched** | Switches to the etched foil printing. Shows only when one exists. |
| **Tick boxes** | Traits that differ between printings in this set, like Borderless or Showcase. Ticking one moves to that printing. |
| **Grey chips** | Traits every printing in this set shares. For reading only. |

### Finish and Details: Pokémon

| | |
|---|---|
| **NORMAL \| HOLO \| REVERSE** | The finish. A finish never printed is greyed out. |
| **Version** | When a finish has several versions (1st Edition, Poké Ball pattern…), she picks one here. A **TCGplayer** tag marks a product only TCGplayer lists. |
| **From TCGplayer** | The card itself is from TCGplayer's catalogue: TCGdex doesn't list it yet. |
| **Chips** | Rarity and language. |

### Condition prices

Five big buttons: **NM**, **LP**, **MP**, **HP** and **DMG**. Each shows that condition's price.
Clicking one picks the condition. NM is picked for every new card.

- A price with no tag is JustTCG's own price.
- **fallback** marks a price worked out from another one (see [How prices are worked out](#how-prices-are-worked-out)).
- **TCGplayer** marks prices that all come from TCGplayer's Market Price.
- **CM** marks a price from Cardmarket.
- **—** means there's no price.
- Hovering a button explains exactly where its price came from.
- **⚠️** on NM means JustTCG's price may be wrong.

| | |
|---|---|
| **Use TCGplayer** | Ignores JustTCG. NM comes from TCGplayer's Market Price, the rest from the fallback percentages. Click again to go back. |
| **Use Cardmarket** | Ignores JustTCG. NM comes from Cardmarket's European price in dollars, the rest from the fallback percentages. Click again to go back. |
| | Both are greyed out when there's no price to switch to. |
| **✎ Manual price** | She types the price herself. It belongs to the picked condition: picking another condition clears it. |
| **×** | Clears the manual price. |

The line underneath says when the prices were updated. It also says when there's no JustTCG key,
when the daily limit is reached, or when prices failed to load (with **Retry**).

### The price panel

The picked condition's price, large, in green. A tag says where it came from: **manual**,
**fallback**, **TCGplayer** or **cardmarket**. Under it, **Credit** and **Cash**: what the store
pays for one copy.

**⚠️ Price may be wrong (N)** appears when something about JustTCG's price looks off. Hovering it
lists the reasons. Clicking keeps the list open. The reasons:

- Scryfall's or TCGdex's NM price is 25% or more away from JustTCG's (and at least $1).
- A worse condition is priced at more than twice a better one.
- A 1st Edition is priced below its Unlimited version.
- Cardmarket's price is twice JustTCG's, or half of it (and at least $5 apart).

### Qty, CLEAR and ADD CARD

| | |
|---|---|
| **Qty** | How many copies: 1 to 99. **Enter** in the box adds the card. |
| **CLEAR** | Empties the card area. The buy list stays. |
| **ADD CARD** | Adds the card to the buy list. The new line flashes. The card area clears for the next card. |

ADD CARD needs a user, a selected card, a price and a connection. Hovering it says what's missing.
Adding the same printing, finish, condition and price again raises that line's quantity instead of
adding a new line.

### The buy list

Every card in the buy, in the order added, under **Magic** and **Pokémon** headings. The heading
counts the cards.

| | |
|---|---|
| **Price** | The price for one copy. |
| **Hover a line** | Shows the card's picture beside the list. |
| **Click a line** | Loads the card back to edit it. The button reads **EDIT CARD** and saves over the line. **CANCEL** or **Esc** leaves it as it was. Edited cards take today's price. |
| **×** | Removes the card, after asking. With several copies, it asks how many. **Remove all N** takes every copy. |

### Totals and rates

| | |
|---|---|
| **Market** | Every card's price times its quantity. |
| **Cash (N%)** | What the store pays in cash. |
| **Credit (N%)** | What the store pays in credit. |

Clicking a percentage opens **Rates for this buy**. She can set a different Cash % or Credit % for
this buy only. A ✎ marks a custom rate. **Use master rates** goes back to the ones in Settings.
**Done** closes it.

### CANCEL and CONFIRM BUY

**CANCEL** throws the buy away. With cards in it, it asks first: **Keep buy** or **Discard**.

**CONFIRM BUY** opens the confirm window. It shows the totals and asks for:

| | |
|---|---|
| **Customer name** | Required. |
| **Phone number** | Required. Ten digits. Formatted as she types. |
| **Purchase price** | Required. **Cash** or **Credit**, then the amount actually paid. Nothing is filled in for her. |
| **Notes** | Optional. |

It names who is confirming. **Confirm buy** files the buy on today's date and starts a fresh one.
A message says its number: *"Buy confirmed — Buy 4 today (Magic)"*.

### Keyboard shortcuts

The cursor stays in the search bar, so these work while typing.

<table>
<tr><td><kbd>↓</kbd> <kbd>↑</kbd></td><td>Move through the suggestions. The highlighted card is selected.</td></tr>
<tr><td><kbd>Enter</kbd></td><td>ADD CARD. On <strong>… show all</strong>, opens every match.</td></tr>
<tr><td><kbd>Esc</kbd></td><td>CLEAR. While editing a line, leaves it as it was.</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>1</kbd> … <kbd>5</kbd></td><td>Condition: NM, LP, MP, HP, DMG.</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>F</kbd></td><td>Foil on or off (Magic). The next finish (Pokémon).</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>Q</kbd></td><td>Jump to Qty.</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>M</kbd></td><td>Type a manual price.</td></tr>
</table>

The same list sits at the bottom of the screen.

### How prices are worked out

1. **JustTCG** gives a price for each condition. Those are used first.
2. **A missing condition** gets a fallback: JustTCG's NM price times that condition's percentage in
   **Settings → Master Fallback Percentages**.
3. **With no JustTCG NM price**, the fallback starts from TCGplayer's Market Price instead (through
   Scryfall for Magic, TCGdex for Pokémon).
4. **Prices never go up as the condition gets worse.** A JustTCG price higher than a better
   condition's is thrown out and replaced by a fallback. A fallback that would match or beat the
   better condition is set 10% below it for Magic, 15% for Pokémon.
5. **Japanese Pokémon** with no JustTCG price use Cardmarket automatically.
6. **Every price is rounded down** by the store's steps.

<br>

---

<br>

# 📦 Collections tab

Every collection and project, in three tables.

| Table | What's in it |
|---|---|
| **System** | **Can't upload cards**, made by the app. |
| **Projects** | The store's own cards, priced for an export. |
| **Collections** | Customers' collections. |

### Buttons

| | |
|---|---|
| **Import Collection** | Picks a CSV file and turns it into a new project. See [Import Collection](#-import-collection). |
| **+ Start Project** | Opens the new project form. |
| **+ Price Collection** | Opens the new collection form. |
| **Search name or phone…** | Narrows all three tables. |
| **Status pills** | On the Collections table: **All**, **Processing**, **Priced**, **Paid/Ours Cash**, **Paid/Ours Credit**, **Completed**, **Rejected**. |

### The tables

| Column | Shows |
|---|---|
| **Name** | The customer's or project's name. |
| **Phone** | The phone number. Projects show a **Project** chip, Can't upload cards a **System** chip. |
| **Status** | The status chip. |
| **Created** | The date it was made. |
| **Last edited** | When it last changed. |
| **Last edited by** | Who changed it. |
| **Notes** | The notes. |
| **Offer** | The offer in cash / credit. **TBD** in amber until there is one. |
| **Paid** | The price paid, green for cash or blue for credit. **TBD** until paid. Rejected shows **$0** in red. |

Clicking a column heading sorts by it. Clicking again reverses it. Newest first to start. Clicking
a row opens it.

A row open on another computer says so: *"✎ open on Front Counter (Clio)"*.

### + Price Collection

| | |
|---|---|
| **Name** | Required. Up to 80 characters. |
| **Phone number** | Required. Ten digits. Formatted as she types. |
| **Last 4 ID** | Required. The last 4 letters or digits of the customer's ID. |
| **Notes** | Optional. |

**Create** makes the collection in **Processing** and opens it.

### + Start Project

A **Name** and optional **Notes**. **Start** makes the project and opens it. A project starts as
**Ours** and has no phone, ID, offer or price paid.

<br>

---

<br>

# 🗂 A collection

A collection opens on the Buy tab's screen, with three differences:

- **< BACK**, before the search bar, returns to the Collections tab.
- The list is the **Collection list**, with the collection's **details** at its foot.
- Instead of CANCEL and CONFIRM BUY, there's **REPRICE?** and **EXPORT**.

Every card added or removed is saved at once and written to the Changelog. Holding a CSV file over
the window shows whether it can be imported here (see [Import Collection](#-import-collection)).

### One computer at a time

Only one computer can edit a collection at once. Anyone else sees it **view only**, with a bar:
*"✎ Being edited on Front Counter by Clio since 2:14 PM."* **Take over** asks first, then moves the
editing here. The other computer switches to view only.

When the editing computer closes the collection, or its browser, the next computer takes over by
itself within about a minute.

### Details

The header bar always shows the name and status.

| | |
|---|---|
| **Name and status** | Click to fold the details away, or bring them back. |
| **⋯** | **Delete collection…** |
| **Arrow button** | Folds or unfolds the details. |
| **Name, Phone, Last 4 ID, Notes** | Click the ✎ to edit in place. **Enter** saves. Clicking away saves. **Esc** leaves it as it was. Notes save with **Ctrl+Enter**. |
| **📞 (N)** | On a Priced collection, beside the phone. See below. |
| **Status** | A dropdown, and a step button for the next status. |
| **Offer** | The offer, or TBD. |
| **Paid** | The price paid and how, or TBD. |
| **Created / Edited** | When, and by whom. |

Projects have no phone, Last 4 ID, offer or paid rows, and no status controls.

### Moving through the statuses

**Mark as Priced →** opens **Mark as Priced**. It shows Market, Cash and Credit. She types the
cash offer. The credit offer is worked out from it, at this collection's rates, rounded down.
**Save offer** records both.

**Mark as Paid/Ours →** opens **Mark as Paid/Ours**. It shows the totals and the offer. She picks
**Cash** or **Credit** and types the price actually paid. **Mark Paid/Ours** locks the collection.
**Mark as Rejected?** switches to the Reject window instead.

**Rejected** comes from Processing or Priced. She can type a reason (optional). **Reject** locks
the collection. It's kept with its prices and offer until it's deleted.

**Completed** only comes from **EXPORT**. It can't be picked from the dropdown.

### Going backwards

| From | Button | What happens |
|---|---|---|
| **Priced** | Dropdown → Processing | Goes straight back. |
| **Paid/Ours** | **🔒 Unlock** | Back to Priced, and editable. The price paid is cleared. The offer stays. The dropdown can send it to Processing instead. |
| **Completed** | **Reopen** | Back to Paid/Ours, still locked, the price paid kept. The export is undone: Sell Prices go and Can't upload copies come back out. |
| **Rejected** | **Reopen** | Back to Priced with its offer, or to Processing if it had none. The reason stays in the Changelog. |

Reopening a Completed collection doesn't undo the file already downloaded. If it was uploaded to
Crystal Commerce, the stock there is fixed by hand.

### What can change in each status

| Status | Add and edit cards | Remove cards |
|---|---|---|
| Processing, Priced | Yes | Yes |
| Paid/Ours | No | Yes |
| Ours (a project) | Yes | Yes |
| Completed, Rejected | No | No |

### 📞 Calls

On a Priced collection, **📞 (N)** sits beside the phone number. She clicks it after each call to
the customer about the offer. N counts the calls. Hovering lists each call, with when and who. Each
call is a Changelog entry.

### REPRICE?

Gives every card today's buy price for its condition. Works on Processing and Priced collections,
projects, and Can't upload cards. It asks first.

- Each card is priced the way it was priced before, Use TCGplayer and Use Cardmarket included.
- Manual prices stay as typed.
- A card with no price today keeps its old price.
- Sell Prices aren't touched.
- It uses about one JustTCG lookup for every 100 different cards.

A message afterwards says how many prices changed and the Market total before and after.

### EXPORT

Sends the collection's Magic cards to Crystal Commerce. See
[Exporting](#-exporting-to-crystal-commerce).

| Status | What EXPORT does |
|---|---|
| Processing, Priced | Says to mark it Paid/Ours first. |
| Paid/Ours, Ours | Opens the export. Afterwards the collection is **Completed**. |
| Paid/Ours, Pokémon cards only | Asks, then marks it **Completed** with no file. |
| Completed | Downloads the same file again. Nothing changes. |
| Rejected | Says there's nothing to export. |

A Completed collection shows its **Custom SKU** in the list heading. Its prices show in green: those
are the Sell Prices written to the file.

### Delete collection…

From the ⋯ menu. Two steps. First a warning with the card count and **Continue**. Then she types the
collection's name. **Delete forever** removes it and every card in it. This can't be undone.

### Can't upload cards

The **System** collection. It holds Magic cards an export couldn't match to a Crystal Commerce
product.

- It's always **Ours**. It has no phone, status controls or Delete.
- Cards only arrive from exports. The search bar is switched off.
- Each card says where it came from.
- **×** removes a card once it's dealt with.
- **EXPORT** tries them again. It warns first: they failed once already. Cards that match leave the
  collection. The rest stay.
- **REPRICE?** works here too.

<br>

---

<br>

# 📅 Calendar tab

Two month grids side by side: **Magic** and **Pokémon**. Weeks start on Sunday.

| | |
|---|---|
| **◀ ▶** | The month before or after. Both grids move together. |
| **Today** | Back to this month. |
| **Export Cash Buys (N)** | Downloads the month's cash buys as a CSV. See below. |

Each day shows how many buys were confirmed that day. One dot per buy, in the colour of the user who
confirmed it. More than 12 buys shows 11 dots and a plus. Today is highlighted. A buy with both
games counts in both grids.

A day whose buys are all done turns grey and says **Exported** (or **Completed** if they weren't
exported). Clicking a day with buys opens its **day page**.

### Export Cash Buys

Downloads one CSV for the month shown: walk-in buys paid in cash, and collections and projects paid
in cash that month. It's for the store's records and taxes. Hovering the button says when it was last
downloaded, and by whom.

A finished month with cash buys that was never downloaded gets a yellow reminder bar, with a
**Download** button for that month.

<br>

---

<br>

# 📆 A day page

One game's part of every walk-in buy confirmed that day.

### The top row

| | |
|---|---|
| **< BACK** | Back to the Calendar, on the same month. |
| **⋯** | The day's menu. See below. |
| **EXPORT (N)** | Magic days. Exports the day. N is the cards to export: count the pile first. |
| **COMPLETE (N)** | Pokémon days. Marks the day Completed. See below. |

The title shows the date and game. Once exported it also shows **Exported** and the **Custom SKU**.
A line under it says when the day was exported, by whom, and how many cards couldn't upload.

**Today can't be exported or completed until it's over.** Buys confirmed later would miss it.

### The day's ⋯ menu

| | |
|---|---|
| **Check Crystal Commerce matches** | Magic days. A practice run of the export. Nothing is exported. Products she picks are remembered. |
| **Mark Paid/Ours again…** | Once buys are Completed. Puts the day's Completed buys back to Paid/Ours: unlocked, back in the search, showing buy prices again. For a day exported or completed too early. |

Marking a day Paid/Ours again doesn't undo the downloaded file. If it was uploaded to Crystal
Commerce, the stock there is fixed by hand.

### A buy

Each buy is a panel in the colour of the user who confirmed it. Its header shows **Buy N**, the
user, the time and its status.

- The customer's name, phone number and notes.
- A table of its cards: **Price**, **Qty**, **Card** and **×**. Hovering a row shows the card.
- **Market**, **Cash** and **Credit** for this game's cards, at the buy's own rates.
- **Paid**: what the customer was paid, for the whole buy (both games).
- **Also has N Pokémon cards →** (or Magic) opens the other game's day page.

**×** removes cards. It asks how many. Removing the last card deletes the buy, after asking.

Once Completed, a buy is locked. Its prices show in green: those are its Sell Prices.

### A buy's ⋯ menu

| | |
|---|---|
| **Mark as completed** | Completes this buy's cards without exporting them. They're locked, and left out of the search and the day's export. |
| **Mark Paid/Ours again** | Undoes Mark as completed. On an exported buy it reads **Mark Paid/Ours again…** and undoes this buy's export only. |
| **Export single buy…** | Magic only. Exports just this buy, on any day, today included. The rest of the day stays as it is. |
| **Convert to project…** | Moves every card, both games, into a new project with the buy's notes and rates. The buy is deleted from the day. The name starts as the customer's. |
| **Delete buy…** | Deletes the buy and every card in it, both games. Asks first. |

**Convert to project…** and **Delete buy…** are locked once any of the buy's cards are Completed.

### COMPLETE (Pokémon days)

Pokémon can't be exported yet. **COMPLETE** marks the day's Paid/Ours Pokémon buys **Completed**
instead. It asks first. Each card gets today's Sell Price, worked out as an export would, shown in
green. Nothing is exported. It uses about one JustTCG lookup. **⋯ → Mark Paid/Ours again** undoes it.

<br>

---

<br>

# 📤 Exporting to Crystal Commerce

EXPORT turns Magic cards into a **Mass Create** file for Crystal Commerce. It runs from a day page,
a single buy, a collection, a project, or Can't upload cards. It needs the **Master Crystal
Inventory** in Settings.

### 1. Matching

The app matches each card to one Crystal Commerce product, by name and category. It also fetches
today's prices for the Sell Prices. A line shows what it's doing.

### 2. Review

The cards fall into three groups.

**Needs a choice.** More than one product could fit. For each card she picks one:

| | |
|---|---|
| **A product** | Picks it. Every card of the same printing and finish takes the same pick. |
| **None of these (can't upload)** | Sends the card to Can't upload. |
| **Find another CC product…** | Searches the inventory by name. |
| **Sell price** | Optional. Empty uses the worked-out price. At least $0.40. |
| **Always use the picked product's category for…** | Shows when the app didn't know the set's category. Ticked, the choice is remembered for the whole set. |

**Matched.** Folded away when there are more than 8. Each card shows its product, its category, and
*"Bought $X → Sell $Y"*. A **remembered** tag means a pick from before. **picked** means she just
picked it. **Change** opens the card: she can pick another product or type a Sell price, then
**Done** or **Cancel**.

**Can't upload.** No product fits. Each says why. **Find a product…** moves it back to Needs a
choice.

**Continue** is ready once every card in Needs a choice is decided.

### 3. Confirm

A summary: how many cards, how many rows, and the **Custom SKU**.

If any cards can't upload, a red list names them. She pulls those cards out of the physical batch
and ticks **I've pulled these cards out of the batch**. They're left out of the file. They're marked
**Can't upload** and copied to **Can't upload cards**.

**Export N cards** saves everything and downloads the file. The cards become **Completed**. With
nothing matched, the button reads **Mark them Can't upload** and no file is made.

The app never uploads the file. She uploads it in Crystal Commerce's Mass Create page.

### The Sell Price

Each exported card gets a **Sell Price**: its market price for its condition today.

- It's worked out the same way the buy price was.
- It's rounded **up** by the store's steps.
- It's never below **$0.40**.
- A card bought at a manual price gets the higher of that price and today's.
- A card with no price today uses its market price from the day it was bought.

After the export, Sell Prices show in green wherever the card appears.

### The file

| | |
|---|---|
| **Name** | `cc-mass-create-magic-2026-10-06.csv` for a day. Collections and single buys get their own names. |
| **Custom SKU** | The export's date, month-day-year, with no leading zero on the month: 10/09/26 is `100926`, 6/17/26 is `61726`. On every row. |
| **Conditions** | Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged. |
| **Rows** | One per product, condition and Sell Price. Quantities are added together. |
| **Quantity** | Added to the stock already in Crystal Commerce. |

**EXPORT** on a Completed day or collection downloads the same file again. Nothing changes.

### Remembered matches

Every product picked by staff, and every card the app matched and exported, is remembered. The next
export of that printing matches it straight away. **Settings → Crystal Commerce matching** lists
them.

<br>

---

<br>

# 📥 Import Collection

Reads a CardBot CSV back into cards. Magic only.

**Two ways in:**

- **Import Collection** on the Collections tab. The cards become a new project.
- **Drop a CSV file** onto an open collection or project with no cards in it, that this computer
  can edit. The cards go into that one. A message over the window says whether the file can go
  there.

**Two kinds of file:**

| | |
|---|---|
| **Mass Create** | CardBot's Crystal Commerce format, or a file this app exported. |
| **TCGplayer** | CardBot's TCGplayer format. Each row is a TCGplayer SKU, so most cards match exactly. It needs a **TCGplayer Id** column. |

### Review

The app matches each row to its exact printing. The rows fall into three groups.

**Needs a choice.** She picks the printing. Printings with a different number or finish are listed
after the rest. **Find another printing by name, then Enter…** searches. **Skip this row** leaves it
out.

**Matched.** Each row shows its printing. Tags say how it matched: **by SKU**, **remembered**,
**export match**, **picked**, or **another set**. **Change** lets her pick a different one.

**Can't import.** Rows that can't be used, each with its line number and why.

The footer shows the cards, their value at the file's prices, and the rows skipped.

- For a new project: **Next: name the project**. The name is filled in from the file's name.
  **Create project** makes it and opens it.
- Into an empty collection: **Import N cards**.

Prices are the file's. A TCGplayer file with no price uses TCGplayer's market price for that SKU.
**REPRICE?** brings them up to today. Printings she picks are remembered for the next file.

<br>

---

<br>

# ⚙ Settings tab

Everything here is shared by every computer, except **This computer**.

### Master Crystal Inventory

The full inventory CSV exported from Crystal Commerce. Exports use it to match products. It's red
with a **Required** badge until one is uploaded.

| | |
|---|---|
| **Upload Crystal Commerce Database** | Picks the CSV. It's checked, compressed and loaded, with progress shown. A new file replaces the old one. |
| **Current file** | Its name, with **Download** to get it back. |
| **Uploaded / By** | When, and who. |
| **Rows** | How many rows, and how many products are loaded for export. |
| **Columns** | The file's columns. |

### This computer

| | |
|---|---|
| **Computer name** | Shown on buys in progress and on collections open here. Saved when she leaves the box. |
| **Sign out** | Signs this browser out of the app. The store password is needed again. |

### API keys

The **JustTCG** key, for condition prices. Once saved, it only ever shows masked.

| | |
|---|---|
| **Add key / Edit** | Paste the key and press **Save**. |
| **Test** | Checks the key. Shows the plan and how many lookups are used today and this month. |
| **Delete** | Asks first. Prices stop loading until a new key is saved. Fallback and manual prices still work. |

### JustTCG usage

Two bars: **Today** and **This month**. Amber from 80%, red from 95%. Under them: the plan, the
lookups allowed per minute, and when the daily count resets (midnight UTC).

### Master Buy Percentages

**Cash %** and **Credit %**: what the store pays, as a share of Market. Saved when she leaves the
box. Changes apply at once to buys in progress and to unpaid collections. Confirmed buys and
Paid/Ours collections keep the rates they had.

### Master Fallback Percentages

A percentage for each condition, NM to DMG, for Magic and for Pokémon. They work out the prices
JustTCG doesn't give (see [How prices are worked out](#how-prices-are-worked-out)).

### Crystal Commerce matching

| | |
|---|---|
| **Sets** | Sets whose Crystal Commerce category staff picked during an export. **Forget** removes one. |
| **Products** | How many products are remembered: picked by staff, matched by the app, and in all. |
| **Browse remembered products…** | Opens the list. Search by name. **Show 50 more** loads more. **Forget** removes one. |

A forgotten match is worked out again on the next export.

### Backups

| | |
|---|---|
| **Download backup** | Saves a file of every buy, collection, card, Changelog entry, staff user and setting. It doesn't hold the Crystal Commerce CSVs or the API key. |
| **Last backup** | When the last one was downloaded. |
| **Restore from backup…** | Replaces everything with a backup file. See below. |

The free plan has no automatic daily backups. A backup should be downloaded at least once a week.
The banner under the header reminds everyone after 7 days.

**Restoring** shows what's in the file beside what's here now. She types **RESTORE** and presses
**Restore**. A backup of what's here downloads first. Then everything is replaced, on every
computer. Computer names, the Crystal Commerce CSVs and the API key stay as they are.

The foot of the tab lists where the app's data comes from, and the app's version.

<br>

---

<br>

# 🕒 Changelog tab

A record of every change, newest first, on a timeline. It sits apart from the other tabs, on the
right. It only records: nothing is changed or undone from here.

### Filters

| | |
|---|---|
| **Buys · Collections · Actions** | Categories. Click one to show only that. **Ctrl+click** or **right-click** adds or removes one. One always stays on. It opens on **Buys**. |
| **All · Magic · Pokémon** | Which game. |
| **Filter by card, customer or collection…** | Narrows the entries. Phone digits find a customer's whole history. |
| **Funnel** | On a panel. Shows only that buy's or collection's history. |
| **Show everything** | Clears the filters. |

**Actions** covers status changes, edits, calls, repricing, day exports and completions, and Cash
Buys downloads.

### A panel

| | |
|---|---|
| **Time and headline** | When, and what happened. New things are green. Deleted things are red, with a cross on the line. |
| **Name** | The buy, collection, day or month. Click to open it. A deleted one isn't a link. |
| **+N / −N** | Cards added and removed. |
| **User** | Who did it, in her colour. |
| **Market / Cash / Credit** | Totals, where they apply. |
| **Card rows** | Each card added (+) or removed (−), with its price. |
| **Field rows** | Each detail changed, before → after. |

Cards added to one collection by one user, each within 15 minutes of the last, show as one panel.
A restored backup shows as a marker across the timeline.

20 panels to a page. **‹ Newer** and **Older ›** turn the pages. **↑ Back to top** sits at the
bottom. Clicking the Changelog tab again starts it over.

<br>

---

<br>

<p align="center">
  <sub>Magic card data and images from Scryfall. Pokémon card data and images from TCGdex. Prices
  from JustTCG.<br>
  Not affiliated with Wizards of the Coast or The Pokémon Company.</sub>
</p>
