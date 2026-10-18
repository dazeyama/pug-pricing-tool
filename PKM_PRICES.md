# PKM_PRICES.md — Pokémon prices: what can be wrong, and where

An audit of how every English Pokémon card the app can search for is wired to a TCGplayer
price, done 2026-10-17 after the team's report: *"super low prices for some full arts … the
prices were displaying for the wrong cards."* No code was changed. Everything below is a
finding or a proposal for you to work through; the "Needs your answer" list is at the end.

> **Status, 2026-10-17 evening — the code fixes are applied** (owner: "Apply all code fixes"), local commit,
> not pushed, the `prices` function not redeployed:
>
> - ✅ Section 4.1 — own-product printings read as the version (`justtcgCards.js` `ownProductCard`,
>   `prices.js` `resultFor`); decision 287. Poké Ball / Master Ball cards and SM promos now show
>   JustTCG's five prices.
> - ✅ Section 4.2 — `WRONG_PRODUCTS` in `printings.js` with 59 entries from `fixes.md`, Charmander SVP
>   044 → #512035 first; decision 286. Fixed versions drop TCGdex's market price (the wrong card's).
> - ✅ Section 4.3 — `supabase/functions/prices/sets.ts` (197 sets: JustTCG set ids + names + number
>   padding), exact set match, size check, `set=` as the second step, no set-code step for English;
>   decision 288. **Needs `npx supabase functions deploy prices --project-ref psucrzljraxeootwnltf
>   --use-api --no-verify-jwt`** to take effect (the live site runs on dev).
> - ✅ Section 4.4 — `marketPriceIn` by finish; decision 287.
> - ✅ Section 4.5 — the function refuses a product whose number isn't the card's, or a plain version's
>   product outside the set's home; the app shows no fallback for a refused one. Needs the same deploy.
> - ⏳ Section 4.6 (the 5 saved lines), 4.7 (budget: siblings per set / plan), 4.8 (TCGdex issue) and the
>   Section 7 answers are still yours. Not done: Base Set Machamp (TCGplayer has no Base Set product for
>   it; both are "Deck Exclusives"), Multi Energy EX Sandstorm 93 (two versions share the wrong id).
> - 🧪 To check at the counter: Charmander SVP 044 (price and TCGplayer link are Charmander's, $50-ish);
>   Exeggcute PRE 001 Master Ball (JustTCG's five conditions, no "fallback" tag); Mimikyu V TG16
>   ($80-ish, not $3.78); after the deploy, Purugly DP 36 and Pikachu SM1 (prices arrive by search).

**Data checked:** all 21,256 English TCGdex cards (205 sets, 34,002 versions), TCGplayer's whole
Pokémon catalogue (32,868 products in 220 sets, with today's prices, from tcgcsv.com), the dev
database's `price_map` / `price_cache` (what JustTCG actually answered: 3,785 Pokémon cards) and
the store's 949 Pokémon buy lines. **Not done:** live JustTCG requests. This session had neither
the store sign-in nor the key (the key is only ever read by the Edge Function, and I don't read it),
and the store was at 771 of its 1,000 daily requests at 2:20 PM. Section 6 lists the ≤ 20 live
requests worth making, and when.

---

## 0. The short version

1. **Trainer Gallery full arts are wired to the regular card** (TCGdex data error). Brilliant Stars
   TG06 Dusknoir, TG07 Dedenne, TG08 Alcremie, TG16 Mimikyu V, TG17 Mimikyu VMAX, TG24 Acerola's
   Premonition, TG26 Gloria all price from the plain Brilliant Stars card: Mimikyu V TG16 shows
   **$3.78 instead of $81.87**, Gloria TG26 **$0.14 instead of $5.47**. This is the most likely
   source of the team's report. 176 cards in all point at a wrong product (Section 3.1, full
   list with the right product IDs in `fixes.md`).
2. **Poké Ball / Master Ball pattern cards never get JustTCG's prices.** Their TCGplayer products
   list the printing as "Holofoil"; the app asks for "Reverse Holofoil", finds nothing, and falls
   back to TCGdex's market price × the fallback percentages. All 471 pattern versions in Prismatic
   Evolutions, Black Bolt and White Flare; also SM Black Star Promos (157), Cosmos/Cracked-Ice
   energies (40) and others: 835 versions. The store's own Sylveon PRE 040 Master Ball was priced
   this way (`tcgdex_fallback`, $33.04). One small code change fixes it (Section 3.2).
3. **35% of versions (11,773; 9,222 cards) have no TCGplayer product ID in TCGdex** and are priced
   by the name search instead: all of Scarlet & Violet base, Sword & Shield base, every Sun & Moon,
   XY, Black & White and Diamond & Pearl set, Champion's Path, 30th Celebration, most promos. For
   these there is **no fallback price at all** (TCGdex has no prices for them either): when the
   search fails, the card needs a manual price. 1,083 of those cards can **never** match because
   the set names don't line up ("Diamond & Pearl" vs TCGplayer's "Diamond and Pearl", "Sun & Moon"
   vs "SM Base Set", every promo set, the Classic Collection…), and 118 are ambiguous (Base Set
   vs Base Set (Shadowless)). A set-name alias table fixes this (Section 3.3).
4. **The fallback price for a reverse holo is usually the plain card's market price** (first key
   wins in `marketPriceIn`): 4,452 of 6,554 reverse versions. It only shows when JustTCG has no
   NM price, and it feeds the ⚠️ comparison (Section 3.4).
5. **JustTCG budget:** Starter (1,000/day). 771 used by 2:20 PM on a normal day. Every Pokémon
   card selected costs about two requests (its prices + the TCGplayer siblings search), and a
   card without a product ID up to five (Section 3.5).
6. **The store's past buys:** of 949 Pokémon lines, 5 were priced from a clearly wrong product
   (Team Magma's Groudon and Dark Marowak from "Deck Exclusives" at a tenth of the price, Machamp
   1st Edition, Mimikyu ex Journey Together Stamped from a Jumbo card, two Aquapolis a/b swaps);
   39 were typed by hand because nothing matched; of the 247 special-rarity lines, none was priced
   from a different card apart from that Groudon and the Jumbo Mimikyu (Section 3.6).

---

## 1. How a Pokémon price is wired today

For an English card the app (`src/lib/prices.js` `lookupsFor`, the `prices` Edge Function) does,
per version of the card (`printings.js` `pokemonVersions`, from TCGdex `variants_detailed`):

| Path | When | What JustTCG is asked | Fallback if JustTCG has nothing |
|---|---|---|---|
| **A. Product ID** | TCGdex's version has `thirdParty.tcgplayer` (65% of versions) | `tcgplayerId` → that one product's card | TCGdex's own TCGplayer market price for the version (`marketPriceIn`) × the Master Fallback Percentages |
| **B. Name search** | No product ID (35%) | up to 3 searches: `q=<name>&number=NNN/SSS`; the name inside the set found by set code (never works for English, Section 3.3); the name alone (20 results). The answer must match the number and the **set name** (one contains the other), and be the only one | **none**: TCGdex has no prices for these cards, so the price is empty → manual |
| **C. TCGplayer-only versions** | A siblings search finds products with the card's name + number that TCGdex lacks (Cosmos Holo, stamped…) | their own product | none |

Then `conditionVariants` reads the product's variants whose **printing fits the finish**
(`normal` ↔ "Normal"/"Unlimited", `holo` ↔ "Holofoil", `reverse` ↔ "Reverse Holofoil", plus the
1st Edition rule). A version with no product ID of its own prices as the plain version of the same
finish (`resultFor`). The ⚠️ warning compares JustTCG's NM with TCGdex's market price for the same
version — so **when the product is wrong, both numbers come from the wrong product and no warning
shows.** That is why the team saw a quiet, confident, wrong price.

---

## 2. What was checked, and how

- **TCGdex ↔ TCGplayer wiring:** every version's `thirdParty.tcgplayer` looked up in TCGplayer's
  catalogue: same number (before the "/"), same name, a product in the set's own TCGplayer group(s),
  the pattern in the product name ("(Poke Ball Pattern)"), a printing the app can read, and no two
  cards sharing one product.
- **The search path, emulated** on TCGplayer's catalogue with the function's own rules (name contains,
  number equal, set size, set-name containment, exact-name tie-break). JustTCG's own `q` matching and
  its 20-result page can't be emulated, so this is the best case: a card marked "no match" here can't
  match live either; "one match" may still miss live.
- **What JustTCG actually answered:** every `price_map` row with its cached card, compared with the
  TCGdex card it was asked for (1,630 product lookups, 287 name searches, 18 Japanese, 1,109
  TCGplayer-only cards).
- **The store's buy lines:** each line's saved JustTCG card against its TCGdex card and version; the
  line's market price against today's TCGplayer market for the product it should use.
- Scripts and data: `C:\ClaudeProjects\temp\pkm-prices\` (`analyze.mjs` writes `data/findings.json`;
  `breakdown.mjs`, `deep.mjs`, `more.mjs`, `fixes.mjs`, `denom.mjs`, `noid-pricing.mjs`,
  `normalrows.mjs`; the downloads are `fetch-tcgdex.mjs`, `fetch-tcgcsv.mjs`; `dbq.mjs` runs SQL on
  dev through the repo's `scripts/lib/linked.mjs`). `data/fixes.md` has every wrong product with the
  right one; `data/lines-report.md` every store line that was looked at. Nothing from the customers
  was copied: the buy-line dump has card columns only.

Counts: 22,229 versions priced by product ID; 11,773 by search (9,222 cards, 1,802 of them special
rarities); JustTCG plan Starter, 771 / 1,000 today, 5,301 / 10,000 this month (21:22 UTC).

---

## 3. Findings

### 3.1 Cards wired to the wrong TCGplayer product — 176 cards (267 versions)

TCGdex's `thirdParty.tcgplayer` sometimes names the wrong product. The app trusts it, JustTCG
answers for that product, and the fallback (TCGdex's market for the same product) agrees, so
nothing warns. The kinds, worst first:

**a) Full arts → the regular card (Brilliant Stars Trainer Gallery).** The one that matches the team's
description. TCGplayer sells these in "SWSH09: Brilliant Stars Trainer Gallery"; TCGdex points them
at the plain card in "SWSH09: Brilliant Stars":

| TCGdex card | Priced from today | Should be |
|---|---|---|
| swsh9tg Dusknoir TG06 | #263778 Dusknoir 062/172 — Holofoil $0.20 | #264214 Dusknoir TG06/TG30 — $2.92 |
| swsh9tg Dedenne TG07 | #263783 Dedenne 067/172 — no holo printing → fallback $0.16 | #264215 — $7.19 |
| swsh9tg Alcremie TG08 | #263787 Alcremie 071/172 — no holo printing → fallback $0.25 | #264216 — $3.59 |
| swsh9tg Mimikyu V TG16 | #263784 Mimikyu V 068/172 — $3.78 | #264221 — $81.87 |
| swsh9tg Mimikyu VMAX TG17 | #263785 Mimikyu VMAX 069/172 — $13.63 | #264222 — $73.76 |
| swsh9tg Acerola's Premonition TG24 (holo and reverse) | #263852 129/172 — $0.18 / $0.23 | #264228 — $8.84 |
| swsh9tg Gloria TG26 (holo and reverse) | #263863 Gloria 141/172 — $0.14 / $0.19 | #264229 — $5.47 |

The set's other 23 versions, and all of Astral Radiance / Lost Origin / Silver Tempest Trainer
Galleries, Crown Zenith's Galarian Gallery, Shining Fates' Shiny Vault and Paldean Fates are wired
right. Hidden Fates' Shiny Vault (sma, 94 cards) has no IDs at all (Section 3.3).

**b) The plain version of a main-set card → a deck / league / promo reprint (32 versions).** TCGplayer
lists theme-deck and league reprints in "Deck Exclusives", "League & Championship Cards" or
"Miscellaneous"; they're non-holo and cheap, and TCGdex made them the card's only product. The store
hit two of these already:

| TCGdex card | Priced from today | Should be (TCGplayer) |
|---|---|---|
| ex4 Team Magma's Groudon 9 (Holo Rare) | #125255 Deck Exclusives, Normal $13.23 | #89827 EX Team Magma vs Team Aqua, Holofoil $150.83 — **bought 2026-10-03, DMG, for $1** |
| ex7 Dark Marowak 7 | #125065 Deck Exclusives $15.65 | #84627 Holofoil $200.16 — **bought 2026-10-03, MP, for $3.50** |
| ex4 Team Aqua's Kyogre 3 | #125256 Deck Exclusives $12.43 | #89788 Holofoil $542.60 |
| ex7 Azumarill 1 | #125066 $6.61 | #83682 Holofoil $54.39 |
| ex5 Metagross 11 | #125058 $4.36 | #87335 Holofoil $44.58 |
| ex8 Camerupt 4 / Shedinja 14 | #84089 $7.48 / #228156 $2.51 | #97749 $36.02 / #89118 $32.16 |
| ex9 Blaziken 1 / Manectric 7 / Sceptile 10 / Swampert 11 | $4.16 / $0.68 / $4.09 / $25.41 | #83906 $60.67 / #87156 $17.33 / #97730 $46.39 / #97731 $85.48 |
| lc Charizard 3 / Dark Blastoise 4 / Dark Raichu 7 | Deck Exclusives $160 / $57 / $25 | #84196 Holofoil $899.99 / #84569 $274.99 / #84646 $84.79 |
| pl1 Gardevoir 8, Shaymin 38; pl2 Flygon 5, Rhyperior E4 32; pl3 Milotic C 35; pl4 Luxray 5, Swalot 9, Tangrowth 10; hgss2 Mismagius 5, Steelix 24 | Deck Exclusives | #85636, #89106, #85526, #88748, #87459, #86949, #89674, #89753, #87517, #89563 |
| swsh4 Dialga 121; swsh7 Eldegoss 16 | Deck Exclusives $0.26 / $0.32 | #226575 Holofoil $0.38; #246831 $0.32 |
| me02 Moltres 014, Zacian 045, Flygon 053, Toxtricity 068 | Deck Exclusives | #662201, #662244, #662159, #660409 |
| base1 Machamp 8 (Unlimited) | #42425 Deck Exclusives "1st Edition Holofoil" $23.79 (the 2-player set's Machamp); the Shadowless and 1st Edition versions have no product and fall back to it | Base Set's own Machamp for Unlimited — **bought twice (10-03 MP $8.75, 10-16 HP $6.50)** |

**c) One product for two different cards (40 products, 100 versions):** sv03 Tyranitar ex 066
(Play! Pokémon stamp) → Toedscruel ex's Prize Pack product; sv03 Toedscruel ex 022 (Gym Challenge
stamp) → a 2004 Rayquaza league card ($248); svp Charmander 044 → Fuecoco 002 ($5.35 instead of
#512035 $50.22); Celebrations Classic Collection Reshiram CC020 / Zekrom CC021 → the plain
Celebrations Reshiram/Zekrom (TG-style miss); McDonald's 25th Snivy 5 → Turtwig 4, Scorbunny 16 →
Litten 15; POP 7 Stantler 9 → Kirlia 8; Rumble Starmie 5 and Gyarados 6 → Ninetales 3 ($373 vs $160
/ $325); Aquapolis Golduck 50a/50b, Drowzee 74a/74b, Mr. Mime 95a/95b, Porygon 103a/103b share one
product (**two store lines: Mr. Mime 95a priced as 95b, Drowzee 74b as 74a**); Sun & Moon Trainer
Kit Hau / Great Ball / Lightning Energy; Nintendo Promos Treecko 16 → Torchic 17; My First Battle.
Cracked-ice holos swapped between cards: hgss3 Gliscor 4 → Espeon 2, sm3 Alolan Ninetales 28 ↔
Lycanroc 76; hgss4 Mamoswine 5 → Nidoking 6; hgss2 Poliwrath 21 league → Politoed 7; swsh10.5
Blissey 052 Cosmos → Snorlax 055 Cosmos.

**d) Not wrong, just different naming (no action):** Celebrations Classic Collection numbers
(TCGdex CC001, TCGplayer 2/102 — right product), SWSH special energies ("Heat R Energy"), SVE
"Basic Grass Energy", Base Set "Imposter/Impostor Professor Oak", Delta Species "δ".

**Fix options.** (1) An override table in `printings.js` like `WRONG_FOILS`/`OFFICIAL_FIXES`:
`WRONG_PRODUCTS = { 'swsh9tg-TG16': { holo: '264221' }, … }` applied in `pokemonVersions`; the
right IDs are in `C:\ClaudeProjects\temp\pkm-prices\data\fixes.md` (267 lines; "no obvious
product" means pick by hand). (2) Report them to TCGdex (github.com/tcgdex/cards-database) so the
fix lands for everyone; the override stays until it does. (3) Belt and braces: when JustTCG's card
for a product has a different number than the TCGdex card (the function already has both), log it
and don't trust it — that check alone would have caught every case in a) and c).

**Saved lines keep their product** (`buy_lines.tcgplayer_id`, `justtcg_card_id`), so REPRICE? and the
export of the two Deck-Exclusives lines and the Machamps will price them wrong again until the lines
are re-added or the IDs are corrected in the database. Jumbo: Mimikyu ex JTG 069 (bought 10-10,
before the 10-11 jumbo rule) still carries the Jumbo product.

### 3.2 Pattern and special-print versions never get JustTCG's prices — 835 versions, 585 cards

TCGplayer gives a product like "Exeggcute (Master Ball Pattern)" one printing, **Holofoil**. TCGdex
calls the same thing a `reverse` version with `foil: masterball`. `printingFits('Holofoil',
{finish: 'reverse'})` is false, so `conditionVariants` finds nothing, and the ladder runs on the
fallback: TCGdex's market price for that product × the Master Fallback Percentages (NM 100% …).
The store's **Sylveon PRE 040 Master Ball** line is exactly this: `price_source = tcgdex_fallback`,
NM $33.04, no condition prices, "fallback" tag.

| Where | Versions | Finish asked → printing sold |
|---|---|---|
| Prismatic Evolutions Poké Ball / Master Ball | 100 + 67 | reverse → Holofoil |
| Black Bolt / White Flare Poké Ball / Master Ball | 80+72 each | reverse → Holofoil |
| SM Black Star Promos (SM01–SM250 era) | 157 | normal → Holofoil (TCGdex calls them non-holo; TCGplayer sells Holofoil) |
| SVE energies: Cosmos, Cracked Ice, Prize Pack cosmos | 40 | reverse → Holofoil |
| World Championship deck "versions" (TCGdex stamps named after players) | ~70 | holo → Normal (dropped by the app once the siblings search answers; priced as fallback before) |
| Older oddities: Skyridge/Aquapolis holos where TCGplayer has only Reverse Holofoil, Shining Gyarados/Steelix/Tyranitar 1st Edition (TCGplayer has only "Unlimited Holofoil"), Alph Lithograph, League promos | ~95 | various |

Consequences: no condition-specific prices (DMG of a $50 Master Ball card = 60% of market, not
TCGplayer's DMG), prices 2–3 days older than JustTCG's, no 📈/📉, and the "fallback" tag on every
one. The Japanese pattern rule already does the right thing: `asFinish` (prices.js) reads **every
printing of an own-product as the version's finish**. Doing the same for English versions whose
product is their own (a pattern, a stamp, a cosmos, any version whose `tcgplayerId` differs from the
plain version's) fixes all 835 in one place. The Ascended Heroes Poké Ball products are the one
exception that already works: TCGplayer lists those as "Reverse Holofoil".

Related: `uncrossPatterns` swaps the two patterns' *fallback figures* when Poké Ball > Master Ball.
In English every pattern version points at its own, correctly named product (all 471 checked), so
there's nothing crossed to uncross there; the swap only matters for Japanese Cardmarket figures.
Once pattern cards read JustTCG's prices (above), the swap no longer touches what's shown.

### 3.3 The name search: 9,222 cards with no product ID

TCGdex has no TCGplayer ID (and no TCGplayer price) for these sets, whole or nearly: **sv01 Scarlet &
Violet (444 versions; 24 Illustration rares, 20 Ultra rares, 10 SIRs, 6 Hyper rares), swsh1 Sword &
Shield (380), swsh3.5 Champion's Path (134), 30th Celebration (158), every Diamond & Pearl set
(dp1–dp7), every Sun & Moon set (sm1–sm12, Shining Legends, Dragon Majesty, Hidden Fates + Shiny
Vault), every XY set (xy1–xy12, Generations, Double Crisis, the trainer kits), every Black & White
set, ex11–ex16 (Delta Species to Power Keepers), XY / BW / DP / SVP / SWSHP / MEP promos without
IDs**, plus odd versions elsewhere (Base Set's 4th print, 102 versions; sv05 68; sv09 52; me01 49).
The store buys from many of these: Mysterious Treasures, Legends Awakened, 30th Celebration, Secret
Wonders, Crystal Guardians, XY, Flashfire, Delta Species, Dragon Frontiers, Great Encounters all
appear in the top 40 bought sets with **0% product coverage**.

What happens to them, emulated on TCGplayer's catalogue with the function's rules:

| Outcome | Cards | Why |
|---|---|---|
| One match (best case) | 8,021 | the name, number "NNN/SSS" and set name line up |
| **No match, ever** | **1,083** | the TCGdex set name and TCGplayer's never contain each other |
| Several matches → "not guessing" | 118 | Base Set (100: "Base Set" is inside "Base Set (Shadowless)" and "Base Set 2"), Prismatic Evolutions (9), XY, Generations, trainer kits |

The never-match sets, with the TCGplayer set name that would fix each:

| TCGdex set | Cards | TCGdex name | TCGplayer / JustTCG set name |
|---|---|---|---|
| xyp | 216 (all promos) | XY Black Star Promos | XY Promos |
| sm1 | 172 | Sun & Moon | SM Base Set |
| dp1 | 130 | Diamond & Pearl | Diamond and Pearl ("&" vs "and") |
| bw1 | 115 | Black & White | Black and White |
| bwp | 101 | BW Black Star Promos | Black and White Promos |
| dpp | 56 | DP Black Star Promos | Diamond and Pearl Promos |
| tk-xy-n / -w / -latio / -su | 30 each | XY trainer Kit (Noivern…) | XY Trainer Kit: Sylveon & Noivern / Bisharp & Wigglytuff / Latias & Latios / Pikachu Libre & Suicune |
| 30th-c | 30 | 30th Classic Collection | ME: 30th Celebration Classic Collection |
| swshp / svp / mep (the ones without IDs) | 24 / 18 / 11 | SWSH / SVP / MEP Black Star Promos | SWSH: Sword & Shield Promo Cards / SV: Scarlet & Violet Promo Cards / ME: Mega Evolution Promo |
| sve | 16 | Scarlet & Violet Energy | SVE: Scarlet & Violet Energies |
| basep / np / hgssp | 8 / 7 / 1 | Wizards / Nintendo / HGSS Black Star Promos | WoTC Promo / Nintendo Promos / HGSS Promos |
| xya | 6 | Yellow A Alternate | ? (ask) |
| xy4, dp6, xy10, sm5, sm8, xy9, bw6, xy6, g1, … | 1–7 each | name fine; the number is non-numeric (promos, "RC", "SV") or the card is an energy/special | — |

The store's evidence agrees exactly: of the 39 `pokemon:en` searches that found nothing, 15 are
dp1, 3 bw1, 7 30th-c, 6 MEP promos, 2 xyp, 1 svp (Pikachu ex 106, typed by hand at $9), 1 Base
Set. Of the 248 that found a card, **all 248 found the right card** (one name spelled differently).
So the search is accurate when it matches; it just often can't.

Other things about this path:

- **Promos have no printed size**, so step (a) (`number=NNN/SSS`) is skipped; step (b) (the set by
  its code) never finds English sets — JustTCG's set names don't carry codes like "PAL" (the
  `pokemon:set:*` map has 26 codes tried, 1 found, each a wasted request retried weekly); step (c)
  is the name alone, 20 results. Promos without a product ID therefore never price.
- **Number padding.** The app sends `025/165` (3-digit). TCGplayer writes SWSH/SV numbers that way,
  but in **every XY, SM, BW, DP and EX set the numbers under 100 are unpadded ("12/107")**. If JustTCG's
  `number=` filter is exact, step (a) misses for all of those sets and the card is found, if at all,
  by the name-only step: 3 requests instead of 1, and a popular name ("Pikachu", "Charizard") can be
  missing from the first 20. Store lines in those sets did get priced, so one of the steps works;
  which one decides the budget. One live request settles it (Section 6).
- **Over-broad set names.** "XY" (xy1) is inside every XY-era set name, "Scarlet & Violet" (sv01)
  inside 151 / Promo Cards / Energies, "Evolutions" (xy12) inside "SV: Prismatic Evolutions", "Mega
  Evolution" (me01) inside the ME promo and energy sets, "Hidden Fates" inside its Shiny Vault,
  "Celebrations" inside its Classic Collection. The number keeps these apart almost always, but the
  set-size check isn't applied in this path (it is in the siblings search), so an xy1 Pikachu 42 and
  another XY set's Pikachu 42 would tie. An alias table makes the set an exact match.
- **No fallback.** For every one of these 9,222 cards TCGdex has no TCGplayer price block, so a
  failed search means an empty price panel and a manual price: 39 of the store's lines (30th
  Celebration ×12, Base Set ×7, MEP ×4, XY ×3…).

**Fix:** a table TCGdex set id → JustTCG set name (JustTCG's `set_name` is TCGplayer's group name,
verbatim, in every cached card), used by the function instead of containment, plus the printed size
check it already uses for siblings; send the number unpadded for pre-SWSH sets if the live test
says so; skip step (b) for English. Longer term, ask TCGdex for the IDs (they exist for every
set from sv02 on), or let the app remember a found product per card (it already keeps `price_map`).

### 3.4 Fallback and warning quirks

- **`marketPriceIn` takes the first market price in the block.** TCGdex's price block for a reverse
  version lists `normal` first for 4,452 of 6,554 reverse versions, and 417 holo versions start with
  another printing. So the fallback NM for a reverse holo is usually the **plain card's** market price
  (Exeggcute PRE: fallback $0.09 for a $0.20 reverse), and the ⚠️ "TCGdex says NM is …" check compares
  JustTCG's reverse price with the plain card's market. Fix: pick the key by finish
  (`reverse-holofoil` / `holofoil` / `normal`), as `cardmarketIn` already does with "-holo".
- **The ⚠️ warnings can't see a wrong product** (Section 1). A cheap extra check that would: JustTCG's
  card number ≠ the TCGdex card's number, or JustTCG's set ≠ the set's known TCGplayer group.
- **85 products have no price rows at all on TCGplayer** (staff/winner stamps, old promos, "Alph
  Lithograph") and **7 product IDs don't exist any more** (svp Miraidon 148 #593282, swshp Rayquaza
  SWSH029 #619563, sv03 Town Store 196 Play! stamp #811245…): those versions show with no price.
- **TCGdex's rarity labels** differ from TCGplayer's ("Holo Rare V" ↔ "Ultra Rare", "Shiny rare" ↔
  "Shiny Holo Rare"): cosmetic, but `specialRarity`-style logic should not depend on either.

### 3.5 The JustTCG budget

Starter: 1,000 requests a day (reset 00:00 UTC = 5 PM PDT), 10,000 a month, 100 cards per batch.
At 2:20 PM today: **771 used**, 5,301 this month. Why it's high:

- Each selected English Pokémon card = 1 batch lookup (all its versions) **+ 1 siblings search**
  (every card, decision 206/234), cached 6 h per card. ≈ 2 per card looked at, even briefly (after
  the 400 ms settle).
- A card with no product ID adds up to 3 search requests (4 with the set-code step), and a card
  that finds nothing is retried after a day (misses) or 7 days (price_map).
- The set-code step for English codes: 25 wasted requests so far, repeated weekly.

Options: skip the siblings search for sets where TCGdex already has IDs for every version (most SV
sets), or run it once per set and keep it 7 days; drop step (b) for English; the alias table (3.3)
turns 3-request searches into 1; or the Professional plan (5,000/day). With the holidays coming the
daily cap at 5 PM is a real risk on a busy Saturday.

### 3.6 The store's own buy lines (949)

- **Priced from a clearly wrong product (5):** Team Magma's Groudon MA 9 (DMG, paid $1; the real
  card's market is $150 Holofoil / the deck reprint $13), Dark Marowak TR 7 (MP, paid $3.50; real
  $200 / reprint $15.65), Machamp BS 8 1st Edition ×2 (priced from the Deck Exclusives product;
  defensible, see 3.1 b), Mimikyu ex JTG 069 Journey Together Stamped (Jumbo product, $4.36 vs the
  right $4.46: harmless, pre-fix), Mr. Mime AQ 95a / Drowzee AQ 74b (the other a/b card).
- **Priced by fallback because the printing didn't fit (1):** Sylveon PRE 040 Master Ball,
  `tcgdex_fallback` $33.04.
- **Typed by hand because nothing matched (39):** 30th Celebration Illustration rares ×9 and Classic
  Collection ×3, MEP promos ×4, Base Set ×7, Pikachu ex SVP 106, Sharpedo EX PRC 91, Gible MT 85 ×2,
  Ducklett BLW 36, Solgaleo ◇ UPR 89, Dragonite GX UNM 152, Volcanion EX STS 26, Super Rod DRV 20,
  Staryu/Starmie/Evosoda XY… All in Section 3.3's sets.
- **Special rarities (247 lines, every one checked):** apart from the Groudon and the Jumbo Mimikyu
  above, all priced from the right product or by the right search result. Illustration rares, SIRs, Hyper rares, Amazing rares, Shiny Vault, Trainer
  Gallery (TG30 Urshifu is right), Galarian Gallery: no wrong-card pricing in the saved data. The
  team's report therefore came from a card looked at but not bought, or from one of the sets above.
- **Japanese (62 lines):** right. The old "N/A"-numbered sets match by name as designed; the
  trainer-prefixed names (Erika's Ivysaur for PMCG6 Ivysaur) are JustTCG's names for the same cards.
- Lines older than 2026-10-11 keep whatever product they were saved with; REPRICE? and exports reuse
  it (`todaysPrices` keeps `line.tcgplayer_id`).

### 3.7 Smaller things seen on the way

- 780 TCGdex "stamped" versions share the plain card's product (set-logo 402, set-logo+staff 68,
  25th-celebration 64, Prize Pack 48, no-e-reader 30, McDonald's 24…): the version shows a stamp but
  prices as the plain card. Usually right (TCGplayer doesn't sell the stamp apart) — the siblings
  search already re-matches the ones TCGplayer does sell (decision 235).
- 104 plain versions point at a product whose name says "(Prerelease)", "(Non-Holo)", "(e-League)",
  "(Target Promo)": mostly TCGdex's only entry for a promo-only card (SM promos ×60), fine; a few
  are real (np Treecko 3 reverse → e-League product).
- TCGdex has no card for `me01-195`; "Yellow A Alternate" (xya) is a six-card set I can't place.
- TCGplayer's Japanese catalogue is a separate category (85, 461 sets, "SV2a: Pokemon Card 151"…);
  the app's Japanese path (JustTCG `pokemon-japan`, by English name) wasn't emulated. The store's
  Japanese lines are right; Japanese pattern cards are priced from their own "(Poke Ball Pattern)"
  product by name, as decision 225 built.

---

## 4. Suggested order of work

1. **Pattern/own-product printings read as the version's finish** (`prices.js` `resultFor` /
   `conditionVariants`: apply `asFinish` whenever the version's product isn't the plain version's;
   `printings.js` untouched). Fixes 835 versions incl. every Poké Ball / Master Ball card and SM promo.
   Small; test with Exeggcute PRE 001 Master Ball (expect JustTCG's five conditions, no "fallback").
2. **`WRONG_PRODUCTS` override** in `printings.js` for Section 3.1 (start with the 7 Trainer Gallery
   cards, svp Charmander 044, the Deck Exclusives plain versions, Rumble, McDonald's, Aquapolis a/b),
   from `data/fixes.md`; and report them to TCGdex.
3. **Set alias table** for the search (`prices` function): TCGdex set id → JustTCG `set_name`, exact;
   plus the size check; drop the set-code step for English. Unblocks 1,083 cards and the 118
   ambiguous ones; cuts requests. Needs one `GET /sets?game=pokemon` to confirm JustTCG's names equal
   TCGplayer's (the cache says they do).
4. **`marketPriceIn` by finish** (`printings.js`). Tiny.
5. **A "JustTCG card ≠ TCGdex card" guard** in the function (number/set mismatch → log + treat as no
   match) so the next TCGdex mistake can't price silently.
6. **Database:** correct `tcgplayer_id` / `justtcg_card_id` on the 5 mispriced lines (or re-add them);
   decide whether to re-run REPRICE? on affected collections.
7. **Budget:** siblings search per set / skip when complete; or Professional.
8. Ask TCGdex for product IDs on sv01, swsh1, swsh3.5, 30th and the SM/XY/BW/DP sets (an issue with the
   list from `data/findings.json`), which would move 9,222 cards from path B to path A.

---

## 5. Not checked, and why

- **Live JustTCG answers** for the wrong-product list (does JustTCG return the same wrong product for
  #263784? yes, by construction: the lookup is by TCGplayer ID, and the 57 cached product lookups with
  oddities were all sealed products or naming differences, never a different card).
- JustTCG's `q` matching and whether `number=012/107` matches "12/107" (Section 3.3).
- Japanese search emulation.
- Whether the 20-result cap hides cards for popular names in the no-ID sets.

## 6. Live JustTCG checks worth running (≈ 15 of the 100 you allowed)

Run after 5 PM PDT (the daily counter resets at 00:00 UTC) or on a quiet morning. Each is one request
unless noted. From the store sign-in they go through the app's function; the raw calls are
`GET https://api.justtcg.com/v1/...` with the key in `x-api-key`.

1. `GET /games` — plan and the day's remaining count (the Settings → Test button does this).
2. `GET /sets?game=pokemon` (2–3 pages) — JustTCG's set ids and names, to build the alias table.
3. `GET /cards?game=pokemon&q=Mightyena&number=012/107` then `…&number=12/107` — padding.
4. `GET /cards?game=pokemon&q=Purugly&number=036/130` — does "Diamond and Pearl" come back (then the
   alias fixes it) or nothing at all.
5. `GET /cards?game=pokemon&q=Gardevoir ex&number=245/198` — sv01's SIR via the search.
6. `GET /cards?game=pokemon&q=Dusknoir&number=TG06/TG30` — Trainer Gallery via the search.
7. `GET /cards?game=pokemon&q=Charizard GX&number=SV49/SV94` — Shiny Vault via the search (20-cap test).
8. `POST /cards` with `[{"tcgplayerId":"264221"},{"tcgplayerId":"263784"},{"tcgplayerId":"610637"},
   {"tcgplayerId":"89827"},{"tcgplayerId":"125255"}]` — one request: the right and wrong Mimikyu V,
   the Master Ball Exeggcute (printing "Holofoil"), the right and wrong Team Magma's Groudon.
9. `GET /cards?game=pokemon&q=Pikachu ex&number=106` and `…&q=Pikachu ex` (promos, no size).

## 7. Needs your answer

- [ ] Fix order: do you want 1–5 of Section 4 as one release, or the pattern fix alone first?
- [ ] The two Deck-Exclusives buys (Team Magma's Groudon $1 DMG, Dark Marowak $3.50 MP): leave the
      saved prices, or correct the lines' products so REPRICE?/export use the real card?
- [ ] Base Set Machamp: TCGplayer's main Base Set Machamp product vs the Deck Exclusives one for
      Unlimited — which do you want the override to use?
- [ ] Override table in the app vs waiting for TCGdex to fix the data (or both).
- [ ] The set-alias table: should it also cover Japanese set names (TCGplayer category 85), or leave
      the Japanese path as it is?
- [ ] JustTCG plan: stay on Starter with the request savings, or move to Professional before the
      holidays?
- [ ] The siblings search per card: keep (finds Cosmos/stamped versions) or limit it to sets where
      TCGdex lacks products?
- [ ] May I run the Section 6 requests next time you're signed in (≈ 15 of the 100)?
- [ ] "Yellow A Alternate" (TCGdex xya, 6 cards): what set is this on TCGplayer?
