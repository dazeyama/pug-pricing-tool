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

- **Exporting to Crystal Commerce:** see `docs/EXPORT_FUNCTION.md` (Section 14).
- **Phones and tablets.** The target is desktop and laptop screens at 1080p and up (Section 7.10).
- **Offline use.** The app requires a connection (Section 7.9).
- **Undo or rewind from the changelog.** The changelog is view-only (Section 12).
- **Individual staff accounts.** One shared store password protects the app. "Users" are color-coded staff profiles that are picked, not logged into (Section 7.3).
- **Sealed product, graded slabs, oversized cards.** Singles only. **Magic tokens, emblems and art cards are excluded** (owner's decision, 2026-09-29): the main search adds **`-is:extra`** (Scryfall's own "extras": tokens, emblems, art series, minigames, front cards, planes…). Scryfall leaves extras out of a plain name search by itself, but a collector number or set in the query brings them back: `cn:"2"` alone returned 734 cards, 89 of them extras on the first page ("2/184 S8b", owner, 2026-09-29); with `-is:extra`, 439 and none.

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

**Paper only** (owner's decision, 2026-09-29): every Scryfall query also carries `game:paper`, so digital-only printings (Arena, e.g. Arena Anthology 3; MTGO, e.g. Masters Edition) never show up, since the store can't buy them. Digital-only set codes aren't recognized as set codes in the search line either.

**No extras** (owner's decision, 2026-09-29): the main search also carries **`-is:extra`**, so tokens, emblems and art cards never show up (Section 1.4). Scryfall only leaves them out of plain name searches; a `cn:` or `set:` brings them back (`"2/184 S8b"` showed tokens and art cards). The details panel's sibling query keeps `include_extras`, since it only looks for the same card (same oracle ID) in one set.

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

**Japanese cards** (owner's decision, 2026-09-29): **Limitless TCG's image CDN**, `https://limitlesstcg.nyc3.digitaloceanspaces.com/tpc/<set>/<set>_<number>_R_JP_<size>.png`, by TCGdex's Japanese set ID (the printed code: `SM12a`, `SV2a`) and the number without leading zeros (`SM12a_1`); sizes `XS` 136×189, `SM` 274×381 (thumbnail), `LG` 460×640 (selected card). A missing card answers 403, so the `SM` picture is loaded first. Checked 2026-09-29: TCGdex has no pictures for whole older Japanese sets (SM12a, SM8b, S8b, SV5M…: 955 cards across 11 sets sampled), and Limitless had 19 of 21 sampled, missing only top secret rares. Cardmarket isn't usable for images (addresses need its internal set folders, and it blocks outside requests). JustTCG doesn't carry Japanese cards (Section 5.3), so there's no TCGplayer ID for them either. Settings' footer credits pokemontcg.io, TCGplayer and Limitless TCG for the images they supply.

**Set codes (owner's decision):** display the **printed abbreviation** from the set's `abbreviation` field (`PAL`, `OBF`, `SV2a`). Older sets have no printed abbreviation. For those, fall back to the TCGdex set ID in upper case (`BASE1`) and treat it as the code for search too.

**Japanese (owner's decision: English + Japanese Pokémon).** This is **best-effort** and must be verified with a short spike at the start of Phase 3:
- Japanese cards come from `/v2/ja/`. Their names are in Japanese, so a clerk can't reliably type them. Japanese matching therefore uses the **set code + collector number** (and printed size). The typed name is only used to rank results.
- In the buy list and database, store the name TCGdex returns. If it isn't Latin script, show it as `<English name typed> / <Japanese name>` so staff can read it. Always tag the line `[JP]`.
  - **As built (owner's decision, 2026-09-29):** lines show the card's **English name** when the app has one (from its Pokédex numbers, Section 8.4), e.g. `1 Pikachu (SV2a) 025 *H* [JP]`, and the Japanese name otherwise (Trainers, Energy). It's saved with the line as `name_en` (migration 0007), so the buy list, the changelog and later the day pages and export all read it; `name` keeps TCGdex's Japanese name, shown on hover in the buy list. The typed name isn't used: it may be partial.
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
| Pokémon (ja) | same as Pokémon en with `game=pokemon-japan` (as built: `game=pokemon&language=Japanese`, Section 5.3 "As built"). TCGdex has no TCGplayer IDs for Japanese cards, so it's the name + number search, **by the card's English name** (owner, 2026-09-29): from its Pokédex numbers (Section 8.4), else what was typed. Prices wait for that name to load. | same |

- **Pokémon set mapping:** match each TCGdex set to a JustTCG set once, by normalized set name from `GET /sets?game=pokemon` (or `pokemon-japan`), and cache it in `price_map` under `pokemon:set:<lang>:<tcgdex set id>`. *(As built: by printed set code, only for the name search, as `pokemon:set:<code>`; see "As built" below.)* If a name doesn't match exactly, leave it unmapped and log it to the console. The owner can report missing sets.
- A resolved mapping is stored in `price_map` (Section 6) so each printing is resolved **once**, then looked up by JustTCG card ID afterwards.
- If step 2 returns several candidates, the **set code breaks the tie** (owner's decision, 2026-09-29): keep the one whose JustTCG set name or set ID contains the card's printed set code as a whole word ("SV2a" in "SV2a: Pokemon Card 151"; "SV2" doesn't match it). If that doesn't leave exactly one, or step 2 returns none, don't guess. Treat it as "no JustTCG price" and use the fallback (Section 8.7).

**The `prices` Edge Function:**
- **Edge Function auth (applies to `prices` and `secrets`):** projects using the new publishable/secret keys must deploy functions with **`--no-verify-jwt`** (or `verify_jwt = false` in `supabase/config.toml`), because Supabase's built-in JWT check rejects them. Each function must then **verify the caller itself**: read the `Authorization: Bearer <access token>` header that supabase-js sends for the signed-in session, validate it with `supabase.auth.getClaims(token)` (or `auth.getUser(token)`), and return 401 if it's missing or invalid. Never skip this check. Without it, anyone could spend the JustTCG quota or overwrite the key.
- Input: a list of lookups `{ game, lang, scryfallId?, tcgplayerId?, tcgdexId?, name?, number?, setHint? }`.
- For each lookup, returns the cached JustTCG card from `price_cache` if it's younger than **6 hours**. Otherwise it batches the misses into `POST /cards` (≤100 items), stores the results, and returns them.
- Writes the latest `_metadata` (plan, daily/monthly used, remaining and limits) to `api_usage` after every JustTCG call.
- Handles 429 with exponential backoff and jitter (1s doubling to 30s, honoring `Retry-After`). If the daily or monthly quota is exhausted, it returns a clear error code the UI shows as "Daily price limit reached — enter prices manually until <reset time>". The daily reset is 00:00 UTC, shown converted to store time (e.g. 5:00 PM in summer, 4:00 PM in winter).

**As built (Phase 5, 2026-09-29), from JustTCG's documentation and `swagger.json` v1.1.0:**
- **Games:** `magic-the-gathering` and `pokemon`. There is **no separate `pokemon-japan` game** any more: Japanese prices are `pokemon` variants with `language: "Japanese"` (a `language` filter narrows the variants). Japanese searches send `language=Japanese`.
- **Card numbers include the set size:** JustTCG writes `"025/165"`, `"004/102"`, `"TG12/TG30"`, where TCGdex has `025` / `4` / `TG12`, so the name + number search compares only the part before the `/`, without leading zeros. JustTCG's own `number=` filter also wants that format: `number=025` finds nothing. **Starter allows at most 20 results per search** (`limit` over 20 is a 400, "Limit must be between 1 and 20 for your plan"). So the name search runs up to three steps, each only if the one before found nothing: **(a)** the name with **`number=025/165`** (TCGdex's number and printed set size, each padded to 3 digits like JustTCG's `004/102`); **(b)** the name **inside the card's JustTCG set**, found by `GET /sets?game=pokemon&q=<set code>` as the one set whose name or ID has the code as a word, remembered in `price_map` as `pokemon:set:<code>` (the set mapping above; a miss retried after 7 days); **(c)** the name alone. The number is always checked by the function. At most 4 requests for a card's first lookup, then none (found 2026-09-29 on the owner's Japanese Pikachu SV2a). For a Japanese card, if (a) finds the card by number but it has **no Japanese listings**, the search stops there (1 request): the owner's log showed JustTCG has the English 151 Pikachu (025/165) with no Japanese variants, no "SV2a" set, and nothing Japanese by name, so **JustTCG doesn't carry Japanese 151**. Japanese cards can still be priced from Cardmarket (TCGdex has Cardmarket prices for them: Pikachu SV2a €0.10, Charizard ex SV2a €2.09) with Use Cardmarket (Section 8.7). A step that errors isn't remembered as "no match". When nothing (or several) match, the function logs what each step got back: Supabase dashboard → Edge Functions → `prices` → Logs. Card names carry the number too (`"Mega Charizard Y ex - 022/217"`); the text search `q=` still finds them by name.
- **Batch:** `POST /v1/cards` takes **100 items on Starter and Pro** (200 on Enterprise, 20 on Free); the function batches at 100.
- **Conditions:** "Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged" → NM / LP / MP / HP / DMG.
- **Printings:** "Normal" and "Foil" (Magic); TCGplayer's names for Pokémon ("Normal", "Holofoil", "1st Edition", …). They're matched loosely (contains *reverse*, *holo*, *1st edition*) in `src/lib/prices.js` in case a name differs.
- **Usage metadata** (`_metadata` on every response): `apiPlan`, `apiRequestLimit`, `apiRequestsUsed`, `apiRequestsRemaining`, `apiDailyLimit`, `apiDailyRequestsUsed`, `apiDailyRequestsRemaining`, `apiRateLimit`. Only the fields present are written to `api_usage`.
- **Errors** are `{ error, code }`: `RATE_LIMIT_EXCEEDED` (per minute; retried with backoff), `DAILY_LIMIT_EXCEEDED` (resets 00:00 UTC) and `REQUEST_LIMIT_EXCEEDED` (monthly) → the function answers 429 with that code and `resetAt`, and the app shows the limit banner.
- **Lookups per selected card, in one request:** Magic by `scryfallId`, plus the etched product by `tcgplayer_etched_id`; English Pokémon by each version's TCGplayer ID from TCGdex (stamped versions are their own products); otherwise a name + number search that accepts only a single match (English must also match the set name). JustTCG card IDs are stored as their `uuid`.
- **Settings → Test** calls `GET /v1/games` (one request) to show the plan and remaining requests. **Status** never calls JustTCG, so opening Settings costs nothing.
- Both functions are deployed with `--no-verify-jwt` and check the caller's session themselves (`_shared/supabase.ts`); a signed-out call gets 401 (checked 2026-09-29).

**Request budget:** a price call is made **only after a printing has stayed selected for 400ms**, so cycling through suggestions with the arrow keys doesn't spend quota. With the shared 6-hour cache, one call covers every condition and finish of a printing across all store computers.

**Licensing:** commercial use requires a paid JustTCG plan (Starter qualifies). Don't expose raw JustTCG data to third parties. Settings may show "Prices via JustTCG"; attribution is appreciated but not required.

### 5.4 Price cross-checks (Cardmarket, exchange rate)

For the ⚠️ price warnings (Section 8.7), and for **Use Cardmarket**, which prices a card from Cardmarket only when staff press it (owner's decisions, 2026-09-29):

- **TCGplayer's own API** isn't an option: it has been closed to new developers for years, and JustTCG's prices come from TCGplayer's marketplace anyway. TCGplayer market prices we do have come free with the card data: Scryfall `prices.usd` (Magic) and TCGdex `pricing.tcgplayer` (Pokémon; none for Base Set's 1st Edition and Shadowless). Reading TCGplayer's website isn't allowed by its terms.
- **Cardmarket** (Europe's main marketplace), in euros: Scryfall `prices.eur` / `eur_foil` / `eur_etched` (Magic), and TCGdex `pricing.cardmarket` per version (Pokémon, including Japanese): the 30-day average `avg30`, else `trend`, else `avg`; the `-holo` figures for reverse holo. TCGdex gives Base Set's 1st Edition and Shadowless the same Cardmarket product, so they share a figure.
- **Euro → dollar rate:** the European Central Bank's daily rate from **Frankfurter** (`GET https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD`; free, no key, allows browsers, cached a day). One request per page load (`src/lib/useEurUsd.js`); if it fails, the Cardmarket check is skipped.

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
| status | text not null | walk_in: `draft` \| `confirmed`; collection: `processing` \| `priced` \| `paid` (shown as "Paid/Ours") \| `completed` (added 2026-09-29, migration 0011). A CHECK ties allowed values to `kind`. |
| customer_name | text | walk-in: optional (entered at confirm); collection: required |
| phone | text | collection: required; walk-in: optional, entered at confirm (added 2026-09-29). 10 digits stored (Section 9.3) |
| id_last4 | text null | collection: the customer's Last 4 ID, optional, 1–4 of `A–Z 0–9` (Section 9.2; migration 0010) |
| offer_cash, offer_credit | numeric(10,2) null | collection: **the offer** made when it was marked Priced (owner's decision, 2026-09-29): the cash figure typed in, and the credit offer worked out from it (Section 9.5). Kept when it goes back to Processing (the table shows TBD then); a new offer replaces it. Migration 0011. |
| paid_price, paid_method | numeric(10,2) null, text null | collection: **the price paid**, typed in when it was marked Paid/Ours, and `cash` or `credit` (owner's decision, 2026-09-29). Both or neither. Cleared when it's unlocked back to Priced or Processing; kept while Completed. Migration 0011. |
| completed_at | timestamptz null | collection: when it was marked Completed |
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
| name_en | text | A Japanese card's English name, shown instead of `name` when set (Section 5.2); null otherwise (added 2026-09-29) |
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
| market_price | numeric(10,2) null | The market price for the line's condition at add time, **before rounding** (as built, Phase 6): JustTCG's own price, or the fallback it came to; recorded even when a manual price was typed. Null when there was none. |
| price_source | text | Where `unit_price` came from: `justtcg` (JustTCG's price for the condition) \| `justtcg_fallback` (JustTCG's NM × a Master Fallback Percentage: JustTCG had no price for the condition, or it was thrown out) \| `scryfall_fallback` \| `tcgdex_fallback` \| `cardmarket` (Use Cardmarket, or a Japanese card's automatic fallback, Section 8.7) \| `manual`. `justtcg_fallback` and `cardmarket` added in migration 0004 (owner's go-ahead for Phase 6, 2026-09-29). |
| price_snapshot | jsonb | Every condition × printing price seen at add time (useful for export and disputes) |
| priced_at | timestamptz | When the price was fetched |
| scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id | text null | Source identifiers for the future export |
| image_url | text | Thumbnail URL |
| completed_at / completed_by | timestamptz null / uuid null → staff_users | Walk-in buys (migration 0018, owner's decision 2026-09-30): when this card was exported on its day page and by whom; set means **Completed**, null means **Paid/Ours** |
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
| day | date null | The store day a day-level entry is about (a day exported or put back; migration 0018) |

**`settings`**: key/value (`key text PK`, `value jsonb`, `updated_at`, `updated_by`)
- `cash_pct` (default `33`), `credit_pct` (default `66`), `last_backup_at` (timestamp of the last downloaded backup), `fallback_pct_mtg` (default `{NM:100, LP:90, MP:80, HP:70, DMG:60}`) and `fallback_pct_pokemon` (default `{NM:100, LP:85, MP:70, HP:55, DMG:40}`), the Master Fallback Percentages.

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
| `draft_add_line(device, line, user, merge)` | Creates this device's draft if none exists; inserts or merges a line | none (drafts aren't logged) |
| `draft_update_line(line_id, line, user)` | Saves an edited line over the old one (EDIT CARD, Section 8.9); merges with an identical line, keeping the earlier place. Returns the surviving line's ID. Migration 0006. | none |
| `draft_remove_line(line_id, qty, user)` | Decrements the quantity or deletes the line | none |
| `draft_cancel(buy_id)` | Deletes the draft and its lines | none |
| `draft_set_custom_rates(device, custom_cash_pct, custom_credit_pct, user)` | Sets or clears this device's draft custom rates (Section 8.9.1). Creates the draft if none exists. | none |
| `confirm_buy(buy_id, user, customer_name, notes, cash_pct, credit_pct, expected_version, paid_price, paid_method, line_texts, phone)` (migration 0020: name, phone and the price paid required; the old 9-argument version was dropped by 0022 once v0.9.1-final was live) | draft → confirmed; stamps `confirmed_*`; snapshots percentages (custom rate where set, else the master rate the screen showed). `line_texts` maps each line ID to its buy-list text (`lineFormat.js`) for the entry's card rows. Returns `{ number, games, target_name }`. | `buy_confirmed` with all lines and totals |
| `buy_remove_line(line_id, qty, user, device, expected_version, text)` | For confirmed buys (day page). **Refuses to remove a buy's last card** (`last_card`): the day page deletes the buy instead (owner, 2026-09-29). Migration 0013. | `buy_cards_removed` |
| `day_mark(day, game, user, device, complete)` | EXPORT on a day page (`complete` true) marks that game's Paid/Ours cards in the day's confirmed buys Completed; the ⋯ menu's undo (`false`) puts them back. Returns how many buys changed (0 if none: exporting a Completed day again changes nothing). Migration 0018. | `day_exported` / `day_unexported` |
| `buy_delete(buy_id, user, device, expected_version, line_texts)` | Deletes a confirmed buy, both games. Migration 0013; refuses (`buy_completed`) if any of its cards is Completed (0018, which also makes `buy_remove_line` refuse a Completed card). | `buy_deleted` with the full line list and totals |
| `collection_create(name, phone, notes, user, device, id_last4)` | `id_last4` optional (migration 0010); `collection_update_info` takes `id_last4` too | `collection_created` |
| `collection_add_line(buy_id, line, merge, user, device, expected_version)` | Requires this device to hold the lock and status ≠ paid | `collection_cards_added` |
| `collection_update_line(line_id, line, user, device, expected_version, old_text, new_text)` | EDIT CARD on a collection (as built, Phase 7): saves the edited line over the old one at **today's price** (owner's decision, 2026-09-29: edits always re-price, collections included), merging with an identical line like `draft_update_line`. Same requirements as adding. | `collection_line_edited`: the old line (−) and the new one (+) |
| `collection_remove_line(line_id, qty, user, device, expected_version)` | Same requirements, except that a **Paid/Ours** collection may still lose cards; Completed may not (owner, 2026-09-29; migration 0012) | `collection_cards_removed` |
| `collection_update_info(buy_id, fields, user, device, expected_version)` | name / phone / notes / custom rates (`custom_cash_pct`, `custom_credit_pct`) | `collection_info_edited` with before/after |
| `collection_set_status(buy_id, status, user, device, cash_pct, credit_pct, expected_version, offer_cash, offer_credit, paid_price, paid_method)` | Moving to `paid` snapshots percentages (custom rate where set, else master) and `paid_at`; leaving `paid` clears the snapshot but **keeps** the custom rates. **As of migration 0011 (owner, 2026-09-29):** Processing → Priced needs `offer_cash` (`offer_needed`; `offer_credit` is worked out from the rates when not given); → Paid/Ours needs `paid_price` and `paid_method` (`paid_price_needed`, `paid_method_needed`), except reopening from Completed, which keeps them; → Completed only from Paid/Ours (`complete_after_paid`). Unlocking to Priced or Processing clears the price paid; the offer stays. Completed refuses content writes like Paid/Ours (`collection_completed`). | `collection_status_changed`, with `offer` / `paid` field rows and the collection's totals when an offer or price is set |
| `collection_delete(buy_id, user, typed_name)` | Server checks `typed_name` matches | `collection_deleted` with the full line list and totals |
| `lock_acquire(buy_id, device, user, force)` / `lock_heartbeat` / `lock_release` | Section 9.6 | none |
| `restore_backup(payload, file, user, device, typed)` | Section 11.5 (as built, migration 0015) | `backup_restored` (milestone) |

Staff users, devices, settings and CSV metadata are written directly (RLS permits it) and aren't logged, except where noted.

**As built (Phase 6, migrations 0004–0005):** the draft functions take the acting user too (for `last_edited_by`); `draft_for_device` finds or creates the device's draft (two tabs on one computer share it). `round_down_price(numeric)` is the app's `roundDownPrice` in SQL, used for the Cash / Credit totals in `buy_confirmed` entries. A `buy_confirmed` entry's target name is **"Buy N · Tue Sep 29, 2026"**, N numbered among that day's confirmed buys (store time) with cards of the buy's first game (Magic before Pokémon), the day page it links to; its summary is one sentence, "5 cards bought from Alex M." The toast after confirming uses the same N: "Buy confirmed — Buy 3 today (Magic + Pokémon)".

**As built (Phase 7, migration 0008):**
- **Parameters.** The collection functions also take the acting device (`p_device`, for the lock check and the entry's `device_id`). The client passes each line's buy-list text for the entry's card rows: `p_text` (add, remove), `p_old_text` / `p_new_text` (edit) and `p_line_texts` (delete), as `confirm_buy` does. `collection_delete` takes the device too, and refuses while **another** computer holds a fresh lock.
- **Error codes.** Refusals raise short codes that the app turns into toasts (`useCollection.js`): `collection_gone`, `not_lock_holder`, `stale_version`, `collection_paid`, `locked_elsewhere`, `name_mismatch`, `bad_name`, `bad_phone`, `bad_pct`, `bad_status`, `no_user` and `line_gone`. Every collection write needs a picked user (`no_user`).
- **Holding the lock** means the `collection_locks` row names this device. A lock that has gone quiet (a background tab's slowed timers) is still this computer's until another computer takes it, and any write refreshes it.
- **Entries.** An entry's `target_name` is the customer's name at the time. Totals use the Paid/Ours snapshot, else the custom rates, else the master ones. Field rows show phones formatted.
- **Helpers:** `collection_for_write` (the checks every write shares), `collection_event`, `collection_totals`, `master_pct`, `format_phone`, `status_label`, `sentence` and `pct_text`.
- **Lock functions.** `lock_acquire` returns `{ held, device_id, device_label, staff_user_id, acquired_at }`. `lock_heartbeat(buy_id, device, user)` also moves the lock to the currently picked user.

**As built (Phase 10, migration 0015):**
- `global_search(name, number, size, set)` (Section 13): lines in confirmed walk-in buys and in Processing / Priced / Paid/Ours collections, matching part of `name_key` or of `name_en`, the collector number via `norm_number` (no case, no leading zeros), the printed size and the set code; newest first, at most 200, each walk-in line with its buy's day-and-game number. `search_set_codes()` lists the set codes stored lines use.
- `backup_export()` returns the whole backup as one JSON value; `backup_counts()` counts what's here as the restore dialog counts a file.
- `restore_backup(payload, file, user, device, typed)` is **security definer** (the changelog is append-only for the store's role, Section 6.1, and a restore has to replace it): it refuses unless signed in, `typed` is `RESTORE` and the payload is format version 1, then replaces everything in one transaction through `restore_rows` (an internal helper that inserts every non-generated column, so later columns round-trip; nobody can call it directly), resets the changelog's sequence, and logs the milestone. Refusal codes: `not_signed_in`, `not_confirmed`, `bad_backup`.

**As built (Phase 8, migration 0013):** `buy_target_name(buy_id)` gives a confirmed buy's name as things stand ("Buy N · Tue Sep 29, 2026", numbered like `confirm_buy`), so a removal or deletion entry names the buy as it was then; deleting a buy renumbers the rest of that day, while earlier entries keep their names. `buys_in_range(from, to)` returns each confirmed walk-in buy between two instants with its confirming user and games, for the Calendar. Entries are written by `buy_event` with the buy's snapshotted rates. Error codes: `buy_gone`, `line_gone`, `stale_version`, `last_card`, `no_user`.

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
- **Sign out** (owner's decision, 2026-09-29): a small round icon button (an exit arrow, no text) right of the chip, shown while a user is picked. It sets the computer back to no user ("Pick user"), with a toast "Dana signed out. Pick a user to carry on.", so everything that needs a user is blocked again until someone picks one. It doesn't sign the store's account out of the app.
- A user is **required** before any card can be added, a buy confirmed or a collection edited. When none is picked, those buttons are disabled with the tooltip "Pick a user first", and clicking one makes the user button pulse briefly.
- Where the app records "who" (Section 6), it records the user selected at that moment.

### 7.4 First sign-in on a device

After the store password: if this browser has no device ID, create one and ask **"Name this computer"** (placeholder "Front Counter"). Save it to `devices`. The name can be edited later in Settings.

**As built (owner's bug, 2026-09-30):** drafts, collection locks and changelog entries all point at the computer's `devices` row, so **nothing can write with its ID until that row is confirmed saved**. Until then a blocking **"Connecting this computer…"** dialog covers the app (it only fades in if the save takes over half a second). A failed save is **quietly retried three times** (after 1, 2 and 3 seconds; owner's decision, 2026-09-30, after the first live save needed one Retry), with the dialog still reading "Connecting…". Only if every try fails does it show the error with a **Retry** button, which starts a new round. Before this, a browser whose one save didn't land got "violates foreign key constraint buys_draft_device_id_fkey" on its first card. A browser that has a name but lost its ID gets a new ID.

### 7.5 Banners (below the header, above the tab content)

| Banner | When | Style |
|---|---|---|
| **Master Crystal Inventory required**: "Upload your Crystal Commerce inventory CSV in Settings before exporting." with an **Open Settings** link | No current Master Crystal Inventory file | `.banner.err`, always visible, on every tab |
| **Offline**: "No connection — changes are paused." | `navigator.onLine` is false, or Supabase Realtime is disconnected for over 10s | `.banner.warn` |
| **Backup reminder**: "Last backup downloaded N days ago." with a **Download backup** link | More than 7 days since `last_backup_at` (Section 11.5) | `.banner.warn`, dismissible for the session. **As built (Phase 10):** only while cloud backups are off (the Free plan); with no backup yet it reads "No backup has been downloaded yet."; **Download backup** is a button that saves one right there; **×** hides it until the browser is closed |
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
- **Cash is always green and Credit always blue** (owner's decision, 2026-09-29): tokens `--cash` (`#3ecf8e`) and `--credit` (`#6c8cff`) in `tokens.css`, used for their labels and amounts everywhere: the buy-list totals, the price panel's chips, the rates subpanel, the CONFIRM BUY dialog, Settings' Master Buy Percentages, and later the day pages, collections and changelog.
- Money: `$1,234.56`; whole-dollar amounts drop the cents, `$12` not `$12.00` (owner's decision, 2026-09-29). Totals round the **sum**, not each line, and Cash / Credit round **down** by the same steps as prices (owner's decision, 2026-09-29): `cash = roundDownPrice(total × cash_pct / 100)`, i.e. under $1 to the cent, $1–$10 to the quarter, $10–$100 to the dollar, $100–$1,000 to the $5, $1,000 and up to the $10 (`payout` in `src/lib/money.js`). Market totals aren't rounded further: they're sums of already-rounded prices (or manual prices).

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
│ ┌──────────────┐  ┌─ CARD INFO ───────────┐  ┌─ PRICE ───────────────────┐    │   (DMU) 243 *F*  │
│ │              │  │ Lightning Bolt        │  │ NM  $2.10                 │    │ …                │
│ │              │  │ Double Masters (2X2)  │  │[Credit $1.25] [Cash $0.69]│    │ ── Pokémon (3) ──│
│ │  336 × 468   │  │ #161 / 331 · Uncommon │  └───────────────────────────┘    │ 1 Charizard ex   │
│ │ (Scryfall's  │  └───────────────────────┘          … show all (23)          │   (OBF) 125 *H*  │
│ │  card-page   │  [t1] [t2] [t3] [t4] [t5]     ┌─ FINISH ─────────────┐       │ …                │
│ │  size)       │                               │ FOIL  [ ON | OFF ]   │       │                  │
│ │              │                               ├─ DETAILS ────────────┤       │                  │
│ └──────────────┘  [t6] [t7] [t8] [t9] [t10]    │ ☐ Borderless …       │       │ Market   $41.20  │
│ ┌NM─┐┌LP─┐┌MP─┐┌HP─┐┌DMG┐ [✎]                  └──────────────────────┘       │ Cash 33% $13     │
│ │$2 ││$1 ││$1 ││$0 ││$0 │                     Qty [ 1 ] [CLEAR] [ADD CARD]     │ Credit 66% $27   │
│ └───┘└───┘└───┘└───┘└───┘                                     ↓↑ pick · Esc … │[CANCEL][CONFIRM] │
└────────────────────────────────────────────────────────────────────────────────┴──────────────────┘
```

Below the main search bar, the stage is three columns (**owner's layout, 2026-09-29**, replacing the original single stack):

| Left | Middle | Right |
|---|---|---|
| **Selected card** at Scryfall's card-page size (**336×468**), centered in its column, with the **condition / price table** directly under it | **Card info** beside the card, then the **suggestions**: 10 thumbnails in **2 rows of 5** | Beside the card info: the **price panel** (Section 8.7). Beside the suggestions: the **finish control** and **details panel**, then the action row (**Qty, CLEAR, ADD CARD**) under them |

**Sidebar width** (owner's decision, 2026-09-29): the buy list is 340px plus whatever width the suggestions don't use, up to 560px. On a wide screen the thumbnails reach their height limit and stop growing; the width left over goes to the sidebar instead of sitting empty between the thumbnails and Finish & Details (measured with a `ResizeObserver` on the suggestions area, `useListRoom` in `PricePage.jsx`). On a narrow screen (1366×768) there's nothing spare and the sidebar stays 340px.

Card image sizes follow Scryfall's as the reference: the selected card is 336×468, and a thumbnail is at most Scryfall's small image (146×204), shrinking only to fit 5 across and 2 rows down. The selected card shrinks only when the window is too short for it. The sidebar's bottom holds the totals and **CANCEL / CONFIRM BUY**, which mirror CLEAR / ADD CARD in size, shape and position.

### 8.2 Main search bar

- A large input (about 56px tall, 20px text) at the top of the stage. **It never moves and isn't an overlay.** It has focus when the screen opens and gets focus back after every add and every CLEAR.
- An **MTG | PKM** toggle left of EN | JP (owner's decision, 2026-09-29) picks the games searched. Each side switches on and off (in its badge color when on); **both are on by default**, and **at least one stays on** (the last one on can't be switched off). A game that's off isn't queried at all, and the "Showing results for" correction only suggests names from the games that are on. The choice holds for the whole buy and **resets to both** when the buy is confirmed or cancelled (Phase 6) or the Price tab is left; a page refresh also resets it. When nothing matches, the empty message says which game is off.
- An **EN | JP** segmented toggle at its right edge. It affects **Pokémon only** (Magic is always English), defaults to **EN**, and is remembered per device. While JP is on, a small "JP" chip shows in the input. It's greyed out while PKM is off.
- **Wrong-language set code** (owner's decision, 2026-09-29): when the typed set code isn't a Magic code or one of the current language's Pokémon codes but is the other language's ("2/184 S8b" with EN on), the note under the search bar says "**S8b** is a Japanese Pokémon set: switch to JP", and clicking *switch to JP* flips the toggle (and the reverse for an English code with JP on). It shows in place of "Showing results for".
- Search runs live as the user types (debounce 250ms, minimum 2 characters). **Both games are queried every time** (owner's decision) unless MTG | PKM switches one off, and results mix together with game badges.

**Query syntax.** The expected line is what's printed on the card:

```
<card name> <collector number>/<printed size> [<set code>]
```

Examples: `Lightning Bolt 161/295`, `Abrade 37/291 SOA`, `Charizard ex 125/197 OBF`, `Pikachu TG05/TG30`, `Sol Ring`.

Parsing rules (`src/lib/query.js`), applied to the trimmed input:

0. **Commas are treated as spaces** (owner's decision, 2026-09-29): `Gut, True Soul Zealot` searches as `Gut True Soul Zealot`, which matches more cleanly in practice.
1. If the last token is 2–6 letters or digits containing at least one letter, and doesn't contain `/`, **and** the token before it contains `/` (or matches a known set code), it's the **set code**. Case-insensitive, matched against Scryfall set codes and Pokémon printed abbreviations.
2. The next last token containing `/` is **`<number>/<size>`**. The number keeps letters and symbols (`263s`, `TG05`, `SV107`, `★`). The size may be numeric (`295`) or prefixed (`TG30`).
3. A last token that is purely a collector-number pattern, with no `/`, is accepted as a **number only**.
4. Everything before that is the **name**. The name may be partial (`light bol`).
5. Number comparisons ignore leading zeros (`037` = `37`) and case.

**Matching.**
- **Name correction:** if the name part doesn't match any known name as a prefix or substring, run a Fuse.js search against the cached name catalogs (Scryfall catalog; TCGdex names per language). Retry with the best match when its score passes the threshold. Show "Showing results for **Lightning Bolt**" under the bar when a correction was applied.
- **Magic:** `cards/search` with `q = <name terms> lang:en` plus `cn:<number>` and `set:<code>` when given. Then filter by `printed_size` using the cached sets list, **only when that set's `printed_size` is known** (sets like SLD or PLST have none, and those printings are kept but ranked lower).
- **Pokémon (EN):** TCGdex `cards?name=<name>` (plus `localId` when a number is given), then filter by set `cardCount.official` = size, and by printed abbreviation = set code when given. **(JP):** match by set code + number + size (Section 5.2).
- **Ranking:** (1) number + size + set all match, (2) number + size, (3) number, (4) name only. Within a rank, newest release first (or oldest first with the sort toggle, Section 8.3). Magic and Pokémon interleave by rank.
- **Paging:** take the first page of each source (Scryfall returns up to 175). If there are more, "show all" says "175+ — refine your search".

### 8.3 Suggestions row

- Up to **10 thumbnails** of the best matches in rank order, in **2 rows of 5** under the card info (Section 8.1). Beneath each is a caption with its game badge and `SET #num` (owner's decision, 2026-09-29: a badge on the card's top corner covered the name, and Scryfall's image rules keep overlays off the bottom strip).
- **Sort toggle** (owner's decision, 2026-09-29): on the same line, at the left (the status follows it), a small pill that reads **↓ Newest first** (the default) or, clicked, **↑ Oldest first** (accent-colored while reversed). It flips the date order within each rank; the rank still comes first, so exact number/set matches lead either way. It **re-runs the search** (Scryfall `dir=asc`, TCGdex sorted before the first page is cut), so oldest first starts at the true oldest printing even when there are 175+. Remembered like MTG | PKM: for the whole buy, back to newest first when a buy is confirmed or cancelled or the Price tab is left.
- A **"… show all (N)"** button on the line above them when N > 10. It opens a modal grid of every match (same thumbnails, scrollable, with the same keyboard behavior). Clicking a card selects it and closes the modal.
- The highlighted suggestion has an accent outline (the keyboard cursor, Section 8.11).
- **Right-clicking a thumbnail** (owner's decision, 2026-09-29), in the row or the "show all" grid, types that card's name into the search bar and searches it: a quick way to see every printing of the card. It's the plain name ("Lightning Bolt"; a Japanese card's own name), so cards with those words in their names come up too (the owner's choice: simple over exact). The browser's own right-click menu doesn't open there.
- Clicking a thumbnail makes it the **selected card**. Clicking the selected card's thumbnail again deselects it, leaving nothing selected (owner's decision, 2026-09-29).
- **Hover** (owner's decisions, 2026-09-29): a thumbnail pops up and grows (about 14%, with a slight overshoot and a deep shadow). Then the **set symbol** pops in over the spot a Magic card prints it (the right end of the type line, mid-right), large (about 38% of the card's width) and **colored for rarity**: common black, uncommon silver, rare gold, mythic orange-red, special/bonus purple. When there's **no symbol**, a small chip with the **set code** shows there instead, in the same colors. That covers every Pokémon card (TCGdex's set-symbol images return 404, and suggestions don't carry Pokémon rarity, so these chips are slate) and any Magic symbol that fails to load.
- **Auto-select** (owner's decision): when the results narrow to exactly **one** printing, it becomes the selected card automatically. With several matches nothing is selected until the user clicks or arrows to one. The previous selection clears when the query changes enough that it no longer matches.
- States:
  - Searching: a subtle "Searching…" with a spinner. The previous query's thumbnails **clear as soon as a new search starts** (owner's decision, 2026-09-29), leaving the empty card shapes; the selected card stays until the new results arrive (Section 8.12).
  - Image still loading (a thumbnail or the selected card, including a Pokémon backup still being looked up, Section 5.2): a card-shaped shimmer with a spinner and "Loading…". The card back appears only once every source has been tried (owner's decision, 2026-09-29).
  - No match: "No cards match. Check the number and set code." Also show the name correction when one was tried.
  - A source failed: its badge greys out, with "Scryfall didn't respond — retrying…" or "TCGdex didn't respond — retrying…". The other game's results still show.

### 8.4 Selected card

- The large card image (AT `.card-wrap`, `--card-radius`, `--shadow`) with two-stage image loading, at **Scryfall's card-page size, 336×468** (owner's decision, 2026-09-29), centered in its column whether empty or showing a card (owner, 2026-09-29), so a card shrunk by a short window stays in the middle. It keeps the card's proportions at all times and only shrinks when the window is too short.
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
  - beside it, **View on TCGplayer ↗** (owner's decision, 2026-09-29): the product page by TCGplayer ID (Scryfall's `tcgplayer_id` for Magic; for English Pokémon **the chosen version's own TCGplayer product** where TCGdex gives it one, e.g. 1st Edition Charizard opens the Shadowless product, not Unlimited's (owner, 2026-09-29), else the card's first), or, with no ID (Japanese Pokémon), **Find on TCGplayer ↗**, a TCGplayer search for the typed name and number.
  - then a Cardmarket link (owner's decision, 2026-09-29). **Magic: View on Cardmarket ↗**, Scryfall's own `purchase_uris.cardmarket`. **Pokémon: Find on Cardmarket ↗**, a Cardmarket search by **name and collector number** (`/en/Pokemon/Products/Search?searchString=<name> <number>`, e.g. "Pikachu 025"; owner, 2026-09-29: Cardmarket's search matches that best). **Japanese cards search in English** (owner, 2026-09-29: Cardmarket and TCGplayer find nothing for Japanese text): the English name comes from the card's Pokédex numbers (TCGdex `dexId`) and `src/lib/pokemonNames.json`, the 1,025 English species names from PokeAPI (fetched once, 2026-09-29; loaded only for a Japanese card), plus the Latin markers in the Japanese name: "メガリザードンYex" → "Mega Charizard Y ex", "ピカチュウ&ゼクロムGX" → "Pikachu & Zekrom GX". Trainers and Energy have no `dexId`, so they fall back to the typed name, then the Japanese name. Find on TCGplayer and the JustTCG price lookup (Section 5.3) use the same English name, and the info box shows it beside the Japanese name, smaller and muted ("ピカチュウ Pikachu"); the "What you typed" chip then isn't needed. A bare product link, `/en/<game>/Products?idProduct=<id>`, gets Cardmarket's "Sorry, you have been blocked" page even in a normal browser (owner, 2026-09-29), while Scryfall's link, which adds its `referrer` and tracking parameters, opens fine; so no product-ID links are built. All three links with "View on" need about 400px inside the info box, so the box may grow to 500px wide where there's room (1920×1080), and when its inside is under 420px (1366×768) the links drop the verb: "Scryfall ↗ TCGplayer ↗ Cardmarket ↗".
  - **The links open in pop-up windows, not tabs** (owner's decision, 2026-09-29): one small pop-up per site (Scryfall/TCGdex, TCGplayer, Cardmarket), about 1280 × 1000, centred over the app, each a little down and right of the last. Clicking the same site's link for the next card reuses its pop-up and brings it to the front, so after the first click the window is already open where it was left (`src/lib/popup.js`). Browsers always show a pop-up's address, read-only, in its title bar (anti-phishing, can't be turned off); tabs, toolbar and bookmarks are gone. The link loads the page into the pop-up with no referrer (as before); if the browser blocks pop-ups, the link still opens in a tab. Ctrl/Shift-click keeps the browser's own new-tab/new-window behaviour. Reusing a pop-up needs the page to keep its link back to the app (`window.opener`), which these four sites could in principle use; accepted for well-known sites.
- ⟲ **Flip** for Magic double-faced cards (Section 5.1).
- **Foil sheen** (owner's decision, 2026-09-29, like Moxfield's foil indicator): while the chosen finish is Magic **foil** or **etched**, or Pokémon **HOLO**, a bright, drifting rainbow sheen (strong enough to be unmistakable) covers the selected card, brighter and dimmer in diagonal bands, and a rainbow label centred on its own line directly under the card (always one line) names the finish (**✦ FOIL**, **✦ ETCHED FOIL**, **✦ HOLO**, **✦ REVERSE HOLO**). For Pokémon the sheen covers the area that really shines: **HOLO** only the **art window**, **REVERSE** holo **everything except the art window** (owner's correction, 2026-09-29). **Art windows by frame era** (owner's decision, 2026-09-29, replacing one modern and one pre-2003 window, which missed e.g. Gible 85 from Mysterious Treasures): the set's release year picks the era (`frameEra` in `src/lib/pokemonFrames.js`), and each era has its own mask (`.card-shine.era-*` in `price.css`), measured on TCGdex's full-size 600 × 825 scans (each edge the strongest straight line near a first guess, the median over 5–8 sample cards per era, checked with red overlays):

  | Era | Across | Down | Measured on |
  |---|---|---|---|
  | 1999–2002 | 10.83–89.33% | 11.76–51.52% | Base Set, Jungle, Gym Challenge, Neo Genesis, Neo Destiny |
  | 2003–2006 | 7.33–92.67% | 9.45–46.18% | Ruby & Sapphire, Hidden Legends, Emerald, Crystal Guardians, Power Keepers |
  | 2007–2010 | 6.83–93.33% | 9.33–49.94% | Diamond & Pearl, Mysterious Treasures, Majestic Dawn, Platinum, Arceus |
  | 2011–2016 | 8.67–91% | 10.55–49.7% | Black & White, Dark Explorers, Legendary Treasures, XY, Ancient Origins |
  | 2017–2022 | 7.83–92.5% | 9.82–47.15% | Cosmic Eclipse, Sword & Shield, Brilliant Stars, Silver Tempest |
  | 2023 on | 8–92.5% | 9.82–47.15% | Scarlet & Violet, Obsidian Flames, Twilight Masquerade, Surging Sparks, Destined Rivals |

  Known outliers, accepted (owner, 2026-09-29: "outliers are still going to happen and that's ok"): Sun & Moon sets before Cosmic Eclipse (a wider window), HeartGold SoulSilver and Call of Legends (wider and taller), the e-Card sets (Expedition, Aquapolis, Skyridge), and Evolutions (the Base Set frame again). The holo's god rays turn about the era's art-window centre. **Full-art** Pokémon cards shine across the whole card (rarities Full Art Trainer, Illustration rare, Special illustration rare, Ultra Rare, Hyper rare, Mega Hyper Rare, Secret Rare, Shiny Ultra Rare, Black White Rare, Character (Super) Rare, VMAX and VSTAR, plus Trainer Gallery / Galarian Gallery numbers). **Rule-box Pokémon** shine across the whole card too, holo or reverse (owner's decision, 2026-09-29: the art-window mask doesn't fit their frames): ex / EX, GX, V, VMAX, VSTAR, V-UNION, LV.X, LEGEND, BREAK, Radiant and Prism Star, found from TCGdex's `suffix`, its `stage` (VMAX, VSTAR, V-UNION, BREAK) or the name (`src/lib/pokemonFrames.js`, `isRuleBox`). HOLO adds slowly turning **god rays** out of the art box. REVERSE uses a much higher-contrast gradient, the rainbow alternating with deep navy/purple bands, strong enough to darken the card a little. A **Poké Ball** or **Master Ball** pattern reverse holo also gets that ball as a badge inside the selected card's bottom-right corner, inset from the edges, and the finish label names it ("✦ REVERSE HOLO · POKÉ BALL") (owner's decisions, 2026-09-29). Pokémon sheens are stronger than Magic's and blend with **hard-light** instead of Magic's color-dodge, which bleached the rainbow to white on light Pokémon cards (owner's decisions, 2026-09-29). The sheen fades out above the bottom (artist/copyright) strip, so that strip stays clear as Scryfall's image rules require. It stands still for viewers who prefer reduced motion. Thumbnails don't get it.

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

**As built (Phase 4, 2026-09-29):** TCGdex's `variants_detailed` lists every physical version of a card, not just flags: `type` (normal / holo / reverse), `subtype` (unlimited, shadowless, shadowless-red-cheek, 1999-2000-copyright…), `foil` pattern (pokeball, masterball, cosmos…) and `stamp`s (1st-edition, set-logo, pokemon-together, snowflake, poketour-99…); `size` jumbo versions are ignored. So instead of separate 1st Edition / W Promo checkboxes, the details panel shows a **Version** radio list for the chosen finish, one plain-words entry per version ("1st Edition", "Shadowless", "Poké Ball pattern").

**Version names** (owner's question, 2026-09-29): Base Set was printed in runs, and TCGdex lists each: **1st Edition** (stamped; the whole run is shadowless, so there's no 1st Edition with a shadow), **Shadowless** (no stamp, no shadow), **Unlimited** (drop shadow on the art box) and the **1999–2000 Copyright (4th print)**; Pikachu adds red-cheek versions. Later WotC sets (Jungle, Fossil, …) have just 1st Edition and Unlimited. So labels put **1st Edition first and drop "Shadowless" from it** ("1st Edition", "1st Edition · Red Cheeks"; TCGdex's own label reads "Shadowless · 1st Edition"), and the plain version of a card that has a 1st Edition reads **Unlimited**, not Standard. Each version prices from its own TCGplayer product and printing: Unlimited from the Base Set product ("Holofoil"); 1st Edition and Shadowless from the Shadowless product ("1st Edition Holofoil" / "Unlimited Holofoil"). A version without a TCGplayer ID (the 4th print) prices as the plain version. The chosen version sets the line's `first_edition` (the 1st-edition stamp) and `treatments` (subtype, pattern, other stamps). Choosing NORMAL | HOLO | REVERSE starts on that finish's plainest version. Cards without `variants_detailed` fall back to `variants` (a Standard and, where `firstEdition` is set, a 1st Edition version per finish). Pokémon printings aren't moved between as siblings: the details they differ in are rarity and number, which are shown, not toggled.

**How toggling works** (owner's decisions: only valid toggles; stay within the same set):

1. When a card is selected, load **all printings of that card in the same set** (Section 5.1, or the same name + set for TCGdex) and compute each one's trait set.
2. Traits that **differ** among those siblings are shown as **checkboxes**. Traits shared by all siblings are shown as **read-only chips**, so every trait is visible but only meaningful ones are clickable.
3. A checkbox is **enabled only if some sibling has that trait flipped**. Otherwise it's disabled, with the tooltip "No printing in this set without Showcase".
4. Clicking a checkbox selects the sibling that has the flipped trait **and** differs least from the current traits (fewest other differences; ties go to the lowest collector number). The selected card, info panel, finish control and prices update to that sibling.
5. Only the changes available within the same set are offered. Moving to another set means searching again.

### 8.7 Condition / price table

A row of five large buttons directly under the selected card (Section 8.1):

```
┌── NM ──┐ ┌── LP ──┐ ┌── MP ──┐ ┌── HP ──┐ ┌── DMG ─┐
│ $2.10  │ │ $1.80  │ │ $1.40  │ │ $0.95  │ │ $0.60  │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
   [ Use Fallback ] [ Use Cardmarket ] [ ✎ Manual price ]
        Prices via JustTCG · updated 2h ago
```

- Each button shows the condition label and **the JustTCG price for the selected printing + finish + condition**. These are the most important thing on the screen (owner, 2026-09-29): tall buttons with large bold prices (long prices step down to fit) and a colored top edge per condition, NM green, LP yellow-green, MP amber, HP orange, DMG red. The selected condition is filled with accent color. **NM is selected by default**, and resets to NM after each add and on CLEAR.
- **Loading:** show shimmering placeholders while prices load.
- **No JustTCG price** for a cell:
  - The base price is **JustTCG's own NM price** when it has one (owner's decision, 2026-09-29: e.g. JustTCG prices NM but not HP). Only when JustTCG has no NM price does the **fallback** market price stand in for NM: Scryfall `prices.usd` / `usd_foil` / `usd_etched` for Magic, or TCGdex's TCGplayer market price for the version (English only) for Pokémon.
  - **Every condition** without a JustTCG price shows that base price × its **Master Fallback Percentage** (owner's decision, 2026-09-29; Settings, Section 11.4), with a small "fallback" tag and a tooltip showing the working. Defaults: **Magic** NM 100%, LP 90%, MP 80%, HP 70%, DMG 60%; **Pokémon** NM 100%, LP 85%, MP 70%, HP 55%, DMG 40%.
  - **Japanese Pokémon with no JustTCG price for any condition** (owner's decision, 2026-09-29): TCGdex has no dollar price for them, so **Cardmarket is the fallback automatically**: NM = Cardmarket's price in dollars (Section 5.4) × the NM percentage, the other conditions by their percentages, tagged "CM" (the price panel "cardmarket"), with the caption "No JustTCG price: Cardmarket prices shown." Use Cardmarket is greyed out then (nothing to switch). JustTCG doesn't carry Japanese 151 at all (Section 5.3), so this is the usual case for Japanese cards. `price_source` is `cardmarket` (Phase 6).
  - With no fallback price either (e.g. a Japanese card Cardmarket doesn't list, or before the day's exchange rate loads), cells show "—".
- **Prices never rise as the condition drops** (owner's decision, 2026-09-29). Reading NM → DMG, a JustTCG price higher than the condition above it (e.g. MP more than LP) is **thrown out** and replaced by a fallback, worked out the same way (JustTCG's NM, else Scryfall/TCGdex, × the percentage). A fallback that would **show the same as or more than** the condition above it (compared rounded, as shown) is set **10% (Magic) or 15% (Pokémon) below that condition's price** instead (owner's decision, 2026-09-29), so two conditions never show the same fallback price: e.g. Isshin, Two Heavens as One (FCA 54), LP $7.78 → MP $7 and HP $4 → DMG $3.50. Between $1 and about $2.50, where prices round to the quarter, that can still show the same price ($1.20 and $1.08 both show $1); there the fallback is **a full quarter below** the condition's shown price instead ($1 → $0.75; owner's decision, 2026-09-29). These cells carry the "fallback" tag, and the tooltip names the thrown-out price and any step down (`priceLadder` in `src/lib/prices.js`). Throwing out JustTCG prices compares unrounded prices.
- **Rounding** (owner's decision, 2026-09-29): every market and fallback price is **rounded down** before it's shown or used as the purchase price: under $1 to the cent; $1–$10 to the nearest quarter; $10–$100 to the dollar; $100–$1,000 to the $5; $1,000 and up to the $10 (`roundDownPrice` in `src/lib/money.js`). The tooltip shows the unrounded price. Manual prices aren't rounded. A line's `market_price` keeps the unrounded JustTCG price (Phase 6). A condition with "—" can still be selected, but then ADD CARD needs a manual price.
- **⚠️ on NM** (owner's decisions, 2026-09-29): the NM label shows ⚠️ when JustTCG's prices for the printing look wrong. The **price panel** then shows one amber line under Credit/Cash, **"⚠️ Price may be wrong (3)"**. Hovering it shows the reasons in an amber box **floating over Finish & Details**, one short line each ("MP $10,000, DMG $4,200 are over 2× NM ($359.95)", "Below Unlimited's NM ($944.53)", "Cardmarket €2,478.82 ≈ $2,815 (7.8× more)"); clicking keeps it open until the next click elsewhere (owner's decision, 2026-09-29: first one long NM tooltip, too hard to read; then a box pushing Finish & Details down, which left them unusable on short screens; so nothing else may lose room to it). The NM tooltip only points to the line (`priceWarnings` in `src/lib/prices.js`, `QuotePanel.jsx`, `PriceWarnings.jsx`). All four checks use data already loaded, so they cost no requests:
  1. **TCGplayer market price:** JustTCG's NM and the fallback NM (Scryfall/TCGdex × the NM percentage) differ by **25% or more of JustTCG's price and at least $1**.
  2. **Out of order:** a worse condition costs **more than twice** the best condition JustTCG prices (Base Set Charizard 1st Edition: MP $10,000 and DMG $4,200 against NM $359.95).
  3. **1st Edition below Unlimited** (Pokémon): a 1st Edition's JustTCG NM is lower than its plain Unlimited version's, whose prices came in the same request (the same Charizard: $359.95 against $944.53).
  4. **Cardmarket:** Cardmarket's price (Section 5.4), in dollars at the day's rate, is **at least twice or half** JustTCG's NM and **$5 or more** apart. The markets differ, so only big gaps count (the same Charizard: €2,478.82 ≈ $2,815, 7.8× JustTCG's NM).
- **Use Fallback** (owner's decision, 2026-09-29): a button to the left of ✎ Manual price. Its tooltip shows the fallback NM price (e.g. "Use Scryfall's $11 for NM, and the fallback percentages for the other conditions, instead of JustTCG's prices"). Pressing it **throws out every JustTCG price** (owner's decision, 2026-09-29): NM becomes the Scryfall/TCGdex fallback and the other conditions that price × their Master Fallback Percentages, as if JustTCG had no prices for the card. All five cells carry the "fallback" tag. Pressing again goes back. It resets for every new card, and is disabled when there's no fallback price or JustTCG has no prices anyway. With it on, every condition's `price_source` is the fallback's (Phase 6).
- **Use Cardmarket** (owner's decision, 2026-09-29): between Use Fallback and ✎ Manual price, mirroring Use Fallback. Pressing it throws out every JustTCG price: NM becomes **Cardmarket's price in dollars** (Section 5.4: the euro price × the day's ECB rate) × the NM percentage, and the other conditions that price × their Master Fallback Percentages, with the same never-rise and step-down rules. The cells are tagged **"CM"** (owner, 2026-09-29: "CARDMARKET" didn't fit a button) and the price panel "cardmarket", and the tooltip shows the euro price and its dollar value ("Use Cardmarket's €2,478.82 (≈ $2,810) for NM…"). Use Fallback and Use Cardmarket are one choice: pressing one turns the other off, pressing it again goes back to JustTCG, and it resets for every new card. It's disabled when there's no Cardmarket price or the exchange rate hasn't loaded. Unlike Use Fallback it works when JustTCG has no prices at all (e.g. a Japanese card, where TCGdex has no USD price). With it on, `price_source` is `cardmarket` (Phase 6). The three buttons and the manual price's × fit the 336px column with 5px 8px padding and 6px gaps.
- Use Fallback, Use Cardmarket and ✎ Manual price sit **centered** under the buttons, with the caption on its own line below them: "Prices via JustTCG · updated 2h ago" (from the cached `fetched_at`).

**Manual price:**
- **✎ Manual price** opens a small inline input next to the button ("$ ___", 2 decimals, ≥ 0.00). Enter or blur applies it.
- While a manual price is set, the selected condition button shows the manual price in **bold**, with a **✎ beside the condition label** (like the ⚠️; owner, 2026-09-29: beside the price it clipped and widened long prices), and the market price in small strikethrough beneath it.
- The manual price becomes the line's `unit_price` with `price_source = 'manual'`. `market_price` still records JustTCG's price when there is one.
- **×** clears the manual price. It also clears when a different condition is picked (owner's decision, 2026-09-29: a manual price belongs to its condition), on CLEAR, and after each add.

**Purchase price** of the next line = manual price if set, else the price shown on the selected condition (JustTCG's, or the fallback's). ADD CARD is disabled when none exists.

**Price panel** (owner's decision, 2026-09-29): beside the card info, the same height as it. It shows the purchase price for the selected condition in large green type, labeled with the condition (and "fallback" or "✎ manual" when it is one). Under it, two smaller chips: **Credit** and **Cash**, the purchase price × the Master Buy Percentages, **rounded down by the same steps as prices** (owner's decision, 2026-09-29: under $1 to the cent, $1–$10 to the quarter, $10–$100 to the dollar, $100–$1,000 to the $5, $1,000 and up to the $10; `payout` in `src/lib/money.js`). A chip's tooltip shows the percentage and the unrounded amount. It's **display only**: nothing is saved, since it can always be worked out again. It follows condition, finish, Use Fallback and manual price changes as they happen, shows "—" when there's no price, and a dashed "Price appears here" box with no card. Phase 6: use the buy's custom rates (Section 8.9.1) where set.

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
- **Grouped by game** (owner's decision): a "Magic (9)" header, then its lines; a "Pokémon (3)" header, then its lines. The headers are chips in the game's badge colors, indigo for Magic and amber for Pokémon, like the MTG | PKM toggle (owner, 2026-09-29). A group is hidden when empty. Within a group, lines are in the **order added, newest at the bottom** (owner's decision). A newly added line scrolls into view.
- **Line text** (plain text, Moxfield-style, from `src/lib/lineFormat.js`):

```
<qty> <name> (<SET>) <number>[ <finish marker>][ [<tags>]]
```

| Part | Rule |
|---|---|
| name | As stored. Double-faced Magic cards use the full `Front // Back` name. |
| SET | Magic: the Scryfall set code in upper case. Pokémon: the printed abbreviation (Section 5.2). |
| number | The collector number as printed, without the size (Pokémon keep TCGdex's printed form, e.g. `025`) |
| finish marker | Magic: `*F*` foil, `*E*` etched, nothing for non-foil. Pokémon: `*H*` holo, `*RH*` reverse holo, nothing for normal. |
| tags | Only non-defaults, in this order, comma-separated in one bracket: condition if not NM (`LP`), `1st Ed`, `SL`, `JP`, reverse pattern (`Poké Ball`). **`SL` = Shadowless** (owner's decision, 2026-09-29): a Base Set version whose TCGdex subtype is `shadowless` or `shadowless-red-cheek` but that isn't 1st Edition (every 1st Edition is shadowless, so `1st Ed` alone says it). A Shadowless Charizard ($2,146 NM) and an Unlimited one ($945) must never print the same. |

Examples:

```
1 Sonic the Hedgehog (SLD) 2087
1 Abandoned Air Temple (PTLA) 263s *F*
1 Abrade (SOA) 37 [LP]
2 Sol Ring (CMR) 472 *E*
1 Charizard ex (OBF) 125 *H*
1 Pikachu (SV2a) 025 *RH* [MP, JP, Poké Ball]
1 Charizard (BS) 4 *H* [SL]
```

- **The price picked, per card, shows before each line** in the sidebar (owner's decision, 2026-09-29, deliberately beyond the Moxfield format): a right-aligned, muted column, e.g. `$2.50  2 Sol Ring (CMR) 472 *E*`. Display only: the line text itself (changelog, export) stays as above.
- Lines wrap; don't truncate them.
- **Edit** (owner's decision, 2026-09-29, replacing click-to-remove): hovering a line turns its text the **blue accent** color; clicking it **loads that exact card back** onto the stage: the search bar is filled with a line that finds it ("Sol Ring 472 CMR", "Charizard 4/102 BS", Japanese "025/165 SV2a"; EN | JP and MTG | PKM switch to suit), the card is selected when the results arrive, and everything saved with it is put back: finish or Pokémon version, condition, quantity, a manual price, and Use Fallback / Use Cardmarket (from `price_snapshot`). The line is highlighted and the note under the search bar reads "Editing <line>: EDIT CARD saves the changes, Esc leaves it as it was." **ADD CARD reads EDIT CARD and turns blue** (the accent color), and **CLEAR reads CANCEL** (owner, 2026-09-29); pressing EDIT CARD (or Enter) saves the stage over that line through `draft_update_line` (anything can change, even the printing; if the result is identical to another line they merge, keeping the earlier place), then the stage resets and adding carries on as normal. CLEAR / Esc stops editing without saving. If the card can't be found again, a toast says so and nothing changes.
- **Preview** (owner's decision, 2026-09-29): hovering a line shows its card's picture (`image_url`) just left of the sidebar, level with the line, at a search suggestion's size (146 × 204). A plain picture, no foil effects.
- **Remove:** a red **×** at the end of each line (fainter until the line is hovered). Clicking it opens **"Remove card?"**:
  - quantity 1: "Remove **1 Abrade (SOA) 37**?" with [Cancel] [Remove].
  - quantity > 1 (owner's decision: ask how many): "Remove how many of **3 Lightning Bolt (2X2) 161**?", a number stepper (1…3, default 1), and [Cancel] [Remove] [Remove all 3].

  Removal is permanent. The card no longer exists in that buy.
- **Totals block** at the sidebar bottom, above the buttons (owner's decision):

```
Market         $41.20
Cash (33%)     $13
Credit (66%)   $27
```

  Market = Σ unit_price × qty. Cash and Credit are the Market total × the percentage, rounded down by the price steps (Section 7.8). They use the buy's custom rates where set (Section 8.9.1), otherwise the Master Buy Percentages from Settings (live for drafts).
- **Buttons:** **CANCEL** (red, smaller) and **CONFIRM BUY** (green, large), with the same sizes as CLEAR / ADD CARD so the two rows mirror each other.

#### 8.9.1 Custom rates for one buy (owner's decision, 2026-09-29)

On the pricing screens (the Price tab's buy list and a collection's pricing screen, Section 9.4), the **Cash (33%)** and **Credit (66%)** percentages in the totals block are **clickable**. They're not clickable anywhere else: confirmed buys on day pages keep the rates they were confirmed with.

```
Market          $41.20
Cash (40% ✎)    $16      ◄── click
Credit (66%)    $27
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
  - an optional **Phone number** (owner's decision, 2026-09-29), working as on a collection (Section 9.3): formatted to `(555) 123-4567` as it's typed, a leading 1 dropped, stored as 10 digits in `buys.phone`. Blank is fine; anything else must be a whole 10-digit number ("Enter a 10-digit US phone number", and Confirm buy stays disabled). `confirm_buy` takes it as `p_phone` (migration 0009). The changelog summary names it: "5 cards bought from Alex M., (555) 201-3344.";
  - the confirming user shown with their color dot;
  - [Cancel] [Confirm buy].
  - **As built (owner's decision, 2026-09-30):** a **Purchase price** is asked for, as a collection's is before Paid/Ours: **Cash / Credit chips** in their green / blue, then the amount paid, **always typed in by hand: choosing Cash or Credit fills nothing in** (owner's decision, 2026-09-30; a collection's Mark as Paid/Ours no longer fills in its offer either). **Customer name, Phone number and Purchase price are all required** (only Notes is optional): Confirm buy looks disabled until they're filled, its tooltip lists what's missing, and pressing it shows each missing field's message. `confirm_buy` stores `paid_price`, `paid_method` and `paid_at` (migration 0020) and refuses without them (`name_needed`, `phone_needed`, `paid_price_needed`, `paid_method_needed`). The entry reads "2 cards bought from Alex M., (555) 201-3344; paid $6.50 in credit." The buy is then **Paid/Ours**, its chip green or blue by how it was paid (a buy confirmed before this has a neutral chip), and its day page panel shows **"Paid $6.50 credit" as a right-aligned chip** in the Cash / Credit colour (owner's decision, 2026-09-30), with "the whole buy, both games" beside it on a mixed buy.

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

- **Columns** (owner's list): **Name, Phone Number, Status, Date of creation, Date last edited, Last edited by** (the user with their colour dot, added 2026-09-29), **Notes.** **Order as built** (owner's decision, 2026-09-29): Name, Phone, Status, Created, Last edited, Last edited by, Notes, then **Offer, and Paid last**. Notes are truncated to one line, with the full text in a tooltip.
- **Sort:** click a column header to sort ascending, click again for descending. Default is **Created, newest first** (▼) (owner's decision, 2026-09-29, replacing Last edited).
- **Status filter:** All / Processing / Priced / Paid/Ours. Default is All.
  - **As of 2026-09-29 (owner's decisions):** the chips are **All · Processing** (amber) **· Priced** (red) **· Paid/Ours Cash** (green) **· Paid/Ours Credit** (blue) **· Completed** (grey, last). A chip shows its colour while on. The same colours mark the Status column's chips and a collection's details: Processing amber, Priced red, Paid/Ours green or blue by how it was paid (the Cash / Credit colours), Completed grey.
  - **Offer** and **Paid** columns, after Status (owner's decision, 2026-09-29): the offer as "$120 / $240" (cash green / credit blue) and the price paid in green (cash) or blue (credit). Either reads **TBD** in amber until there's a figure; the offer always reads TBD while Processing. Both sort, TBD first.
- **Search box:** matches name (case- and accent-insensitive substring) and phone (digits substring).
- **Lock indicator:** when a collection is open for editing on another device, show an "✎ open on <device> (<user>)" sub-line on its row.
- **Live:** the table updates through Realtime.
- **Click a row** to open the collection's pricing screen (`#/collections/:id`).
- **Empty state:** "No collections yet. Press + Price Collection to start one." It shows as the table's only row, under the column headings; a search or filter with no results reads "No collections match." the same way. The table and the page stay full width whatever they show, and the heading row is one line: **Collections (count)** on the left, **+ Price Collection** and the search box on the right (owner's decisions, 2026-09-29), so nothing moves between views.

### 9.2 + Price Collection

A big primary button top-right, styled like CM's `.btn.primary`, larger. It needs a picked user. It opens a modal:

| Field | Rules |
|---|---|
| Name | Required, 1–80 characters |
| Phone number | Required, US format (Section 9.3) |
| Last 4 ID | Optional (owner's decision, 2026-09-29): up to 4 letters or digits, capitals (typed lower case turns upper case; anything else is dropped). Saved in `buys.id_last4`. Not shown on the table; shown and edited in the collection's details, and logged like the other details ("last 4 ID"). |
| Notes | Optional, multi-line |

[Cancel] [Create]. Create calls `collection_create`: status **Processing**, created now by the current user, then opens the new collection.

### 9.3 Phone numbers

- As the user types, format to `(555) 123-4567`. Store **10 digits**. Strip a leading `1` from 11-digit input.
- Invalid (not 10 digits) → inline error "Enter a 10-digit US phone number", and Create/Save stays disabled.

### 9.4 Collection pricing screen

The **Price tab's screen, reused** (the same components), with these differences:

```
┌──────────────── STAGE (same as Price tab, full height) ─────┬──── COLLECTION LIST ─────┐
│                                                            │  (same list format)       │
│                                                            │                           │
│                                                            │ ‹ Jordan Reyes [Priced] ▾ ⋯│
│                                                            │ Name    Jordan Reyes ✎    │
│                                                            │ Phone   (555) 201-3344 ✎  │
│                                                            │ Notes   2 binders… ✎      │
│                                                            │ Status  [Priced ▾] [Mark…]│
│                                                            │ Created Aug 14 by ● Dana  │
│                                                            │ Edited  today 3:12 PM ● Sam│
│                                                            │ Market          $412.50   │
│                                                            │ Cash (33%)      $135      │
│                                                            │ Credit (66%)    $270      │
│                                                            │ [        EXPORT        ]  │
└────────────────────────────────────────────────────────────┴───────────────────────────┘
```

- **Details in the sidebar** (owner's decision, 2026-09-29, replacing the header bar below: it took height the stage can't spare). At the foot of the sidebar, **above the totals**, which sit exactly where they do on the Price tab, with EXPORT under them:
  - **Back:** a large, bold **< BACK** button at the top left of the screen, directly before the search bar and as tall as it (owner's decision, 2026-09-29, moved out of the details), returns to the table. Clicking the Collections tab does the same.
  - **Top line, always shown:** the name and a status chip, which fold the rest away or bring it back (**collapsible**); the **⋯** menu. **As built (owner's decision, 2026-09-30):** the top line is a filled amber header bar over a framed panel, with a large **fold button** (a chevron) at its right; the details are **always unfolded when a collection opens**, and folding lasts only until it's closed (no longer remembered per computer). The view-only banner with **Take over** and the Paid/Ours banner with **🔒 Unlock** sit under it, also always shown.
  - **Unfolded:** Name, Phone and Notes edited in place; Status (the dropdown and step button); Created and Edited, each with its user. Everything below as specified for the header bar, just stacked.
  - Nothing is drawn above the stage.
  - **Looks distinct from the Price tab** (owner's decision, 2026-09-29): the background art is **mirrored**, and the accent colour for everything on the screen (stage and sidebar: outlines, highlights, the selected condition, toggles, buttons, EXPORT) is **amber** instead of the blue-purple (`--accent` `#f2b53a`, `--accent-2` `#a86f12`, on `.price-screen.collection-screen`). The header, the Collections table and dialogs keep the usual accent; Cash green and Credit blue don't change.
- **Collection header bar** (superseded by the details in the sidebar above; kept for what each control does) above the stage, full width:
  - **< BACK** at the top-left, returning to the table. Clicking the Collections tab does the same.
  - **Name** and **phone**, each editable inline (✎), and **Notes**, editable inline (multi-line; saves on blur or Ctrl+Enter). Each save calls `collection_update_info` and is logged.
  - **Status:** a **dropdown** (Processing / Priced / Paid/Ours) **and** a **step-forward button**: "Mark as Priced →" while Processing, "Mark as Paid/Ours →" while Priced (owner's decision: both controls).
  - **Created** date + creator (color dot) and **Last edited** date + user (owner's decision: creator and last editor).
  - **Totals** on the right, the same block as the sidebar (owner's decision), with the same clickable percentages for custom rates (Section 8.9.1).
  - **⋯ menu** holding **Delete collection…**, kept away from everyday controls (Section 9.7).
- **Sidebar:** the same list, grouping, format, hover-red and "Remove card?" behavior as Section 8.9, titled "COLLECTION LIST". **Each add and remove saves immediately** and is logged (Section 12). There are **no CONFIRM BUY / CANCEL** buttons. In their place is a single blue **EXPORT** button (Section 14).
- **Prices lock when a card is added** (owner's decision). There is no refresh.
- **Cash/Credit** use the collection's custom rates where set (Section 8.9.1), otherwise the current Master Buy Percentages, until the collection is marked Paid/Ours, when they're snapshotted onto the collection.
- **As built (Phase 7):**
  - **Shared screen.** The Price tab and the collection screen are one component, `src/pages/price/PricingScreen.jsx`. Everything from Phases 3–6 works the same on a collection: the line prices, click-to-edit with EDIT CARD, the red ×, hover previews, MTG | PKM and the sort toggle.
  - **Editing re-prices** (owner's decision, 2026-09-29). EDIT CARD on a collection line saves today's price, as on a walk-in buy, even though adding locks a price in. The change is logged as one entry, **Card edited in collection**.
  - **Toggles** (owner's decision, 2026-09-29). MTG | PKM and Newest/Oldest first are kept while you're on one collection and reset when you leave it (Back, another tab, another collection).
  - **Totals** sit in the sidebar's foot as on the Price tab, with "Rates for this collection" as their subpanel's heading; under them is the blue EXPORT button, which opens "EXPORT COMING SOON" (`src/components/ExportButton.jsx`, reused on the day pages in Phase 8). (First built in a header bar; moved with the details, 2026-09-29.)
  - **Read-only list.** While read-only (Paid/Ours, another computer editing, or still loading), the lines don't turn blue, the × is hidden, and ADD CARD's tooltip and a click's toast say why.
  - **Inline edits.** Name, phone and notes are edited in place with a ✎. Enter saves (Ctrl+Enter for notes), clicking away saves, Esc cancels. An invalid name or phone stays open with the error on Enter, and is put back with a toast when you click away.
  - **Deleted elsewhere.** A collection deleted on another computer while open returns you to the table with a toast. A link to a missing collection says it doesn't exist.

### 9.5 Status and locking at Paid/Ours

**The deal (owner's decision, 2026-09-29).** Prices are simple maths, but a price is agreed between two people: the store makes an adjusted offer, the customer haggles. So the app records the real figures as the collection moves on:
- **Marking it Priced** (the step button, or the dropdown from Processing) opens **"Mark as Priced"**: Market, Cash and Credit at the collection's rates, then **Set an offer (cash)**, a money field for the whole collection. The **credit offer** is worked out and shown as it's typed: the same deal at the collection's rates, cash × credit % ÷ cash %, rounded down by the price steps (e.g. $120 cash at 33% / 66% → $240 credit). **Save offer** stores both (`offer_cash`, `offer_credit`) and sets Priced. The field starts with the last offer, if any.
- **Marking it Paid/Ours** opens **"Mark as Paid/Ours"**: the same Market / Cash / Credit, the offer if there is one, a **Cash | Credit** choice (required, nothing chosen at first) and **Set a final purchase price**, the amount actually paid. Choosing Cash or Credit fills in that offer when nothing's typed yet. **Mark Paid/Ours** stores them (`paid_price`, `paid_method`) and locks the collection. This replaces the plain "Mark as Paid/Ours?" question below.
- **Completed** (owner's decision, 2026-09-29) comes **after Paid/Ours**: the collection has been broken apart, sorted away or uploaded into inventory, so its cards can't be assumed to be where they were. **As of 2026-10-01 only EXPORT marks a collection Completed** (`docs/EXPORT_FUNCTION.md` 8.6; migration 0030): the step button stops at Paid/Ours and the dropdown greys Completed out. (It was "Mark as Completed →", the step button while Paid/Ours, which asked first.) A Completed collection stays locked like Paid/Ours (grey banner "Completed — locked, and left out of search." with **Reopen**, back to Paid/Ours with the price paid kept), is **left out of the header search entirely** (Section 13), and is effectively how a collection is retired without deleting its history. Completed can only follow Paid/Ours (the dropdown greys it out before then).
- **Unlocking** back to Priced or Processing clears the price paid (it wasn't paid after all); the offer stays. Every step is logged with its figures (Section 12.3).

- **Processing → Priced → Paid/Ours → Completed.** Any status can be chosen from the dropdown, with the dialogs above.
- Choosing **Paid/Ours** asks: "Mark as Paid/Ours? The collection will be locked." [Cancel] [Mark Paid/Ours]. Once Paid/Ours:
  - ADD CARD, remove, and info edits are disabled.
    - **As of 2026-09-29 (owner's decision):** cards **can still be removed** from a Paid/Ours collection (the red × stays; so the list matches what was really bought), but not added or edited. A **Completed** collection allows neither: its cards have moved on. `collection_remove_line` allows Paid/Ours and refuses Completed (`collection_completed`; migration 0012); removals are logged as usual, and the price paid doesn't change.
  - A green banner reads "Paid/Ours — locked." with an **🔒 Unlock** button.
- **Unlock** (or choosing another status from the dropdown) asks "Unlock this collection? It will go back to Priced and can be edited." [Cancel] [Unlock]. This sets the status to **Priced** and is logged.
  - **As built:** 🔒 Unlock goes back to Priced. Choosing Processing from the dropdown while Paid/Ours asks the same question naming Processing, and goes there. The status can change while Paid/Ours (that's how it unlocks), but not from a view-only computer.
  - **As of 2026-09-29:** the Paid/Ours banner is green or blue by how it was paid and names the price ("Paid/Ours — $262.50 credit. Locked."). The details show **Offer** and **Paid** lines under Status, TBD in amber until set. The step button runs Mark as Priced → Mark as Paid/Ours → Mark as Completed.

### 9.6 One computer at a time (owner's decision)

A collection can only be **edited on one computer at a time**. Others can view it read-only and **take over**.

- **Opening** a collection calls `lock_acquire`.
  - If it's free, or the lock is stale (no heartbeat for 60s), this device gets the lock.
  - Otherwise the screen opens **read-only**, with a banner: "✎ Being edited on **Front Counter** by ● Dana since 3:02 PM." and a **[Take over]** button.
- **Read-only** means ADD CARD, remove, status and info edits are disabled. Searching and viewing prices still work, and the list updates live.
- **The lock holder** sends a heartbeat every 20s. Leaving the screen (Back, a tab change, route change, or `pagehide`) releases the lock, best effort. A crashed computer's lock goes stale after 60s.
- **Take over** asks "Take over editing? Front Counter will switch to view-only." then calls `lock_acquire(force=true)`. The previous holder sees, via Realtime, a toast "Sam took over editing on Back Office" and flips to read-only with its own [Take over] button.
- All collection write functions **reject** writes from a device that doesn't hold a fresh lock.
- **As built (Phase 7, `useCollectionLock.js`):**
  - **Taking a free lock.** A view-only computer checks every 20s, and at once when the lock is released. When the lock is free or stale it takes it by itself, with the toast "You can edit this collection now: the other computer stopped editing." So a closed or crashed computer never needs a Take over.
  - **Releasing.** A closed tab or browser releases the lock with a request that outlives the page (`keepalive`). A tab coming back to the front checks the lock at once, since hidden tabs' timers slow down.
  - **The holder's user.** Picking a different user moves the lock to them, so other computers' banners and the table's "✎ open on" line name who is at the keyboard.
  - **Holding** means the lock row names this computer (Section 6.2 "As built").

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

**Walk-in statuses (owner's decision, 2026-09-30):** a confirmed walk-in buy is **Paid/Ours** (a neutral light-grey chip: no cash or credit is recorded for it). **EXPORT** on its day page makes it **Completed**, mirroring a collection's last status: locked (no removing cards, no deleting the buy) and left out of the header search. Since EXPORT is per game and a buy can hold both games, a buy is Completed **game by game** (each card records its export, `buy_lines.completed_at`). On the Calendar, a day whose buys in that game are all exported is **greyed and marked "Exported"** in a full-width tag **at the foot of its cell**, under up to two rows of dots (owner's decision, 2026-09-30; cells stay 84px with tighter lines inside, and the Calendar's spacing was compacted by about a tenth so the page fits without scrolling). **The current day can't be exported** (owner's decision, 2026-09-30): buys confirmed later would miss it. A buy is always confirmed on the current day, so a past day can't gain buys, and **an export is always the whole day**: there's no partly exported day. Undo: the ⋯ menu beside EXPORT (Section 10.2).

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
- **Weeks start on Sunday** (owner's decision). **Every month is drawn as 6 weeks**, the most a month can span, with fixed-height days, so the panels are the same size for every month and never change when flipping through them (owner's decision, 2026-09-29).
- **A day cell shows:**
  - the date number;
  - "**N buys**" (singular "1 buy");
  - **one dot per buy**, colored by the confirming user's color. More than 8 buys shows 8 dots and "+N". **As built (owner's decision, 2026-09-30):** two rows of six dot spots, always (a narrow window shrinks the dots rather than wrapping them): up to 12 buys show a dot each; more show 11 dots and **a white plus in the 12th spot** (owner's decision, 2026-09-30; was "…"), drawn from two bars so it's exactly centred. The count above says how many.
  - Today's cell has an accent outline. Empty days aren't clickable.
- **What counts:** confirmed **walk-in buys only**. Collections don't appear on the Calendar (owner's decision). A buy is counted on the day of `confirmed_at` in `STORE_TZ`.
- **Mixed buys:** a buy with both games counts as a buy on **both** calendars that day, and each side sees only its own lines.
- Updates live through Realtime.
- **Decoration** (owner's decisions, 2026-09-29): the month picker (◀ September 2026 ▶ Today) is **centred** above the grids. A **line runs down the middle** between them, half indigo, half amber. Each side is **themed in its game's colour** from the rest of the UI (the MTG | PKM chips): **Magic indigo** on the left, **Pokémon amber** on the right: the panel's top edge, border and faint tint, the weekday labels, days with buys (tinted, their count in the game colour), the hover and today's outline.
- **As built (Phase 8):** the month sits in the URL only when it isn't the current one (`#/calendar?month=2026-08`); ◀ ▶ move a month, **Today** returns. Weeks, days and "today" are the store's calendar (`src/lib/calendar.js`). A day with no buys shows its date only and isn't a link. The dots use the confirming user's colour (slate if unknown).

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
│ Market $41.20 · Cash $13 · Credit $27       │ Also has 3 Pokémon cards →     │
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
- **Card pictures on hover** (owner's decision, 2026-09-30): hovering a card row shows its picture beside the panel, level with the row, the same as the Price sidebar's preview (Section 8.8): 146 × 204, right of the panel, or left when the window has no room there.
- **Removing cards** (owner's decision): row hover turns red. Click → the same "Remove card?" dialog with quantity as Section 8.9, then `buy_remove_line`, which is logged. The confirmation text notes: "This buy was already confirmed."
- **Deleting a buy:** ⋯ → Delete buy… → "Delete **Buy 2** (Dana, 2:37 PM)? All **N cards** in this buy — including any from the other game — will be permanently removed." [Cancel] [Delete buy] (red). Calls `buy_delete`, which is logged.
- **Status and EXPORT (owner's decision, 2026-09-30):**
  - Each buy panel's header shows its status for this game: **Paid/Ours** or **Completed**. A Completed panel's × buttons are gone and **Delete buy…** is blocked ("Completed (exported): mark the day Paid/Ours again…"); the server refuses too (`buy_completed`).
  - **EXPORT on today's page is blocked** (owner's decision, 2026-09-30): it looks disabled, says "Today can't be exported until it's over" when clicked, and the server refuses too (`day_not_over`, migration 0019). Mark Paid/Ours again stays allowed on any day.
  - **EXPORT with Paid/Ours buys on the page** warns first: "Export Magic for September 30, 2026?" — it marks the day's N buys **Completed** (locked, out of the search), notes that the export file itself isn't built yet, and how to undo it. **[Cancel] [Export]**. Confirming calls `day_mark` and toasts "Exported: N Magic buys marked Completed."
  - **EXPORT when they're all Completed** exports as usual (still the placeholder) and changes nothing.
  - **After an export, a ⋯ menu sits beside EXPORT** with **Mark Paid/Ours again…**, for a day exported too early: a confirmation, then they're Paid/Ours again (unlocked, back in the search). Both are logged in the Changelog (Buys).
  - **An exported day looks different:** its game colour fades to grey, an **EXPORTED** chip sits beside the title, and a note under the rule says when and by whom ("Exported Sat, Sep 30, 2026 · 5:12 PM by ● Daisy. These buys are Completed…").
- **EXPORT** is a large, bold button (Section 14). **As built (owner's decision, 2026-09-29):** on the header row, level with **< BACK** and as tall, **right-aligned**, on Magic and Pokémon day pages alike; it takes the page's game colour (below).
- If the last buy of the day is deleted, go back to the Calendar with a toast.
- **As built (Phase 8, owner's decisions, 2026-09-29):**
  - **< BACK** is the large bold button a collection has, returning to the Calendar on the day's month. The heading reads "Monday, August 17, 2026" followed by the game's chip, **large and clear** (owner's decision, 2026-09-29): about 19px, bold capitals ("MAGIC", "POKÉMON"), in the game's colours with a ring and glow in them.
  - **Removing cards:** each row has the **red ×** the buy list has (not a whole-row red hover), with the same "Remove card?" dialog and the note "This buy was already confirmed." Rows can't be edited: a confirmed buy is a finished deal.
  - **The last card:** removing a buy's last card would leave an empty buy, so it **deletes the buy** instead, asking first ("That's the last card in this buy, so removing it deletes the buy."). The server refuses the removal anyway (`last_card`).
  - **Table:** Price (per card, like the buy list) · Qty · Card (the line without its quantity, Japanese cards in English, `lineBody`) · ×.
  - **Customer line:** the name and the **phone number** (from CONFIRM BUY) together: "Customer: Alex M. · (555) 201-3344".
  - Totals are this game's lines at the buy's snapshotted rates, Cash green and Credit blue.
  - **Numbering:** Buy N counts that day's buys with this game's cards in confirmed order, so deleting a buy renumbers the rest; the changelog keeps each entry's name from its time.
  - Updates live: a buy confirmed, changed or deleted on another computer shows at once.
  - **Themed by game** (owner's decision, 2026-09-29), like its side of the Calendar: Magic day pages in **indigo**, Pokémon ones in **amber**: a soft wash of the colour at the top of the page, a heading rule in it, tinted panels and panel headings, table headings in it, and the page's accent (Back's hover, EXPORT) switched to it. Each panel's top edge stays in its confirming user's colour. "Also has N … cards →" is in the other game's colour, since it leads there.

---

## 11. Settings tab

Sections, each in a CM panel, laid out in **two columns across the page, with related panels side by side** (owner's decision, 2026-09-29). **Every panel is the same fixed height** (owner's decision, 2026-09-30): 332px, the Master Crystal Inventory's with a current file (the owner's pick from a screenshot, replacing a first 540px); anything more, like its opened column list, scrolls inside the panel:

| Left | Right |
|---|---|
| Master Crystal Inventory (11.1) | This computer (11.6) |
| API keys (11.2) | JustTCG usage (11.3) |
| Master Buy Percentages (11.4) | Master Fallback Percentages (11.4) |

Backups (11.5) take a row of their own, spanning both columns at the same fixed height (as built, Phase 10): download on the left, restore on the right, **split exactly in half with the separator on the page's centre line**, in line with the gap between the panels above, and each half's text in line with the panel above it (owner's decision, 2026-09-30). The credits footer (11.7) spans both columns.

### 11.1 Master Crystal Inventory (required)

The most prominent panel, with a **red border and a "Required" badge** until a file is uploaded.

- **Upload Crystal Commerce Database** (large button) opens a file picker restricted to `.csv`. Checks:
  - the extension is `.csv`;
  - size ≤ 20 MB (the owner's export is under 5 MB); **as built (owner's news, 2026-09-30): the real export is 40 MB and more, so the limit is 300 MB as picked and 50 MB as stored (compressed)**;
  - PapaParse reads it, it has a header row and at least 1 data row.

  A failed check shows a clear error and changes nothing.
- On success:
  1. Upload the file to the **private** Storage bucket `master-inventory` as `<YYYYMMDD-HHMMSS>__<original name>`.
  2. Insert a `master_inventory_files` row (`is_current=true`) and set the previous current file to `false`.
  3. If there are more than **5** files, delete the oldest (file and row).

  **As built for the real file's size (owner's decision, 2026-09-30; migration 0023):**
  - The check **reads the file in 2 MB chunks** (PapaParse's chunk mode), counting rows and keeping only the header, so a 40 MB+ file never sits in memory whole; the panel shows **"Checking the file… 45%"**, then **Compressing…**, **Uploading…**, **Saving…**.
  - The file is **stored gzipped** (the browser's CompressionStream) as `<stamp>__<name>.csv.gz`: a CSV packs down to a fraction of its size, well under the Free plan's **50 MB per-file limit** (the bucket's limit, raised from 20 MB). If it's still over 50 MB compressed, it's refused. `size_bytes` records the CSV's own size.
  - **Only the current file is kept** (owner's decision, 2026-09-30; was five, then briefly two): an upload **replaces** it. `master_inventory_add` (migration 0024) removes every other row once the new one is in, and the app deletes their files. There's no Previous copies list.
  - **Download** (the current file) gives back the CSV under its original name: a gzipped copy is unpacked in the browser first; an older plain upload downloads as it was.
- **Shows:**
  - the current file: name, uploaded date/time, uploader (color dot), row count, and the detected columns (collapsed list);
  - **Previous copies** (up to 4): name, date and uploader, each with a **Download** link. As built (2026-09-30): **none: only the current file is kept.**
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
- **Master Fallback Percentages** (owner's decision, 2026-09-29): a panel beside these with a Magic and a Pokémon row of NM / LP / MP / HP / DMG percentages (0–100, up to 2 decimals, saved on blur), used for fallback prices (Section 8.7).

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
- **As built (Phase 10, 2026-09-30; migration 0015, `src/lib/backup.js`, `backupIO.js`, `settings/BackupsPanel.jsx`):**
  - **What a backup holds:** staff users, computers, buys and collections (drafts too) with their lines, the changelog and settings, as `{ format: "pug-pricing-backup", version: 1, exported_at, app_version, tables }`. Besides the four tables the spec leaves out, two more stay out: **`api_usage`** (JustTCG's own live counters, rewritten on the next lookup) and **`master_inventory_files`** (the CSVs aren't in a backup, so their list stays with them in storage).
  - **What a restore keeps:** this computer and every other one (their names stay; the backup's are added), the Crystal Commerce CSVs, the API keys, and `last_backup_at`. Staff users **not in the backup are hidden**, like a deleted user, so anything they did keeps its name. Every collection lock is dropped.
  - **The dialog** shows when the file was made and by which version, a table of Buys / Collections / Card lines / Changelog entries / Staff users **in the backup** next to **here now**, the red warning, and the RESTORE field. Restore needs a picked user (it's in the milestone) and a connection. The automatic backup first is `pug-pricing-backup-<stamp>-before-restore.json`; if it can't be made, nothing is restored. Then the page reloads.
  - **The config constant** is `CLOUD_BACKUPS` in `src/lib/backup.js` (false: the Free plan).

### 11.6 This computer

- The device name (editable).
- **Sign out.** It asks for confirmation if this device has a non-empty draft: "Your in-progress buy stays saved for this computer."

### 11.7 Footer

Credits, as a bulleted list, one source per line (owner's decision, 2026-09-29), each "what — where from":
- Magic card data and images — Scryfall
- Pokémon card data and images — TCGdex
- Backup Pokémon images — pokemontcg.io and TCGplayer
- Japanese Pokémon images — Limitless TCG
- English names for Japanese Pokémon — PokeAPI
- Prices — JustTCG
- Cardmarket prices — Scryfall (Magic) and TCGdex (Pokémon)
- Euro to dollar rate — Frankfurter (European Central Bank)

Then "Not affiliated with Wizards of the Coast or The Pokémon Company." and the app version and build date.

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
  - **grouped by day** with a pill on the line: **Today**, **Yesterday**, then "Saturday, August 17, 2026" in `STORE_TZ` (as built, owner's decisions 2026-09-30: "Today · September 30, 2026", "Yesterday · September 29, 2026", then just "August 17, 2026", no weekdays, matching the header search);
  - **each day starts on the left**; right-hand entries drop half a row so the columns interleave (CM's `margin-top: 34px`).
- **Pager:** 20 entries per page (`CHANGE_PAGE = 20`), at the top and again at the foot beside **↑ Back to top**. The foot row shows only when the page scrolls. The log is read when the tab opens, not on page load.
- All CSS comes from CM's `.timeline`, `.tl-*` and `.ch-mark` rules (Appendix B.3).
- **As built (Phase 9):** the filters run in Postgres, so the log is never loaded whole: entries come 200 at a time, newest first, with the categories, game, funnel and text filter applied, and more are fetched as pages need them (`src/pages/ChangelogPage.jsx`). Folding and the game trim are worked out in the browser (`src/lib/changelog.js`). The pager reads "Page 2 of 5" ("5+" until the last batch is in), with ‹ Newer / Older ›. The count badge is the number of recorded entries matching the filters. The text filter uses two columns Postgres keeps on each entry (migration 0014): `search_text` (names, summary, card and field rows, lower case, common accents folded, so "pokemon" finds "Pokémon") and `search_digits` (the digits of the summary and field rows). A filter that's only a phone number (3+ digits, no letters) matches those digits **or any entry for a buy or collection with that phone**, so a collection's whole history comes up.

### 12.2 An entry panel

```
        ┌──────────────────────────────────────────────────────┐
   ●────┤ Aug 17, 2026 · 2:37 PM                BUY CONFIRMED │
        │ BUY  Buy 2 · Sat Aug 17   MTG PKM        +14   ● Sam │
        │ Customer: Alex M. · Market $61.40 · Cash $20 ·       │
        │ Credit $40                                           │
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
- **As built:** the funnel sits at the right of the header strip (as in CM). Card rows show each line's price per card after it, muted. A folded run's summary reads what it adds up to ("7 cards added."). **A buy's name links to the day page of the day the buy was confirmed**, not the day of the change (owner's decision, 2026-09-29), in the game on show; a collection's to the collection.
- **Style pass** (owner's decisions, 2026-09-29), like the Calendar's:
  - **Panels take their game's colour:** Magic indigo, Pokémon amber (tint, border, top edge, header strip); a mixed buy blends the two, with a stripe from indigo to amber along its top. An entry with no cards (created, status, details) keeps its category's colour on its top edge.
  - **More chips:** the headline is a chip in its category's colour (Buys green, Collections blue, Actions slate), filled green for a landmark made and red for one gone; +N / −N are green and red chips; the user is a chip outlined in their colour; Market / Cash / Credit sit in a row of chips under the summary; field names are small chips.
  - **Cash and Credit keep their colours everywhere in the log:** "$120 cash" green and "$240 credit" blue in summaries and field rows, the cash % / credit % rows, and the Cash / Credit chips.
  - **Statuses** in field rows are the Collections tab's status chips (Processing amber, Priced red, Paid/Ours green or blue by how it was paid, Completed grey).
  - Each card row has a thin mark in its game's colour on its left.
- **Dots:** buy entries use a green-bordered dot, collection entries a blue-bordered dot, and field/status entries a slate dot. **As built:** status changes are Collections, so their dot is blue (owner's decision, 2026-09-29; Section 12.4); only detail edits are slate. **Creation** (buy confirmed, collection created) is the large dot. **Deletion** is the small red cross (CM `.tl-dot.gone`). Dots aren't clickable (no rewind).

### 12.3 What is recorded

`events.kind` is `buy` or `collection` according to the target (`app` for a restore). The **filter category** (Section 12.4) comes from the action: info and status edits are **Actions**.

| Action (`events.action`) | Headline | Category / dot | Contents |
|---|---|---|---|
| `buy_confirmed` | Buy confirmed | Buys / large green | All lines (+), totals, customer name |
| `buy_cards_removed` | Cards removed from buy | Buys / green | Removed lines (−), totals of the removed lines |
| `buy_deleted` | Buy deleted | Buys / red cross | All lines (−) at deletion, totals |
| `day_exported` | Day exported | Buys | "Day" + "Magic · September 30, 2026" (links to that day page), `status: Paid/Ours → Completed` as chips, "N Magic buys exported and marked Completed." (owner's decision, 2026-09-30; migration 0018) |
| `day_unexported` | Export undone | Buys | The same, `status: Completed → Paid/Ours`, "N Magic buys marked Paid/Ours again." |
| `collection_created` | Collection created | Collections / large blue | Name, phone, notes as fields |
| `collection_cards_added` | Cards added to collection | Collections / blue | Added lines (+), totals |
| `collection_cards_removed` | Cards removed from collection | Collections / blue | Removed lines (−), totals |
| `collection_line_edited` | Card edited in collection | Collections / blue | The line as it was (−) and as saved (+), each with its price; no totals (added Phase 7, owner's decision 2026-09-29 that edits re-price) |
| `collection_info_edited` | Collection details edited | Actions / slate | Field rows (name, phone, notes, cash %, credit %). A custom rate reads `cash %: 33 → 40`; clearing one reads `cash %: 40 → master (33)`. |
| `collection_status_changed` | Status changed | **Collections / blue** (owner's decision, 2026-09-29: it carries the offer and the price paid, so it shows by default; was Actions / slate) | `status: Priced → Paid/Ours`; "unlocked" when leaving Paid/Ours. **As of migration 0011:** marking Priced adds `offer: $120 cash / $240 credit` and marking Paid/Ours `paid: $262.50 credit`, each with the collection's totals then; summaries read "Marked Priced: offered $120 cash / $240 credit.", "Marked Paid/Ours: paid $262.50 in credit, locked.", "Marked Completed: its cards have moved on.", "Reopened: back to Paid/Ours, still locked." |
| `collection_deleted` | Collection deleted | Collections / red cross | All lines (−) at deletion, totals, name and phone |
| `backup_restored` | — | milestone (always shown) | Drawn as CM's green milestone pill across the line: "Backup restored — <file name>". As built (Phase 10): shown under the Magic and Pokémon filters too (not under a phone-number filter or a funnel) |

**Not recorded** (owner's decision):
- activity on draft walk-in buys (adds, removes, cancel), since only the confirmation is recorded;
- staff user changes;
- CSV uploads;
- settings changes.

### 12.4 Filters

- **Category toggles**, CM behavior:
  - three buttons: **Buys** (green), **Collections** (blue), **Actions** (slate: collection details and status edits; **as built, detail edits only**: status changes are Collections, owner's decision 2026-09-29);
  - **click** = show only that category;
  - **Ctrl+click or right-click** = add or remove it from what's showing;
  - they can't all be turned off.
- **Game filter:** All / Magic / Pokémon. It matches entries whose `games` include that game. When filtered to one game, an entry's card rows show only that game's lines, and its counts and totals are recomputed for them. **As built (owner's decision, 2026-09-29): mixed entries show whole** under either game: both games' cards, counts and totals, in the mixed indigo-to-amber style. The filter only picks which entries show; a mixed buy's link opens the filtered game's day page.
- **Text filter:** substring match (normalized) on card text in `lines`, `target_name`, customer name and phone digits.
- **Funnel:** narrows to one `target_id`.
- **"Show everything" bar:** while any narrowing is active, a bar reads "Showing **Jordan Reyes**, entries matching **bolt** only" with a [Show everything] button. It stays visible even when nothing matches.

### 12.5 Opening state

The tab opens with **only Buys on** (owner's decision, 2026-09-30, replacing Buys + Collections), game **All**, page 1, and no filter or funnel. Clicking the Changelog tab while already on it restores this state. The choice isn't remembered across refreshes (CM behavior).

### 12.6 Folding (drawing only)

One ADD CARD writes one event. Drawing rule: a run of **consecutive `collection_cards_added` events** (or removals) on the **same collection** by the **same user**, each within **15 minutes** of the previous one, with no other event for that collection in between, is **drawn as one panel**. **Card edits don't fold** (owner's decision, 2026-09-29): each shows its old and new line.
- the headline says "Cards added to collection";
- the counts and card rows are summed;
- the time range is shown ("2:04 – 2:41 PM").

The data isn't folded, only the drawing. Pagination counts drawn panels.

---

## 13. Global search (header)

- **Where:** in the header on every tab. **Much larger (about 640px wide, taller, 16px text) everywhere except the pricing screens**, where it keeps its normal size (owner's decision, 2026-09-29, replacing "smaller on pricing screens"): there the main search bar is the focus (Section 7.2).
- **Input:** the same syntax as the main search (Section 8.2). **Partial names work.** `bolt` finds every stored line whose name contains "bolt", across every printing and number. Adding `/size`, a number or a set code narrows the results. Both games are searched.
- **Scope** (owner's decision): lines in **confirmed walk-in buys** and **collections**, but not drafts. **Completed walk-in cards (exported, Section 10.1) are left out too** (owner's decision, 2026-09-30), like Completed collections. **As built (owner's decision, 2026-09-30, replacing that): the search shows Paid/Ours only by default**: walk-in cards not yet exported, and Paid/Ours collections. A **"Show all"** toggle at the top of the results (a small checkbox chip; **forgotten whenever the results close**: a click away, Esc or opening a result puts the search back to Paid/Ours only, owner's decision 2026-09-30) adds **every other status**: Processing, Priced and Completed collections, and exported walk-in cards, which then carry a grey **Completed** chip. **Completed results (exported buys, Completed collections) show partly faded** (half opacity, clearer when highlighted; owner's decision, 2026-09-30). Drafts never show. With nothing found, the message says it looked at Paid/Ours only and that Show all includes the others. `global_search` takes `p_all` and returns `completed` per line (migration 0021). **Completed collections are skipped completely** (owner's decision, 2026-09-29): their cards have moved on, so they can't be found where they were. Paid/Ours collections are searched (their cards are in the store), as are Processing and Priced ones. The query runs in Postgres (`name_key` trigram/ILIKE, plus number, size and set equality), limited to 200 lines. Japanese lines should also match on `name_en` (the English name staff will type).
- **Results dropdown** (CM `.search-results`, opening under the box):
  - Grouped by **printing**: a heading line such as "Lightning Bolt (2X2) 161 *F*", with a game badge. Then two sub-groups:
    - **Buys:** one row per buy: "Sat, Aug 17, 2026 · Magic · Buy 2 · ● Sam · qty 4".
    - **Collections:** one row per collection: "Jordan Reyes · Processing · qty 2".
    - *(As built, 2026-09-30: collections pinned at the top, buys filed under dates, a panel per buy or collection listing its cards in full; see below.)*
  - Rows are CM `.result-btn`s with the left border in the relevant user's color (buys) or the status color (collections).
  - **"No buys or collections contain that card."** when there are no results.
- **Clicking a result:**
  - a buy → go to its day page for that game, scroll to the buy's panel, **flash** it (CM `.flash-target`), and highlight the matching rows;
  - a collection → open its pricing screen and flash the matching list lines in the sidebar.

  The dropdown then closes.
- **Keys:** ↓/↑ move through the results, Enter opens the highlighted one, Esc closes the dropdown.
- **As built (Phase 10, 2026-09-30; migration 0015, `src/components/SearchBox.jsx`, `src/lib/globalSearch.js`):**
  - It searches from **2 characters**, a quarter second after typing stops; the newest search wins.
  - The line is read with the main search's parser. A trailing word counts as a **set code only if a stored line uses it**; if that reading finds nothing, it searches again without the set code ("Ancient Mew"). A size like `TG30` doesn't narrow (only plain counts do).
  - **Collections are pinned in a "Collections" section at the top** (owner's decision, 2026-09-30: they're kept in their own place in the store), newest first. **Then buys, filed under dates** (owner's decision, 2026-09-30, replacing the printing headings): each under the day it was confirmed, newest day first ("Today · September 30, 2026", "Yesterday · September 29, 2026", then just "August 17, 2026": no weekdays, Today and Yesterday the only day markers; owner's decision, 2026-09-30). Each section holds **one panel per buy or collection** (per game: a buy's day page is per game), newest first. A panel's first line says where it is, with the game badge ("MTG Buy 6 · ● Daisy · 9:48 PM", or "MTG Jordan Reyes · Processing"); then **every matching card in it, one line each, as entered with its condition always in the brackets: "1 Gaea's Cradle (USG) 321 [NM]"**, "2 Pikachu (SV2a) 025 [LP, JP]" (`lineTextWithCondition`). A card's printings and conditions each get a line (quantities added), in the order they were added, a printing's conditions best first. `global_search` returns each line's condition and the buy's `created_at` (migrations 0016, 0017).
  - ↓/↑ move panel to panel (collections first, then the days); the first is highlighted, so Enter opens it. Opening a panel lands on all its matching cards. With 200 lines found, a note says to add a number or set code.
  - **Landing:** a buy's day page scrolls its panel into view, flashes it (`.flash-target`) and **tints the matching rows**; a collection's screen tints the matching list lines and scrolls the first into view. Opening another result on the same page lands again.
  - On every tab but the pricing screens, the dropdown is as wide as the large search box.
  - **Hovering a result shows its card's picture** just left of the dropdown, level with the card's line (a panel's first card when on its top line), the same preview as the Price sidebar and day pages (owner's decision, 2026-09-30); it goes away when the results scroll or close.

---

## 14. Export

**The export has its own design document: `docs/EXPORT_FUNCTION.md`** (built 2026-10-01, Phases E1–E5). It covers the Crystal Commerce **Mass Create** file, matching our cards to the store's CC products through the Master Crystal Inventory, the **Sell Price** and the **Custom SKU**, the **Can't upload cards** collection, and EXPORT on day pages and collections. Its decisions are in its own Appendix C; the main ones are summarised below (decisions 173–180).

- **EXPORT buttons** stay where they were: a collection's sidebar foot, and each day page's header row opposite < BACK.
- The placeholder ("EXPORT COMING SOON") is gone: EXPORT runs the export everywhere.

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
- [x] Double-click `start.bat`: the browser opens `localhost:5180`, and SPACE stops it. `stop.bat` frees the port.
- [x] The login screen shows the logo. A wrong password shows an error; the right one gets in, and a refresh stays signed in.
- [x] First sign-in asks "Name this computer".
- [x] The header matches Collection Manager: logo, title, sub-line, search on the right, tabs below with Changelog on the right.
- [x] Tabs hover-lift and underline exactly like CM, and content fades in on switch.
- [x] The header search is much larger on every tab but the Price tab (owner's change, 2026-09-29).
- [x] Narrowing the window below 1200px shows the notice.

---

### Phase 2: Database, users, Settings basics, Master Crystal Inventory

**Build**
- Migrations for **all tables** in Section 6.1, RLS (Section 4.4), indexes, and Realtime publication. The Storage bucket `master-inventory` (private; `authenticated` can read and write).
- Header **user dropdown** (Section 7.3): add, auto-color, change color, delete (hide), remembered per device. The "Pick a user first" guard helper.
- Settings page skeleton with: **Master Crystal Inventory** (Section 11.1, fully working), **Master Buy Percentages** (11.4), **This computer** (11.6), footer (11.7).
- The **Master Crystal Inventory banner** (Section 7.5) and the **offline banner**.
- Realtime subscriptions for `staff_users`, `settings` and `master_inventory_files`.

**Where to look**
- [x] Add three users: each gets a different color. Change a color. Delete one: it leaves the dropdown.
- [x] The picked user is still picked after a refresh, and a second computer or browser can pick a different one.
- [x] The red "Master Crystal Inventory required" banner shows on every tab until a CSV is uploaded.
- [x] Upload your CC export: file name, date, you as uploader, row count and columns appear, and the banner disappears.
- [x] Upload a `.txt` renamed badly, or an empty CSV: a clear error, nothing changes.
- [x] Upload six times: only the latest five remain, and previous copies download. *(Since 2026-09-30: only the current file is kept; an upload replaces it.)*
- [x] Cash/Credit % save and survive a refresh.
- [x] Turn off Wi-Fi: the offline banner appears.

---

### Phase 3: Card search (Price tab, no prices yet)

**Build**
- **Spike first (at most half a day):** confirm TCGdex `abbreviation`, `variants_detailed` and `/v2/ja/` behavior with real calls. Report findings to the owner before continuing if anything differs from Section 5.2.
- `scryfall.js` / `tcgdex.js` with the serialized queues, retries and caches (Sections 5.1–5.2), including name catalogs and set lists.
- `query.js` parser (Section 8.2) **with unit tests for the parser only** (a table of example inputs → parsed parts). This is the one place automated tests are worth it.
- The Price screen layout (Section 8.1) with the background art; main search bar and EN|JP toggle; suggestions row + show-all modal; the selected card with two-stage loading, info panel and flip; auto-select; the keyboard ↓/↑/Esc.
- Fuzzy name correction with the "Showing results for…" note.

**Where to look**
- [x] `Lightning Bolt 161/295` or a card from your case: the exact printing is auto-selected.
- [x] `Sol Ring`: 10 thumbnails in 2 rows of 5 + "… show all (N)", and picking from the modal selects the card and closes it.
- [x] `Charizard ex 125/197 OBF`: the Pokémon printing shows, with the PKM badge and set code OBF.
- [x] A typo (`lightnig bolt`) still finds it, with the "Showing results for" note.
- [x] Try a promo/secret number (`TG05/TG30`, `263s`) and a set with no printed size (SLD).
- [x] ↓/↑ walk through suggestions; Esc clears.
- [x] JP: switch to JP and try a Japanese card by set code + number.
- [x] The search bar never moves, and results never cover it.

---

### Phase 4: Details panel and finish controls

**Build**
- Sibling printings in the same set, and trait derivation for Magic and Pokémon (Section 8.6).
- The details panel with checkboxes vs. read-only chips, valid-toggle rule, and closest-sibling selection.
- The big **FOIL** switch (green ON / red OFF, locking, etched) and the Pokémon **NORMAL | HOLO | REVERSE** selector, plus 1st Edition (Section 8.5). Alt+F.

**Where to look**
- [x] A card with a showcase or borderless version in the same set: unchecking Showcase jumps to the regular printing, and checking it goes back.
- [x] A trait with no alternative in the set is greyed out with a tooltip.
- [x] A foil-only card (e.g. a Secret Lair foil) locks the switch ON; a non-foil-only card locks it OFF.
- [x] A card with an etched version: Etched shows and the switch reads ETCHED.
- [x] A Pokémon card with normal + reverse: the selector allows those two, and HOLO is disabled.
- [x] A 1st Edition-capable WotC-era card shows the 1st Edition toggle.
- [x] Base Set Charizard, HOLO: the Version list reads Unlimited, 1st Edition, Shadowless, 1999–2000 Copyright (4th print). Jungle Clefable: Unlimited, 1st Edition, ….

---

### Phase 5: Prices

**Build**
- Edge Functions **`secrets`** and **`prices`** (Sections 4.5, 5.3), deployed to dev. `price_cache`, `price_map`, `api_usage` writes.
- Settings: **API keys** (11.2) and **JustTCG usage** meter (11.3).
- The price table with the five condition buttons, NM default, fallback tag, "—" cells, the updated-ago caption, and manual price (Section 8.7). A 400ms settle before fetching. The quota-exhausted banner. Alt+1–5, Alt+M.
- Confirm JustTCG game IDs and printing strings. Record them in `src/lib/prices.js` comments.

**Owner tasks**
- Enter the JustTCG key in **Settings → API keys** on the dev site once the section exists (and again on prod at launch).

**Where to look** (all tested by the owner and working, 2026-09-29)
- [x] Settings → API keys: the key shows masked, and Test shows your plan and remaining requests.
- [x] Select a card: five prices appear. NM is selected. Flipping foil changes the prices instantly.
- [x] Select the same card on another computer: prices appear without the usage meter going up (shared cache).
- [x] An obscure card with no JustTCG data shows "fallback" prices on all five conditions (Settings → Master Fallback Percentages).
- [x] A card where JustTCG has a lower condition priced above a better one (e.g. MP > LP): that price shows as "fallback", and its tooltip says it was thrown out.
- [x] Isshin, Two Heavens as One (FCA 54), non-foil: MP shows $7 (10% below LP's $7.78) and DMG $3.50 (10% below HP's $4), both "fallback"; never the same price as the condition above.
- [x] Manual price: the ✎ price shows bold with the market price struck through beneath it. Picking another condition clears it.
- [x] Use Fallback: hovering shows the fallback NM price; pressing it replaces all five prices with fallbacks (NM = the fallback, the rest by the fallback percentages, all tagged "fallback"); pressing again goes back.
- [x] Use Cardmarket (between Use Fallback and ✎ Manual price): hovering shows Cardmarket's euro price and its dollar value; pressing it prices every condition from it (tagged "CM"; Base Set Charizard 1st Edition: about $2,810 / $2,390 / $1,970 / $1,540 / $1,120); pressing Use Fallback switches to that instead; pressing again goes back to JustTCG.
- [x] A card whose Scryfall/TCGdex price is far from JustTCG's NM shows ⚠️ on the NM label.
- [x] Base Set Charizard, HOLO, 1st Edition: ⚠️ on NM and "⚠️ Price may be wrong (3)" in the price panel; hovering it lists the three reasons over Finish & Details, which keep their full height. Unlimited Charizard and Isshin (FCA 54) show neither.
- [x] Price panel (beside the card info): the selected condition's price in green, Credit and Cash under it; it follows condition, foil, Use Fallback, Use Cardmarket and manual price.
- [x] Arrow quickly through 10 suggestions: the usage meter rises by about 1, not 10.
- [x] MTG | PKM: switch PKM off and search `Charizard`: only Magic cards show (or "No cards match … PKM is off"), and EN | JP greys out. The last game on can't be switched off. Leave the Price tab and come back: both are on again.
- [x] Etched Magic card: the price looks like the etched listing, not the regular foil.
- [x] No tokens or art cards: search `2/184 S8b` (EN) or `Treasure 14`: no tokens, emblems or art series cards among the suggestions.
- [x] `2/184 S8b` with EN on: the note under the search bar reads "S8b is a Japanese Pokémon set: switch to JP"; clicking it switches to JP and finds the card. `125/197 OBF` with JP on offers "switch to EN".
- [x] Japanese images: JP, a card from TCG Tag Team All Stars (`1/173 SM12a`) or VMAX Climax (S8b) shows a real picture (from Limitless), not the card back; a top secret rare Limitless lacks still shows the card back. Settings' footer credits Limitless TCG.
- [x] Japanese Pokémon without JustTCG data (JP, `25/165 SV2a`): all five prices appear on their own, tagged CM, caption "No JustTCG price: Cardmarket prices shown."; Use Cardmarket is greyed out.
- [x] Cardmarket link (after View on TCGplayer): Magic's View on Cardmarket opens the card's page (Isshin, FCA 54); Pokémon's Find on Cardmarket opens a Cardmarket search for the name (Charizard). Neither shows "Sorry, you have been blocked". A Japanese Pokémon (JP, `25/165 SV2a`) shows "ピカチュウ Pikachu", searches Cardmarket for "Pikachu 025" and TCGplayer for "Pikachu 025", and prices from JustTCG's Japanese listing if it has one. On the 1366×768 laptop the three links read "Scryfall ↗ TCGplayer ↗ Cardmarket ↗".

---

### Phase 6: Buy list, walk-in drafts and CONFIRM BUY

**Build**
- The Postgres write functions for drafts and `confirm_buy` (Section 6.2), including the `events` writes for `buy_confirmed`.
- A new migration adding `buys.custom_cash_pct` / `custom_credit_pct` (Section 6.1; 0001 is already applied, so don't edit it), `draft_set_custom_rates`, and the clickable percentages with the custom-rate subpanel (Section 8.9.1) on the Price tab.
- Qty, **ADD CARD**, **CLEAR** (Section 8.8); the sidebar with game groups, line format (`lineFormat.js`, with unit tests for the formatter), hover-red remove with quantity (8.9); totals; **CONFIRM BUY** dialog with customer name/notes; **CANCEL** (8.10); CONFIRM BUY and CANCEL reset MTG | PKM to both (8.2); per-device draft restore; the "Pick a user first" guard; Enter to add. Alt+Q.

**Where to look** (owner tested every item, 2026-09-29)
- [x] Add 3 cards, refresh the page: the buy list is still there.
- [x] Add the same NM card twice: one line, qty 2. Add it as LP: a second line with `[LP]`.
- [x] Foil shows `*F*`, etched `*E*`, holo `*H*`, reverse `*RH*`; a Japanese card shows `[JP]`.
- [x] Magic and Pokémon lines sit under their own headers, newest at the bottom.
- [x] Hover turns a line blue. Clicking it loads that card back with its condition, quantity and any manual price; the button reads EDIT CARD; change the condition and press it: the line changes and adding carries on. Esc while editing leaves the line as it was.
- [x] The red × at a line's end removes it; on a qty-3 line it asks how many.
- [x] Totals: Market, Cash 33%, Credit 66% are right (check one by hand).
- [x] Click **Cash (33%)**: the subpanel opens. Set 40: the label reads **Cash (40% ✎)** and the total changes. Refresh: still 40. **Use master rates** puts it back to 33. After CONFIRM BUY, the next buy starts at 33.
- [x] CONFIRM BUY shows the count and total and accepts a customer name; afterwards the list is empty.
- [x] CANCEL with cards asks first; Discard empties it.
- [x] With no user picked, ADD CARD is disabled and the user button pulses.
- [x] Keyboard only: type → ↓ → Enter adds → the cursor is back in search.

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
- [ ] Mark as Priced asks for an offer: type 120 at 33% / 66% and the credit offer reads $240. The table's Offer shows "$120 / $240"; Paid reads TBD in amber.
- [ ] Mark as Paid/Ours asks Cash or Credit and the final price: pick Credit, type 262.50. The status chip and Paid column turn blue; the Paid/Ours Credit filter finds it.
- [ ] Mark as Completed: grey, locked, and the Completed filter (last) finds it. Reopen puts it back to Paid/Ours with the price kept.
- [ ] A Paid/Ours collection: the red × still removes a card, but clicking a line doesn't edit it and ADD CARD is blocked. A Completed one: no ×, no editing.
- [ ] Filter chips: Processing amber, Priced red, Paid/Ours Cash green, Paid/Ours Credit blue, Completed grey.
- [ ] Set a custom Credit % on a collection: its totals use it; changing Master Buy Percentages in Settings doesn't touch it; it's locked while Paid/Ours and still there after Unlock.
- [ ] Open the same collection on a second computer: it's view-only and names the first computer and user. Take over: the first computer turns view-only.
- [ ] Close the first computer's browser entirely: within about a minute the second can edit without Take over.
- [ ] Delete: two steps, the name must be typed. The collection disappears from the table.
- [ ] EXPORT shows "EXPORT COMING SOON".
- [ ] Sorting, status filter and phone search work in the table.
- [ ] Click a line in a collection: EDIT CARD saves it at today's price; the header's totals follow.
- [ ] MTG | PKM and Oldest first stay set while you're in a collection and reset after Back.
- [ ] The changelog isn't on screen until Phase 9, but every add, edit, remove, info edit, status change and delete writes an `events` row (Supabase Table Editor → `events`).

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
- [ ] The red × on a row removes a card (how many, for several); the note says the buy was already confirmed. Clicking the row itself does nothing.
- [ ] Each row shows its price per card; the customer line shows the phone number when CONFIRM BUY had one.
- [ ] × on a buy's only card asks to delete the whole buy instead.

---

### Phase 9: Changelog

**Build**
- The timeline (Section 12) ported from CM: day pills, alternating sides, entry panels, dots, pager top and bottom, back to top.
- Categories with click / Ctrl+click behavior, game filter, text filter, funnel, and the Show-everything bar. Folding of add/remove runs. Clickable targets. Opening-state reset on re-click.

**Where to look**
- [ ] Every action from Phases 6–8 appears: buy confirmed (large green dot, all cards, totals), cards removed, buy deleted (red cross), collection created (large blue dot), cards added, card edited, status changed (with the offer or price paid, and Completed / Reopened), details edited, collection deleted.
- [ ] Twenty quick adds to one collection show as **one** "Cards added to collection" panel.
- [ ] Today/Yesterday labels and alternating sides look like CM.
- [ ] Clicking a buy title opens its day page; clicking a collection opens it; a deleted one isn't a link.
- [ ] The funnel shows only that collection's history; Show everything returns.
- [ ] The Magic filter hides Pokémon-only entries and still shows mixed ones whole (both games' cards, the indigo-to-amber panel).
- [ ] Ctrl+click adds categories; the last one can't be switched off.
- [ ] Status changes (with the offer / price paid) show with Actions off; a name, phone or notes edit shows only with Actions on.
- [ ] A card removed from a buy days later links to the day that buy was confirmed.
- [ ] Two card edits in a row stay two panels. Typing a collection's phone number (digits only) shows its whole history.

---

### Phase 10: Global search, backups and launch

**As built (2026-09-30):** the owner split the phase: the search, backups and polish were **built locally and on dev** (committed, **not pushed**), along with the owner's additions below. Migrations **0015–0022 are applied to dev**. **The launch waits for the owner's go.**

**Build**
- Header global search (Section 13): **Paid/Ours only by default, with a Show all toggle** (forgotten when the results close) for the other statuses, Completed results partly faded; **collections pinned at the top, then buys under dates** ("Today · September 30, 2026"); a panel per buy or collection listing each matching card as entered with its condition ("1 Gaea's Cradle (USG) 321 [NM]"); card pictures on hover; keyboard, and jump + flash. Migrations 0015–0017, 0021.
- Backup download/restore (11.5), the `restore_backup` function, the pre-restore auto-download, the backup reminder banner, and the plan-status text. Migration 0015.
- Polish pass: empty states, loading states, error toasts, tooltips, the 1366×768 check.
- **Added by the owner (2026-09-30):**
  - **Walk-in buys: Paid/Ours, then Completed on EXPORT** (Section 10): EXPORT on a past day's page warns, then marks its buys Completed (locked, out of the search) game by game; a ⋯ menu beside EXPORT puts the day back; exported days are greyed and tagged on the Calendar; **today can't be exported**. Migrations 0018–0019.
  - **Purchase price on CONFIRM BUY** (Section 8.10): Cash / Credit chips and the amount typed in by hand; customer name, phone and price all required; the Paid/Ours chip is green or blue by how it was paid. Migration 0020.
  - Settings panels one fixed height, and Backups split on the page's centre line (Section 11); collection details with a clear header bar and fold button (9.4); the Changelog opens on Buys, with day pills that match the search's dates (12); card pictures on day pages (10.2); the computer is saved before anything can use it (7.4).
- **Launch:**
  - apply migrations **0001–0022** to **prod** (0022 drops the old 9-argument `confirm_buy`, done on dev 2026-09-30), and put the Edge Functions on prod;
  - **set the GitHub Actions variables back to prod** (since 2026-09-30 they point the live site at **dev**, for testing 0.9.0-dev, then 0.9.1-final and 0.9.9-export, at the store; see `docs/SETUP.md` → Deploying);
  - finish `docs/SETUP.md`: run, deploy, the store password and backups are written; **restoring a paused project** is still to write;
  - the public `README.md` stays a very short description of the tool's purpose (owner's decision, 2026-09-29);
  - **push to `main` only when the owner says go**, then confirm the Pages deploy succeeded.

**Owner tasks**
- Say "push" when ready.
- On the live site: sign in, name the computer, add users, enter the JustTCG key, upload the CC CSV, and set Cash/Credit %.
- Decide on Supabase Pro for prod (daily backups, no pausing).

**Where to look**
- [ ] Header search `bolt`: Paid/Ours collections pinned under **Collections**, then buys under their dates, each panel listing its Lightning Bolts in full with their conditions; hovering a card line shows its picture. Opening one jumps there and flashes it.
- [ ] ↓/↑ move the highlight, Enter opens it, Esc closes; a collection result opens the collection with its matching lines tinted.
- [ ] Search `Charizard 125/197`: narrows to that printing.
- [ ] A card in a Processing, Priced or Completed collection, or on an exported day, doesn't come up until **Show all** is ticked; Completed ones then show partly faded. Close the results and open them again: back to Paid/Ours only.
- [ ] CONFIRM BUY needs a name, a phone number and a purchase price (Cash or Credit, typed in); the buy's day page shows its Paid/Ours chip in green or blue and a "Paid $… cash" chip.
- [ ] EXPORT on a past day: the warning, then the buys are Completed (× gone, Delete buy blocked, out of the search), the page greyed with EXPORTED, the Calendar day tagged "Exported". ⋯ → Mark Paid/Ours again undoes it. EXPORT on today's page is blocked.
- [ ] Download backup: a JSON file saves, and the reminder banner goes away.
- [ ] Restore (on **dev only**): type RESTORE, a pre-restore file downloads first, then the data matches the backup, and a "Backup restored" milestone is in the changelog.
- [ ] The milestone also shows with the Changelog filtered to Magic or Pokémon.
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
| 34 | Totals | Sidebar bottom, collection header, day-page panels; (follow-up) Cash/Credit in totals only (owner, 2026-09-29: plus the Price screen's display-only price panel for the current card, decision 83) |
| 35 | No JustTCG price | Labeled Scryfall/TCGdex fallback (owner, 2026-09-29: every condition, via the Master Fallback Percentages; replaces "◆ NM only") |
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
| 74 | Tokens and emblems (2026-09-29) | Not searchable: Magic tokens, emblems and art cards stay out of search results, by `-is:extra` in the Magic search (Section 1.4) |
| ◆ 75 | Pokémon versions (Phase 4, 2026-09-29) | A Version list from TCGdex's `variants_detailed` (subtype, foil pattern, stamps incl. 1st Edition) replaces separate 1st Edition / W Promo checkboxes (Section 8.6) |
| 76 | Fallback prices (2026-09-29) | Every condition without a JustTCG price is a base price × its Master Fallback Percentage (Settings); the base is JustTCG's NM when it has one, else Scryfall/TCGdex; defaults Magic 100/90/80/70/60, Pokémon 100/85/70/55/40 (Section 8.7) |
| 77 | Price rounding (2026-09-29) | Market and fallback prices round **down**: < $1 cent; $1–$10 quarter; $10–$100 dollar; $100–$1,000 $5; ≥ $1,000 $10. Whole-dollar amounts show without ".00" |
| 78 | Prices never rise (2026-09-29) | A JustTCG price above the better condition's is thrown out and replaced by a fallback; no fallback may exceed the better condition (Section 8.7) |
| 79 | Use Fallback (2026-09-29) | A button left of ✎ Manual price; its tooltip shows the fallback NM price, and pressing it throws out every JustTCG price: NM = the fallback, the other conditions by the fallback percentages (Section 8.7) |
| 80 | Manual price and condition (2026-09-29) | Picking a different condition clears the manual price |
| 81 | NM warning (2026-09-29) | ⚠️ on the NM label when JustTCG's NM and the fallback NM differ by 25%+ and at least $1 |
| 82 | Price table foot (2026-09-29) | Use Fallback, Use Cardmarket and ✎ Manual price centered under the buttons; the "Prices via JustTCG" caption on its own line below |
| 83 | Price panel (2026-09-29) | Beside the card info: the selected condition's price in green, with Credit and Cash chips under it, rounded down by the price steps. Display only, never saved (Section 8.7) |
| 84 | Totals rounding (2026-09-29) | Buy and collection totals' Cash / Credit round down by the price steps too, from the summed total (Section 7.8) |
| 85 | Game filter (2026-09-29) | MTG \| PKM toggle left of EN \| JP: both on by default, at least one on; held for the buy, reset to both when a buy is confirmed/cancelled or the Price tab is left (Section 8.2) |
| 86 | Fallback step-down (2026-09-29) | A fallback that would show the same as or more than the condition above it is set 10% (Magic) / 15% (Pokémon) below that condition's price, not equal to it; a full quarter below where 10%/15% would still round to the same price (Section 8.7) |
| 87 | Pokémon version names (2026-09-29) | "1st Edition" leads a version's label and drops the implied "Shadowless" (Base Set's 1st Edition run is all shadowless); the plain version of a card with a 1st Edition reads "Unlimited" (Section 8.6) |
| 88 | More price warnings (2026-09-29) | ⚠️ on NM also when a worse condition costs over twice the best, a 1st Edition's NM is below its Unlimited's, or Cardmarket's price (euros at the ECB rate via Frankfurter) is 2× or ½ JustTCG's NM and $5+ apart. TCGplayer's own API isn't available (Sections 5.4, 8.7) |
| 89 | Price warning box (2026-09-29) | The reasons for ⚠️ sit behind an amber "⚠️ Price may be wrong (N)" line in the price panel: hover shows them in a box floating over Finish & Details, click keeps it open. Nothing else loses room (Section 8.7) |
| 90 | Use Cardmarket (2026-09-29) | A button between Use Fallback and ✎ Manual price: NM = Cardmarket's price in dollars, the other conditions by the fallback percentages, mirroring Use Fallback; one or the other, never both; `price_source` `cardmarket` (Sections 5.4, 8.7) |
| 91 | Cardmarket link (2026-09-29) | A third link after View on TCGdex/Scryfall and View on TCGplayer: Scryfall's Cardmarket link for Magic, a Cardmarket name search for Pokémon (Cardmarket blocks bare product-ID links); "View on" / "Find on" drop out when the info box is narrow (Section 8.4) |
| 92 | English names for Japanese cards (2026-09-29) | Cardmarket and TCGplayer searches for a Japanese Pokémon use its English name, from its Pokédex number (PokeAPI's species names, stored in the app) plus markers like ex / V / GX / Mega (Section 8.4) |
| 93 | Japanese cards in English (2026-09-29) | The English name also shows in the info box beside the Japanese name, and is what JustTCG is searched by for a Japanese card's price (Sections 5.3, 8.4) |
| 94 | Cardmarket search (2026-09-29) | Find on Cardmarket searches the name **and** the collector number ("Pikachu 025"), which Cardmarket's search matches best (Section 8.4) |
| 95 | Search tie-break (2026-09-29) | When a JustTCG name + number search finds several cards, the one whose set name or ID contains the printed set code as a word wins; still no guessing otherwise (Section 5.3) |
| 96 | Japanese fallback (2026-09-29) | A Japanese Pokémon with no JustTCG price for any condition is priced from Cardmarket automatically (NM = Cardmarket in dollars, the rest by the fallback percentages, tagged CM) (Section 8.7) |
| 97 | Japanese images (2026-09-29) | Japanese Pokémon with no TCGdex picture use Limitless TCG's image CDN (by set code and number), then the card back; credited in Settings' footer (Sections 5.2, 11.7) |
| 98 | Wrong-language set code (2026-09-29) | A set code only the other Pokémon language has gets a note under the search bar with a one-click "switch to JP" / "switch to EN" (Section 8.2) |
| 99 | Shadowless tag (2026-09-29) | Buy-list lines tag Shadowless (non-1st-Edition) Base Set versions `[SL]`, after `1st Ed` (Section 8.9, Phase 6) |
| 100 | Price sources (Phase 6, 2026-09-29) | `price_source` gains `justtcg_fallback` (JustTCG NM × percentage) and `cardmarket`; `market_price` is the condition's market price before rounding, kept even under a manual price (Section 6.1) |
| 101 | Buy numbers (Phase 6, 2026-09-29) | A confirmed buy's changelog name and toast use "Buy N" among the day's buys with cards of its first game (Magic before Pokémon), matching that game's day page (Section 6.2) |
| 102 | Editing buy-list lines (2026-09-29) | Clicking a line (blue on hover) loads the card back with its saved choices and ADD CARD becomes EDIT CARD, saving over the line; removing moves to a red × at the line's end (Section 8.9) |
| 103 | Edit look and line previews (2026-09-29) | While editing, EDIT CARD is blue and CLEAR reads CANCEL; hovering a buy-list line shows a small picture of the card beside the sidebar (Sections 8.8, 8.9) |
| 104 | Line prices and Cash/Credit colors (2026-09-29) | The buy list shows each line's price per card before it (display only); Cash is green and Credit blue everywhere (`--cash`, `--credit`; Sections 7.8, 8.9) |
| 105 | Sidebar takes spare width (2026-09-29) | The buy list grows (340px up to 560px) by the width the suggestions can't use, so Finish & Details sits right after the thumbnails (Section 8.1) |
| 106 | Sign out a user (2026-09-29) | An icon beside the user chip clears the picked user, blocking user-only actions until one is picked (Section 7.3) |
| 107 | Outside links in pop-ups (2026-09-29) | Scryfall/TCGdex, TCGplayer and Cardmarket open in one reused pop-up window per site instead of new tabs (Section 8.4) |
| 108 | Japanese lines in English (2026-09-29) | Buy-list lines for Japanese cards show the English name when the app has one, saved as `buy_lines.name_en`; the Japanese name stays in `name` (Sections 5.2, 6.1) |
| 109 | Suggestions sort toggle (2026-09-29) | A Newest first / Oldest first pill left on the suggestions' top line flips the date order within each rank and re-runs the search; kept for the buy like MTG \| PKM (Sections 8.2, 8.3) |
| 110 | Collection edits re-price (Phase 7, 2026-09-29) | EDIT CARD on a collection line takes today's price, as on a walk-in buy; logged as `collection_line_edited` (Sections 6.2, 9.4, 12.3) |
| 111 | Toggles per collection visit (Phase 7, 2026-09-29) | MTG \| PKM and Newest/Oldest first hold while on one collection and reset when it's left (Section 9.4) |
| 112 | Collections as built (Phase 7, 2026-09-29) | Totals in the header only; view-only computers take a freed or stale lock by themselves; the dropdown can unlock to Processing; functions take the device and line texts (Sections 6.2, 9.4–9.6) |
| 113 | Right-click a suggestion (2026-09-29) | Right-clicking a suggestion thumbnail (row or show all) searches that card's plain name, a quick "every printing" (Section 8.3) |
| 114 | Suggestions clear on a new search (2026-09-29) | The last query's thumbnails go as soon as a new search starts, instead of staying until the new results arrive (Section 8.3) |
| 115 | Phone number on walk-in buys (2026-09-29) | CONFIRM BUY has an optional phone number, formatted and checked like a collection's, saved in `buys.phone` and named in the changelog summary (Sections 6.1, 8.10) |
| 116 | Collections table layout (2026-09-29) | One heading line (title and count, then + Price Collection and search on the right); the table is always drawn, full width, with an empty or "no match" message as its only row, so nothing moves (Section 9.1) |
| 117 | Header search size (2026-09-29) | The header search is much larger off the pricing screens instead of smaller on them (Section 13) |
| 118 | Credits list (2026-09-29) | Settings' footer credits are a bulleted list, one source per line, adding PokeAPI and Frankfurter (Section 11.7) |
| 119 | Settings in two columns (2026-09-29) | Settings' panels sit in two columns across the page, related panels side by side (Section 11) |
| 120 | Collection details in the sidebar (2026-09-29) | A collection's details move from the header bar to the sidebar's foot, above the totals (where the Price tab has them), collapsible; nothing sits above the stage (Section 9.4) |
| 121 | Last 4 ID on collections (2026-09-29) | An optional Last 4 ID (up to 4 letters/digits, capitals) in + Price Collection, saved with the collection, shown and edited in its details, not on the table (Sections 6.1, 9.2) |
| 122 | Last edited by column (2026-09-29) | The collections table shows who last edited each collection, after Last edited, sortable (Section 9.1) |
| 123 | The offer (2026-09-29) | Marking a collection Priced asks for a cash offer; the credit offer is worked out at its rates and shown; both are saved (`offer_cash`, `offer_credit`) and shown on the table (Sections 6.1, 9.1, 9.5) |
| 124 | The price paid (2026-09-29) | Marking a collection Paid/Ours asks for the final purchase price and Cash or Credit; saved (`paid_price`, `paid_method`), shown on the table in green or blue, filterable (Sections 6.1, 9.1, 9.5) |
| 125 | Completed status (2026-09-29) | After Paid/Ours comes Completed: locked, grey, and skipped entirely by the header search since its cards have moved on (Sections 9.5, 13; Phase 10) |
| 126 | Status colours (2026-09-29) | Processing amber, Priced red, Paid/Ours green (cash) or blue (credit), Completed grey; filter chips Paid/Ours Cash and Paid/Ours Credit replace Paid/Ours, Completed last (Section 9.1) |
| 127 | Rule-box foil (2026-09-29) | Rule-box Pokémon (ex, V, VMAX, VSTAR, GX and the like) get the whole-card foil sheen like full-art cards, holo or reverse (Section 8.4) |
| 128 | Holo masks by era (2026-09-29) | Six art-window masks by release year (1999, 2003, 2007, 2011, 2017, 2023+), measured on full-size scans, replace the modern/vintage pair (Section 8.4) |
| 129 | Offer and Paid last (2026-09-29) | The collections table ends with Offer and then Paid, after Notes; Status stays after Phone (Section 9.1; the owner corrected a first "Status and Offer last") |
| 130 | Big BACK button (2026-09-29) | A collection's < BACK is a large bold button at the top left, before the search bar, instead of in the details (Section 9.4) |
| 131 | Removing from Paid/Ours (2026-09-29) | Cards can still be removed from a Paid/Ours collection, not added or edited; a Completed collection allows neither (Sections 6.2, 9.5; migration 0012) |
| 132 | Default sort (2026-09-29) | The collections table opens sorted by Created, newest first, instead of Last edited (Section 9.1) |
| 133 | Day page removals (Phase 8, 2026-09-29) | Day pages remove cards with the buy list's red ×, not a red row hover; confirmed buys can't be edited (Section 10.2) |
| 134 | Price per card on day pages (2026-09-29) | Day-page tables show each line's price per card, like the buy list (Section 10.2) |
| 135 | Phone on day pages (2026-09-29) | A confirmed buy's phone number shows beside its customer name (Section 10.2) |
| 136 | Last card deletes the buy (2026-09-29) | Removing a confirmed buy's last card deletes the buy, asking first; `buy_remove_line` refuses it (`last_card`) (Sections 6.2, 10.2) |
| 137 | Collection screen in amber (2026-09-29) | Inside a collection the background art is mirrored and the screen's accent is amber, so it looks distinct from the Price tab (Section 9.4) |
| 138 | Calendar decoration (2026-09-29) | The month picker is centred; a line runs down the middle; the Magic side is themed indigo and the Pokémon side amber (Section 10.1) |
| 139 | Calendar always 6 weeks (2026-09-29) | Month grids always have 6 week rows of fixed-height days, so the panels fit any month and never change size (Section 10.1) |
| 140 | Day pages by game colour (2026-09-29) | Magic day pages are themed indigo and Pokémon ones amber, accent included; panels keep their user-coloured top edge (Section 10.2) |
| 141 | EXPORT on the day page's header row (2026-09-29) | A day page's EXPORT sits on the header row, right-aligned opposite < BACK and level with it, for both games (Sections 10.2, 14) |
| 142 | Status changes are Collections (Phase 9, 2026-09-29) | Status-change entries (offer, price paid, Completed) count as Collections and show by default; only detail edits are Actions (Sections 12.3, 12.4) |
| 143 | Buy links go to the confirm day (2026-09-29) | A buy's changelog entries link to the day page of the day it was confirmed, not the day of the change (Section 12.2) |
| 144 | Card edits don't fold (2026-09-29) | Only runs of card adds or removes fold into one panel; each card edit stands alone (Section 12.6) |
| 145 | Changelog style pass (2026-09-29) | Entries coloured by game (mixed buys both), more chips (headline, counts, user, totals, statuses), and Cash green / Credit blue carried into the log's words (Section 12.2) |
| 146 | Mixed entries whole under a game filter (2026-09-29) | Filtering the Changelog to Magic or Pokémon still shows mixed entries whole, as multi-game panels, instead of trimming them to one game (Section 12.4) |
| 147 | Settings panels one fixed height (2026-09-30) | Every Settings panel is the same fixed height, 332px (the Master Crystal Inventory with just a current file); extra content scrolls inside the panel (Section 11) |
| 148 | Collection details header bar (2026-09-30) | A collection's details get a filled amber header bar and a large fold button, and always open unfolded; folding isn't remembered (Section 9.4) |
| 149 | Test deploy on dev (2026-09-30) | Before Phase 10, version 0.9.0-dev goes live on GitHub Pages built against the **dev** project, for testing at the store; the Actions variables go back to prod at launch (Section 15, Phase 10) |
| 150 | Wait for the computer's row (2026-09-30) | The app is blocked until this computer is saved to `devices`, with the error and a Retry if the save fails, so no draft or lock can point at a missing computer (Section 7.4) |
| 151 | Quiet retries for the computer's row (2026-09-30) | A failed save of this computer is retried three times (1, 2, 3 seconds) before the error and Retry show (Section 7.4) |
| 152 | Changelog opens on Buys (2026-09-30) | The Changelog opens (and resets) with only Buys selected (Section 12.5) |
| 153 | Card pictures on day pages (2026-09-30) | Hovering a card row on a Calendar day page shows its picture beside the panel, like the Price sidebar (Section 10.2) |
| 154 | Phase 10 built locally, launch later (2026-09-30) | Search, backups and polish built on dev and committed, not pushed; the launch steps wait for the owner's go (Section 15) |
| 155 | Header search reading (2026-09-30) | From 2 characters after a short pause; a trailing set code only if stored lines use it, else retried without; conditions don't split a printing; Enter opens the first result (Section 13) |
| 156 | What a backup holds and a restore keeps (2026-09-30) | Backups also leave out JustTCG's live usage and the CSV list (it stays with the CSVs); a restore keeps every computer, the CSVs, the keys and the last-backup time, and hides staff users not in the backup (Section 11.5) |
| 157 | Milestones under a game filter (2026-09-30) | "Backup restored" shows under the Magic and Pokémon filters too (Section 12) |
| 158 | Conditions in search results (2026-09-30) | Each header search result row ends with its condition in brackets ([NM], [LP]…); a buy with two conditions of one printing gets a row for each (Section 13) |
| 159 | Search results on two lines (2026-09-30) | Each header search result shows where it is, then the full card entry with its condition, "1 Fabricate (SLD) 123 [NM]" (replacing the bare [NM] of decision 158) (Section 13) |
| 160 | Backups panel split on the grid (2026-09-30) | The Backups panel's two halves are equal, its separator on the page's centre line in line with the settings grid (Section 11) |
| 161 | Card pictures on search results (2026-09-30) | Hovering a header search result shows its card's picture beside the dropdown, like the Price sidebar (Section 13) |
| 162 | Search results by date (2026-09-30) | Header search results are filed under dates (a buy's confirmation day, a collection's creation day), a panel per buy or collection listing each matching card in full, replacing the printing headings (Section 13) |
| 163 | Collections pinned in search (2026-09-30) | Header search results show matching collections in a Collections section at the top, then buys by date, since collections are kept in their own place (Section 13) |
| 164 | Walk-in buys: Paid/Ours, then Completed (2026-09-30) | A confirmed walk-in buy is Paid/Ours; EXPORT on its day page makes it Completed (locked, out of the search), game by game, after a warning; a ⋯ menu beside EXPORT puts the day back to Paid/Ours; once Completed, EXPORT changes nothing (Sections 10, 13, 14) |
| 165 | Exported days look different (2026-09-30) | Exported days are greyed and marked "Exported" on the Calendar; their day pages fade to grey with an EXPORTED chip and a note on who exported them when (Section 10) |
| 166 | Today can't be exported (2026-09-30) | EXPORT is blocked on the current day (and refused by the server), so an export is always a whole, finished day; the "Part exported" state and everything for it are removed (Section 10) |
| 167 | Walk-in purchase price (2026-09-30) | Confirm buy asks for the purchase price (Cash / Credit chips and the amount); customer name, phone and price are all required; the buy's Paid/Ours chip is green or blue by how it was paid (Section 8.10) |
| 168 | Search Paid/Ours only, with Show all (2026-09-30) | The header search shows Paid/Ours buys and collections only; a Show all toggle in the results adds Processing, Priced and Completed ones (Section 13) |
| 169 | v0.9.1-final pushed (2026-09-30) | Phase 10 and the owner's additions go live as 0.9.1-final (tagged `v0.9.1-final`), still built against the **dev** project; prod launch still waits (Section 15, Phase 10) |
| 170 | Old confirm_buy dropped (2026-09-30) | With v0.9.1-final live, the 9-argument `confirm_buy` kept for the older build is dropped (migration 0022): every buy is confirmed with a name, phone and price paid (Section 6.2) |
| 171 | Master Crystal Inventory at real size (2026-09-30) | The real Crystal Commerce export is 40 MB+: it's checked in chunks with progress, stored gzipped (Free plan: 50 MB per file, 1 GB in all), and downloads are unpacked back to CSV (Section 11.1) |
| 172 | Only the current inventory file (2026-09-30) | The Master Crystal Inventory keeps no previous copies: an upload replaces the current file (migration 0024) (Section 11.1) |
| 173 | Export: Crystal Commerce Mass Create (2026-09-30) | EXPORT makes a Mass Create CSV for CC's "Only Update Products" mode, Add Qty, Magic only; the design is `docs/EXPORT_FUNCTION.md` (Section 14) |
| 174 | Export: matching (2026-09-30) | Cards are matched to the store's own CC products through the Master Crystal Inventory (loaded into the database at upload); unclear ones are picked by staff in a review, and every choice is remembered (export spec 7) |
| 175 | Export: Can't upload (2026-09-30) | A card with no CC product must be pulled from the batch (a required checkbox), gets a Can't upload chip, and is copied into a permanent **Can't upload cards** collection; undoing the export takes it back out (export spec 9) |
| 176 | Export: Sell Price (2026-10-01) | Each card's Sell Price is today's full market price for its condition, worked out as at the buy, rounded up, at least $0.40 (a manual price: the higher of the two); after the export the app shows Sell Prices in place of buy prices, and totals follow (export spec 5) |
| 177 | Export: Custom SKU (2026-10-01) | Every row carries the export's date as a number (`61726` for 06/17/26), shown in a Custom SKU chip on the exported day or collection (export spec 4.4) |
| 178 | Export: collections (2026-09-30) | Exporting a Paid/Ours collection exports its Magic cards and marks it Completed; its Pokémon cards are ignored; Reopen undoes the export (export spec 8) |
| 179 | Export: Pokémon (2026-09-30) | Pokémon EXPORT is greyed out on day pages for now (export spec 1.3) |
| 180 | Export built (2026-10-01) | Phases E1–E5 built in one unattended run, committed locally, migrations 0025–0029 on dev; the owner's questions are in `docs/EXPORT_BUILD_REPORT.md` |
| 181 | v0.9.9-export pushed (2026-10-01) | The export (E1–E5) goes live as 0.9.9-export (tagged `v0.9.9-export`), still built against the **dev** project, before the owner's QA and answers; prod launch still waits (Section 15, Phase 10) |
| 182 | Completed only from EXPORT (2026-10-01) | A collection becomes Completed only by EXPORT; it can't be set by hand any more (migration 0030; Section 9.5; export spec E24) |
| ◆ | Environments | Separate Supabase dev and prod projects |
| ◆ | Devices | Each browser names itself ("Front Counter") for drafts and lock banners |
| ◆ | Keyboard | ↓/↑ for suggestions (←/→ stay as text keys); Alt shortcuts for condition, foil, quantity, manual price |
| ◆ | Price budget | 6-hour shared price cache; prices fetched only after a selection rests for 400ms |
| ◆ | Cancel | CANCEL asks before discarding a non-empty buy |
| ◆ | Changelog opening | Buys only on (2026-09-30; was Buys + Collections); runs of adds/removes within 15 minutes fold into one panel |
| ◆ | Card-not-found | No free-text cards in this version |

---

## Appendix D: Open items

1. **Export design doc**: the owner writes it. It includes the Crystal Commerce CSV column mapping, so **attach a sample CC export** (a few rows is enough).
2. **Supabase plan for prod**: Free (weekly manual backups, pauses after 7 idle days) vs. Pro ($25/month: daily backups, no pausing).
3. ~~**Japanese Pokémon**~~: coverage confirmed good in the Phase 3 spike (Section 5.2 findings). Names: lines show the English name from the Pokédex number (decision 108); the USD fallback is Cardmarket, automatically (Section 8.7). Resolved 2026-09-29.
4. **JustTCG plan**: watch the usage meter during the first weeks and move to Professional if the daily limit binds.
5. ~~**Store time zone**~~: confirmed Pacific time, `America/Los_Angeles` (`STORE_TZ`), 2026-09-29.
