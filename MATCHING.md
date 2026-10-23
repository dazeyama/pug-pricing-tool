# MATCHING.md — the Crystal Commerce export's matching: what went wrong, what the sweep found, the plan

Written overnight on 2026-10-23 after two automatic matches reached the live inventory wrong. Read-only: no code
was changed, nothing was written on dev or prod. Everything below was checked against `main` at d2c50d8
(v1.0.2-quantity), dev's data (the test copy, `psucrzljraxeootwnltf`) and Scryfall. The plan is for the morning
of 2026-10-24, one item at a time.

**In one paragraph.** The matcher reads a Crystal Commerce (CC) product name as a card name, a foil kind and
"variant" words, and sorts each variant word into a family (Borderless, Showcase, Extended Art…). Two rules did the
damage: a word that *contains* a family word counts as that family and nothing more ("Anime Borderless" is just
Borderless, "Showcase Scrolls" is just Showcase), and a product is picked automatically whenever it is the only one
left or leads the next by two points, including when its name is exactly the name the app expected. Both reported
cards sit in categories where CC sells the regular printing under the plain name and a special one under a longer
one, and the card's own traits (from Scryfall) can't tell them apart. The sweep of dev's 1,880 printings shows the
same shape in 26 more automatic matches under the recommended rule (16 once the new Scryfall-backed families are
in), and prod's own 283 remembered auto matches hold exactly two the rule refuses: the reported Polluted Bonds and
one more, Serra Ascendant. The fix is a rule that never picks between products the card can't
tell apart, extra words that count against a product, no more trusting matches the app made by itself, and a
one-time clean-up of the links already remembered. Prod's remembered links were read after the scan, one SELECT, nothing
written: 303 links, 283 of them made by auto matches, every one of those listed in Appendix B with the evidence
against it. Polluted Bonds is there as reported. Tom Bombadil (LTR) 685 is not: prod holds no link for that
printing, and the `Tom Bombadil - Showcase` link it does hold is a **staff** pick for LTR 331 (section 2.5).

**The first three things to ship:** 1 (the never-guess rule), 2 (auto matches are no longer remembered or
trusted), 3 (forget the two wrong links on prod). Items 1 and 2 are code only; the migration (item 5) can wait for
a closed-store evening.

---

## 1. What happened and why

### 1.1 The two cards, reproduced

Both were run through the repo's own matcher (`src/lib/ccMatch.js` `chooseProduct`) under Node with the products
dev's inventory file has for them (file 33, the same store inventory, uploaded to dev on 2026-10-22). Both printings
exist as lines on dev too (bought before launch, never exported there), and the matcher picks the same wrong
product.

**Polluted Bonds (WOT) 34, foil.** Saved treatments: `borderless`, `showcase` (Scryfall flags every Enchanting
Tales card that way). Category found by name: *Wilds of Eldraine: Enchanting Tales*. Expected name built:
`Polluted Bonds - Foil - Borderless - Showcase`, which no product has.

| Candidate (foil ones pass) | Score | How |
|---|---|---|
| Polluted Bonds - Foil - Anime Borderless | **4** | foil kind +2; our *borderless* found in "Anime Borderless" +3; our *showcase* missing −1; "Anime" costs 0 |
| Polluted Bonds - Confetti Foil - Anime Borderless | 1 | foil kind not ours −1; the rest as above |
| Polluted Bonds - Foil (the right one) | 0 | foil kind +2; borderless missing −1; showcase missing −1 |
| Polluted Bonds, Polluted Bonds - Anime Borderless | — | non-foil: fail the finish check |

A lead of 3 ≥ 2 → **auto**, wrong. The regular Enchanting Tales printing is CC's plain `Polluted Bonds - Foil`;
only the anime printing carries a word.

**Tom Bombadil (LTR) 685, non-foil.** Saved treatment: `showcase` (Scryfall gives both of LTR's showcase frames the
same flag). Category by name: *The Lord of the Rings: Tales of Middle-earth*. Expected name:
`Tom Bombadil - Showcase`.

| Candidate (non-foil ones pass) | Score | How |
|---|---|---|
| Tom Bombadil - Showcase | **103** | exact expected name +100; showcase found +3 |
| Tom Bombadil - Showcase Scrolls (the right one) | 3 | "Scrolls" is read as the showcase family, so +3 and nothing against |
| Tom Bombadil | −1 | showcase missing |
| Tom Bombadil - Borderless Poster | −3 | borderless not ours −2; showcase missing −1 |
| Tom Bombadil - Borderless Poster (Serialized) | −5 | |

Exact name → **auto**, wrong. The card has nothing that says "Scrolls"; the number 685 would, but CC doesn't put
the number in brackets for this card, so the number plays no part.

### 1.2 The rules behind it, with the lines

All in `src/lib/ccMatch.js` unless said otherwise.

- **Family words swallow their neighbours (confirmed).** `FAMILIES` (lines 144–160) tests each variant string with
  a regex; the showcase one is `/showcase|scrolls/i` (line 150), so "Showcase Scrolls" *is* Showcase, by design
  (the retired export spec 7.4 lists "Showcase Scrolls" and "Anime Borderless" as family synonyms). `wordFamilies`
  (170–172) returns only the families, never what's left of the string.
- **An extra word costs nothing when the string has a family (confirmed).** In `scoreCandidate` the −1 "other
  word" penalty (233–236) applies only to a variant string with *no* family at all ("Gold-Stamped Signature"). A
  string with a family and an extra word ("Anime Borderless", "Showcase Scrolls", "Borderless Poster", "Japan
  Showcase", "Borderless Manga") scores exactly like the bare family word. Our families found score +3 each
  (239–242); theirs we lack −2 (243).
- **The exact expected name wins outright (confirmed).** +100 (244–247). The expected name is the app's guess at
  CC's wording (`expectedName`, 180–187), built from the saved treatments, so an exact hit proves nothing when a
  sibling product shares the family: the card can't tell "Showcase" from "Showcase Scrolls".
- **One candidate left, or a lead of two, is automatic whatever the score (confirmed).** `chooseProduct` lines
  296–301: a single passing candidate is `auto` even at −5; a lead of 2+ is `auto`. The required checks are only
  the finish (200–203) and a bracketed number when the product has one (208–212).
- **The deeper cause (confirmed by the sweep):** a card's traits come from Scryfall (`src/lib/printings.js`
  `magicTraits`, 51–69: `border_color`, `frame_effects`, `full_art`, promo types), and CC's words don't follow
  them. In the bonus sheets (Enchanting Tales, Secret Lair, Multiverse Legends, Breaking News, Through the Ages,
  Marvel Universe) Scryfall flags *every* card borderless or showcase while CC names the regular one plainly; in
  LTR, Fallout, Final Fantasy, Reality Fracture and others, CC splits one Scryfall flag into several products
  (Showcase / Showcase Scrolls / Borderless Poster / Borderless Manga / Anime Borderless). The spec saw this
  (section 3.4: "exact name-building alone can't work") and answered with scoring; scoring is where the guessing
  lives.

### 1.3 Where a wrong product is chosen and written without a person

1. **`chooseProduct` → `auto`** (`ccMatch.js` 297–300) is taken as final by `matchLines` (`src/lib/ccExport.js`
   132–155): `status: 'auto'`, shown in the dialog's **Matched** group, folded shut when there are more than 8
   (`ExportDialog.jsx` 635). Nobody has to look.
2. **The export writes it:** `ExportDialog.jsx` `save` (371–382) sends every Matched line with
   `link: 'auto'` for `by === 'match'` (380); `export_lines` stamps the product onto the line
   (`internal.export_stamp`, 6–18) and the Mass Create file is built from the stamps (`src/lib/massCreate.js`
   114–133). `export_learn` (`supabase/current/internal.export_learn.sql` 7–18) then **remembers it** in
   `cc_product_links` with `source = 'auto'` (line 13 accepts `'staff'` and `'auto'`).
3. **A remembered link is used without scoring, whatever its source:** `ccExport.js` 133–143 returns
   `status: 'auto', via: 'link'` for any link whose product is still in the inventory. So both wrong matches are now
   stored on prod as auto links and will repeat on every export of those two printings until they are forgotten.
   The only way out today is Settings → Crystal Commerce matching → Browse remembered products… → Forget, one row
   at a time (`CcMatchingPanel.jsx` 191–208).
4. **A staff link whose product left the inventory** falls back to a fresh guess (`ccExport.js` 145–153,
   `wasLinked`), which can be `auto`, and `export_learn`'s `on conflict … do update set source = excluded.source`
   (16–18) then **overwrites the staff row as `auto`**. The "Used to be …" note (`ChooseRow.jsx` 147–151) only
   shows when the line lands in Needs a choice, which an auto never does. Confirmed by reading; not seen in dev's
   data (all 376 auto links with lines still point at products in file 33).
5. **The owned-copies counter** (`src/lib/owned.js` 77–105) takes the same `auto` answer for "this printing" and
   the suggested lower rate follows it (decision 448). No write, but a wrong product means a wrong count and rate.
6. **Change on a Matched card confirming the detected product saves nothing** (`ExportDialog.jsx` 176–194,
   `detected` at 179): the line stays `by: 'match'` → `link: 'auto'`. A person's confirmation and a blind guess are
   the same row. Also, 647 passes `r.product` as `detected` for every `status === 'auto'`, so a **remembered staff
   pick** opened with Change is tagged "detected — the product the app matched by itself" (`ChooseRow.jsx`
   102–104).
7. **Import Collection** writes links too, always as `'staff'` (`src/lib/importCollection.js` 446). Out of scope;
   noted because they feed the export.

Nothing in the review dialog's Undo, hold or dry run lets a wrong match through on its own; they move picks a
person made. The dry run saves each pick as it's made (`ExportDialog.jsx` 199–219) and Undo puts the previous link
back, an `auto` one included (262–273): correct for an undo, but it can re-install the guess the worker just fixed.

---

## 2. What the sweep found (dev, read-only)

### 2.1 The data

