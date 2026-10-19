# Phone scanner: what the first attempt taught us

| | |
|---|---|
| **Written** | 2026-10-16, when the owner rolled the scanner back to `e191f25` ("The current systems are not panning out and working … we're going to try a different approach") |
| **The rolled-back code** | Local tag `scanner-attempt-1` (`ecfca0a`, not pushed): `git show scanner-attempt-1:src/scan/sameCard.js` and so on. Kept for reference; the next approach isn't expected to reuse it |
| **The plan it built from** | `docs/SCAN_FUNCTION.md` (Phases S1–S5, all built; Section 16 is the as-built record up to `e191f25`), retired 2026-10-19: `git show d158ee3:docs/SCAN_FUNCTION.md` |

Everything below was found on the owner's iPhone (iOS 26 Safari, a back camera with several
lenses), scanning cards laid in a card holder (a white box), with the laptop on dev.

---

## 1. What worked, and is still in `main`

- **Pairing and the plumbing** (S1–S2): `scan_sessions` and `scans` over Realtime, the computer's
  claim → price → `list.add` → resolve loop, the needs-a-price sheet, Undo. Cards landed in the Buy
  list at the right TCGplayer-first prices (Balin, Loremaster HOB 87 at $0.27; Emissary Escort EOE 56;
  Stone-Giant of High Pass HOB 113). Database test run 461 checks.
- **Reading a collector line from a still**: mtgscan's locator + Tesseract read 21 of 22 of
  mtgscan's own sample photos right, all at its "sure" score (95%), about 120 ms each on the laptop.
  On the phone it read the owner's HOB, EOE and MEE-era cards from the holder.
- **The scanning screen fitting an iPhone** (`e191f25`): the whole screen is `100dvh`, nothing
  scrolls, the last scan is a one-line strip under the paired bar, the camera takes the height
  that's left, and **86px is kept free at the bottom for Safari's floating toolbar** (iOS 26). The
  owner's screenshots after that showed everything in view.

## 2. What went wrong, in the order it was found

### 2.1 One card read as two cards, in turn

A Stone-Giant of High Pass (**HOB 113**) left in the holder was read alternately as 113 and as
**HOB 13** (Esgaroth Garrison), every 2–3 seconds, and both were added: 5 and 4 copies, 13:07:52 to
13:08:26. The only rule was "never the card last sent", and each reading was "not the card last
sent". **OCR drops or swaps a digit of the collector number now and then, even on a still card.**
Any auto-scan design needs an answer to "the same physical card, read differently".

### 2.2 Telling "the same card" from "a new card" by the picture

| Try | Result |
|---|---|
| A thumbnail of the whole guide, compared after a new card | **Fails in a holder**: the card is a small part of the picture, the box is the rest. Simulated (Scryfall scans laid in one spot): same card shaken 3–13 apart, different cards 5–31 apart (median 11): heavily overlapping |
| The card's **art**, placed from its collector block, thumbnail by `drawImage` | **Fails**: same card 20–26 apart (median), different 18–26. Two causes: the locator's block height jumps (one line vs two lines, 10–38 px across cards; a 1° turn grows it 15%), so the card's size estimate jumps; and **`drawImage` shrinking ~400 px to 16 px samples rather than averages**, so a half-pixel shift changes the thumbnail a lot |
| The art with **true area averages** (an integral image) and a **search over sizes 0.82–1.18 and one-cell shifts** | Simulated well: card 40–70% of the picture, no errors either way; card 25%, 4 of 68 / 1 of 272 wrong. **On the phone the owner still saw new cards not picked up**: the simulation (clean scans, synthetic shake) didn't match the real camera (blur, lens switching, glare) |
| Relaxed: skip reading only when plainly the same picture; otherwise read, and turn a reading down only if it's the card just sent or a likely misread of it (same set, a digit dropped, added or a look-alike: `confusable`) | Built last (`ecfca0a`); the owner rolled back before judging it on its own |

Measured on 17 modern cards (Scryfall's scans, 2017–2025): the collector block's left edge is
**6.5%** in, its top **93.6%** down, its two lines **3.2%** of the card's height; the card is about
**87** of its collector letters tall (77–99, quantised at that size). One card in 17 (LTR) ranked
the **copyright block** first (to the right on the same row): take the left-most block on the best
block's row.

### 2.3 The picture on screen

- Sizing the `<video>` with **percentages, `aspect-ratio` and `object-fit: fill`** came out
  **squashed** on the iPhone (a card shown wider than tall); with **`object-fit: contain`** it came out
  at about **two-thirds of its box, in black**. iOS doesn't size a video the way the layout asks.
  **Setting the video's own box in px, in the picture's own shape**, worked.
- The camera's shape can change after it starts (follow `resize`, `loadedmetadata`, and poll).
- The owner **liked the picture zoomed in and cropped** to fill the space ("The zoom and crop looks
  good to my eye"), and asked for **a box around the collector number area**, for the person scanning
  only. Both were built in the rolled-back code.

### 2.4 The iPhone's lenses

- A page asking for `facingMode: 'environment'` gets a **virtual back camera** ("Back Triple Camera",
  "Back Dual Wide Camera") that **switches lenses by itself**: to the ultra-wide (macro) when
  something comes close. Each lens sits elsewhere on the phone, so **the picture jumps and goes off
  centre after a card is laid down**, which the owner saw from the start.
- Opening the lens named exactly **"Back Camera"** (the wide lens alone; names come only after the
  camera's allowed, via `enumerateDevices`) stopped the jumps but **couldn't focus at the holder's
  distance** (the card ~40% of the picture: the phone about 15–20 cm away, near the wide lens's
  closest focus). **A page can't set an iPhone's focus or choose macro.**
- Following the card on screen to hide the jumps **moved too much** for the owner, even with a dead
  zone (8%), a delay (1.5 s) and a slow glide. The owner wants **a still view**.

### 2.5 Older cards (tiers 2–3)

- Titles read from a band of the card: **15 of 20** named right on Scryfall's clean scans of older
  cards, once the title box's ruled lines were taken out and a second page mode tried; the matcher
  must be strict (a clear winner, never part of a title).
- "123/350" on 1998–2014 cards is tiny print on the copyright line: **4 of 14** read. Looking for it
  in what the collector-line reader already read helps on black borders.
- Never tried on the phone.

## 3. What the owner asked for along the way

- Everything on one iPhone screen, the last scanned card's name included, nothing scrolling.
- The picture zoomed in on the card, cropped, **still** once started; no text over the picture
  ("totally in the way"); little motion.
- A box showing the collector number area, for information only.
- The card in the holder will "likely always be around this size of the frame" (about 40% of its
  height).
- New cards laid in the holder must be picked up; one card must never come in as two.

## 4. Things to weigh in the next approach

- **The physical setup decides a lot.** At ~15–20 cm the iPhone needs its macro lens, which jumps; a
  stand that holds the phone ~25 cm up would let the plain wide lens focus and stay still, with the
  card smaller in the picture (the zoom on screen hides that; the reader then gets fewer pixels).
- **Recognition on stills was never the problem; deciding when to take a still was.** A design where
  the person says "next card" (a tap, or the card leaving and coming back clearly) is simpler than
  judging new-vs-same from video.
- **Misreads are real**: a reading should be confirmed (two agreeing reads, or a check against the
  card's name or art) before a card is added by itself.
- iOS Safari: size the video in px; expect the camera's shape to change; keep 86px for the toolbar;
  no focus or lens control; sound only after a tap.
