# PUG Pricing Tool — Scan Function Specification

| | |
|---|---|
| **Product** | PUG Pricing Tool: the SCAN function (a phone scans Magic cards straight into a computer's buy list) |
| **Owner** | Players' Union Games (PUG) |
| **Spec version** | 1.0 — 2026-10-16 |
| **Status** | **Built, Phases S1–S5 (2026-10-16), on dev, not pushed**; waiting for the owner's check. Section 16 says where the build differs from the plan. The owner's answers are in Appendix B; the ◆ choices there are the engineer's and can be overturned |
| **Learnings** | `docs/SCAN_LEARNINGS.md`: what the first attempt at auto scanning on the owner's iPhone taught us (rolled back to `e191f25` on 2026-10-16; that code is the local tag `scanner-attempt-1`) |
| **Extends** | `docs/DESIGN_SPEC.md` (Section 7.10 "Screen sizes" gains the phone's page; Section 8 the computer's side) |
| **Project folder** | `C:\ClaudeProjects\pug-pricing-tool` |

---

## 0. How to use this document

This spec is written for an engineer building the scanner with Claude Code. It sits beside `docs/DESIGN_SPEC.md`, which describes the rest of the app and stays the source of truth for everything outside scanning. Where it says **must**, that is a requirement. Where it says **should**, use judgement. If something here conflicts with the owner's later instructions, the owner wins. Update this file so the conflict doesn't come back.

1. **Read the whole document before starting**, and read `DESIGN_SPEC.md` Sections 4 (architecture), 6.1 (data model, above all `buy_lines` and line identity for merging), 7.3–7.4 (users and devices), 8.7–8.10 (prices, ADD CARD, the buy list, drafts), 9.4–9.6 (a collection's pricing screen and lock) and Appendix A (working rules), plus `SQUASH.md` Section 11 (how migrations are written now) and `FABLE.md` (the code's shape). Sections 1–14 here describe the finished scanner. Section 15 splits the build into five phases, S1–S5.
2. **Build one phase at a time, in order.** Each phase ends at a state the owner can check on `localhost` and on a phone (Section 11). Don't start the next phase until the owner has reported back.
3. **The owner is QA** (`DESIGN_SPEC.md` Appendix A). Build, run `npm run lint`, `npm test` and `npm run build`, fix errors, then hand off with the phase's "Where to look" list. The one exception is the recognition benchmark (Section 11.3), which the engineer runs on the owner's photos.
4. **Migrations:** `SQUASH.md` Section 11 is the rule. The scanner's migrations took the next free numbers (0068–0070, Section 16), and `SQUASH.md`'s numbers moved along (baseline 0071, Changelog lock 0072). This document calls them S-1, S-2… Apply to **dev** only. Each new server function goes into `scripts/db-test-run.sql`.
5. **Licence:** the recognition code is copied from an open-source project under the **GPL-3.0** (Section 10). The owner has chosen to put the whole repo under that licence. Phase S2 does it; nothing of mtgscan's is committed before the licence file is.
6. **No secrets in this document, the repo or the code** (`DESIGN_SPEC.md` 0.6). Card photos used as benchmark fixtures stay out of the repo too (Section 11.3).

---

## 1. Overview

### 1.1 Purpose

Big buys of cheap Magic cards take too long on the keyboard: hundreds of cards, each typed, picked and added. SCAN lets a staff member stand at the pile with a phone, point its camera at each card, and have the card land in the buy list on the store computer they're paired with, priced the way the computer would have priced it, in the condition and finish the phone is set to. The computer's screen stays free for the rest of the buy. It's for **large buys of many low-end Magic cards**, treated quickly; the keyboard flow is unchanged for everything else.

### 1.2 What SCAN does, in one paragraph

A phone that opens the app's address is sent to a small **landing page** instead of the desktop app. It lists the store computers whose price screen is open (a walk-in buy list, or a project or collection) and the staff member taps the one they're working with: the phone is now **paired** with that computer's open list. The phone's **scanning screen** starts the camera, shows a guide and reads each card's collector line (set code and number, printed on every card since 2014; older cards by name and number) with OCR, on the phone itself. Each card recognised is sent to the paired computer, which looks it up, prices it from **TCGplayer's daily market price** (free, on the Scryfall card itself), asking JustTCG only for a card Scryfall can't price and Cardmarket after that, and adds it to the list with the price the card would get on the stage with Use TCGplayer pressed, where it flashes in. When no price can be found the phone stops and asks for one. Cards are scanned by themselves when the read is sure, with a soft sound each time, never the same card twice in a row; a button scans on demand for a second copy. When the computer leaves its price screen, the pairing ends.

### 1.3 Scope

- **Magic only** (owner, 2026-10-16). The recognition reads Magic's collector line; Pokémon cards aren't recognised and the feature doesn't try.
- **Phones** are the scanners: a touch-first narrow screen opens the landing page by itself, and the same page is at `#/scan` on any device (owner, 2026-10-16), so a laptop's webcam can stand in while testing.
- **English cards**, as the rest of the app's Magic side. A card whose language code isn't `EN` is refused with a message (its English printing isn't what's in hand).
- **Walk-in buys, projects and customer collections** are all targets: whatever the paired computer's price screen is on. Not the Can't upload cards collection (no ADD CARD there), and not a Paid/Ours, Completed or Rejected collection (no edits there either).

### 1.4 Non-goals

- **Pokémon scanning.** Maybe later; Pokémon cards carry a number and a set abbreviation too, but in another place and format.
- **Foil detection.** The camera can't tell; the phone has a Normal / Foil switch (Section 5.3).
- **Condition grading.** The phone's condition control applies to every scan from then on (Section 5.3).
- **Scanning without a computer.** The phone never prices or saves by itself; a paired computer does, so the Changelog, locks, drafts and user picks all work as they do today.
- **Several phones on one list** (owner, 2026-10-16: one phone per computer; pairing a second replaces the first).
- **Image-based recognition** (perceptual hashes, a card-image model). The chosen approach is OCR of printed text (Section 3.1); it's what makes the phone fast and keyless.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **mtgscan** | `github.com/GrimbiXcode/mtgscan`, the open-source browser scanner whose recognition code is reused (Section 3.1). Demo at `mtgscan.weblabor.io`. |
| **Collector line** | The small text at the bottom left of a Magic card. Since the 2014 frame: the number (`0125`, or `125/287` with the set's size) and a rarity letter on one line, the set code and language code (`FDN • EN`) on the next. 1998–2014 cards show only `123/350`; cards before 1998 show nothing (Appendix A). |
| **Tesseract.js** | The OCR engine, in the browser (WebAssembly, Apache-2.0), with the English model, self-hosted under `public/tesseract/`. |
| **Landing page** | What a phone sees first: the list of computers to pair with (`#/scan`). |
| **Scan session** | A computer's presence on a price screen, kept fresh by a heartbeat, which a phone can pair with (`scan_sessions`, Section 9.1). |
| **Pairing** | One phone tied to one computer's scan session. Ends when the computer leaves its price screen, when either side unpairs, or when another phone pairs with that computer. |
| **Scan** | One recognised card sent from the phone to its computer, and what became of it (`scans`, Section 9.2). |
| **Auto scan** | The phone reading cards by itself from the live camera, adding each sure read once (Section 6.3). |
| **Scan card** | The phone's button: read the card in front of the camera now, whatever the last scan was (Section 6.4). |
| **Needs a price** | A scan the computer couldn't price from any source: the phone stops and asks for one (Section 7.3). |
| **Tier** | Which way a card was recognised: by its modern collector line (tier 1), by its name and old-style number (tier 2), or by its name alone with a pick on the phone (tier 3) (Section 6.2). |

---

## 3. Reference material and findings

### 3.1 mtgscan (read 2026-10-16)

Source: <https://github.com/GrimbiXcode/mtgscan>, `main`; demo <https://mtgscan.weblabor.io/>.

- **What it is:** a browser app (Vite, vanilla JavaScript, no server) that photographs a card, finds the collector line anywhere in the photo, reads it with **Tesseract.js**, and looks the printing up on **Scryfall** by set code and collector number. Everything runs on the device; only the parsed `set + number` goes to Scryfall. The README says name-based OCR, fuzzy matching and image recognition were tried and **removed on purpose**: collector numbers are language-independent, exact, and easy for OCR.
- **It's an app, not a library.** `src/main.js` (71 KB) is one `MTGScanner` class holding the UI, camera, OCR worker, Scryfall lookup and local collections. The reusable part is **`src/recognition/`**, four DOM-free modules (Section 10.2 lists them): the text locator, the crop and binarise step, the parser and scorer. The camera and torch code in `main.js` is small and is rewritten here rather than copied (Section 10.2).
- **How recognition works** (`src/recognition/textLocator.js`, `parsing.js`, `pipeline.js`):
  1. The photo is downscaled to 1,000 px wide and greyed. Pixels that are **light on a dark neighbourhood** (local mean ≤ 90, pixel ≥ 40 brighter) are the mask: the collector line is light text on the card's dark bottom border, wherever the card is in the frame.
  2. Mask pixels become characters (4 px to 3% of the image tall), characters become lines, lines become left-aligned **two-line blocks**; blocks are ranked (character count, two lines, height consistency, nearer the bottom), **top 3 kept**.
  3. Each block is cropped from the **full-resolution** photo, scaled so glyphs are ~48 px, binarised (Otsu plus a bias toward text), and read by **one long-lived Tesseract worker** (`createWorker('eng', 1, …)`, default page segmentation, no whitelist). Best block first; reading stops at a convincing score.
  4. The text is cleaned (`|`→`1`, `O`→`0`, `S`→`5`…), the **set code is the token before the language code** (`BLB • DE`), repaired against Scryfall's real set list with up to two character swaps (`B`↔`E`/`8`, `I`↔`1`/`L`, `S`↔`5`, `Z`↔`2`…); the **number** is the longest digit run (1–5 digits, optional letter suffix, optional promo ★), leading zeros dropped; the language code is one of `EN DE FR ES IT PT JP KO RU ZH`.
  5. **Scoring:** set match 50 (in layout) / 45 (repaired) / 40 (any token) / 20 (substring), rarity letter +15, a number +30, a language code +10, length +5; **≥ 80 is HIGH** (stop early), ≥ 40 MEDIUM, else LOW. The top three candidates are tried against Scryfall (`/cards/<set>/<number>?lang=…`) until one hits.
  6. Benchmarked at 22/22 on its own fixtures (hand-held, sleeved, foil, on a table). Its README's known issues: lighting and card condition; **older or damaged cards may not scan reliably**.
- **Camera:** `getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1280 } } })`; a capture is the video's native size on a canvas. **Torch:** shown when `track.getCapabilities().torch` is true, toggled with `applyConstraints({ advanced: [{ torch }] })` (varies by device; iPhones don't offer it to the web). The camera stops when the page is hidden and restarts when it's shown again.
- **The demo** has **Start camera**, **Upload**, then **Scan card**, **Torch** and **Stop**; a guide to align the card to; and after a scan a result sheet with Normal / Foil, a quantity and a correction field. **It has no auto-scan** ("real-time video processing" is on its intentionally-avoided list) and no sound. Those are built here (Section 6.3).
- **Licence (the reason for Section 10):** the repo's **LICENSE file and `package.json` say GPL-3.0**; the README's licence section says MIT. The file wins. Dependencies: `tesseract.js` ^5 and `@tesseract.js-data/eng` ^1 (Apache-2.0).

### 3.2 ManaBox (the owner's reference; its public guides, read 2026-10-16)

ManaBox's scanner auto-detects the card under the camera and adds it. From its guides: **tapping the screen once scans the same card again** (so a second copy is deliberate, never accidental); a **scan sound** is a setting (three sounds by price band); "Quick Mode" picks the first matching printing without asking; a set can be locked. Lighting, a plain contrasting background and no overlapping cards are its tips; sleeves work unless glare hides the border. This spec follows the shape: automatic reads, a sound per card, the same card again only on purpose, and a plain fast path.

### 3.3 The collector line by era (why there are tiers)

Appendix A has the detail. In short: cards printed **from Magic 2015 (July 2014) on** carry the set code and language code at the bottom left, so one OCR read names the exact printing. Cards from **Exodus (1998) to 2014** carry only `number/size` (`123/350`); the set is only in its symbol, a picture. Cards **before 1998** carry no number at all. A bulk pile has all three. mtgscan reads only the first; the second and third need the card's **name**, read from the title bar, and are less reliable (Section 6.2).

### 3.4 What the app already has

Nothing about prices, lines or lists is new. The computer's side reuses:

- `src/lib/prices.js` → `lookupsFor`, `fetchPrices`, `priceResults` (the `prices` Edge Function, up to 200 lookups a call, by `scryfallId`), `conditionPrices`, `fallbackPrice`, `cardmarketPrice`, and `src/lib/ladder.js` → `priceLadder` (spec 8.7); `src/lib/useEurUsd.js` for Cardmarket's dollars.
- `src/lib/buyLine.js` → `buildLine` (a `buy_lines` row from a Scryfall card, finish, condition, quantity, ladder and manual price); `src/lib/cardSearch.js` → `magicCandidate` (a Scryfall card in the shape `buildLine` takes).
- `src/pages/price/useDraft.js` → `add` (`draft_add_line`, merging), and a collection's `useCollection` → `add` (`collection_add_line`, under the lock); `PricingScreen`'s `list.add` is the one door, and its flash.
- `src/pages/collections/useCollectionLock.js`: the heartbeat-and-stale pattern (20 s beats, stale at 60 s, release on `pagehide` with `keepalive`) the scan session copies.
- `src/lib/useLiveTable.js` and the `postgres_changes` channels (`channelName`): how the phone and the computer hear each other (Section 9.4).
- `src/lib/scryfall.js` → `loadSets` (set codes, printed sizes), `loadNames` (every card name, for tier 2/3 name matching), `searchPrints`.
- `src/state/device.jsx`: the phone is a device like a computer, named once ("Name this phone"), with its own `devices` row.

---

## 4. How it works, end to end

```
  Phone (#/scan)                              Supabase                        Store computer (Price tab / collection)
  ──────────────                              ────────                        ───────────────────────────────────────
  sign in (store password, once) ──────────►  Auth                            on a price screen: scan_session_touch
  landing page: scan_sessions_open ◄────────  scan_sessions ◄──── heartbeat ── every 20s (walk-in / collection, games, user)
  tap "Front Counter · Buy list" ──────────►  scan_pair                        chip "📱 Dana's phone · 0 scanned"
  camera on; a card read: set + number ─────► Scryfall /cards/<set>/<number>
  scan_send { scryfall_id, finish, cond } ──► scans (status sent) ── realtime ─► prices it (TCGplayer → JustTCG → Cardmarket)
  "Added $0.45" ◄── realtime ◄─────────────── scans (status added) ◄──────────── list.add → the line flashes in; scan_resolve
  or: "No price: enter one" ◄──────────────── scans (needs_price) ◄───────────── nothing priced it
  type $1 → scan_answer ───────────────────►  scans (sent, manual_price) ─────► added as a manual price
  computer leaves the screen ──────────────►  scan_session_end ──────────────── (cascade: scans go)
  "Front Counter stopped: pick a computer" ◄─ realtime
```

- **The phone recognises; the computer prices and saves.** The line is built and added by the computer's own `PricingScreen`, through the same `list.add` as ADD CARD, so merging, the draft, a collection's lock and version, the user recorded, the flash and the totals all behave exactly as if the card had been added there (owner's wording: "as if they were chosen on the app"). ◆
- **Every message is a row** in two small tables watched over Realtime (Section 9), not a broadcast: the app already talks this way (locks, live tables), a scan can't be lost while the computer's tab is briefly busy, and `scripts/db-test-run.sql` can test every step. ◆

---

## 5. The phone

### 5.1 Getting there

- **Detection** (owner, 2026-10-16): the app opens on the landing page when the device is **touch-first and narrow**: `matchMedia('(pointer: coarse)')` matches and the screen's shorter side is under 900 CSS px (`src/lib/mobile.js`, `isPhone()`, tested with fake values). Any hash route on such a device goes to `#/scan` (a `<Navigate>` in `AuthGate`, before the desktop `Layout`). **`#/scan` opens the same page on any device** (a laptop, for testing), full-width, no header or tabs.
- **The "too small" notice** (`base.css` `.too-small`, spec 7.10) isn't shown on the scan route: `<html data-scan>` turns the rule off. A phone today sees that notice; after S1 it sees the landing page.
- **Sign-in** (owner, 2026-10-16): the ordinary login screen, the store password, once per phone; supabase-js keeps the session as on a computer. `login.css` gets a phone layout (the 380 px panel becomes full-width with 16 px gutters; the logo smaller). Settings' Sign out isn't reachable from the phone; the landing page's footer has **Sign out** instead.
- **"Name this phone":** the device-name modal with the phone's wording (title, text, placeholder "Dana's phone"); it's saved to `devices` like a computer's. The computer's chip and the Changelog's device column show that label.
- **Not for the phone:** the rest of the app. The scan route is the only thing a phone gets; every other route redirects to it.

### 5.2 The landing page

```
  ┌────────────────────────────────────┐
  │  [logo]  PUG Pricing Tool          │
  │  Scan cards into                   │
  │                                    │
  │  ┌──────────────────────────────┐  │
  │  │ Front Counter                │  │
  │  │ Buy list · Dana              │  │
  │  └──────────────────────────────┘  │
  │  ┌──────────────────────────────┐  │
  │  │ Back Office                  │  │
  │  │ Smith collection · Pick user │  │
  │  └──────────────────────────────┘  │
  │  ┌──────────────────────────────┐  │
  │  │ Register 2        (greyed)   │  │
  │  │ Buy list · on Pokémon        │  │
  │  └──────────────────────────────┘  │
  │                                    │
  │  No computer here? Open the Price  │
  │  tab, a project or a collection    │
  │  on it.                            │
  │                        Sign out    │
  └────────────────────────────────────┘
```

- **One big button per open scan session** (`scan_sessions_open`, Section 9.3): the computer's name, then what its screen is on (**Buy list** for the Price tab, the project's or collection's name otherwise) and its picked user, or **Pick user** in amber when none is picked. Fresh sessions only (a heartbeat in the last 60 s). The list updates by itself (Realtime on `scan_sessions`).
- **Every computer on a price screen is listed** (owner, 2026-10-16), but a computer whose screen has **Magic turned off** (the MTG toggle off, only Pokémon on) is **greyed** with "on Pokémon: switch it to Magic first"; tapping it does nothing. A computer on a **Paid/Ours, Completed or Rejected** collection, or on Can't upload cards, or viewing a collection another computer is editing, isn't on a price screen that can take cards: it's listed greyed with the reason ("Paid/Ours: unlock it first", "being edited on Front Counter").
- **A phone already paired** sees its computer at the top, highlighted, with **Continue scanning**.
- **Tapping a button** calls `scan_pair`; the phone goes to the scanning screen. If another phone was paired with that computer, it's replaced: that phone drops back to this page with "Front Counter is now scanning with Alex's phone." (owner, 2026-10-16: one phone per computer).
- **Nothing open:** the explanation above, and the list fills in when a computer opens a price screen.

### 5.3 The scanning screen

```
  ┌────────────────────────────────────┐
  │ → Front Counter · Buy list  [Unpair]│
  │   Dana · 23 scanned                │
  ├────────────────────────────────────┤
  │  NM | LP | MP | HP | DMG           │   condition for the next scans
  │  Normal | Foil                     │   finish for the next scans
  ├────────────────────────────────────┤
  │ ┌──────────────────────────────┐   │
  │ │   ┆        ┆        ┆        │   │
  │ │ ┄┄┼┄┄┄┄┄┄┄┄┼┄┄┄┄┄┄┄┄┼┄┄┄     │   │   the camera, full width, with the
  │ │   ┆  card  ┆  here  ┆        │   │   card-shaped guide and its grid
  │ │ ┄┄┼┄┄┄┄┄┄┄┄┼┄┄┄┄┄┄┄┄┼┄┄┄     │   │
  │ │   ┆        ┆        ┆        │   │
  │ └──────────────────────────────┘   │
  │   [ Scan card ]  [💡 Lighting] [■ Stop] │
  ├────────────────────────────────────┤
  │ ✓ Lightning Bolt (2X2) 117  $0.45 NM│   the last scan and what became of it
  │   Added to Front Counter           │
  └────────────────────────────────────┘
```

- **Header:** the paired computer and its list, the computer's picked user, and **N scanned** this pairing (cards the computer added). **Unpair** goes back to the landing page.
- **Condition control:** NM / LP / MP / HP / DMG, NM by default, big enough for a thumb. **It applies to every scan from then on** (owner, 2026-10-16): sort the pile by condition and flip the control between piles. It never changes cards already added (the computer's SAVE EDIT does that).
- **Finish:** **Normal | Foil** (owner, 2026-10-16), Normal by default, from then on like the condition. *Etched* isn't offered: an etched-only printing is sent as etched automatically (its Scryfall `finishes` has no other), and a printing that exists only in foil is sent as foil whatever the switch says (as the computer's finish switch would lock, spec 8.5).
- **START CAMERA** (the first screen, before the camera runs): asks for camera permission (the browser's prompt), then shows the live camera **full width**, back camera, 1920 × 1280 ideal, with the **guide**: a card-shaped dashed rectangle in the middle with a 3 × 3 grid inside it (the demo's "align the card's edges with the lines"). The card needn't fill the guide for tier 1 (the locator finds the line anywhere), but **tiers 2 and 3 read the title from the guide's top band** (Section 6.2), so staff are told once: "Fill the frame with the card."
- **Scan card:** read the card now (Section 6.4). **Lighting:** the torch, shown only when the camera offers one (Android Chrome mostly). **Stop:** stops the camera and the auto scan; the pairing stays. START CAMERA brings it back.
- **The last scan strip:** the card as the list would print it (`lineText`), its price and condition, and its state: **Reading…**, **Pricing…**, **Added to Front Counter** (✓, green), **Added · ×2** when it merged with a copy, **Needs a price** (amber, with the sheet below), **Not English (DE): add it on the computer**, **Couldn't read this card: set it aside and add it on the computer** (owner, 2026-10-16: message only), **Same card: tap Scan card to add another copy**, **Couldn't add: <the computer's reason>**.
- **The needs-a-price sheet** (Section 7.3) slides up over the strip; auto scan pauses while it's open.
- **Sounds** (owner: "a soft but clear noise when a card scan is taken"): a short two-note chime when a scan is **added** by the computer (so it's the real outcome, not the read); a lower single tone for **needs a price**; a short buzz for **couldn't read** after Scan card. Made with the Web Audio API (no files), created on the START CAMERA tap (phones only allow sound after a touch). A **🔇** in the header mutes them for this phone (`localStorage`). ◆
- **The screen stays awake** while the camera runs (`navigator.wakeLock`, where offered), and **the camera stops when the page is hidden** and comes back when it's shown again, as mtgscan does. ◆
- **Connection:** while offline the strip reads "No connection" and scans aren't sent; the phone keeps the camera and resumes when the connection returns (the `ConnectionProvider` as on a computer).

### 5.4 Pairing ends

- **The computer leaves its price screen** (another tab, Confirm buy's reset doesn't count: the Price tab stays), **closes the tab**, or its session goes stale (no heartbeat for 60 s: a closed laptop): the phone's camera stops and it returns to the landing page with "Front Counter stopped: pick a computer to scan into." A buy confirmed on the computer keeps the pairing: the next buy's cards go into the new draft.
- **The computer's Unpair** (its chip), **the phone's Unpair**, or **another phone pairing** with the computer: the same, with the matching message.
- **A phone that closes** leaves the pairing in place for 10 minutes (its last `phone_seen_at`; the phone beats every 20 s while on the scanning screen), so a locked screen or a switched app comes straight back; after that the computer's chip reads "Phone away" and the next phone to pair replaces it. ◆

---

## 6. Recognition

All on the phone, in `src/scan/` (the UI) and `src/scan/recognition/` (mtgscan's modules and ours, DOM-free, tested where pure). Scryfall is asked only for the final lookup.

### 6.1 Reading a frame

1. **Capture:** the video's full resolution onto a canvas (mtgscan's `captureFromVideo`).
2. **Locate:** `locateCollectorTextBlocks(canvas, { maxCandidates: 3 })` (mtgscan, Section 3.1 step 2): up to three two-line blocks, best first, in a few tens of milliseconds at 1,000 px.
3. **Read:** `generateDetectionVariants` crops and binarises each block; **one Tesseract worker** for the page's life (`createWorker('eng', 1, { workerPath, corePath, langPath })` pointing at `public/tesseract/`, under Vite's base URL) reads them best first, stopping at a **HIGH** score (≥ 80). Tesseract's defaults, as mtgscan found best.
4. **Parse:** `parseCollectorNumber` → `{ setCode, collectorNumber, language }`, the set code repaired against **the app's own set list** (`loadSets`, cached a day; digital sets excluded as the search does), not a second download.
5. **Look up:** `GET /cards/<set>/<number>` on Scryfall (the app's `transport` queue, so it's rate-limited like every other call); a 404 tries the next candidate (three at most). A hit is **a Scryfall card**, the same object the search gives, so `magicCandidate` and `buildLine` take it unchanged.
6. **Language:** the parsed code must be `EN` or absent; anything else is refused (Section 5.3's message). Scryfall is asked with no `lang`, which gives the English printing.

### 6.2 Three tiers (owner, 2026-10-16: "2014+ exact; older by name + number")

| Tier | Cards | What's read | Result |
|---|---|---|---|
| **1** | 2014 on (set code on the card) | The collector line, 6.1 | The exact printing |
| **2** | 1998–2014 (`123/350` only) | The card's **name** from the title band, and `number/size` from the bottom | Scryfall `!"<name>" cn:<number>` among sets whose printed size is `<size>`: almost always one printing; several → the newest, with the others offered on the phone |
| **3** | Before 1998 (no number) | The name only | A **short list on the phone** (set, year, picture) to tap, oldest first; one printing → sent at once |

- **Tier order:** a frame is tried as tier 1 first (the locator finds a two-line block and the parse has a set code). A one-line `d+/d+` block, or no block, goes to tier 2/3 **only on Scan card** in S4 and, once the benchmark allows (Section 11.3), in auto scan too.
- **The name** is read from the **guide's top band** (the top 9% of the guide rectangle, which is the title bar when the card fills the guide), binarised the same way (dark text on a light bar is inverted first), and matched against **every Magic card name** (`loadNames`, 7-day cache, the search's own typo correction `findCorrection` and Fuse) with a strict threshold: the best name must be clearly ahead of the next. A double-faced card's front name is enough. **Name reading is the weak link** (mtgscan removed it on purpose): foil glare, the old serif title font and a dirty card all hurt. The benchmark decides whether tier 2/3 runs unattended (11.3). ◆
- **Tier 2's size** comes from the set's `printed_size` (`loadSets`); sets without one (Scryfall gives none for some) use Scryfall's `card_count`, which `loadSets` starts keeping (`.v4`). The candidate search is one `searchPrints`-style query; the size filter runs on the phone.
- **Tier 3's list** shows at most 8 printings (set name, year, the small picture): staff pick the set from the card's symbol. **Skip** sends nothing.
- **What's sent** is the same whatever the tier: a Scryfall card id, the finish and condition from the controls, quantity 1, and the tier for the record (`scans.tier`).

### 6.3 Auto scan

- Runs while the camera is on and no sheet is open: after each attempt (and 300 ms of rest), grab a frame, locate; **no block → drop the frame** (cheap, keeps the phone cool); a block → read and parse. A **HIGH** read with a Scryfall hit is a scan; MEDIUM or LOW reads are **dropped silently** (nothing flashes, nothing beeps): the next frame will be better. About one card a second on a recent phone when a card is in view.
- **Never the same card twice in a row** (owner, 2026-10-16): the key is **the printing and finish** (`scryfall_id + finish`); the same key as the last scan sent is ignored, and the strip reads "Same card: tap Scan card to add another copy" (muted, no sound) for as long as it stays in view. A different card, or the same card after another, scans as normal. This is what makes auto scan safe to leave running while a card sits under the camera.
- **A sent scan waits for its outcome** before the next frame is read (the computer answers in a second or two), so the sounds and the strip stay in step with the list. Reads continue meanwhile only to show "Same card".
- **Pauses:** the needs-a-price sheet, the tier 3 pick list, the phone offline, the page hidden, **Stop**.

### 6.4 Scan card (manual)

- Reads the frame in front of the camera now, **ignoring the same-card rule**: a second copy of the card just scanned is added (the list merges it: "Added · ×2").
- Tries all three candidates and accepts a **MEDIUM** read that finds a Scryfall card (a manual scan means a person is watching the strip). Nothing found: "Couldn't read this card: set it aside and add it on the computer." with the buzz (owner, 2026-10-16: message only; no name search or typing on the phone).
- In S4, a tier 2/3 read runs here first, before it runs by itself.

---

## 7. Pricing a scan (on the computer)

### 7.1 The rule

**A scanned card is priced from TCGplayer's daily market price first, and JustTCG is asked only for a card Scryfall can't price** (owner, 2026-10-16: "make the TCGplayer daily scryfall fallback price the main source and only ping JustTCG when scryfall doesn't have a price… TCGplayer > JustTCG > Cardmarket > manual"). The TCGplayer price comes **free with the Scryfall card** the computer fetches for the lookup anyway (`prices.usd` / `usd_foil` / `usd_etched`, refreshed by Scryfall once a day), so a scan costs **no JustTCG request** unless Scryfall has nothing. A big pile of cheap cards then spends none of the daily allowance; nothing has to be batched; and when JustTCG is asked, it's one card at a time, as the stage does. In order:

1. **TCGplayer**: the Scryfall price for the finish, run through the ladder **as if Use TCGplayer had been pressed** (`priceLadder({}, fallback, pct)`: NM = the price × the NM percentage, the other conditions × theirs, the never-rise and step-down rules as always). `price_source = 'scryfall_fallback'`, `price_snapshot.override = 'fallback'`, so SAVE EDIT shows Use TCGplayer on, and REPRICE? and the export's Sell Price work the line out from today's TCGplayer price, as they do for any Use TCGplayer line. (The export's `ladderFor` honours that override only when JustTCG has prices to replace; for a card JustTCG never prices it falls through to the same Scryfall fallback, so the result is the same either way.)
2. **JustTCG**, only when Scryfall has no price for that finish: one `fetchPrices` lookup for the card (cached by the page and by the server for 6 hours), then the ordinary ladder: JustTCG's price for the condition (`justtcg`), else JustTCG's NM × the percentage (`justtcg_fallback`). `price_snapshot.override = null`.
3. **Cardmarket**, only when steps 1–2 give the condition nothing: Cardmarket's euro price (`prices.eur` on the same Scryfall card) × the day's rate × the percentage, as if **Use Cardmarket** had been pressed (`price_source = 'cardmarket'`, `price_snapshot.override = 'cardmarket'`).
4. **Nothing:** the scan becomes **needs a price** (7.3).

One pure function, `scanQuote({ card, finish, condition, results, pct, cardmarketUsd })` in `src/lib/scanPrice.js`, returns the ladder, the override used, the entry for the condition, and **whether JustTCG is needed** (`results` is passed as `null` on the first call; a `needsJustTcg` answer makes the receiver fetch and call again). Tested for each step, for the finish that TCGplayer doesn't price while JustTCG does, and for "nothing". Built from `priceLadder`, `fallbackPrice` and `cardmarketPrice`; nothing new in the arithmetic.

**What this means at the counter:** a scanned card's price is the TCGplayer price the stage shows with **Use TCGplayer** on (the condition buttons tagged "TCGplayer"), not JustTCG's condition prices. That's the trade the owner chose for bulk: free and unlimited over per-condition market data. The computer's operator can still open any line with SAVE EDIT and switch it to JustTCG's prices.

### 7.2 No price warnings

The app's ⚠️ checks (spec 8.7) **aren't run on scans** (owner, 2026-10-16). Three of the four compare JustTCG's prices with something else, and a TCGplayer-priced scan never fetches JustTCG's, so only the Cardmarket-gap check could have run; not worth building for. A scanned line carries no `warnings`, and the buy list shows none. The stage still shows ⚠️ as before when a scanned line is opened with SAVE EDIT, since that fetches JustTCG's prices as any selection does.

### 7.3 Needs a price

- The computer marks the scan `needs_price`; the phone shows the sheet: the card (name, set, number, the small picture), "No price found on TCGplayer, JustTCG or Cardmarket.", a **$ field** (two decimals, ≥ 0.01), **Add at this price** and **Skip** (the card is set aside; nothing is added; status `skipped`). Auto scan pauses meanwhile.
- **Add at this price** calls `scan_answer` with the price; the computer adds the line as a **manual price** (`price_source = 'manual'`, `market_price` null), exactly as ✎ Manual price would.
- The sheet can't be dismissed by scanning past it: answer or skip.

### 7.4 Quantity, merging, the user

- Every scan is **quantity 1**. The list's merge rule (`internal.same_card`) folds identical copies into one line; the computer's answer carries the line id, and the phone shows "×N" from the list's quantity.
- **The user recorded** is the computer's picked user, as for ADD CARD. **A computer with no user picked can't take scans**: its session says so (the landing page shows "Pick user"; a paired phone's strip reads "Pick a user on Front Counter first" and auto scan waits). **An incoming scan counts as activity** on the computer (`useStaff().touch()`, a new one-line export that resets the idle clock), so a computer that only receives scans for half an hour doesn't forget its user mid-pile (decision 231 would otherwise log the user out under the scanner). ◆
- **Rates** (Set Rate, custom rates, low-end / high-end) apply to the line as to any added card; nothing on the phone sets them.

---

## 8. The computer's side

### 8.1 The scan session

- `PricingScreen` (the Price tab and a collection's screen) starts a **scan session** when it mounts, and keeps it fresh: `scan_session_touch` every 20 s and whenever what it says changes (the games toggles, the picked user, the collection's status or lock, the target's name), `scan_session_end` on unmount and on `pagehide` (`keepalive`, as `lock_release`). It says: which device, what the list is (`walk_in` or a `buy_id` and its name), which games are on, the picked user, and **whether cards can be added right now** (`can_add`: a user picked, online, not read-only; the reason when not).
- **Hidden tabs' timers slow down**; a session that misses a beat for 60 s reads stale and the phone drops out. A tab coming back to the front touches at once (as the lock does).
- **The Price tab after CONFIRM BUY** keeps its session (the screen stays); the user is forgotten by the confirm, so the phone reads "Pick a user on Front Counter first" until one is picked.

### 8.2 The chip (owner, 2026-10-16: "a chip in the buy list, lines flash in")

- In the list's heading, right of the count: **📱 Dana's phone · 23 scanned** with an **Unpair** (×) button, while a phone is paired; **📱 Phone away** (muted) when its last beat is over a minute old; nothing when no phone is paired. Hovering it: "Scanning from Dana's phone since 2:14 PM".
- **Only on Magic:** when the MTG toggle is off the chip hides and the session says `games` without `mtg`; the phone shows the computer greyed.
- **A scanned line flashes** exactly as an ADD CARD line does (`flashId`, 1.6 s) and scrolls into view. The stage is left alone (owner, 2026-10-16): the operator can keep searching and adding by hand at the same time. A card added by hand and a scan of the same card merge like any two adds.
- **Unpair** ends the pairing (the phone goes back to its landing page) and leaves the session open for the next phone.

### 8.3 Receiving scans

- `useScanReceiver(session, list, quote)` in `src/pages/price/`: subscribes to `scans` for this device's session (`INSERT`, and `UPDATE` for answered prices), keeps a **queue** in arrival order, and drains it **one scan at a time**: fetch the Scryfall card by id (`/cards/:id`, 7-day cache as other card data; its TCGplayer and Cardmarket prices come with it), `scanQuote`; **only if it answers `needsJustTcg`**, one `fetchPrices` lookup (`lookupsFor`; the page's `priceResults` and the server's 6-hour cache make repeats free) and `scanQuote` again; then `buildLine` (with `price_snapshot.scan = { phone, tier, at }`), `list.add`, and `scan_resolve` with the outcome. No batching is needed (owner, 2026-10-16): most scans never reach JustTCG.
- **Failures** are answered, never dropped: `list.add` refused (`stale_version`, the lock lost, `no_user`…) → `failed` with the app's own message, shown on the phone's strip and as the computer's usual toast; Scryfall unreachable → `failed` with "Card lookup unavailable on Front Counter: <reason>", and the phone's auto scan pauses until the next scan succeeds.
- **The JustTCG daily limit** (`PriceLimitProvider`) or no key: a card that needs JustTCG goes on to Cardmarket, then needs a price; TCGplayer-priced scans aren't affected at all.
- **Scans that arrive while the queue is busy** are answered in order; the phone waits for each outcome anyway (6.3).

### 8.4 Leaving

Navigating away from the price screen, closing the tab, Unpair, or the session going stale: the phone drops out (5.4). The queue is abandoned: a scan not yet added is answered `failed` ("Front Counter left its price screen") if the computer is still there to answer; otherwise the phone sees the session vanish and says so.

---

## 9. Data model and functions

New migrations, next free numbers (Section 0, item 4), written as `SQUASH.md` Section 11 says. Both tables are **transient**: not in backups (`backup_export` leaves them out; `src/lib/backup.js` TABLES unchanged), swept when old, deleted with their devices.

### 9.1 `scan_sessions`: a computer's price screen, open for pairing (Phase S1)

| Column | Type | Notes |
|---|---|---|
| device_id | uuid PK → devices on delete cascade | The computer. One session per computer |
| target_kind | text | `walk_in` or `collection` |
| buy_id | uuid null → buys on delete cascade | The collection or project; null for the Price tab (its draft is found by `draft_device_id`) |
| target_name | text | What the phone shows: `Buy list`, or the collection's name |
| games | text[] | The screen's games toggles that are on (`{mtg}`, `{mtg,pokemon}`, `{pokemon}`) |
| staff_user_id | uuid null → staff_users | The computer's picked user |
| can_add | boolean | Cards can be added there now |
| blocked_reason | text null | Why not, in the app's words (`Pick user`, `Paid/Ours: unlock it first`, `being edited on Front Counter`…) |
| heartbeat_at | timestamptz | Fresh within 60 s |
| phone_device_id | uuid null → devices on delete set null | The paired phone |
| paired_at | timestamptz null | When it paired |
| phone_seen_at | timestamptz null | The phone's last beat (5.4: away after 60 s, replaceable after 10 min) |
| scanned | integer default 0 | Cards added this pairing (reset at pairing) |

### 9.2 `scans`: one card sent, and what became of it (Phase S2)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_device_id | uuid → scan_sessions on delete cascade | The computer |
| phone_device_id | uuid → devices | The phone that sent it |
| scryfall_id | text | The printing |
| name, set_code, collector_number | text | For the strip and the record (the computer fetches the card itself) |
| finish | text | `nonfoil` \| `foil` \| `etched` |
| condition | text | `NM`…`DMG` |
| tier | smallint | 1, 2 or 3 (Section 6.2) |
| manual_price | numeric(10,2) null | The phone's answer to needs a price |
| status | text | `sent` → `added` \| `needs_price` \| `failed` \| `skipped`; `needs_price` → `sent` (with a manual price) \| `skipped` |
| line_id | uuid null | The list line it became (or merged into) |
| price, price_source | numeric null, text null | What it was added at |
| note | text null | The computer's reason when `failed` |
| created_at, handled_at | timestamptz | |

Indexes: `(session_device_id, created_at)`, `(phone_device_id, created_at)`. A session's scans go with it (cascade); `scan_session_touch` also deletes scans older than 7 days and sessions with no heartbeat for a day.

### 9.3 Functions

All `security invoker`, granted to `authenticated` only, refusals as short codes (`DESIGN_SPEC.md` 6.2), each in `scripts/db-test-run.sql`.

| Function | Phase | Does | Refuses |
|---|---|---|---|
| `scan_session_touch(p_device, p_kind, p_buy_id, p_name, p_games, p_user, p_can_add, p_reason)` | S1 | Upserts the computer's session and its heartbeat; returns the row (the paired phone's label, `scanned`, `phone_seen_at`). Sweeps old rows | `no_device` |
| `scan_session_end(p_device)` | S1 | Deletes the session (its scans go with it) | — |
| `scan_sessions_open()` | S1 | The fresh sessions with their devices' labels, users' names and phones' labels, for the landing page | — |
| `scan_pair(p_device, p_phone)` | S1 | Pairs the phone (replacing any other), resets `scanned`, stamps `paired_at` / `phone_seen_at` | `session_gone`, `session_stale`, `not_a_device` |
| `scan_phone_beat(p_device, p_phone)` | S1 | The phone's heartbeat; returns false if it's no longer the paired phone | — |
| `scan_unpair(p_device, p_phone)` | S1 | Clears the pairing when `p_phone` is the paired phone, or any pairing when `p_phone` is null (the computer's Unpair) | `session_gone` |
| `scan_send(p_device, p_phone, p_scan jsonb)` | S2 | Inserts a `sent` scan for the paired phone; returns its id | `not_paired`, `session_stale`, `cannot_add` (with the session's reason), `bad_scan` |
| `scan_resolve(p_id, p_device, p_status, p_line_id, p_price, p_source, p_note)` | S2 | The computer's outcome (`added` bumps `scanned`) | `scan_gone`, `not_session`, `bad_status` |
| `scan_answer(p_id, p_phone, p_price)` | S2 | The phone's manual price (status back to `sent`), or `skipped` when null | `scan_gone`, `not_phone`, `not_waiting`, `bad_price` |

**RLS:** the store's role may `select` both tables and `insert` / `update` / `delete` them (the `"store: all"` pattern of `0002_rls.sql`): the functions are invokers, as the app's are. **Realtime:** both tables join the `supabase_realtime` publication (as `0035` did for `events`).

### 9.4 Who listens to what

| Who | Channel | For |
|---|---|---|
| The landing page | `scan_sessions`, all rows | The list of computers |
| The phone, paired | `scan_sessions` where `device_id = <computer>` | Unpaired, replaced, the computer gone, `can_add` changing |
| The phone, paired | `scans` where `phone_device_id = <phone>` | Each scan's outcome |
| The computer | `scan_sessions` where `device_id = <self>` | A phone pairing or leaving (the chip) |
| The computer | `scans` where `session_device_id = <self>` | Scans to price and add; manual prices answered |

Channel names through `channelName` (one per mount). Filters are Supabase's `column=eq.value`.

---

## 10. Licence and dependencies

### 10.1 GPL-3.0 (owner, 2026-10-16: "copy its recognition code, go GPL-3.0")

mtgscan's `LICENSE` is the GNU General Public License v3.0. Copying its code into this public repo means the PUG Pricing Tool is distributed under the GPL-3.0 too. Phase S2 does all of this **in the same commit as the first copied file**:

- `LICENSE` at the repo root: the GPL-3.0 text, verbatim.
- `package.json`: `"license": "GPL-3.0-only"`.
- `README.md`: one line under the title, "Licensed under the GPL-3.0 (see LICENSE). The card recognition comes from GrimbiXcode/mtgscan, GPL-3.0."
- **Each copied file** keeps mtgscan's header and gains one of ours: `Copied from https://github.com/GrimbiXcode/mtgscan (src/recognition/<file>.js, commit <sha>, GPL-3.0) on 2026-MM-DD; changed: <what, or "nothing">`. Changes are kept small and listed, so a later version of mtgscan can be compared.
- `docs/DESIGN_SPEC.md` 4.7's "Repository" line notes the licence.
- The Settings footer's credits line (spec 11.7) adds "Card scanning: mtgscan (GPL-3.0) and Tesseract.js".

### 10.2 What's copied, what's ours

| From mtgscan (`src/recognition/`, copied under `src/scan/recognition/`) | Ours |
|---|---|
| `textLocator.js` (the light-on-dark locator, crop, binarise; 13.6 KB) | `camera.js`: `getUserMedia`, capture, torch, stop, visibility (written fresh from mtgscan's description, Section 3.1) |
| `parsing.js` (clean, parse, repair, score, languages; 8.5 KB) | `ocr.js`: the Tesseract worker (self-hosted paths), `readBlocks`, the HIGH / MEDIUM tiers |
| `pipeline.js` (candidates → crops; 2 KB) | `tiers.js`: tier 1 lookup; S4's tier 2/3 title reading and name matching |
| `canvasUtil.js` (0.6 KB) | `autoScan.js`: the loop, the same-card rule, pauses |
| | `sounds.js`, the UI under `src/scan/` (`ScanPage.jsx`, `LandingPage.jsx`, `Scanner.jsx`, `NeedsPriceSheet.jsx`, `PickPrintingSheet.jsx`), `src/styles/scan.css` |

The copied modules are **not changed** except: the set list comes from `loadSets` (passed in, not fetched), and `parsing.js`'s global `S`→`5` / `O`→`0` cleaning is applied **after** the set-code token is taken (the README notes it breaks set codes with those letters, e.g. `SOS` → `505`); that change is listed in the header.

### 10.3 New dependencies (ask-first rule, satisfied by this spec)

| Package | Why | Where |
|---|---|---|
| `tesseract.js` ^5 (Apache-2.0) | OCR | A dynamic `import()` on the scan route only; Vite splits it out, so the desktop bundle doesn't grow |
| `@tesseract.js-data/eng` ^1 | The English model | Copied by a small script (`scripts/tesseract-assets.mjs`, run by `postinstall`) with the worker and core files into `public/tesseract/`, so the live site serves them itself (no CDN; the first scan on a phone downloads ~4 MB once, then the browser caches it) |
| `@vitejs/plugin-basic-ssl` (dev only) | HTTPS on the LAN for phone testing (Section 11.1) | `vite.config.js`, only under `npm run dev:lan` |

### 10.4 Size and speed

The locator runs in ~50–150 ms on a phone; one Tesseract read ~0.3–1 s; the Scryfall lookup ~200 ms. A sure card is in the list about two seconds after it's under the camera. The scan route's own code is ~100 KB plus Tesseract's ~2 MB worker and core and ~2 MB model, fetched once.

---

## 11. Testing on a phone (owner, 2026-10-16: "HTTPS dev server on the LAN")

### 11.1 The dev server over HTTPS

A phone's camera works only on HTTPS (or `localhost`). `npm run dev:lan` (new script: `vite --host --port 5180 --strictPort --mode lan`) turns the basic-ssl plugin on (self-signed certificate) and listens on the laptop's LAN address. The phone, on the shop's Wi-Fi, opens `https://<laptop's address>:5180/#/scan` and **accepts the certificate once** (Chrome: Advanced → Proceed; Safari: Show details → visit). `start.bat` is unchanged (plain `localhost`); `docs/SETUP.md` gains the recipe, including finding the laptop's address (`ipconfig`) and that the dev server uses **dev's** database, so test scans land in dev's buys. Supabase accepts any origin, so nothing is configured there.

### 11.2 On a laptop

`#/scan` on `localhost:5180` opens the landing page in the desktop browser; **START CAMERA** uses the webcam. Holding a card up to a laptop camera works for tier 1 in good light, which is enough to try the pairing, the sheet and the chip without a phone. (`localhost` is a secure context, so no HTTPS is needed there.)

### 11.3 The recognition benchmark (the engineer's one test)

- **Fixtures:** photos the owner takes with the shop's phone, in the shop's light, of real cards: 15 modern (tier 1, including a foil, a sleeved card, a card at an angle), 10 old-numbered (tier 2) and 5 pre-1998 (tier 3), named with their truth like mtgscan's (`FDN-125-nonfoil.jpg`, `TMP-Ancestral-Memories-no-number.jpg`). They live in **`scan-fixtures/` at the project root, git-ignored** (card photos aren't secret, but 30 photos don't belong in the repo).
- **`scripts/scan-benchmark.mjs`** runs the locator, OCR and parser on each (Node, `canvas` as a dev dependency like mtgscan's `sandbox/benchmark.js`) and prints per-tier hit rates and timings. **S2 ships when tier 1 reads ≥ 90% of its fixtures HIGH; S4's auto-scan for tiers 2/3 turns on only when they read ≥ 80%** of theirs; below that they stay behind Scan card. The figures go in Appendix C.

### 11.4 Where to look, generally

Every phase's list in Section 15 says which screen on which device. The owner needs: a phone on the shop Wi-Fi, a laptop running `npm run dev:lan`, and a few cards of each era.

---

## 12. Changelog, Help, Settings

- **Changelog:** a walk-in draft isn't logged (spec 8.10); a collection's scans are logged by `collection_add_line` as **Cards added**, on the computer's user and device, as adds from the keyboard are, and (owner, 2026-10-16: "sure") each scanned card's line there ends "· 📱 scanned on <the phone's name>": `useCollection.add` adds it to the text it already passes (`p_text`) when the line's snapshot carries the phone's stamp; no database change.
- **Help:** the README gains a **Scanning from a phone** section (pairing, the controls, the tiers, "fill the frame", sounds, what to do with a card that can't be read), which Help renders as it does the rest (`src/lib/help.js`). Written in S5, as the owner's rule is one Help update per feature.
- **Settings:** nothing new. ◆ (Possible later: the phone's name, like the computer's, under Settings → This computer; today the phone is renamed by clearing its site data.)

---

## 13. Edge cases

- **Two tabs on the computer** on price screens: one session per device; the second tab's `scan_session_touch` overwrites the first's target. Rare and harmless: the chip shows on both, scans go to whichever tab's receiver answers first, and `list.add` on a stale draft reloads (spec 8.12). The spec accepts this rather than a session per tab.
- **The computer's list changes target** (opens another collection): the session is touched with the new target; the phone's header updates; scans in flight for the old one are answered `failed` by the unmount.
- **A collection locked elsewhere** while paired: `can_add` false with "being edited on Front Counter"; scans are refused by `scan_send` (`cannot_add`) and the phone's strip says why; the pairing stays.
- **The same card in both finishes:** different keys for the same-card rule (a foil after its non-foil scans).
- **A foil-only printing with the switch on Normal:** sent as foil (5.3); the strip shows `*F*` so staff see it.
- **A promo-star number** (`123★`): parsed by mtgscan; Scryfall's number is `123★`, and the lookup uses it as is.
- **Letters in the set code read wrong:** the repair against the set list fixes one or two characters; a wrong set that still exists is caught by the Scryfall 404 and the next candidate. A wrong set that exists **and** has that number is the known failure mode of every collector-line scanner: it would add a different printing. Mitigation: the strip always shows set and number, and the computer's line can be edited. Not solvable on the phone.
- **The phone's clock, time zone:** irrelevant; every stamp is the database's.
- **A phone with no camera permission:** START CAMERA's error explains how to allow it in the browser's site settings; **Upload a photo** isn't offered (not a counter workflow).
- **iPhones:** no torch for web pages (the Lighting button hides); everything else works in Safari 15+. The wake lock needs iOS 16.4+.
- **Battery:** the loop rests 300 ms between attempts and skips frames with no block; Stop ends it. Expect a warm phone after a few hundred cards.

---

## 14. What stays the same

- ADD CARD, the stage, the buy list, drafts, confirm, collections, locks, versions, merging, rates, the Changelog, exports, backups, the header search: unchanged. A scanned line is an ordinary line (`price_snapshot.scan` is the only mark).
- The desktop app on a laptop or desktop: unchanged; `#/scan` is the only new route, and the phone redirect only fires on touch-first narrow screens.
- The JustTCG budget rules (spec 5.3): the few scans that need JustTCG use the same `prices` function, cache and limit handling; the rest never touch it (7.1).

---

## 15. Build phases

Each phase ends with the owner checking it: the computer's side on `localhost`, the phone's on the LAN server (11.1) or `#/scan` on the laptop (11.2). Apply migrations to **dev** only.

### Phase S1: The phone finds the computer

**Build**
- Migration S-1: `scan_sessions` (9.1), `scan_session_touch`, `scan_session_end`, `scan_sessions_open`, `scan_pair`, `scan_phone_beat`, `scan_unpair`; RLS; the publication. Database test run: a section `scan sessions` (touch, stale, pair, replace, unpair, end; each refusal).
- `src/lib/mobile.js` (`isPhone`, tested), the `#/scan` route outside `Layout`, the redirect, `<html data-scan>` and the `.too-small` exception, `src/styles/scan.css` (phone-first, 16 px gutters, 44 px targets), the login page's phone layout, "Name this phone".
- The landing page (5.2): the list, greyed rows with reasons, Continue scanning, Sign out, live updates.
- The computer's session in `PricingScreen` (8.1), `can_add` and its reasons, the chip with Unpair (8.2, "0 scanned" for now), the phone's heartbeat and the drop-out messages (5.4).
- A placeholder scanning screen: the header, the controls (condition, finish), Unpair; no camera yet.
- `npm run dev:lan`, the basic-ssl plugin, `docs/SETUP.md`'s recipe.

**Owner tasks**
- Run `npm run dev:lan`, open the address on the phone, accept the certificate, sign in, name the phone.

**Where to look**
- [ ] On the phone, the app opens on the landing page (no header, no tabs); on the laptop, `#/scan` opens the same page and `#/price` still opens the desktop app.
- [ ] With the Price tab open on the laptop, the phone lists it as **<laptop's name> · Buy list · <user>**; close the tab and the row goes within a minute; open a project and the row reads the project's name.
- [ ] Turn the laptop's MTG toggle off: the row greys with "on Pokémon"; on again, it's live.
- [ ] Tap it: the scanning screen with the controls; the laptop's Buy list heading shows **📱 <phone's name> · 0 scanned** with ×.
- [ ] × on the laptop sends the phone back to the landing page with the message; pairing again works; navigating the laptop to Calendar does the same.
- [ ] A second phone (or the laptop's `#/scan` in another browser) pairing with the same computer replaces the first, which says so.
- [ ] `node scripts/db-test-run.mjs` passes with the new section.

### Phase S2: Scanning modern cards, one tap at a time

**Build**
- **The licence first** (10.1): `LICENSE`, `package.json`, README line, then the copied modules with their headers (10.2). `tesseract.js`, the assets script, `public/tesseract/`.
- `camera.js`, `ocr.js`, `tiers.js` (tier 1), the scanning screen's camera, guide, Scan card, Lighting, Stop, the strip, the sounds (5.3), the wake lock and visibility handling.
- Migration S-2: `scans` (9.2), `scan_send`, `scan_resolve`, `scan_answer`; the publication; database test run section `scans` (send while paired / not paired / cannot add; resolve by the session only; answer by the phone only; needs_price → sent with a price; skipped).
- The computer's receiver (8.3): the queue, `scanQuote` (7.1, with tests), `buildLine` with the scan mark, `list.add`, the flash, `scan_resolve`; `useStaff().touch()` (7.4); the chip's count.
- The needs-a-price sheet (7.3).
- `scripts/scan-benchmark.mjs` and the `scan-fixtures/` convention (11.3); run on the owner's tier 1 photos before hand-off.

**Owner tasks**
- Photograph the tier 1 fixtures (11.3) and put them in `scan-fixtures/`.

**Where to look**
- [ ] START CAMERA asks for permission, then shows the camera with the guide; Lighting shows only if the phone has a torch; Stop stops it.
- [ ] Hold a modern card under the camera and tap **Scan card**: the strip reads the card, then **Added to <laptop>** with its price and NM; the laptop's list shows the line flashing, at the price the stage gives that card with **Use TCGplayer** on. Click the line: SAVE EDIT opens it with Use TCGplayer on. Settings → API Keys' JustTCG usage hasn't moved.
- [ ] A card Scryfall has no price for (a very new set on release day, or a rare old printing) but JustTCG does: it's added at JustTCG's price, and the usage count moves by one.
- [ ] Set LP and Foil, scan a card: the line is `[LP]` and `*F*`. A card with no foil printing scans as non-foil anyway.
- [ ] Scan the same card again: the line's quantity becomes 2, the strip reads "Added · ×2".
- [ ] Scan a card JustTCG and Scryfall have no price for (an obscure promo): the sheet asks for a price; type one, the line is added as a manual price (✎ on the laptop); Skip adds nothing.
- [ ] A German or Japanese-printed card: "Not English".
- [ ] Hold up a Pokémon card, or the card's back, and tap Scan card: "Couldn't read this card" with the buzz.
- [ ] Sign the user out on the laptop: the phone says to pick a user; pick one and scanning resumes.
- [ ] `npm test` includes the scan price tests; `node scripts/scan-benchmark.mjs` prints tier 1 at ≥ 90% HIGH on the fixtures.

### Phase S3: Scanning by itself

**Build**
- `autoScan.js` (6.3): the loop, frame skipping, HIGH-only, the same-card rule and its strip message, waiting for each outcome, every pause.
- Sounds in the auto flow; the mute.
- The phone's "away" and "replaceable" states (5.4); `phone_seen_at` on the chip.

**Where to look**
- [ ] With the camera on, lay modern cards under it one after another: each is added with the chime, about one a second; nothing is typed or tapped.
- [ ] Leave one card under the camera: it's added once; the strip reads "Same card: tap Scan card to add another copy" and nothing repeats. Tap Scan card: ×2.
- [ ] A card with no price stops the flow with the sheet; answer it; the flow resumes.
- [ ] Lock the phone for a minute and unlock: the camera comes back, still paired. Leave it locked for 11 minutes: the laptop's chip reads "Phone away", and another phone can pair.
- [ ] Switch the laptop's tab away and back: a scan sent meanwhile is added when the tab is back (within a few seconds).

### Phase S4: Older cards

**Build**
- Tier 2 and tier 3 in `tiers.js` (6.2): the title band read, name matching against `loadNames` with the strict threshold, the `number/size` parse, the size filter (`loadSets` `.v4` with `card_count`), the pick list sheet.
- Scan card runs tiers 2/3 after tier 1 fails; auto scan runs them only when the benchmark allows (11.3), behind a constant with the figure in its comment.
- Benchmark on the tier 2/3 fixtures; the figures into Appendix C.

**Owner tasks**
- Photograph the tier 2 and 3 fixtures.

**Where to look**
- [ ] A 2005 card (`123/350` at the bottom) under the camera, filling the frame, Scan card: the exact printing is added (check the set on the laptop's line).
- [ ] A 1996 card (no number): the phone shows its printings by set and year; tap one; it's added. Skip adds nothing.
- [ ] A worn old card the phone can't name: "Couldn't read this card", not a wrong card.
- [ ] If the benchmark allowed it: old cards scan by themselves too; if not, only Scan card reads them and the Help text says so.

### Phase S5: Finishing

**Build**
- **Undo last scan** on the phone's strip (removes one copy of the last added line through `list.remove`, via a `scans` status `undo` the computer honours; the strip reads "Removed"). ◆
- README's **Scanning from a phone** section (Help); Settings' credits line; `docs/DESIGN_SPEC.md`: 7.10's phone paragraph, 8.9's chip, the decisions in Appendix C, the pointer to this document; `docs/TEST.md`'s "For the next smoke test" checks for scanning; `CLAUDE.md`'s status line.
- A full database test run, lint, tests, build; the version bump the owner names.

**Where to look**
- [ ] Scan a card, tap Undo: the line's quantity drops by one (or the line goes) on the laptop; the strip says so.
- [ ] Help has the scanning page; its pictures of the controls match the phone.
- [ ] Every "Where to look" above still holds after the finishing changes.

---

## 16. As built (2026-10-16)

Phases S1–S5 were built in one unattended run, at the owner's request, for the owner to check all
together. Where the build differs from Sections 1–15, this section wins.

**Migrations (on dev):** `0068_scan_sessions.sql` (S1), `0069_scans.sql` (S2), `0070_scan_undo.sql`
(S5). `SQUASH.md` is renumbered: N is 0070, the baseline `0071_baseline.sql`, the Changelog lock 0072.
Database test run: **461 checks**, all passing (sections Scan sessions and Scans).

**Data and functions (11):**
- `scan_sessions` has `locked` (the screen's reason, "Paid/Ours: unlock it to edit") instead of
  `blocked_reason`, and `can_add` is a generated column: a user picked, `locked` null, and `mtg` in
  `games`. `scan_session_touch(p_device, p_kind, p_buy_id, p_name, p_games, p_user, p_locked)`.
  A session touched after going stale loses its phone. `scan_pair` also refuses `cannot_scan` (Magic
  off, or locked).
- `scans.status`: `sent` → **`pricing`** (the computer's claim, `scan_claim`, so two tabs of one
  computer can't both add it; a claim quiet for a minute can be taken again) → `added` /
  `needs_price` / `failed`; `needs_price` → `sent` (a price) or `skipped`; **`added` → `undo` →
  `undoing` → `undone`** (or back to `added` with a note). `line_qty` holds the line's quantity just
  after, for "×2". Old scans are swept by `scan_send` (a week), not by `scan_session_touch`.
- Functions: `scan_sessions_open`, `scan_session_touch`, `scan_session_end`, `scan_pair`,
  `scan_phone_beat`, `scan_unpair`, `scan_send`, `scan_claim`, `scan_resolve`, `scan_answer`,
  `scan_undo`.

**Pairing (5.4):** a pairing doesn't time out. The chip reads "away" after a minute without the
phone's beat; any phone pairing replaces the paired one at any time (no 10-minute rule).

**The computer (8):** the chip sits on its own line under the list's heading (the heading row has no
room beside the count). The receiver (`src/pages/price/useScanReceiver.js`) handles one scan at a
time; a card by id is kept 6 hours in memory (not 7 days in storage); no batching, since most scans
never reach JustTCG. Scanned lines carry `price_snapshot.scan` (`{ from: 'phone', phone, tier,
scan_id, at }`). Price warnings: none (decision S5).

**Recognition (6):**
- `parsing.js` is copied **unchanged**: as mtgscan does, each reading is scored raw and cleaned and the
  better kept, so its `S`→`5` cleaning never costs a set code (10.2's planned change wasn't needed).
  The set-code pattern comes from the app's set list (paper sets, longest codes first).
- A card printed `JP` whose printing is Japanese-only (Mystical Archive's Japanese art) is accepted;
  any other language is refused.
- **Auto scan (6.3)** doesn't read at all while the last scan is still with the computer; "same card"
  is a hint line under the strip, so it never hides the "✓ Added" it follows. Set + number lookups
  are remembered, so a card in view asks Scryfall once.
- **Older cards (6.2):** the title is read as one line, then as a block if that names nothing, with
  the title box's ruled lines removed first; the matcher may drop words at the title's end (a mana cost
  misread as letters) and refuses a read much shorter than the name it matches. The "123/350" is looked
  for in what the collector-line reading already read (on a black border the copyright line is light
  text the locator finds), then in a bottom band. With a number: the printings of that name, number
  and set size (several: the pick list). **Without one, the pick list holds every printing**, narrowed
  to the copyright line's year when that was read: limiting it to pre-1998 printings would hide a
  1998–2014 card whose number wasn't read. `AUTO_OLDER` is `false` (11.3); replaced 2026-10-16 by
  the older-card mode (Section 17).

**Testing (10.3, 11):** Tesseract's files are copied into `public/tesseract/` by a Vite plugin when the
dev server or a build starts (`vite.config.js` `vendorTesseract`, mtgscan's way), not by `postinstall`;
the folder is git-ignored and ESLint skips it. The benchmark uses `@napi-rs/canvas` (prebuilt for
Windows) rather than `canvas`. `npm run dev:lan` is `vite --host`, which turns the basic-ssl plugin on.

**Benchmark (11.3), before the owner's photos:**

| What | Photos | Result |
|---|---|---|
| Tier 1, collector lines | mtgscan's own 22 (`sandbox/test-images`: hand-held, foil, mostly German) | **21 of 22 read right, all 21 sure (95%)**, about 120 ms each on the laptop. The miss read OTP 51 as 651 |
| Tiers 2–3, titles | Scryfall's own scans of 20 random older cards (Alpha to Return to Ravnica), clean | **15 of 20 named right (75%)**; 4 of 14 "123/350" numbers read |

Clean scans are kinder than a phone's photos, so tier 1 should be re-measured on the store's own photos
(Section 11.3) before relying on it, and older cards stay behind Scan card.

**Also changed outside the scanner:**
- `src/state/staff.jsx` `touch()`: a scan counts as use on the computer (7.4).
- `src/state/session.jsx` `signOut(options)`: the phone's Sign out is `{ scope: 'local' }`, this phone only.
- `loadSets` keeps `card_count` (cache key `.v4`).
- The Help tab has a **Scanning from a phone** chapter (README), and Settings' credits a scanning line.

## 17. The locked view (2026-10-16, after the rollback)

The first attempt at auto scanning on the owner's iPhone is in `docs/SCAN_LEARNINGS.md` (rolled back to
`e191f25`; the code is the local tag `scanner-attempt-1`). The owner's second approach: "after the
first card is detected in a scan, use edge detection to crop the view to those edges and from there on
just show that part of the picture, never moving or changing unless manually reset … and then …
only scan that part", with "a cutout of the spot on the card that show collector number and set code
info shown separately, magnified, processed to make clearer and larger". The owner's answers: the
holder is **snug** (every card lands in the same spot); if the camera shifts, **re-lock by itself**
when the card has clearly moved; a new card is **its art changing plus two matching reads**; the view
locks **automatically on the first card**.

**As built (`src/scan/cardEdges.js`, `lock.js`, `Scanner.jsx`):**
- **Before the lock** the whole picture fills the space (`guide.js` `showPart`, `cover`; the video's
  box sized and placed in px, never stretched), and a card found is outlined in green. Each look:
  `findCard` (the largest card-shaped patch of dark, on a 320px copy: darker than both Otsu's split
  and 55% of the picture's middle brightness, not touching the picture's edge, width ÷ height 0.62–0.84,
  20–97% of the picture's height, at least 10% filled) and the collector locator; when the anchor
  block (the left-most on the best row) is where a card's collector line is on that card (6.5% in,
  93.6% down, give or take), **the view locks** (`makeLock`). Auto scan doesn't add cards before the
  lock; Scan card reads the whole picture then.
- **Locked**, the screen shows just the card with 3% around it, as large as fits (`contain`), still.
  Under it a strip shows **the collector corner** (the block with 1.2 letters' room each way), enlarged
  to 48px letters and cleaned to black on white with mtgscan's own crop and threshold
  (`collectorCutout`; a light corner is turned round first). **That cutout is read first**; if it
  doesn't read, the line is looked for on the card's crop. Older cards' titles are read from the
  locked card.
- **The collector strip follows each card and is set level** (owner, 2026-10-16, after trying the
  lock: the card's view must stay still, but the strip "could easily be more dynamic, it's frequently
  going to need to be rotated a little … always … perfectly straight … And have it move around more
  per card"; the inverted black on white kept). `src/scan/straighten.js`: every locked look finds the
  collector line again in the card's bottom-left zone (−4% to 62% across, 83% to 103% down; the zone
  set on a tall dark canvas, since mtgscan's locator ignores letters over 3% of its picture's
  height), falling back to the corner found at the lock; measures its lean (`skewAngle`: the tilt, ±12°
  in half degrees, at which its text pixels fall into the sharpest rows); turns it level about its
  middle, enlarges its letters to ~48px and cleans it to black on white (mtgscan's threshold; a light
  corner turned round first). That's what's shown and read first. Checked: locked on one straight
  card, then the 17 modern cards each laid turned 2–5° and nudged 6–7px: the line found on every
  card, the lean measured within 1° on all 17, all 17 read right. Tests:
  `tests/scanStraighten.test.js`.
- **What the strip names, by elimination** (owner, 2026-10-16, after a clear strip of Stone-Giant of
  High Pass, HOB 113, added Troop of Ponies, HOB 3: "We have rarity, collector number, set code, even
  artist … try multiple interlocking quick scryfall queries of the info to find the card via process
  of elimination"). `src/scan/resolve.js` replaces the one lookup of mtgscan's parse
  (`/cards/<set>/<number>`), which kept a set code and a run of digits and nothing else ("R 0ll3",
  113 with its ones read as L's, was card 3). The strip is read twice, as Tesseract gave it (its lines
  kept) and as mtgscan cleans it; each text is read for every clue it holds, with its likely misreads
  (`readClues`):
  - the **set code**: as printed (weight 3), a letter read as its look-alike (2: 0/O/D, 1/I/L, 5/S,
    8/B …), mtgscan's own repair (1.5), a letter off ("DMQ": DMU, DMC … 1);
  - the **number**: letters read as digits ("0ll3", "OllO"), noughts of padding dropped, and each
    digit's look-alikes (3/8, 1/7, 5/6 …);
  - the **rarity** letter beside the number (not a stray mark on a line above it);
  - the **language** code; the **artist's name**, the words after it.

  Scryfall is then searched (`searchQuick`: one page, kept six hours, 550 ms apart, since Scryfall
  takes two searches a second and one 429 shuts the app out for 30 seconds), cheapest question first:
  the set and number clues together; if no card is clearly ahead, every card of that rarity in that
  set; then that artist's cards. Every card named is scored on the clues it agrees with
  (`scoreCard`): set up to 3 (−1 if none fits); number 3 as read, 1.5 a look-alike, 0.5 a digit lost
  ("013" for 113, or just its last digits), −3 a clear number that isn't this card's (−1 for one
  digit); rarity +1.5 / −1; artist up to +4, word by word (so "KARI CHRISTENSEN" isn't half "Chris
  Seaman"), −2.5 for a clearly read name that isn't this card's. **Auto scan takes a card at 6 or
  more, 1.5 ahead of the next; Scan card at 5, 1 ahead.** Nothing clearly ahead: nothing is added (the
  next look tries again). The two looks that must agree, the held art and never the card last sent
  all stand. Checked against Scryfall: the 17 modern cards' strips, read off the straightened cutout,
  17 right; their real set, number, rarity and artist (and HOB 113's) as 180 texts damaged ten ways
  (ones read as L, a digit lost, only the last digit, a look-alike digit, no artist, no rarity, no
  number, the set a letter off, all on one line): **none wrong**, 166 right, 14 nothing (12 of them
  with no number at all); mtgscan's parse alone reads HOB 113's damaged texts as HOB 3, 13 or 118.
  Tests: `tests/scanResolve.test.js`.
- **Quick when it can be** (owner, 2026-10-16: "now that we've nailed accuracy we need to optimize
  this for speed … if that matches what our new scryfall searcher is detecting, auto take that one
  quickly"):
  - **The quick way first.** The printing the set (as printed) and number point at, and mtgscan's
    own reading of the line, are looked up directly (`cardBySetNumber`: Scryfall's
    `/cards/<set>/<number>`, ten a second against two searches, about 0.25 s against 0.4 s, kept a
    day). A card is taken at once when every other clue read agrees with it (`confirms`: the rarity
    if read, the artist if read, at least one of the two) and it scores 7.5 or more, and only one
    such card. Anything else goes on to the searches, as before.
  - **One wider search, not two.** When the set and number search leaves no card clearly ahead, that
    set's cards of the rarity and the artist's cards are asked in one search (a 550 ms turn saved).
  - **The second look straight away.** A first read waiting for the look that must agree is looked
    at again after 50 ms, not the 300 ms rest (`CONFIRM_MS`).
  - **No second reading of the whole card in auto scan.** When the strip doesn't resolve (a card
    being laid in, a hand in the way), auto scan looks again instead of reading the card's crop as
    well (several more OCR passes, which kept it busy as the next card landed). Scan card still does.
  - Checked against Scryfall: the 17 modern cards' straightened strips, still 17 right, **all 17 the quick way** (one direct lookup each, no search); the 180 damaged texts, still none wrong and 166 right, 103 of them the quick way. Tests: `tests/scanResolve.test.js`.
- **Faster still, and Scan card for accuracy** (owner, 2026-10-16, untested on the phone):
  - **One look when every clue agrees** ("Let's try it with just one"): a card taken the quick way
    whose set (as printed), number, rarity and artist (six letters or more, most of the name theirs)
    were all read and all agree with it is sent on that one look (`isSure`; `sure` on the result).
    Anything less still needs two looks in a row to agree. The held art and never the card last sent
    stand.
  - **No waiting for the computer** ("the computer can load prices on it's own time while we scan
    more cards"): auto scan no longer pauses while the last scan is sent, pricing or being undone
    (the `WITH_COMPUTER` pause is gone). The computer takes the scans in the order sent (8.3); the
    strip shows the latest, and each card's sound plays when the computer says how it went. A card
    needing a price still pauses it.
  - **Scan card the slow way** ("do it the slow way, running all the scans and searches for best
    possible accuracy … show an accurate smooth loading bar … Only do this for manual"): the strip
    read, then the line on the card itself, every block (`readCollectorLine` `all`, both the text as
    read and cleaned); every printing the readings point at looked up and every search they call for
    asked, none skipped (`resolveThorough`); all the cards found scored together, each by the reading
    it fits best, the best taken at 5 and 1 ahead. Then the older card's title, if nothing was found.
    Pressed during an auto look, it waits for the look to end.
  - **The loading bar** fills the Scan card button behind "Reading…" (no room taken from the
    camera). `src/scan/progress.js`: the work as steps with expected times (an OCR pass 600 ms, a
    lookup 300 ms, a search 600 ms, an older card's title 2.5 s, sending 400 ms), re-planned as it's
    known (the blocks found, the searches the readings call for); the bar at the share of that time
    done, creeping through the step under way up to 90% of it, never going back when more work turns
    up; drawn every frame, full for a moment at the end. Tests: `tests/scanThorough.test.js`.
  - **"Auto?"** (owner, 2026-10-16: "when unchecked it does not automatically scan"): a checkbox
    styled as a button, ticked to begin with, kept for the tab like the condition and finish
    (`pug.scan.auto`). Unticked, auto scan doesn't look at all. Ticking it again starts afresh (the
    held art and never the card last sent stand, so the card left in the holder isn't added again).
    Scan card leaves it as it is (the owner's second thought: "it's not needed"), and nothing
    interrupts Scan card: auto scan holds off from the press to the end.
  - **The buttons in two rows** (owner: "keeping just the Scan Card button on the top row, full width
    and the other 4 buttons below it"): Scan card across the top; Auto?, Reset view, the light and
    Stop under it.
  - **FOIL?** (owner: "a "FOIL?" button by the undo button to tag the last card scanned as foil …
    it edits the last card scanned to be a foil instead"): beside Undo while the last card is added
    and not foil. Its copy is taken off the computer's list as Undo does (`scan_undo`); once the
    computer says it's off (`undone`), the card is sent again as foil (`scanFinish(card, true)`:
    etched when it has no foil), and the computer prices and adds it as any scan. No new database
    function: Undo's count down and the new scan's count up leave the number scanned as it was.
    Undo refused (the line gone, no user picked) sends nothing and says why; a card with no foil
    printing says so; no answer in 30 seconds, it gives up and says to check the list.
  - **NONFOIL?** (owner: "do the same for nonfoil when the settings are reversed"): the same beside
    Undo when the last card was added foil or etched: its copy off, the card sent again nonfoil
    (`refinish(scan, toFoil)` does both ways).
  - **+1** (owner: "adds another identical copy of the last scanned card. (So I don't have to wait
    for the long scan now) Also have tapping on the video feed center run this +1 action as well"):
    a small button beside Scan card, and a tap on the middle half of the picture (25–75% across and
    down), send the last card scanned again as it was (its printing, finish and condition), nothing
    read; "+1" shows over the picture as it goes. Only while that card is on its way or added (not
    once undone, failed, skipped or waiting for a price), and not while its finish is being changed.
    The picture takes taps without the double-tap zoom (`touch-action: manipulation`).
- **The phone's card as a peek** (owner, 2026-10-16, asking for consistent dismissal; the "peek"
  agreed, no timeout, the dismissing click doing nothing else): the phone's card covers the card
  picture and details panel only; the card that was selected stays selected underneath, with its
  condition, finish and highlight (the deselect of the line below is gone). It looks as first built,
  "Added from the phone" and the 📱 badges (a teal frame, a longer label and a × were tried and
  taken back: "this went too far, i liked how this part looked before"); the price, finish and
  action areas (still the selected card's) are dimmed. Put away by: a click anywhere outside it,
  left or right, which then does nothing else (no focus, no menu, no click: `swallowUntil`); Esc;
  or any other key, which goes on to do its work (typing a search). Inside it: a click on the picture enlarges it, a right-click searches
  its name and number, and its details' links open as usual. Not shown while a list line's being
  edited or a dialog's open: the list line just flashes. The newest scan replaces the one showing.
- **The phone's card on the computer's Selected card frame** (as first built; refined above) (owner, 2026-10-16: "When a card is
  added to the computer from the phone, show it's picture/details in the Selected Card image frame,
  but do not actually search or select it fully (that would fetch prices and waste api credits)"):
  each card the phone adds is shown there (`useScanReceiver` hands the Scryfall card it already
  fetched to `PricingScreen`, `phoneCard`), over whatever's selected, without selecting it:
  nothing's searched, priced or looked up. Labelled "Added from the phone", with a 📱 badge where a
  Poké Ball's goes (`.phone-badge`, not on the enlarged view, where it'd be in the way of the
  magnifying glass) and a 📱 before its name in the details panel. The card that was selected is
  deselected ("it feels natural to click the selected card again to get it back"), unless a list
  line's being edited. A click anywhere but on its picture (or its enlarged view; a click on the
  details panel puts it away), a card picked, or a new search puts it away. A right-click on its
  picture searches its name and number ("Wild Growth 342").
- **The chime when it's sent, brighter for a foil** (owner, later the same day: "Instead of >$3 (we no
  longer need to collect this info at all) I want the alternate sound to be used for Foil and the
  normal sound for normal nonfoil. This will aide workers doing quick detection more than a price
  point"): the brighter three-note chime (`sounds.js` `foil`) plays when the card sent is foil or
  etched, the usual two notes when nonfoil, at the same moments as below. The price check
  (`isPricey`, `scanTcgPrice`, `PRICEY_USD`) and the cards kept for +1's price are gone.
- **The chime when it's sent, brighter over $3** (superseded by the above) (owner, 2026-10-16: "make a different sound if the
  card scanned is over $3"; then, told the chime came only once the computer had added the card:
  "build it that way"): the chime plays the moment a card is sent (auto scan, Scan card, a printing
  picked, +1, FOIL? / NONFOIL?'s new copy), not when the computer has added it, which with no
  waiting for the computer could be a card or two later. Over $3 at TCGplayer for the finish sent
  (Scryfall's usd / usd_foil / usd_etched on the card the phone read; `scanPrice.js` `isPricey`) it's
  a brighter three-note chime (E6 G6 C7, `sounds.js` `pricey`), otherwise the usual two notes.
  The price is before the condition and rounding the computer applies; a card Scryfall has no
  TCGplayer price for (priced from JustTCG or Cardmarket on the computer) gets the usual chime. The
  computer's "added" no longer chimes; a card that needs a price and one it couldn't add still
  sound when it says so.
- **Foil by its star** (owner, 2026-10-16: "there's a STAR symbol after the Set Code … when it's
  not a star it's a small dot … when the star is detected I want it to automatically send in the
  card as a foil, and when it's not detected I want it to auto to non-foil"): since 2014 the
  collector line marks the finish between the set code and the language ("TMT ★ EN" foil,
  "TMT • EN" not). `src/scan/foilMark.js` looks for it on the strip already cut, set level and
  cleaned, by shape, no OCR: the marks on each line (4-connected), and the one after the set code's
  2–4 letters, spaced from them and before two more letters; a **star** stands at least 0.58 of a
  letter's height and fills under 0.74 of its box, anything else there is a dot. Checked: the 17
  modern (nonfoil) Scryfall scans, straightened as on the phone, all dots (0.40–0.44 high, filling
  0.72–0.80); the owner's foil from a phone screenshot, a star (0.78 high; its points blurred in,
  filling 0.64). Every strip read (auto scan and Scan card, locked) sends foil on a star, nonfoil
  otherwise (`scanFinish`, so a card with only one finish keeps it); a misjudged look differs in
  its finish and so can't agree with the next. FOIL? and NONFOIL? still correct the last card.
  Tests: `tests/scanFoilMark.test.js`.
  - **Detect / Normal / Foil** (owner, the same day: "a 3rd foil state button Detect / Normal / Foil
    and when it's on detect it runs this detection, but when set to foil or normal it overrides
    trying to guess and sets it to that treatment flat"): the finish row has three buttons,
    **Detect** to begin with, kept for the tab (`pug.scan.finish`). Detect: the star decides, and a
    card with no strip to go by (an older card read by its title, Scan card before the lock) is
    nonfoil. Normal or Foil: every card so, whatever the strip shows (`scanFinish`, so a card with
    only one finish keeps it).
- **The List and Mystery Booster** (owner, 2026-10-16: "We should attempt to detect this symbol like we
  do with collector number info and make sure that list and mystery booster cards have 100% accuracy
  like the rest"): a card on The List, and one from the first Mystery Booster (Scryfall files those
  with The List, dated 2019-11-07), is its original printing to the letter, set code and number
  included, but for a small white planeswalker symbol in the black border at its bottom-left corner,
  just left of the collector line; Scryfall numbers it `<SET>-<number>` in set `plst` ("A25-50").
  `src/scan/listMark.js` looks for it on the locked card's place each look: in the corner band (0–9%
  across, 90.5–99.5% down, at a 600px card), a bright shape the mark's size (1.4–4% of the card high,
  about square: width ÷ height 0.8–1.25, half filled), clear of the band's edges, with no other
  glyph-sized mark at its sides (a digit has its neighbour a pixel or two off) and little above or
  below; the holder past a card set off, or a frame's edge, is big and runs off the band, so it
  doesn't count. **Strip reads:** the mark seen, the printing read is swapped for The List's of that
  set and number when Scryfall has one (`/cards/plst/A25-50`); no List printing, the card goes in as
  read. **Older cards:** the mark is a clue in the printing match (`printingMatch.js` `list`: seen,
  +3 for a List printing and −2 for the rest; not seen, −1 for a List printing). **Mystery Booster
  2** (`mb2`) prints in its own frame with no set code at the bottom: read as an older card.
  **Checked:** the 28 List printings among the 18 sample cards' 671 (M15, 2003 and 1997 frames; Mystery Booster's among them), and the other 643 as the ones that mustn't be taken for List cards, laid in a simulated holder (4K, the card 42% of the picture, turned up to 1°, nudged up to 1% or 2% of the card, a colour cast, a blur): the mark found on **28 of 28** at both nudges; a mark wrongly seen on 0 of 643 at 1%, and 1 of 643 at 2% (a borderless Final Fantasy card with no List printing, so nothing would change). Tests: `tests/scanListMark.test.js`.
- **The last scan's ribbon under the info box** (owner, 2026-10-16: "The confirm card card details
  ribbon should be right under the title/number display panel, above the Scan Card button instead
  of at the top where it is now. That's where the eye rests"): the strip with the last scan, its
  Undo and FOIL? / NONFOIL?, now sits between the info box and Scan card; the paired bar stays at
  the top. Fitted to a phone (owner: "on my phone I can't see enough of that info. The card
  name/set and the price all get truncated and cutoff by the buttons"): the card's name alone on
  the first line; on the second its set, number, finish and condition, then the price and how many
  are in the list ("HOB 87 · $0.25"; "sending…", "pricing…", "needs a price", "taken off" for the
  other states); the computer's name, in the paired bar, isn't repeated; Undo and FOIL? / NONFOIL?
  two squares side by side at the right end, the strip's height (50 × 44px, their labels on two
  short lines: "↶ / Undo", "✦ / FOIL?", "NON / FOIL?"; stacked small first, too small for the
  owner).
- **Title / Number** (owner, 2026-10-16: "Sometimes an older card will get stuck without it's name
  highlighted and doesn't respond to Scan Card. I think there needs to be a way to force scan card
  on older pre-2014 cards to actually detect and highlight the name and name search open the card
  selection menu"): a button at the info box's right end. **Title**: the view locks onto the card
  outlined if it isn't locked yet (`lockOnCard`), the info box shows its title, the title's read and
  its name searched (`readOlderCard`, with the printing match), and the printing menu opens, best
  match first, whatever the match: the person scanning confirms it. The info box is there whenever
  the camera's on, so Title can be pressed before the view locks. It then reads **Number**, which
  puts the info box back on the bottom strip. The older-card mode turning on by itself says Number
  too.
- **A tap locks onto an outlined card** (owner, 2026-10-16: "Older cards never initiate the crop that
  the first card sets. But I see that they have a green detection border. When this border is
  showing and the screen is tapped instead of the normal +1, instead initiate the edge detection
  crop on that area"): the view locks by itself only on a card with a modern collector line where a
  card's is. While it's unlocked and a card is outlined in green, a tap anywhere on the picture
  locks onto that card (found again in the picture at the tap, else where it was outlined), its
  collector corner taken where a modern card's is (`lock.js` `lockOnCard`: 6.5% in, 93.6% down);
  the strip is looked for in that corner on each card anyway, and an older card then goes to the
  older-card mode as usual. Locked, a tap on the picture's middle is +1, as before.
- **The older-card mode** (owner, 2026-10-16, a 2014 Courser of Kruphix: "When you put in a pre-2014
  card the detection for collectors number changes rapidly to card text. When it's detected that
  it's changing very rapidly like this shift to 2014 mode and focus the info box on the card name
  instead, resetting to the normal bottom position upon the next card"): auto scan counts the looks
  in a row whose strip names no set code (`readClues`), or whose strip is blank while the title band
  holds ink (a white-bordered card, not an empty holder); at three (`OLDER_AFTER`) the card's taken
  for an older one. Then the info box under the card shows its **title** (`titles.js`
  `titleCutout`, the band the title reader reads), the strip isn't read, and each look reads the
  title (and the "123/350" from 1998 on: `readOlderCard`); two looks naming the same card, it's sent
  when it has one printing that fits, or the printing picker opens. The next card (its art changed
  from the one the mode began on, or the card sent) puts it back on the bottom strip, as does a
  strip that reads. What's picked or skipped in the picker is held like a card sent, so the card
  left in the holder isn't asked about again. Replaces `AUTO_OLDER` (older cards on Scan card
  only); Scan card still tries the title whenever the strip names nothing.
- **An older card's printing by how it looks** (owner, 2026-10-16: "Build all of this. I want to get
  older cards to a state where they are sometimes automatically accepted like newer ones to the best
  of our abilities"; the clues proposed: the art, border and frame, the artist, the set symbol).
  `src/scan/printingMatch.js` scores every English paper printing of the name the title gave,
  against Scryfall's own small picture of it and its set's symbol (both readable on a canvas:
  `cards.scryfall.io` and `svgs.scryfall.io` send `Access-Control-Allow-Origin: *`):
  - **art** (up to ±3): the middle of the art box (14–86% across, 15–50% down: inside every frame's
    art box) as a 10 × 7 fingerprint of red, green and blue, each evened out (the camera's light
    and white balance count for little), a cell's shift allowed. The same art, ~0.2–0.4 apart;
    other art, 0.7 and more.
  - **border** (+1 / −2): the band just inside the locked card's edge, dark (black, borderless) or
    light (white).
  - **frame** (−1.5): a printing in today's frame (2015 on) would have had its set code read.
  - **artist** (+1.5): most of the credited artist's name among the words read off the card's bottom.
  - **set symbol**: Scryfall's SVG, cut to its ink, drawn at five heights and slid over the edges at
    the type line's right end (found by its two ruled edges), scored by how well the outlines meet
    (a chamfer match). At ~25px in a slightly blurred picture most symbols fit most outlines
    (0.8–0.95), so it mostly says **whether there's a symbol** (a fit of 0.75 or more): none seen
    favours a set printed with none (Alpha to Fifth Edition, +1.5), one seen counts against them
    (−1.5); the best fits among the sets nudge (±0.5). Promos' generic symbols aren't compared;
    nor are sets that printed it only in today's frame.
  - **year** (+1) and **number** (+2.5): the copyright year (that year or the one before) and the
    "123/350", when read.

  A printing at 4 or more, 2 ahead of the next, is taken; else the picker opens on them best first.
  The number and set size fitting one printing still settle it alone. Auto scan's two looks must
  agree on the printing to take it. **Checked:** every pre-2015 printing of 18 much-reprinted cards (336: Llanowar Elves, Lightning Bolt, Serra Angel, Counterspell, Swords to Plowshares …), Scryfall's scans laid in a simulated holder as the phone sees them (4K, the card 42% of the picture, turned up to 1°, nudged 1.5%, a colour cast, a blur), on the look alone (no year, number or artist read): the right printing first 160 times (48%), in the top three 280 (83%); **taken by itself 27 times, all right, none wrong**. 124 of the misses had a twin first: the same art, border and frame (Alpha and Beta; Revised and Fourth), which only the copyright line or the card's corners tell apart. On the phone the year and number read add to it. Tests: `tests/scanPrintingMatch.test.js`.
- **An older card's printings: View all** (owner, 2026-10-16: "The "Which <cardname>? Match the set
  symbol." menu panel is good, but doesn't offer enough options, there needs to be a "view all"
  button … and when viewing all, show them oldest to newest"): the pick list opens on **one row**
  of the likeliest printings (those with the number read, or of the copyright year, oldest first,
  three of them); **View all (N)** beside Skip shows every English paper printing of that name,
  oldest to newest ("Fewer" goes back). `older.js` returns them as `all`, fetched up to four pages
  (700 printings) where it was two. The first try showed all twelve of Utopia Sprawl's in a list
  that scrolled on its own, one row in sight and no View all (the list was already all of them):
  now the sheet scrolls as a whole, its foot (View all, Skip) stuck to the bottom.
- **The camera taller** (owner, 2026-10-16: "There's still empty space on my phone under the
  buttons, about 280px worth … Make the default video size that much taller and scale the cropped
  card to fit in it"): the 86px kept free under the buttons for Safari's floating toolbar is now
  10px, since iOS 26 Safari's 100dvh already ends above the toolbar (the screenshot showed about
  100 CSS px empty). The camera's space grows by that much; the picture, sized in its own shape
  (`showPart`), and the locked card in it (`contain`) grow with it, never stretched.
- **The card alone, its sides cut too** (owner, 2026-10-16: "we're only doing the height and leaving
  the sides of the picture which adds noise … also crop the left and right … and hopefully stop some
  of the recalibrating motion"):
  - **Shown:** locked, the video is cut to the card and its 3% margin on all four sides
    (`guide.js` `insetTo`, a CSS clip-path), so the stage's black lies either side of the card
    instead of the rest of the picture.
  - **Followed:** each locked look looked for the card only round where it's locked
    (`findCardNear`); superseded the same day by no re-locking at all (Re-locking, below). The strip
    and the art are read from the card's own place only.
- **New card or the same one:** the art (the middle of the art box at its locked place) as a 16 × 10
  thumbnail of true averages, brightness and contrast evened out (`artPrint`, `artDistance` with a
  one-cell shift). After a card is sent its art is held; **nothing is read while the art is under 12
  apart** (`ART_CHANGED`), so a misread of the card in the holder can't be sent; once it's changed,
  two looks in a row must read the same printing; and never the card last sent.
- **Re-locking:** ~~each locked look also finds the card's edges and locks again when they've clearly
  moved for 2 seconds~~ (removed 2026-10-16, the owner: "The viewport is still moving all over the
  place, it moves whenever I slide any new card into view … it should be more confident in the
  viewport … relying on the user to press Reset if something major changes NOT moving around on it's
  own"). Locked, the view never moves by itself: **Reset view** unlocks it (the next card found
  locks it again), and nothing else: the lock stays while the camera's off (Stop, or the page
  hidden) for when it's back. `followMove`, `findCardNear`, `movedFrom` and `samePlace` went with
  it. **A camera picture of another size keeps the lock** (owner, the same day, still seeing it
  move: "Once the crop is done. Lock that in until reset is pressed"): it was unlocking, and the next
  look locked onto whatever it found, often the card coming in; an iPhone changes its picture's
  format when it switches lenses, which a hand or a card coming close sets off (SCAN_LEARNINGS.md
  2.4). Now the lock is scaled to the new size (`lock.js` `rescaleLock`), shown and read the same
  part of the picture, the held art kept. **What a page can't stop:** the lens switch itself moves
  the picture inside the fixed crop (each lens sits elsewhere on the phone).
- **One lens, never switching** (owner, 2026-10-16, two screenshots: the crop stayed put on screen
  while the picture in it jumped, the card up-left in one and down-right in the other, Reset
  setting it right). On a phone whose default back camera is the switching kind ("Back Triple
  Camera", the owner's iPhone 13 Pro), one lens is opened alone by its device id once the camera's
  allowed (`camera.js` `openCamera`). Tried and undone the same day: the **ultra-wide** ("it can't
  read them at all. Too small") and the **telephoto** ("too close and doesn't fit the card in view
  at all"). Now the **normal 1× lens** ("Back Camera"), the owner's choice: "we technically have to
  use the "normal" lens only, and we just need to work on the focusing issue" (it's sometimes
  perfectly sharp, sometimes blurry at the holder's distance, near its closest focus). Any other
  phone, or the 1× lens refusing to open, keeps the default camera.
- **Focus on the 1× lens** (owner, 2026-10-16: "do 2, 3 and 4, and the focus test for 5"):
  - **More pixels:** the 1× lens is asked for up to 3840 × 2160 (`ONE_X_SIZE`), so the phone can
    stand a little higher, past the lens's closest focus, with the letters as large as before. The
    lens chosen is remembered for restarts (`chosen`).
  - **Blurry strips aren't read by auto scan:** each look measures the collector strip's sharpness
    (`straighten.js` `sharpness`: its steepest brightness steps over its contrast, times the letters'
    height, so it reads the same at any picture size). On Scryfall's scans in a simulated holder: in
    focus 5–7, a slight blur about 3, out of focus about 1, alike at 1080 × 1920 and 2160 × 3840.
    Under 2 (`BLUR_BELOW`) the strip's border turns amber and auto scan doesn't read it; a blank
    strip (no card) isn't read either. Scan card still reads whatever it sees.
  - **Refocus:** four blurry looks in a row (`REFOCUS_AFTER`), no more than once every 6 seconds,
    the camera is opened afresh, the same lens (`camera.js` `refocus`), so the phone's autofocus
    starts over; the picture stops for a moment.
  - **The focus test** (removed once it had answered, the owner: "remove the focus test button"):
    a "Focus test" button under START CAMERA started the camera with a panel over
    the bottom of the picture (auto scan waits while it's open): the strip's sharpness live against
    the blurry line, the lens, the picture's size, and the focus modes, focus distance and zoom this
    phone lets a page set, with everything else it reports. If it offers a focus distance, a slider
    fixes the focus there (and Auto puts it back): the way to find whether a fixed focus at the
    holder's distance works. Close ends it. `src/scan/FocusTest.jsx`.
  - **What the test found** (the owner's iPhone 13 Pro, iOS Safari, 2026-10-16): lens "Back Camera",
    picture 2160 × 3840 (the 4K asked for, granted); focus modes **not offered**; focus distance
    reported only as a minimum, **0.15 m** (the 1× lens's closest focus: a card nearer than 15 cm
    is blurry; nothing can be set); zoom 1–10 (digital, the same lens). So a page can't fix the
    focus on this phone. The owner, after the 1× lens, 4K, the blur gate and refocus: "the other
    things we've done have cleared up the problems entirely already pretty much AND detection is
    faster too".
- **Checked end to end** on Scryfall's scans of 17 modern cards (2017–2025) laid in a simulated holder:
  card 40% of the picture's height: edges 17/17, locked 17/17, the cutout read right 17/17; 30%:
  17, 16 and 16. Tests: `tests/scanLock.test.js`, `tests/scanGuide.test.js`.

---

## Appendix A: The collector line by era

| Printed | Cards | At the bottom left | How the scanner names the printing |
|---|---|---|---|
| July 2014 on (Magic 2015 frame and later) | Most of any modern pile | Line 1: the number and a rarity letter (`125/287 U` until about 2020; `0125 U` after); line 2: `FDN • EN` (set code, language). Light text on the dark border | Tier 1: set code + number → one Scryfall card. The language code says `EN` |
| June 1998 (Exodus) – June 2014 | Old-frame and modern-frame cards up to Magic 2014 | `123/350` (number / set size), sometimes with the rarity letter, in the border; no set code (the set symbol is a picture) | Tier 2: the name (title bar) + number + size → the set(s) of that size that have the card at that number |
| Before June 1998 (Alpha to Stronghold) | The oldest cards | No collector number; the artist line only | Tier 3: the name → the printings before 1998, picked on the phone (the set symbol in hand decides) |
| Promos, Secret Lair, The List | Any era's style | Modern ones carry a code (`PLST`, `SLD`) and often a prefixed number (`CMA-216`, `2090`); The List cards keep their original set's line **plus** a planeswalker symbol | Tier 1 reads them; The List is a known quirk (the line names the original set, Scryfall has the card under `plst` with a prefixed number): the lookup tries the printed set first, which Scryfall answers with the original printing, the right card at the wrong set. Accepted for v1; noted in Help |

Numbers with suffixes (`150a`, `263s`, `123★`) are kept as printed; the lookup passes them through.

## Appendix B: Decisions log

The owner's answers (2026-10-16, the clarification session before this document) and the engineer's choices (◆, overturnable).

| # | Topic | Decision |
|---|---|---|
| S1 | Recognition | **mtgscan's approach and code**: OCR of the collector line with Tesseract.js, lookup by set + number on Scryfall; all on the phone (owner's choice of project) |
| S2 | Licence | **Copy mtgscan's recognition code and put the repo under GPL-3.0** (owner, over "write our own" and "ask the author") |
| S3 | Which cards | **2014+ by the collector line, exact; older cards by name + number (1998–2014) and by name with a pick on the phone (pre-1998)**. Name reading is less reliable and is gated by the benchmark (owner) |
| S4 | Foil | **A Normal / Foil switch on the phone**, Normal by default, from then on (owner) |
| S5 | Price warnings | First "add the card anyway and keep the ⚠️ on the line"; then, once TCGplayer became the main source (S14) and the JustTCG-based checks could no longer run, **no warnings on scans at all** (owner, 2026-10-16: "no longer worth the time to make") |
| S6 | Phone sign-in | **The store password once on the phone**, the session kept (owner; over a pairing code) |
| S7 | Detection | **Phones automatically (touch-first and narrow), plus `#/scan` on any device** (owner) |
| S8 | Computers listed | **Every computer on a price screen**, Pokémon-only ones greyed with "switch it to Magic first" (owner) |
| S9 | Can't read | **A message only**: set the card aside and add it on the computer; no search or typing on the phone (owner) |
| S10 | Condition control | **From now on only**; already-added cards are edited on the computer (owner) |
| S11 | The computer's side | **A chip in the buy list with the phone, the count and Unpair; lines flash in; the stage is left alone** (owner) |
| S12 | Phone testing | **An HTTPS dev server on the LAN** (`npm run dev:lan`, Vite's basic-ssl); nothing pushed for testing (owner) |
| S13 | Phones per computer | **One**; a second replaces the first (owner) |
| S14 | Price order | **TCGplayer's daily price (on the Scryfall card, free) × the condition's % → JustTCG only when Scryfall has no price → Cardmarket × % → the phone asks for a price** (owner, 2026-10-16, replacing the first order "JustTCG then TCGplayer fallback": a scan-by-scan JustTCG lookup would have spent the daily allowance on a bulk pile; this is free, needs no batching, and keeps the data live). Recorded as Use TCGplayer / Use Cardmarket so the rest of the app treats them as those ◆ |
| S15 ◆ | Where the work happens | The phone recognises; **the computer prices and adds** through its own `list.add`, so everything downstream is unchanged |
| S16 ◆ | How they talk | Two transient tables watched over Realtime (`scan_sessions`, `scans`), not broadcast channels: the app's existing pattern, nothing lost, testable |
| S17 ◆ | Same-card key | The printing and finish; condition changes don't make it a new card |
| S18 ◆ | Sounds | Web Audio tones (no files): a chime on **added**, a tone on needs a price, a buzz on couldn't read; a mute on the phone |
| S19 ◆ | User kept | An incoming scan counts as activity on the computer, so the 30-minute forget (decision 231) doesn't fire under a scanning phone; a computer with no user picked can't take scans |
| S20 ◆ | Away and replaceable | A closed phone stays paired 10 minutes; away after 1 minute on the chip |
| S21 ◆ | Changelog | No new entries; a collection's scans are **Cards added** as from the keyboard |
| S22 ◆ | Undo last scan | On the phone, in S5: one copy of the last added line is removed |
| S23 ◆ | The List | Read as its original set's card (the right card, the wrong set) in v1; noted in Help |

## Appendix C: Open items

1. **The benchmark on the store's own photos** (11.3): done 2026-10-16, by the owner's live testing on the store's phone and cards (Section 17); older cards scan by themselves in the older-card mode.
2. **Version name** for the first live scanner: the owner's call at S5.
3. **Pokémon scanning:** not planned. Their line (`125/198` with a set abbreviation elsewhere on the card) would need its own locator.
4. **The List and Mystery Booster**: done 2026-10-16, by their planeswalker mark (Section 17).
   The outline a little off the card: closed 2026-10-16. The 27/28 run was of an earlier detector; the committed one finds 28/28 at 1% and 2% (Section 17's figures), and the owner calls it "great as-is".
5. **A "scanned from a phone" note in the Changelog**: done 2026-10-16 (Section 12).
6. **Renaming a phone** without clearing its site data (Section 12).
7. **An auto scan switch** on the phone: built 2026-10-16 as "Auto?" (Section 17).
8. **Settings → Sign out signs out every computer**: done 2026-10-16 (owner: "make sign out per computer"): `session.signOut` now defaults to `scope: 'local'`, so Settings' Sign out and the phone's sign out only their own device.
9. **Scryfall's search limit**: done 2026-10-16 (owner: "fix this, yes"): every `/cards/search`, of
   every kind (live search, a card's printings, Import Collection, the older-card printings, the
   scanner's), takes its turn through one gate in `scryfall.js` (`searchJson`): one at a time, each
   sent 550 ms or more after the last one's answer came back; a search given up before its turn (a
   newer query typed) takes none. `/cards/collection` was already spaced 550 ms (`todaysPrices.js`).
