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

- Pricing a card takes **one typed line and one keypress** when the query identifies a single printing (auto-select; taken out on 2026-10-11, decision 233, and put back on 2026-10-12, decision 247).
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

- **Repository:** `pug-pricing-tool` on the owner's GitHub account (`dazeyama`), **public**, created with `gh repo create`. GitHub Pages is served by GitHub Actions. **Licensed GPL-3.0** since the phone scanner (decision 279): its card recognition is copied from GrimbiXcode/mtgscan, which is GPL-3.0 (`LICENSE`; `docs/SCAN_FUNCTION.md` 10).
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

**The oldest Japanese sets** (owner's decision, 2026-10-01): the first ten (1996–2001, TCGdex `PMCG1`–`PMCG6`, `neo1`–`neo4`) have pictures on neither TCGdex nor Limitless. **Pokellector** (`jp.pokellector.com`) has them, numbered as TCGdex numbers them, but its picture addresses carry an ID of its own (`den-cards.pokellector.com/311/Nidoran.EXP.5.37255.thumb.png`), so `scripts/pokellector-jp.mjs` reads its ten set pages once into `src/lib/pokellectorJp.json` (28 KB, loaded only when a Japanese card needs a backup picture) and the app asks Pokellector only for the pictures. Its `.thumb.png` (~200 KB) is the thumbnail and its `.png` (~700 KB) the selected card; both are cached 30 days. Built 2026-10-01: all 779 cards matched by number except two TCGdex quirks, Dark Houndoom (TCGdex #229, printed #24; mapped) and Crossing the Ruins' extra Aerodactyl #057 (no picture there). Tried before Limitless for those sets; credited in Settings' footer.

**Pokémon cards TCGdex doesn't list** (owner's decision, 2026-10-09). TCGdex is nearly complete for the main sets but adds new promos weeks late (MEP #101 Nidorina, the 30th Celebration promo, wasn't there on 2026-10-09) and has no TCGplayer-only products (the Cosmos Holo Gengar 60/162 from a tin, stamped prerelease and store promos). TCGplayer's catalogue, through JustTCG (our prices already come from it), fills both holes:
- **Search:** when an English Pokémon search finds nothing in TCGdex (and has a name of 3+ letters), the app waits 600 ms more, then asks the `prices` function for a **find** search: JustTCG cards whose names contain the name, with that number (and set size), English only. They show as normal suggestions: TCGplayer's picture, the name without TCGplayer's " - 101" (its bracket, e.g. "30th Celebration", becomes the version's label and a line tag), TCGdex's set code when TCGdex has the set by name, else the promo set's usual code (MEP, SVP, SWSHP…), TCGplayer's prefix ("SV10") or the name's initials; "From TCGplayer" in the details. Its versions are its TCGplayer printings.
- **Versions:** when an English TCGdex card is selected, a **siblings** search finds the other JustTCG products with its name and number; those TCGdex doesn't give (by TCGplayer ID), other than the plain card, become extra versions labelled by their bracket ("Cosmos Holo") or their TCGplayer set, tagged "TCGplayer" in the Version list, and on the buy line ("1 Gengar (BKT) 60 *H* [Cosmos Holo]").
- Both searches are kept by the server like prices (price_cache `search:<key>`, 6 hours; a miss a day), and each card found is cached under its lookup keys, so picking one costs no more requests: about one JustTCG request per new card or empty search. A line from either keeps its JustTCG card (`justtcg_card_id`) and version (`price_snapshot.version`, `jt:…`), so REPRICE? and the export reprice it as itself, and editing finds it again.

**Set codes (owner's decision):** display the **printed abbreviation** from the set's `abbreviation` field (`PAL`, `OBF`, `SV2a`). Older sets have no printed abbreviation. For those, fall back to the TCGdex set ID in upper case (`BASE1`) and treat it as the code for search too.

**Japanese (owner's decision: English + Japanese Pokémon).** This is **best-effort** and must be verified with a short spike at the start of Phase 3:
- Japanese cards come from `/v2/ja/`. Their names are in Japanese, so a clerk can't reliably type them. Japanese matching therefore uses the **set code + collector number** (and printed size). The typed name is only used to rank results.
  - **"No. 32": the oldest Japanese sets** (owner's decision, 2026-10-01). The first ten Japanese sets, the six original expansions and the four Neo sets (TCGdex `PMCG1`–`PMCG6`, `neo1`–`neo4`, 1996–2001), print **no set code or collector number, only the Pokédex number**: "No. 032". TCGdex numbers their cards in its own order (Nidoran♂ is `PMCG1-005`), so with JP on, a search that is exactly **`No.` and a number** (`No. 32`, `No.032`) finds the cards with that Pokédex number in those ten sets (TCGdex `dexId=eq:32`: a plain `dexId=32` also finds 132 and 232). Magic isn't searched for it. `No. 32` → Nidoran♂ (Expansion Pack) and Giovanni's Nidoran♂ (Challenge from the Darkness). The suggestions still show TCGdex's own number for these cards (`#005`), which is also what a buy line keeps.
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
| rejected_at, rejected_reason | timestamptz null, text null | collection: when it was marked **Rejected**, and the optional reason typed then (owner's decision, 2026-10-09). Both cleared when it's reopened; the reason stays in the Changelog. Migration 0043. |
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
| custom_cash_pct, custom_credit_pct | numeric(5,2) null | **Set Rate** (migration 0055, `docs/TEAM_FEEDBACK.md` 4.3): this card's own rates, strongest of all; either may be null. The same card still merges (owner, 2026-10-15; migration 0056): added copies take the line's own rate, and an edited card merged into its copy keeps an own rate either had. |
| cash_pct, credit_pct | numeric(5,2) null | The rates **kept on the card** (migration 0055, 4.6): set when its buy is confirmed, a collection is marked Paid/Ours or Rejected, or a project converted to a buy (CONFIRM BUY and Convert to buy keep the **default** rates: custom and own rates are forgotten, migration 0057); cleared when a collection is unlocked or reopened. A project's cards have none. Null while worked out live. |
| bulk_kind | text null | **Bulk** (migration 0058, `docs/TEAM_FEEDBACK.md` 5): which of the eight bulk items (`mtg_100_common`, `mtg_100_rare`, `mtg_10_dollar`, `mtg_10_fifty`, `pkm_100`, `pkm_100_ex`, `pkm_10_dollar`, `pkm_10_fifty`), null for a real card. Bulk has placeholders (set `BULK`, no number, NM, finish nonfoil / normal), `quantity` = items, `unit_price` = value per item, `price_source` `bulk` or `manual` (Set value); a check allows them only together. Never exported, completed or searched. Also `mtg_placeholder` / `pkm_placeholder` (migration 0062, decision 270): a placeholder, named and priced by hand (price_source always manual), rated like a card. |
| struck_at, struck_by | timestamptz null, uuid null | **Struck** (migration 0059, decision 267): when and by whom the card was struck (× in a Paid/Ours walk-in buy or collection): kept on the list crossed out, never exported or completed, found by the header search only with Show all (decision 275), still in the totals. Null for a live card. |
| created_at | timestamptz | |

**Line identity for merging** (owner's decision): two adds merge into one line, with the quantity increased, when all of these match: `game, lang, scryfall_id/tcgdex_id, finish, first_edition, treatments, condition, unit_price, price_source`, and `bulk_kind` and, for a placeholder, the name typed. **One rule, one place:** `internal.same_card(a, b)` (migration 0065), used by every add and edit, walk-in or collection; it ignores rates, since copies take the line's rate. A strike or a restore uses the stricter `internal.same_line` (0059), which also matches the set, number, JustTCG variant and the rates, because it must land on an identical line.

**`events`**: the changelog (append-only, never updated or deleted). **Written only by the database** (decision 274): every entry comes from a server function (`internal.buy_event`, `internal.collection_event`, and since 0064 `collection_log_call` for a collection's Called and `buy_log_cash_download` for the Cash buys file); the app never inserts a row itself. The store's role still has the right to insert until migration 0072 takes it away after the squash (SQUASH.md section 11a).

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
| `draft_set_line_rate(line_id, cash, credit, user)` | Set Rate on a draft's card (migration 0055): its own rates, either null. Refuses `bad_pct` (0–100, 2 decimals), `line_gone`. | none |
| `collection_set_line_rate(line_id, cash, credit, user, device, expected_version, text)` | Set Rate on a collection's or project's card (migration 0055), checked like every list change (`no_user`, lock, version, `collection_paid` / `collection_completed` / `collection_rejected`, `line_completed`, `bad_pct`); never on a project (`project_rates`, 0057); clears any rate kept on the card. | `collection_line_rate` with each rate's before/after |
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
- The selected user is **kept for this tab only** (`sessionStorage`; owner, 2026-10-11, replacing "remembered on this device"): a new tab starts with no user, a reload keeps it, and it's forgotten after each confirmed buy and after 30 minutes with no mouse, keyboard or touch in the tab (decision 231).
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
- **Phones get the scanner instead** (decision 278; `docs/SCAN_FUNCTION.md` 5): a touch-first screen under 900px on its shorter side opens `#/scan`, the phone scanner, and nothing else (`src/lib/mobile.js`); `#/scan` also opens on any device. Neither shows the notice or the laptop zoom (`<html data-scan>`, `styles/scan.css`).
- **The laptop pass** (owner, 2026-10-14, decision 255): the work laptops' windows are as small as **1200×650**. On a small window **everything is drawn smaller, down to 80%**, so more fits at once: full size from 1500×812 up, **80% at 1200×650** and below, and in between the tighter of the width and the height decides (1366×768 is 91%). It's CSS `zoom` on the app, its dialogs and its toasts (`--ui-zoom`, `src/lib/uiScale.js`); sizes made from the window's height or width inside them are divided by it, so they still fill the window. A 1200×650 window is laid out like a 1500×812 one at full size. Pop-ups placed beside something (a list line's card, past customers, a call's details) and the enlarged card stay full size. On a short window (820px or less) the **header is compact** (less space around the brand, a smaller logo and user button, lower tabs). At 1200×650 the selected card is 220×307 (130×181 before), and ADD CARD (or SAVE EDIT) stays on one line in its row, the three price buttons fit their column, the Finish box doesn't scroll (only a long Version list inside it does), all three links show, and the shortcut line ends in … rather than running under the Buy list if a window is ever too narrow for it. **The suggestions keep two rows** down to a 650px-tall window (owner, 2026-10-14); only a window shorter than that falls back to one row of 5 (`Suggestions.jsx`, `SHORT`). Where their column is narrow but tall (a laptop's window, up to about 1600×900) they're **two rows of 4**, bigger (owner, 2026-10-14: they fill the space better): 4 across whenever that makes them at least 15% bigger than 5 across (`src/lib/thumbGrid.js`, measured from the column by PricingScreen's `useListRoom`). At 1200×650 that's 8 at 81px (10 would be 63px); a 1920×1080 screen keeps 10 at 139px.

---

## 8. Price tab

The main screen. Collections reuse it (Section 9.4) with small differences.

### 8.1 Layout

The Price screen fills the viewport below the header with **no page scroll**. It has two regions: the **stage** on the left (all remaining width) and the **buy list sidebar** on the right (**340px**, full height). `background.webp` covers the **whole tab** at 50% opacity (AT `.stage::before`, `center / cover`). The sidebar sits on top of it as a slightly translucent panel (`--panel` at 90% opacity), so the art shows faintly behind the list.

```
┌──────────────────────────────────── STAGE ────────────────────────────────────┬──── BUY LIST ────┐
│ ┌─────────────────────────────────────────────────────────────────┐ [EN|JP]   │ BUY LIST 12 cards│
│ │ 🔍  Lightning Bolt 117/331 2X2                                   │           │ ── Magic (9) ──  │
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
- An **EN | JP** segmented toggle at its right edge. It affects **Pokémon only** (Magic is always English), defaults to **EN**, and **isn't remembered** (owner's decision, 2026-10-02, replacing "remembered per device"): every screen that opens (the Buy tab, a collection) starts on EN. With JP on, the field's sample text says how Japanese cards are found: "Type the number and set code: 025/165 SV2a · oldest sets: No. 32". While JP is on, a small "JP" chip shows in the input. It's greyed out while PKM is off.
- **Wrong-language set code** (owner's decision, 2026-09-29): when the typed set code isn't a Magic code or one of the current language's Pokémon codes but is the other language's ("2/184 S8b" with EN on), the note under the search bar says "**S8b** is a Japanese Pokémon set: switch to JP", and clicking *switch to JP* flips the toggle (and the reverse for an English code with JP on). It shows in place of "Showing results for".
- Search runs live as the user types (debounce 250ms, minimum 2 characters). **Both games are queried every time** (owner's decision) unless MTG | PKM switches one off, and results mix together with game badges.

**Query syntax.** The expected line is what's printed on the card:

```
<card name> <collector number>/<printed size> [<set code>]
```

Examples: `Lightning Bolt 117/331 2X2`, `Abrade 37/291 SOA`, `Charizard ex 125/197 OBF`, `Pikachu TG05/TG30`, `Sol Ring`.

Parsing rules (`src/lib/query.js`), applied to the trimmed input:

0. **Commas are treated as spaces** (owner's decision, 2026-09-29): `Gut, True Soul Zealot` searches as `Gut True Soul Zealot`, which matches more cleanly in practice.
1. If the last token is 2–6 letters or digits containing at least one letter, and doesn't contain `/`, **and** the token before it contains `/` (or matches a known set code), it's the **set code**. Case-insensitive, matched against Scryfall set codes and Pokémon printed abbreviations.
2. The next last token containing `/` is **`<number>/<size>`**. The number keeps letters and symbols (`263s`, `TG05`, `SV107`, `★`). The size may be numeric (`295`) or prefixed (`TG30`).
3. A last token that is purely a collector-number pattern, with no `/`, is accepted as a **number only**.
4. Everything before that is the **name**. The name may be partial (`light bol`).
5. Number comparisons ignore leading zeros (`037` = `37`) and case.

**Matching.**
- **Name correction:** if the name part doesn't match any known name as a prefix or substring, run a Fuse.js search against the cached name catalogs (Scryfall catalog; TCGdex names per language). Retry with the best match when its score passes the threshold. Show "Showing results for **Lightning Bolt**" under the bar when a correction was applied.
- **Magic:** `cards/search` with `q = <name terms> lang:en` plus `cn:<number>` and `set:<code>` when given. A plain number also asks for its **promo pack printing**, the same number with a "p" in the set's promos (`(cn:"229" or cn:"229p")`: "High Perfect 229" finds Lorwyn Eclipsed 229 and Lorwyn Eclipsed Promos 229p; owner, 2026-10-13, decision 250); a number typed with letters is searched as typed. Then filter by `printed_size` using the cached sets list, **only when that set's `printed_size` is known** (sets like SLD or PLST have none, and those printings are kept but ranked lower).
- **Pokémon (EN):** TCGdex `cards?name=<name>` (plus `localId` when a number is given), then filter by set `cardCount.official` = size, and by printed abbreviation = set code when given. **(JP):** match by set code + number + size (Section 5.2).
- **Ranking:** (1) number + size + set all match, (2) number + size, (3) number, (4) name only. Within a rank, newest release first (or oldest first with the sort toggle, Section 8.3). Magic and Pokémon interleave by rank.
- **Paging:** take the first page of each source (Scryfall returns up to 175). If there are more, "show all" says "175+ — refine your search".

### 8.3 Suggestions row

- Up to **10 thumbnails** of the best matches in rank order, in **2 rows of 5** under the card info (Section 8.1); **2 rows of 4** where the column is narrow but tall, a laptop's window (Section 7.10, decision 256). Beneath each is a caption with its game badge and `SET #num` (owner's decision, 2026-09-29: a badge on the card's top corner covered the name, and Scryfall's image rules keep overlays off the bottom strip).
- **Sort toggle** (owner's decision, 2026-09-29): on the same line, at the left (the status follows it), a small pill that reads **↓ Newest first** (the default) or, clicked, **↑ Oldest first** (accent-colored while reversed). It flips the date order within each rank; the rank still comes first, so exact number/set matches lead either way. It **re-runs the search** (Scryfall `dir=asc`, TCGdex sorted before the first page is cut), so oldest first starts at the true oldest printing even when there are 175+. Remembered like MTG | PKM: for the whole buy, back to newest first when a buy is confirmed or cancelled or the Price tab is left.
- A **"… show all (N)"** button on the line above them when N > 10. It opens a modal grid of every match (same thumbnails, scrollable, with the same keyboard behavior). Clicking a card selects it and closes the modal.
- The highlighted suggestion has an accent outline (the keyboard cursor, Section 8.11).
- **Right-clicking a thumbnail** (owner's decision, 2026-09-29), in the row or the "show all" grid, types that card's name into the search bar and searches it: a quick way to see every printing of the card. It's the plain name ("Lightning Bolt"; a Japanese card's own name), so cards with those words in their names come up too (the owner's choice: simple over exact). The browser's own right-click menu doesn't open there.
- Clicking a thumbnail makes it the **selected card**. Clicking the selected card's thumbnail again deselects it, leaving nothing selected (owner's decision, 2026-09-29).
- **Hover** (owner's decisions, 2026-09-29): a thumbnail pops up and grows (about 14%, with a slight overshoot and a deep shadow). Then the **set symbol** pops in over the spot a Magic card prints it (the right end of the type line, mid-right), large (about 38% of the card's width) and **colored for rarity**: common black, uncommon silver, rare gold, mythic orange-red, special/bonus purple. When there's **no symbol**, a small chip with the **set code** shows there instead, in the same colors. That covers every Pokémon card (TCGdex's set-symbol images return 404, and suggestions don't carry Pokémon rarity, so these chips are slate) and any Magic symbol that fails to load.
- **Auto-select** (owner's decision): when the results narrow to exactly **one** printing, it becomes the selected card automatically. With several matches nothing is selected until the user clicks or arrows to one. The previous selection stays while it's among the results, and clears when the query changes enough that it no longer matches. (Taken out on 2026-10-11, decision 233; put back on 2026-10-12, decision 247.)
- States:
  - Searching: a subtle "Searching…" with a spinner. The previous query's thumbnails **clear as soon as a new search starts** (owner's decision, 2026-09-29), leaving the empty card shapes; the selected card stays until the new results arrive (Section 8.12).
  - Image still loading (a thumbnail or the selected card, including a Pokémon backup still being looked up, Section 5.2): a card-shaped shimmer with a spinner and "Loading…". The card back appears only once every source has been tried (owner's decision, 2026-09-29).
  - No match: "No cards match. Check the number and set code." Also show the name correction when one was tried.
  - A source failed: its badge greys out, with "Scryfall didn't respond — retrying…" or "TCGdex didn't respond — retrying…". The other game's results still show.

### 8.4 Selected card

- The large card image (AT `.card-wrap`, `--card-radius`, `--shadow`) with two-stage image loading, at **Scryfall's card-page size, 336×468** (owner's decision, 2026-09-29), centered in its column whether empty or showing a card (owner, 2026-09-29), so a card shrunk by a short window stays in the middle. It keeps the card's proportions at all times and only shrinks when the window is too short. **On a tall window it grows to fill its area** (owner, 2026-10-14, decision 257: at 1920×1080 it left about 135px empty under it): its column widens to the card's width at the area's full height, up to 120px past the usual 336px (456×635 at the most), Finish & Details giving up to 40px of that and the suggestions the rest (`src/lib/cardRoom.js`, measured by PricingScreen's `useCardRoom`). At 1920×1080 the card is 420×585, the suggestions stay 2 rows of 5 (130px), and Finish & Details is 340px wide; the laptops (1200×650, 1366×768) and 1600×900 are unchanged.
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

- **The 1st Edition stamp** (owner, 2026-10-12, decision 248). TCGdex's pictures of the 1st Edition sets (Base Set to Neo Destiny) are 1st Edition scans: all 74 checked carry the stamp, though **Unlimited** is the version picked by default. On an English Pokémon card that has a 1st Edition version, shown from TCGdex (the only scans measured; backups and Japanese cards are left as they are), Pokémon and Trainers (not Energy):
  - **Unlimited (or any version but 1st Edition):** the stamp is **painted out**. The app reads the picture (TCGdex allows it; it's the one already downloaded, cached), finds the stamp by its ink, dark marks lying wholly inside the stamp's zone with its solid disc dark at the middle, and fills the ink and the "1" it encloses from the card's colour around it, grown in from the edge, smoothed, with the paper's grain added back. Anything reaching outside the zone (the art's frame, the Length/Weight stripe, an energy symbol, text) is never touched; a scan without the stamp is left as it is. Done once per picture, in a few milliseconds of plain processor work, no GPU: the painted piece is a small picture laid on the card, under the foil sheen.
  - **1st Edition:** the label under the card adds it, **✦ HOLO · 1ST EDITION** (or **✦ 1ST EDITION**); and a scan **without** a stamp gets one **drawn** on, where the real one goes: a black disc with a serif "1" cut out of it, standing its full height (the card shows through, as on the printed stamp), and EDITION in heavy capitals fanned over it (`FirstEditionStamp.jsx`; owner's changes, 2026-10-12: the "1" larger and see-through, the letters bolder).
  - **Where:** a Pokémon's stamp sits just left of the Length/Weight stripe under the art, a Trainer's above the illustrator's name, bottom left; the same on every card of those sets (`STAMP_LAYOUTS` in `src/lib/firstEditionStamp.js`, measured on TCGdex's 600 × 825 scans of all ten sets), except **Rocket's Mewtwo** (Gym Challenge 14), whose art and stripe sit higher: its stamp is 64 pixels higher (`CARD_SHIFTS`; owner, 2026-10-12: the one exception that matters). The suggestion thumbnails stay as they are: they show the card, not a version.

- **Base Set's shadow** (owner, 2026-10-12, decision 249). TCGdex's Base Set scans are the 1st Edition ones, printed **shadowless**; Base Set's **Unlimited** prints have a drop shadow along the art frame's right and bottom edges, as Base Set 2 and every later set do (Jungle on, even 1st Edition, so only Base Set needs it). With the **Unlimited** or **1999–2000 copyright** version of an English Base Set **Pokémon** picked (not Shadowless, not 1st Edition; **Trainers don't have it**), shown from TCGdex, the card gets the shadow drawn: an empty box the art frame's size (`BASE_SET_ART_FRAME`, 8.83–91.17% across, 10.67–52.6% down, the same on all 69 Pokémon scans) casting a CSS drop shadow down and right, in units of the picture's width so it scales with the card (`.art-shadow` in `price.css`, `needsBaseSetShadow` in `src/lib/pokemonFrames.js`). Measured against Base Set 2's (a brown band hugging the frame's right edge, a thin one under it), then made a little stronger, as the owner asked. It lies under the foil sheen, with the stamp work.
- **The card, large, with a magnifying glass** (owner, 2026-10-14, decision 252). Clicking the selected card (its cursor says so: zoom-in) opens it in a panel in the middle of the screen, the rest dimmed dark, with its name in bold above it (and the English name beside a Japanese one), as tall as the window allows, up to 1040 px; Magic's picture is Scryfall's PNG there, bigger and sharper than the large JPG, for small print. It's drawn exactly as the selected card is: the foil sheen, the 1st Edition stamp painted out or drawn on, Base Set's shadow, the ball and stamp badges. **One effect at a time** (owner, 2026-10-14): while it's open, the selected card behind it has no sheen and its finish label's colours stand still. While it's open the cursor becomes a **magnifying glass**: a circle showing what's under it at **2×** (a collector number, a set symbol), with a faint glassy sheen and a thick clear rim that shows the screen behind it, brightened and a little blurred (`CardZoom.jsx`; the glass is a copy of the panel at twice the size, moved so the point under the cursor sits in its middle, `src/lib/cardZoom.js`). A click anywhere, or Esc, closes it; keys don't reach the search bar while it's open, and it gives the search bar its focus back. No glass on a touch screen.

### 8.5 Finish control (the big switch)

This sits at the top of the right column, beside the suggestions and above the details panel (Section 8.1). It must be **large, bold and obvious**.

- **Magic:** a compact toggle switch (about 220×46px, owner's decision 2026-09-29; the Pokémon selector below keeps its full width and 64px), labeled **FOIL**. **ON is green with the knob right; OFF is red with the knob left**, and the text ON/OFF is inside the track.
- The finish control and details panel sit together in a faint dark box with a clearly visible frame; only the details list scrolls, with an easy-to-see scrollbar (owner's decision, 2026-09-29).
  - Default **OFF (non-foil)** when the printing exists both ways (owner's decision).
  - **Every selected card starts on its defaults** (owner's decision, 2026-09-29): a finish or Pokémon version chosen on one card is forgotten once another card is selected, including when coming back to the first card. Only a Details jump to a sibling printing (Section 8.6) carries the finish over, where the sibling has it. **The same goes for the price choices** (owner's decision, 2026-10-16, decision 272): the condition, a manual price, Use Fallback / Use Cardmarket and a placeholder's typed name are forgotten once another card is selected, so coming back to a card starts on NM again.
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

**TCGdex foil-pattern mistakes** (owner's report, 2026-10-01): TCGdex tags every **Fossil** printing (`base3`), plain and holo, with a `galaxy` foil, so its versions read "Galaxy foil" instead of Unlimited / 1st Edition (Gastly 33/62). A survey of every Wizards-era set and a sample of later ones found it only in Fossil. So a **plain (normal) version never takes a foil pattern**, and a short table of known mistakes (`WRONG_FOILS` in `src/lib/printings.js`: Fossil's `galaxy`) is ignored on holos too; versions left identical appear once. Fossil's real oddities (the prerelease Aerodactyl's cosmos and starlight, the 4th-print Zapdos) keep their patterns. The `pre-release` stamp reads "Prerelease stamp". Prices were unaffected: they come from each version's TCGplayer product.

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
- **📈 / 📉 price movement** (owner, 2026-10-14, decision 258): quiet, not a warning. When the selected condition's shown price is JustTCG's and it **rose or fell sharply lately**, the price panel shows a 📈 or 📉 just right of the big price (owner, 2026-10-14: only there, not on the condition buttons, and big): **20%+ over the last 7 days, or 25%+ over the last 30**, and **at least $1** either way (so a $0.30 card doubling doesn't count); the week's move wins over the month's. Hovering it (or clicking, to keep it open) floats a box over Finish & Details like the price warnings', green for a rise and red for a fall: "📈 PRICE RISING · Up 81% in the last 30 days on JustTCG · $2.78 → $5.04" (owner, 2026-10-14: not the browser's own tooltip; `PriceTrendBox.jsx`). From JustTCG's own figures for the price, which come with it (`priceChange7d`, `priceChange30d`, in percent: −3.33 is −3.33%, checked on a real response): the `prices` function now keeps them (and `avgPrice30d`) instead of dropping them, so it costs no request; prices cached before that (up to 6 hours) have none. Not shown on a fallback, Use TCGplayer / Use Cardmarket, or a manual price. Saved with the line (`price_snapshot.trend`). `src/lib/priceTrend.js`.
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
- **A paired phone** (decision 278; `docs/SCAN_FUNCTION.md` 8): while Magic is on, a chip under the heading, **📱 Chase's phone · 23 scanned** with **×** to unpair it (muted, "away", when the phone hasn't been heard from for a minute). Cards it scans are added through ADD CARD's own path and flash in; the stage is left alone. The Price tab and a collection's screen (not Can't upload cards, not Edit in project view) are open to phones while they're shown.
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
- **Edit** (owner's decision, 2026-09-29, replacing click-to-remove): hovering a line turns its text the **blue accent** color; clicking it **loads that exact card back** onto the stage: the search bar is filled with a line that finds it ("Sol Ring 472 CMR", "Charizard 4/102 BS", Japanese "025/165 SV2a"; EN | JP and MTG | PKM switch to suit), the card is selected when the results arrive, and everything saved with it is put back: finish or Pokémon version, condition, quantity, a manual price, and Use Fallback / Use Cardmarket (from `price_snapshot`). The line is highlighted and the note under the search bar reads "Editing <line>: SAVE EDIT saves the changes, Esc leaves it as it was." **ADD CARD reads SAVE EDIT and turns blue** (the accent color; EDIT CARD until 2026-10-12), and **CLEAR reads CANCEL** (owner, 2026-09-29); pressing SAVE EDIT (or Enter) saves the stage over that line through `draft_update_line` (anything can change, even the printing; if the result is identical to another line they merge, keeping the earlier place), then the stage resets and adding carries on as normal. CLEAR / Esc stops editing without saving. If the card can't be found again, a toast says so and nothing changes.
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
- **Pointing at a name** (a collection's or a project's, here and in Home's list) shows a chip **just above the name** (below only when there's no room above; owner, 2026-10-16: the pointer covered it below) with its cards **by game**, counted as CONFIRM BUY counts them: "MTG 42 cards + 1,000 bulk", "PKM 7 cards · 1 struck"; "No cards yet" when empty (owner's decision, 2026-10-16, decision 276).
- **Empty state:** "No collections yet. Press + Price Collection to start one." It shows as the table's only row, under the column headings; a search or filter with no results reads "No collections match." the same way. The table and the page stay full width whatever they show, and the heading row is one line: **Collections (count)** on the left, **+ Price Collection** and the search box on the right (owner's decisions, 2026-09-29), so nothing moves between views.

**As of 2026-10-01 (owner's decision): three tables**, in this order (owner, 2026-10-14), each with its own heading and count: **Collections** (with the status filter chips), **Projects** (9.1a) and **System** last (Can't upload cards, `docs/EXPORT_FUNCTION.md` 9). **+ Start Project** and **+ Price Collection** sit in the header row beside the search box, the same width. One search box and one sort serve all three; the three share column widths so they line up. **Each has a colour** that means nothing else in the app (owner, 2026-10-01): **System violet, Projects pink, Collections cyan**. The table's title is large in it, the table is tinted with it, its chip (System, Project) uses it, and inside one of them it replaces the amber as the screen's highlight.

### 9.1a Projects (owner's decision, 2026-10-01)

A **project** is a collection of cards **the store already owns** (a box from the back that isn't part of any buy), priced so it can be exported.

- **+ Start Project** asks only for a **name** and optional **notes**: no phone, no Last 4 ID (`project_create`, migration 0031; `buys.project`).
- It **starts Paid/Ours, and that's its only state** until **EXPORT** marks it Completed; Reopen brings it back. It never goes to Processing or Priced (the server refuses with `project_status`), and it has no offer and no price paid.
- **Unlike a customer's Paid/Ours collection, a project stays editable**: cards can be added, edited and removed while it's Paid/Ours.
- In the table its Phone cell shows a violet **Project** chip (as Can't upload cards shows **System**); Offer and Paid read `—`. Its Paid/Ours chip is the neutral grey (nothing was paid).
- Its details panel shows the name and notes (editable), its status as a chip with no dropdown or step button, a "Project: the store's own cards…" banner, and Created / Edited; Delete works as for any collection.
- Everything else (pricing, the one-computer lock, the changelog, EXPORT, Sell prices, Can't upload cards, search) is a collection's.

### 9.1b REPRICE? (owner's decision, 2026-10-01)

A smaller **REPRICE?** button beside EXPORT on a collection's screen brings **every card's buy price** up to today's prices, for a project worked on over weeks. It asks first, then fetches today's prices the way EXPORT's Sell Prices do (`src/lib/todaysPrices.js`, shared: JustTCG fresh, Scryfall / TCGdex fallbacks, Cardmarket × today's rate; Magic and Pokémon), and works out each card's new **buy** price exactly as the Price screen would now: the same ladder, its Use Fallback / Use Cardmarket where it can apply, **rounded down** as always (`src/lib/reprice.js`). Sell prices aren't touched. **Manual prices stay as typed** (their market figures are refreshed); a card with no price today keeps its price. All the lines are saved at once (`collection_reprice`, migration 0033), logged as one "Collection repriced" entry with the market before and after, and a toast says how many changed. It works where cards can be edited anyway: a project (Paid/Ours), or a Processing or Priced collection; and on **Can't upload cards**, beside its own EXPORT (migration 0034: its cards can sit there for weeks; everything else there stays locked). A customer's Paid/Ours, Completed and view-only are refused.

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
  - a **⋯** menu with **Mark as completed**, **Export single buy** (Magic), **Edit in project view** (2026-10-13), **Convert to project** and **Delete buy…** (owner, 2026-10-14: only Delete buy… keeps its "…") (owner, 2026-10-02: the first two below).
- **Panel body:**
  - customer name and notes, if any;
  - a CM-style `.deck-table` of the lines: **qty · name · set · number · finish marker + tags**, in the order added;
  - a footer with **Market · Cash · Credit** totals for **this game's lines**, using the buy's snapshotted percentages;
  - if the buy also has the other game's cards: "Also has N Pokémon cards →" (or Magic), linking to the other game's day page. Bulk is counted apart, as CONFIRM BUY counts it: "Also has 3 Pokémon cards + 100 bulk →", "Also has 100 Pokémon bulk →"; a placeholder is a card (owner, 2026-10-16, decision 273).
- **Card pictures on hover** (owner's decision, 2026-09-30): hovering a card row shows its picture beside the panel, level with the row, the same as the Price sidebar's preview (Section 8.8): 146 × 204, right of the panel, or left when the window has no room there.
- **Removing cards** (owner's decision): row hover turns red. Click → the same "Remove card?" dialog with quantity as Section 8.9, then `buy_remove_line`, which is logged. The confirmation text notes: "This buy was already confirmed."
- **Deleting a buy:** ⋯ → Delete buy… → "Delete **Buy 2** (Dana, 2:37 PM)? All **N cards** in this buy — including any from the other game — will be permanently removed." [Cancel] [Delete buy] (red). Calls `buy_delete`, which is logged.
- **Mark as completed** (owner's decision, 2026-10-02): marks this game's cards in one buy **Completed without exporting them** (`buy_mark_completed`, migration 0036): locked like an exported buy, left out of the header search (Show all still finds them) and **left out of every later export of the day** (the export only takes cards not yet Completed; once the whole day is Completed, EXPORT downloads the same file again from the export's stamps, which these cards don't have). Once marked, the item reads **Mark Paid/Ours again**, which puts back only cards marked this way; exported cards go back with their day. Their lock reads "Completed (marked by hand, not exported)". A day whose buys were all marked by hand shows **Completed**, not Exported, and the "Exported …" note counts only exported cards. Logged as `buy_completed` / `buy_uncompleted`.
- **🚩 Flag check for condition** (owner, 2026-10-14, decisions 261–262): a buy flagged at CONFIRM BUY shows **🚩 Check condition** in its header and a red note in its panel (until it's Completed). Clicking the chip asks **"✅ Condition checked?"** (No / Yes); Yes takes the flag off. Its ⋯ has **✅ Condition checked** pinned first while it's flagged. **A buy can only be flagged at CONFIRM BUY** (owner, 2026-10-14: no flagging from the day page). **Edit in project view** asks the same at SAVE BUY on a flagged buy ("No, keep the flag" / "✅ Yes, checked"; the changes are saved either way). Once checked, the chip turns into a green **✅ Condition checked** for good, saying who and when (`condition_checked_at` / `_by`, migration 0054). A buy never flagged has no chip. EXPORT, Export single buy and COMPLETE warn before taking a flagged buy: "Buy 2 is flagged: its cards need their condition checked before export", **Cancel** or **Export anyway**. The flag changes the Changelog (Buys: "🚩 Buy flagged: check condition", "Buy condition checked"), not the buy's version.
- **Edit in project view** (owner, 2026-10-13, decision 251): in a buy's ⋯, above Convert to project, for small fixes before an export (a card's condition or treatment, mostly: exports must match the inventory exactly). It opens the buy's cards on the pricing screen (`/calendar/<game>/<day>/buy/<id>`, `BuyEditPage.jsx`), styled like a collection's but highlighted in the day page's game colour (Magic blue, Pokémon amber), with the buy's number, day, customer and what was paid in the sidebar. Clicking a card loads it to edit; SAVE EDIT changes it there (at today's price for what it now is, as every edit does) and × takes cards out, but **nothing is saved until SAVE BUY**, in CONFIRM BUY's place, which saves every change together (`buy_save_edits`, migration 0052: each changed line in place, the removed ones gone; refused when the buy changed elsewhere since, a card is Completed, or every card would go) and goes back to the day page with the buy flashed and its edited cards marked. The buy stays on its own day; its one Changelog entry, **Buy edited** (under Buys, each card before and after), is now's. No cards can be added (ADD CARD only saves an edit) and the rates stay the buy's: the customer was paid already, and what was paid isn't touched. < BACK with changes not saved asks first. Blocked, like Convert to project…, while any of its cards are Completed.
- **Convert to project** (owner's decision, 2026-10-02): asks for a project name (the customer's name, else "Buy 2 · October 1, 2026"), then `buy_to_project` (migration 0036) makes a **Paid/Ours project** with the buy's notes, rates and what was paid, **moves every card of the buy, both games, into it as they are** (prices, conditions, versions, price snapshots), and deletes the buy. Blocked, like Delete buy…, while any of its cards are Completed. Logged as one Changelog entry on the project, `buy_converted` ("Buy converted to project", under Buys): every card added (migration 0039; 0036 logged the buy's cards removed and a "Collection created"). The app opens the new project.
- **Status and EXPORT (owner's decision, 2026-09-30):**
  - Each buy panel's header shows its status for this game: **Paid/Ours** or **Completed**. A Completed panel's card names are in the struck cards' grey, so it reads as done; it isn't faded (owner's decision, 2026-10-16, decision 277). Its × buttons are gone and **Delete buy…** is blocked ("Completed (exported): mark the day Paid/Ours again…"); the server refuses too (`buy_completed`).
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
  - **Only the current file is kept** (owner's decision, 2026-09-30; was five, then briefly two): an upload **replaces** it. `master_inventory_finish` (migration 0025; before it `master_inventory_add`, 0024, dropped in 0051) removes every other row once the new one is current, and the app deletes their files. There's no Previous copies list.
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
  - counts (`+N` green / `−N` red): cards only, a placeholder included; bulk is in the sentence ("7 cards + 100 bulk bought…", decision 273);
  - the **acting user** with color dot (owner's decision);
  - a **funnel** button that narrows the timeline to this buy or collection (CM `.ch-filter`).
- **Summary line:** a plain sentence, plus **totals** (owner's decision): Market / Cash / Credit on buy confirmed, buy deleted, collection deleted, and cards-added/removed entries (the total of the lines in that entry).
- **Card rows:** always open, in a scroll box (max 168px, CM `.tl-rows`). Each row is `+` (green) or `−` (red) followed by the line text (Section 8.9). Additions come first, then removals.
- **Field rows** for edits: `name: "Jordan R." → "Jordan Reyes"`, `status: Processing → Priced`. These panels are dimmed (CM `.tl-state`, opacity .78).
- **As built:** the funnel sits at the right of the header strip (as in CM). Card rows show each line's price per card after it, muted. A folded run's summary reads what it adds up to ("7 cards added.", "2 cards + 100 bulk added.": decision 273). **A buy's name links to the day page of the day the buy was confirmed**, not the day of the change (owner's decision, 2026-09-29), in the game on show; a collection's to the collection.
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
- **Scope** (owner's decision): lines in **confirmed walk-in buys** and **collections**, but not drafts. **Completed walk-in cards (exported, Section 10.1) are left out too** (owner's decision, 2026-09-30), like Completed collections. **As built (owner's decision, 2026-09-30, replacing that): the search shows Paid/Ours only by default**: walk-in cards not yet exported, and Paid/Ours collections. A **"Show all"** toggle at the top of the results (a small checkbox chip; **forgotten whenever the results close**: a click away, Esc or opening a result puts the search back to Paid/Ours only, owner's decision 2026-09-30) adds **every other status**: Processing, Priced and Completed collections, and exported walk-in cards, which then carry a grey **Completed** chip, and **struck cards**, crossed out as on their list with a grey **Struck** chip and who struck them and when in a tooltip, an entry apart from the live copies of the same card (owner's decision, 2026-10-16, decision 275). **Completed results (exported buys, Completed collections) show partly faded** (half opacity, clearer when highlighted; owner's decision, 2026-09-30). Drafts never show. With nothing found, the message says it looked at Paid/Ours only and that Show all includes the others. `global_search` takes `p_all` and returns `completed` per line (migration 0021). **Completed collections are skipped completely** (owner's decision, 2026-09-29): their cards have moved on, so they can't be found where they were. Paid/Ours collections are searched (their cards are in the store), as are Processing and Priced ones. The query runs in Postgres (`name_key` trigram/ILIKE, plus number, size and set equality), limited to 200 lines. Japanese lines should also match on `name_en` (the English name staff will type).
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

**The phone scanner has its own design document too: `docs/SCAN_FUNCTION.md`** (built 2026-10-16, Phases S1–S5; decisions 278–279).

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
  - **squash the migrations and set up prod from the single baseline** (owner's decision, 2026-10-02: "Migration squash at launch" below), then put the Edge Functions on prod;
  - **set the GitHub Actions variables back to prod** (since 2026-09-30 they point the live site at **dev**, for testing 0.9.0-dev, then 0.9.1-final, 0.9.9-export, 0.9.9-day0 and 0.9.9.1-smoke, at the store; see `docs/SETUP.md` → Deploying);
  - finish `docs/SETUP.md`: run, deploy, the store password and backups are written; **restoring a paused project** is still to write;
  - the public `README.md` stays a very short description of the tool's purpose (owner's decision, 2026-09-29);
  - **push to `main` only when the owner says go**, then confirm the Pages deploy succeeded;
  - **clean up the work folder, last** (owner's decision, 2026-10-09), once the live site is confirmed on prod:
    - **list first, delete only what the owner approves**, and nothing the app or its tools still need (`node_modules`, `dist`, `.env.development` / `.env.production`, `supabase/.temp`, which links the CLI, and `scripts/db-test-run.*`, which re-checks the database after any later migration);
    - **in the project folder:** one-off reports (`BUGS.md` and `BUG_FIX_REPORT.md` were removed on 2026-10-11, `docs/EXPORT_BUILD_REPORT.md` on 2026-10-12), `docs/TEST.md` once the second smoke test is done, helper scripts made for a single job (`scripts/cc-report.mjs` was removed on 2026-10-12; `scripts/pokellector-jp.mjs` only if the Japanese names list won't be refreshed again), test files and CSVs, and anything `git status --short --ignored` shows that isn't on the keep list above;
    - **outside it:** the squash's safety copies (`dev-schema-before.sql`, `dev-run.json`, the dev backup file) once prod has been proved, and any PUG scratch files in `C:\ClaudeProjects\temp`;
    - **Claude's memory notes** for this project (`pug-pricing-tool.md` and its line in `MEMORY.md`, under `C:\Users\Daisy\.claude\projects\…\memory\`): cut down to what's still true after launch, or removed, as the owner prefers;
    - commit the removal of tracked files ("Launch clean-up"), and push it with the owner's go.

**Migration squash at launch** (owner's decision, 2026-10-02)

By launch dev will have had many migrations, each a small step, several rewriting the same function (0001–0035 on 2026-10-02, 0001–0051 on 2026-10-12, and **more may come before launch**). Prod is still empty, so it can start from **one baseline file** that builds the database as it stands in one go, and the old files are archived.

**The numbers:** below, **N** is the last migration applied to dev when the squash starts (`npx supabase migration list`), so the old files are **0001–N**, the baseline is **N+1** (`<N+1>_baseline.sql`, four digits like the rest), and the first migration after launch is **N+2**. On 2026-10-12 that would be 0001–0051, `0052_baseline.sql`, then 0053. Nothing about the app changes; only how the database is set up. Prod doubles as the test database for the baseline (the Free plan allows two projects, and prod is empty and not live until launch). The steps, in order:

1. **Freeze.** No new migrations from here until prod is set up. `npx supabase migration list` on dev shows every file applied, none pending, and the database test run passes every check on dev (`node scripts/db-test-run.mjs`; docs/TEST.md, section 18). Check `supabase/.temp/project-ref` is dev (`psucrzljraxeootwnltf`) before every `--linked` command, and prod (`zvxquzcfffmxwizonxuo`) when working on prod.
2. **Safety copies.** A git tag `pre-squash`; a backup file from dev (Settings → Download backup); dev's schema as it stands, `npx supabase db dump --linked -f <scratch>/dev-schema-before.sql`; and **a fresh dev test run** for prod to be compared with in step 7, `node scripts/db-test-run.mjs --save <scratch>/dev-run.json`, passing every check. It's made here, after the freeze, because every migration changes dev's fingerprints: a run saved earlier (like 2026-10-12's, after 0051) is out of date once another migration lands. All three kept outside the repo.
3. **Write the baseline** from dev: `npx supabase db dump --linked -f supabase/migrations/<N+1>_baseline.sql` (the `public` and `internal` schemas: tables, constraints, indexes, functions, triggers, RLS policies, grants; pass `--schema public,internal` if the dump leaves `internal` out). It replaces 0001–N.
4. **Add by hand what a dump leaves out**, each with a comment saying which old migration it came from. These were found by reading 0001–0035 on 2026-10-02; **read every migration added since the same way** and add anything of these kinds it brings (an extension, a storage bucket or policy, a table joining Realtime, a starting row, a grant):
   - `create extension if not exists pg_trgm with schema extensions;` at the top: the trigram indexes and the card and product searches need it (0001);
   - the private storage bucket `master-inventory` (50 MB per file) and its four `storage.objects` policies for the store's role (0002, 0023);
   - Realtime: `alter publication supabase_realtime add table` for `buys`, `buy_lines`, `collection_locks`, `staff_users`, `settings`, `master_inventory_files`, `api_usage` (0002) and `events` (0035), and `buy_lines` replica identity full if the dump didn't keep it;
   - the starting rows: `settings` `cash_pct` 33 and `credit_pct` 66 (0001), and `select public.cant_upload_ensure();` for the Can't upload cards collection (0028);
   - the grants: every function `revoke`d from `public, anon` and `grant`ed to `authenticated` as in the old files (a dump can drop or add Supabase's default grants). The database test run of 2026-10-12 found three that never were, `internal.customer_key`, `internal.customer_name` (0048) and `internal.import_lines` (0047): 0051 revoked them on dev, and the baseline must keep it so;
   - the `internal` schema (0040, smoke test 2026-10-02 #3): `create schema internal`, `revoke all on schema internal from public`, `grant usage on schema internal to authenticated, service_role`, its helper functions (13 in 0040, 17 by 0051), and every function's `search_path = public, internal` (security-definer ones `public, internal, pg_temp`);
   - remove anything in the dump that belongs to Supabase itself rather than this app, if applying it errors.
5. **Archive the old files.** Move 0001–N to `supabase/migrations-archive/` (the CLI doesn't read it), with a short README saying they're history only: never edited, never run.
6. **Apply the baseline to prod.** Link prod (`npx supabase link --project-ref zvxquzcfffmxwizonxuo`); confirm prod has no tables of its own; `npx supabase db push --dry-run` must list only `<N+1>_baseline.sql`; then `npx supabase db push`.
7. **Prove prod matches dev.** Dump both with the same command and compare them, and compare these lists from each (a SQL query run on both): tables and columns, constraints, indexes, functions and their arguments, triggers, RLS policies, grants on tables and functions, the Realtime table list, the storage bucket and its policies, extensions, and the starting rows. They must match, apart from order. The database test run does most of this and then works every server function (docs/TEST.md, section 18): on prod, `node scripts/db-test-run.mjs --confirm zvxquzcfffmxwizonxuo --compare <scratch>/dev-run.json` (the dev run saved in step 2). Every check must pass and every fingerprint read "same"; the storage bucket, extensions and starting rows are still checked by hand. If they don't: fix the baseline, empty prod (`npx supabase db reset --linked`, **on prod only, never on dev**), and apply again.
8. **Switch dev's record over.** Link dev again. Dev's database doesn't change; only its list of applied migrations: `npx supabase migration repair --status reverted 0001 0002 … N` (every old number), then `npx supabase migration repair --status applied <N+1>`. `npx supabase migration list` must show `<N+1>` applied on both sides and nothing else; `db push --dry-run` on dev must say it's up to date; and `node scripts/db-test-run.mjs --compare <scratch>/dev-run.json` on dev still passes, every fingerprint "same" (the repair only changes the record).
9. **Commit** the baseline, the archive move and these notes. From then on new migrations are numbered from N+2 and go to dev first, then prod, as before, and **after each one the database test run**: on dev (`--save` a fresh run), then, once the migration is on prod, on prod (`--confirm zvxquzcfffmxwizonxuo --compare` that run), at a time the store isn't using the app (the restore test holds its tables for a few seconds).
10. **Carry on with launch**: the Edge Functions on prod, the GitHub Actions variables back to prod, the push, and last the clean-up of the work folder (above).

**If something goes wrong:** prod is empty and not live, so it can always be reset and tried again. Dev's data is never touched by the squash; if its migration record ends up wrong, `migration repair` puts it back, and the files come back from the `pre-squash` tag.

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
- [ ] After the clean-up: the project folder has no one-off reports, scripts or test files left, the app still builds and runs (`start.bat`), and Claude's memory notes for it are trimmed or gone, as agreed.
- [ ] The database test run on prod (step 7): every check passes and every fingerprint reads "same" as the dev run saved in step 2; then on dev again (step 8), still the same.
- [ ] After the squash: `supabase/migrations/` holds just the baseline (`<N+1>_baseline.sql`), the old files are in `supabase/migrations-archive/`, and on prod everything works from a clean start: name the computer, add a user, confirm a buy, create a collection and a project, upload the inventory, and Can't upload cards is in the System table.

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
| 183 | "No. 32" for the oldest Japanese cards (2026-10-01) | With JP on, a search that is just "No." and a number finds that Pokédex number in the first ten Japanese sets, which print no collector number (Section 5.2) |
| 184 | Pokellector pictures for the oldest Japanese sets (2026-10-01) | The first ten Japanese sets' card pictures come from Pokellector, through a list read once from its set pages (Section 5.2) |
| 185 | Projects, and three tables (2026-10-01) | **+ Start Project**: a collection of the store's own cards, just a name and notes, Paid/Ours (and editable) until EXPORT; the Collections tab splits into System, Projects and Collections tables (Section 9.1a; migration 0031) |
| 186 | Search results coloured by what they are (2026-10-01) | In the header search, a buy's panel takes its game's colour (Magic indigo, Pokémon amber) instead of its user's, and a collection's its kind's (System violet, Projects pink, Collections cyan) instead of its status's (migration 0032: `global_search` returns `collection_kind`) (Section 13) |
| 187 | "Ours" for System and Projects (2026-10-01) | Can't upload cards' and a project's Paid/Ours chip reads **Ours**, in white (tables, details, search results); the status is still `paid` and behaves as Paid/Ours everywhere (Section 9.1a) |
| 188 | JP is Pokémon only (2026-10-01) | With JP on, the MTG \| PKM toggle shows PKM only and MTG is greyed out ("Japanese is Pokémon only: switch to EN to search Magic"); switching back to EN restores the games as they were; editing a Magic line from the list switches to EN (Section 8.2) |
| 189 | REPRICE? (2026-10-01) | A smaller button beside a collection's EXPORT reprices every card's buy price at today's prices, worked out as it was priced and rounded down; manual prices stay (Section 9.1b; migration 0033) |
| 190 | Home tab, and "Buy" (2026-10-01) | A new first tab, **Home**, is where the app opens and where the logo goes: days to export (past Magic days not exported, oldest first), Can't upload cards waiting, collections by step and open projects (with their oldest price's age), quick actions, today's buys and paid out, and the latest changelog lines; a warning when JustTCG's day is 80% used. It's **half the page wide, centered, and never scrolls** (owner, 2026-10-01), each section a panel of its own (no outer box), as tall as the space below the header (up to 900px), laid out (owner, 2026-10-01): **Today** beside the 2×2 **quick actions** on top; **Collections and projects** in the middle; then, taking the spare height, **Days to export** (every waiting day, then as many dimmed **Recently exported** days, with their Custom SKU, as fit) beside a column of a compact **Can't upload cards** (its count, oldest date and first 2 cards) over **Recent activity** (as many entries as fit); every panel with the same bold heading, which shows as many days as fit; the other lists show their first few (collections 3, owner 2026-10-02; activity 5); each ends in "+N more" when there are more. The Price tab is renamed **Buy** (its address stays `/price`) |
| 191 | Buy screen on smaller windows (2026-10-01) | The condition prices span the bottom two grid rows and Finish & Details the middle two, so the QTY / ADD CARD row is only its own height and the prices never squeeze Finish & Details; on windows up to 820px tall the info row, finish control, action row and gaps shrink and the suggestions are one row of 5 (bigger); on windows up to 1500px wide the card and side columns are slimmer; Finish & Details scroll as a whole, with a visible scrollbar, rather than hiding Details (Section 8.1) |
| 192 | Squash the migrations at launch (2026-10-02) | Before prod is set up, however many migrations there are by then (0001–N) are replaced by one baseline file (`<N+1>_baseline.sql`) made from dev, with the pieces a dump leaves out added by hand; it's proved on the still-empty prod against dev, dev's migration record is repaired to match, and the old files are archived (Phase 10, "Migration squash at launch") |
| 193 | The changelog live (2026-10-02) | `events` joins the Realtime publication (migration 0035), so Home's Recent activity updates the moment something happens; the Changelog tab itself still loads its pages on demand |
| 194 | "TCGplayer" where a price is TCGplayer's (2026-10-02) | Scryfall's `usd` prices (and TCGdex's) are TCGplayer's **Market Price** (not Low or Mid; Scryfall's FAQ). **Use Fallback is renamed Use TCGplayer.** A price that *is* TCGplayer's Market Price (through Scryfall / TCGdex, its condition at 100%, not capped) is tagged **TCGplayer** on its button and in the price panel; when every price comes from TCGplayer (Use TCGplayer on, or JustTCG has none) **every condition** reads **TCGplayer**, as an all-Cardmarket ladder reads **CM**; when JustTCG and TCGplayer prices are mixed, a price worked out as a percentage, or capped, stays **fallback** (Cardmarket's **CM**), and its tooltip names the base ("TCGplayer's $0.98 (via Scryfall) × 90%"). The Master Fallback Percentages keep their name. Internal names unchanged |
| 195 | EN \| JP not remembered; a JP search tip (2026-10-02) | EN \| JP starts on EN on every screen; with JP on, the search field's sample text shows how to search Japanese cards (number and set code, "No. 32" for the oldest sets) (Section 8.2) |
| 196 | v0.9.9-day0 pushed (2026-10-02) | Everything since 0.9.9-export's patches goes live as 0.9.9-day0 (tagged `v0.9.9-day0`), still built against the **dev** project (migrations through 0035 already on dev); prod launch still waits (Section 15, Phase 10) |
| 197 | One buy: Mark as completed, Convert to project (2026-10-02) | A day page buy's ⋯ can mark its cards Completed without exporting them (out of the search and the day's export; reversible from the same menu), or turn the whole buy into a new Paid/Ours project with the same cards and delete the buy (Section 10.2; migration 0036) |
| 198 | Export Cash Buys (2026-10-02) | A green **Export Cash Buys (n)** at the right of the Calendar's heading downloads `cash-buys-<month>.csv` for records and taxes: walk-in buys confirmed that month and paid in cash, and collections and projects marked Paid/Ours in cash that month (by the day paid; Completed ones too), oldest first. Columns: User bought (a collection's: whoever last marked it Paid/Ours, else its maker), Date bought, Customer, Phone, Type (Walk-in buy / Collection / Project), Market price (the buy prices), Paid in cash. Each download is logged (Changelog → Buys, "Cash buys downloaded"); a finished month with cash buys and no download gets a reminder banner under the heading, on that month only (owner, 2026-10-02). Convert to project keeps the buy's phone and its user as the project's maker (migration 0037) so the file stays right |
| 199 | EXPORT (n) on Magic days (2026-10-02) | A Magic day page's EXPORT reads **EXPORT (n)**: the number of cards the export will take (quantities added up), so the real pile can be counted against it first; once the whole day is Completed, every Magic card that day |
| 200 | COMPLETE on Pokémon days (2026-10-02) | Pokémon can't be exported yet, so a Pokémon day page has **COMPLETE (n)** where EXPORT was: after a confirm, `day_complete` (migration 0038) marks the day's Paid/Ours Pokémon buys Completed with no export (locked, out of the header search), only once the day is over, like EXPORT; ⋯ → Mark Paid/Ours again undoes it. The day shows "Completed … , not exported", and the Calendar marks such a day **Completed** in the Exported chip's place and colour (`buys_in_range` now also returns `exported_games`). Logged as "Day completed" |
| 201 | Changelog categories: cards in or out (2026-10-02) | **Buys** and **Collections** show only entries that bring cards in or take them out (a buy confirmed, cards removed, a buy deleted or converted to a project; cards added to or removed from a collection, a collection deleted, Can't upload cards in and out). A collection made is **Collections** too (it shows the cards it starts with). A buy converted to a project is **Buys** (owner, 2026-10-02): one entry on the project, the cards added (migration 0039). Everything else is **Actions**: status changes, card edits, repricing, days exported / put back / completed, a buy marked Completed or back, Cash buys downloads (Section 12.4; replaces "status changes are Collections") |
| 202 | 📞 calls on Priced collections (2026-10-02) | A Priced collection's details show **📞 (n)** after the phone: clicking it after calling the customer adds a Changelog entry (Actions, "Customer called": "Called Jordan Reyes about their collection (offer $120 cash / $160 credit)."), and n is that collection's calls; hovering lists when and by whom. Nothing is stored on the collection: the entries are the record, and the chip shows only while Priced |
| 203 | Smoke-test fixes (2026-10-02) | The pre-launch smoke test's 13 findings (BUGS.md, BUG_FIX_REPORT.md; both removed 2026-10-11, in git history): on short windows Home keeps a waiting day and Recent activity (a slimmer band, Can't upload cards as one line; laptop-sized screens only, at most 1440px wide, so a 1080p screen keeps the full-size Home, owner 2026-10-02); Recently exported counts only exported days; Home reloads when the store's day changes; the search bar's sample card is a real printing (Lightning Bolt 117/331 2X2); clearer Convert wording; one-line ⋯ menus; a MONTH chip for Cash buys downloads. Database (migration 0040): the 13 internal helpers move to an `internal` schema the API doesn't serve, every function gets `search_path = public, internal`, `buys_in_range` is signed-in only, `day_mark` is dropped |
| 204 | v0.9.9.1-smoke pushed (2026-10-02) | Everything since 0.9.9-day0 goes live as 0.9.9.1-smoke (tagged `v0.9.9.1-smoke`): the buy ⋯ actions, Export Cash Buys, Pokémon COMPLETE, the 📞 call chip, the Changelog categories, the Home band, and the smoke-test fixes; still built against the **dev** project (migrations through 0040 already on dev); prod launch still waits (Section 15, Phase 10) |
| 205 | Home wider (2026-10-02) | Home's panels fill the coloured band up to 1100px wide (were half the page, at least 640px), so their lines aren't cut short on bigger screens |
| 206 | Pokémon cards TCGdex doesn't list (2026-10-09) | An English Pokémon search TCGdex finds nothing for asks TCGplayer's catalogue (JustTCG) and shows its cards as suggestions; a TCGdex card's TCGplayer-only products (Cosmos Holo, stamped…) are extra versions. Both kept by the server like prices (Section 5.2, "Pokémon cards TCGdex doesn't list") |
| 207 | Names that end in a number (2026-10-09) | The parser takes a name's last word for a collector number or code when it looks like one: 43 English Pokémon cards ("Energy Removal 2", the "Cube 01" and "Technical Machine 01" cards, the 21 "E4" cards, "Espeon ★") and 13 Magic names ("Spider-Man 2099", "Pyromancy 101", "Naturalize 2"). Now (1) when the whole line is exactly a card name in a game being searched (the typo correction's name lists, if loaded within 1.5s), it's searched as that name; the full name wins over a number ("Naturalize 2" is that card; Naturalize #2 needs its set code); (2) when the number reading finds nothing, the whole line is tried as the name, after the guessed-set-code retry, before TCGplayer's catalogue (which then searches the line as typed) |
| 208 | Black Bolt's printed size (2026-10-09) | TCGdex gives Japanese Black Bolt (SV11B) 174 as its printed size; its cards print "/086" like White Flare (SV11W). With the size corrected in the app (`OFFICIAL_FIXES`, tcgdex.js), "115/086" finds both sets' #115 and no longer jumps to White Flare's; "115/086 SV11B" still picks Black Bolt's. The other modern Japanese sets whose printed and total counts match were checked: their printed sizes are right (TCGdex seems to lack their secret rares, a separate gap) |
| 209 | Export single buy (2026-10-09) | A Magic day page's buy ⋯ has **Export single buy…**: the export dialog for that buy's Magic cards alone (`export_lines` target `buy`, migration 0041), any day including today (a buy is whole once confirmed; the day's EXPORT still waits for the day). The file is `cc-mass-create-magic-<day>-buy-<n>.csv` with the day's Custom SKU; like Mark as completed, only that buy is Completed and the day's EXPORT skips it. An exported buy's ⋯ → **Mark Paid/Ours again…** (after asking) undoes its export alone (`buy_unexport`): stamps cleared, its cards taken back out of Can't upload cards; the day's own Mark Paid/Ours again still undoes the whole day. Logged as "Buy exported" / "Buy export undone" (Actions) |
| 210 | COMPLETE works out Sell Prices (2026-10-09) | COMPLETE on a Pokémon day page first fetches today's prices and works out each card's Sell Price as the export does (sellPrice.js: today's price for its condition on the same ladder and override, rounded up, never under $0.40, a manual price kept if higher); `day_complete` keeps them (`cc_sell_price`, `cc_sell_basis`; migration 0042) and the day page shows them in green, as after an export. Without today's prices nothing is completed. Mark Paid/Ours again (the day's, or a buy's) clears them |
| 211 | Rejected collections (2026-10-09) | A customer collection can end **Rejected**, from Processing or Priced (not Paid/Ours, Completed or a project): the customer said no. Asked from the status dropdown, with an optional reason (kept on the collection, shown in its banner, and in the Changelog). It's kept, with its prices, offer and rates (snapshotted like Paid/Ours, migration 0044), until it's deleted; locked like Completed (no adding, editing or removing cards, no detail edits, no REPRICE?, no EXPORT) and left out of the header search unless Show all, faded. Its own filter chip on the Collections table; left off the home page. Reopen takes it back to Priced (its offer stands) or Processing (if it never had one). Migration 0043 |
| 212 | Last 4 ID required; Ctrl+click Create (2026-10-09) | + Price Collection needs the name, a 10-digit phone and the Last 4 ID; Create looks disabled until they're in, and a click shows what's missing. **Ctrl+click** on Create (an admin shortcut, deliberately not explained on screen) creates it without the phone, the ID or both; the name is always needed, and a part-typed phone still has to be finished or cleared. So the database allows a collection with no phone (migration 0045: the check needs only the name, `collection_create` takes a missing phone; one given must be 10 digits). The details show "none" for a missing phone; one can be added later |
| 213 | Full-art holo, once more (2026-10-09) | A full-art Pokémon card always gets the whole-card shine, whatever finish TCGdex lists (it lists BW, XY and SM full arts, BW secret rares and Hidden Fates' Shiny Vault as non-holo, which showed no shine). Full art (`isFullArt`, pokemonFrames.js): by rarity (TCGdex's English and Japanese names, now with Shiny rare, Amazing Rare, Radiant Rare, ACE SPEC Rare, and TCGplayer's for JustTCG-only cards); by a TG, GG, SV or RC number; or, from Black & White on, by a number past the set's printed count (a secret rare: TCGdex leaves many Japanese ones without a rarity, e.g. S9a, SV9). Promo sets don't count. Checked against TCGdex: every non-promo set since 2011, three cards past the count each |
| 214 | Classic Collection frames; TCGplayer cards shine whole (2026-10-09) | Celebrations' Classic Collection (TCGdex cel25cc) reprints keep their originals' frames, so each takes its original's era for the holo mask (`classicFrame`, pokemonFrames.js), not 2021's; Reshiram and Zekrom (BW 113/114, 114/114) are full art. A card found through TCGplayer (a JustTCG card TCGdex lacks, e.g. Nidorina 101 MEP) has no frame known to fit a mask to: holo or reverse holo shines across the whole card; a Normal printing stays plain. A TCGplayer-only version of a TCGdex card (Gengar's Cosmos Holo) keeps its card's mask (owner: it was right) |
| 215 | Export condition words (2026-10-09) | The Mass Create file's Condition column uses the store inventory's words, `Near Mint`, `Lightly Played`, `Moderately Played`, `Heavily Played`, `Damaged`: CC matches them exactly, and the help page's `Light Play`… left the non-Near Mint rows of a test upload un-updated (CC's admin). `cc_condition_word` and massCreate.js changed; stamps already made were rewritten (migration 0046), so a re-download uses them too |
| 216 | Import Collection (2026-10-09) | **Import Collection** (Collections header, outlined: the + buttons' colours reversed) takes a Mass Create CSV, the store CardBot's or our own EXPORT's (`Add Qty, Product Name, Category, Condition, Language, Sell Price`; Custom SKU optional), and makes a **new project** of it, Magic only. The export's matching runs in reverse (`importMatch.js`, `importCollection.js`): the file's Category → the Scryfall sets that export to it (`categoryFor` run for every set, staff's set choices included) → the printings with the product's name (or, after a Universes Beyond flavor name, its card name), scored on the Product Name's evidence (a bracketed number must match; a set-code bracket is the number's prefix; the foil kind gives the finish and any special foil; each variant the printing has and the name doesn't costs, and the other way) → one clear printing (alone, or 2 points ahead) is matched, the rest go to a review like EXPORT's (pick a printing, search for one, or skip the row). A name not found in its category's sets is looked up in every set and marked so. A row matched before by staff (`import_links`, by the file's name and category) or whose exact inventory product the export already links to one printing matches straight away; staff's picks are remembered both ways. Each card's price is the file's Sell Price (`price_source = 'import'`, so REPRICE? and the export's Sell Price treat it as any priced card); conditions read either way (Lightly Played or Light Play); non-English rows and bad rows are listed and skipped. Then the project's name, filled in from the file's ("CardBot import Sep 28, 2026"). **A CSV dropped on an empty collection or project** (no cards at all, editable on this computer) imports into it the same way; anything else says why. The server refuses a collection with cards (`not_empty`). One changelog entry, *Cards imported*, with every card (Collections). Scryfall searches go at most two a second, queries kept under 1,000 characters. Migration 0047 |
| 217 | Import Collection: TCGplayer format (2026-10-09) | Import Collection (and the drop on an empty collection) also takes CardBot's **TCGplayer-format** file, told apart by its header (`TCGplayer Id, Condition, Add to Quantity, TCG Marketplace Price`): each row is a **TCGplayer SKU**, one condition and printing of a product. Each SKU is looked up on JustTCG through the `prices` function (`tcgplayerSkuId` lookups, 200 a call, cached like prices), which names the card, its set and the SKU's exact version (Normal → non-foil, Foil, Etched); its Scryfall printing is JustTCG's Scryfall ID, else Scryfall's card for the TCGplayer product (`/cards/tcgplayer/:id`). Matched straight away (*by SKU*); a SKU JustTCG doesn't know, or a product Scryfall doesn't, goes to the review (the card's printings by name, a search, or skip). A blank price takes TCGplayer's market price for the SKU, marked so. Staff's picks are remembered by SKU. On the owner's file: all 187 SKUs known to JustTCG. Scryfall's `/cards/collection` batches (Import and the export's Sell Prices) now wait 0.55 s between requests and honour a 429's Retry-After |
| 218 | Faster Scryfall for TCGplayer imports (2026-10-09) | Scryfall's limits (scryfall.com/docs/api/rate-limits): `/cards/search`, `/cards/named`, `/cards/random`, `/cards/collection` 2 a second; everything else 10 a second; a 429 locks the app out for 30 seconds. A TCGplayer-format import now finds printings JustTCG has no Scryfall ID for by set and collector number first (the set from TCGplayer's set name, a promo pack's number with its `p`), 75 a request, each kept only if Scryfall's TCGplayer product is the SKU's; the rest (mostly The List reprints) by product, `/cards/tcgplayer/:id`, started 120 ms apart with up to six at once (`cardsByTcgplayerIds`), all held 31 s on a 429. On the owner's file: 68 one-by-one lookups became 2 batch requests and 17 lookups. `/cards/collection` keeps 0.55 s between requests |
| 219 | TCGdex rate limits checked (2026-10-09) | TCGdex publishes no hard limit ("please be considerate") and sends no rate-limit headers. Every TCGdex call goes through one queue, requests at least 100 ms apart, so nothing (fast typing included: superseded searches are dropped) goes over 10 a second. A load test of the app's worst case, a fresh computer's background set fill (every English and Japanese set) with 30 typed searches mixed in, 436 requests at 7.7 a second: all 200, none limited. Safety net: after a 429 a queue (TCGdex's or Scryfall's) spaces requests five times wider (at least 0.5 s) for a minute, and a search that ran into one says the source asked for fewer searches instead of "didn't respond" |
| 220 | Clean-up at launch (2026-10-09) | The last launch step, once the live site is confirmed on prod: clean the work folder of temporary files (one-off reports, single-job scripts, test files and CSVs, the squash's safety copies, PUG scratch in `C:\ClaudeProjects\temp`) and Claude's memory notes for the project (trimmed or removed). Listed first; only what the owner approves is deleted; nothing the app or its tools need (Phase 10, Launch) |
| 221 | Help (2026-10-09) | A **?** in the header, beside the user's sign-out icon (always shown), opens **Help** (`#/help`, no tab of its own). Two panels: a small contents panel on the left (every chapter; the current one open with its pages) and the page on the right, its text beside its pictures, with ‹ previous and next › at its foot; each scrolls inside itself. The text **is README.md**, read at build time (`?raw`) and split into pages (`src/lib/help.js`): `src/pages/help/pages.js` names each page's first heading, title and pictures, and a page runs to the next one's start, so the README stays the one source and a new README section joins the page before it (`tests/help.test.js` checks the starts, their order, the links and the pictures). Pages are sized to about fit one screen; pictures share the screen's height and open full size on a click. The pictures (`public/help/*.webp`, 49, 2.7 MB) are the training deck's screenshots, clean (no numbered markers), cropped, with customer names and phone numbers that might be real blurred (`pug-training/build/help-images.py` remakes them). README links (`#how-prices-are-worked-out`) open their page at that heading |
| 222 | About the app (2026-10-09) | Help opens on a new first chapter, **About the app** (README `# About the app`), in this order: **Preamble** (AI tools helped write the code, no tool named; the app makes no AI calls and no AI produces any name or number in it: data comes from the sources, and what the app works out follows fixed written rules; how the data stays stable; PUG does not endorse the use of AI; then the owner's screenshot, captioned "From Claude Code", `public/help/from-claude-code.webp`, a `<figure>` in the README that Help shows under the text and shows 360 px wide, so the page fits the screen, and enlarges on a click), **JustTCG** (its website and FAQ summarized as read on 2026-10-09: sources and blending, 6-hour updates, plans and limits, licence, support; then how the store uses it) and **Other Sources** (every other source in Settings' credits: what it is and what the app uses it for; only card searches and IDs go to them, nothing about customers). The README's opening sections now sit under `# Getting started` |
| 223 | Past customers (2026-10-09) | A `customers` table (migration 0048) keeps every customer name used on a confirmed walk-in buy or a customer collection (not projects or Can't upload cards), one row per name (trimmed, single spaces, case ignored), with the phone number most recently recorded with it and when it was last used. No ID numbers: the Last 4 ID stays on its collection only and is never suggested or filled in. A trigger on `buys` keeps it current from every path (CONFIRM BUY, `collection_create`, a collection's name or phone edited, a restore): the newer record's spelling and phone win, a record with no phone never clears one, a collection's status change or rename alone doesn't re-record its phone, and the trigger can never stop the buy itself. Backfilled from the buys on file. Deleting a buy or collection keeps its customer; `restore_backup` clears the table and the restored buys rebuild it. The browser reads it only. **CONFIRM BUY's Customer name and + Price Collection's Name** suggest past customers after two letters (`CustomerNameInput`, `lib/customers.js`): names starting with what's typed, then a word starting with it, then containing it, newest first, 8 at most, each with its phone. ↓/↑ and Enter or a click pick one, filling in the name and the phone (both still editable; a new number is kept next time); Esc closes the list, not the dialog. A collection's name edited in its details doesn't suggest |
| 224 | Japanese prices from JustTCG (2026-10-10, high priority) | JustTCG's Japanese Pokémon are their own game again, `pokemon-japan`: `pokemon` with language=Japanese now finds only English sets with no Japanese listings, so every Japanese card priced by name and number got no JustTCG price (all 40 such lookups on dev since 2026-09-29 were "no match", remembered 7 days; cards priced by a TCGplayer product ID were right). The `prices` function now searches `pokemon-japan` for Japanese lookups and set codes (set map key `pokemon-japan:set:<code>`); several matches with one number (a Japanese card's Poké Ball / Master Ball Pattern versions) go to the one named exactly as asked (JustTCG's " - 021/088" name suffix ignored); the ten oldest Japanese sets (PMCG1–6, neo1–4), which JustTCG lists unnumbered ("N/A"), match by exact name within their JustTCG set (`OLD_JA_SETS`). The English name sent for a Japanese card keeps a trainer's or Dark / Light / Shining prefix (`pokemonNames.js` PREFIXES: カスミの → Misty's, R団の → Rocket's, わるい / 暗い → Dark…), as TCGplayer names them. Migration 0049 forgets the wrong "no match" answers. Replayed on dev's failed cards: SV2a Charizard ex, SM10 Blacephalon, E2 Umbreon, M3 Spewpa, neo1 Slowking, PMCG5 Rocket's Hitmonchan and neo4 Dark Typhlosion all match |
| 225 | Poké Ball and Master Ball patterns (2026-10-10) | A card's Poké Ball pattern is never pricier than its Master Ball pattern (owner). TCGdex sometimes crosses the two patterns' products (8 of 39 Japanese SV2a cards checked; SV2a Starmie: Poké Ball €9.11, Master Ball €0.92 on Cardmarket, while TCGplayer has $0.74 and $8.60), so `uncrossPatterns` (printings.js) swaps a pair that's the wrong way round, for the Cardmarket price and TCGplayer's market price. A Japanese pattern version with no TCGplayer ID is priced from its own JustTCG product, "<card> (Poke Ball Pattern)" / "(Master Ball Pattern)": its lookup (`pokemon:ja:<tcgdex id>:pokeball`, `patternOf` the card's) is read off the card's own search in the same call, or searched by that name when the card's price was already cached; that product is the version, so its printings count as the version's finish |
| 226 | "No." search finds trainers' and Dark cards (2026-10-10) | A Japanese "No. 121" search shows TCGdex's cards with that Pokédex number in its ten oldest sets (as before), then the same Pokémon's other old cards from TCGplayer through JustTCG, marked From TCGplayer: a trainer's Pokémon, a Dark / Light / Shining one, and cards from the decks and promos TCGdex doesn't list (Misty's Starmie from City Gym Decks, Flying Pikachu, Vending Machine cards). The `prices` function's `dex` search asks pokemon-japan for the species' English name among unnumbered cards (one request for most Pokémon, three pages at most) and keeps only cards from **the sets that print the Pokédex number** (`NO_NUMBER_SETS`: 1996 until the e-series, December 2001, and that era's unnumbered promos; Pokémon VS, Web and the P/J promos are numbered, Battle Road and Gym Challenge are 2003+, "Japanese CD Promo" is dated 2025 by JustTCG and left out), whose names end in the species; so newer cards of the same Pokémon never appear. A card TCGdex already found (same English name, same set: `TCGDEX_SET_FOR`) is dropped. Such a card shows as "No. 121", takes its TCGplayer picture and its Japanese printings as versions, and its saved line is found again by its "No." search (EDIT CARD). Asked once the search stays put 600 ms; cached like other searches |
| 227 | Projects round up (2026-10-10) | A project's prices round **up** by the store's steps, like an export's Sell Price (owner: a project is always the store's own cards, priced to sell). Applies on the project's Price screen (the ladder, its tooltips, Use TCGplayer / Use Cardmarket) and to its REPRICE?. Two conditions still never show one price, compared rounded up. Customer collections and walk-in buys still round down; Cash / Credit payouts always round down. Existing project prices change only when edited or repriced; imports keep the file's prices; no $0.40 floor (that stays the export's) |
| 228 | Convert to buy (2026-10-10) | A project's ⋯ menu has **Convert to buy…** above Delete (projects only), the way back from Convert to project: CONFIRM BUY's dialog (customer name with past-customer suggestions, phone, Cash/Credit and price paid, notes; all but notes required), starting from what the project has (a project made from a buy kept its phone, price paid and notes, and its name started as the customer's; a fresh project starts empty except its notes). Every card, both games, moves at its current price to a new walk-in buy confirmed now by the user, on today's day page; custom rates stay custom, else the rates the project showed; the project is deleted and the app opens the day page. Blocked while another computer edits it, when Completed (exported) or empty. One Changelog entry under Buys, *Project converted to buy* (`project_converted`, a landmark), on the new buy. `project_to_buy` (migration 0050) |
| 229 | Only Near Mint is priced in the Mass Create file (2026-10-11) | CC prices every condition from Near Mint, so only NM rows carry a Sell Price; worse-condition rows leave it blank. A product with worse-condition cards and no NM card in the file gets a 0-quantity NM row priced at the best worse condition's Sell Price ÷ its Master Fallback Percentage, rounded up, at least $0.40 (MP $87 at 80% → $110). Every export (a day, a single buy, a collection or project, Can't upload cards) and every download again. The percentage is stamped in `cc_sell_basis.conditionPct`. Review shows *sets NM $X* (`EXPORT_FUNCTION.md` 4.2) |
| 230 | Import reads Near-Mint-only files (2026-10-11) | Import Collection reads our own export again (decision 229): a 0-quantity row adds no card and is left out quietly; a row with no Sell Price gets its product's Near Mint price in the file (the last one, as CC would end up with) × its condition's Master Fallback Percentage, shown *(from NM)* (MP at $110 NM, 80% → $88). With no NM price in the file it waits for its printing: TCGplayer's Market Price for the finish (through Scryfall) × the condition's percentage, shown *(TCGplayer's)*; a printing with no price blocks the import until the row is skipped or another printing picked. A Sell Price that isn't a number is a problem (Can't import) |
| 231 | Forget the user (2026-10-11) | Too easy to work as someone else, but no passwords (owner). The picked user is kept per tab (`sessionStorage`), not per computer: every new tab starts on **Pick user**; a reload keeps the pick. It's forgotten after each CONFIRM BUY (the toast says to pick a user for the next one) and after 30 minutes (owner, first 10) with no mouse, keyboard or touch in that tab (checked every 30 seconds and when the tab comes back into view; a toast says why). The old per-computer copy is cleared. Anything that changes data then pulses the user button as before |
| 232 | ⋯ on the Collections tab (2026-10-11) | Each table on the Collections tab ends with a ⋯ column: the menu a collection's details have, without opening it. **Delete collection…** on every collection and project, **Convert to buy…** on projects; Can't upload cards has none. The same dialogs and checks as inside (the collection and its cards load first); blocked offline, while it's open on another computer ("Front Counter (Dana) is editing it: open it and take over first"), and Convert when Completed or empty. The menu floats over the page (the table clips what spills out) and closes on scroll |
| 233 | No auto-select (2026-10-11) | A search that narrows to one printing no longer selects it (owner: it got in the way more than it helped). It fired on half-typed searches (the card jumped in, loaded prices, then cleared), let Enter add a card nobody picked, and re-selected after a deselect. Now nothing is selected until she clicks or presses ↓; ↓ then Enter adds the first result. A selection still stays while it's among the new results, and an edited line's search still selects its own card (Section 8.3) |
| 234 | Printings TCGdex misses (2026-10-11) | The TCGplayer siblings search (decision 206's backfill, run for every English Pokémon card selected) also reads the card's own product: each printing JustTCG lists for it whose finish (and 1st Edition) TCGdex's versions lack becomes a version, tagged **TCGplayer** ("TCGdex doesn't list this printing: TCGplayer does"), priced from that product's prices, already fetched, so no extra request. XY Staryu 33/146: TCGdex says Normal only; TCGplayer sells a Reverse Holofoil of product 89554 → a REVERSE button. Before, the own product was skipped whole as "the card TCGdex already has". Saved like any TCGplayer-only version (`jt:` version id) |
| 235 | No jumbo cards; one stamped version (2026-10-11) | Mimikyu ex 069 (Journey Together) listed "Journey Together Stamped · TCGplayer" twice. (1) TCGplayer products that are oversized (a set or name with "Jumbo" or "Oversized", TCGplayer's "Jumbo Cards") are left out, as TCGdex's jumbo variants already were: singles only (1.4). World Championship deck cards (TCGplayer's "World Championship Decks", or a name with "World Championship(s) Deck") are left out the same way (owner, 2026-10-11); a World Championships promo stamp stays. (2) A stamped version TCGdex gives no TCGplayer product (its "Set logo stamp") and TCGplayer's one "Stamped" product of the same finish are the same card: TCGdex's version keeps its id and stamp, takes that product (its prices: $3.98, not the plain card's $1.92 it was priced at) and TCGplayer's name, and the product isn't listed again. Two or more of either: nothing is matched. A saved line keeps the product (`tcgplayer_id`), so REPRICE? and the export price it the same way |
| 236 | Prize Pack = "Play! Pokémon stamp" (2026-10-11) | TCGplayer files Prize Pack reprints in its own "Prize Pack Series Cards" set with no name of their own, so the version read "Prize Pack Series Cards". It now reads **Play! Pokémon stamp** (owner's wording; the buy line's tag too), the stamp they carry. As a stamp it can match TCGdex's one stamped version without a TCGplayer product (decision 235); TCGdex doesn't seem to list Prize Pack printings today. Lines saved before keep their old tag |
| 237 | Play! Pokémon logo on the card (2026-10-11) | With the Play! Pokémon stamp version picked, the selected card shows the Play! Pokémon logo (the owner's image, `public/play-pokemon.webp`) where a Poké Ball / Master Ball pattern's badge goes (bottom right, 15% of the card's width, its own proportions), on any finish |
| 238 | Pokémon Center stamp (2026-10-11) | TCGdex's `pokemon-center` stamp (Snorlax SVP 051) read "Pokemon Center stamp": it's **Pokémon Center stamp**, and any other stamp TCGdex names with "pokemon" gets its é. With that version picked (or a TCGplayer product named for the Pokémon Center), the selected card shows the Pokémon Center emblem, cut from the owner's logo (round, the ™ and wordmark left off; `public/pokemon-center.webp`), where the ball badges go |
| 239 | SV-era promos shine whole (2026-10-11) | From Scarlet & Violet's release (2023-03-31; its ETB promo, Koraidon / Miraidon SVP 013–014, was the first in the illustration-rare frame) a **holo** with TCGdex's "Promo" rarity shines across the whole card, no art-window mask (`isFullPromo`, by the set's release date; English SVP is dated 2023-03-31, Mega promos later). Reverse holos keep their mask. Every such promo, including the regular-frame ones (Sprigatito SVP 001, a stamped Tinkaton SVP 020). Japanese SV-P is dated 2022-11-29 on TCGdex, so it keeps the mask |
| 240 | Trainer masks (2026-10-11) | Super Rod (Paldea Evolved 188) had a Pokémon's art-window mask: a Trainer's art window sits lower and runs taller, under the name. Measured like the Pokémon masks (each edge the strongest straight line, the median of 24 Items, Supporters, Stadiums and Tools per era): 2017 era 7.83–91.83% across, 2023 era 8–92.5% across, both 14.18–56.12% down. A TCGdex card with category Trainer gets `.trainer` on its shine (price.css `.era-2017.trainer`, `.era-2023.trainer`); other eras' Trainers keep the Pokémon mask until measured. Full-art trainers still shine whole |
| 241 | Vintage Japanese TCGplayer cards keep a mask (2026-10-11) | A card known only from TCGplayer shines across the whole card (no frame known), except the oldest Japanese cards a "No." search finds (number "No. N", 1996–2001): they're the vintage frame, so they get the 1999 art-window mask, which fits TCGplayer's scans (Neo Premium File 1 Typhlosion No. 157, checked against Neo Genesis Typhlosion) |
| 242 | Smoke test P2 fixes (2026-10-11) | From the second smoke test (docs/TEST.md): (F3) Enter, or Qty's Enter, says why nothing was added instead of doing nothing ("Select a card first: ↓ picks the first suggestion" when there are suggestions, "Waiting for prices", and so on); (F6) a TCGdex version whose TCGplayer product is a World Championship deck card (TCGdex names them as stamps after the player: Pidgeot ex6-10's "Hiroki Yano stamp"…) is left out once the TCGplayer search answers, like those products; (F7) the default version is always one of TCGdex's own when TCGdex lists the card, never a TCGplayer-only product (Pikachu SVP 027 opened on a $97 "Baby" normal instead of its $18 holo) |
| 243 | Smoke test P3 fixes (2026-10-12) | From docs/TEST.md (F5, a name for TCGplayer's "League & Championship Cards", not needed): (F1) Home's + Start Project / + Price Collection need a user, like the Collections tab's; (F2) a picture in Help's text (the Preamble's) sits in the empty space beside the 760px column, at the bottom, on screens 1280px wide or more, and Help's header, footer and page padding are a little tighter on windows 820px tall or less, so the Preamble fits 1366×768; (F4) TCGplayer's "None" rarity is no rarity; (F8) REPRICE?'s missing space; (F9) a project says "project": Delete project… and its dialog, and the Changelog / Home headline **Project started**; (F10) Pokémon's Details chips (rarity, language, From TCGplayer…) sit on one row above the version list |
| 244 | Database test run (2026-10-12) | `scripts/db-test-run.sql`, run by `node scripts/db-test-run.mjs`, works every server function the app uses as the app's own signed-in role, in one transaction rolled back at the end, and checks what each does and refuses (297 checks), plus row security, grants and who can run what; the runner checks nothing was kept. It prints fingerprints of the structure (functions, tables, constraints, indexes, policies, triggers, privileges, Realtime) and can save a run and compare another with it: the proof that prod matches dev after the squash (Phase 10, step 7). It refuses a project other than dev's without `--confirm <ref>`. It stays after launch, to re-check the database after any later migration (docs/TEST.md, section 18) |
| 245 | The test run's fixes (2026-10-12) | Migration 0051: `internal.customer_key`, `internal.customer_name` and `internal.import_lines`, left open to everyone (PUBLIC) when they were made (0047, 0048), are granted to the app's role only, like every other function (docs/TEST.md F11); and `master_inventory_add`, the one-step inventory upload kept for the build before Phase E1, is dropped: the app uploads with `master_inventory_start`, `cc_products_load` and `master_inventory_finish` |
| 246 | SAVE EDIT (2026-10-12) | While a line is being edited, ADD CARD reads **SAVE EDIT** instead of EDIT CARD (owner), and the note under the search bar and the line's tooltip say so (Section 8.9; decisions 102, 103) |
| 247 | Auto-select back (2026-10-12) | The owner put auto-select back, a day after taking it out (decision 233): a search that narrows to one printing selects it again, and Enter adds it. With several matches nothing is selected until she clicks or presses ↓, and Enter says "Select a card first: ↓ picks the first suggestion" (decision 242) (Sections 1.3, 8.3) |
| 248 | The 1st Edition stamp (2026-10-12) | TCGdex's vintage scans (Base Set to Neo Destiny) all carry the 1st Edition stamp, but Unlimited is picked by default (owner). With any version but 1st Edition picked, the selected card's stamp is painted out: found by its ink inside its measured zone and filled from the card's colour around it, once per picture, under the sheen; a scan without one is left alone. With 1st Edition picked the label under the card adds **1ST EDITION**, and a scan without a stamp gets one drawn on (owner: "draw the stamp yourself"). English cards with a 1st Edition version shown from TCGdex, Pokémon and Trainers; Rocket's Mewtwo (Gym Challenge 14) has its own place, 64 pixels higher (Section 8.4) |
| 249 | Base Set's shadow (2026-10-12) | TCGdex's Base Set scans are the shadowless 1st Edition ones, so with an Unlimited version (or the 1999–2000 copyright print) of an English Base Set Pokémon picked, the art frame's drop shadow is drawn: measured on Base Set 2 and made a little stronger (owner). Pokémon only: Trainers don't have it. Only Base Set: Jungle on is printed with it, 1st Edition too (Section 8.4) |
| 250 | Promo pack numbers (2026-10-13) | A Magic search with a plain collector number also finds the promo pack printing, numbered with a "p" in the set's promos ("High Perfect 229" → ECL 229 and PECL 229p), by asking Scryfall for `(cn:"229" or cn:"229p")` (`numberTerm` in `src/lib/scryfall.js`). A number typed with letters (229p, 229s) is searched as typed (Section 8.2) |
| 251 | Edit in project view (2026-10-13) | A day page buy's ⋯ → Edit in project view opens its cards on the pricing screen, in the day page's game colour, to edit (mostly a condition or treatment before an export); SAVE BUY saves every change at once (migration 0052, `buy_save_edits`) and goes back to the day page. The buy keeps its day; its Changelog entry, Buy edited, is now's. No adding cards, no rate changes; blocked while any card is Completed (Section 10.2) |
| 252 | The card, large (2026-10-14) | Clicking the selected card on the pricing screen opens it large over the dimmed screen, its name in bold above it, with every effect the selected card has; the cursor becomes a 2× magnifying glass with a faint sheen and a thick clear rim. Any click or Esc closes it (Section 8.4) |
| 253 | Exports hold still (2026-10-14) | The export dialog keeps the cards and buy versions it opened with until it closes. The day page (and a collection) reloads whenever any buy changes, a card added at the counter on another computer included, and every reload used to restart matching and throw away staff's picks and typed Sell prices. A buy that really changed meanwhile is still caught on saving (stale_version) |
| 254 | The List and Mystery Booster are one (2026-10-14) | The store shelves them together, so the export matches a card of either category in both, its own first: the other's products score 2 less, so a card in both still matches in its own (export spec 7.3). Mystery Booster's retail foils (FMB1) are Mystery Booster too. Mystery Booster 2 and the playtest cards stay apart |
| 255 | The laptop pass (2026-10-14) | The work laptops' windows go down to 1200×650: on a small window everything is drawn smaller, down to 80% (full size from 1500×812, 80% at 1200×650; CSS zoom, `src/lib/uiScale.js`), and a short window gets a compact header. At 1200×650 nothing spills or scrolls that shouldn't, all 10 suggestions show (one row of 5 now only below 650px tall, where 191 had it up to 820px), and the selected card is 220×307 instead of 130×181 (Section 7.10) |
| 256 | Two rows of 4 on a laptop (2026-10-14) | Where the suggestions' column is narrow but tall (1200×650 up to about 1600×900), they're 2 rows of 4, bigger, instead of 2 rows of 5: 4 across whenever that makes them at least 15% bigger (`src/lib/thumbGrid.js`). 1920×1080 keeps 10. The columns are chosen from the column's width before the Buy list takes the room the thumbnails don't use (`suggestionRoom`): chosen after, a 1080p screen could settle on 4 with a wider list (owner's bug, 2026-10-14) (Section 7.10) |
| 257 | The card fills its area on a tall window (2026-10-14) | At 1920×1080 the selected card stopped at 336×468 and left about 135px empty under it. On a tall window its column now widens so the card fills its area's height (420×585 at 1080p), up to 120px wider, Finish & Details giving up to 40px and the suggestions the rest (`src/lib/cardRoom.js`); shorter windows are unchanged (Section 8.4) |
| 258 | 📈 / 📉 price movement (2026-10-14) | A JustTCG price that rose or fell sharply lately (20%+ in 7 days or 25%+ in 30, and $1+) gets a 📈 / 📉 beside the price panel's price (not on the condition buttons), with the move in the tooltip. From JustTCG's own 7- and 30-day change figures, now kept by the `prices` function (no extra request) (Section 8.7) |
| 259 | The team's feedback (2026-10-14) | After the team demo: an audit printout (Print? beside every Magic EXPORT, and Print buy on each buy), individual rates (low-end under $3 and high-end over $35 rates, a card's own rate by right-click, an alert at CONFIRM BUY) and bulk items priced from Settings. Planned in `docs/TEAM_FEEDBACK.md`, phases T1–T3 (approved 2026-10-14) |
| 260 | Audit printout built (2026-10-14) | Phase T1 of `docs/TEAM_FEEDBACK.md`: EXPORT ▾ → **Print?** / **Export csv** on every Magic EXPORT, and **Print buy** in each Magic buy's ⋯; a 2-column Letter PDF of the cards by Crystal Commerce category (Unmatched last), by collector number, with tick boxes and no prices, built in the browser (`jspdf` 4.2.1, loaded only when printing). Changes nothing |
| 261 | 🚩 Flag check for condition (2026-10-14) | CONFIRM BUY's dialog has a **🚩 Flag check for condition** box. Ticked, the confirmed buy is flagged (`buys.condition_check`, migration 0053, `buy_set_condition_check`): its day page panel shows **🚩 Check condition** and a red note to check its cards before export; EXPORT, Export single buy and (Pokémon) COMPLETE ask first when they'd take a flagged buy (Cancel / Export anyway); its ⋯ has **Condition checked** (flag off) or **Flag check for condition**. Set and cleared in the Changelog under Buys. A flag doesn't bump the buy's version |
| 262 | ✅ Condition checked (2026-10-14) | A flagged buy's 🚩 chip asks "✅ Condition checked?" when clicked; ⋯ → ✅ Condition checked is pinned first while flagged; Edit in project view asks at SAVE BUY. Once checked, the chip stays as a green ✅ Condition checked (who and when, migration 0054); never-flagged buys have no chip (Section 10.2) |
| 325 | Auto-select as soon as the card appears (2026-10-19) | The owner: "Can a card be auto selected sooner? As soon as it visually appears BEFORE the price comes in? Right now single result auto select and edit auto select wait for pricing before selecting." They waited for the whole search to finish: the other game's search (a Magic result can show while Pokémon is still searching) and any spelling correction. Now the selection is checked as each game's results come in: an edit's card is selected the moment it's among them (its key is exact); a lone result as soon as every game has answered (not before, or a Magic card could be selected and then dropped when Pokémon results arrive). Dropping a selection the results lack, and an edit's fallback to its exact search, still wait for the search to finish. The price then loads as before. `PricingScreen.jsx` (`answered`). |
| 324 | The card being edited pinned first (2026-10-19) | The owner: "We changed the edit card behavior to have the whole name searched instead of the exact card, but this is confusing when there's more than 10 results. The selected card for edit needs to still appear pinned as the first result. THEN show the rest of the search." While a line is being edited, its card is the first suggestion (selected and highlighted), the name's other printings after it in the search's order; Show all and ↓ ↑ follow the same order. It stays pinned through the edit, and (the owner: "EVEN when the search doesn't include that card, for as long as that's the card that cancel would revert to") a changed search that doesn't find it still shows it first, and keeps it selected. (The suggestion grid first drew from the search's own order over the pinned card; fixed.) `candidateKey.js` `pinFirst`. |
| 323 | mimp mode the other way round (2026-10-19) | The owner: "The mimp mode toggles are backwards, by default I want the search clear, represented by the daisy, the bat, non-default, is the persistent search." The 🌼 \| 🦇 pill keeps its order and 🌼 stays the default and lit side, but 🌼 now clears the card area after each ADD CARD (as before mimp mode) and 🦇 is mimp mode, keeping the search and the card with Qty back to 1. Tooltips: 🌼 "Clear the search after each card", 🦇 "mimp mode: keep the search after each card". Help updated. (Decision 293's 🌼-on default is reversed.) |
| 322 | Read and re-crop once the card has settled (2026-10-19) | The owner: "it seems across the board the first read is happening slightly too early when waiting for blur to clear after motion … there's 1 wasted early read often that is then, redone", and the collector box still worse past 100 cards. The run log (168 cards): 62 of 134 strip reads had a failed read about 0.6 s before; 74 re-crops asked (decision 317), many mid-motion. On the screenshot's still picture a fresh crop cuts both collector lines whole, so the bad boxes came from moments of motion. Now auto scan reads only when the card's art is the same as a look ago (it settled), and the re-crop waits for a settled look too; the first read comes one look later, on a sharp picture, instead of a misread and a redo. Scan card still reads at once. `Scanner.jsx` (`moving`). |
| 321 | Stop is an abort (2026-10-19) | The owner: "The stop button on the phone should cut off the camera faster than it does, as an abort button, do what needs to be done to stop the camera immediately." Stop now acts on the touch, not the lift (a click waits for the finger, and for a look's picture work under way); shuts the camera's tracks (disabled first) and empties the video; cancels any opening under way (START, a refocus, a restart after freezing, the tab shown again), whose camera, if it opens after Stop, is shut at once and never shown (before, a refocus or restart finishing after Stop brought the camera back); and gives up the look and any Scan card read under way and stops the card reader, so nothing goes on working behind it. The view's lock stays for when the camera's back. `camera.js` `generation`, `Scanner.jsx` `abortCamera`. |
| 320 | The computer stays awake while cards arrive (2026-10-19) | The owner: "A card arriving on the PC screen should ping the computer to stay awake like a keystroke would, right now it sleeps on me when I'm scanning." A page can't press a key, but it can hold a screen wake lock (`navigator.wakeLock`, Chrome, Edge, Safari 16.4+), which keeps the display on and a Mac awake with it. Each card arriving from the phone keeps it for 10 minutes more, as a keystroke would; 10 quiet minutes and it's let go, and the computer sleeps as it would have. The browser drops the lock when the tab is hidden; it's taken again when the tab's shown while still wanted. A browser without it (or refusing it, a battery saver) sleeps as before. `lib/stayAwake.js`, `useScanReceiver.js`. |
| 319 | Editing a line opens every printing of its name (2026-10-19) | The owner: "Clicking on a card for edit card should automatically open the same query as the right click instead of just filtering exactly to the 1 card, it's more useful to see like-cards when going to edit." Clicking a buy list line searched "Sol Ring 472 CMR", one suggestion; now it searches the name, "Sol Ring", every printing of it (as right-clicking a suggestion does), and the line's own printing is selected among them as before, its condition, finish and price restored. If it isn't among the name's printings (one of hundreds: a basic land), the exact search runs instead. Japanese cards (searched by number), cards known only from TCGplayer, bulk and placeholders keep the exact search. `candidateKey.js` `nameQuery`. |
| 318 | 🔔 off and on again starts the sound afresh (2026-10-19) | The owner: "My phone stopped making the sound again, can we make toggling the sound icon back and forth a hard reset for sound that always makes it refresh no matter why the iphone has it muted?" The run log had no `sound-woken` at all: the iPhone left the page's audio "running" but silent (after the camera was paused, 23:13:07), which decision 315's wake-up can't see. Now turning the sounds back on (🔇 → 🔔) closes the audio and starts a new one in that tap, asks Safari to play the page's sound as media (`navigator.audioSession.type = 'playback'`, so the ringer switch doesn't silence it), plays a moment of silence through an `<audio>` element (the same on an iPhone without audioSession), then plays the chime, so it's heard to be back. The run log notes each (`sound-reset`). `scan/sounds.js` `resetSounds`. |
| 317 | The collector box keeps up with a growing stack (2026-10-19) | The owner, after 132 cards of the timed run: "the box that detects the collector info get misaligned as more cards get scanned and the stack gets taller, even with the 20 card crop reset … More and more were using the name when they didn't have to." The run log: the strip read 14–18 of every 20 cards up to card 100, then 5 of 20, the older-card mode 21 times, mostly after card 100, title fallbacks just after re-crops too. As the stack grows the card comes closer and grows in the picture; the strip was looked for in the bottom-left zone of the lock's outline, and sized for its letters. Measured on 48 modern cards drawn bigger than a stale outline: set and number read right 28 / 7 / 0 of 48 (the same size / +15% / +30%). Three changes: the zone wider and lower (left -0.15, bottom 1.18 of the outline: the line of a card 30% bigger sits about 1.07 down, -0.06 in); the locator's canvas 70 of the expected letters tall, not 40, so bigger letters pass its 3% limit (the number line, the tallest, failed it first, leaving "SNC ★ EN" alone, the screenshot's box); a line found alone cut with room for the one above and below. Measured: 41 / 33 / 23 of 48. And a card whose strip names no set asks for the view to be found again (once a card, two looks) before it's taken for an older card, so the outline catches up with the stack rather than waiting for the 20-card re-crop. `scan/straighten.js` `ZONE`, `COLLECTOR_TUNING`. |
| 316 | Surge foils priced from their own product (2026-10-19) | The owner, with Altered Ego (Commander: FINAL FANTASY 317, a surge foil) asking for a price by hand: "Is it mismatched like the Pokemon were?"; "We should combine them." It was: Scryfall lists a commander deck's card and its surge foil as one printing (both finishes) and links it to TCGplayer's nonfoil product alone (631328, Normal $0.20), so the foil had no price anywhere: TCGplayer sells "Altered Ego (Surge Foil)" apart (636749, Foil $0.40), JustTCG too. (A commander's surge foil is its own Scryfall printing with its own price, Cloud FIC 221, and was fine.) Now `SURGE_PRODUCTS` (646 cards: FINAL FANTASY and Marvel's Spider-Man commander decks, Doctor Who, Warhammer 40,000, the Lord of the Rings tokens, …) maps each such Scryfall card to its surge foil product; the foil finish is looked up there too (one more JustTCG lookup, in the same request), and priced from it unless the main card has its own foil price, as an etched printing is. Generated from Scryfall and TCGplayer's catalogue (tcgcsv.com) by matching the card's own product's set, name and number; 14 Ravnica Remastered tokens have no surge product. A new set with surge foils needs the table made again. `lib/surgeProducts.js`, `lib/prices.js`. |
| 315 | The chime after the camera's been interrupted (2026-10-19) | The owner, during the timed run: "It doesn't seem to be making the sound anymore." The run log showed cards sent (so chimes due) after the camera had been paused and reopened. An iPhone stops a page's audio when the camera starts, restarts or is paused by the phone, and the scanner started it only on START CAMERA's tap. Now each sound starts the audio again when it's stopped (then plays), and any tap on the screen starts it too. The run log notes each time a sound found it stopped (`sound-woken`). `scan/sounds.js` `play`. |
| 314 | The card found again when the camera comes back (2026-10-19) | The owner, at the start of the timed run: "the picture is coming in wrong and cropping funny". The run log showed the camera paused by iOS first (22:25:57), then reads of the strip that came back as garbage, a refocus, the older-card mode and two title reads naming nothing: the lock, scaled to the camera's new picture, no longer fitted the card (the picture had come back wider and softer: another lens or framing). Now each time the camera's picture comes back (opened again, refocused, restarted after freezing, given back after a pause) the next look finds the card again with decision 312's re-crop. The re-crop now needs the collector line where a card's is, as the first lock does (an outline round an empty holder's floor isn't a card); an older card, with no line, is re-cropped by its edges only in the older-card mode. `camera.js` `opened`. |
| 313 | Promos that print PRM (2026-10-19) | The owner, with screenshots of Etali, Primal Storm that "refused to scan in any way": the strip read perfectly ("100/196 P Promo / PRM ★ EN"), but promos of about 2018–2019 print **PRM** where the set code goes, and Scryfall's "prm" is Magic Online's promos (digital, never taken as a set); the paper card is in Rivals of Ixalan Promos (prix) as 100p, 100s and 100★. Nothing matched, and auto scan, taking the strip for one with no set code, moved to the older-card mode and read the title. Now a strip with PRM: its "100/196" names the main set by its size (196: Rivals of Ixalan; a size two sets share is tried for each), that set's card 100 names the card, and its printings in that set's promo sets numbered 100-something are the candidates: one is taken, several open the printing list ("Which Etali, Primal Storm? A promo: match the stamp."), the strip's foil star kept for the finish. A PRM strip no longer counts towards the older-card mode. (The title being misaligned and no name box in the screenshots: the phone was on the live site, which hasn't had decisions 302–312 yet.) `scan/promo.js`. |
| 312 | The view found again every 20 cards (2026-10-19) | The owner: "have the view reset and immediately attempt to recrop with edge detection again. As the stack gets taller it gets closer in and the old crop loses its accuracy. Quietly resetting and re-cropping will help this issue." Every 20 cards sent with one lock (auto scan, Scan card, a picked printing or +1, each a card on the stack), the next auto look finds the card's edges again and locks onto it afresh, by its collector line or, for an older card, by its edges alone. Quietly: no message, and the screen never shows the unlocked picture; the old lock stays till a new one is found (a hand in the way), tried on the next looks, 10 at most, then kept till the next 20. What's held about the card last sent is kept across it, so the card in the holder isn't sent again. Reset view still unlocks at once. `Scanner.jsx` `RELOCK_EVERY`, `noteSent`. |
| 311 | Which card? when no read can name it (2026-10-19) | The owner: "as a final-final fallback after even the special filter name read for old cards, if it fails, just open a text input field directly with the best scryfall guess name filled in automatically, x button to clear, click to type, submit to open the 'Pick a Card' panel with best options after the user inputs the name … With this feature then we can never truly get stuck." When every title read (decisions 308–309) names nothing, a **Which card?** sheet opens over the camera: a box with the reader's closest name in it (a loose search over every reading; often wrong, there to correct), × to clear it, names that fit listed under it as you type (every card name is on the phone, so no connection), **Find printings** (or Enter, or a name tapped) to open the printing list for that name, ranked by the photo taken when the sheet opened, and **Skip this card** (set aside, and auto scan leaves that card be). It opens from Title, from a Scan card that read no name, and from auto scan after 3 title reads in a row on the same card named nothing (it tried for ever before). Scanning waits while it's open. `scan/NameSheet.jsx`, `nameMatch.js` `guessName` / `nameSuggestions`, `older.js` `printingsFor`. |
| 310 | A title's real words are never cut (2026-10-19) | Found measuring decision 309: Urza's Tower, dimmed, was read "{lUrza's Tower N" and named **Urza**, another card. When a reading didn't match cleanly, the matcher tried it again with words cut off its end, any words, down to the first; "Urza's Tower" became "Urza". Cutting is for the mana cost read as letters ("Chromatic Sphere Bh"), so now only words of 3 letters or fewer are cut. A reading that doesn't match then names nothing (the scanner says so, or tries its next read) rather than another card. `scan/nameMatch.js` `titleKeys`, `CUT_UP_TO`. |
| 309 | A second read for white titles (2026-10-19) | The owner, on cards like Mercadian Masques that stayed unread: "Let's test this [a contrast-boosted second read of the title]". The old frames' titles are white letters with a dark shadow; the usual cleanup keeps the smaller share of the band, so on a light parchment bar it kept the shadow (hollow letters) and on Mercadian Masques' blue marble it kept the marbling. The second read takes each pixel's darkest colour channel (white is bright in all three; parchment, marble and red frames aren't) and keeps what's past Otsu's threshold and past 80% of the band's brightest. Measured on the 32 older cards from Scryfall (decision 308) with the title found: 26 named before, 31 with a fixed brightness cut (200 of 255) but 0 rescued once the cards were dimmed to 75% or 60% as a phone photo is, so it's the relative cut: 30, 30 and 30 of 32 on the clean, 75% and 60% sets (rescuing Statecraft and Misdirection, Mercadian Masques, Coalition Honor Guard, Keldon Champion, Serra Aviary). Order: the usual read and the white read at the likeliest place, the same at the next, the usual at the third, a block read last: six at most. Contrast stretching (+1) and a bigger band (+0) didn't help. `scan/titles.js` `whiteThreshold`, `findTitle`. |
| 308 | An older card's title found, not assumed (2026-10-19) | The owner, with a screenshot of Courser of Kruphix (BNG, 2014) whose info box showed only the frame's top line: "Sometimes for older cards the name reading is misaligned in a way that makes it so it can't read the name at all. It detects the name too high (high most often, sometimes low)." The title was read from a fixed band, 3.5–10.5% down the card's outline; an outline a little off the card, or a frame whose title bar sits lower (this one's is 6.5–12.5%), put the band on the border. Now the band is looked for: down the top of the card, from 5% above the outline's top to a fifth of the way down, the place where a line of text sits, busy across its middle and calm above and below (the art and the border being busy or calm all the way through); the three likeliest places are read in turn as one line till one names a card, then the best as a block. The info box shows the band found. Its left edge moved from 6.5% to 4.5% in (the C of "Courser" was cut). Measured on 32 random older cards from Scryfall (8 each of the 1993, 1997, 2003 and 2008–2014 frames), on a wider background: the found band named 25, 25 and 26 of them with the outline exact, 6% too high and 4% too low; the fixed band 21, 0 and 0. The screenshot's card reads "Courser of Kruphix" at every one of those positions. `scan/titles.js` `titleTops`, `findTitle`. |
| 307 | The computer's side never stuck either (2026-10-19) | The owner: "Fix, add timers to the PC side as well so we don't get stuck." The computer prices the phone's scans one at a time, and none of its calls had a time limit: one that never answered held every scan after it, and the phone said "pricing…" till the computer was reloaded. Now: looking for scans, claiming one and telling the phone how it went 5 s each (a database round trip measured 0.17 s at worst), adding or taking off the line 10 s, the exchange rate 5 s (measured 0.15 s; without it the Cardmarket step has no rate), the JustTCG price function 15 s (not measurable from here: it needs the store's sign-in; without it, on to Cardmarket as on any JustTCG failure), a whole scan 30 s ("It took too long on <computer>: check its list, then scan it again"); a scan given up adds nothing late. A look or a claim with no answer is tried on the next message or poll. On the phone, a scan still "sending…" or "pricing…" 15 s after the phone first saw it says "still waiting on <computer>: is its price screen open?" or "<computer> is still pricing it…", in amber. `useScanReceiver.js`, `Scanner.jsx` `STILL_WAITING_MS`. |
| 306 | Too dark: a hint (2026-10-19) | The owner, to "No hint in dim light": "fix". A dark picture read badly and the scanner only said it couldn't read the card. Each look measures the light in the locked card's view (the whole picture before the lock) from a 48 × 48 copy: not the average (the camera brightens a dim picture, and a black-bordered card is dark in any light) but how bright its brightest 5% gets; under 90 of 255 is too dark. Four dark looks in a row and the strip says "Too dark to read well: tap 💡 for the light" (or "more light on the card helps" with no torch, or the torch on), once, gone when the light's back; a Scan card that fails on a dark picture says "Couldn't read this card: it's too dark. Tap 💡 for the light, then press Scan card again." Reading carries on either way. `scan/light.js`. |
| 305 | The card reader restarted now and then (2026-10-19) | The owner, to "The card reader is never restarted": "fix". One Tesseract worker ran for the whole session, and it uses more memory the longer it runs. After every 300 reads it's swapped for a fresh one between two reads; the new one starts loading straight away (from the browser's cache), so the next read waits a moment at most. Stop and hold-to-start-over still start it afresh at once (decision 300). `scan/ocr.js` `RECYCLE_AFTER`. |
| 304 | Auto scan rests when nothing's new (2026-10-19) | The owner, to "Auto scan never slows down": "fix". Auto scan looked every 0.3 s while the camera was on, an empty holder included (the spec expected a warm phone after a few hundred cards). After 30 s with nothing new (no card found, the card's art unchanged from the last look, no button pressed, the camera not just started) it looks once a second; anything new and it's back to every 0.3 s straight away. A card laid in after a rest is read within about a second. `Scanner.jsx` `IDLE_AFTER_MS`, `IDLE_REST_MS`. |
| 303 | The camera cut off (2026-10-19) | The owner, to "The camera doesn't notice when it's cut off": "fix". A call, Siri or another app could take the camera while the page stayed open; the picture froze and auto scan kept reading it. Now the camera's track is watched: **paused by the phone** (the track muted), auto scan waits and the strip says "The phone has taken the camera (a call?): scanning carries on when it gives it back"; **ended by the phone**, or **frozen** (the video's clock hasn't moved for 3 s, checked every second, as an iPhone doesn't always say), the camera starts again by itself, saying "The camera stopped: starting it again…"; more than 3 restarts in a minute and it's left off: "The camera keeps stopping. Press START CAMERA to try again." The view's lock is kept through it. `scan/camera.js`. |
| 302 | A scan saved once (2026-10-19) | The owner, to "No protection against sending the same card twice": "fix". Since decision 300 the phone gives up on a send after 5 s; the send may have landed anyway, and pressing Scan card again added a second copy. Each scan now carries the phone's own id for it (`scans.client_id`, unique per phone); a send with no answer is tried again up to twice with the same id (15 s in all), and scan_send returns the scan already saved under it instead of saving another. Only after the third try does the phone say "No answer from the computer after three tries: check its list before scanning this card again." Migration 0075. |
| 301 | Flagged buys on the Magic printout (2026-10-18) | The owner: "MTG Printouts of condition flagged buys need to be clearly flagged on the printout as well." A Magic audit printout holding a buy flagged for a condition check (🚩, `buys.condition_check`, until ✅ Condition checked) has a red banner across the top of every page, under the title: "CHECK CONDITION: Buy 42 is flagged. Check its cards before export." on a buy's own printout (the buy's ⋯ → Print buy, BUY COMPLETE's Print MTG?); on a day's (EXPORT ▾ → Print MTG?) "Buys 42 and 45 are flagged. Check their cards before export." The banner only (the owner, after red outlines and "Buy 42" chips on each flagged card were tried: "Just the header is fine, the outlines and the chips are overkill"); the rows are as before. The toast says which buys are flagged. The Pokémon printout (Print PKM?, a Pokémon buy's Print buy, BUY COMPLETE's Print PKM?) does the same (the owner: "both is good"). Collections have no flag; stickers are unchanged. `lib/auditPrint.js` `flaggedBuys` / `flagBanner`, `lib/auditPdf.js` `flagText`, `useAuditPrint` `flagOf`. |
| 300 | The scanner: never stuck on Reading…, Stop and start over (2026-10-18) | The owner, after a day at work: "it kept getting stuck on 'Reading...' after hitting Scan Card. It was on a slower network … stuck on Reading... forever until a hard refresh"; "we need a button or some gesture that helps it get unstuck". **Why it stuck:** no request had a time limit. Scryfall's requests go one at a time through one queue, so a request that stalled on a bad connection held every lookup after it; a look held the scanner's busy flag till it ended, so auto scan never looked again and Scan card waited behind it showing Reading…; the card reader (Tesseract) works the same way, one read at a time. **Fixed:** every request through the app's transport is given up when it has no answer in time and tried again like a network error; a Tesseract read is given up and the reader started afresh; the phone's writes (send, answer, undo) give up, sending saying "No answer from the computer yet: check its list before scanning this card again"; a whole look gives up and says so. The limits are about ten times the slowest measured on 2026-10-18 (the owner: "measure the examples on this network … set the timeout durations more tightly"), rounded up to the next 5 s ("to be safe"): a Scryfall lookup 5 s (slowest first byte 0.32 s), a Scryfall search 10 s (0.97 s), TCGdex 10 s (0.67 s), the Pokémon TCG API 5 s (0.28 s), a body 10 s (0.85 s after its first byte), a phone write 5 s (database round trip 0.17 s, plus the write), a Tesseract read 5 s (0.3–1 s on a phone), loading the reader 20 s (4.4 MB in 1.35 s, plus compiling it on the phone), a whole Scan card or Title 20 s (its slowest honest run about 15 s), an auto look 10 s (about 4 s); a look given up does nothing more if it ever ends (it can't send a card late). A quick Scan card (taking a very sure strip read before the full run) was built and then dropped the same day (the owner: "with the rest of these safeguards I don't think I want a quick scan feature at all"): Scan card always does the full run. **Unstuck:** Reading… turns into **Reading… tap to stop** after 3 s: tapping gives the read up, starts the reader afresh and forgets what auto scan held about the last card, so the card in the holder is read again. **Holding Scan card** (0.7 s, a buzz) does the same and reads the card now; the view stays locked (Reset view unlocks it). Scan card with the camera not ready says so instead of nothing. `lib/timeout.js`, `lib/transport.js`, `scan/ocr.js` `resetOcr`, `scan/Scanner.jsx`. |
| 299 | A search in Help (2026-10-18) | The owner: "a small search bar on the header of the page panel, right aligned, that is a simple word search for the document and when searched shows pages that have that word on them in order of relevance." A **Search Help…** box at the right of the page's header (after "N of M"). Typing lists, under it, the pages that have every word typed (two letters or more; a word matches where a word starts, so "port" finds "portrait", not "export"; accents ignored, so "pokemon" finds "Pokémon"), most relevant first: a word in the page's title counts 10, in one of its headings 4, in its text 1 for each time; ties keep the Help's order. Each result shows its title, chapter, how many times the words are on it and a line around the first one. ↓ ↑ and Enter or a click open the page and scroll to the first word; Esc clears the box. While the words are in the box they're highlighted on every page (the browser's own highlights; the page's HTML is untouched). `lib/help.js` `searchHelp`, `src/pages/help/HelpSearch.jsx`. |
| 298 | Undo export… on a collection's ⋯ (2026-10-18) | The owner, offered an explicit Undo export once decision 294 took it off Reopen: "yes please". A collection's or project's ⋯ on its screen has **Undo export…**, after Print: it takes the export's stamps off the collection's exported Magic cards (product, Custom SKU, Sell Price: EXPORT offers them again) and brings their copies back out of Can't upload cards, as a buy's Mark Paid/Ours again does. The status doesn't move, whatever it is; the file already downloaded isn't undone (the confirm says so). Greyed with why: no connection, another computer editing it, nothing exported. It needs the lock, like EXPORT, so the Collections tab's row ⋯ (no lock) doesn't have it. Changelog: "Export undone (Custom SKU 101826): 3 cards no longer marked exported; 2 taken back out of Can't upload cards" (`collection_unexported`). Migration 0074, `collection_unexport`. |
| 297 | Print PKM Stickers? offers Complete day… (2026-10-18) | The owner: "on the Pokemon side of the day pages, after you 'Print PKM Stickers?' a small dialogue should ask if you want to complete the day." Once the stickers PDF is on its way (its tab opens at the click), a small dialog, **Complete the day?**, with **Not yet** and **Complete day…**, which opens the usual Complete day step (today's Sell Prices, the flag check, the confirm). Only when the day can be completed (over) and has Paid/Ours Pokémon buys left; a buy's own Print stickers doesn't ask. `DayPage.jsx` `askComplete`. |
| 296 | Convert to project skips Completed cards (2026-10-18) | The owner, charting docs/AUTO_COMPLETE.md: "Completed/struck cards just get skipped, right?" It used to refuse a buy with any Completed card (`buy_completed`). Now `buy_to_project` moves the live cards (not Completed, not struck); a buy with Completed cards left stays on its day with them and its struck cards (version bumped; the project's Changelog entry says "its Completed cards stay on the buy"); a buy with none is deleted as before; nothing live to move is still `buy_completed`. The day page's Convert to project is blocked only then; its dialog counts the live cards and says what stays. Migration 0073. |
| 295 | Mark as completed strikes a Magic buy's cards (2026-10-18) | The owner: "Yes [keep it], but when it's done, strike all the cards. If a magic buy is completed (instead of exported), something else has happened to it." `buy_mark_completed` on Magic sets `struck_at = completed_at` on the cards it completes (so they read as struck everywhere: crossed out, out of exports and printouts, still in the totals); Mark Paid/Ours again restores exactly those (`struck_at = completed_at`) with the completion. Pokémon is unchanged: Complete day… and Mark as completed are how a Pokémon buy finishes. All-struck already read as Completed (owner: "100% struck is completed"); unchanged. Migration 0073. |
| 294 | Collections never complete themselves; Completed is set by hand (2026-10-18) | The owner, on docs/AUTO_COMPLETE.md: "collections should never 'auto complete' themselves and instead should be moved to completed manually always. It's just a state there and state is freely editable in a way that it isn't for buys." So: EXPORT on a Paid/Ours collection or project exports its Magic cards **not exported yet** (stamps them, copies the unmatched to Can't upload cards) and leaves the status alone (Changelog action `collection_exported`: "Exported N cards (Custom SKU …)"); with none left, "nothing to export" (the Pokémon-only "Mark Completed" dialog is gone: "Completed is set from the status menu"). **Completed is a status**: the dropdown and a "Mark as Completed →" step set it from Paid/Ours (`complete_from_paid` otherwise); leaving it changes the status only: the export's stamps, Sell Prices and Can't-upload copies stay whatever the status does (the "Reopen undoes the export" rule of export spec 9.4 is gone; the Custom SKU chip shows whenever stamps exist). Undoing a collection's export has no button now: flagged. Decision 182 superseded. The day pages are unchanged (the owner: "pretty good, mostly correct"); the collection-with-no-Magic-cards case "we're going to change later". Migration 0073. |
| 293 | mimp mode (2026-10-17) | The team wanted a mode that doesn't clear the search after an add. After EN \| JP on the Price screen's search bar, a **🌼 \| 🦇 pill** exactly like the language toggle, no words, daisy first: the lit side is the mode. **🌼, the default, is mimp mode on** ("auto mode" in the code: `auto`; like EN \| JP it starts on its default when the page opens and keeps its setting from buy to buy, nothing stored): ADD CARD leaves the search, the card, its finish, condition and manual price as they are, resetting only Qty to 1, so a run of the same card goes in with Enter, Enter, Enter. **🦇 is off**: the search clears after an add as it always did. One side is always lit. The 🌼 side's tooltip says the state, **Auto Mode: ON** or **Auto Mode: OFF**; the 🦇 side's reads **Toggle mimp mode**. A first round button (one emoji, lit or not) read as neither state (owner, 2026-10-17). Saving an edit always clears. `PricingScreen.jsx`, `SearchBar.jsx`, `search.css` `.mode-toggle`. |
| 292 | BUY COMPLETE after CONFIRM BUY (2026-10-17) | The owner: a dialog after a buy is confirmed, "mainly to offer to print orders directly after purchase". `BuyDoneModal.jsx`: **BUY COMPLETE**; in green, "Cards saved in the Calendar page: Magic and Pokémon · Friday, October 17, 2026" (the games the buy has, today's page); the facts (Buy N · customer, the card count as the list counts it, what was paid and how, 🚩 if flagged); then **Print MTG?** and **Print PKM?** for the games it has (the same printouts as the buy's ⋯ on its day page, decisions 280 and 283, titled "Audit — Buy N, October 17, 2026") and **No thanks**; × in the corner and Esc are No thanks. The title bold and centred, the saved line on one line ("Oct 17, 2026"), the print buttons in their games' colours with 🖨 (owner, 2026-10-17). The confirm toast stays. |
| 291 | The Custom SKU is the day exported; a single buy's carries its number (2026-10-17) | The owner: "The SKU numbers used are tied to the current date … I'd rather them be tied to the day that's being exported on calendar pages. Exports of projects and collections can remain as they are now (current date)", and "When exporting a single buy … have their custom SKU be set to <the current dated SKU>-<id> eg: Calendar day 10-16-26 Buy 42 is: 101626-42". A day page's EXPORT stamps the day's code (`internal.cc_custom_sku_day(date)`: "101626" for October 16, 2026) whenever it's run; **Export single buy** stamps the buy's day and its number, "101626-42"; collections, projects and Can't upload cards keep the date they're run (`cc_custom_sku(now())`). The export dialog's Confirm step says the SKU it will stamp (`customSkuForDay`, tested). On the day page the header's Custom SKU chip is the day's own export's; a single buy's "<day>-<number>" chip sits on that buy's panel (owner, 2026-10-17). Migrations 0071–0072; `export_lines`. |
| 290 | Buys numbered once, forever (2026-10-17) | The team: "buys have unique counting IDs forever. So the first buy ever for either game is Buy 1 then the second is Buy 2, and then another the next day starts at Buy 3 and even if that was an MTG buy the following PKM buy becomes Buy 4 etc forever. This will help tracking and physical storage." Before, a buy's number was its place among the day's confirmed buys of its game, counted wherever it was shown. Now `buys.number` comes from one sequence (`buys_number_seq`) when a walk-in buy is confirmed (`confirm_buy`) or made from a project (`project_to_buy`); the 41 confirmed buys so far were numbered 1–41 in confirmed order (migration 0071). `internal.buy_number(buy)` reads it, falling back to the old day count for a row without one (a backup restored from before numbers); the changelog's "Buy N · day" names, the Can't-upload copies' "from Buy N", the header search's Buy N, the day page, its printouts and Export single buy's SKU all use it. A buy made into a project keeps its number on the way back. **Past storage labels** written as "Buy 1 · Oct 3 (Pokémon)" no longer match the day page, which now shows the global numbers for those days too. |
| 289 | The TCGplayer siblings search on request, kept a week (2026-10-17) | The JustTCG budget (`PKM_PRICES.md` 3.5: Starter, 771 of 1,000 by 2:20 PM; 5,301 of 10,000 for the month on the 17th): the siblings search (206, 234, 235) ran for every English Pokémon card selected, a request each, about half of Pokémon's spend; TCGplayer's catalogue shows it adds a product for 2–25% of cards (theme-deck, league, Prize Pack and Battle Academy reprints). The owner chose both savings. (1) It runs by itself only when the card needs it: a TCGdex version without a product of its own (a stamp TCGplayer sells apart, 235; a card TCGdex gives no products at all) or a line being edited that was saved on a TCGplayer-only version; for every other card the details panel offers **Other TCGplayer versions…** (one request; "Looking on TCGplayer…", "No other TCGplayer versions."). Printings of the card's own product that TCGdex misses (234, Staryu XY 33's reverse) now come from the price result, which has the product whole: no search. A TCGplayer-only version is looked up once it's chosen, not for every card. (2) The function keeps a siblings search's answer **7 days** (misses still a day); the app seeds prices from it only while the answer is under 6 hours old, else the chosen version is looked up. Also: a pattern product in the search (a Master Ball's "Holofoil") no longer lends the card a bogus HOLO version. `usePrices.js` `usePokemonSiblings({ needed }, ask)`, `usePrinting.js`, `usePriceQuote.js`, `FinishPanel.jsx`, `justtcgCards.js` `siblingVersions`, the `prices` function's `SIBLINGS_MS`. |
| 288 | The name search by the set's TCGplayer home; a product that is another card is refused (2026-10-17) | From the audit (`PKM_PRICES.md` 3.3, 3.4): 35% of TCGdex's English versions (9,222 cards: Scarlet & Violet base, Sword & Shield base, every Sun & Moon, XY, Black & White and Diamond & Pearl set, promos) carry no TCGplayer product and go through the `prices` function's name search, where 1,083 could never match (TCGdex "Diamond & Pearl" vs TCGplayer "Diamond and Pearl", "Sun & Moon" vs "SM Base Set", every promo set) and Base Set was always ambiguous. Now `supabase/functions/prices/sets.ts` (`TCGPLAYER_SETS`, read off TCGplayer's catalogue) says where each TCGdex set lives: its JustTCG set ids and names. The search matches the set name **exactly** when the table knows the set (containment otherwise), checks the printed size where JustTCG's number has one, writes the number the way the set's TCGplayer page does (`pad: false` → "12/107"), and its second step asks **inside the set** (`set=`) instead of the set-code lookup, which never found an English set (25 wasted requests). Each product lookup now says which card and set it's for (`lookupsFor`: `setId`, `number`, `name`, `plain`); the function **refuses** a product whose number isn't the card's (Classic Collection's "CC" numbers excepted) or, for a plain version, whose set isn't the home (a theme-deck reprint in "Deck Exclusives"), logs it, answers `refused`, and doesn't remember it (the product's own card may ask next); the app then shows no fallback for it either (`usePriceQuote`, `todaysPrices`). The function needs redeploying. |
| 287 | A product that is one version is read as that version; the fallback price is the finish's (2026-10-17) | From the audit (`PKM_PRICES.md` 3.2, 3.4): TCGplayer sells a Poké Ball / Master Ball pattern, a Cosmos foil, a stamped reprint as its own product with one printing, "Holofoil", where TCGdex calls the version a reverse (SM Black Star Promos: "Holofoil" where TCGdex says normal). `printingFits` found nothing and 835 versions, every pattern card of Prismatic Evolutions, Black Bolt and White Flare among them, showed the fallback (the store's Sylveon PRE 040 Master Ball: `tcgdex_fallback`). Now `ownProductCard` (`justtcgCards.js`, tested) reads every printing that isn't a 1st Edition as the version's finish when none fits: for the version's own product (a treatment and a product the plain version hasn't), or any product sold in a single printing; a 1st Edition keeps its rule (an Unlimited never prices a 1st Edition or the reverse); the Japanese pattern rule (225) is the same idea. `resultFor` applies it to product and search results alike. And `marketPriceIn` takes the finish's own market price from TCGdex's block, not the first listed (a reverse holo's fallback and ⚠️ comparison were the plain card's for 4,452 of 6,554 reverse versions). |
| 286 | TCGdex's wrong TCGplayer products put right (2026-10-17) | Charmander SVP 044 was priced, and its View on TCGplayer linked, as Fuecoco 002 at the counter: TCGdex's `thirdParty.tcgplayer` for it is Fuecoco's product. The audit (`PKM_PRICES.md` 3.1) checked every English version against TCGplayer's catalogue and found 176 such cards: the Brilliant Stars Trainer Gallery full arts (TG06, 07, 08, 16, 17, 24, 26) wired to the plain cards (Mimikyu V TG16 at $3.78 instead of $81.87), main-set holos wired to their theme-deck reprints (Team Magma's Groudon, Dark Marowak: bought that way), Rumble, McDonald's, Aquapolis a/b, Celebrations' Classic Collection Reshiram/Zekrom, cracked-ice swaps… `WRONG_PRODUCTS` in `printings.js` (`fixedProduct`, tested): `'<TCGdex card id>:<its product>'` → the right product (or null for none), applied in `pokemonVersions`, so the link, the lookup and the siblings search all use it; TCGdex's market price for a fixed version is dropped (it's the wrong card's). Reported to TCGdex; the table goes when the data is fixed. The owner: "fixing this Charmander so the incorrect price is quietly never shown". |
| 285 | Ctrl+Click EXPORT: the cards as a decklist (2026-10-17) | The owner: "another secret feature, if you ever CTRL + Click an Export button, I want it to show a toast and copy all the cardnames in the buylist to the clipboard. Literally just <quantity> <card name> NO details, for pasting into decklist sites like Moxfield." Ctrl+Click (or Cmd+Click) on EXPORT, on a day page or a collection's screen, copies its cards as `<quantity> <card name>` a line: one line per name (every set, finish and condition summed), A to Z, the English name when a card has one; bulk and struck cards left out, as everything that moves cards on leaves them. A day page copies that day's cards of its game; a collection its Magic cards only (the owner, 2026-10-17: "make the collection copy only Magic cards"; "No Magic cards to copy." otherwise). No menu opens; it changes nothing, so it works even while EXPORT is blocked (the day not over). The toast: "Copied N cards as a decklist (M lines)." Secret: no tooltip, no Help. `lib/decklist.js` `decklistText` (tested), `ExportButton` `copyLines`. |
| 284 | Who's on, on the home page (2026-10-17) | The owner: "Somewhere on the home page we should have '<n> Connected' (number of computers open) '<n> Users selected' (number of users active) with little status icon circles." In the tab row, just left of Changelog (the owner, 2026-10-17, moving it off the home page: "fun to always see, and I want to get the height back"): a green dot and **N Connected** (computers with the app open; hover lists them), then one dot per picked user in that user's colour and **N Users selected** (a user picked on two computers counts once; hover says who, where). From a Supabase Realtime Presence channel (`presence:store`) every desktop tab joins once signed in with its `devices` row saved, saying its device id, name and the picked user, and again when that changes; two tabs of one computer count once; a phone on the scanner never joins; nothing is written anywhere. `state/presence.jsx` (`PresenceProvider` in the desktop Layout, `usePresence`), `components/WhoIsOn.jsx`, `lib/presence.js` `whoIsOn` (tested). |
| 283 | A Pokémon buy's prints; "Complete day…" (2026-10-16) | The owner: "Add the Print buttons to each single pokemon buy to mirror the '...' settings options for magic buys. Make the 'Complete Day' button on Pokemon day page EXPORT button 'Complete day...' instead." A Pokémon buy's ⋯ on its day page: **Print buy** (that buy's Pokémon cards by set, as Print PKM?; no connection needed) and **Print stickers** (that buy's price-tag stickers, as Print PKM Stickers?), both changing nothing, any day; "Audit — Pokémon, Buy N, <date>" / "Stickers — Pokémon, Buy N, <date>". The Pokémon day's EXPORT ▾ last item reads **Complete day…** (it asks first). |
| 282 | A Pokémon day's EXPORT ▾ (2026-10-16) | The owner: "Change the COMPLETE button on the Pokemon calendar day pages to an EXPORT button again, and put the Print PKM? and Print PKMN Stickers options inside it, as well as a Complete Day button as now." A Pokémon day page's button reads **EXPORT ▾** again (COMPLETE alone since decision 2026-10-02) and opens **Print PKM?** (the day's Pokémon cards by set, decision 280), **Print PKM Stickers?** (decision 281) and **Complete day…** ("Complete Day" until decision 283; exactly COMPLETE: asks about flagged buys, today's sell prices, then day_complete). The two prints change nothing, so they work before the day is over; only Complete Day is greyed with the "until it's over" reason (and says it when clicked). The count after EXPORT stays the pile to mark Completed. `ExportButton` `exportLabel` / `exportTitle` / `exportBlocked`, a menu with any print item (Print MTG? only with `onPrint`). |
| 281 | Print PKM Stickers? (2026-10-16) | The owner: after Print PKM?, "Print PKM Stickers?": "run a full reprice as if it was being exported like magic on all the pokemon first, and then run the sticker sheet generator to make a PDF with price tag stickers for every pokemon being exported in this collection", each sticker "small but clear name at the top of the sticker, first 5ish letters of the name truncated. Then the collector number in brackets, always shown. Under it, centered and taking up most of the price tag is the price in full $1.00 formatting, use the prices we just fetched as sell prices on the stickers. And lastly a chip with the condition on it to the right of the price"; it loads and opens like the other printouts. EXPORT ▾ on a collection or project (not the system collection): the batch's Pokémon cards (Print PKM?'s) priced as the export prices Magic cards (`todaysPrices`, then `sellPriceFor` with the Pokémon Master Fallback Percentages: the full market price for the condition today, rounded up, at least $0.40), **nothing saved**; then one sticker a copy, in Print PKM?'s order, on the store's sticker sheets: Letter, 160 stickers, 8 x 20 of 1 in x 1/2 in, the grid **0.29 in from the left and 0.49 in from the top** (the pitch measured from a scan of the sheet, the place from the owner's two test prints on it the same day: at 0.33 / 0.50 the print sat 0.03 in right and a little low; at 0.30 the far columns still leaned 0.05 in right; the stand-alone tool with a calibration page is `C:\ClaudeProjects\temp\sticker-sheet`), a plain rectangle (no skew), and the store printer's offset in `lib/stickerPdf.js` (`PRINTER_OFFSET`: 0.06 in left, 0.05 in down, measured from a printed sticker the owner sent, "Meowth [42]", whose content sat 0.059 in right and 0.047 in above the sticker's centre; the owner: "make it align to next time print each stick on the dead center of the stickers using math"). A sticker, after the second test print (owner: "Bring the name down a line or two … putting the chip directly UNDER the price so there's a LOT of space on both left and right … we can't be close to or touching ANY red lines"), everything centred, 0.12 in kept clear at the sides and about 0.08 in top and bottom: the name's first 6 letters and `[number]`, 5 pt bold, its top 6 pt down; the price, up to 12 pt bold (shrinking to fit), as the app shows money (`formatMoney`: "$12", "$1.50", "$0.40"; the owner, shown both: "I actually liked the first version without the empty '.00' on larger rounded numbers"); the chip outlined in the condition's colour. Needs the connection (today's prices). "Stickers — <name>", `stickers-pkm-<name>.pdf`. `lib/stickerPdf.js` (`stickerLabel`, `stickerRows`, `stickerBox`, `stickerPdf`), `lib/auditPrint.js` `pokemonOrder`, `useStickerPrint`; the printouts' tab shared in `export/printTab.js`. |
| 280 | Print MTG? and Print PKM? (2026-10-16) | The owner: "Project/Collections Export button shows: 'Print?' Make that function say 'Print MTG?' instead and mirror this with a 'Print PKM?' function that does the same sort of thing as print MTG, but instead of CC categories, it's just sets." EXPORT ▾ on a collection or project: **Print MTG?** (the audit printout as it was) and **Print PKM?**: the batch's Pokémon cards (never bulk or struck; Pokémon cards are never exported, so Completed or not) in the same printout, one section a set, A to Z by the set's name with its code on the band, rows as a Magic category's (NM by number, then the rest) with the finish ("Holo", "Reverse") and the bracket's tags as chips and a grey edge; nothing matched or fetched, so it needs no connection. "Audit — <name> (Pokémon)", `audit-pkm-<name>.pdf`. Not on the system collection. `lib/auditPrint.js` `pokemonPrintLines`, `pokemonRow`, `pokemonSections`; `useAuditPrint.print({ game: 'pokemon' })`. |
| 279 | GPL-3.0 (2026-10-16) | The owner, choosing how to use mtgscan (its LICENSE is GPL-3.0; its README says MIT, the file wins): "Copy its recognition code, go GPL-3.0" over writing our own. `LICENSE` (GPL-3.0 text), `package.json` `"license": "GPL-3.0-only"`, a line under the README's title, mtgscan's four recognition modules copied unchanged into `src/scan/recognition/` with where they came from at the top, and Settings' credits ("Card scanning: mtgscan (GPL-3.0) and Tesseract.js") |
| 278 | The phone scanner (2026-10-16) | The owner: phone scanning straight into a computer's open list, for large buys of low-end Magic cards. Built from `docs/SCAN_FUNCTION.md` (Phases S1–S5; its Appendix B has the owner's answers): a phone opens `#/scan`, pairs with a computer's price screen (one phone per computer), reads each card's collector line with Tesseract.js on the phone (mtgscan's recognition), and the computer prices and adds it as ADD CARD would: **TCGplayer's price from the Scryfall card (as Use TCGplayer) > JustTCG only when Scryfall has none > Cardmarket > the phone asks**, no price warnings. Condition and Normal / Foil set on the phone for the next scans; cards added by themselves when they read surely, never the same card twice in a row (Scan card adds another copy); a chime per card; Undo last scan; older cards by their title, on Scan card only. Migrations 0068 (`scan_sessions`), 0069 (`scans`), 0070 (undo); database test run 461 checks. The squash's numbers move on: baseline 0071, the Changelog lock 0072 |
| 277 | A Completed buy's names in grey (2026-10-16) | The owner: "When a buy is marked as completed show all the card names in the grey color of the struck card names instead of white, so that it looks faded out (without using opacity here)." On a day page, a buy panel that's Completed for its game (exported, or marked by hand) shows every card name in `--muted`, the struck rows' grey, chips inside the name included; prices, quantities and the panel itself are unchanged |
| 276 | Cards by game on a name (2026-10-16) | The owner: "When mouse rolling over the name of a project or collection show a hover chip showing the number of cards in that project or collection (by game)." On the Collections tab's tables and Home's list of collections and projects, pointing at a name shows a chip: a line per game it has, with its game badge and its count as CONFIRM BUY says it (bulk apart, a placeholder a card, struck apart). It floats above the page so a table can't clip it (`CardCountsName`, `countsByGame` in lib/bulk.js) |
| 275 | Show all finds struck cards (2026-10-16) | The owner: "Searches with Show all selected should find struck cards as long as it's clear they're struck in the search", and "use the show all button, don't make a new button". The header search's Show all also finds struck cards: crossed out like the day page's struck rows, a grey Struck chip, who struck it and when in its tooltip, an entry apart from the live copies of the same card. Paid/Ours only never shows them. Migration 0067: `global_search` takes `p_struck` (default false; the app sets it with Show all) and returns `struck_at`, `struck_by`; a struck card in a walk-in buy reads Completed once the rest of its game is. Amends decision 267 |
| 274 | The Changelog is written by the database (2026-10-16) | From the code review (FABLE_REPORT A2): a collection's Called and the Cash buys download were the only Changelog entries the browser wrote itself, hard-coding the row's shape and able to write any action. Migration 0064 gives them server functions (`collection_log_call`, `buy_log_cash_download`) and the app calls those. Step 2, migration 0072 after the squash and the push (0069 until the phone scanner took 0068–0070): the event writers run with the owner's rights and the store's role loses its insert right on `events` (SQUASH.md section 11a) |
| 273 | Bulk counted apart everywhere (2026-10-16) | The Phase 6 smoke test found "Also has 4 Pokémon cards" and the Changelog's "8 cards bought" counting a 100-card bulk item as one card, while CONFIRM BUY said "7 cards + 100 bulk". The owner: "Make it like confirm consistently. Bulk should keep separate, placeholders are cards though." The day page's link uses countText with the game's name; migration 0066 has the Changelog's sentences say "7 cards + 100 bulk …" (internal.count_text, line_counts, bulk_per) and its added / removed count cards only; a collection's add / remove rows carry bulk_per so a folded run counts bulk apart too. Entries written before stay as they were |
| 272 | Every card starts fresh (2026-10-16) | The Phase 6 smoke test found a card's condition, manual price, Use Fallback / Use Cardmarket and a placeholder's typed name came back when it was picked again, unless something had been set on another card in between. The owner chose "always start fresh" ("seems safer"): picking another card forgets them, as it already forgot the finish (usePricing.js, like usePrinting.js). CLEAR, ADD CARD and SAVE EDIT are unchanged; SAVE EDIT still puts back a line's own choices |
| 271 | Imports find Japanese-only printings too (2026-10-16) | The owner, on FABLE_REPORT A8 ("It would be better if JP printings were matchable"): Import Collection's searches (a row's name, its set and number, the fallback search everywhere, and "Find another printing by name") ask Scryfall with no `lang:` term and keep English and Japanese printings, as the Buy tab's do (decision 269): an English pack's Japanese printing (Mystical Archive's Japanese alternate art) can match a row, a Japanese copy of an English card can't. A line matched to one is saved as Japanese, "[JP]" on it. The file's Language column is unchanged: a row has to say English (or nothing), which is what Crystal Commerce, and our own EXPORT, write for those cards |
| 270 | Placeholders (2026-10-16) | The owner, for a card the search can't find yet ("a quick solution before we add in the missing cards later in a patch"): two items, "1 BULK placeholder" for each game, found by searching "bulk" like the rest. Bulk in most ways (bulk_kind `mtg_placeholder` / `pkm_placeholder`, set BULK, no number, NM, no finish; never exported, completed, printed or in Settings → Bulk values), a card in others: its **name is typed in** on the stage (a dashed box with ✎, any text, e.g. "Team Rocket's, Meowth 117"; empty, "Placeholder"), its **price is always typed in** (the box starts empty; ADD CARD waits for it; price_source always manual), one card per item and Qty counts cards; owner's choices: a card's rates (low end / high end by its price, Set Rate), Qty adjustable (the same name and price merge; every merge now also needs the same name), and the header search finds it by its name. Lines read "1 Team Rocket's, Meowth 117 [Placeholder]" and count as cards. REPRICE? keeps its price. Migration 0062; database test run 394 checks |
| 269 | Japanese-only Magic printings in English searches (2026-10-16) | The owner: "Instead of allowing JP MTG searches all I want to do is allow the JP cards like JP Mystical Archives cards that are found in english packs to be found during normal english card-name searches" (missing: Cyclonic Rift SOA 79, Japanese). The Magic search and the details panel's siblings ask Scryfall with no language, which gives one card per printing, English where there is one, else the printing's own language, and keep English and Japanese: Japanese-only printings (Mystical Archive's Japanese alternate art, War of the Spark's, Japanese promos…) come up beside the English ones; Japanese copies of English cards don't, and there's still no JP Magic mode. Such a card is a Japanese line ("[JP]"), with a JP tag on its suggestion, "Japanese" in its details and a Japanese trait (a checkbox flipping to the set's English printing where there is one). Priced from its own JustTCG listings (any language when none say Japanese), else Scryfall. Export matching knows CC's "- Japanese Alternate Art" / "- Japanese" / "(JP Exclusive)" products (a Japanese variant family). No migration |
| 268 | A confirmed buy keeps the rates it was priced at (2026-10-16) | Reverses decision 265's CONFIRM BUY part. The owner: "we need to capture, save, and display the cash and credit prices from the time of the buy instead (including custom rates)", after a buy paid $350 credit at a custom rate showed Cash $215 / Credit $400 (default rates with the low-end / high-end ones) on its day page. CONFIRM BUY keeps the buy's custom rates and each card's own rate and fixes on each card the rate it was priced at (custom buy rates: no low-end / high-end), so the day page shows what the confirm dialog showed, labelled with the buy's rates (✎ when custom), and stays right as cards are edited, struck or removed. The server takes the buy's custom rates itself. Buys confirmed under 0057 lost theirs for good. Projects still have no rates; Convert to buy still uses the default rates. Migration 0061 |
| 267 | Struck cards (2026-10-16) | The owner: "I want workers to be able to mark cards as moved, but I still want record of them in the places you'd expect. EG: What if someone puts a card from a buy directly into the case." In a Paid/Ours walk-in buy or collection (not a project or Can't upload cards, whose × removes at once; owner's choices), the first × **strikes** a card (some or all copies, asked as for removing): it stays on the list crossed out and dimmed, with who struck it and when in its tooltip, and is treated as gone by exports, Check matches, COMPLETE, Mark as completed, printouts, the header search, REPRICE? and the card counts ("42 cards · 2 struck"); a buy or game is Completed once its other cards are. It **still counts in the totals** and the Cash buys file (owner's choice: it was bought and paid for). A second × removes it for good; right-click → **Restore** takes the strike off (owner's choice). Struck copies split off into a struck line just below, or join a struck twin (same card, condition, price and rates); a restore joins a live twin. Struck lines never merge with cards added or edited and can't be edited or rated. Edit in project view strikes and restores too, saved with SAVE BUY. Convert to project leaves a buy's struck cards out, as if deleted (the owner: "don't worry about struck existing inside projects"), listed crossed out in its Changelog entry. Changelog: "Cards struck in buy / collection", "Struck cards restored to …", rows crossed out. Migrations 0059 and 0060 (`buy_lines.struck_at`, `struck_by`; `buy_strike_line`, `buy_restore_line`, `collection_strike_line`, `collection_restore_line`; `buy_save_edits` takes `p_struck`, `p_restored`; 0060: projects refuse `project_no_strike`, `buy_to_project` leaves struck lines out); database test run 387 checks |
| 266 | Bulk built (2026-10-15) | Phase T3 of `docs/TEAM_FEEDBACK.md` (section 5). Eight bulk items (100 MTG commons/uncommons $1.50, 100 rares/mythics $2.40, 10 $1 cards $8, 10 50¢ cards $3; PKM 100 $0.75, 100 EXs $2.40, 10 $1 cards $7, 10 50¢ cards $2.50), values in Settings → **Bulk values**. Found only by searching "bulk" (items first, then cards) or "BULK" (items only), narrowed by more words. Drawn as a stack of the game's card backs; one price per item, no condition or finish; Qty counts items. Lists read "1,000 MTG Bulk commons/uncommons" with "$1.50 per 100" and count "42 cards + 1,000 bulk". Master or custom rates only, never low-end / high-end. Right-click → **Set value** (dollars per item, live Cash / Credit). Exports, Check matches, COMPLETE, Mark as completed, printouts, the header search and Home's counts leave it out; a buy is Completed once its real cards are; REPRICE? puts it back on its Settings value. Conversions bring it along. Migration 0058 (`buy_lines.bulk_kind`); database test run 359 checks |
| 265 | Custom rates only help price (2026-10-15) | The owner: "Custom rates are a tool for pricing buys, but not important to persist"; "Projects don't need rate controls at all. Projects are just cards we already own." Migration 0057: CONFIRM BUY and Convert to buy put the buy on the default rates (each card's default rate kept, the buy's custom rates and the cards' own forgotten); Convert to project leaves no rates on the project or its cards; a project refuses custom rates and Set Rate (`project_rates`) and its list shows plain Cash / Credit labels with no right-click menu; REPRICE? leaves rates alone. A customer collection keeps custom rates and Set Rate, kept at Paid/Ours. `docs/TEAM_FEEDBACK.md` decision 14 |
| 264 | Individual rates built (2026-10-15) | Phase T2 of `docs/TEAM_FEEDBACK.md` (section 4). Each card's Cash and Credit rate, strongest first: its own (right-click → **Set Rate**, beside the card; Clear) → the buy's or collection's custom rates (which turn the next step off) → **Low-end and high-end rates** (Settings, beside Master Buy Percentages: strictly under $3 at 50% credit / 25% cash, over $35 at 70% / 40%, by the card's unit price) → the base rate. `src/lib/rates.js` works it out for the app and `internal.line_pct` (migration 0055) for the database. Every total is each card × its rate, added up, rounded down once (rate by rate, so one rate is exactly the old payout): the lists, CONFIRM BUY, Paid/Ours, Priced's credit offer (the cards' Credit ÷ Cash when mixed), the day page, the Changelog (`internal.lines_totals`; `buy_event` takes the totals; `collection_totals` dropped; a folded run reads each row's rate). The labels keep the base rate, with a **CUSTOM** chip only when a card in the list has its own rate (owner, 2026-10-15; the low-end and high-end rates show none, almost every trade has them). The price panel's chips use the selected card's rate and say why. A card with its own rate is tinted with a ✎ Credit / Cash tag. CONFIRM BUY, Paid/Ours and Convert to buy list every card with its own rate: the card in full, then its Credit and Cash rates, one line each (owner, 2026-10-15). Rates are kept on each card at confirm / Paid/Ours / Rejected / Convert to buy; migration 0055 copied each past buy's rates onto its cards, so every past total is unchanged (checked on dev: 39 buys). No Set Rate in Edit in project view, on Completed cards or locked collections. The same card merges, own rate or not (owner, 2026-10-15, migration 0056: "I can't imagine a situation where I would actually want to treat it as a different rate"); merged, a line keeps an own rate either card had. Database test run: 346 checks |
| 263 | Collection and project ⋯ menus like a buy's (2026-10-14) | A consistency pass with a buy's ⋯: a collection's or project's ⋯ (on its screen, and its row on the Collections tab) has **Print collection** / **Print project** (the audit printout of its Magic cards, as EXPORT ▾ → Print?; from a row its cards are fetched once the printout's tab is open), then **Convert to buy** (projects; no "…", like Convert to project), then **Delete collection… / Delete project…**. Convert to buy's dialog has the **🚩 Flag check for condition** box, like CONFIRM BUY, flagging the buy it makes. Not carried over: Mark as completed (a collection is Completed only by EXPORT, decision of 2026-10-01; Reopen undoes it), Export single buy (EXPORT is on its screen), Edit in project view (it is one), Condition checked (collections aren't flagged) |
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
