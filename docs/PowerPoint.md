# PUG Pricing Tool: Training Presentation Plan

A plan for building a PowerPoint training deck for the PUG Pricing Tool, together, at a later time. **Nothing here has been built yet.** Each phase below ends with the owner's go before the next one starts (small changes first).

---

## 1. The brief (owner, 2026-10-09)

| | |
|---|---|
| **Audience** | Every employee who uses the software day to day. After it, they should be fully familiar with using it. |
| **Scope** | Every tab, tab by tab. Every major feature and every big button, but not edge cases or everything. |
| **Screenshots** | Claude takes them, and adds the circles, arrows and other graphics on its own. |
| **Look** | The store website's theme (https://www.playersuniongames.com/), or the project's own assets: the smoky background, the colours and the logo. |
| **How it's used** | Presented by a live speaker. Attendees sit at demo machines with the app open and try things during the session. |
| **Copy** | **No AI-generated text in the presentation.** Every word of copy is a placeholder (`<describing what to write>`), and the owner writes 100% of it. |

---

## 2. Ground rules for building it

### No AI-written copy
- **Everything that would be words is a placeholder.** That covers slide titles, subtitles, bullets, captions, callout labels, "Try it" exercise steps, the agenda and speaker notes.
- **Placeholder format:** angle brackets, describing what goes there and roughly how long it should be. For example:
  - `<Slide title: the name of this tab, 2–4 words>`
  - `<Speaker note: what this panel is for and when staff use it, 2–3 sentences>`
- **Placeholders are styled to stand out** (italic, muted colour), so unfilled ones are easy to spot in PowerPoint.
- **The only real words in the deck are the app's own,** as they appear inside screenshots.

### Graphics
- **Callouts on screenshots carry numbers only** (①②③…), never words. Each number has a matching placeholder line on the slide (or in the notes) for the owner to write what it points at.
- **Graphics come from a script, not drawn by hand.** Circles, arrows, highlight boxes and dimming outside the area of focus are added by a script, in one consistent style and colour, so they can be redrawn whenever the app's screens change.

### Privacy
- **Screenshots never show real customers.** No real names, phone numbers, Last 4 IDs, or real store data that shouldn't be on a projector.
- **They use demo data on dev** (fake customers like "Demo Customer A", and demo staff users).

### Output
- **An editable PowerPoint file (.pptx), 16:9,** with real text boxes the owner can type into. It's built with the PowerPoint skill (python-pptx).
- **A PDF copy at the end,** if wanted for handouts.

### Where files live
- **This plan stays in the repo** (`docs/PowerPoint.md`).
- **The working files stay outside it,** in `C:\ClaudeProjects\pug-training\`: the screenshots (raw and annotated), the annotation script, the build script and the deck. Screenshots are large and the deck is the owner's document, so neither belongs in the app's repository.

### Permissions
- **Screenshots of the live app are allowed for this project,** in the browser pane, with the owner signed in (owner, 2026-10-09).
- **Claude never types the store password.**

---

## 3. Decisions to settle first (Phase 0)

1. **Which backend the session runs on.** Attendees will click real buttons, so practice buys, collections and changelog entries go into whatever database the app is using.

   | Option | What it means |
   |---|---|
   | **a) Before launch, the live site on dev** **(recommended)** | Today the live site points at dev, so practice data lands there. |
   | **b) After launch, a local copy against dev** | `start.bat` on each demo machine, so prod stays clean. |
   | **c) Practice on prod, then delete it** | Not recommended. |

2. **Seats and users.** How many demo machines there are, and whether each attendee gets a demo staff user ("Trainee 1"…), so the Changelog shows who did what.
3. **Length.** A suggestion: about 60–75 minutes, including the hands-on time. The owner sets the real number, and the slide count follows from it.
4. **Theme source.** Either the store website's look (captured in Phase 1), or the project's assets: `public/background.webp` (smoky background), `public/pug-logo.webp`, and the colours in `src/styles/tokens.css` (`--bg #0f1220`, `--panel #181c2e`, `--accent #6c8cff`, cash green `#3ecf8e`, credit blue `#6c8cff`).
5. **Extras.** Whether to add a one-page cheat sheet to leave at the counter (also placeholders only), and a slide on using the app on a 1366×768 laptop.