Pulled with `npx supabase db query --linked` (SELECT only) into `C:\ClaudeProjects\temp\pug-matching\`, never the
repo; Scryfall for the cards' flavor names and current traits; no JustTCG call.

| | Count |
|---|---|
| Magic buy lines on dev (not bulk, with a Scryfall id) | 1,979 (454 walk-in, 1,522 collection, 3 system) |
| Distinct printing + finish | 1,880 |
| Lines already exported on dev | 150 (144 distinct printings) |
| Remembered links on dev | 397: 382 auto, 15 staff |
| Set choices (`cc_set_map`) | 11, all staff |
| Inventory file (current on dev) | `playersuniongames-inventory-search-33.csv`, 153,092 products, 384 categories, uploaded 2026-10-22 |
| Distinct variant strings / foil kinds in it | 1,168 / 47 |
| Products with a bracket: a number / something else | 7,663 / 1,834 (505 distinct non-number brackets) |
| Duplicate name + category pairs | 69 (always a choice already) |
| Scryfall cards fetched (26 requests of 75) | 1,853, all found |

Every line was run through `categoryFor`, `searchCategories` and `chooseProduct` exactly as `matchLines` does
(same candidate query shape, same flavor-name and front-face keys, same home-shelf penalty), with the remembered
links set aside so the matcher itself is measured. The script and its results stay in the temp folder
(`sweep.mjs`, `rules.mjs`, `sweep-results.json`).

### 2.2 What the matcher does today

Per distinct printing and finish (1,880):

| Today's answer | Printings | Share |
|---|---|---|
| auto by the exact expected name | 1,627 | 86.5% |
| auto because one candidate passed the checks | 118 | 6.3% |
| auto by a lead of 2+ points | 69 | 3.7% |
| **auto in all** | **1,814** | **96.5%** |
| choose | 51 | 2.7% |
| none (no product of that name: can't upload) | 15 | 0.8% |

Category step: 1,523 by the set's own name, 230 by a rule, 52 by promo kind, 35 by a staff choice, 40 with no
category (32 sets, Appendix D.2; those always go to Needs a choice, which is right).

**Of today's 1,814 automatic answers, 346 carry at least one sign of uncertainty** (a printing can carry several):

| Sign (the two reported cards' are marked ◀) | Autos |
|---|---|
| A plain product of the same name and finish also passes while the card has treatments: CC may name our printing plainly, as in Enchanting Tales ◀ | 205 |
| Picked by a lead of points, no exact name ◀ | 69 |
| Our *borderless* isn't on the pick | 50 |
| Another passing product shares one of our families (Showcase vs Showcase Scrolls) ◀ | 44 |
| Our *thelist* isn't on the pick (The List cards filed plainly or under Mystery Booster) | 31 |
| Our *full art* isn't on the pick | 21 |
| Our *showcase* isn't on the pick ◀ | 16 |
| The pick carries a word with no family ("Theme Booster Exclusive", "Future Frame", "White Border") | 15 |
| Our *retro* / *bundle* / *buy-a-box* / *extended art* isn't on the pick | 11 / 10 / 2 / 1 |
| The pick's own word is a family we don't have (a lone "Showcase" product for a borderless card) | 5 |
| The pick carries a family word plus an extra word ("Anime Borderless", "Showcase Scrolls") ◀ | 4 |
| A rival differs from the pick only by an extra word ◀ | 3 |

### 2.3 Ground truth

- **Staff links (dev's 15, 14 with lines):** the matcher agrees with all 12 where it answers automatically. The
  other 2 it sends to a choice because staff picked a product of another finish (Rin and Seri M21 278 foil → the
  non-foil product; Silvar C20 15 non-foil → the Foil product). **No confirmed wrong guess on dev**, but dev holds
  almost no staff picks to test against; the two confirmed wrong guesses are prod's.
- **Auto links (376 with lines):** every one equals what the matcher picks today, so the inventory hasn't drifted
  under them. The recommended rule would have sent **53** of them to a person instead.
- **Already exported on dev (144 printings):** every stamp equals today's pick; the recommended rule would have
  asked about **16**.
- **Treatments drift:** for 10 printings Scryfall no longer reports a treatment saved at the buy (seven special
  foils, Appendix D.3). The matcher uses the saved treatments, so a card's match can depend on when it was bought.

### 2.4 The inventory's words (the owner's "weight scroll and anime")

Of 1,168 distinct variant strings, **82 contain a family word plus something extra** that the matcher charges
nothing for. The ones that matter, by products carrying them (full list in Appendix C.1):

| String | Products | Read today as | Extra word(s) |
|---|---|---|---|
| Showcase Scrolls | 700 | Showcase | Scrolls |
| Japanese Alternate Art | 393 | Japanese | Alternate Art |
| Anime Borderless | 120 | Borderless | Anime |
| Textless Player Rewards | 50 | Textless | Player Rewards |
| Borderless Manga | 48 | Borderless | Manga |
| Borderless Poster | 40 | Borderless | Poster |
| Japan Showcase | 40 | Showcase | Japan |
| Dark Frame Promo Pack | 30 | Promo Pack | Dark Frame |
| Borderless Poster (Serialized) | 20 | Borderless, Serialized | Poster |
| Prerelease Promo (Dated Stamped) | 8 | Prerelease | Dated Stamped |
| Sketch Showcase | 7 | Showcase | Sketch |
| Reversible Borderless | 6 | Borderless | Reversible |

Strings with no family at all (−1 today) are led by Gold-Stamped Signature (1,183 products), Modern Frame (297),
Future Frame (237), Planeswalker Deck Exclusive (203), Theme Deck Exclusive (141), DCI Judge Promo (134), Dark
Frame Promo (130), White Border (120) (Appendix C.2). The "Retro Schematic" of Brothers' War Retro Artifacts reads
as the retro family (`/retro (frame|schematic)/`, line 151) the same way Scrolls reads as showcase; the sweep has
no BRR line to show it (BRR has no category on dev), so that one is plausible, not confirmed.

Foil kinds are read correctly (47 kinds, the parser finds the kind wherever it sits); the finish check lets any
non-etched foil kind pass for a foil line at −1 (`ccMatch.js` 202, 223–224), so a plain-foil card whose only foil
product is "Surge Foil" is auto today (3 such printings on dev, all Secret Lair / Aetherdrift, where CC does name
the only foil that way).

### 2.5 Prod's remembered links

Read after the scan, from the session that started it, with the one SELECT in Appendix B (`cc_product_links` only;
nothing written on prod). The evidence against each link comes from dev's copy of the same inventory file (33).

| Source | Links |
|---|---|
| auto (the app's own match, remembered by `export_learn`) | 283 |
| staff (picked in the review, or in Browse remembered products…) | 20 |
| total | 303 |

All 303 were made between 2026-10-20 and 2026-10-22, the three days of exports since launch, and every linked
product exists in file 33. Of the 283 auto links: 6 point at a product with a word the matcher can't read (`Future
Frame` twice, `White Border`, `Showcase Scrolls`, `Anime Borderless`, `Gemrazer`); 56 at a product with a trait word
while a plain product of the same name and finish exists (the Enchanting Tales shape); 15 at one whose same-finish
sibling shares its words; 4 at one whose sibling differs only by an extra word; 83 at the only product of that name
and finish in its category. The rest sit among several siblings the matcher told apart by number or foil kind.
Every auto row is in Appendix B with a right/wrong box; the 20 staff links are listed there too.

**Polluted Bonds (WOT) 34, foil:** on prod as reported, `source = 'auto'` → `Polluted Bonds - Foil - Anime
Borderless`, linked 2026-10-22 at 12:16 PM (Appendix B row 230). It repeats on the next export until forgotten
(item 3).

**Tom Bombadil (LTR) 685, non-foil: not on prod under its printing.** LTR 685's Scryfall id is `dba0b072-…`
(checked against Scryfall on 2026-10-23: showcase frame, promo types `scroll` and `silverfoil`), and prod has no link
for it. What prod has, both from the same export as Polluted Bonds (12:16 PM, 2026-10-22):

| Printing | Linked to | Source |
|---|---|---|
| Tom Bombadil (LTR) 234, the regular card (`2ab04c49-…`) | `Tom Bombadil` | auto |
| Tom Bombadil (LTR) 331, the showcase frame without the scroll (`3c7ce623-…`) | `Tom Bombadil - Showcase` | **staff** |

Two readings, and only the owner can tell which. (a) The exported line was recorded at the buy as LTR 331 (dev's
copy of that printing carries `borderless` and `showcase`, so the matcher ties `Showcase`, `Showcase Scrolls` and
`Borderless Poster` at 2 points each and asks); the pick in the review went to `Tom Bombadil - Showcase`, first in
the list by name, and was saved as a staff pick; the card in hand was the 685 scroll, so the 331 link is wrong.
(b) The line was LTR 685, its auto link was already forgotten in the app during the audit, and the 331 staff link is
right for a different card. Either way, item 3's prepared statement finds no row for `dba0b072`, and a wrong
**staff** link is caught neither by item 2 (which trusts staff links) nor by item 5's clean-up (which deletes auto
links). What to do, on the live site: Settings → Crystal Commerce matching → Browse remembered products… → search
"Tom Bombadil", read which printings are linked, and Forget `Tom Bombadil - Showcase` if the card the store sold
was the scroll. Section 1.1's reproduction stands for LTR 685 on dev. The lesson for the plan belongs with item 6,
the review dialog: a tie between two names that differ by one word is not a one-click pick, and the review must
show the difference.

**Prod's 283 auto links under the rules.** Each linked printing was fetched from Scryfall, rebuilt as a line and
run through the matcher and each candidate rule against dev's copy of file 33 (`prod-rules.mjs` in the temp
folder; dev's set choices stood in for prod's, which weren't read). Today's matcher still picks the linked product
for 282 of the 283 (the one exception, Ancient Stirrings (SLP) 50 foil, has no category on dev's set choices).

| Rule | Prod auto links it would have refused | Of those, right by Scryfall's facts |
|---|---|---|
| 3b (every plain sibling blocks) | 65 | 63 |
| 4 (3b without the plain-sibling guard) | 20 | 18 |
| **5 (recommended; 4 plus nested words)** | **9** | 7, all settled by the new Scryfall-backed families (`scroll`, `poster`, `future` frame, white border) |
| 5 with the new families | **2** | 0 |

The two that nothing settles are the mistakes:

| Verdict | The case |
|---|---|
| Confirmed wrong | Polluted Bonds (WOT) 34 foil → `Polluted Bonds - Foil - Anime Borderless` (Appendix B row 230): "Anime" is an extra word on our borderless |
| Likely wrong, check in CC | Serra Ascendant (PLST) M11-28 → `Serra Ascendant (PAGL) - The List`: CC's bracket names another List printing (ours is M11); The List's only product of that name, so the matcher took it. If CC doesn't carry the M11 List printing, the card should have been Can't upload |

So the inventory most likely received one more wrong card than reported, Serra Ascendant, and the other 281 stand:
the 63 that rule 3b refused were variant products in regular sets beside a plain sibling (CC names those
variants there), Mystical Archive English cards, foil kinds Scryfall's special-foil flag confirms, Mystery Booster
2 reprints Scryfall's frame and border confirm, scroll and poster printings Scryfall's promo types confirm, and
plain picks that only missed the exact name through an accent or a two-faced name. Appendix B.2 lists rule 4's 20
with each one's reason, and which of them rule 5 and the new families settle.

---

## 3. The "never guess" rule: five definitions, one recommendation

Measured on the same 1,880 printings, and on prod's 283 remembered auto matches. None of the rules ever picks a
*different* product than today's matcher (checked: 0 disagreements); they only turn an automatic answer into a
choice. Every one of them sends both reported cards to Needs a choice; they differ in how many right matches they
send along with them, which is what decided the recommendation.

| Rule | Auto | Choose | None | Of today's 1,814 autos sent to a person (dev) | Of prod's 283 remembered auto matches refused | What it still risks |
|---|---|---|---|---|---|---|
| **1. One candidate only.** Auto only when exactly one product of the name passes the finish and number checks (in the card's own category; the same-shelf one only when its own has none). Scores only order the radio buttons. | 1,175 | 690 | 15 | 639 (35%) | 196 | Nothing by choice; a lone product that isn't ours (CC doesn't carry our printing) is still taken, as it is today |
| **2. Exact name, no rival sharing a family.** Rule 1, or the exact expected name when no other passing product shares one of our families or differs from our words only by an extra word. | 1,716 | 149 | 15 | 98 (5%) | — | Refuses a surge-foil card beside its plain-foil sibling (they share Borderless) for nothing |
| **3b. Exact name, every rival clearly another printing, a plain sibling always blocks.** Rule 1, or the exact expected name when every other passing product shows a trait the card doesn't have or is the same words in another foil kind; a plain product, a "same words plus an extra word" product and a no-family word all block. A lone candidate with a word we can't read is a choice. | 1,567 | 298 | 15 | 247 (14%) | 65, of which 63 were right | The first draft of this report recommended it; the owner judged the cost too high for what it catches |
| **4. As 3b, without the plain-sibling guard.** A plain sibling, or one with fewer of our words, no longer blocks an exact match; an extra word on our own words, or a no-family word, still does. | 1,767 | 47 | 15 | 47 (2.6%) | 20, of which 18 were right | The theoretical shape in which CC names the regular printing plainly *and* sells an exact "X - Showcase" product of another printing of the same card in the same category: not seen in any category the 2,100 printings touched |
| **5. As 4, plus nested words** *(recommended)*. With no exact name, when the leader shows only traits the card has and every remaining rival is plain or a strict subset of the leader's words (plain ⊂ "Showcase" ⊂ a borderless + showcase card), the fullest is taken. | 1,788 | 26 | 15 | **26 (1.4%)**; 16 once the new families are in | **9**; **2** once the new families are in, and those 2 are the mistakes | The same theoretical shape as rule 4, extended to a card with two traits and a one-word product |

Every rule sends both reported cards to a person, and none of them ever picks a *different* product than today's
matcher (checked: 0 disagreements); they only turn an automatic answer into a choice. 3c (a lone candidate whose
words contradict the card's: +84 on dev) and "a lone candidate in another foil kind is a choice" (+3) were measured
too and are kept as switches in item 7.

**Which part of the rule costs what.** The owner's question, answered on dev's 1,814 automatic matches and prod's
283 remembered ones:

| Part | Catches a known mistake? | Extra manual picks (dev history / prod links) | Kept? |
|---|---|---|---|
| An extra word on our own family blocks the match ("Anime Borderless", "Showcase Scrolls", "Borderless Poster", "Japan Showcase" for a borderless or showcase card) | **Yes, both reported cards** | 7 / 4, of which 4 / 3 settle once `scroll` and `poster` are families | Yes |
| Bracket evidence: unnumbered products drop out when one carries our number; a set-code bracket that isn't our number's prefix is another printing | **Yes, Serra Ascendant (PLST) M11-28** | 3 / 1 | Yes |
| A lone candidate with a word the matcher can't read is a choice ("Theme Booster Exclusive", "Future Frame", "WPN25") | No | 14 / 3, of which 6 / 3 settle once `future` frame and white border are families; most of the rest have a Scryfall promo type too (`planeswalkerdeck`, `openhouse`, `storechampionship`, `wizardsplaynetwork`) | Yes, and add those families |
| A no-family word on a rival blocks ("Stained Glass", "Shattered Glass", "Display Commander - Thick Stock", "Neon Ink Blue") | No | 4 / 0 | Yes (cheap; `neonink` and `shatteredglass` exist on Scryfall too) |
| No exact name and several remain, without nested words (rule 4 vs 5) | No | 21 / 11 | **No** (rule 5) |
| A plain sibling always blocks (rule 3b vs 4) | No | 221 / 45 | **No** |
| 3c, lone candidate contradicting the card | No | 84 / — | No (switch) |

**Recommendation: rule 5, with the Scryfall-backed families of item 1.** It refuses both reported cards and the
Serra Ascendant link, asks about 26 of dev's 1,814 automatic matches (16 with the families, falling further as the
promo-type families come in), and on prod's history asks about nothing that was right. Its residual risk is one
theoretical shape (rule 4's row) that no category touched by these 2,100 printings shows; if it ever appears, the
Crystal Commerce audit catches it once and the staff pick is remembered.

Where rule 5's 26 fall on dev's history: 14 lone promo or frame products with a word the app can't read (6 of them
Mystery Booster 2's Future Frame and White Border, settled by the new families; 8 promo products in Unique & Misc.
Promos, Ravnica Allegiance, Throne of Eldraine, Commander Legends and Theros Beyond Death), the two reported cards,
Defense of the Heart (WOT) 80 (the anime printing, "Anime" an extra word), Rosie Cotton and You Cannot Pass! (LTR
Showcase Scrolls, settled by `scroll`), Gollum (LTR) 801 (settled the same way), Goblin Matron and Rampant Growth
(The List, CC's set-code bracket not ours), and four cards whose rival carries a no-family word (Kiora's Stained
Glass, Ratchet's Shattered Glass, Chishiro's Display Commander, Traveling Chocobo's Neon Ink Blue). The full list,
with what rule 4 alone would add, is Appendix A.

---

## 4. The plan, in order, each item shippable on its own

Each item says what changes, where, the tests to add in `tests/`, whether it needs a migration, and what it costs
the staff. Decision rows start at **484** in `docs/DESIGN_SPEC.md`.

### Item 1 — The never-guess rule (code only; the P0)

**Rule changed:** `chooseProduct` returns `auto` only under rule 3b (section 3); everything else is `choose`. The
ranking stays, so Needs a choice lists the likeliest first.

**Files and functions:**
- `src/lib/ccMatch.js`:
  - `FAMILIES`: each family gets its *canonical CC spellings* beside the regex (Borderless; Showcase; Extended Art;
    Retro Frame; Full Art; Serialized, Serial Numbered; Prerelease Promo, Pre-Release Promo; Promo Pack; The List;
    Buy-a-Box Promo; Bundle Promo, Bundle; Textless; Japanese, Japanese Alternate Art, JP Alternate Art). The
    showcase regex drops `scrolls` (line 150) and the retro regex drops `schematic` (151): those become extra
    words.
  - New `extraWords(variant)`: the variant string with its families' canonical spellings and brackets removed;
    what's left are the extra words. `readVariant(cand)` → `{ families, extra, other }` (other = a string with no
    family).
  - `scoreCandidate`: **−3 per variant string with extra words** (so "Anime Borderless" nets 0 for a borderless
    card, below the plain product's 0 tie or above nothing), the existing −1 for a no-family string, and a
    **non-number bracket that isn't our number's prefix counts as an extra word** (today −1, lines 213–218).
  - `chooseProduct` (rule 5, section 3): after the required checks, thin the pool as the matcher already does
    (unnumbered products when one has our number, 288–295; set-code brackets that aren't our prefix); set aside
    every rival that is clearly another printing (it shows a family we lack, or it is the same or fewer of our
    words in a foil kind other than `expectedFoilKind`); then `auto` iff (a) one candidate remains, or (b) the
    leader is the exact expected name and every remaining rival is plain or a subset of our words, or (c) the
    leader shows only families we have and every remaining rival is plain or a strict subset of the leader's
    words (plain ⊂ "Showcase" ⊂ a borderless + showcase card: the fullest is taken). A rival that adds an extra
    word to our own words ("Showcase Scrolls" for a showcase card, "Anime Borderless" for a borderless one), or
    carries a word with no family, is never set aside and blocks (b) and (c); a chosen candidate that itself
    carries such a word is a choice. Else `choose`. The 2-point lead goes.
  - The same-shelf rule (The List ↔ Mystery Booster) keeps the owner's 2026-10-14 decision: the home category's
    pool decides; the other shelf only when home has nothing.
  - **New families with real evidence, from Scryfall** (confirmed on the cards behind prod's links): promo type
    `scroll` → "Showcase Scrolls" (Tom Bombadil 685, Elven Chorus 611 and Rosie Cotton 478 all carry it; the
    ring-frame 331 doesn't), `poster` → "Borderless Poster", `japanshowcase` → "Japan Showcase"; frame `future`
    → "Future Frame" and border `white` → "White Border" (Mystery Booster 2's reprints). `magicTraits`
    (`src/lib/printings.js` 51–69) saves them on new lines; for lines already bought, `matchLines` reads them off
    the Scryfall card it fetches anyway (`ccExport.js` 97, `cards`). With these, Tom Bombadil 685 matches
    "Showcase Scrolls" on evidence and "Showcase" becomes clearly another printing, and the LTR, Hobbit and
    Mystery Booster 2 cards in Appendix A stop asking. The Enchanting Tales anime cards stay a choice: Scryfall
    marks the regular ones borderless + showcase and the anime ones borderless only, which is set knowledge, not a
    word on the product.
  - **Three exact-name misses to fix with it** (confirmed on prod's links): the comparison (`collapse`, line 189)
    doesn't fold accents, so "Glóin, Dwarf Emissary" never equals CC's "Gloin"; a two-faced card found by its
    front (270–273) still expects its full name, so "Emeritus of Ideation // Ancestral Recall" never matches
    CC's "Emeritus of Ideation"; and `numbered` (275) puts the collector number into the expected name whenever
    any sibling has a bracket ("Mines of Moria (0342) - Borderless"), so the unnumbered plain product can never be
    exact. Each sends a certain card to staff for nothing. Fix: `fold` for the comparison, the front face as the
    expected name when matched by it, and the number only when a candidate carries ours.
- `README.md` "Picking the product" (1423–1445) and the four steps (1395–1402) describe "exact wins outright" and
  "leads by 2 points": **Help is out of date after this item** (flag only; edit when asked).
- `docs/DESIGN_SPEC.md`: decision 484 (the rule), 485 (extra words and canonical spellings), amending 174.

**Tests to add (`tests/ccMatch.test.js`), each asserting `status`:**
- Polluted Bonds, the five WOT products, foil and non-foil line with `['borderless','showcase']` → `choose`, and
  the ranking puts the plain product no lower than the Anime one.
- Tom Bombadil, the ten LTR products, non-foil `['showcase']` and foil → `choose`.
- "X" and "X - Borderless Manga" with `['borderless']` → `choose` (the mirror of WOT: here the variant is ours).
- "X - Showcase" and "X - Showcase Scrolls", `['showcase']` → `choose`; `wordFamilies('Showcase Scrolls')` still
  `['showcase']`, `extraWords` → `['Scrolls']`.
- Positive controls stay `auto`: Chrome Host Seedshark × 4 (every finish and treatment), Fabricate (2090) and its
  Rainbow Foil, Generous Gift (2088), Brazen Borrower, the flavor-name TMNT card, the Homura flip card,
  "Cecil - Surge Foil - Borderless" over "- Foil - Borderless" for a `surgefoil` line.
- A lone "X - Theme Booster Exclusive" for a plain card → `choose`; a lone "X (A)" with a plain "X" → `choose`
  (bracket as an extra word); a lone "X - Showcase" for `['borderless','showcase']` → `auto` under 3b (flip
  `tests/ccMatch.test.js` 87–88 only if 3c is chosen).
- "Swiftfoot Boots - The List" and "Swiftfoot Boots (M12) - The List" for PLST A25-234 → `auto` (set-code bracket
  thins the pool).
- Tom Bombadil 685 with promo type `scroll` → `auto` "Tom Bombadil - Showcase Scrolls"; LTR 331 without it →
  `choose`. "Gloin, Dwarf Emissary" matched exactly by "Glóin, Dwarf Emissary"; "Emeritus of Ideation //
  Ancestral Recall" matched exactly by CC's "Emeritus of Ideation"; "Mines of Moria - Foil" for LTR 257 foil
  `auto` beside "Mines of Moria (0342) - Foil - Borderless".

**Migration:** none. **Cost to staff:** 26 of the 1,814 cards the app matches by itself on dev's history go to
Needs a choice once each (1.4%), 16 once the Scryfall-backed families are in; on prod's 283 remembered auto matches
the rule asks about 9, 2 once the families are in, and those 2 are the mistakes. Each is then remembered as a staff
pick. **Verify before shipping:** run the sweep script against the new build (`node sweep.mjs` in the temp
folder reads the repo's `src/lib`) and confirm 0 disagreements and the counts above.

### Item 2 — Matches the app made by itself are neither trusted nor remembered (code only)

**Rule changed:** a remembered link is used only when a person made it. Automatic matches are not saved.

**Files:** `src/lib/ccExport.js` `matchLines`: keep a link only if `source === 'staff'` when building `links`
(line 88) so an `auto` row is ignored even if one exists (old rows, a restored backup). `ExportDialog.jsx` 380:
`link: s.by === 'staff' ? 'staff' : null` (an automatic match sends no link, and `export_learn`'s
`where e ->> 'link' in ('staff','auto')` then writes nothing without a database change). `MatchCardDialog.jsx`
and Import Collection already save `'staff'`. `CcMatchingPanel.jsx` 110–120: the Products text and the "Matched
by the app" row (it will read 0 after item 5; say "Picked by staff" only). `scripts/db-test-run.sql` 2257–2262
asserts an `auto` row is written: change that check to "no row for the automatic match". New pure helper
`usableLink(link)` in `ccMatch.js` with a unit test (`matchLines` itself needs Supabase and has no test).

**Tests:** `usableLink({ source: 'auto' })` false, `'staff'` true; `tests/export.test.js`: the matches payload
built from a dialog state has `link: null` for `by: 'match'`.

**Migration:** none for the behaviour. **Cost:** none visible; a product CC renames (same Product ID) is found
by a staff link as before and by the matcher otherwise. **Why not keep auto links and re-score them:** a link the
app must re-check every time is a link that does nothing; the rows only freeze mistakes.

### Item 3 — Today's two wrong links and stamps on prod (owner's actions)

**Right away, in the app on the live site** (a store action, no SQL): Settings → Crystal Commerce matching →
Browse remembered products… → search "Polluted Bonds" → Forget the row tagged *automatic* for `Polluted Bonds -
Foil - Anime Borderless` (foil); search "Tom Bombadil" → Forget `Tom Bombadil - Showcase` (non-foil). Each needs a
picked user and is logged (decision 412). The next export of either printing asks.

**Or, a prepared statement, to run only on the owner's word, nobody ran it tonight** (`npx.cmd supabase db query
--linked --project-ref zvxquzcfffmxwizonxuo "…"` in PowerShell). The ids are the printings' Scryfall ids (the same
on dev, where both printings were also bought):

```sql
delete from cc_product_links
 where source = 'auto'
   and (scryfall_id, finish) in (('e15e0521-1abf-4426-9f31-4081f068b184', 'foil'),      -- Polluted Bonds (WOT) 34
                                 ('dba0b072-65a1-4202-a9e0-e77466bb78ba', 'nonfoil'));  -- Tom Bombadil (LTR) 685
