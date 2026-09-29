# PUG Pricing Tool — Design Specification

| | |
|---|---|
| **Product** | PUG Pricing Tool |
| **Owner** | Players' Union Games (PUG) |
| **Spec version** | 1.0 — 2026-09-29 |
| **Status** | Approved for build, Phases 1–10. Export is specified separately, later. |
| **Live URL (after launch)** | `https://dazeyama.github.io/pug-pricing-tool/` |
| **Project folder** | `C:\ClaudeProjects\pug-pricing-tool` |

---

## 0. How to use this document

This spec is written for an engineer building the app with Claude Code. It is the single source of truth. Where it says **must**, that is a requirement. Where it says **should**, use judgement. If something here conflicts with the owner's later instructions, the owner wins. Update this file so the conflict doesn't come back.

1. **Read the whole document before starting.** Sections 1–14 describe the finished product. Section 15 splits the build into ten phases.
2. **Build one phase at a time, in order.** Each phase ends at a state the owner can open on `localhost` and check. Don't start the next phase until the owner has reported back on the current one.
3. **The owner is QA** (see Appendix A). Claude Code does not run long test sessions, browse previews or take screenshots. It builds and fixes build errors, then hands off with a short "Where to look" checklist. The checklists in Section 15 are the starting point.
4. **Two earlier projects are reference material only** (Section 3). Read them for conventions. Never edit them.
5. **Export is out of scope** for this spec, beyond placeholder buttons. It gets its own design doc later.
6. **No secrets in this document, the repo or the code.** The JustTCG API key is entered in the app's Settings tab and stored server-side (Section 4.5).

---

## 1. Overview

### 1.1 Purpose

PUG buys trading cards from customers over the counter, and sometimes buys whole collections that take several days to work through. Staff need to:

- **Price cards fast.** Type what's printed on the card, see the right printing, see condition-specific market prices, and add it to the buy.
- **Record every card bought** in a shared database with enough detail (printing, finish, condition, price) to export into the store's inventory system, Crystal Commerce, later.
- **Look back** at what was bought on any day, what's in any collection, and who changed what.

### 1.2 Games

- **Magic: The Gathering.** Card data from Scryfall.
- **Pokémon TCG**, in English and Japanese. Card data from TCGdex.
- **Condition-specific prices** for both games from JustTCG.

### 1.3 Goals

- Pricing a card takes **one typed line and one keypress** when the query identifies a single printing.
- Several store computers see the **same live data**.
- **Nothing is lost:** in-progress buys survive refreshes and crashes, and the changelog records every change to buy and collection contents.
- **Visual and behavioural continuity** with the owner's earlier apps, Collection Manager and Audit Tool.

### 1.4 Non-goals (this spec)