---

## 4. The phases

### Phase 0: Decisions and setup *(owner and Claude)*
- Settle Section 3, and agree the placeholder style and fonts.
- Create `C:\ClaudeProjects\pug-training\` with the folders `screens-raw/`, `screens-annotated/`, `build/` and `deck/`.

**Owner's go:** the answers to Section 3.

### Phase 1: Theme and template
- **Capture the look.** Open playersuniongames.com in the browser pane, take a screenshot, and note its colours, fonts and logo use. Or use the project's assets, per decision 4.
- **Build a template .pptx** with these slide layouts:

  | Layout | Use |
  |---|---|
  | Title | Opens the deck |
  | Agenda | The sections |
  | Section divider | One per tab |
  | One screenshot with numbered callouts | Most slides |
  | Two screenshots side by side | Before and after a button |
  | "Try it" | The hands-on exercise |
  | Q&A / closing | Ends the deck |

  Every text box is a placeholder.

**Owner's go:** the template's look.

### Phase 2: Outline
- **Turn Section 5 below into the real slide list,** one row per slide: its purpose, the screenshot it needs, and its callouts. It contains structure only, no copy.
- **The owner reorders, cuts or adds slides,** and fits the list to the agreed length.

**Owner's go:** the slide list.

### Phase 3: Demo data and screenshots
1. **Seed demo data on dev,** with clearly fake names:
   - Buys on a few past days: Magic and Pokémon, cash and credit, one day already exported.
   - Collections in every status, including Rejected and one with a call logged.
   - A project, and some cards in Can't upload cards.
   - A small demo CardBot CSV for the Import exercise.
   - Demo staff users.

   Real customer data is never shown.
2. **The owner signs in** in the browser pane.
3. **Claude captures every screen on the shot list at 1920×1080,** including open dialogs and menus, named `NN-tab-what.png`. Raw copies are kept in `screens-raw/`.
4. **The owner reviews the shot set.** Retakes are cheap.

**Owner's go:** the screenshots.

### Phase 4: Annotations
- **A script draws the graphics** on each screenshot, in the theme's accent colour: numbered markers, circles, arrows, highlight boxes, and dimming of what's not the point of the slide. No words.
- **Output goes to `screens-annotated/`.** The script and its per-screen settings are kept, so a changed screen can be re-shot and re-annotated in one run.

**Owner's go:** the annotated set.

### Phase 5: Build the deck
- **Assemble it from the template and the annotated screenshots,** one section at a time, Home first so the owner can react to the style before the rest.
- **Every slide gets its placeholders:** title, numbered callout lines, speaker notes, and a "Try it" slide with placeholder steps at the end of each section.
- **Deliver `deck/PUG Training.pptx`.**

**Owner's go:** section by section.

### Phase 6: The owner writes the copy *(owner only)*
- **The owner fills in every placeholder in PowerPoint.** Claude writes no copy.
- **Claude can still help with the non-writing parts:** layout fixes (overflowing text, alignment), a changed screenshot, or moving slides around.

### Phase 7: Rehearsal and polish
- **Placeholder sweep.** A script lists every slide that still has `<…>` text.
- **Projector check.** Contrast, font sizes, and whether the callout numbers can be read from the back of the room.
- **Demo-machine checklist**, written by the owner, as placeholders:
  - signed in, with the computer named;
  - demo users in place;
  - Cash/Credit % set and the CC inventory uploaded on dev;
  - the demo CSV on each desktop;
  - the right backend from decision 1.
- **Final .pptx,** plus a PDF if wanted.

**Owner's go:** "ready to present".

### Phase 8: Keeping it current *(later)*
- **When the app changes,** re-shoot the changed screens from the shot list, re-run the annotation script, and swap the images. The owner's copy is untouched unless the feature itself changed.

---

## 5. Draft outline (structure only)

Each section ends with a **"Try it"** slide. In the deck, every title and line below becomes a placeholder; the descriptions here only say what each slide is for.

| # | Section (tab) | Slides: what each one shows |
|---|---|---|
| 0 | **Opening** | Title · agenda · what the tool is for · signing in (login screen) · naming this computer (first run) · the header: tabs, user button, header search · picking your user (everything is logged under your name) · adding a user and their colour |
| 1 | **Home** | The page at a glance · Today (buys, paid out, cards by game) · Quick actions · Collections and projects tiles (To price, Offer out, To export, Projects open, Can't upload) · Days to export (and recently exported) · Recent activity · the JustTCG warning bar |
| 2 | **Buy** (pricing) | The search bar: name, number, set code; MTG/PKM; EN/JP · the suggestions grid · the selected card and its info panel (rarity, TCGplayer and Cardmarket links) · finish and version (foil/etched; normal/holo/reverse; Poké Ball patterns) · the price table: conditions, cash and credit, fallback prices and warnings · a manual price · condition and quantity · adding to the buy list · the buy list and totals · CONFIRM BUY: name, phone, price paid, cash or credit |
| 3 | **Calendar** | The month view: game colours, exported days · a day page: the day's buys · a buy's ⋯ menu (Mark as completed, Convert to project, Export single buy, Delete buy) · EXPORT on a Magic day · COMPLETE on a Pokémon day, with Sell Prices in green · Export Cash Buys (n) |
| 4 | **Collections tab** | The three tables (System, Projects, Collections) · status filters and colours · search · "open on another computer" · + Price Collection (name, phone, Last 4 ID) · + Start Project · Import Collection |
| 5 | **Working a collection** | The collection screen (the Buy screen plus its list) · the details panel · the status flow: Processing → Priced (the offer) → Paid/Ours (the price paid) → EXPORT → Completed · Rejected (and Mark as Rejected?) · the 📞 call chip · one computer edits at a time: Take over · Unlock / Reopen · REPRICE? · Delete collection |
| 6 | **Projects and Can't upload cards** | What a project is (the store's own cards) · Can't upload cards: how cards get there and how they leave |
| 7 | **EXPORT to Crystal Commerce** | Before you start: the Master Crystal Inventory (Settings) · the export dialog: Needs a choice / Matched / Can't upload · picking a product (remembered next time) · Sell Prices · the pull-out list · the downloaded file and its Custom SKU · uploading it in Crystal Commerce (a CC screenshot the owner provides) · undo: Mark Paid/Ours again |
| 8 | **Import Collection** | The two CardBot files (Crystal Commerce format, TCGplayer format) · the review: matched, needs a choice, can't import · naming the project · dropping a CSV on an empty collection or project |
| 9 | **Header search** | Finding a card anywhere · Paid/Ours only vs Show all · jumping to the buy or collection |
| 10 | **Changelog** | Buys / Collections / Actions · the game filter · day pills · folded panels · who did what |
| 11 | **Settings** | This computer · Master Buy Percentages (Cash/Credit %) · fallback prices · API keys (JustTCG) and Usage · Master Crystal Inventory · Crystal Commerce matching (remembered products and sets) · Backups (download and the reminder; restore is for managers) · who should change what |
| 12 | **Wrap-up** | Recap · where to get help · Q&A |

### Shot list (starting point for Phase 3)
- **Opening:** the login screen, the first-run computer naming, and the header, with the user menu open and the add-user form.
- **Home:** the full page.
- **Buy:** an empty search; a search with suggestions (Magic, and Pokémon EN and JP); a selected Magic foil; a selected Pokémon holo; a manual price; the buy list with several cards; the CONFIRM BUY dialog.
- **Calendar:** the month view; a Magic day page; a buy's ⋯ menu; the EXPORT warning; a Pokémon day after COMPLETE; the Export Cash Buys button.
- **Collections:** the tab with all three tables; the + Price Collection dialog; the + Start Project dialog; the Import Collection review; the name step.
- **A collection:** in each status (Processing, Priced with the offer dialog, Paid/Ours with the paid dialog, Completed, Rejected); the call chip hover; view-only with Take over; the REPRICE? dialog; the Delete dialog.
- **A project, and Can't upload cards.**
- **Export dialog:** each group, the pull-out list, and the downloaded file opened in a spreadsheet.
- **Header search:** results, with Show all on and off.
- **Changelog:** each category, and a folded panel.
- **Settings:** each panel.
- **Drop-to-import:** the drop overlay on an empty collection.

---

*Plan written 2026-10-09. Start with Phase 0 when ready: "let's start the training deck".*