```

**Checked against prod after the scan (section 2.5):** the statement above finds Polluted Bonds and nothing for
Tom Bombadil, because prod has no link for LTR 685. The `Tom Bombadil - Showcase` link prod holds is a *staff*
link for LTR 331 (`3c7ce623-bcf8-4d42-8a88-450bea7d7529`), which a `source = 'auto'` delete never touches. Look
first in Browse remembered products…, and Forget it there once it is known to be wrong; nobody deletes a staff
link by statement on a guess.

**The stamps:** the two exported lines on prod carry the wrong `cc_product_id`, `cc_product_name` and
`cc_category` in `buy_lines`; EXPORT on that day ("the same file again", decision 361) would write the wrong rows
again. CC itself was corrected by hand in the audit. Leave the stamps unless that day's file must be
re-downloaded; if it must, look first (`select id, cc_product_name, cc_custom_sku from buy_lines where scryfall_id
in (…) and cc_status = 'exported'`) and set the two lines to the right products (on dev's copy of file 33:
`2116874` `Polluted Bonds - Foil`, `2165097` `Tom Bombadil - Showcase Scrolls`; check the ids against prod's
current file with `cc_products_by_id` first). Not part of the morning's work unless the owner wants it.

### Item 4 — A remembered pick whose product left the inventory goes to Needs a choice (code only)

**Rule changed:** `wasLinked` lines are a choice, never an automatic match, and a person's row is never
overwritten by the app's answer. **Files:** `src/lib/ccExport.js` 145–153: when `link && !linkedProduct`, status
`choose` with `wasLinked` set (the "Used to be …" note in `ChooseRow.jsx` 147–151 then shows). With item 2 in,
`export_learn` can no longer write `auto` over a staff row; item 5 closes it on the database side too. **Tests:**
none possible for `matchLines` under Node; a `ChooseRow` note is visual. **Cost:** a card or two after each new
inventory, if CC drops a product. **Migration:** none.

### Item 5 — Migration 0010: the database side (dev and prod in one sitting, store closed, after 9:30 PM)

- `internal.export_learn`: accept `'staff'` only (`where e ->> 'link' = 'staff'`), patched from
  `supabase/current/internal.export_learn.sql`.
- One-time clean-up: `delete from cc_product_links where source = 'auto'` (dev: 382 rows; prod: the count from
  Appendix B). The certain ones re-match identically under item 1; the uncertain ones are exactly the cards that
  should ask. Keep the `source` check constraint as it is: a backup from before this holds `auto` rows and
  `restore_rows` must still take them (item 2 makes them inert).
- `scripts/db-test-run.sql` 2257–2262: the check becomes "the staff pick is remembered; the automatic match is
  not".
- The usual steps (CLAUDE.md, Database): pug-reviewer review, `begin; … rollback;` rehearsal (no sequence is
  touched), `db push --linked`, snapshot, test run, then prod and the structure-only compare, decision 486. The
  owner picks the moment.

**Cost:** none to staff. A Settings panel row reads 0 until item 2's text change.

### Item 6 — The review dialog (code only, small)

- `ExportDialog.jsx` 647: pass `detected` only when `r.via === 'match'`, so a remembered staff pick isn't tagged
  "detected".
- Change confirming the detected product: today it records nothing (176–194). Owner's call: keep (Change is for
  typing Sell prices, 2026-10-01) or treat Done on the detected product as a staff confirmation (saved as
  `'staff'`). Recommendation: keep as is, since under item 1 an automatic match is already a certain one.
- Ranking inside Needs a choice follows item 1's scores, so the plain product sits above the "Anime" one for an
  Enchanting Tales card. Nothing is pre-selected (as today).
- `docs/TEST.md`: a case for the export dialog, "a card whose category has a same-family sibling product (Showcase
  / Showcase Scrolls) lands in Needs a choice; picking it is remembered as *picked*".

### Item 7 — Stricter switches, each one line in `chooseProduct`, with what they cost on dev's history

Section 3 measured these and the owner judged the cost too high for what they catch (none of them catches a
known mistake). Kept here in case a new kind of mistake turns up:

- **The plain-sibling guard** (rule 3b): a variant product never wins while a plain product of the same name and
  finish also passes. +221 choices over rule 4 on dev; on prod it refused 45 links that were all right.
- **No nested words** (rule 4 instead of 5): a two-trait card never takes a one-word product ("Beorn the Fierce -
  Showcase" for a borderless + showcase card) without an exact name. +21 on dev, +11 on prod, all right.
- **3c:** a lone candidate whose words contradict the card's treatments is a choice (+84).
- A lone candidate in another foil kind than ours is a choice (+3).
- The Japanese family in one direction only: a product without a Japanese word is clearly another printing for a
  `lang = 'ja'` card (Scryfall's language is reliable), so "X" and "X - Japanese Alternate Art" resolve for a
  Japanese card. Saves the Mystical Archive cards a choice each. (A loosening, not a tightening; worth having.)

### Item 8 — Not changed, on purpose

- The category step: no wrong category was found (every answer must exist in the inventory; 35 staff choices and
  230 rule answers all read right in the sweep). A wrong category would still produce a lone candidate under
  rule 3b; nothing tonight suggests one.
- Import Collection's matcher (`src/lib/importMatch.js`): out of scope by the owner's answer; it penalises a foil
  mismatch −3 where the export's scorer gives −1, so the two scorers disagree on weights (plausible issue, later).
- The treatments drift (Appendix D.3): a Scryfall data matter; the matcher should keep using the saved treatments.

---

## 5. Findings, ranked (confirmed = traced to the line and reproduced; plausible = read, not seen in data)

1. **Confirmed, high.** A family word with a qualifier scores as the bare family: `wordFamilies` (ccMatch.js
   170–172), the −1 at 233–236 only for no-family strings. Polluted Bonds reproduced (score 4 vs 0). Item 1.
2. **Confirmed, high.** The +100 exact name (244–247) decides between products the card can't tell apart; the
   showcase regex swallows "scrolls" (150). Tom Bombadil reproduced (103 vs 3). Item 1.
3. **Confirmed, high.** A lone passing candidate is auto at any score (297); a lead of 2 is auto (298–300).
   118 + 69 of dev's printings; `tests/ccMatch.test.js` 87–88 asserts a lone under-explained product is auto.
   Item 1.
4. **Confirmed, high.** Automatic matches are remembered (`export_learn.sql` 13; `ExportDialog.jsx` 380) and a
   remembered link is used without scoring whatever its source (`ccExport.js` 133–143). Both wrong matches are
   stored on prod. Items 2, 3, 5.
5. **Confirmed, medium.** A staff link whose product left the inventory is replaced by a fresh guess that
   overwrites the staff row as `auto` (`ccExport.js` 145–153; `export_learn.sql` 16–18). Item 4.
6. **Confirmed, medium.** The finish check passes any non-etched foil kind at −1 (202, 223–224): a plain-foil card
   whose only product is "Surge Foil" is auto. 3 on dev. Item 7.
7. **Confirmed, medium.** A non-number bracket costs −1 (213–218), less than a no-family word: "X" wins over
   "X (A)" / "X (No PW Symbol)" by the exact name. Item 1 (bracket as an extra word).
8. **Confirmed, medium.** A lone candidate from the same-shelf category can be auto at −5 with three strikes
   (281–283, 297). Within the 2026-10-14 decision; rule 3b's pool keeps the home category first. Item 1.
9. **Confirmed, low.** Change confirming the detected product saves nothing; a remembered staff pick is tagged
   "detected" (`ExportDialog.jsx` 179, 190, 647). Item 6.
10. **Confirmed, low.** The owned-copies counter follows the same guess (`owned.js` 82). Item 1 fixes it; expect
    more n/a → "(click to match)" (decision 470) for a while.
11. **Confirmed, low.** `export_learn`'s `distinct on … order by staff desc` is sound; the dialog applies a pick to
    every line of the printing, so a key can't be half staff, half auto; `via: 'link'` lines are never re-learned.
    No change.
12. **Confirmed, low.** The tests cover none of the above; `scripts/db-test-run.sql` 2257–2262 asserts the auto
    link that item 2 removes. Items 1, 2, 5.
13. **Plausible.** "Retro Schematic" (BRR) reads as the retro family like "Scrolls" reads as showcase (151); no BRR
    line on dev to show it. Item 1 covers it.
14. **Plausible.** Undo in the dry run re-installs a previous `auto` link (`ExportDialog.jsx` 262–273); harmless
    after item 2.
15. **Plausible.** The import's and the export's scorers weigh a foil mismatch differently (−3 vs −1). Later.
16. **Confirmed, medium.** Scryfall carries the evidence the matcher lacks and the app throws it away: promo types
    `scroll`, `poster` and `japanshowcase`, the `future` frame and the white border are on the cards (prod's 298
    linked printings: `scroll` 4, `poster` 10, `japanshowcase` 2, `future` 9, white 42) and `magicTraits`
    (`printings.js` 51–69) keeps none of them, so "Showcase Scrolls", "Borderless Poster", "Japan Showcase",
    "Future Frame" and "White Border" can only ever be extra words. Item 1.
17. **Confirmed, low.** Three ways a right product misses the exact name and goes to staff for nothing: accents
    (`collapse`, `ccMatch.js` 189: "Glóin" vs CC's "Gloin"), a two-faced card found by its front but expected under
    its full name (270–276), and the collector number forced into the expected name by any numbered sibling
    (275: "Mines of Moria (0342) - Borderless" makes "Mines of Moria - Foil" inexact). Item 1.

Checked and sound: `parseProductName` on "(A)", "(No PW Symbol)", "(Gold-Stamped Signature)", "Foil Prerelease
Promo", double spaces, "// " names, flavor names, variant-first foils (15/15 unit tests pass today); `normNumber`
("0008" = "8", "8a" = "08a", "CMA-216" = "cma-0216"); the −4 unnumbered rule and the home −2 with both categories
present; `export_check` refusing a product not in the current file; `export_stamp` copying CC's exact text;
`categoryFor` requiring every answer to exist in the inventory.

---

## Appendix A — Today's automatic matches that rule 4 sends to a person (47 printings, dev); the 21 marked "nested words" pass under rule 5, the 10 marked "settled" once the Scryfall-backed families are in

The two reported cards first, then by set. "Today's pick" is what the app matches by itself today, with its score;
the runner-up is the next passing product. None of these is known to be wrong except the two reported; each is a
card the matcher cannot tell from a sibling product with what it knows.

| Card (treatments) | Today's pick (score) | Runner-up (score) | Why it is a guess |
|---|---|---|---|
| **Tom Bombadil (LTR) 685** (reported) (showcase) | Tom Bombadil - Showcase (103) | Tom Bombadil - Showcase Scrolls (3) | a rival shares a family of ours; a rival differs only by an extra word; a plain product also fits (CC may name our printing plainly). Settled by the new Scryfall families. |
| **Polluted Bonds (WOT) 34 *F*** (reported) (borderless, showcase) | Polluted Bonds - Foil - Anime Borderless (4) | Polluted Bonds - Confetti Foil - Anime Borderless (1) | partial word on the pick; our showcase not on the pick; a rival shares a family of ours; a rival differs only by an extra word; a plain product also fits (CC may name our printing plainly). |
| Aveline de Grandpré (ACR) 135 (borderless, showcase) | Aveline de Grandpre - Showcase (2) | Aveline de Grandpre (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Ratchet, Field Medic // Ratchet, Rescue Racer (BOT) 2 *F* | Ratchet, Field Medic // Ratchet, Rescue Racer - Foil (102) | Ratchet, Field Medic // Ratchet, Rescue Racer - Foil - Shattered Glass (1) | several products pass. |
| Deadly Rollick (CMM) 695 (borderless, fullart) | Deadly Rollick - Borderless (2) | Deadly Rollick (-2) | our fullart not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Khalni Heart Expedition (CMR) 428 | Khalni Heart Expedition - Theme Deck Exclusive (-1) | — | unexplained word on the pick. |
| Oko, the Trickster (ELD) 309 *F* | Oko, the Trickster - Foil Planeswalker Deck Exclusive (1) | — | unexplained word on the pick. |
| Evendo, Waking Haven (EOE) 279 (borderless, showcase) | Evendo, Waking Haven - Borderless (2) | Evendo, Waking Haven (-2) | our showcase not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Traveling Chocobo (FIN) 406 *F* (borderless) | Traveling Chocobo - Foil - Borderless (105) | Traveling Chocobo - Foil - Borderless - Neon Ink Blue (4) | a rival shares a family of ours; a plain product also fits (CC may name our printing plainly). |
| Curse-Marred Demon (FRA) 328 (borderless, fullart) | Curse-Marred Demon - Borderless (2) | Curse-Marred Demon (-2) | our fullart not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Dark Matter Manipulator (FRA) 340 (borderless, showcase) | Dark Matter Manipulator - Showcase (2) | Dark Matter Manipulator (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Hungering Puppetbeast (FRA) 346 (borderless, showcase) | Hungering Puppetbeast - Showcase (2) | Hungering Puppetbeast (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Repurposed Enforcer (FRA) 335 (borderless, showcase) | Repurposed Enforcer - Showcase (2) | Repurposed Enforcer (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Variable Chaser // Arc of Fortune (FRA) 426 (extendedart) | Variable Chaser - Extended Art (3) | Variable Chaser (-1) | a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Vraska's Final Mercy (FRA) 343 (borderless, showcase) | Vraska's Final Mercy - Showcase (2) | Vraska's Final Mercy (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Beorn the Fierce (HOB) 230 (borderless, showcase) | Beorn the Fierce - Showcase (2) | Beorn the Fierce (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Thranduil, Sindarin Liege // Silvan Rally (HOB) 233 (borderless, showcase) | Thranduil, Sindarin Liege // Silvan Rally - Showcase (2) | Thranduil, Sindarin Liege // Silvan Rally (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Gollum, Patient Plotter (LTR) 801 *F* (borderless, showcase, surgefoil) | Gollum, Patient Plotter - Surge Foil - Showcase (4) | Gollum, Patient Plotter - Foil - Showcase (1) | our borderless not on the pick; a rival shares a family of ours; a rival differs only by an extra word; a plain product also fits (CC may name our printing plainly). Settled by the new Scryfall families. |
| Rosie Cotton of South Lane (LTR) 478 (showcase, silverfoil) | Rosie Cotton of South Lane - Showcase Scrolls (3) | Rosie Cotton of South Lane (-1) | partial word on the pick; a plain product also fits (CC may name our printing plainly). Settled by the new Scryfall families. |
| You Cannot Pass! (LTR) 489 (showcase, silverfoil) | You Cannot Pass! - Showcase Scrolls (3) | You Cannot Pass! (-1) | partial word on the pick; a plain product also fits (CC may name our printing plainly). Settled by the new Scryfall families. |
| Lim-Dûl's Vault (MB2) 87 | Lim-Dul's Vault - White Border (-1) | — | unexplained word on the pick. Settled by the new Scryfall families. |
| Merchant Scroll (MB2) 167 | Merchant Scroll - Future Frame (-1) | — | unexplained word on the pick. Settled by the new Scryfall families. |
| Oath of Druids (MB2) 212 | Oath of Druids - Future Frame (-1) | — | unexplained word on the pick. Settled by the new Scryfall families. |
| Snow-Covered Mountain (MB2) 119 | Snow-Covered Mountain - White Border (-1) | — | unexplained word on the pick. Settled by the new Scryfall families. |
| Temporal Manipulation (MB2) 174 | Temporal Manipulation - Future Frame (-1) | — | unexplained word on the pick. Settled by the new Scryfall families. |
| Walking Ballista (MB2) 238 | Walking Ballista - Future Frame (-1) | — | unexplained word on the pick. Settled by the new Scryfall families. |
| Volatile Stormdrake (MH3) 329 (borderless, fullart) | Volatile Stormdrake - Borderless (2) | Volatile Stormdrake (-2) | our fullart not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Jin-Gitaxias // The Great Synthesis (MOM) 294 (borderless, showcase) | Jin-Gitaxias // The Great Synthesis - Showcase (2) | Jin-Gitaxias // The Great Synthesis (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Secret Invasion (MSH) 301 *F* (borderless, showcase) | Secret Invasion - Foil - Borderless (4) | Secret Invasion - Foil (0) | our showcase not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Chishiro, the Shattered Blade (NEC) 1 *F* | Chishiro, the Shattered Blade - Foil (102) | Chishiro, the Shattered Blade - Foil - Display Commander - Thick Stock (0) | several products pass. |
| Atraxa, Grand Unifier (ONE) 316 (borderless, showcase) | Atraxa, Grand Unifier - Borderless Showcase (6) | Atraxa, Grand Unifier (-2) | a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Ezuri, Stalker of Spheres (ONE) 317 *F* (borderless, showcase) | Ezuri, Stalker of Spheres - Foil - Borderless Showcase (8) | Ezuri, Stalker of Spheres - Step-and-Compleat Foil - Borderless Showcase (5) | a rival shares a family of ours; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Ovika, Enigma Goliath (ONE) 322 *F* (borderless, showcase) | Ovika, Enigma Goliath - Foil - Borderless Showcase (8) | Ovika, Enigma Goliath - Step-and-Compleat Foil - Borderless Showcase (5) | a rival shares a family of ours; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Kellan, the Kid (OTJ) 294 (borderless, showcase) | Kellan, the Kid - Showcase (2) | Kellan, the Kid (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Magda, the Hoardmaster (OTJ) 374 *F* (extendedart, buyabox) | Magda, the Hoardmaster - Foil - Extended Art (4) | Magda, the Hoardmaster - Foil (0) | our buyabox not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Goblin Matron (PLST) DMR-123 | Goblin Matron (USG) - The List (2) | Goblin Matron (-3) | several products pass; picked by points. |
| Rampant Growth (PLST) DDS-48 | Rampant Growth (MIR) - The List (2) | Rampant Growth (-3) | several products pass; picked by points. |
| Yuna, Grand Summoner (PW25) 16 *F* (borderless) | Yuna, Grand Summoner - Foil - Borderless - WPN25 (4) | — | unexplained word on the pick. |
| Liliana's Triumph (PWAR) 98 *F* | Liliana's Triumph - Foil Open House Promo (1) | — | unexplained word on the pick. |
| Time Wipe (PWAR) 223 *F* | Time Wipe - Foil Planeswalker Weekend Promo (1) | — | unexplained word on the pick. |
| Domri, City Smasher (RNA) 269 *F* | Domri, City Smasher - Foil Planeswalker Deck Exclusive (1) | — | unexplained word on the pick. |
| Slickshot Show-Off (SCH) 43 *F* | Slickshot Show-Off - Foil - Store Championship Promo (1) | — | unexplained word on the pick. |
| Kiora, Behemoth Beckoner (SLD) 1700 *F* (borderless) | Kiora, Behemoth Beckoner - Foil - Stained Glass (0) | Kiora, Behemoth Beckoner - Rainbow Foil (-2) | unexplained word on the pick; our borderless not on the pick. |
| Sphinx Mindbreaker (THB) 290 | Sphinx Mindbreaker - Theme Booster Exclusive (-1) | — | unexplained word on the pick. |
| Sokka, Tenacious Tactician (TLA) 352 *F* (borderless, showcase) | Sokka, Tenacious Tactician - Foil - Showcase (4) | Sokka, Tenacious Tactician - Foil (0) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Splinter, Radical Rat (TMT) 251 (borderless, showcase) | Splinter, Radical Rat - Showcase (2) | Splinter, Radical Rat (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| Defense of the Heart (WOT) 80 (borderless) | Defense of the Heart - Anime Borderless (3) | Defense of the Heart (-1) | partial word on the pick; a plain product also fits (CC may name our printing plainly). |

---

## Appendix B — Prod's remembered links (read 2026-10-23, read-only)

Read from the session that started the scan, after the scan's own permission check had refused it:
`links_by_source.sql` (one SELECT over `cc_product_links`: the count by source and every link) with
`npx supabase db query --linked --project-ref zvxquzcfffmxwizonxuo --output-format json -f …`, saved as
`C:\ClaudeProjects\temp\pug-matching\11_prod_links.json`. Then `prod-links-report.mjs` pulled the products of every
linked card's name from dev's copy of inventory file 33 (`12_prod_link_products.sql`, dev only) and wrote the table
below. Nothing was written on prod. Totals: 303 links, 283 auto, 20 staff, linked 2026-10-20 to 2026-10-22.

**The 20 staff links**, a person picked each (the one in bold is section 2.5's):

- Baral, Chief of Compliance (March of the Machine: Multiverse Legends, non-foil, 2026-10-20)
- Fated Firepower - Borderless (Avatar: The Last Airbender, non-foil, 2026-10-20)
- Griselbrand - 2014 Grand Prix Promo (Unique & Misc. Promos, foil, 2026-10-20)
- Laughing Jasper Flint (0044) - Foil (Secret Lair Drop Series, foil, 2026-10-20)
- Commandeer (Outlaws of Thunder Junction: Breaking News, non-foil, 2026-10-21)
- Geth's Grimoire - The List (The List, non-foil, 2026-10-21)
- Harvester of Misery - Extended Art (Outlaws of Thunder Junction: The Big Score, non-foil, 2026-10-21)
- Knight Exemplar (Magic 2011) - The List (The List, non-foil, 2026-10-21)
- Pandemonium - The List (The List, non-foil, 2026-10-21)
- Sword of Wealth and Power - Foil (Outlaws of Thunder Junction: The Big Score, foil, 2026-10-21)
- Transmutation Font - Foil - Showcase (Outlaws of Thunder Junction: The Big Score, foil, 2026-10-21)
- Arcbound Ravager - Borderless (Teenage Mutant Ninja Turtles Source Material Cards, non-foil, 2026-10-22)
- Caged Sun - Retro Frame (The Brothers' War: Retro Frame Artifacts, non-foil, 2026-10-22)
- Increasing Vengeance (Strixhaven: Mystical Archives, non-foil, 2026-10-22)
- Marang River Regent // Coil and Catch - Borderless (Tarkir: Dragonstorm, non-foil, 2026-10-22)
- Raph's Jitte - Umezawa's Jitte - Borderless (Teenage Mutant Ninja Turtles Source Material Cards, non-foil, 2026-10-22)
- Semblance Anvil - Retro Schematic (The Brothers' War: Retro Frame Artifacts, non-foil, 2026-10-22)
- **Tom Bombadil - Showcase (The Lord of the Rings: Tales of Middle-earth, non-foil, 2026-10-22; LTR 331, see section 2.5)**
- Unwinding Clock - Retro Frame (The Brothers' War: Retro Frame Artifacts, non-foil, 2026-10-22)
- Well of Lost Dreams - Retro Frame (The Brothers' War: Retro Frame Artifacts, non-foil, 2026-10-22)

**The 283 auto links.** The Evidence column, from file 33: *word the matcher can't read* (an extra word or a
no-family word in the product's name: check these first); *a plain sibling exists* (a product with a trait word
was chosen while the plain name exists in the same finish: the Enchanting Tales shape); *same-finish sibling shares
its words*; *a sibling differs only by an extra word*; *only product of this name and finish in its category* (no
choice was possible; wrong only if CC doesn't carry the printing); *several same-finish siblings* (told apart by
number or foil kind). Tick each row; rows marked wrong whose cards were exported are the ones to check in Crystal
Commerce. With item 5 every auto link goes anyway; this table is the audit of what the inventory may have received
wrongly before today.

| # | Product (as linked) | Category | Finish | Linked | Evidence | Right? |
|---|---|---|---|---|---|---|
| 1 | Abandoned Air Temple | Avatar: The Last Airbender | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 2 | Archmage of Runes - Foil | Foundations | foil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 3 | Avatar's Wrath | Avatar: The Last Airbender | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 4 | Beorn the Fierce - Showcase | The Hobbit | nonfoil | 2026-10-20 | a plain sibling exists: Beorn the Fierce | ☐ right ☐ wrong |
| 5 | Bitterbloom Bearer | Lorwyn Eclipsed | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 6 | Cool but Rude | Teenage Mutant Ninja Turtles | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 7 | Darklight Phoenix | Reality Fracture | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 8 | Dawn's Truce | Bloomburrow | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 9 | Doctor Octopus, Master Planner | Marvel's Spider-Man | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 10 | Dour Port-Mage | Bloomburrow | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 11 | Elvish Piper | Masters 25 | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 12 | Enduring Courage | Duskmourn: House of Horror | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 13 | For the Common Good - Foil | Bloomburrow | foil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 14 | Formidable Speaker | Lorwyn Eclipsed | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 15 | Formidable Speaker - Extended Art | Lorwyn Eclipsed | nonfoil | 2026-10-20 | a plain sibling exists: Formidable Speaker | ☐ right ☐ wrong |
| 16 | Genji Glove | Final Fantasy | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 17 | Gisa, the Hellraiser | Outlaws of Thunder Junction | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 18 | Godless Shrine - Foil - Borderless | Edge of Eternities | foil | 2026-10-20 | same-finish sibling shares its words: Godless Shrine - Galaxy Foil - Borderless; a plain sibling exists: Godless Shrine - Foil | ☐ right ☐ wrong |
| 19 | Greater Good | Battlebond | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 20 | Haliya, Guided by Light | Edge of Eternities | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 21 | Hallowed Fountain | Lorwyn Eclipsed | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 22 | Jace's Archivist | Commander 2013 | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 23 | Jeleva, Nephalia's Scourge | Commander 2013 | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 24 | Liliana the Faultless | Reality Fracture | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 25 | Loot, Exuberant Explorer | Foundations | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 26 | Luminarch Ascension | Masters 25 | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 27 | Michelangelo, Weirdness to 11 - Borderless | Teenage Mutant Ninja Turtles | nonfoil | 2026-10-20 | a plain sibling exists: Michelangelo, Weirdness to 11 | ☐ right ☐ wrong |
| 28 | Miles Morales // Ultimate Spider-Man | Marvel's Spider-Man | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 29 | Nekusar, the Mindrazer | Commander 2013 | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 30 | Orim's Chant | Modern Horizons 3 | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 31 | Overgrown Tomb | Lorwyn Eclipsed | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 32 | Raphael, Ninja Destroyer - Borderless | Teenage Mutant Ninja Turtles | nonfoil | 2026-10-20 | a plain sibling exists: Raphael, Ninja Destroyer | ☐ right ☐ wrong |
| 33 | Samut, Hazoret's Champion | Reality Fracture | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 34 | Spellseeker | Battlebond | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 35 | Steam Vents | Lorwyn Eclipsed | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 36 | Sudden Spoiling | Commander 2013 | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 37 | Temple Bell | Commander 2013 | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 38 | Terrasymbiosis | Edge of Eternities | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 39 | Trade Routes | Ninth Edition | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 40 | True-Name Nemesis | Commander 2013 | nonfoil | 2026-10-20 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 41 | Watery Grave - Foil - Borderless | Edge of Eternities | foil | 2026-10-20 | same-finish sibling shares its words: Watery Grave - Galaxy Foil - Borderless; a plain sibling exists: Watery Grave - Foil | ☐ right ☐ wrong |
| 42 | Windcrag Siege | Tarkir: Dragonstorm | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 43 | Wistfulness | Lorwyn Eclipsed | nonfoil | 2026-10-20 | several same-finish siblings | ☐ right ☐ wrong |
| 44 | Academy Manufactor | Modern Horizons 2 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 45 | Ajani, Nacatl Pariah // Ajani, Nacatl Avenger | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 46 | Archon of Cruelty | Modern Horizons 2 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 47 | Arena of Glory | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 48 | Birds of Paradise | Mystery Booster | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 49 | Brago, King Eternal - The List | The List | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 50 | Bristly Bill, Spine Sower | Outlaws of Thunder Junction | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 51 | Brought Back - The List | The List | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 52 | Case of the Crimson Pulse | Murders at Karlov Manor | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 53 | Chord of Calling - Foil | Ravnica Remastered | foil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 54 | Collective Restraint - The List | The List | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 55 | Delney, Streetwise Lookout | Murders at Karlov Manor | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 56 | Demonic Tutor - The List | The List | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 57 | Draco | Mystery Booster | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 58 | Dragonlair Spider - The List | The List | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 59 | Emerald Medallion | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 60 | Emrakul, the World Anew | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 61 | Entomb - Foil | Premium Deck Series: Graveborn | foil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 62 | Expedited Inheritance - Promo Pack | Promo Pack: Murders at Karlov Manor | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 63 | Final Fortune - Future Frame | Mystery Booster 2 | nonfoil | 2026-10-21 | word the matcher can't read: Future Frame; only product of this name and finish in its category | ☐ right ☐ wrong |
| 64 | Flare of Duplication - Foil - Borderless | Modern Horizons 3 | foil | 2026-10-21 | a plain sibling exists: Flare of Duplication - Foil | ☐ right ☐ wrong |
| 65 | Fractured Sanity | Modern Horizons 2 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 66 | Fractured Sanity - Showcase | Modern Horizons 2 | nonfoil | 2026-10-21 | a plain sibling exists: Fractured Sanity | ☐ right ☐ wrong |
| 67 | Ghostway - Retro Frame | Ravnica Remastered | nonfoil | 2026-10-21 | a plain sibling exists: Ghostway | ☐ right ☐ wrong |
| 68 | Goreclaw, Terror of Qal Sisma - The List | The List | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 69 | Great Train Heist | Outlaws of Thunder Junction | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 70 | Greater Good - Future Frame | Mystery Booster 2 | nonfoil | 2026-10-21 | word the matcher can't read: Future Frame; only product of this name and finish in its category | ☐ right ☐ wrong |
| 71 | Guide of Souls | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 72 | Jet Medallion | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 73 | Kederekt Parasite - The List | The List | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 74 | Koth, Fire of Resistance - Foil | Phyrexia: All Will Be One | foil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 75 | Kozilek, the Broken Reality | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 76 | Leyline of the Guildpact | Murders at Karlov Manor | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 77 | Lilah, Undefeated Slickshot - Foil | Outlaws of Thunder Junction | foil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 78 | Magda, the Hoardmaster | Outlaws of Thunder Junction | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 79 | Magda, the Hoardmaster - Promo Pack | Promo Pack: Outlaws of Thunder Junction | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 80 | Memory Erosion | Mystery Booster | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 81 | Minamo, School at Water's Edge - Foil | Mystery Booster | foil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 82 | Mycosynth Lattice - The List | The List | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 83 | Nethergoyf | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 84 | Nettlecyst | Modern Horizons 2 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 85 | Oko, the Ringleader - Borderless | Outlaws of Thunder Junction | nonfoil | 2026-10-21 | a plain sibling exists: Oko, the Ringleader | ☐ right ☐ wrong |
| 86 | Pack Rat | Return to Ravnica | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 87 | Patriarch's Bidding | Modern Horizons 2 | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 88 | Pearl Medallion | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 89 | Phelia, Exuberant Shepherd | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 90 | Psychic Frog - Retro Frame | Modern Horizons 3 | nonfoil | 2026-10-21 | a plain sibling exists: Psychic Frog | ☐ right ☐ wrong |
| 91 | Ragavan, Nimble Pilferer | Modern Horizons 2 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 92 | Rakdos, Patron of Chaos | Murders at Karlov Manor | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 93 | Rakdos, the Muscle - Showcase | Outlaws of Thunder Junction | nonfoil | 2026-10-21 | a plain sibling exists: Rakdos, the Muscle | ☐ right ☐ wrong |
| 94 | Ripples of Undeath | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 95 | Ruby Medallion | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 96 | Sacred Foundry | Ravnica Remastered | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 97 | Sanctum Weaver | Modern Horizons 2 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 98 | Sapphire Medallion | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 99 | Scalding Tarn | Modern Horizons 2 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 100 | Seasoned Pyromancer | Modern Horizons | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 101 | Seedtime - White Border | Mystery Booster 2 | nonfoil | 2026-10-21 | word the matcher can't read: White Border; only product of this name and finish in its category | ☐ right ☐ wrong |
| 102 | Serra Ascendant (PAGL) - The List | The List | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 103 | Shifting Woodland | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 104 | Six | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 105 | Slickshot Show-Off | Outlaws of Thunder Junction | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 106 | Slickshot Show-Off - Foil - Extended Art | Outlaws of Thunder Junction | foil | 2026-10-21 | a plain sibling exists: Slickshot Show-Off - Foil | ☐ right ☐ wrong |
| 107 | Slickshot Show-Off - Foil - Prerelease Promo | Pre-Release Promos | foil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 108 | Solitude | Modern Horizons 2 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 109 | Soulless Jailer | Phyrexia: All Will Be One | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 110 | Sowing Mycospawn | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 111 | Sphinx of the Steel Wind - Foil | Premium Deck Series: Graveborn | foil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 112 | Spirebluff Canal - Foil | Outlaws of Thunder Junction | foil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 113 | Sylvan Safekeeper | Modern Horizons 3 | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 114 | Tamiyo, Inquisitive Student // Tamiyo, Seasoned Scholar | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 115 | Tasha's Hideous Laughter - The List | The List | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 116 | Teysa Karlov | Ravnica Allegiance | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 117 | Three Steps Ahead - Promo Pack | Promo Pack: Outlaws of Thunder Junction | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 118 | Titania, Protector of Argoth - Borderless | Modern Horizons 2 | nonfoil | 2026-10-21 | a plain sibling exists: Titania, Protector of Argoth | ☐ right ☐ wrong |
| 119 | Treasonous Ogre - Foil | Mystery Booster | foil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 120 | Tyrranax Rex | Phyrexia: All Will Be One | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 121 | Ugin's Labyrinth - Borderless | Modern Horizons 3 | nonfoil | 2026-10-21 | a plain sibling exists: Ugin's Labyrinth | ☐ right ☐ wrong |
| 122 | Unsettled Mariner | Modern Horizons | nonfoil | 2026-10-21 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 123 | Vraska, the Silencer - Showcase | Outlaws of Thunder Junction | nonfoil | 2026-10-21 | a plain sibling exists: Vraska, the Silencer | ☐ right ☐ wrong |
| 124 | Warren Soultrader | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 125 | Warren Soultrader - Foil | Modern Horizons 3 | foil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 126 | Watery Grave | Ravnica Remastered | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 127 | Wrath of the Skies | Modern Horizons 3 | nonfoil | 2026-10-21 | several same-finish siblings | ☐ right ☐ wrong |
| 128 | Wrath of the Skies - Retro Frame | Modern Horizons 3 | nonfoil | 2026-10-21 | a plain sibling exists: Wrath of the Skies | ☐ right ☐ wrong |
| 129 | Yavimaya, Cradle of Growth - Extended Art | Modern Horizons 2 | nonfoil | 2026-10-21 | a plain sibling exists: Yavimaya, Cradle of Growth | ☐ right ☐ wrong |
| 130 | Yavimaya, Cradle of Growth - Foil - Retro Frame | Modern Horizons 2 | foil | 2026-10-21 | a plain sibling exists: Yavimaya, Cradle of Growth - Foil | ☐ right ☐ wrong |
| 131 | Aclazotz, Deepest Betrayal // Temple of the Dead | The Lost Caverns of Ixalan | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 132 | Agatha of the Vile Cauldron | Wilds of Eldraine | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 133 | Agent Frank Horrigan | Universes Beyond: Fallout | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 134 | Ancient Stirrings - Foil | Secret Lair Drop Series | foil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 135 | Angel of Suffering | Streets of New Capenna | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 136 | Anim Pakal, Thousandth Moon | The Lost Caverns of Ixalan | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 137 | Archmage Emeritus | Strixhaven: School of Mages | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 138 | Arwen, Mortal Queen - Extended Art | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | a plain sibling exists: Arwen, Mortal Queen | ☐ right ☐ wrong |
| 139 | Bard, King of Dale - Borderless | The Hobbit | nonfoil | 2026-10-22 | a plain sibling exists: Bard, King of Dale | ☐ right ☐ wrong |
| 140 | Baxter, Fly in the Ointment | Teenage Mutant Ninja Turtles Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 141 | Belladonna Took | The Hobbit | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 142 | Beorn the Fierce | The Hobbit | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 143 | Bilbo's Gambit | The Hobbit | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 144 | Blade Historian | Strixhaven: School of Mages | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 145 | Blasphemous Act | Teenage Mutant Ninja Turtles Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 146 | Bloodforged Battle-Axe | Universes Beyond: Fallout | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 147 | Blossoming Tortoise - Foil | Wilds of Eldraine | foil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 148 | Blot Out the Sky - Extended Art | Strixhaven: School of Mages | nonfoil | 2026-10-22 | a plain sibling exists: Blot Out the Sky | ☐ right ☐ wrong |
| 149 | Brotherhood Regalia - Foil | Universes Beyond: Assassin's Creed | foil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 150 | Call of the Ring - Extended Art | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | a plain sibling exists: Call of the Ring | ☐ right ☐ wrong |
| 151 | Call of the Ring - Surge Foil - Extended Art | The Lord of the Rings: Tales of Middle-earth | foil | 2026-10-22 | same-finish sibling shares its words: Call of the Ring - Foil - Extended Art; a plain sibling exists: Call of the Ring - Foil | ☐ right ☐ wrong |
| 152 | Call the Spirit Dragons - Showcase | Tarkir: Dragonstorm | nonfoil | 2026-10-22 | a plain sibling exists: Call the Spirit Dragons | ☐ right ☐ wrong |
| 153 | Castle Locthwain | Throne of Eldraine | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 154 | Cauldron of Essence - Extended Art | Secrets of Strixhaven | nonfoil | 2026-10-22 | a plain sibling exists: Cauldron of Essence | ☐ right ☐ wrong |
| 155 | Clown Car | Unfinity | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 156 | Cori-Steel Cutter - Promo Pack | Promo Pack: Tarkir: Dragonstorm | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 157 | Crackle with Power | Secrets of Strixhaven: Mystical Archive | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 158 | Crashing Footfalls - Foil - Borderless | Special Guests | foil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 159 | Deafening Silence - Foil - Showcase | Special Guests | foil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 160 | Deathcap Glade | Secrets of Strixhaven | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 161 | Decadent Dragon // Expensive Taste - Showcase | Wilds of Eldraine | nonfoil | 2026-10-22 | a plain sibling exists: Decadent Dragon // Expensive Taste | ☐ right ☐ wrong |
| 162 | Deflecting Palm | Secrets of Strixhaven: Mystical Archive | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 163 | Diabolic Intent - Foil - Promo Pack | Promo Pack: The Brothers' War | foil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 164 | Dracogenesis - Showcase | Tarkir: Dragonstorm | nonfoil | 2026-10-22 | a plain sibling exists: Dracogenesis | ☐ right ☐ wrong |
| 165 | Dragon's Desire - Borderless | The Hobbit: Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 166 | Dragonologist - Foil | Tarkir: Dragonstorm | foil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 167 | Elven Chorus | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 168 | Elven Chorus - Extended Art | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | a plain sibling exists: Elven Chorus | ☐ right ☐ wrong |
| 169 | Elven Chorus - Foil - Showcase Scrolls | The Lord of the Rings: Tales of Middle-earth | foil | 2026-10-22 | word the matcher can't read: Showcase Scrolls; a plain sibling exists: Elven Chorus - Foil | ☐ right ☐ wrong |
| 170 | Emeritus of Ideation | Secrets of Strixhaven | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 171 | Exhibition Tidecaller | Secrets of Strixhaven | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 172 | Falco Spara, Pactweaver | Streets of New Capenna | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 173 | Faramir, Prince of Ithilien - Surge Foil - Showcase | The Lord of the Rings: Tales of Middle-earth | foil | 2026-10-22 | same-finish sibling shares its words: Faramir, Prince of Ithilien - Foil - Showcase \| Faramir, Prince of Ithilien - Foil - Showcase Scrolls; a plain sibling exists: Faramir, Prince of Ithilien - Foil; a sibling differs only by an extra word: Faramir, Prince of Ithilien - Foil - Showcase Scrolls | ☐ right ☐ wrong |
| 174 | Fateful Discovery | The Hobbit | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 175 | Felothar, Dawn of the Abzan - Foil | Tarkir: Dragonstorm | foil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 176 | Feral Ghoul | Universes Beyond: Fallout | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 177 | Fervent Champion | Throne of Eldraine | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 178 | Flame of Anor | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 179 | Folio of Fancies | Throne of Eldraine | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 180 | Forced Fruition | Wilds of Eldraine: Enchanting Tales | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 181 | Forge Anew | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 182 | Game Over | Teenage Mutant Ninja Turtles Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 183 | Gandalf, Goblins' Bane // Flameshape | The Hobbit | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 184 | Gandalf, Goblins' Bane // Flameshape - Borderless | The Hobbit | nonfoil | 2026-10-22 | a plain sibling exists: Gandalf, Goblins' Bane // Flameshape | ☐ right ☐ wrong |
| 185 | Gandalf, Goblins' Bane // Flameshape - Foil - Borderless | The Hobbit | foil | 2026-10-22 | same-finish sibling shares its words: Gandalf, Goblins' Bane // Flameshape - Surge Foil - Borderless; a plain sibling exists: Gandalf, Goblins' Bane // Flameshape - Foil | ☐ right ☐ wrong |
| 186 | Get Lost | The Lost Caverns of Ixalan | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 187 | Gishath, Sun's Avatar | The Lost Caverns of Ixalan | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 188 | Gloin, Dwarf Emissary | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 189 | Grand Coliseum - Surge Foil | Teenage Mutant Ninja Turtles Eternal-Legal | foil | 2026-10-22 | same-finish sibling shares its words: Grand Coliseum - Foil | ☐ right ☐ wrong |
| 190 | Grave Researcher - Foil - Promo Pack | Promo Pack: Secrets of Strixhaven | foil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 191 | Greensleeves, Maro-Sorcerer - Rainbow Foil | Secret Lair Drop Series | foil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 192 | Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun - Extended Art | The Lost Caverns of Ixalan | nonfoil | 2026-10-22 | a plain sibling exists: Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun | ☐ right ☐ wrong |
| 193 | Heliod's Intervention - Promo Pack | Promo Pack: Theros Beyond Death | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 194 | Horn of Gondor - Surge Foil - Extended Art | The Lord of the Rings: Tales of Middle-earth | foil | 2026-10-22 | same-finish sibling shares its words: Horn of Gondor - Foil - Extended Art; a plain sibling exists: Horn of Gondor - Foil | ☐ right ☐ wrong |
| 195 | Hulking Raptor | The Lost Caverns of Ixalan | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 196 | Irma, Part-Time Mutant | Teenage Mutant Ninja Turtles Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 197 | Krang, Utrom Warlord | Teenage Mutant Ninja Turtles | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 198 | Last Light of Durin's Day - Surge Foil - Showcase | The Hobbit | foil | 2026-10-22 | same-finish sibling shares its words: Last Light of Durin's Day - Foil - Showcase; a plain sibling exists: Last Light of Durin's Day - Foil | ☐ right ☐ wrong |
| 199 | Leatherhead, Iron Gator | Teenage Mutant Ninja Turtles Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 200 | Leonardo, Worldly Warrior | Teenage Mutant Ninja Turtles Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 201 | Level Up | Teenage Mutant Ninja Turtles Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 202 | Leyline of the Void | Wilds of Eldraine: Enchanting Tales | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 203 | Likeness Looter | Wilds of Eldraine | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 204 | Liliana's Mastery | Game Night: Free-For-All | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 205 | Lord Xander, the Collector | Streets of New Capenna | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 206 | MacCready, Lamplight Mayor | Universes Beyond: Fallout | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 207 | Marchesa, the Black Rose (2009) | Secret Lair Drop Series | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 208 | Mathemagics - Extended Art | Secrets of Strixhaven | nonfoil | 2026-10-22 | a plain sibling exists: Mathemagics | ☐ right ☐ wrong |
| 209 | Matzalantli, the Great Door // The Core | The Lost Caverns of Ixalan | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 210 | Mechanized Production | Universes Beyond: Fallout | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 211 | Mines of Moria - Foil | The Lord of the Rings: Tales of Middle-earth | foil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 212 | Mirelurk Queen | Universes Beyond: Fallout | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 213 | Mona Lisa, Ever Adaptable | Teenage Mutant Ninja Turtles Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 214 | Mount Doom | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 215 | Mount Doom - Foil - Borderless | The Lord of the Rings: Tales of Middle-earth | foil | 2026-10-22 | same-finish sibling shares its words: Mount Doom - Foil - Borderless Poster \| Mount Doom - Foil - Borderless Poster (Serialized) \| Mount Doom - Surge Foil - Borderless; a plain sibling exists: Mount Doom - Foil; a sibling differs only by an extra word: Mount Doom - Foil - Borderless Poster | ☐ right ☐ wrong |
| 216 | My Precious | The Hobbit | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 217 | Nature's Rhythm | Tarkir: Dragonstorm | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 218 | Nature's Rhythm - Borderless | Tarkir: Dragonstorm | nonfoil | 2026-10-22 | a plain sibling exists: Nature's Rhythm | ☐ right ☐ wrong |
| 219 | Nature's Rhythm - Promo Pack | Promo Pack: Tarkir: Dragonstorm | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 220 | Neriv, Heart of the Storm | Tarkir: Dragonstorm | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 221 | Night's Whisper (7110) - Foil | Secret Lair Drop Series | foil | 2026-10-22 | same-finish sibling shares its words: Night's Whisper (1937) - Foil | ☐ right ☐ wrong |
| 222 | Nogi, Draco-Zealot - Foil | Game Night: Free-For-All | foil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 223 | Ojer Kaslem, Deepest Growth // Temple of Cultivation - Foil - Showcase | The Lost Caverns of Ixalan | foil | 2026-10-22 | a plain sibling exists: Ojer Kaslem, Deepest Growth // Temple of Cultivation - Foil | ☐ right ☐ wrong |
| 224 | Ojer Kaslem, Deepest Growth // Temple of Cultivation - Showcase | The Lost Caverns of Ixalan | nonfoil | 2026-10-22 | a plain sibling exists: Ojer Kaslem, Deepest Growth // Temple of Cultivation | ☐ right ☐ wrong |
| 225 | Ojer Pakpatiq, Deepest Epoch // Temple of Cyclical Time - Showcase | The Lost Caverns of Ixalan | nonfoil | 2026-10-22 | a plain sibling exists: Ojer Pakpatiq, Deepest Epoch // Temple of Cyclical Time | ☐ right ☐ wrong |
| 226 | Oppression | Wilds of Eldraine: Enchanting Tales | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 227 | Orcrist, Goblin-cleaver - Showcase | The Hobbit | nonfoil | 2026-10-22 | a plain sibling exists: Orcrist, Goblin-cleaver | ☐ right ☐ wrong |
| 228 | Pathbreaker Ibex - Foil - Borderless | Special Guests | foil | 2026-10-22 | same-finish sibling shares its words: Pathbreaker Ibex - First-Place Foil - Borderless | ☐ right ☐ wrong |
| 229 | Phial of Galadriel - Foil | The Lord of the Rings: Tales of Middle-earth | foil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 230 | Polluted Bonds - Foil - Anime Borderless | Wilds of Eldraine: Enchanting Tales | foil | 2026-10-22 | **Polluted Bonds (WOT) 34 *F*, reported wrong**; word the matcher can't read: Anime Borderless; same-finish sibling shares its words: Polluted Bonds - Confetti Foil - Anime Borderless; a plain sibling exists: Polluted Bonds - Foil; a sibling differs only by an extra word: Polluted Bonds - Confetti Foil - Anime Borderless | ☐ right ☐ wrong |
| 231 | Primal Vigor | Wilds of Eldraine: Enchanting Tales | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 232 | Prismari, the Inspiration | Secrets of Strixhaven | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 233 | Prismatic Omen | Wilds of Eldraine: Enchanting Tales | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 234 | Professor Dellian Fel | Secrets of Strixhaven | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 235 | Pyretic Ritual | Secrets of Strixhaven: Mystical Archive | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 236 | Quandrix, the Proof - Foil | Secrets of Strixhaven | foil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 237 | Radagast of Rhosgobel | The Hobbit | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 238 | Ral Zarek, Guest Lecturer | Secrets of Strixhaven | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 239 | Rankle, Master of Pranks | Throne of Eldraine | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 240 | Raph & Mikey, Troublemakers - Showcase | Teenage Mutant Ninja Turtles | nonfoil | 2026-10-22 | a plain sibling exists: Raph & Mikey, Troublemakers | ☐ right ☐ wrong |
| 241 | Ray Fillet, Wave Warrior | Teenage Mutant Ninja Turtles Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 242 | Resonating Lute | Secrets of Strixhaven | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 243 | Restless Reef | The Lost Caverns of Ixalan | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 244 | Restoration Seminar | Secrets of Strixhaven | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 245 | Roaming Throne - Borderless | The Lost Caverns of Ixalan | nonfoil | 2026-10-22 | a plain sibling exists: Roaming Throne | ☐ right ☐ wrong |
| 246 | Saruman of Many Colors - Borderless | The Hobbit: Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 247 | Scrapheap | Urza's Legacy | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 248 | Shamanic Revelation - Foil | Secrets of Strixhaven: Mystical Archive | foil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 249 | Shared Animosity | Wilds of Eldraine: Enchanting Tales | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 250 | Shelob, Child of Ungoliant - Extended Art | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | a plain sibling exists: Shelob, Child of Ungoliant | ☐ right ☐ wrong |
| 251 | Shiko, Paragon of the Way - Showcase | Tarkir: Dragonstorm | nonfoil | 2026-10-22 | a plain sibling exists: Shiko, Paragon of the Way | ☐ right ☐ wrong |
| 252 | Smaug the Magnificent | The Hobbit | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 253 | Sorin, Grim Nemesis | Shadows Over Innistrad | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 254 | Spiteful Banditry | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 255 | Sram, Senior Edificer | Time Spiral Remastered | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 256 | Sundown Pass | Secrets of Strixhaven | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 257 | Sundown Pass - Foil | Secrets of Strixhaven | foil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 258 | The Arkenstone | The Hobbit | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 259 | The Battle of Bywater - Extended Art | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | a plain sibling exists: The Battle of Bywater | ☐ right ☐ wrong |
| 260 | The Lonely Mountain (0207) - Borderless | The Hobbit | nonfoil | 2026-10-22 | same-finish sibling shares its words: The Lonely Mountain (0248) - Borderless; a plain sibling exists: The Lonely Mountain | ☐ right ☐ wrong |
| 261 | The Lonely Mountain (0248) - Borderless | The Hobbit | nonfoil | 2026-10-22 | same-finish sibling shares its words: The Lonely Mountain (0207) - Borderless; a plain sibling exists: The Lonely Mountain | ☐ right ☐ wrong |
| 262 | The Shire | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 263 | The Shire - Borderless | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | a plain sibling exists: The Shire | ☐ right ☐ wrong |
| 264 | The Watcher in the Water | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 265 | The Watcher in the Water - Extended Art | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | a plain sibling exists: The Watcher in the Water | ☐ right ☐ wrong |
| 266 | The Watcher in the Water - Surge Foil - Extended Art | The Lord of the Rings: Tales of Middle-earth | foil | 2026-10-22 | a plain sibling exists: The Watcher in the Water - Foil | ☐ right ☐ wrong |
| 267 | There and Back Again - Foil | The Lord of the Rings: Tales of Middle-earth | foil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 268 | Thought-Knot Seer - Borderless | Special Guests | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 269 | Thranduil, the Elvenking - Borderless | The Hobbit | nonfoil | 2026-10-22 | a plain sibling exists: Thranduil, the Elvenking | ☐ right ☐ wrong |
| 270 | Titania, Voice of Gaea | The Brothers' War | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 271 | Tom Bombadil | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 272 | Toxic Sheepsquatch - Gemrazer - Foil - Showcase | Universes Beyond: Fallout | foil | 2026-10-22 | word the matcher can't read: Gemrazer; same-finish sibling shares its words: Toxic Sheepsquatch - Gemrazer - Surge Foil - Showcase; a sibling differs only by an extra word: Toxic Sheepsquatch - Gemrazer - Surge Foil - Showcase | ☐ right ☐ wrong |
| 273 | Triceraton Commander - Showcase | Teenage Mutant Ninja Turtles | nonfoil | 2026-10-22 | a plain sibling exists: Triceraton Commander | ☐ right ☐ wrong |
| 274 | Undergrowth Stadium | Teenage Mutant Ninja Turtles Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 275 | Ureni, the Song Unending | Tarkir: Dragonstorm | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 276 | Vernal Fen | Teenage Mutant Ninja Turtles Eternal-Legal | nonfoil | 2026-10-22 | only product of this name and finish in its category | ☐ right ☐ wrong |
| 277 | Virtue of Knowledge // Vantress Visions | Wilds of Eldraine | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 278 | Virtue of Persistence // Locthwain Scorn - Foil | Wilds of Eldraine | foil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 279 | Witch-king of Angmar | The Lord of the Rings: Tales of Middle-earth | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 280 | Withering Curse | Secrets of Strixhaven | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 281 | Wizard's Staff | The Hobbit | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 282 | Wizard's Staff - Foil | The Hobbit | foil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |
| 283 | Zaffai and the Tempests | Secrets of Strixhaven | nonfoil | 2026-10-22 | several same-finish siblings | ☐ right ☐ wrong |


### B.2 The 20 auto links rule 4 would have refused

Each linked printing rebuilt from Scryfall and run through the matcher and the rules against dev's copy of file 33 (section 2.5). Tier A: an extra word decided it; B: a sibling shares the card's words, or the pick carries a word the matcher can't read; C: a plain product also fits; D: the pick lacks one of the card's traits or shows one it hasn't; E: picked by points among several. Rows marked "nested words" pass under rule 5 (11); rows marked "settled" pass once the Scryfall-backed families are in (7). The two left are the mistakes: Polluted Bonds (confirmed) and Serra Ascendant (likely). Rule 3b's further 45 refusals were all variant products in regular sets beside a plain sibling, every one right.

| Tier | Card (treatments) | Linked to (prod) | Next best (score) | Why it was a guess |
|---|---|---|---|---|
| A | Elven Chorus (LTR) 611 *F* (showcase, silverfoil) | Elven Chorus - Foil - Showcase Scrolls | Elven Chorus - Foil (1) | partial word on the pick; a plain product also fits (CC may name our printing plainly). Settled by the new Scryfall families. |
| A | Faramir, Prince of Ithilien (LTR) 811 *F* (borderless, showcase, surgefoil) | Faramir, Prince of Ithilien - Surge Foil - Showcase | Faramir, Prince of Ithilien - Foil - Showcase (1) | our borderless not on the pick; a rival shares a family of ours; a rival differs only by an extra word; a plain product also fits (CC may name our printing plainly). Settled by the new Scryfall families. |
| A | Mount Doom (LTR) 343 *F* (borderless) | Mount Doom - Foil - Borderless | Mount Doom - Foil - Borderless Poster (5) | a rival shares a family of ours; a rival differs only by an extra word; a plain product also fits (CC may name our printing plainly). Settled by the new Scryfall families. |
| A | Polluted Bonds (WOT) 34 *F* (borderless, showcase) | Polluted Bonds - Foil - Anime Borderless | Polluted Bonds - Confetti Foil - Anime Borderless (1) | partial word on the pick; our showcase not on the pick; a rival shares a family of ours; a rival differs only by an extra word; a plain product also fits (CC may name our printing plainly). |
| B | Final Fortune (MB2) 190 | Final Fortune - Future Frame | — | unexplained word on the pick. Settled by the new Scryfall families. |
| B | Godless Shrine (EOE) 280 *F* (borderless, showcase) | Godless Shrine - Foil - Borderless | Godless Shrine - Galaxy Foil - Borderless (1) | our showcase not on the pick; a rival shares a family of ours; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| B | Greater Good (MB2) 207 | Greater Good - Future Frame | — | unexplained word on the pick. Settled by the new Scryfall families. |
| B | Seedtime (MB2) 73 | Seedtime - White Border | — | unexplained word on the pick. Settled by the new Scryfall families. |
| B | Watery Grave (EOE) 286 *F* (borderless, showcase) | Watery Grave - Foil - Borderless | Watery Grave - Galaxy Foil - Borderless (1) | our showcase not on the pick; a rival shares a family of ours; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| C | Beorn the Fierce (HOB) 230 (borderless, showcase) | Beorn the Fierce - Showcase | Beorn the Fierce (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| C | Dracogenesis (TDM) 300 (showcase) | Dracogenesis - Showcase | Dracogenesis (-1) | a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| C | Flare of Duplication (MH3) 333 *F* (borderless, fullart) | Flare of Duplication - Foil - Borderless | Flare of Duplication - Foil (0) | our fullart not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| C | Nature's Rhythm (TDM) 349 (borderless, showcase) | Nature's Rhythm - Borderless | Nature's Rhythm (-2) | our showcase not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| C | Orcrist, Goblin-cleaver (HOB) 236 (borderless, showcase) | Orcrist, Goblin-cleaver - Showcase | Orcrist, Goblin-cleaver (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| C | Rakdos, the Muscle (OTJ) 297 (borderless, showcase) | Rakdos, the Muscle - Showcase | Rakdos, the Muscle (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| C | Raph & Mikey, Troublemakers (TMT) 250 (borderless, showcase) | Raph & Mikey, Troublemakers - Showcase | Raph & Mikey, Troublemakers (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| C | Triceraton Commander (TMT) 226 (borderless, showcase) | Triceraton Commander - Showcase | Triceraton Commander (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| C | Vraska, the Silencer (OTJ) 299 (borderless, showcase) | Vraska, the Silencer - Showcase | Vraska, the Silencer (-2) | our borderless not on the pick; a plain product also fits (CC may name our printing plainly). Nested words: rule 5 takes the fullest. |
| E | Ancient Stirrings (SLP) 50 *F* (borderless) | Ancient Stirrings - Foil (today: choose) | Ancient Stirrings - Foil - Future Frame (0) | several products pass; picked by points. Settled by the new Scryfall families. |
| E | Serra Ascendant (PLST) M11-28 | Serra Ascendant (PAGL) - The List | — | several products pass; picked by points. |

---

## Appendix C — The inventory's words (dev's copy of inventory file 33, 153,092 products)

### C.1 Variant strings with a family word plus an extra word (82 of 1,168 distinct strings)

Products in the inventory file carrying the string; the family the matcher reads it as; the words it charges nothing for.

| Variant string | Products | Read as | Extra words |
|---|---|---|---|
| Showcase Scrolls | 700 | showcase | Scrolls |
| Japanese Alternate Art | 393 | japanese | Alternate Art |
| Anime Borderless | 120 | borderless | Anime |
| Textless Player Rewards | 50 | textless | Player Rewards |
| Borderless Manga | 48 | borderless | Manga |
| Borderless Poster | 40 | borderless | Poster |
| Japan Showcase | 40 | showcase | Japan |
| Dark Frame Promo Pack | 30 | promopack | Dark Frame |
| Borderless Poster (Serialized) | 20 | borderless, serialized | Poster |
| Prerelease Promo (Dated Stamped) | 8 | prerelease | Dated Stamped |
| Core Set 2021 Prerelease Promo | 7 | prerelease | Core Set 2021 |
| Sketch Showcase | 7 | showcase | Sketch |
| Borderless (Regional Championship Qualifiers 2022) | 6 | borderless | Regional Championship Qualifiers 2022 |
| JP Alternate Art | 6 | japanese | Alternate Art |
| Reversible Borderless | 6 | borderless | Reversible |
| Core Set 2020 Prerelease Promo | 5 | prerelease | Core Set 2020 |
| Extended Art Game Day Promo | 5 | extendedart | Game Day Promo |
| Retro Frame (30th Anniversary Promo) | 5 | retro | 30th Anniversary Promo |
| Costco Bundle | 4 | bundle | Costco |
| Costco Bundle Promo | 4 | bundle | Costco |
| Retro Frame (Eternal Weekend 2024 Promo) | 4 | retro | Eternal Weekend 2024 Promo |
| Love Your LGS 2021 Japanese Promo | 3 | japanese | Love Your LGS 2021 Promo |
| Retro Frame Commander Party Promo | 3 | retro | Commander Party Promo |
| (JP Graphic Novel Insert) Media Promo | 2 | japanese | Graphic Novel Insert Media Promo |
| Azusa, Lost but Seeking (1597) (Japanese) | 2 | japanese | Azusa, Lost but Seeking 1597 |
| Borderless (0347) | 2 | borderless | 0347 |
| Borderless (0364) | 2 | borderless | 0364 |
| Borderless (0370) | 2 | borderless | 0370 |
| Borderless (JP Exclusive) | 2 | borderless, japanese | Exclusive |
| Borderless (Pro Tour Promos) | 2 | borderless | Pro Tour Promos |
| Borderless (Secret Lair Prize) | 2 | borderless | Secret Lair Prize |
| Borderless Double-sided Land | 2 | borderless | Double-sided Land |
| Buy-A-Box Promos | 2 | buyabox | s |
| Chandra's Ignition (1594) (Japanese) | 2 | japanese | Chandra's Ignition 1594 |
| Child of Alara (1599) (Japanese) | 2 | japanese | Child of Alara 1599 |
| Elspeth Tirel (Japanese) | 2 | japanese | Elspeth Tirel |
| Feather, the Redeemed (1602) (Japanese) | 2 | japanese | Feather, the Redeemed 1602 |
| Freyalise, Llanowar's Fury (Japanese) | 2 | japanese | Freyalise, Llanowar's Fury |
| Greek) (Serial Numbered | 2 | serialized | Greek |
| Jace, Unraveler of Secrets (Japanese) | 2 | japanese | Jace, Unraveler of Secrets |
| Liliana of the Dark Realms (Japanese) | 2 | japanese | Liliana of the Dark Realms |
| Retro Frame (Eternal Weekend 2023 Promo) | 2 | retro | Eternal Weekend 2023 Promo |
| Retro Frame (WPN 2023 Promo) | 2 | retro | WPN 2023 Promo |
| The Royal Scions (Japanese) | 2 | japanese | The Royal Scions |
| Aether Revolt Prerelease Promo | 1 | prerelease | Aether Revolt |
| BLB Bundle | 1 | bundle | BLB |
| Borderless (0393) | 1 | borderless | 0393 |
| Borderless (0396) | 1 | borderless | 0396 |
| Borderless (Display Commander) | 1 | borderless | Display Commander |
| Borderless Concept Praetor | 1 | borderless | Concept Praetor |
| CBL Bundle Promo | 1 | bundle | CBL |
| Core Set 2020 Bundle Promo | 1 | bundle | Core Set 2020 |
| EOE Bundle | 1 | bundle | EOE |
| Extended Art Promo | 1 | extendedart | Promo |
| Foil- Extended Art | 1 | extendedart | Foil- |
| Full Art Champs Promo | 1 | fullart | Champs Promo |
| Gift Bundle Promo | 1 | bundle | Gift |
| IKO Bundle Promo | 1 | bundle | IKO |
| Italian) (Serial Numbered | 1 | serialized | Italian |
| Ixalan Prerelease Promo | 1 | prerelease | Ixalan |
| Japanese Alternate Art Prerelease Promo | 1 | prerelease, japanese | Alternate Art |
| Japanese Exclusive | 1 | japanese | Exclusive |
| Japanese Glossy Gotta Magazine Promo | 1 | japanese | Glossy Gotta Magazine Promo |
| Japanese Gotta Comic Promo | 1 | japanese | Gotta Comic Promo |
| Japanese JSS Promo | 1 | japanese | JSS Promo |
| Japanese Planeswalker Championship Promo | 1 | japanese | Planeswalker Championship Promo |
| Japanese Promo | 1 | japanese | Promo |
| JP Exclusive Planeswalker Event Promo | 1 | japanese | Exclusive Planeswalker Event Promo |
| Lorien Brooch (Buy-a-Box Promo) | 1 | buyabox | Lorien Brooch |
| Magic Fest Promo) (Retro Frame | 1 | retro | Magic Fest Promo |
| MKM Bundle | 1 | bundle | MKM |
| PCWS 2020 Spring Japanese | 1 | japanese | PCWS 2020 Spring |
| Prerelease Promo (Translated) | 1 | prerelease | Translated |
| Retro Frame (Launch Party & Release Event Promos) | 1 | retro | Launch Party & Release Event Promos |
| Retro Frame (Wizards Play Network 2021) | 1 | retro | Wizards Play Network 2021 |
| Retro Frame Promo | 1 | retro | Promo |
| Reversible Borderless (Display Commander) | 1 | borderless | Reversible Display Commander |
| Serial Numbered (001 of 295) | 1 | serialized | 001 of 295 |
| Serial Numbered (294 of 295) | 1 | serialized | 294 of 295 |
| Serial Numbered (295 of 295) | 1 | serialized | 295 of 295 |
| Textless Full Art (Peeled Plains 670) | 1 | fullart, textless | Peeled Plains 670 |
| Throne of Eldraine Prerelease Promo | 1 | prerelease | Throne of Eldraine |

### C.2 Variant strings with no family at all, the 40 most common

These already cost −1 as an "other word" (ccMatch.js 233–236); under the recommended rule a lone candidate carrying one is a choice.

| Variant string | Products |
|---|---|
| Gold-Stamped Signature | 1,183 |
| Modern Frame | 297 |
| Future Frame | 237 |
| Planeswalker Deck Exclusive | 203 |
| Theme Deck Exclusive | 141 |
| DCI Judge Promo | 134 |
| Dark Frame Promo | 130 |
| White Border | 120 |
| Oversized | 96 |
| Ampersand Promo | 80 |
| Thick Stock | 75 |
| Game Day Promo | 64 |
| Art Series | 54 |
| Phyrexian | 54 |
| Launch Promo | 53 |
| Intro Pack Promo | 39 |
| Stained Glass | 36 |
| Display Commander | 32 |
| 30th Anniversary Play Promos | 30 |
| Release Promo | 29 |
| Shattered Glass | 28 |
| Welcome Deck Exclusive | 28 |
| Ravnica Weekend Promo | 21 |
| Brawl Deck Exclusive | 20 |
| Happy Little Gathering | 20 |
| Emblem | 19 |
| Pro Tour Promo | 19 |
| Arena 2006 | 18 |
| Dungeon Module | 18 |
| WPN & Gateway Promos | 18 |
| Alternate Art | 17 |
| WPN Promo | 17 |
| Book Promo | 16 |
| Game Day & Store Championship Promos | 15 |
| IDW Promo | 15 |
| JSS Promo | 15 |
| Media Promos | 15 |
| Store Championship Promo | 15 |
| Concept Praetor | 14 |
| FNM 2013 | 14 |

### C.3 Extra words by weight (products carrying them)

| Word | Products | Rides on |
|---|---|---|
| Scrolls | 700 | Showcase |
| Alternate | 400 | Japanese |
| Art | 400 | Japanese |
| Anime | 120 | Borderless |
| Poster | 60 | Borderless |
| Player | 50 | Textless |
| Rewards | 50 | Textless |
| Manga | 48 | Borderless |
| Japan | 40 | Showcase |
| Promo | 36 | various |
| Dark | 32 | Promo Pack |
| Frame | 30 | Promo Pack |
| Core | 13 |  |
| Set | 13 |  |
---

## Appendix D — Other data from the sweep

### D.1 Cards with no Crystal Commerce product of their name in their category (15 printings): can't upload, not a wrong match

- Alms Collector (PLST) C17-1 (The List)
- Pack Leader (PLST) M21-29 (The List)
- Ondu Inversion // Ondu Skyruins (PLST) ZNR-30 (The List)
- Hanweir Battlements (EMN) 204 (Eldritch moon)
- Animal Sanctuary (PLST) M21-242 (The List)
- Needleverge Pathway // Pillarverge Pathway (PLST) ZNR-263 (The List)
- Feline Sovereign (PLST) M21-180 (The List)
- Cragcrown Pathway // Timbercrown Pathway (PLST) ZNR-261 (The List)
- Branchloft Pathway // Boulderloft Pathway (PLST) ZNR-258 (The List)
- Bruna, the Fading Light (EMN) 15 (Eldritch moon)
- Commander's Sphere (PLST) C14-54 (The List)
- Rhystic Study (SLD) 478 *F* (Secret Lair Drop Series)
- Trailblazer's Boots (LTR) 398 *F* (The Lord of the Rings: Tales of Middle-earth)
- Shark Typhoon (SLD) 2578 (Secret Lair Drop Series)
- Shark Typhoon (SLC) 2020 (Secret Lair Drop Series)

### D.2 Sets with no category (40 printings in 32 sets): every category is searched and the card goes to Needs a choice

| Set | Printings |
|---|---|
| sta Strixhaven Mystical Archive | 4 |
| brr The Brothers' War Retro Artifacts | 2 |
| ptc Pro Tour Collector Set | 2 |
| scd Starter Commander Decks | 2 |
| h1r Modern Horizons 1 Timeshifts | 2 |
| p30a 30th Anniversary Play Promos | 2 |
| plg25 Love Your LGS 2025 | 1 |
| pbfz Battle for Zendikar Promos | 1 |
| pdp12 Duels of the Planeswalkers 2012 Promos | 1 |
| fdc Foundations Commander | 1 |
| slp Secret Lair Promo | 1 |
| wc99 World Championship Decks 1999 | 1 |
| ced Collectors' Edition | 1 |
| ptkdf Tarkir Dragonfury | 1 |
| pw26 Wizards Play Network 2026 | 1 |
| cm2 Commander Anthology Volume II | 1 |
| slu Secret Lair: Ultimate Edition | 1 |
| pdka Dark Ascension Promos | 1 |
| dci DCI Promos | 1 |
| slx Universes Within | 1 |
| pm15 Magic 2015 Promos | 1 |
| pm11 Magic 2011 Promos | 1 |
| pxln Ixalan Promos | 1 |
| plrw Lorwyn Promos | 1 |
| f16 Friday Night Magic 2016 | 1 |
| cp3 Magic Origins Clash Pack | 1 |
| pl23 Year of the Rabbit 2023 | 1 |
| pza Teenage Mutant Ninja Turtles Source Material | 1 |
| j19 Judge Gift Cards 2019 | 1 |
| mps Kaladesh Inventions | 1 |
| plg21 Love Your LGS 2021 | 1 |
| pmei Media and Collaboration Promos | 1 |

### D.3 Treatments saved at the buy that Scryfall no longer reports (10 printings)

The matcher uses the treatments saved with the line, so these match as they were bought; a fresh pick of the same printing today would carry fewer words.

| Card | Saved | Scryfall now |
|---|---|---|
| Flooded Grove (M3C) 342 | ripplefoil | (none) |
| Whirlwind Denial (STA) 86 | borderless | borderless, japanese |
| Leatherhead, Iron Gator (TMC) 30 | surgefoil | (none) |
| Herald's Horn (M3C) 296 | ripplefoil | (none) |
| Eldrazi Displacer (M3C) 169 | ripplefoil | (none) |
| Rosie Cotton of South Lane (LTR) 478 | showcase, silverfoil | showcase |
| Soul's Attendant (LTC) 520 | borderless, silverfoil | borderless |
| You Cannot Pass! (LTR) 489 | showcase, silverfoil | showcase |
| Foreboding Ruins (MSC) 244 | surgefoil | (none) |
| Tempt with Mayhem (M3C) 62 | extendedart, ripplefoil | extendedart |