- **Exporting to Crystal Commerce.** Only placeholder buttons are built, plus the Master Crystal Inventory upload the export will need (Section 14).
- **Phones and tablets.** The target is desktop and laptop screens at 1080p and up (Section 7.10).
- **Offline use.** The app requires a connection (Section 7.9).
- **Undo or rewind from the changelog.** The changelog is view-only (Section 12).
- **Individual staff accounts.** One shared store password protects the app. "Users" are color-coded staff profiles that are picked, not logged into (Section 7.3).
- **Sealed product, graded slabs, oversized cards.** Singles only. **Magic tokens, emblems and art cards are excluded** (owner's decision, 2026-09-29): Scryfall's default search leaves these "extras" out, and the main search keeps it that way (no `include_extras`).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Buy** | One purchase of cards from a customer. There are two kinds: a **walk-in buy** made on the Price tab, and a **collection**. Both are stored in the same `buys` table. |
| **Walk-in buy** | A buy made at the counter on the Price tab. It's a **draft** while cards are being added and becomes **confirmed** when CONFIRM BUY is pressed. Only confirmed walk-in buys appear on the Calendar. |
| **Collection** | A large buy worked on over several days by several staff. It has a customer name, phone number, notes and a status: **Processing → Priced → Paid/Ours**. Every card is saved as it's added, and there is no confirm step. |
| **Line** | One row of a buy: quantity × one exact printing, finish, condition and unit price. |
| **Printing** | One specific card in one specific set with one collector number (a Scryfall card object or a TCGdex card object). |
| **Finish** | Magic: non-foil, foil or etched. Pokémon: normal, holo or reverse holo. 1st Edition is a separate flag. |
| **Condition** | NM, LP, MP, HP or DMG (Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged). Default NM. |
| **Market price** | JustTCG's price for the printing, finish and condition. |
| **Purchase price** (unit price) | What's recorded for a line: the market price, or a manual price if one was entered. |
| **Cash / Credit** | What the store pays: the purchase total × the Cash % or Credit %. These come from **Master Buy Percentages** in Settings (defaults 33% and 66%), unless the buy has a **custom rate** (Section 8.9.1). |
| **User** | A staff profile (name + color) picked from the header dropdown. It isn't a login. |
| **Device** | One browser on one store computer, identified by a random ID stored in that browser and given a friendly name ("Front Counter"). |
| **Master Crystal Inventory** | The full inventory CSV exported from Crystal Commerce ("CC") and uploaded in Settings. The future export uses it to match set names. |
| **Store password** | The one shared password that unlocks the app on a device. |

---

## 3. Reference projects

The owner has two earlier apps whose look and conventions this app continues. They're on the owner's PC:

| Project | Path | What it is |
|---|---|---|
| **Collection Manager** ("CM") | `C:\ClaudeProjects\collection-manager` | A local Flask + SQLite app with a vanilla JS front end. Dark tabbed UI, panels, and the **changelog timeline**. |
| **Audit Tool** ("AT") | `C:\ClaudeProjects\audit-tool` | A static JS app on GitHub Pages. Large card stage over a background image, the docked **list panel**, and the **Scryfall request transport**. |

**Rule: read-only.** Never edit, move or commit anything in either folder. Copy what you need into this project.

If those folders aren't available on your machine, this section and Appendix B hold everything the build needs from them.

### 3.1 What to take from Collection Manager

| Area | Where in CM | What to reuse |
|---|---|---|
| Color tokens | `static/style.css` `:root` | All of `--bg`, `--panel`, `--panel-2`, `--border`, `--text`, `--muted`, `--accent`, `--accent-2`, `--good`, `--bad`, `--warn` and the 12 `--pal-*` colors. Copy them verbatim (Appendix B.1). |
| Header layout | `templates/index.html`, `style.css` `header` … `.search-results` | Brand block (logo + title + sub-line) on the left, pill-shaped search on the right, tabs underneath. |
| **Tabs and tab animation** | `style.css` `nav#tabs`, `.tab`, `.tab.active`, `.tab.tab-apart`, `.panel.active` + `@keyframes fade` | Equal-width outlined tabs. An idle tab lifts on hover with a padding transition. The active tab has a 3px accent underline. Changelog is pushed right with `margin-left:auto`. Panels fade in over 0.15s. Copy exactly (Appendix B.2). |
| Panels | `.cardpanel`, `.cardpanel-head`, `.cardpanel-body` | The panel look for buy panels on day pages and for changelog entries. The colored top border comes from `--c`. |
| Row tables | `.deck-table`, `.drow`, `.cell-qty`, `.cell-name` | Table style for card rows inside day-page buy panels. |
| Buttons | `.btn`, `.btn.primary`, `.btn.small`, `.btn.ghost`, `.btn.danger`, `.btn.danger-ghost`, `.btn.good-ghost`, `.icon-btn` | Every ordinary button. |
| Modal and toast | `.modal`, `.modal-box`, `.modal-head/body/foot`, `.toast` | Every dialog and notification. |
| Loading cues | `#loading-bar`, `.btn.busy` | A sweep bar across the top while requests run, and a spinner on the pressed button. |
| Search results dropdown | `.search-results`, `.search-group`, `.result-btn`, `.flash-target` + `@keyframes flashTarget` | Global search results and the jump-and-flash on the target. |
| **Changelog timeline** | `static/app.js` `changeFeedHTML()`, `dayHeading()`, `CHANGE_PAGE = 20`; `style.css` `.timeline` … `.tl-*`, `.ch-mark` | The whole timeline (Section 12, Appendix B.3). |
| Write discipline | README "Keeping the data honest" | Every write is one transaction, and a change and its changelog entry commit together. Buys carry a `version` so a stale page can't overwrite newer data. |
| Name normalization | README "Card names" | Folding for search: trim and collapse whitespace, fold typographic quotes and dashes to ASCII, `Æ`→`ae`, strip accents, casefold. |

### 3.2 What to take from Audit Tool

| Area | Where in AT | What to reuse |
|---|---|---|
| Background art | `background.webp` (2160×904) | Copy to `public/background.webp`. Drawn behind the **whole Price tab** (and the collection pricing screen) at **50% opacity**, `center / cover` (AT `.stage::before`). |
| Card presentation | `.card-wrap`, `.card-img`, `.card-thumb`, `--card-radius: 4.75% / 3.5%`, `--shadow` | Large card with real-card corner radius and shadow. **Two-stage loading:** the small image is shown blurred until the large one arrives. |
| List panel | `.list-panel`, `.list-head`, `.list-title`, `.row` | The Price screen's buy-list sidebar: same panel, heading style, row height and hover. AT docks it on the left; here it docks on the **right**. |
| Scryfall transport | `app.js` `enqueue()`, `scryfallFetch()`, `config.js` | One serialized queue, about 100ms between requests, retry on 429/503/network error with backoff that honors `Retry-After`. |
| Name catalog | `app.js` + `config.js` `CARD_NAMES_MAX_AGE_DAYS: 7` | Cache Scryfall's `/catalog/card-names` for 7 days for fuzzy name correction. |
| Static-site deployment | README | GitHub Pages under `dazeyama.github.io`. |
| start/stop scripts | `start.bat`, `stop.bat` | The pattern: free the port, start the server, open the browser, **press SPACE to stop**. `stop.bat` kills whatever listens on the port. |
| `.gitignore` | `.gitignore` | Start from AT's file and add the entries in Section 4.7. |

---

## 4. Architecture

### 4.1 Summary

```
 Store computers (Chrome/Edge)                         Cloud
┌───────────────────────────────┐       ┌──────────────────────────────────────┐
│  PUG Pricing Tool (React SPA) │       │  GitHub Pages  (static site hosting) │
│  served from GitHub Pages     │◄──────┤  built by GitHub Actions on push     │
│                               │       └──────────────────────────────────────┘
│  ── direct, no key ────────────────►  Scryfall API   (Magic card data)
│  ── direct, no key ────────────────►  TCGdex API     (Pokémon card data)
│                               │       ┌──────────────────────────────────────┐
│  ── supabase-js (JWT) ─────────────►  │  Supabase                            │
│      • Postgres + RLS         │       │   • Postgres: buys, lines, events…   │
│      • Realtime subscriptions │       │   • Realtime                         │
│      • Storage (CSV files)    │       │   • Storage: master-inventory bucket │
│      • Edge Function calls    │       │   • Edge Function `prices` ──────────────► JustTCG API
│                               │       │     (holds the JustTCG key)          │    (x-api-key)
└───────────────────────────────┘       └──────────────────────────────────────┘
```

- The front end is a **static single-page app** (React + Vite) hosted on **GitHub Pages**.
- The shared data lives in **Supabase**: Postgres, Realtime, Storage, Auth and Edge Functions.
- **Scryfall and TCGdex are called straight from the browser.** They're public and keyless, and allow browser use.
- **JustTCG is only ever called from the Supabase Edge Function `prices`.** The browser never sees the JustTCG key. JustTCG's documentation forbids exposing keys in client-side code.

### 4.2 Technology choices

| Concern | Choice | Notes |
|---|---|---|
| UI | **React 18+ with JavaScript (JSX)**, built with **Vite** | TypeScript isn't used, so the owner can read the code more easily. Use JSDoc on shared data shapes. |
| Routing | `react-router-dom` with **`HashRouter`** | GitHub Pages can't rewrite deep links, and hash routes survive a refresh. |
| Styling | Plain CSS files that port CM's tokens and classes | No Tailwind or CSS-in-JS. Continuity with CM matters more. |
| Data and auth | `@supabase/supabase-js` v2 | |
| Fuzzy matching | `fuse.js` | Name typo tolerance (Section 8.3). |
| CSV parsing | `papaparse` | Master Crystal Inventory validation. |
| Dates | `date-fns` + `date-fns-tz` | Every "day" is computed in the store's time zone. |
| Server code | Supabase Edge Functions (Deno) and Postgres functions (PL/pgSQL) | |
| Tooling | Node LTS, npm, Supabase CLI (`npx supabase`), Git, GitHub CLI (`gh`) | |

Keep dependencies to this list. Ask the owner before adding anything else.

### 4.3 Environments

There are **two Supabase projects**, so testing on `localhost` never touches the store's real data:

| Environment | Supabase project | Project URL | Used by |
|---|---|---|---|
| **dev** | `pug-pricing-dev` | `https://psucrzljraxeootwnltf.supabase.co` | `npm run dev` / `start.bat` on localhost |
| **prod** | `pug-pricing-prod` | `https://zvxquzcfffmxwizonxuo.supabase.co` | The GitHub Pages build |

- Supabase's current key names: the **publishable key** (`sb_publishable_…`) replaces the old "anon" key, and the **secret key** (`sb_secret_…`) replaces the old "service_role" key. Both are under Project Settings → API Keys. Use the new keys, not the "Legacy" tab.
- The Supabase URL and **publishable key** come from `.env.development` and `.env.production`, both git-ignored. The Pages build gets them from **GitHub Actions repository variables**. The publishable key is designed to be public, and Row Level Security is what protects the data.
- The **secret key is never used in the front end**, never pasted into chat, and never committed. Edge Functions receive it automatically from Supabase.
- Supabase's free plan allows two active projects. If the owner's account has no free slot, run dev against prod with extreme care and tell the owner. Don't silently share one project.
- **Free-plan caveats** the owner has been told about: projects **pause after 1 week of inactivity** (restore from the Supabase dashboard), and the free plan includes **no automatic backups**. Upgrading prod to Pro ($25/month) removes both. Settings covers backups either way (Section 11.5).

### 4.4 Authentication: the shared store password

- Supabase Auth holds **one** user account for the store, created by the owner in each project with the store's real email address, **`playersuniongamecoop@gmail.com`**, and "Auto Confirm User" on. The email is set by `VITE_STORE_LOGIN_EMAIL`. It isn't secret (it's visible in the built site); the password is what protects the app.
- **Public sign-ups must be OFF** in both projects (Authentication → Sign In / Providers → "Allow new users to sign up" off). Otherwise anyone could create an account with the public publishable key and pass the `authenticated` RLS policies. Phase 1 must confirm this is off before any real data exists.
- The app opens on a **login screen with a single password field**, the PUG logo and "PUG Pricing Tool". A correct password signs that email in, and supabase-js keeps the session in the browser, so a device stays signed in.
- Wrong password: an inline error, no lockout. Settings has **Sign out**.
- **Changing the password:** the engineer documents in `docs/SETUP.md` how to set a new one: the dashboard's user menu if it offers it, otherwise a one-off Admin API call (`auth.admin.updateUserById`) run locally with the secret key. Don't rely on password-recovery emails; Supabase's built-in mailer only delivers to project team members unless custom SMTP is set up.
- **All tables have RLS enabled.** Policies allow `authenticated` full access to app tables, except `secrets`, which has **no** policies, so only the secret (service-role) key can touch it.
- The app never mentions Auth users. The only "users" in the UI are staff profiles (Section 7.3).

### 4.5 API keys (Settings → API Keys)

The owner wants to enter, edit and delete API keys in Settings, and the key must never reach the browser. So:

- Keys live in the `secrets` table. RLS denies all client access to it.
- The Edge Function **`secrets`**, which requires the signed-in store session (Section 5.3, *Edge Function auth*), supports `set`, `delete` and `status`. `status` returns only a **masked** value (`tcg_••••••••a325`), the last updated time, and a live test result (plan name and remaining quota).
- The Edge Function **`prices`** reads the key with the service role and calls JustTCG.
- Only JustTCG needs a key today. The Settings UI lists keys by provider so more can be added later.
- The key from the owner's original notes must be entered through Settings after Phase 5. **It must not appear in any file in the repo.**

### 4.6 Repository layout

```
pug-pricing-tool/
├── CLAUDE.md                     project rules for Claude Code (Appendix A)
├── README.md                     a very short public description of what the tool is for
├── docs/
│   ├── DESIGN_SPEC.md            this document
│   ├── SETUP.md                  how to run, deploy, change the store password
│   └── assets/pug-logo.webp      the logo as supplied (2400×2400, transparent)
├── public/
│   ├── background.webp           copied from audit-tool
│   ├── pug-logo.webp             header logo
│   └── favicon.png               64×64 generated from the logo
├── src/
│   ├── main.jsx, App.jsx         router, auth gate, layout
│   ├── styles/                   tokens.css (CM colors), base.css, tabs.css, panels.css,
│   │                             timeline.css, price.css, calendar.css …
│   ├── lib/
│   │   ├── supabase.js           client
│   │   ├── scryfall.js           queue + endpoints (Section 5.1)
│   │   ├── tcgdex.js             queue + endpoints (Section 5.2)
│   │   ├── prices.js             calls the `prices` Edge Function (Section 5.3)
│   │   ├── query.js              search-line parser (Section 8.2)
│   │   ├── normalize.js          name keys (Section 3.1)
│   │   ├── lineFormat.js         Moxfield-style line text (Section 8.9)
│   │   ├── money.js              totals, cash/credit, rounding
│   │   └── time.js               store time zone helpers
│   ├── state/                    React context: session, current user, device, settings
│   ├── components/               Header, Tabs, UserMenu, Modal, Toast, CardImage, …
│   └── pages/                    PricePage, CollectionsPage, CollectionPage, CalendarPage,
│                                 DayPage, SettingsPage, ChangelogPage, LoginPage
├── supabase/
│   ├── migrations/               0001_schema.sql, 0002_rls.sql, 0003_functions.sql, …
│   └── functions/
│       ├── prices/index.ts
│       └── secrets/index.ts
├── .github/workflows/deploy.yml  build + deploy to Pages on push to main
├── start.bat / stop.bat
├── vite.config.js                base: '/pug-pricing-tool/'
└── package.json
```

`docs/DESIGN_SPEC.md` and `docs/assets/pug-logo.webp` are already in the folder before scaffolding. When scaffolding Vite into the non-empty folder, **choose "Ignore files and continue". Never let the scaffolder remove existing files.**

### 4.7 Git, GitHub and deployment

- **Repository:** `pug-pricing-tool` on the owner's GitHub account (`dazeyama`), **public**, created with `gh repo create`. GitHub Pages is served by GitHub Actions.
- **Branching (owner's choice):** commit to `main`. **Commit when a phase or fix is done, but push only when the owner asks.** A push to `main` triggers the deploy workflow, so **pushing is publishing**.
- **Deploy workflow:** on push to `main`: `npm ci`, `npm run build` with the prod Supabase variables, upload `dist/`, deploy to Pages.
- **`.gitignore`:** start from AT's file and add `.env*`, `dist/`, `supabase/.temp/`, `*.csv`, and the owner's original notes file (`PUG Pricing Tool.txt`), which contains a live API key.
- **Never commit:** API keys, the Supabase secret key, customer data, CSV exports, backups.

### 4.8 start.bat / stop.bat

Mirror AT's scripts:

- **Port:** fixed at **5180** (CM uses 5057, AT uses 8091). Vite runs with `--port 5180 --strictPort`.
- `start.bat`: `cd` to the script folder, call `stop.bat` to free the port, run `npm install` if `node_modules` is missing, start `npm run dev -- --port 5180 --strictPort` in its own window, wait 2 seconds, open `http://localhost:5180/`, print the URL, then **"Press SPACE to end program."** SPACE calls `stop.bat`.
- `stop.bat`: kill whatever is `LISTENING` on `:5180` and report what it did (AT's `netstat`/`taskkill` pattern).
- Vite hot reload means edits show without a manual refresh.

### 4.9 Store time zone and currency

- `STORE_TZ = 'America/Los_Angeles'` in `src/lib/time.js`. The database stores UTC `timestamptz`. The Calendar day, day pages, "Today/Yesterday" in the changelog and "created" dates are all computed in `STORE_TZ`.
- **Currency** is USD. Show `$1,234.56`. Store numbers as `numeric(10,2)`.

---

## 5. Data sources

Division of labour: **Scryfall and TCGdex supply everything about the card** (name, set, number, image, finishes, treatments). **JustTCG supplies only condition-specific prices.**

### 5.1 Scryfall (Magic)

- Base URL: `https://api.scryfall.com`. No key.
- **Transport:** port AT's queue. All Scryfall calls go through one serialized queue with ≥100ms between requests and retries on 429/503/network errors (backoff honoring `Retry-After`, 5 tries max). Nothing is fired in parallel.
- **Typing:** debounce 250ms. When a newer query supersedes an older one, drop the older one's queued requests or ignore their responses.
- **Caching:** follow Scryfall's guidance to cache for at least 24 hours. Use in-memory caches plus `localStorage` where noted.

| Need | Endpoint | Cache |
|---|---|---|
| Name catalog for fuzzy correction | `GET /catalog/card-names` | `localStorage`, 7 days (AT pattern) |
| All sets (`code`, `name`, `printed_size`, `released_at`, `set_type`, `icon_svg_uri`) | `GET /sets` | `localStorage`, 24h |
| Candidate printings for a query | `GET /cards/search?q=…&unique=prints&order=released&dir=desc` | memory, 24h |
| All printings of one card in one set (details-panel toggles) | `GET /cards/search?q=oracleid:<oracle_id> set:<code>&unique=prints&include_extras=true&include_variations=true` | memory, 24h |

**Fields used from a Scryfall card:** `id`, `oracle_id`, `name`, `card_faces[]`, `set`, `set_name`, `collector_number`, `rarity`, `released_at`, `lang`, `image_uris` (or `card_faces[0].image_uris`), `finishes` (`nonfoil`/`foil`/`etched`), `frame`, `frame_effects`, `promo_types`, `border_color`, `full_art`, `textless`, `promo`, `variation`, `tcgplayer_id`, `tcgplayer_etched_id`, `prices` (`usd`, `usd_foil`, `usd_etched`, used only as the fallback price in Section 8.7).

**Images:** show the `small` image blurred while `large` loads (AT two-stage). Use `large` for the selected card and `small` for suggestion thumbnails. Follow Scryfall's image rules: never crop, cover, stretch or watermark card images, and never place overlays over the bottom (copyright/artist) strip. Credit "Card data and images from Scryfall" in the Settings footer.

**Double-faced cards:** show the front face, with a **⟲ Flip** icon button on the selected-card preview to show the back.

**Language:** English printings only (`lang:en`), so add `lang:en` to every search.

### 5.2 TCGdex (Pokémon)

- Base URL: `https://api.tcgdex.net/v2/{lang}` with `lang` = `en` or `ja`. No key.
- Same serialized-queue transport as Scryfall (≥100ms spacing, retries).

| Need | Endpoint | Cache |
|---|---|---|
| All sets per language (`id`, `name`, `cardCount.official`, `cardCount.total`) | `GET /v2/{lang}/sets` | `localStorage`, 24h |
| Set detail, including the **`abbreviation`** field (printed set code, e.g. `PAL`) | `GET /v2/{lang}/sets/{id}` | `localStorage`, 7 days, fetched lazily per set |
| Name list for fuzzy correction | derived from `GET /v2/{lang}/cards` (card briefs) | IndexedDB, 7 days |
| Candidate printings | `GET /v2/{lang}/cards?name=<name>` and/or `&localId=<number>` | memory, 24h |
| Full card (variants, rarity, pricing, image) | `GET /v2/{lang}/cards/{id}` | memory, 24h |

**Fields used from a TCGdex card:** `id`, `localId`, `name`, `image`, `rarity`, `set` (`id`, `name`, `cardCount`), `variants` (`normal`, `reverse`, `holo`, `firstEdition`, `wPromo`), `variants_detailed` where present (newer data includes third-party IDs and per-variant pricing), and `pricing.tcgplayer` (fallback price only).

**Images:** TCGdex's `image` is a base URL. Append `/high.webp` for the selected card and `/low.webp` for thumbnails.

**Backup images** (owner's request, 2026-09-29). TCGdex has no picture of 7% of English cards (1,590, including whole sets such as Shining Fates' Shiny Vault, Dragon Majesty, Shining Legends, Crown Zenith's Galarian Gallery and the trainer kits) and 70% of Japanese cards (8,899). For those, `src/lib/pokemonImages.js` tries, in order:
1. **pokemontcg.io's image CDN**, `images.pokemontcg.io/<set>/<number>.png` (and `_hires.png`), for English cards. Its set IDs are matched to TCGdex's by ID, by folded name from `GET api.pokemontcg.io/v2/sets` (cached 7 days; that API often answers 500/502 and works on retry), or by a short alias list where both differ (`30th-c` → `me55c`). A missing card there still returns a card-back picture with status 404, so each address is checked with a `HEAD` request first (the CDN allows CORS). Plain numbers drop leading zeros (`006` → `6`); prefixed ones don't (`SV001`, `TG05`). Sets numbered differently from TCGdex (the Classic Collections keep the original numbers: Pikachu is #014 in TCGdex, #58 there) are then matched by card name against the set's full card list (fetched once), comparing folded names ("Zekrom GX" = "Zekrom-GX") and taking only a single match. This covered about 930 of the 1,590 missing English images.
2. **TCGplayer's product image**, `tcgplayer-cdn.tcgplayer.com/product/<id>_200w.jpg` (and `_in_1000x1000.jpg`), using the TCGplayer ID on TCGdex's full card (`variants_detailed[].thirdParty.tcgplayer`). Each is loaded first and rejected if TCGplayer refuses it (403) or sends its landscape "Image Coming Soon" banner (a card is always taller than wide). English only: TCGdex has no TCGplayer IDs for Japanese cards.
3. Otherwise the **Pokémon card back** (`public/pokemon-card-back.webp`, owner's decision 2026-09-29), in the thumbnail and as the selected card; the name stays in the info panel and tooltips. A thumbnail or card image that fails to load also ends here, never a broken-image icon. (Magic cards, which Scryfall always has pictures of, keep a plain panel with the name and number.)

Note: TCGdex gives **30th Celebration** (`30th`, 158 cards, all with images) and **30th Classic Collection** (`30th-c`, 30 cards, no images or TCGplayer IDs) the same printed code, `30C`.

Japanese cards have no backup yet. JustTCG (Phase 5) returns a TCGplayer ID per card, which can point the selected card at TCGplayer's image then. Settings' footer credits pokemontcg.io and TCGplayer for the images they supply.

**Set codes (owner's decision):** display the **printed abbreviation** from the set's `abbreviation` field (`PAL`, `OBF`, `SV2a`). Older sets have no printed abbreviation. For those, fall back to the TCGdex set ID in upper case (`BASE1`) and treat it as the code for search too.

**Japanese (owner's decision: English + Japanese Pokémon).** This is **best-effort** and must be verified with a short spike at the start of Phase 3:
- Japanese cards come from `/v2/ja/`. Their names are in Japanese, so a clerk can't reliably type them. Japanese matching therefore uses the **set code + collector number** (and printed size). The typed name is only used to rank results.
- In the buy list and database, store the name TCGdex returns. If it isn't Latin script, show it as `<English name typed> / <Japanese name>` so staff can read it. Always tag the line `[JP]`.
- If the spike finds TCGdex's Japanese coverage too thin, tell the owner before building further.

**Phase 3 spike findings (2026-09-29, reported to the owner):**
- The printed code is **`abbreviation.official`** (an object, not a string) and is only on a set's **detail** record, not in `GET /sets`. Older English sets have one too (Base Set = `BS`, 151 = `MEW`). The app fetches set details per set, caches them 7 days, and runs a low-priority background fill of every set so typed codes are recognized. GraphQL doesn't expose the field either.
- **Japanese sets have no abbreviation; their IDs are the printed codes** (`SV2a`, `SV4K`, `M2a`). They're displayed exactly as printed (`SV2a`, not `SV2A`). Coverage: 184 sets from 1996 to the current M era. Images are present from Sword & Shield (2020) on and mostly missing before that, so older Japanese cards use the card-back placeholder.
- **Name search also returns Pokémon TCG Pocket cards** (digital-only; series `tcgp`, set IDs like `A1`, `A2b`, `P-A`). They're filtered out everywhere.
- The **`localId` filter is a loose match** (`6` also matches `036`), so numbers are re-checked exactly.
- `variants_detailed` exists, with `size` (`standard` / `jumbo`: use standard only) and `thirdParty.tcgplayer` product IDs for **English** cards. **Japanese cards have only Cardmarket IDs and EUR prices**, so there is no USD fallback price for them (Section 8.7): a Japanese card without a JustTCG price needs a manual price.
- tcgdex.net card pages route by ID (`/database/<serie>-x/<set>-x/<localId>-x`), so English cards link there. The Japanese site doesn't, so Japanese cards have no link.
- **Scryfall's `printed_size` is only set for roughly 2020–2023 sets** (e.g. present for DMU and 2X2, absent for DSK, FDN, LTR, CMR, SLD). Size filtering and the size part of ranking apply only where it's known, as Section 8.2 already allows.

### 5.3 JustTCG (prices only)

- Base URL: `https://api.justtcg.com/v1`. Header `x-api-key`. **Called only from the `prices` Edge Function.**
- **Plan:** Starter today (1,000 requests/day, 10,000/month, 50/minute, batch ≤100 cards). The owner may move to Professional during development. Read limits from each response's `_metadata` rather than hard-coding them.
- **Game IDs:** confirm with `GET /games` in Phase 5. Expected: `magic-the-gathering`, `pokemon`, `pokemon-japan`.
- **Conditions:** request all conditions (no `condition` filter) so one response fills the whole price table. Map JustTCG's condition names to NM/LP/MP/HP/DMG.
- **Printings:** also request all printings, so toggling foil or finish doesn't cost another call.

**Mapping a printing to JustTCG:**

| Game | Lookup | Printing mapping |
|---|---|---|
| Magic, non-foil or foil | `GET /cards?scryfallId=<scryfall id>` | `nonfoil` → `Normal`, `foil` → `Foil` |
| Magic, etched | `GET /cards?tcgplayerId=<tcgplayer_etched_id>` (TCGplayer lists etched foils as their own product) | the etched product's `Foil` printing |
| Pokémon (en) | 1) a TCGplayer product ID from TCGdex `variants_detailed` third-party data, when present → `tcgplayerId`; otherwise 2) `GET /cards?game=pokemon&q=<name>&number=<localId>`, filtered to the JustTCG set that maps to the TCGdex set | `normal` → `Normal`, `holo` → `Holofoil`, `reverse` → `Reverse Holofoil`, 1st Edition → `1st Edition …` (verify exact strings in Phase 5) |
| Pokémon (ja) | same as Pokémon en with `game=pokemon-japan` | same |

- **Pokémon set mapping:** match each TCGdex set to a JustTCG set once, by normalized set name from `GET /sets?game=pokemon` (or `pokemon-japan`), and cache it in `price_map` under `pokemon:set:<lang>:<tcgdex set id>`. If a name doesn't match exactly, leave it unmapped and log it to the console. The owner can report missing sets.
- A resolved mapping is stored in `price_map` (Section 6) so each printing is resolved **once**, then looked up by JustTCG card ID afterwards.
- If step 2 returns zero or several candidates, don't guess. Treat it as "no JustTCG price" and use the fallback (Section 8.7).

**The `prices` Edge Function:**
- **Edge Function auth (applies to `prices` and `secrets`):** projects using the new publishable/secret keys must deploy functions with **`--no-verify-jwt`** (or `verify_jwt = false` in `supabase/config.toml`), because Supabase's built-in JWT check rejects them. Each function must then **verify the caller itself**: read the `Authorization: Bearer <access token>` header that supabase-js sends for the signed-in session, validate it with `supabase.auth.getClaims(token)` (or `auth.getUser(token)`), and return 401 if it's missing or invalid. Never skip this check. Without it, anyone could spend the JustTCG quota or overwrite the key.
- Input: a list of lookups `{ game, lang, scryfallId?, tcgplayerId?, tcgdexId?, name?, number?, setHint? }`.
- For each lookup, returns the cached JustTCG card from `price_cache` if it's younger than **6 hours**. Otherwise it batches the misses into `POST /cards` (≤100 items), stores the results, and returns them.
- Writes the latest `_metadata` (plan, daily/monthly used, remaining and limits) to `api_usage` after every JustTCG call.
- Handles 429 with exponential backoff and jitter (1s doubling to 30s, honoring `Retry-After`). If the daily or monthly quota is exhausted, it returns a clear error code the UI shows as "Daily price limit reached — enter prices manually until <reset time>". The daily reset is 00:00 UTC, shown converted to store time (e.g. 5:00 PM in summer, 4:00 PM in winter).

**Request budget:** a price call is made **only after a printing has stayed selected for 400ms**, so cycling through suggestions with the arrow keys doesn't spend quota. With the shared 6-hour cache, one call covers every condition and finish of a printing across all store computers.

**Licensing:** commercial use requires a paid JustTCG plan (Starter qualifies). Don't expose raw JustTCG data to third parties. Settings may show "Prices via JustTCG"; attribution is appreciated but not required.

---

## 6. Data model (Supabase Postgres)

All IDs are `uuid default gen_random_uuid()` unless noted, and all timestamps are `timestamptz default now()`. Migrations live in `supabase/migrations/` and are applied with the Supabase CLI to dev first, then prod.

### 6.1 Tables

**`staff_users`**: color-coded staff profiles (the header "user" dropdown)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text not null | Unique among active users (case-insensitive) |
| color | text not null | A `--pal-*` token name, e.g. `pal-teal` |
| active | boolean default true | "Delete" sets false: hidden from the dropdown, kept for history |
| created_at | timestamptz | |

**`devices`**: one row per browser, used for drafts and editing locks

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | Generated in the browser on first run, kept in `localStorage` |
| label | text not null | "Front Counter", asked on first sign-in, editable in Settings |
| last_seen_at | timestamptz | |

**`buys`**: walk-in buys and collections

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| kind | text not null | `walk_in` \| `collection` |
| status | text not null | walk_in: `draft` \| `confirmed`; collection: `processing` \| `priced` \| `paid` (shown as "Paid/Ours"). A CHECK ties allowed values to `kind`. |
| customer_name | text | walk-in: optional (entered at confirm); collection: required |
| phone | text | collection: required, 10 digits stored (Section 9.3) |
| notes | text default '' | |
| draft_device_id | uuid → devices | walk-in drafts only. **Unique partial index** where `status='draft'`: one draft per device. |
| created_at, created_by | timestamptz, uuid → staff_users | collection: the creator |
| updated_at, last_edited_by | timestamptz, uuid → staff_users | bumped on any change to the buy or its lines |
| confirmed_at, confirmed_by | timestamptz, uuid → staff_users | walk-in only, set at confirm |
| paid_at | timestamptz | collection: when status became `paid` |
| custom_cash_pct, custom_credit_pct | numeric(5,2) null | A **custom rate** for this buy only (Section 8.9.1). `null` = use the Master Buy Percentages. Set independently: a buy can have a custom Cash % and the master Credit %. |
| cash_pct, credit_pct | numeric(5,2) | Snapshotted at confirm (walk-in) or when marked Paid/Ours (collection): the custom rate where set, otherwise the master percentage. `null` = not snapshotted yet. |
| version | integer default 1 | Bumped once per write transaction. Writes carry the version they read and are refused if stale (CM pattern). |

**`buy_lines`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| buy_id | uuid → buys ON DELETE CASCADE | |
| position | integer not null | Order added (1, 2, 3…). Merges keep the original position. |
| game | text | `mtg` \| `pokemon` |
| lang | text | `en` \| `ja` |
| name | text | Display name as stored (Section 5.2 for Japanese) |
| name_key | text | Normalized name (Section 3.1), for search. Indexed with `pg_trgm`. |
| set_code | text | Display code: Scryfall `set` in upper case, or the Pokémon printed abbreviation |
| set_name | text | Needed later by the export |
| source_set_id | text | Scryfall set code / TCGdex set id |
| collector_number | text | As printed, e.g. `263s`, `TG05`, `125` |
| printed_size | integer null | Denominator when known |
| rarity | text | |
| finish | text | `nonfoil` \| `foil` \| `etched` \| `normal` \| `holo` \| `reverse` |
| first_edition | boolean default false | Pokémon |
| treatments | jsonb default '[]' | Traits from the details panel, e.g. `["borderless","showcase","surgefoil"]` or `["pokeball-pattern"]` |
| condition | text | `NM` \| `LP` \| `MP` \| `HP` \| `DMG` |
| quantity | integer > 0 | |
| unit_price | numeric(10,2) not null | The purchase price per copy |
| market_price | numeric(10,2) null | JustTCG price at add time, when there was one |
| price_source | text | `justtcg` \| `scryfall_fallback` \| `tcgdex_fallback` \| `manual` |
| price_snapshot | jsonb | Every condition × printing price seen at add time (useful for export and disputes) |
| priced_at | timestamptz | When the price was fetched |
| scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id | text null | Source identifiers for the future export |
| image_url | text | Thumbnail URL |
| created_at | timestamptz | |

**Line identity for merging** (owner's decision): two adds merge into one line, with the quantity increased, when all of these match: `game, lang, scryfall_id/tcgdex_id, finish, first_edition, treatments, condition, unit_price, price_source`.

**`events`**: the changelog (append-only, never updated or deleted)

| Column | Type | Notes |
|---|---|---|
| seq | bigserial PK | Order of the log |
| at | timestamptz | |
| staff_user_id | uuid null | Who did it |
| staff_user_name, staff_user_color | text | **Frozen** at write time |
| device_id | uuid null | |
| kind | text | `buy` \| `collection` \| `app` |
| action | text | See Section 12.3 |
| target_id | uuid null | The buy or collection (no FK, so it survives deletion) |
| target_name | text | Frozen, e.g. "Buy 2 · Sat Aug 17, 2026" or the collection's customer name |
| games | text[] | Games involved, e.g. `{mtg}`, `{mtg,pokemon}` |
| added, removed | integer default 0 | Card counts (sum of quantities) |
| totals | jsonb null | `{ market, cash, credit, cash_pct, credit_pct }` where relevant |
| lines | jsonb default '[]' | `[{ sign, qty, text, game, unit_price }]` (sign is `+` or `-`), where `text` is the Moxfield line (Section 8.9) |
| fields | jsonb default '[]' | `[{ field, before, after }]` for info and status edits |
| summary | text default '' | One plain sentence |

**`settings`**: key/value (`key text PK`, `value jsonb`, `updated_at`, `updated_by`)
- `cash_pct` (default `33`), `credit_pct` (default `66`), `last_backup_at` (timestamp of the last downloaded backup).

**`secrets`**: `provider text PK`, `value text`, `updated_at`. **RLS on, no policies.** Only Edge Functions using the service role can read or write it.

**`api_usage`**: a single row (`id = 1`) with `plan`, `daily_used`, `daily_limit`, `monthly_used`, `monthly_limit`, `rate_limit`, `updated_at`. Written by the `prices` function.

**`price_cache`**: `key text PK` (JustTCG card id), `game`, `payload jsonb` (the JustTCG card with all variants), `fetched_at`. Written by `prices`, 6-hour freshness.

**`price_map`**: `source_key text PK` (e.g. `mtg:scryfall:<id>`, `mtg:etched:<tcgplayer_etched_id>`, `pokemon:en:<tcgdex id>`), `justtcg_card_id text null` (null = confirmed no match), `resolved_at`. Unmatched entries are retried after 7 days.

**`master_inventory_files`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| storage_path | text | Object path in the private Storage bucket `master-inventory` |
| original_filename | text | |
| size_bytes | integer | |
| row_count | integer | Data rows (excluding the header) |
| columns | text[] | Header row, as read |
| uploaded_at, uploaded_by | timestamptz, uuid → staff_users | |
| is_current | boolean | Exactly one true (unique partial index) |

Keep the **5 most recent files** (the current one plus 4 previous). Uploading a sixth deletes the oldest file and its row.

**`collection_locks`**: single-editor locks (Section 9.6)

| Column | Type | Notes |
|---|---|---|
| buy_id | uuid PK → buys ON DELETE CASCADE | |
| device_id | uuid → devices | |
| staff_user_id | uuid null | |
| acquired_at, heartbeat_at | timestamptz | A lock is **stale** when `heartbeat_at` is older than 60s |

### 6.2 Write paths (Postgres functions)

Every change that affects buy contents, or anything the changelog records, goes through a **single Postgres function** (called with `supabase.rpc`). The function makes the change **and** writes its `events` row in the **same transaction**, so the log can never disagree with the data (CM rule). Each function checks `expected_version` where it applies and raises `stale_version` if the version has moved on. The UI then reloads that buy and shows a toast: "This buy changed on another computer — reloaded."

| Function | Does | Event written |
|---|---|---|
| `draft_add_line(device, line, merge)` | Creates this device's draft if none exists; inserts or merges a line | none (drafts aren't logged) |
| `draft_remove_line(line_id, qty)` | Decrements the quantity or deletes the line | none |
| `draft_cancel(buy_id)` | Deletes the draft and its lines | none |
| `draft_set_custom_rates(device, custom_cash_pct, custom_credit_pct)` | Sets or clears this device's draft custom rates (Section 8.9.1). Creates the draft if none exists. | none |
| `confirm_buy(buy_id, user, customer_name, notes, cash_pct, credit_pct, expected_version)` | draft → confirmed; stamps `confirmed_*`; snapshots percentages (custom rate where set, else master) | `buy_confirmed` with all lines and totals |
| `buy_remove_line(line_id, qty, user, expected_version)` | For confirmed buys (day page) | `buy_cards_removed` |
| `buy_delete(buy_id, user, expected_version)` | Deletes a confirmed buy | `buy_deleted` with the full line list and totals |
| `collection_create(name, phone, notes, user)` | | `collection_created` |
| `collection_add_line(buy_id, line, merge, user, device, expected_version)` | Requires this device to hold the lock and status ≠ paid | `collection_cards_added` |
| `collection_remove_line(line_id, qty, user, device, expected_version)` | Same requirements | `collection_cards_removed` |
| `collection_update_info(buy_id, fields, user, device, expected_version)` | name / phone / notes / custom rates (`custom_cash_pct`, `custom_credit_pct`) | `collection_info_edited` with before/after |
| `collection_set_status(buy_id, status, user, device, cash_pct, credit_pct, expected_version)` | Moving to `paid` snapshots percentages (custom rate where set, else master) and `paid_at`; leaving `paid` clears the snapshot but **keeps** the custom rates | `collection_status_changed` |
| `collection_delete(buy_id, user, typed_name)` | Server checks `typed_name` matches | `collection_deleted` with the full line list and totals |
| `lock_acquire(buy_id, device, user, force)` / `lock_heartbeat` / `lock_release` | Section 9.6 | none |
| `restore_backup(payload)` | Section 11.5 | `backup_restored` (milestone) |

Staff users, devices, settings and CSV metadata are written directly (RLS permits it) and aren't logged, except where noted.

### 6.3 Realtime

Subscribe with Supabase Realtime `postgres_changes` to:
- `buys` and `buy_lines`, so the collections table, an open collection's list (for read-only viewers), the calendar and day pages update live;
- `collection_locks`, for lock banners and take-over;
- `staff_users`, `settings`, `master_inventory_files` and `api_usage`, so the dropdown, banner and meter stay current.

Enable Realtime on these tables in the migration. The walk-in draft sidebar doesn't need Realtime, because only its own device edits it.

---

## 7. Global UI

### 7.1 Look and feel

- Dark theme using CM's tokens (Appendix B.1). Font: `"Segoe UI", system-ui, -apple-system, sans-serif`, 14px base (CM).
- Game badges: small rounded chips, **MTG** in `--pal-indigo`, **PKM** in `--pal-amber` with dark text. Use them anywhere both games can appear.
- Status pills (collections): **Processing** `--warn`, **Priced** `--accent`, **Paid/Ours** `--good`.
- Primary action colors, used consistently:
  - **Green (`--good`)**: ADD CARD, CONFIRM BUY
  - **Red (`--bad`)**: CLEAR, CANCEL, destructive confirmations
  - **Blue (`--pal-blue`)**: EXPORT

### 7.2 Header

Ported from CM's header, with the same structure and spacing.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [logo] PUG Pricing Tool                                   [● Dana ▾]  [🔍 Search…   ] │
│        Players' Union Games                                                          │
│                                                                                      │
│ [ Price ][ Collections ][ Calendar ][ Settings ]                        [ Changelog ] │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Brand:** `public/pug-logo.webp` at **52px** (CM's `.brand-mark` pattern with `--brand-size: 52px`), then `h1` "PUG Pricing Tool" and a sub-line "Players' Union Games". The logo already has a transparent background. The favicon is a 64×64 PNG generated from it.
- **User dropdown** sits immediately **left of the search bar** (Section 7.3).
- **Search bar** in CM's position and style: pill-shaped with a magnifier icon. On the Price tab and on a collection's pricing screen it's shown **smaller** (about 220px instead of 340px, reduced padding) because the main search bar is the focus there. Behavior is in Section 13.
- **Tabs:** Price, Collections, Calendar, Settings, and **Changelog right-aligned** (`tab-apart`). Styling and animation exactly as CM (Appendix B.2).
- **Clicking the active tab again** returns that tab to its root: Collections → the table, Calendar → the month view, Changelog → the opening state (Section 12.5).
- The header width follows CM (1400px max, 24px gutters) on every tab. The Price screen body below it is full-width (Section 8.1).

### 7.3 Staff users (the "user" dropdown)

- A large chip **filled with the current user's color** and showing their name in bold (owner's decision, 2026-09-29: it must be obvious at all times who is selected). The lighter palette colors use dark text, the rest white. With no user set, it's an outlined chip reading "Pick user" in muted text. It opens a menu:
  - the list of active users (dot + name), with the current one checked. Click to select.
  - **+ Add user…**: an inline name field. The color is auto-assigned: the next `--pal-*` color not used by an active user, cycling when all are taken.
  - per-user **⋯** menu: **Change color** (a 12-swatch palette) and **Delete** (confirm: "Delete Dana? Past buys will still show their name."). Delete sets `active=false`.
- The selected user is **remembered on this device** (`localStorage`) until changed.
- A user is **required** before any card can be added, a buy confirmed or a collection edited. When none is picked, those buttons are disabled with the tooltip "Pick a user first", and clicking one makes the user button pulse briefly.
- Where the app records "who" (Section 6), it records the user selected at that moment.

### 7.4 First sign-in on a device

After the store password: if this browser has no device ID, create one and ask **"Name this computer"** (placeholder "Front Counter"). Save it to `devices`. The name can be edited later in Settings.

### 7.5 Banners (below the header, above the tab content)

| Banner | When | Style |
|---|---|---|
| **Master Crystal Inventory required**: "Upload your Crystal Commerce inventory CSV in Settings before exporting." with an **Open Settings** link | No current Master Crystal Inventory file | `.banner.err`, always visible, on every tab |
| **Offline**: "No connection — changes are paused." | `navigator.onLine` is false, or Supabase Realtime is disconnected for over 10s | `.banner.warn` |
| **Backup reminder**: "Last backup downloaded N days ago." with a **Download backup** link | More than 7 days since `last_backup_at` (Section 11.5) | `.banner.warn`, dismissible for the session |
| **Price limit**: "JustTCG daily limit reached — enter prices manually until <local reset time>." | `prices` returns a quota-exhausted error | `.banner.warn` until reset |

### 7.6 Modals, toasts, loading

- Use CM's modal, toast, loading bar and busy-button spinner (Section 3.1).
- Destructive confirmations use a red `.btn.danger` for the action and focus **Cancel** by default.
- Never use browser `alert()` / `confirm()`.

### 7.7 Routes

| Route | Screen |
|---|---|
| `#/price` (default) | Price tab |
| `#/collections` | Collections table |
| `#/collections/:id` | A collection's pricing screen |
| `#/calendar?month=YYYY-MM` | Calendar |
| `#/calendar/:game/:date` (`mtg`\|`pokemon`, `YYYY-MM-DD`) | Day page |
| `#/settings` | Settings |
| `#/changelog` | Changelog |

### 7.8 Formatting

- Dates: "Sat, Aug 17, 2026". Times: "3:42 PM". Always in `STORE_TZ`.
- Phone: `(555) 123-4567`.
- Money: `$1,234.56`. Totals round the **sum**, not each line: `cash = round(total × cash_pct / 100, 2)`, half-up.

### 7.9 Connection required

The app needs a connection (owner's decision). While offline (Section 7.5), ADD CARD, CONFIRM BUY, collection edits and uploads are disabled. Viewing whatever is already loaded still works. When the connection returns, reload data and remove the banner. Nothing is queued offline.

### 7.10 Screen sizes

- Target **1920×1080**, and it must stay fully usable at **1366×768**: the selected card shrinks, and panels scroll inside themselves rather than the page.
- Below 1200px wide, show AT's desktop-only notice ("PUG Pricing Tool is built for store computers. Please use a wider window.").

---

## 8. Price tab

The main screen. Collections reuse it (Section 9.4) with small differences.

### 8.1 Layout

The Price screen fills the viewport below the header with **no page scroll**. It has two regions: the **stage** on the left (all remaining width) and the **buy list sidebar** on the right (**340px**, full height). `background.webp` covers the **whole tab** at 50% opacity (AT `.stage::before`, `center / cover`). The sidebar sits on top of it as a slightly translucent panel (`--panel` at 90% opacity), so the art shows faintly behind the list.

```
┌──────────────────────────────────── STAGE ────────────────────────────────────┬──── BUY LIST ────┐
│ ┌─────────────────────────────────────────────────────────────────┐ [EN|JP]   │ BUY LIST 12 cards│
│ │ 🔍  Lightning Bolt 161/295 2X2                                   │           │ ── Magic (9) ──  │
│ └─────────────────────────────────────────────────────────────────┘           │ 1 Abrade (SOA) 37│
│  SELECTED CARD                                                                 │ 1 Adarkar Wastes │
│ ┌──────────────┐  ┌─ CARD INFO ───────────┐                                   │   (DMU) 243 *F*  │
│ │              │  │ Lightning Bolt        │                                   │ …                │
│ │              │  │ Double Masters (2X2)  │                                   │ ── Pokémon (3) ──│
│ │  336 × 468   │  │ #161 / 331 · Uncommon │                                   │ 1 Charizard ex   │
│ │ (Scryfall's  │  └───────────────────────┘          … show all (23)          │   (OBF) 125 *H*  │
│ │  card-page   │  [t1] [t2] [t3] [t4] [t5]     ┌─ FINISH ─────────────┐       │ …                │
│ │  size)       │                               │ FOIL  [ ON | OFF ]   │       │                  │
│ │              │                               ├─ DETAILS ────────────┤       │                  │
│ └──────────────┘  [t6] [t7] [t8] [t9] [t10]    │ ☐ Borderless …       │       │ Market   $41.20  │
│ ┌NM─┐┌LP─┐┌MP─┐┌HP─┐┌DMG┐ [✎]                  └──────────────────────┘       │ Cash 33% $13.60  │
│ │$2 ││$1 ││$1 ││$0 ││$0 │                     Qty [ 1 ] [CLEAR] [ADD CARD]     │ Credit 66% $27.19│
│ └───┘└───┘└───┘└───┘└───┘                                     ↓↑ pick · Esc … │[CANCEL][CONFIRM] │
└────────────────────────────────────────────────────────────────────────────────┴──────────────────┘
```

Below the main search bar, the stage is three columns (**owner's layout, 2026-09-29**, replacing the original single stack):

| Left | Middle | Right |
|---|---|---|
| **Selected card** at Scryfall's card-page size (**336×468**), left-aligned, with the **condition / price table** directly under it | **Card info** beside the card, then the **suggestions**: 10 thumbnails in **2 rows of 5** | Beside the suggestions: the **finish control** and **details panel**, then the action row (**Qty, CLEAR, ADD CARD**) under them |

Card image sizes follow Scryfall's as the reference: the selected card is 336×468, and a thumbnail is at most Scryfall's small image (146×204), shrinking only to fit 5 across and 2 rows down. The selected card shrinks only when the window is too short for it. The sidebar's bottom holds the totals and **CANCEL / CONFIRM BUY**, which mirror CLEAR / ADD CARD in size, shape and position.

### 8.2 Main search bar

- A large input (about 56px tall, 20px text) at the top of the stage. **It never moves and isn't an overlay.** It has focus when the screen opens and gets focus back after every add and every CLEAR.
- An **EN | JP** segmented toggle at its right edge. It affects **Pokémon only** (Magic is always English), defaults to **EN**, and is remembered per device. While JP is on, a small "JP" chip shows in the input.
- Search runs live as the user types (debounce 250ms, minimum 2 characters). **Both games are queried every time** (owner's decision), and results mix together with game badges.

**Query syntax.** The expected line is what's printed on the card:

```
<card name> <collector number>/<printed size> [<set code>]
```

Examples: `Lightning Bolt 161/295`, `Abrade 37/291 SOA`, `Charizard ex 125/197 OBF`, `Pikachu TG05/TG30`, `Sol Ring`.

Parsing rules (`src/lib/query.js`), applied to the trimmed input:

1. If the last token is 2–6 letters or digits containing at least one letter, and doesn't contain `/`, **and** the token before it contains `/` (or matches a known set code), it's the **set code**. Case-insensitive, matched against Scryfall set codes and Pokémon printed abbreviations.
2. The next last token containing `/` is **`<number>/<size>`**. The number keeps letters and symbols (`263s`, `TG05`, `SV107`, `★`). The size may be numeric (`295`) or prefixed (`TG30`).
3. A last token that is purely a collector-number pattern, with no `/`, is accepted as a **number only**.
4. Everything before that is the **name**. The name may be partial (`light bol`).
5. Number comparisons ignore leading zeros (`037` = `37`) and case.

**Matching.**
- **Name correction:** if the name part doesn't match any known name as a prefix or substring, run a Fuse.js search against the cached name catalogs (Scryfall catalog; TCGdex names per language). Retry with the best match when its score passes the threshold. Show "Showing results for **Lightning Bolt**" under the bar when a correction was applied.
- **Magic:** `cards/search` with `q = <name terms> lang:en` plus `cn:<number>` and `set:<code>` when given. Then filter by `printed_size` using the cached sets list, **only when that set's `printed_size` is known** (sets like SLD or PLST have none, and those printings are kept but ranked lower).
- **Pokémon (EN):** TCGdex `cards?name=<name>` (plus `localId` when a number is given), then filter by set `cardCount.official` = size, and by printed abbreviation = set code when given. **(JP):** match by set code + number + size (Section 5.2).
- **Ranking:** (1) number + size + set all match, (2) number + size, (3) number, (4) name only. Within a rank, newest release first. Magic and Pokémon interleave by rank.
- **Paging:** take the first page of each source (Scryfall returns up to 175). If there are more, "show all" says "175+ — refine your search".

### 8.3 Suggestions row

- Up to **10 thumbnails** of the best matches in rank order, in **2 rows of 5** under the card info (Section 8.1). Beneath each is a caption with its game badge and `SET #num` (owner's decision, 2026-09-29: a badge on the card's top corner covered the name, and Scryfall's image rules keep overlays off the bottom strip).
- A **"… show all (N)"** button on the line above them when N > 10. It opens a modal grid of every match (same thumbnails, scrollable, with the same keyboard behavior). Clicking a card selects it and closes the modal.
- The highlighted suggestion has an accent outline (the keyboard cursor, Section 8.11).
- Clicking a thumbnail makes it the **selected card**. Clicking the selected card's thumbnail again deselects it, leaving nothing selected (owner's decision, 2026-09-29).
- **Hover** (owner's decisions, 2026-09-29): a thumbnail pops up and grows (about 14%, with a slight overshoot and a deep shadow). Then the **set symbol** pops in over the spot a Magic card prints it (the right end of the type line, mid-right), large (about 38% of the card's width) and **colored for rarity**: common black, uncommon silver, rare gold, mythic orange-red, special/bonus purple. When there's **no symbol**, a small chip with the **set code** shows there instead, in the same colors. That covers every Pokémon card (TCGdex's set-symbol images return 404, and suggestions don't carry Pokémon rarity, so these chips are slate) and any Magic symbol that fails to load.
- **Auto-select** (owner's decision): when the results narrow to exactly **one** printing, it becomes the selected card automatically. With several matches nothing is selected until the user clicks or arrows to one. The previous selection clears when the query changes enough that it no longer matches.
- States:
  - Searching: a subtle "Searching…" with a spinner.
  - Image still loading (a thumbnail or the selected card, including a Pokémon backup still being looked up, Section 5.2): a card-shaped shimmer with a spinner and "Loading…". The card back appears only once every source has been tried (owner's decision, 2026-09-29).
  - No match: "No cards match. Check the number and set code." Also show the name correction when one was tried.
  - A source failed: its badge greys out, with "Scryfall didn't respond — retrying…" or "TCGdex didn't respond — retrying…". The other game's results still show.

### 8.4 Selected card

- The large card image (AT `.card-wrap`, `--card-radius`, `--shadow`) with two-stage image loading, at **Scryfall's card-page size, 336×468**, left-aligned (owner's decision, 2026-09-29). It keeps the card's proportions at all times and only shrinks when the window is too short.
- Above it, a small caps label **SELECTED CARD**. With nothing selected, show an empty card-shaped frame reading "Type a card above".
- **Card info panel** to the right of the card:
  - name (large);
  - set name + code with the Scryfall set icon for Magic;
  - `#<number> / <printed size>`;
  - rarity;
  - game badge;
  - language;
  - for Pokémon, the regulation mark if present;
  - a link icon to the card's page on Scryfall or TCGdex;
  - beside it, **View on TCGplayer ↗** (owner's decision, 2026-09-29): the product page by TCGplayer ID (Scryfall's `tcgplayer_id` for Magic, TCGdex's for English Pokémon), or, with no ID (Japanese Pokémon), **Find on TCGplayer ↗**, a TCGplayer search for the typed name and number.
- ⟲ **Flip** for Magic double-faced cards (Section 5.1).
- **Foil sheen** (owner's decision, 2026-09-29, like Moxfield's foil indicator): while the chosen finish is Magic **foil** or **etched**, or Pokémon **HOLO**, a bright, drifting rainbow sheen (strong enough to be unmistakable) covers the selected card, brighter and dimmer in diagonal bands, and the **SELECTED CARD** label gains a rainbow tag naming the finish (**✦ FOIL**, **✦ ETCHED FOIL**, **✦ HOLO**, **✦ REVERSE HOLO**). **REVERSE** holo uses the same sheen with the band mask inverted, so it looks slightly different. The sheen fades out above the bottom (artist/copyright) strip, so that strip stays clear as Scryfall's image rules require. It stands still for viewers who prefer reduced motion. Thumbnails don't get it.

### 8.5 Finish control (the big switch)

This sits at the top of the right column, beside the suggestions and above the details panel (Section 8.1). It must be **large, bold and obvious**.

- **Magic:** a compact toggle switch (about 220×46px, owner's decision 2026-09-29; the Pokémon selector below keeps its full width and 64px), labeled **FOIL**. **ON is green with the knob right; OFF is red with the knob left**, and the text ON/OFF is inside the track.
- The finish control and details panel sit together in a faint dark box with a clearly visible frame; only the details list scrolls, with an easy-to-see scrollbar (owner's decision, 2026-09-29).
  - Default **OFF (non-foil)** when the printing exists both ways (owner's decision).
  - **Every selected card starts on its defaults** (owner's decision, 2026-09-29): a finish or Pokémon version chosen on one card is forgotten once another card is selected, including when coming back to the first card. Only a Details jump to a sibling printing (Section 8.6) carries the finish over, where the sibling has it.
  - When the printing exists in only one finish (`finishes` has only `foil`, or only `nonfoil`), the switch is **locked** in that state with a 🔒 and the tooltip "Only printed in foil" / "Only printed non-foil".
  - **Etched** is a separate checkbox in the details panel (Section 8.6). When etched is on, the switch shows **ETCHED** in its ON state and is locked on.
- **Pokémon:** the switch is replaced by an equally large **three-way segmented selector: NORMAL | HOLO | REVERSE** (owner's decision). Segments this printing doesn't come in (from TCGdex `variants`) are disabled. The default is the first available of Normal → Holo → Reverse.
- Changing the finish doesn't cost a new price call, because the cached JustTCG card has every printing. The price table updates immediately.

### 8.6 Details panel

A panel under the finish control, filled automatically from the selected printing. It shows the traits that identify the printing, and lets the user **toggle them to move to a sibling printing in the same set**.

**Traits (Magic)**, derived from the Scryfall card:

| Trait | Source |
|---|---|
| Borderless | `border_color = borderless` |
| Showcase | `frame_effects` ∋ `showcase` |
| Extended art | `frame_effects` ∋ `extendedart` |
| Full art | `full_art = true` |
| Retro frame | `frame` ∈ {`1993`,`1997`} in a set whose normal frame is newer |
| Textless | `textless = true` |
| Etched | `finishes` ∋ `etched` (a toggle, see Section 8.5) |
| Serialized | `promo_types` ∋ `serialized` |
| Special foil (named) | `promo_types` values ending in `foil` or known treatments (`surgefoil`, `galaxyfoil`, `textured`, `confettifoil`, `halofoil`, `rainbowfoil`, `raisedfoil`, `stepandcompleat`, `doublerainbow`, `neonink`, `fracturefoil`, `manafoil`, …). Show the human name ("Surge foil"). |
| Promo / stamp | `promo_types` ∋ `prerelease`, `promopack`, `datestamped`, `stamped`, `bundle`, `buyabox` |

**Traits (Pokémon):** 1st Edition (TCGdex `variants.firstEdition`), W Promo stamp (`variants.wPromo`), reverse-holo pattern (Poké Ball / Master Ball etc., where `variants_detailed` exposes it, shown as a sub-choice under REVERSE), rarity (read-only chip), and language (read-only, set by EN|JP).

**As built (Phase 4, 2026-09-29):** TCGdex's `variants_detailed` lists every physical version of a card, not just flags: `type` (normal / holo / reverse), `subtype` (unlimited, shadowless, shadowless-red-cheek, 1999-2000-copyright…), `foil` pattern (pokeball, masterball, cosmos…) and `stamp`s (1st-edition, set-logo, pokemon-together, snowflake, poketour-99…); `size` jumbo versions are ignored. So instead of separate 1st Edition / W Promo checkboxes, the details panel shows a **Version** radio list for the chosen finish, one plain-words entry per version ("Shadowless · 1st Edition", "Poké Ball pattern"). The chosen version sets the line's `first_edition` (the 1st-edition stamp) and `treatments` (subtype, pattern, other stamps). Choosing NORMAL | HOLO | REVERSE starts on that finish's plainest version. Cards without `variants_detailed` fall back to `variants` (a Standard and, where `firstEdition` is set, a 1st Edition version per finish). Pokémon printings aren't moved between as siblings: the details they differ in are rarity and number, which are shown, not toggled.

**How toggling works** (owner's decisions: only valid toggles; stay within the same set):

1. When a card is selected, load **all printings of that card in the same set** (Section 5.1, or the same name + set for TCGdex) and compute each one's trait set.
2. Traits that **differ** among those siblings are shown as **checkboxes**. Traits shared by all siblings are shown as **read-only chips**, so every trait is visible but only meaningful ones are clickable.
3. A checkbox is **enabled only if some sibling has that trait flipped**. Otherwise it's disabled, with the tooltip "No printing in this set without Showcase".
4. Clicking a checkbox selects the sibling that has the flipped trait **and** differs least from the current traits (fewest other differences; ties go to the lowest collector number). The selected card, info panel, finish control and prices update to that sibling.
5. Only the changes available within the same set are offered. Moving to another set means searching again.

### 8.7 Condition / price table

A row of five large buttons directly under the selected card (Section 8.1):

```
┌── NM ──┐ ┌── LP ──┐ ┌── MP ──┐ ┌── HP ──┐ ┌── DMG ─┐     [ ✎ Manual price ]
│ $2.10  │ │ $1.80  │ │ $1.40  │ │ $0.95  │ │ $0.60  │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

- Each button shows the condition label and **the JustTCG price for the selected printing + finish + condition**. The selected condition is filled with accent color. **NM is selected by default**, and resets to NM after each add and on CLEAR.
- **Loading:** show shimmering placeholders while prices load.
- **No JustTCG price** for a cell:
  - **NM cell:** show the **fallback** price, i.e. Scryfall `prices.usd` / `usd_foil` / `usd_etched` for Magic, or TCGdex `pricing.tcgplayer` market price for the finish for Pokémon. Mark it with a small "fallback" tag and a tooltip: "No JustTCG price — this is Scryfall's/TCGdex's market price".
  - **Other cells:** show "—".
  - A condition with "—" can still be selected, but then ADD CARD needs a manual price.
- A small caption under the table: "Prices via JustTCG · updated 2h ago" (from the cached `fetched_at`).

**Manual price:**
- **✎ Manual price** opens a small inline input next to the button ("$ ___", 2 decimals, ≥ 0.00). Enter or blur applies it.
- While a manual price is set, the selected condition button shows the manual price in **bold with a ✎ marker**, and the market price in small strikethrough beneath it.
- The manual price becomes the line's `unit_price` with `price_source = 'manual'`. `market_price` still records JustTCG's price when there is one.
- **×** clears the manual price. It also resets on CLEAR and after each add.

**Purchase price** of the next line = manual price if set, else the JustTCG price, else the fallback price. ADD CARD is disabled when none exists.

### 8.8 Quantity, ADD CARD, CLEAR

Under the finish control and details panel, at the bottom of the right column (Section 8.1): **Qty [ 1 ]**, then **CLEAR** (red, smaller), then **ADD CARD** (green, large: about 64px tall, bold, 20px text).

- **Qty:** a number box, 1–99, default 1. It resets to 1 after each add and on CLEAR.
- **ADD CARD** is enabled only when all of these hold:
  - a user is picked;
  - a card is selected;
  - a finish is valid;
  - a condition is selected;
  - a purchase price exists;
  - the app is online.

  Pressing it:
  1. Builds the line (Section 6.1) with every source ID, treatments and the price snapshot.
  2. Saves it through `draft_add_line` (walk-in) or `collection_add_line` (collection). Identical lines **merge** (Section 6.1).
  3. Flashes the new or updated sidebar line and scrolls it into view.
  4. **Resets the stage** (Section 8.8, CLEAR) and **refocuses the search bar** (owner's decision).
- **CLEAR:** empties the search bar and clears the selection, suggestions, details, price table, manual price and quantity, and sets the finish and condition back to their defaults. **It never touches the buy list.**

### 8.9 Buy list sidebar

Styled as AT's list panel, docked right.

- **Heading:** "BUY LIST" (small caps) with a count ("12 cards", the sum of quantities).
- **Grouped by game** (owner's decision): a "Magic (9)" header, then its lines; a "Pokémon (3)" header, then its lines. A group is hidden when empty. Within a group, lines are in the **order added, newest at the bottom** (owner's decision). A newly added line scrolls into view.
- **Line text** (plain text, Moxfield-style, from `src/lib/lineFormat.js`):

```
<qty> <name> (<SET>) <number>[ <finish marker>][ [<tags>]]
```

| Part | Rule |
|---|---|
| name | As stored. Double-faced Magic cards use the full `Front // Back` name. |
| SET | Magic: the Scryfall set code in upper case. Pokémon: the printed abbreviation (Section 5.2). |
| number | The collector number as printed, without the size |
| finish marker | Magic: `*F*` foil, `*E*` etched, nothing for non-foil. Pokémon: `*H*` holo, `*RH*` reverse holo, nothing for normal. |
| tags | Only non-defaults, in this order, comma-separated in one bracket: condition if not NM (`LP`), `1st Ed`, `JP`, reverse pattern (`Poké Ball`) |

Examples:

```
1 Sonic the Hedgehog (SLD) 2087
1 Abandoned Air Temple (PTLA) 263s *F*
1 Abrade (SOA) 37 [LP]
2 Sol Ring (CMR) 472 *E*
1 Charizard ex (OBF) 125 *H*
1 Pikachu (SV2a) 25 *RH* [MP, JP, Poké Ball]
```

- Lines wrap; don't truncate them.
- **Remove:** hovering a line turns its text **red** (the whole line is the hit target). Clicking opens **"Remove card?"**:
  - quantity 1: "Remove **1 Abrade (SOA) 37**?" with [Cancel] [Remove].
  - quantity > 1 (owner's decision: ask how many): "Remove how many of **3 Lightning Bolt (2X2) 161**?", a number stepper (1…3, default 1), and [Cancel] [Remove] [Remove all 3].

  Removal is permanent. The card no longer exists in that buy.
- **Totals block** at the sidebar bottom, above the buttons (owner's decision):

```
Market         $41.20
Cash (33%)     $13.60
Credit (66%)   $27.19
```

  Market = Σ unit_price × qty. Cash and Credit use the buy's custom rates where set (Section 8.9.1), otherwise the Master Buy Percentages from Settings (live for drafts).
- **Buttons:** **CANCEL** (red, smaller) and **CONFIRM BUY** (green, large), with the same sizes as CLEAR / ADD CARD so the two rows mirror each other.

#### 8.9.1 Custom rates for one buy (owner's decision, 2026-09-29)

On the pricing screens (the Price tab's buy list and a collection's pricing screen, Section 9.4), the **Cash (33%)** and **Credit (66%)** percentages in the totals block are **clickable**. They're not clickable anywhere else: confirmed buys on day pages keep the rates they were confirmed with.

```
Market          $41.20
Cash (40% ✎)    $16.48   ◄── click
Credit (66%)    $27.19
┌─ Rates for this buy ───────────────┐
│ Cash   [ 40   ] %   master 33%     │
│ Credit [ 66   ] %   master 66%     │
│ [Use master rates]          [Done] │
└────────────────────────────────────┘
```

- Clicking either percentage opens a small **subpanel** attached to the totals block, with a **Cash %** and a **Credit %** input. Rates are entered as **percentages** (`40`, not `0.40`): 0–100, up to 2 decimals, the same rules as Master Buy Percentages (Section 11.4). Each input shows the master value beside it for reference.
- A rate is saved **with the buy** (`buys.custom_cash_pct`, `custom_credit_pct`) as soon as its input loses focus or Enter is pressed. Esc or **Done** closes the subpanel. **Use master rates** clears both custom rates.
- Cash and Credit are independent: a buy can have a custom Cash % and the master Credit %. Typing the master value back into an input clears that custom rate.
- While a custom rate is set, its label shows the custom percentage with a **✎** in the accent color, and the tooltip "Custom rate for this buy. Master rate: 33%".
- Changing Master Buy Percentages in Settings **doesn't** change a buy's custom rates.
- Needs a picked user and a connection, like any edit (Sections 7.3, 7.9).
- **Walk-in buys:** saved through `draft_set_custom_rates`. Setting a rate before the first card creates the draft. The CONFIRM BUY dialog shows the rates in use, custom ones marked ✎. `confirm_buy` snapshots them. The next customer's buy starts at the master rates. CANCEL discards the custom rates along with the draft, even when the list is empty. Not logged, like all draft activity.
- **Collections:** saved through `collection_update_info` and logged as **Collection details edited** (Actions category) with field rows like `cash %: 33 → 40` (Section 12.3). Disabled while Paid/Ours or read-only (Sections 9.5, 9.6). Custom rates survive an unlock from Paid/Ours.

### 8.10 Walk-in buys: drafts, confirm, cancel

- **One in-progress buy per computer** (owner's decision). The draft is a `buys` row (`kind=walk_in`, `status=draft`, `draft_device_id` = this device), created by the first ADD CARD.
- **Drafts are saved continuously.** Every add and remove is written immediately, so a refresh, crash or closed tab loses nothing. When the Price tab opens, load this device's draft if there is one.
- **CONFIRM BUY** (enabled when the draft has ≥1 line and a user is picked) opens a dialog:
  - "Confirm buy — **12 cards**";
  - totals (Market / Cash / Credit), with any custom rate marked ✎ (Section 8.9.1);
  - optional **Customer name** and **Notes** fields (owner's decision);
  - the confirming user shown with their color dot;
  - [Cancel] [Confirm buy].

  Confirming calls `confirm_buy` and shows a toast: "Buy confirmed — Buy 3 today (Magic + Pokémon)". Then the sidebar and stage reset for the next customer.
- **CANCEL**: if the list is empty, just reset (deleting an empty draft that only held custom rates). Otherwise ask "Cancel this buy? **12 cards** will be discarded." with [Keep buy] [Discard] (red). Discarding deletes the draft. It isn't logged, because drafts aren't part of the record.
- Drafts never appear on the Calendar, in search or in the changelog.

### 8.11 Keyboard (owner's decision: full keyboard flow)

Focus normally stays in the search bar.

| Key | Action |
|---|---|
| typing | search |
| **↓ / ↑** | move the highlight through the 10 suggestions in order (and on past the 10th to "show all"). The highlighted card becomes the selected card. ← / → stay as text-cursor keys. |
| **Enter** | ADD CARD (when enabled). On the "show all" button, it opens the modal. |
| **Esc** | CLEAR. Inside a modal, it closes the modal instead. |
| **Alt+1 … Alt+5** | select NM / LP / MP / HP / DMG |
| **Alt+F** | toggle foil (Magic) / cycle finish (Pokémon) |
| **Alt+Q** | focus the quantity box. Enter there adds; Esc returns to the search bar. |
| **Alt+M** | open the manual price input. Enter applies it and returns to search. |

Show a quiet hint strip under the action row, AT-style: `↓↑ pick · Enter add · Esc clear · Alt+1–5 condition · Alt+F foil`.

### 8.12 Edge cases

- **Card not found** in either source: nothing can be added (no free-text cards in this version). Show the no-match state.
- **The same card added twice with different conditions** makes two lines, one with `[LP]`.
- **A card is selected but the search text is edited:** keep the selection until the new query's results arrive. If the selection isn't among them, clear it.
- **Price fetch failure** (network or Edge Function error): show "Couldn't load prices — retry" in the table. Fallback and manual still work.
- **Switching tabs mid-buy:** the draft persists and comes back when you return.
- **Two tabs on the same computer:** they share one device ID, and therefore one draft. The second tab shows the same draft and reloads on a `stale_version` error.

---

## 9. Collections tab

### 9.1 Collections table (tab root)

```
Collections  14                                     [ Search name or phone… ]  [ + Price Collection ]
[ All ][ Processing ][ Priced ][ Paid/Ours ]
┌───────────────┬────────────────┬────────────┬──────────────┬──────────────┬───────────────────────┐
│ Name ▲        │ Phone          │ Status     │ Created      │ Last edited ▼│ Notes                 │
├───────────────┼────────────────┼────────────┼──────────────┼──────────────┼───────────────────────┤
│ Jordan Reyes  │ (555) 201-3344 │ Processing │ Aug 14, 2026 │ Today 3:12 PM│ 2 binders + bulk box… │
│ ✎ open on Front Counter (Dana)                                                                    │
```

- **Columns** (owner's list): **Name, Phone Number, Status, Date of creation, Date last edited, Notes.** Notes are truncated to one line, with the full text in a tooltip.
- **Sort:** click a column header to sort ascending, click again for descending. Default is **Last edited, newest first**.
- **Status filter:** All / Processing / Priced / Paid/Ours. Default is All.
- **Search box:** matches name (case- and accent-insensitive substring) and phone (digits substring).
- **Lock indicator:** when a collection is open for editing on another device, show an "✎ open on <device> (<user>)" sub-line on its row.
- **Live:** the table updates through Realtime.
- **Click a row** to open the collection's pricing screen (`#/collections/:id`).
- **Empty state:** "No collections yet. Press + Price Collection to start one."

### 9.2 + Price Collection

A big primary button top-right, styled like CM's `.btn.primary`, larger. It needs a picked user. It opens a modal:

| Field | Rules |
|---|---|
| Name | Required, 1–80 characters |
| Phone number | Required, US format (Section 9.3) |
| Notes | Optional, multi-line |

[Cancel] [Create]. Create calls `collection_create`: status **Processing**, created now by the current user, then opens the new collection.

### 9.3 Phone numbers

- As the user types, format to `(555) 123-4567`. Store **10 digits**. Strip a leading `1` from 11-digit input.
- Invalid (not 10 digits) → inline error "Enter a 10-digit US phone number", and Create/Save stays disabled.

### 9.4 Collection pricing screen

The **Price tab's screen, reused** (the same components), with these differences:

```
< BACK   Jordan Reyes · (555) 201-3344 · [Processing ▾] [Mark as Priced →]      Market $412.50
         Notes: 2 binders + bulk box, wants credit      ✎                         Cash (33%) $136.13
         Created Aug 14 by ● Dana · Last edited today 3:12 PM by ● Sam  [⋯]     Credit (66%) $272.25
┌──────────────── STAGE (same as Price tab) ──────────────────┬──── COLLECTION LIST ────┐
│                                                            │  (same list format)      │
│                                                            │                          │
│                                                            │        [   EXPORT   ]     │
└────────────────────────────────────────────────────────────┴──────────────────────────┘
```

- **Collection header bar** above the stage, full width:
  - **< BACK** at the top-left, returning to the table. Clicking the Collections tab does the same.
  - **Name** and **phone**, each editable inline (✎), and **Notes**, editable inline (multi-line; saves on blur or Ctrl+Enter). Each save calls `collection_update_info` and is logged.
  - **Status:** a **dropdown** (Processing / Priced / Paid/Ours) **and** a **step-forward button**: "Mark as Priced →" while Processing, "Mark as Paid/Ours →" while Priced (owner's decision: both controls).
  - **Created** date + creator (color dot) and **Last edited** date + user (owner's decision: creator and last editor).
  - **Totals** on the right, the same block as the sidebar (owner's decision), with the same clickable percentages for custom rates (Section 8.9.1).
  - **⋯ menu** holding **Delete collection…**, kept away from everyday controls (Section 9.7).
- **Sidebar:** the same list, grouping, format, hover-red and "Remove card?" behavior as Section 8.9, titled "COLLECTION LIST". **Each add and remove saves immediately** and is logged (Section 12). There are **no CONFIRM BUY / CANCEL** buttons. In their place is a single blue **EXPORT** button (Section 14).
- **Prices lock when a card is added** (owner's decision). There is no refresh.
- **Cash/Credit** use the collection's custom rates where set (Section 8.9.1), otherwise the current Master Buy Percentages, until the collection is marked Paid/Ours, when they're snapshotted onto the collection.

### 9.5 Status and locking at Paid/Ours

- **Processing → Priced → Paid/Ours.** Any status can be chosen from the dropdown.
- Choosing **Paid/Ours** asks: "Mark as Paid/Ours? The collection will be locked." [Cancel] [Mark Paid/Ours]. Once Paid/Ours:
  - ADD CARD, remove, and info edits are disabled.
  - A green banner reads "Paid/Ours — locked." with an **🔒 Unlock** button.
- **Unlock** (or choosing another status from the dropdown) asks "Unlock this collection? It will go back to Priced and can be edited." [Cancel] [Unlock]. This sets the status to **Priced** and is logged.

### 9.6 One computer at a time (owner's decision)

A collection can only be **edited on one computer at a time**. Others can view it read-only and **take over**.

- **Opening** a collection calls `lock_acquire`.
  - If it's free, or the lock is stale (no heartbeat for 60s), this device gets the lock.
  - Otherwise the screen opens **read-only**, with a banner: "✎ Being edited on **Front Counter** by ● Dana since 3:02 PM." and a **[Take over]** button.
- **Read-only** means ADD CARD, remove, status and info edits are disabled. Searching and viewing prices still work, and the list updates live.
- **The lock holder** sends a heartbeat every 20s. Leaving the screen (Back, a tab change, route change, or `pagehide`) releases the lock, best effort. A crashed computer's lock goes stale after 60s.
- **Take over** asks "Take over editing? Front Counter will switch to view-only." then calls `lock_acquire(force=true)`. The previous holder sees, via Realtime, a toast "Sam took over editing on Back Office" and flips to read-only with its own [Take over] button.
- All collection write functions **reject** writes from a device that doesn't hold a fresh lock.

### 9.7 Deleting a collection

Owner's decision: double confirmation, and not easy to press.

- **⋯ → Delete collection…** opens a modal.
  - **Step 1:** "Delete **Jordan Reyes**? All **184 cards** in this collection will be permanently removed." [Cancel] [Continue].
  - **Step 2:** "Type the collection's name to confirm:" and a text box. **Delete forever** (red) is enabled only when the typed text equals the name (case-insensitive, trimmed).
- `collection_delete` checks the name on the server, deletes the collection, logs `collection_deleted` with the full line list, and returns to the table with a toast.
- A collection that is **locked by another computer** can't be deleted. Take over first.

---

## 10. Calendar tab

### 10.1 Month view

```
   ◀  August 2026  ▶   [Today]
┌─────────────── Magic ────────────────┬────────────── Pokémon ───────────────┐
│ Sun  Mon  Tue  Wed  Thu  Fri  Sat    │ Sun  Mon  Tue  Wed  Thu  Fri  Sat    │
│                           1    2     │                           1    2     │
│  3    4    5    6    7    8    9     │  3    4    5    6    7    8    9     │
│      3 buys                          │      1 buy                           │
│      ● ● ●                           │      ●                               │
│ …                                    │ …                                    │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

- **Split 50/50**: **Magic** on the left, **Pokémon** on the right, each with a header and its own identical month grid.
- **One month picker controls both** (owner's decision): ◀ / ▶ and **Today**. The month is kept in the URL (`?month=2026-08`).
- **Weeks start on Sunday** (owner's decision).
- **A day cell shows:**
  - the date number;
  - "**N buys**" (singular "1 buy");
  - **one dot per buy**, colored by the confirming user's color. More than 8 buys shows 8 dots and "+N".
  - Today's cell has an accent outline. Empty days aren't clickable.
- **What counts:** confirmed **walk-in buys only**. Collections don't appear on the Calendar (owner's decision). A buy is counted on the day of `confirmed_at` in `STORE_TZ`.
- **Mixed buys:** a buy with both games counts as a buy on **both** calendars that day, and each side sees only its own lines.
- Updates live through Realtime.

### 10.2 Day page

Clicking a day with ≥1 buy opens `#/calendar/<game>/<date>`, showing **that game's part** of each buy that day (owner's decision).

```
< BACK
Saturday, August 17, 2026 · Magic
──────────────────────────────────────────────────────────────────────────────
┌─ Buy 1 ─ ● Dana ─ 11:04 AM ─────────┐  ┌─ Buy 2 ─ ● Sam ─ 2:37 PM ─ [⋯] ──┐
│ Customer: Alex M.                    │  │                                  │
│ 1  Abrade (SOA) 37                   │  │ 4  Lightning Bolt (2X2) 161      │
│ 1  Adarkar Wastes (DMU) 243 *F*      │  │ …                                │
│ …                                    │  │                                  │
│ Market $41.20 · Cash $13.60 · Credit $27.19 │ Also has 3 Pokémon cards →     │
└──────────────────────────────────────┘  └──────────────────────────────────┘
                                                                    [   EXPORT   ]
```

- **< BACK** at the top-left returns to the Calendar on the same month. It mirrors the collection screen's Back button.
- A **large date header**, then a horizontal rule, then the panels.
- **One panel per buy** with lines in this game, in a responsive grid (CM `.card-grid`, `minmax(430px, 1fr)`). Panels use CM `.cardpanel` with the **top border in the confirming user's color**, and they **can't be moved**.
- **Panel header:**
  - **"Buy N"**: numbered by `confirmed_at` order among that day's buys **in this game**, starting at 1;
  - the **user's name in their color**;
  - the **confirmed time**;
  - a **⋯** menu with **Delete buy…**.
- **Panel body:**
  - customer name and notes, if any;
  - a CM-style `.deck-table` of the lines: **qty · name · set · number · finish marker + tags**, in the order added;
  - a footer with **Market · Cash · Credit** totals for **this game's lines**, using the buy's snapshotted percentages;
  - if the buy also has the other game's cards: "Also has N Pokémon cards →" (or Magic), linking to the other game's day page.
- **Removing cards** (owner's decision): row hover turns red. Click → the same "Remove card?" dialog with quantity as Section 8.9, then `buy_remove_line`, which is logged. The confirmation text notes: "This buy was already confirmed."
- **Deleting a buy:** ⋯ → Delete buy… → "Delete **Buy 2** (Dana, 2:37 PM)? All **N cards** in this buy — including any from the other game — will be permanently removed." [Cancel] [Delete buy] (red). Calls `buy_delete`, which is logged.
- **EXPORT** is a large, bold blue button at the bottom-right (Section 14).
- If the last buy of the day is deleted, go back to the Calendar with a toast.

---

## 11. Settings tab

Sections top to bottom, each in a CM panel.

### 11.1 Master Crystal Inventory (required)

The most prominent panel, with a **red border and a "Required" badge** until a file is uploaded.

- **Upload Crystal Commerce Database** (large button) opens a file picker restricted to `.csv`. Checks:
  - the extension is `.csv`;
  - size ≤ 20 MB (the owner's export is under 5 MB);
  - PapaParse reads it, it has a header row and at least 1 data row.

  A failed check shows a clear error and changes nothing.
- On success:
  1. Upload the file to the **private** Storage bucket `master-inventory` as `<YYYYMMDD-HHMMSS>__<original name>`.
  2. Insert a `master_inventory_files` row (`is_current=true`) and set the previous current file to `false`.
  3. If there are more than **5** files, delete the oldest (file and row).
- **Shows:**
  - the current file: name, uploaded date/time, uploader (color dot), row count, and the detected columns (collapsed list);
  - **Previous copies** (up to 4): name, date and uploader, each with a **Download** link.
- When a current file exists, the panel border turns green and the global banner (Section 7.5) disappears.
- **Parsing the CSV for export is out of scope.** This phase stores and validates it. The export design doc will define how columns are used, once the owner supplies a sample file.

### 11.2 API keys

- A row per provider (today: **JustTCG**):
  - masked key (`tcg_••••••••a325`) and last updated time;
  - **Edit** (paste a new key → save);
  - **Delete** (confirm);
  - **Test** (shows plan and remaining quota, or the error).
- All actions go through the `secrets` Edge Function. **Nothing in the browser ever holds the full key after saving.**

### 11.3 JustTCG usage (owner's decision)

- A meter panel from `api_usage` (live):
  - **Today:** `312 / 1,000` requests, with a bar;
  - **This month:** `4,210 / 10,000`;
  - plan name;
  - **resets:** the daily reset shown in store time ("resets 5:00 PM"), the monthly reset date;
  - "Updated 3 minutes ago".
- The bar turns amber at 80% and red at 95%.

### 11.4 Master Buy Percentages (owner's decision)

- **Cash %** (default 33) and **Credit %** (default 66): number inputs, 0–100, up to 2 decimals. Save on blur.
- Changes apply to drafts and unpaid collections immediately. They **don't** change confirmed buys or Paid/Ours collections, whose percentages were snapshotted, or any buy with a custom rate.
- These are the store-wide defaults. Staff can set a custom rate for a single buy from the pricing screens (Section 8.9.1).

### 11.5 Backup and restore (owner's decision: cloud backups + backup file)

- **Download backup:** exports every app table **except** `secrets`, `collection_locks`, `price_cache` and `price_map` as one JSON file, `pug-pricing-backup-<YYYYMMDD-HHMMSS>.json`, with a format version. It records `last_backup_at`. CSV files aren't included; download them from 11.1.
- **Restore from backup…:**
  1. Pick a file and validate its format and version.
  2. Show a summary (counts of buys, collections, lines, events, users) next to what's here now.
  3. Warn: "Everything currently in the database will be replaced."
  4. The user types **RESTORE**.
  5. The app **automatically downloads a pre-restore backup first**.
  6. It calls `restore_backup` (one transaction) and reloads.
- **Cloud backups:** show the prod project's plan status as static text: "Supabase daily backups: **on (Pro plan)**", or "**not included on the Free plan** — download a backup at least weekly". The value is in a config constant the owner updates if they upgrade. The weekly reminder banner (Section 7.5) applies when on Free.

### 11.6 This computer

- The device name (editable).
- **Sign out.** It asks for confirmation if this device has a non-empty draft: "Your in-progress buy stays saved for this computer."

### 11.7 Footer

Credits: "Card data and images from Scryfall (Magic) and TCGdex (Pokémon). Prices via JustTCG. Not affiliated with Wizards of the Coast or The Pokémon Company." Plus the app version and build date.

**Staff users are managed in the header dropdown, not here.**

---

## 12. Changelog tab

**The same timeline as Collection Manager's changelog** (owner's decision). It records every change to the card database: buys and collections, and their contents, status and details. It's **view-only**: there's no rewind, undo or snapshot restore from this tab.

### 12.1 Layout (port of CM)

- **Panel head:**
  - title "Changelog" with an entry count badge ("214 entries");
  - **category toggles** (Section 12.4);
  - **game filter** pills: **All · Magic · Pokémon** (owner's decision: one timeline with badges + a filter);
  - a **filter box** ("Filter by card, customer or collection…");
  - the **pager**.
- **Timeline:**
  - a vertical line down the middle;
  - entries **alternate left/right**, newest first;
  - **grouped by day** with a pill on the line: **Today**, **Yesterday**, then "Saturday, August 17, 2026" in `STORE_TZ`;
  - **each day starts on the left**; right-hand entries drop half a row so the columns interleave (CM's `margin-top: 34px`).
- **Pager:** 20 entries per page (`CHANGE_PAGE = 20`), at the top and again at the foot beside **↑ Back to top**. The foot row shows only when the page scrolls. The log is read when the tab opens, not on page load.
- All CSS comes from CM's `.timeline`, `.tl-*` and `.ch-mark` rules (Appendix B.3).

### 12.2 An entry panel

```
        ┌──────────────────────────────────────────────────────┐
   ●────┤ Aug 17, 2026 · 2:37 PM                BUY CONFIRMED │
        │ BUY  Buy 2 · Sat Aug 17   MTG PKM        +14   ● Sam │
        │ Customer: Alex M. · Market $61.40 · Cash $20.26 ·    │
        │ Credit $40.52                                        │
        │ ──────────────────────────────────────────────────── │
        │ + 4 Lightning Bolt (2X2) 161                          │
        │ + 1 Charizard ex (OBF) 125 *H*                        │
        │ …                                                     │
        └──────────────────────────────────────────────────────┘
```

- **Header** (CM `.tl-head`): the timestamp, and on the right the **headline** in small caps (CM `.tl-what`). Creations are green and bold (`.made`); deletions are red and bold (`.gone`).
- **Title row:**
  - kind chip (**BUY** or **COLLECTION**);
  - the **target name**, a link (owner's decision: clickable) to that buy's day page (the first game in `games`) or that collection. For a buy or collection that has since been deleted, it's plain text with the tooltip "Deleted";
  - game badges;
  - counts (`+N` green / `−N` red);
  - the **acting user** with color dot (owner's decision);
  - a **funnel** button that narrows the timeline to this buy or collection (CM `.ch-filter`).
- **Summary line:** a plain sentence, plus **totals** (owner's decision): Market / Cash / Credit on buy confirmed, buy deleted, collection deleted, and cards-added/removed entries (the total of the lines in that entry).
- **Card rows:** always open, in a scroll box (max 168px, CM `.tl-rows`). Each row is `+` (green) or `−` (red) followed by the line text (Section 8.9). Additions come first, then removals.
- **Field rows** for edits: `name: "Jordan R." → "Jordan Reyes"`, `status: Processing → Priced`. These panels are dimmed (CM `.tl-state`, opacity .78).
- **Dots:** buy entries use a green-bordered dot, collection entries a blue-bordered dot, and field/status entries a slate dot. **Creation** (buy confirmed, collection created) is the large dot. **Deletion** is the small red cross (CM `.tl-dot.gone`). Dots aren't clickable (no rewind).

### 12.3 What is recorded

`events.kind` is `buy` or `collection` according to the target (`app` for a restore). The **filter category** (Section 12.4) comes from the action: info and status edits are **Actions**.

| Action (`events.action`) | Headline | Category / dot | Contents |
|---|---|---|---|
| `buy_confirmed` | Buy confirmed | Buys / large green | All lines (+), totals, customer name |
| `buy_cards_removed` | Cards removed from buy | Buys / green | Removed lines (−), totals of the removed lines |
| `buy_deleted` | Buy deleted | Buys / red cross | All lines (−) at deletion, totals |
| `collection_created` | Collection created | Collections / large blue | Name, phone, notes as fields |
| `collection_cards_added` | Cards added to collection | Collections / blue | Added lines (+), totals |
| `collection_cards_removed` | Cards removed from collection | Collections / blue | Removed lines (−), totals |
| `collection_info_edited` | Collection details edited | Actions / slate | Field rows (name, phone, notes, cash %, credit %). A custom rate reads `cash %: 33 → 40`; clearing one reads `cash %: 40 → master (33)`. |
| `collection_status_changed` | Status changed | Actions / slate | `status: Priced → Paid/Ours`; "unlocked" when leaving Paid/Ours |
| `collection_deleted` | Collection deleted | Collections / red cross | All lines (−) at deletion, totals, name and phone |
| `backup_restored` | — | milestone (always shown) | Drawn as CM's green milestone pill across the line: "Backup restored — <file name>" |

**Not recorded** (owner's decision):
- activity on draft walk-in buys (adds, removes, cancel), since only the confirmation is recorded;
- staff user changes;
- CSV uploads;
- settings changes.

### 12.4 Filters

- **Category toggles**, CM behavior:
  - three buttons: **Buys** (green), **Collections** (blue), **Actions** (slate: collection details and status edits);
  - **click** = show only that category;
  - **Ctrl+click or right-click** = add or remove it from what's showing;
  - they can't all be turned off.
- **Game filter:** All / Magic / Pokémon. It matches entries whose `games` include that game. When filtered to one game, an entry's card rows show only that game's lines, and its counts and totals are recomputed for them.
- **Text filter:** substring match (normalized) on card text in `lines`, `target_name`, customer name and phone digits.
- **Funnel:** narrows to one `target_id`.
- **"Show everything" bar:** while any narrowing is active, a bar reads "Showing **Jordan Reyes**, entries matching **bolt** only" with a [Show everything] button. It stays visible even when nothing matches.

### 12.5 Opening state

The tab opens with **Buys + Collections on, Actions off**, game **All**, page 1, and no filter or funnel. Clicking the Changelog tab while already on it restores this state. The choice isn't remembered across refreshes (CM behavior).

### 12.6 Folding (drawing only)

One ADD CARD writes one event. Drawing rule: a run of **consecutive `collection_cards_added` events** (or removals) on the **same collection** by the **same user**, each within **15 minutes** of the previous one, with no other event for that collection in between, is **drawn as one panel**:
- the headline says "Cards added to collection";
- the counts and card rows are summed;
- the time range is shown ("2:04 – 2:41 PM").

The data isn't folded, only the drawing. Pagination counts drawn panels.

---

## 13. Global search (header)

- **Where:** in the header on every tab; smaller on pricing screens (Section 7.2).
- **Input:** the same syntax as the main search (Section 8.2). **Partial names work.** `bolt` finds every stored line whose name contains "bolt", across every printing and number. Adding `/size`, a number or a set code narrows the results. Both games are searched.
- **Scope** (owner's decision): lines in **confirmed walk-in buys** and **collections**, but not drafts. The query runs in Postgres (`name_key` trigram/ILIKE, plus number, size and set equality), limited to 200 lines.
- **Results dropdown** (CM `.search-results`, opening under the box):
  - Grouped by **printing**: a heading line such as "Lightning Bolt (2X2) 161 *F*", with a game badge. Then two sub-groups:
    - **Buys:** one row per buy: "Sat, Aug 17, 2026 · Magic · Buy 2 · ● Sam · qty 4".
    - **Collections:** one row per collection: "Jordan Reyes · Processing · qty 2".
  - Rows are CM `.result-btn`s with the left border in the relevant user's color (buys) or the status color (collections).
  - **"No buys or collections contain that card."** when there are no results.
- **Clicking a result:**
  - a buy → go to its day page for that game, scroll to the buy's panel, **flash** it (CM `.flash-target`), and highlight the matching rows;
  - a collection → open its pricing screen and flash the matching list lines in the sidebar.

  The dropdown then closes.
- **Keys:** ↓/↑ move through the results, Enter opens the highlighted one, Esc closes the dropdown.

---

## 14. Export: placeholders only

Export is the other half of the app's purpose, and it gets **its own design document**. In this build:

- **EXPORT buttons** appear in:
  - a collection's pricing screen, where CONFIRM BUY would be (blue);
  - each day page, bottom-right (large, bold, blue).
- Clicking EXPORT opens a modal: **"EXPORT COMING SOON"** with an **[OK]** button.
- The Master Crystal Inventory upload (Section 11.1) is fully built. The future export **must refuse to run without a current Master Crystal Inventory**. That rule belongs to the export doc, and the banner already warns.
- The data model keeps what the export is likely to need: set names, source IDs, finishes, treatments, conditions, prices and snapshots.

---

## 15. Build phases

Ten phases, each small enough to build in one sitting and check on `localhost`. **Rules for every phase:**

- Start by re-reading the relevant spec sections and `CLAUDE.md`.
- Work only inside `C:\ClaudeProjects\pug-pricing-tool`.
- Database changes are **new migration files**. Never edit an applied migration. Apply them to **dev** only. Prod is migrated at launch (Phase 10), or when the owner asks.
- Finish by running `npm run build` and fixing errors. **Don't** run extended browser tests, previews or screenshots (Appendix A).
- **Commit** with a clear message ("Phase 3: card search"). **Don't push** unless the owner asks.
- Hand off with: what was built, anything skipped or deviated from the spec (and why), anything untested, and the **"Where to look"** checklist for that phase (below), adjusted to what was actually built.
- **Owner-only tasks** (accounts, dashboards, passwords) are listed per phase. Prepare exact step-by-step instructions for the owner rather than guessing their credentials.

---

### Phase 1: Foundation and app shell

**Build**
- Git repo, `gh repo create pug-pricing-tool --public`, and the first commit. The `docs/` folder is already present (Section 4.6).
- Vite + React (JavaScript) scaffold into the existing folder, choosing **"Ignore files and continue"**. Add dependencies from Section 4.2.
- `vite.config.js` with `base: '/pug-pricing-tool/'`. `HashRouter` with the routes in Section 7.7 (placeholder pages).
- `start.bat` / `stop.bat` on port 5180 (Section 4.8). `.gitignore` (Section 4.7).
- `CLAUDE.md` and the **user-is-qa** memory (Appendix A).
- Port CM styles: tokens, base, buttons, tabs + animation, panels, modal, toast, loading bar (Appendix B). Copy `background.webp` from AT. Put the logo in `public/` and generate the favicon.
- Header: brand (logo, title, sub-line), a user dropdown placeholder, the search box (visual only), and the tabs with Changelog right-aligned. Smaller search on the Price route.
- Supabase client and `.env.development` wiring. The **login screen** (shared store password) and the **device naming** prompt.
- Confirm **public sign-ups are refused** on dev and prod: one `auth.signUp` call with a throwaway email and the publishable key must fail with "Signups not allowed". This is the one security check Claude Code runs itself. A desktop-only notice under 1200px.
- GitHub Actions `deploy.yml` (written but not triggered: no push).

**Owner tasks**
1. ✅ Create Supabase projects `pug-pricing-dev` and `pug-pricing-prod` (done 2026-09-28; URLs in Section 4.3).
2. In each project: Authentication → Users → **Add user → Create new user**, email `playersuniongamecoop@gmail.com`, a password of your choice, **Auto Confirm User** checked.
3. In each project: Authentication → **Sign In / Providers** → turn **off** "Allow new users to sign up" → Save.
4. Give the engineer the dev project's **publishable key** (Project Settings → API Keys, starts with `sb_publishable_`). Never share the **secret key** (`sb_secret_…`) in chat.
5. Enable GitHub Pages with source "GitHub Actions" when asked.

**Where to look**
- [ ] Double-click `start.bat`: the browser opens `localhost:5180`, and SPACE stops it. `stop.bat` frees the port.
- [ ] The login screen shows the logo. A wrong password shows an error; the right one gets in, and a refresh stays signed in.
- [ ] First sign-in asks "Name this computer".
- [ ] The header matches Collection Manager: logo, title, sub-line, search on the right, tabs below with Changelog on the right.
- [ ] Tabs hover-lift and underline exactly like CM, and content fades in on switch.
- [ ] The header search is smaller on the Price tab.
- [ ] Narrowing the window below 1200px shows the notice.

---

### Phase 2: Database, users, Settings basics, Master Crystal Inventory

**Build**
- Migrations for **all tables** in Section 6.1, RLS (Section 4.4), indexes, and Realtime publication. The Storage bucket `master-inventory` (private; `authenticated` can read and write).
- Header **user dropdown** (Section 7.3): add, auto-color, change color, delete (hide), remembered per device. The "Pick a user first" guard helper.
- Settings page skeleton with: **Master Crystal Inventory** (Section 11.1, fully working), **Master Buy Percentages** (11.4), **This computer** (11.6), footer (11.7).
- The **Master Crystal Inventory banner** (Section 7.5) and the **offline banner**.
- Realtime subscriptions for `staff_users`, `settings` and `master_inventory_files`.

**Where to look**
- [ ] Add three users: each gets a different color. Change a color. Delete one: it leaves the dropdown.
- [ ] The picked user is still picked after a refresh, and a second computer or browser can pick a different one.
- [ ] The red "Master Crystal Inventory required" banner shows on every tab until a CSV is uploaded.
- [ ] Upload your CC export: file name, date, you as uploader, row count and columns appear, and the banner disappears.
- [ ] Upload a `.txt` renamed badly, or an empty CSV: a clear error, nothing changes.
- [ ] Upload six times: only the latest five remain, and previous copies download.
- [ ] Cash/Credit % save and survive a refresh.
- [ ] Turn off Wi-Fi: the offline banner appears.

---

### Phase 3: Card search (Price tab, no prices yet)

**Build**
- **Spike first (at most half a day):** confirm TCGdex `abbreviation`, `variants_detailed` and `/v2/ja/` behavior with real calls. Report findings to the owner before continuing if anything differs from Section 5.2.
- `scryfall.js` / `tcgdex.js` with the serialized queues, retries and caches (Sections 5.1–5.2), including name catalogs and set lists.
- `query.js` parser (Section 8.2) **with unit tests for the parser only** (a table of example inputs → parsed parts). This is the one place automated tests are worth it.
- The Price screen layout (Section 8.1) with the background art; main search bar and EN|JP toggle; suggestions row + show-all modal; the selected card with two-stage loading, info panel and flip; auto-select; the keyboard ↓/↑/Esc.
- Fuzzy name correction with the "Showing results for…" note.

**Where to look**
- [ ] `Lightning Bolt 161/295` or a card from your case: the exact printing is auto-selected.
- [ ] `Sol Ring`: 10 thumbnails in 2 rows of 5 + "… show all (N)", and picking from the modal selects the card and closes it.
- [ ] `Charizard ex 125/197 OBF`: the Pokémon printing shows, with the PKM badge and set code OBF.
- [ ] A typo (`lightnig bolt`) still finds it, with the "Showing results for" note.
- [ ] Try a promo/secret number (`TG05/TG30`, `263s`) and a set with no printed size (SLD).
- [ ] ↓/↑ walk through suggestions; Esc clears.
- [ ] JP: switch to JP and try a Japanese card by set code + number.
- [ ] The search bar never moves, and results never cover it.

---

### Phase 4: Details panel and finish controls

**Build**
- Sibling printings in the same set, and trait derivation for Magic and Pokémon (Section 8.6).
- The details panel with checkboxes vs. read-only chips, valid-toggle rule, and closest-sibling selection.
- The big **FOIL** switch (green ON / red OFF, locking, etched) and the Pokémon **NORMAL | HOLO | REVERSE** selector, plus 1st Edition (Section 8.5). Alt+F.

**Where to look**
- [ ] A card with a showcase or borderless version in the same set: unchecking Showcase jumps to the regular printing, and checking it goes back.
- [ ] A trait with no alternative in the set is greyed out with a tooltip.
- [ ] A foil-only card (e.g. a Secret Lair foil) locks the switch ON; a non-foil-only card locks it OFF.
- [ ] A card with an etched version: Etched shows and the switch reads ETCHED.
- [ ] A Pokémon card with normal + reverse: the selector allows those two, and HOLO is disabled.
- [ ] A 1st Edition-capable WotC-era card shows the 1st Edition toggle.

---

### Phase 5: Prices

**Build**
- Edge Functions **`secrets`** and **`prices`** (Sections 4.5, 5.3), deployed to dev. `price_cache`, `price_map`, `api_usage` writes.
- Settings: **API keys** (11.2) and **JustTCG usage** meter (11.3).
- The price table with the five condition buttons, NM default, fallback tag, "—" cells, the updated-ago caption, and manual price (Section 8.7). A 400ms settle before fetching. The quota-exhausted banner. Alt+1–5, Alt+M.
- Confirm JustTCG game IDs and printing strings. Record them in `src/lib/prices.js` comments.

**Owner tasks**
- Enter the JustTCG key in **Settings → API keys** on the dev site once the section exists (and again on prod at launch).

**Where to look**
- [ ] Settings → API keys: the key shows masked, and Test shows your plan and remaining requests.
- [ ] Select a card: five prices appear. NM is selected. Flipping foil changes the prices instantly.
- [ ] Select the same card on another computer: prices appear without the usage meter going up (shared cache).
- [ ] An obscure card with no JustTCG data shows a "fallback" NM price and "—" elsewhere.
- [ ] Manual price: the ✎ price shows bold with the market price struck through beneath it.
- [ ] Arrow quickly through 10 suggestions: the usage meter rises by about 1, not 10.
- [ ] Etched Magic card: the price looks like the etched listing, not the regular foil.

---

### Phase 6: Buy list, walk-in drafts and CONFIRM BUY

**Build**
- The Postgres write functions for drafts and `confirm_buy` (Section 6.2), including the `events` writes for `buy_confirmed`.
- A new migration adding `buys.custom_cash_pct` / `custom_credit_pct` (Section 6.1; 0001 is already applied, so don't edit it), `draft_set_custom_rates`, and the clickable percentages with the custom-rate subpanel (Section 8.9.1) on the Price tab.
- Qty, **ADD CARD**, **CLEAR** (Section 8.8); the sidebar with game groups, line format (`lineFormat.js`, with unit tests for the formatter), hover-red remove with quantity (8.9); totals; **CONFIRM BUY** dialog with customer name/notes; **CANCEL** (8.10); per-device draft restore; the "Pick a user first" guard; Enter to add. Alt+Q.

**Where to look**
- [ ] Add 3 cards, refresh the page: the buy list is still there.
- [ ] Add the same NM card twice: one line, qty 2. Add it as LP: a second line with `[LP]`.
- [ ] Foil shows `*F*`, etched `*E*`, holo `*H*`, reverse `*RH*`; a Japanese card shows `[JP]`.
- [ ] Magic and Pokémon lines sit under their own headers, newest at the bottom.
- [ ] Hover turns a line red. Remove on a qty-3 line asks how many.
- [ ] Totals: Market, Cash 33%, Credit 66% are right (check one by hand).
- [ ] Click **Cash (33%)**: the subpanel opens. Set 40: the label reads **Cash (40% ✎)** and the total changes. Refresh: still 40. **Use master rates** puts it back to 33. After CONFIRM BUY, the next buy starts at 33.
- [ ] CONFIRM BUY shows the count and total and accepts a customer name; afterwards the list is empty.
- [ ] CANCEL with cards asks first; Discard empties it.
- [ ] With no user picked, ADD CARD is disabled and the user button pulses.
- [ ] Keyboard only: type → ↓ → Enter adds → the cursor is back in search.

---

### Phase 7: Collections

**Build**
- Collection write functions and events (Section 6.2). Lock functions and Realtime (9.6).
- Custom rates on collections (Section 8.9.1): the clickable percentages in the collection header's totals, saved through `collection_update_info` and logged.
- The collections table with sort, status filter, search, live updates and lock indicator (9.1). **+ Price Collection** with phone validation (9.2–9.3).
- The collection pricing screen (9.4) reusing the Price components: header bar with inline edits, status dropdown + step button, creator/last editor, totals, ⋯ menu; COLLECTION LIST with saved-on-add; the blue **EXPORT** placeholder.
- Paid/Ours locking and unlock (9.5); one-computer editing with Take over (9.6); two-step delete with the typed name (9.7).

**Where to look**
- [ ] Create a collection without a phone number: blocked. With `5551234567`: shows as `(555) 123-4567`.
- [ ] Add cards, close the tab, reopen: all there. The table's "Last edited" updated.
- [ ] Mark as Priced → Mark as Paid/Ours: the screen locks. Unlock returns it to Priced.
- [ ] Set a custom Credit % on a collection: its totals use it; changing Master Buy Percentages in Settings doesn't touch it; it's locked while Paid/Ours and still there after Unlock.
- [ ] Open the same collection on a second computer: it's view-only and names the first computer and user. Take over: the first computer turns view-only.
- [ ] Close the first computer's browser entirely: within about a minute the second can edit without Take over.
- [ ] Delete: two steps, the name must be typed. The collection disappears from the table.
- [ ] EXPORT shows "EXPORT COMING SOON".
- [ ] Sorting, status filter and phone search work in the table.

---

### Phase 8: Calendar and day pages

**Build**
- The Calendar (10.1): two month grids, a shared picker, Sunday start, counts, user-colored dots, Realtime.
- Day pages (10.2): header, buy panels with totals, "also has other game" link, remove cards and delete buy (with events), Back, and the **EXPORT** placeholder.

**Where to look**
- [ ] Confirm a Magic-only buy, a Pokémon-only buy and a mixed buy today. Magic shows 2 buys, Pokémon 2 buys, with dots in the right user colors.
- [ ] ◀ ▶ move both calendars together; Today returns.
- [ ] Click today on Magic: panels "Buy 1", "Buy 2" with the user name in color and the time. The mixed buy shows only Magic cards plus "Also has N Pokémon cards →".
- [ ] Remove one card from a confirmed buy; delete a buy. The counts on the calendar update.
- [ ] Back returns to the same month. EXPORT shows the coming-soon message.
- [ ] A buy confirmed just before midnight lands on the right day (store time).

---

### Phase 9: Changelog

**Build**
- The timeline (Section 12) ported from CM: day pills, alternating sides, entry panels, dots, pager top and bottom, back to top.
- Categories with click / Ctrl+click behavior, game filter, text filter, funnel, and the Show-everything bar. Folding of add/remove runs. Clickable targets. Opening-state reset on re-click.

**Where to look**
- [ ] Every action from Phases 6–8 appears: buy confirmed (large green dot, all cards, totals), cards removed, buy deleted (red cross), collection created (large blue dot), cards added, status changed, details edited, collection deleted.
- [ ] Twenty quick adds to one collection show as **one** "Cards added to collection" panel.
- [ ] Today/Yesterday labels and alternating sides look like CM.
- [ ] Clicking a buy title opens its day page; clicking a collection opens it; a deleted one isn't a link.
- [ ] The funnel shows only that collection's history; Show everything returns.
- [ ] The Magic filter hides Pokémon-only entries and trims mixed ones to their Magic cards.
- [ ] Ctrl+click adds categories; the last one can't be switched off.

---

### Phase 10: Global search, backups and launch

**Build**
- Header global search (Section 13) with grouped results, keyboard, and jump + flash.
- Backup download/restore (11.5), the `restore_backup` function, the pre-restore auto-download, the backup reminder banner, and the plan-status text.
- Polish pass: empty states, loading states, error toasts, tooltips, the 1366×768 check.
- **Launch:** apply all migrations to **prod**, deploy the Edge Functions to prod, set the GitHub Actions variables, and finish `docs/SETUP.md` (run, deploy, change the store password, restore a pause). The public `README.md` stays a very short description of the tool's purpose (owner's decision, 2026-09-29). **Push to `main` only when the owner says go**, then confirm the Pages deploy succeeded.

**Owner tasks**
- Say "push" when ready.
- On the live site: sign in, name the computer, add users, enter the JustTCG key, upload the CC CSV, and set Cash/Credit %.
- Decide on Supabase Pro for prod (daily backups, no pausing).

**Where to look**
- [ ] Header search `bolt`: every buy and collection containing any Lightning Bolt printing, grouped by printing. Clicking one jumps there and flashes it.
- [ ] Search `Charizard 125/197`: narrows to that printing.
- [ ] Download backup: a JSON file saves, and the reminder banner goes away.
- [ ] Restore (on **dev only**): type RESTORE, a pre-restore file downloads first, then the data matches the backup, and a "Backup restored" milestone is in the changelog.
- [ ] Everything still works on a 1366×768 laptop.
- [ ] The live URL `https://dazeyama.github.io/pug-pricing-tool/` loads, signs in, and shows **prod** data (not your dev tests).

---

### After Phase 10: Export (separate spec)

The owner will write the export design doc and provide a sample CC CSV. Build it as Phase 11+.

---

## Appendix A: `CLAUDE.md` and the user-is-qa memory

Create `CLAUDE.md` at the project root in Phase 1 with this content:

```markdown
# PUG Pricing Tool — rules for Claude Code

- The spec is docs/DESIGN_SPEC.md. Read the relevant sections before each task. Update it
  when the owner changes a decision.
- Work only in C:\ClaudeProjects\pug-pricing-tool. collection-manager and audit-tool are
  READ-ONLY references: never edit, move or commit anything in them.
- One phase at a time (spec Section 15). Don't start the next phase until the owner reports back.
- Don't add settings, features or dependencies beyond the spec without asking the owner
  first. New settings ideas are welcome: propose them, don't just build them.
- Commit when a phase or fix is done. NEVER push unless the owner explicitly asks. Pushing
  to main deploys the live site.
- Never put API keys, the Supabase secret key (sb_secret_…), customer data or CSV files in the repo,
  code, docs or commit messages. Never commit "PUG Pricing Tool.txt" (contains a live key).
- Database changes are new migration files; apply to the dev project only unless told otherwise.
- The owner is QA — see memory `user-is-qa`.
- Current phase: 1
```

Create a Claude Code memory named **`user-is-qa`** with this content:

```markdown
The owner is QA for this project. Don't spend time on extensive testing, browser previews,
screenshots or clicking through the app. After implementing:
1. Run `npm run build` (and the parser/formatter unit tests if they exist) and fix errors.
2. Hand off untested code to the owner with a short "Where to look" checklist: the exact
   screens, actions and edge cases to try, in the order to try them. Mark anything you
   could not verify.
3. Wait for the owner's report before continuing; fix what they report.
```

---

## Appendix B: Reference values from Collection Manager

These are copied verbatim so the build doesn't depend on access to CM. If CM is available, prefer reading the live file.

### B.1 Color tokens (`static/style.css :root`)

```css
:root {
  --bg: #0f1220;
  --panel: #181c2e;
  --panel-2: #20253a;
  --border: #2c3350;
  --text: #e6e8f0;
  --muted: #9aa1bd;
  --accent: #6c8cff;
  --accent-2: #4f6ae0;
  --good: #3ecf8e;
  --bad: #ff6b6b;
  --warn: #ffcc66;

  --pal-crimson: #c0394b;
  --pal-orange:  #d4722c;
  --pal-amber:   #d8a520;
  --pal-olive:   #8a9a2b;
  --pal-green:   #3f9c53;
  --pal-teal:    #2b9e8b;
  --pal-cyan:    #2f9dc4;
  --pal-blue:    #3a72d0;
  --pal-indigo:  #5a5bc4;
  --pal-violet:  #8455c8;
  --pal-magenta: #b8459b;
  --pal-slate:   #6b7590;
}
body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; font-size: 14px; }
```

### B.2 Tabs and the tab animation

```css
nav#tabs { display: flex; gap: 8px; justify-content: flex-start; }
.tab.tab-apart { margin-left: auto; }          /* Changelog, pushed right */
.tab {
  background: transparent;
  border: 1px solid var(--border);
  border-bottom: none;
  color: var(--muted);
  min-width: 140px;
  text-align: center;
  padding: 9px 22px;
  align-self: flex-end;
  transition: padding .12s ease;               /* the lift eases; the colour snaps */
  font-size: 16px;
  font-weight: 600;
  letter-spacing: .01em;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
}
.tab:hover { color: var(--text); background: var(--panel-2); border-color: var(--muted); }
.tab:not(.active):hover { padding: 11px 22px 11px; border-bottom: 3px solid var(--muted); }
.tab.active {
  color: var(--text);
  background: var(--panel-2);
  border-color: var(--border);
  border-bottom: 3px solid var(--accent);
  padding: 11px 22px 11px;
}
.panel { display: none; }
.panel.active { display: block; animation: fade .15s ease; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
```

The header is `background: var(--panel); border-bottom: 1px solid var(--border); padding: 14px 0 0`. `.header-top` and `nav#tabs` are `max-width: 1400px; margin: 0 auto; padding: 0 24px`, and `.header-top` has `margin-bottom: 28px`.

### B.3 Changelog timeline (essentials)

```css
.timeline { position: relative; display: grid; grid-template-columns: 1fr 1fr;
            column-gap: 56px; row-gap: 16px; padding: 4px 0 8px; }
.timeline::before { content: ""; position: absolute; top: 0; bottom: 0; left: 50%;
                    width: 2px; margin-left: -1px; background: var(--border); }
.tl-day { grid-column: 1 / -1; display: flex; justify-content: center; margin: 10px 0 2px;
          position: relative; z-index: 2; }
.tl-day span { background: var(--bg); border: 1px solid var(--border); border-radius: 999px;
               padding: 3px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase;
               letter-spacing: .06em; color: var(--muted); }
.tl-milestone span { border-color: var(--good); color: var(--good); box-shadow: 0 0 0 4px var(--bg); }
.tl-slot { position: relative; grid-column: 1; }
.tl-slot.right { grid-column: 2; margin-top: 34px; }
.tl-dot { position: absolute; top: 18px; width: 11px; height: 11px; border-radius: 50%;
          background: var(--panel-2); border: 2px solid var(--muted); z-index: 1; }
.tl-slot.left .tl-dot  { right: calc(-28px - 5.5px); }
.tl-slot.right .tl-dot { left:  calc(-28px - 5.5px); }
/* created = 21px dot, 4px border, top 13px, offset 10.5px;
   gone = 15px red cross (two rotated 2.5×13px bars), offset 7.5px */
.tl-head { padding: 7px 11px; cursor: default; min-height: 38px; }
.tl-when { flex: none; font-size: 12.5px; font-weight: 600; color: var(--text); }
.tl-what { flex: 1; min-width: 0; text-align: right; font-size: 11.5px; text-transform: uppercase;
           letter-spacing: .04em; color: var(--muted); }
.tl-what.made { color: var(--good); font-weight: 700; }
.tl-what.gone { color: var(--bad);  font-weight: 700; }
.tl-body { padding: 9px 12px 11px; }
.tl-rows { max-height: 168px; overflow-y: auto; padding-right: 4px;
           border-top: 1px solid var(--border); padding-top: 6px; }
.tl-row { display: flex; align-items: baseline; gap: 6px; padding: 1px 0; font-size: 12.5px;
          white-space: nowrap; }
.ch-mark.add { color: var(--good); }  .ch-mark.rem { color: var(--bad); }
.tl-panel.tl-state { opacity: .78; }
.kind-btn { font-weight: 600; opacity: .5; }   /* .on: full opacity + category fill */
.count-badge { min-width: 92px; text-align: center; font-size: 13px; font-weight: 600;
               color: var(--muted); border: 1px solid var(--border); background: var(--panel);
               border-radius: 999px; padding: 3px 10px; }
```

Behavior (from CM `app.js`): `CHANGE_PAGE = 20`. The day heading is "Today", "Yesterday", else `weekday, month day, year`. `side` resets to left at each new day. The timestamp uses `{ day, month: long, year, hour, minute: 2-digit }`. There's a pager at the top and a foot row with "↑ Back to top" + pager.

### B.4 Audit Tool stage and list

- `.stage::before { background: url("background.webp") center / cover no-repeat; opacity: .5; }`, and every child of the stage is lifted with `position: relative; z-index: 1`.
- Card: `aspect-ratio: 488 / 680; border-radius: 4.75% / 3.5%; box-shadow: 0 2px 6px rgba(0,0,0,.35), 0 18px 48px rgba(0,0,0,.35)`. The blurred thumb is `filter: blur(5px) saturate(1.05)`.
- List panel: `background: var(--panel)` with a 1px border. The title is `0.78rem, 700, letter-spacing .12em, uppercase, muted`. Rows are 25px tall at ≥900px with `border-radius: 6px` and hover `var(--panel-2)`.
- Scryfall transport: 100ms spacing, 5 tries, a 429/503 wait of `Retry-After` (or 0.5s × attempt) + 250ms, and a network error wait of 400ms × attempt.

---

## Appendix C: Decisions log

These are the owner's answers from the clarification session (2026-09-28), plus choices made while writing this spec (marked ◆). The owner can overturn any ◆ item.

| # | Topic | Decision |
|---|---|---|
| 1 | Data location | Shared cloud database (Supabase) |
| 2 | Devices | A few store computers |
| 3 | Access | One shared store password; the store account uses the real store email `playersuniongamecoop@gmail.com`; public sign-ups off |
| 4 | JustTCG plan | Starter now, Professional if development needs it |
| 5 | API keys | Held server-side (Edge Function); editable in Settings but never readable |
| 6 | Stack | React + Vite (◆ JavaScript, not TypeScript) |
| 7 | Repo | Public GitHub repo, GitHub Pages |
| 8 | Reference projects | The spec points to them and also summarizes the essentials (Appendix B) |
| 9 | start.bat | Runs the Vite dev server (◆ port 5180) |
| 10 | Git | Commit to main; push only when asked (push = deploy) |
| 11 | Offline | Connection required |
| 12 | Screens | Desktop/laptop 1080p+ (◆ usable at 1366×768) |
| 13 | Backups | Cloud backups + downloadable backup file (◆ cloud needs Supabase Pro; reminder banner on Free) |
| 14–16 | Users | Required before adding; recorded per buy/collection (creator + last editor for collections); remembered per computer |
| 17–18 | User colors / deletion | Auto-assigned and changeable; deleting hides but keeps history |
| 19–24 | Search | Both games at once with badges; auto-select when one printing is left; full keyboard; reset + refocus after add; Pokémon printed set codes; fuzzy names |
| 25 | Languages | English, plus Japanese Pokémon (◆ best-effort, spike in Phase 3; EN\|JP toggle) |
| 26 | Scope | Singles only (no preference given) |
| 27–32 | Buy list | Qty box; merge identical lines; `[LP]`-style tag when not NM (◆ plus `1st Ed`, `JP`, pattern in the same bracket); order added, newest at the bottom; grouped by game; remove asks how many |
| 33 | Purchase price | JustTCG market price (or manual); Cash 33% and Credit 66% shown |
| 34 | Totals | Sidebar bottom, collection header, day-page panels; (follow-up) Cash/Credit in totals only |
| 35 | No JustTCG price | Labeled Scryfall/TCGdex fallback (◆ NM only; other conditions need a manual price) |
| 36 | Collection prices | Locked when added |
| 37–39 | Details / foil | Only valid toggles; same set only; non-foil default |
| 40–42 | Finishes | Etched toggle `*E*`; Pokémon NORMAL\|HOLO\|REVERSE selector; `*H*` / `*RH*` |
| 43–47 | Walk-in buys | Draft saved and restored; one per computer; confirm dialog with count and total; optional customer name/notes; confirmed buys allow removing cards or deleting the whole buy |
| 48–55 | Collections | Status dropdown **and** step buttons; Paid/Ours locks (◆ unlock returns to Priced); not on the Calendar; US phone; name/phone editable; sortable/filterable/searchable table; delete by typing the name (◆ after a first warning step); one computer edits at a time, others read-only with Take over |
| 56–58 | Calendar | Day page shows that game only; months move together; Sunday start (◆ dots in user colors) |
| 59–60 | Global search | Visible everywhere, smaller on pricing screens; covers confirmed buys + collections |
| 61–64 | Master Crystal Inventory | Banner + exports blocked until uploaded; keep last 5; file < 5 MB; sample CSV comes with the export doc (◆ stored in private cloud storage so every computer shares it, instead of the browser memory the original notes mentioned) |
| 65 | Extra settings | Cash/Credit %; JustTCG usage meter |
| 66 | Changelog | Activity log of buys/collections (not software versions), CM timeline |
| C1–C6 | Changelog details | Walk-in buys logged at confirm only; also collection status and info edits; acting user on every entry; one timeline + game filter; entries link to targets; totals on entries |
| 67 | Branding | Logo + title |
| 68–69 | Phases | 10 small phases; per-phase "Where to look" checklists and the user-is-qa memory |
| 70 | Settings name (2026-09-29) | "Buy percentages" is called **Master Buy Percentages** |
| 71 | Custom rates (2026-09-29) | On the pricing screens the Cash/Credit percentages are clickable and open a subpanel for a custom rate for that one buy, saved with the buy (Section 8.9.1). Entered as a percent; pricing screens only, not day pages; custom rates on collections are logged as Actions entries |
| 72 | Store time zone (2026-09-29) | Confirmed: Pacific time, `America/Los_Angeles` |
| 73 | Price screen layout (2026-09-29) | Owner's sketch replaces the single stack: card left at Scryfall's 336×468 with prices under it; card info beside it with 10 suggestions (2×5) below; finish & details beside the suggestions with Qty/CLEAR/ADD CARD under them. Scryfall's image sizes are the reference for card images (Section 8.1) |
| 74 | Tokens and emblems (2026-09-29) | Not searchable: Magic tokens, emblems and art cards stay out of search results (Section 1.4) |
| ◆ 75 | Pokémon versions (Phase 4, 2026-09-29) | A Version list from TCGdex's `variants_detailed` (subtype, foil pattern, stamps incl. 1st Edition) replaces separate 1st Edition / W Promo checkboxes (Section 8.6) |
| ◆ | Environments | Separate Supabase dev and prod projects |
| ◆ | Devices | Each browser names itself ("Front Counter") for drafts and lock banners |
| ◆ | Keyboard | ↓/↑ for suggestions (←/→ stay as text keys); Alt shortcuts for condition, foil, quantity, manual price |
| ◆ | Price budget | 6-hour shared price cache; prices fetched only after a selection rests for 400ms |
| ◆ | Cancel | CANCEL asks before discarding a non-empty buy |
| ◆ | Changelog opening | Buys + Collections on, Actions off; runs of adds/removes within 15 minutes fold into one panel |
| ◆ | Card-not-found | No free-text cards in this version |

---

## Appendix D: Open items

1. **Export design doc**: the owner writes it. It includes the Crystal Commerce CSV column mapping, so **attach a sample CC export** (a few rows is enough).
2. **Supabase plan for prod**: Free (weekly manual backups, pauses after 7 idle days) vs. Pro ($25/month: daily backups, no pausing).
3. **Japanese Pokémon**: coverage confirmed good in the Phase 3 spike (Section 5.2 findings). Still open: how names should display, and the missing USD fallback price for Japanese cards (Phase 5).
4. **JustTCG plan**: watch the usage meter during the first weeks and move to Professional if the daily limit binds.
5. ~~**Store time zone**~~: confirmed Pacific time, `America/Los_Angeles` (`STORE_TZ`), 2026-09-29.
