# FABLE.md — how to work on this codebase

Written by Claude Fable 5.1 on 2026-10-16 after reading the whole project
(`src/`, `supabase/migrations/`, `supabase/functions/`, `scripts/`, `tests/`,
`docs/`) and the 414 commits that built it between 2026-09-28 and 2026-10-16.
It is for whichever model continues the work (Opus, by default). CLAUDE.md
still holds the project facts and the hard rules; this file holds the *method*:
how to think before touching code here, what to check, and what the last
nineteen days show gets skipped.

Read this once at the start of a session, then CLAUDE.md, then the part of
`docs/DESIGN_SPEC.md` the task touches.

The concrete fixes this review found (`FABLE_REPORT.md`, items A1–C6) were
all made on 2026-10-16 and the report retired. It's in git history
(`git show 0ef948c:FABLE_REPORT.md`): code comments that cite
"FABLE_REPORT C1" and the like point there. What it left for later, the
migration squash and locking the Changelog to the database (0072), is in
`SQUASH.md`; the rules it found are below. The same goes for the smoke
test of its last phase: comments citing "TEST_PASS finding 1" point at
`git show 4412187:TEST_PASS.md`, and its results are in `docs/TEST_RUNS.md`.

---

## 0. The one-paragraph version

Before writing anything: say in one sentence what will change and what will
*not*; read the whole path the change crosses (component → hook → lib → RPC →
migration → `scripts/db-test-run.sql`), not just the file you were pointed at;
grep for the helper that already does it; list the states that could break
(buy kind × status × lock × offline × user, bulk/placeholder/struck lines, JP
Pokémon, custom rates, version conflicts); then write the smallest diff that
survives that list. After writing: lint, `npm test`, `npm run build`, and for
database work the begin/rollback rehearsal and `node scripts/db-test-run.mjs`.
Hand over with "where to look", not with proof. Commit; don't push.

---

## 1. How Fable reads a task

### 1.1 The request is a symptom; find the rule behind it

The owner describes what they saw at the counter ("Cyclonic Rift SOA JP 79 was
missing", "the strikethrough is too faint"). Each of those is one instance of a
rule that already exists or needs to. Before coding, name the rule:

- *Missing JP Mystical Archive* → "English-pack Japanese printings must appear
  in English name searches" → the `lang:` filter on every Scryfall query, not a
  special case for SOA.
- *Struck cards* → "a line can be kept as a record but excluded from every
  export and move" → one predicate (`movesOn`) that every export/complete/
  convert path consults, not a check added to the three places you noticed.

If the rule isn't in DESIGN_SPEC yet, it goes there as a numbered decision
*in the same commit*, and code comments cite the number, not the date.

### 1.2 Draw the path before editing it

Every user-visible behaviour here crosses four layers. Opus consistently edits
the layer it was shown and assumes the others agree. They don't, by default:

| Layer | Where | What breaks when skipped |
|---|---|---|
| UI | `src/pages/**`, `src/components/**` | tooltips/blocked reasons go stale (CollectionPage's did, until `lib/blocked.js`) |
| Pure logic | `src/lib/**` (tested under Node) | the same rule gets re-derived inline in a component (PricingScreen rebuilt candidate keys three libs owned, until `lib/candidateKey.js`) |
| RPC contract | `supabase/migrations/00NN_*.sql`, `public.*` / `internal.*` | the function's return table lacks a column the app now needs, so the app infers it (`global_search` lacked `bulk_kind` and the app guessed placeholders from `set_code = 'BULK'`, until 0063) |
| Database test | `scripts/db-test-run.sql` | a new state (struck, placeholder) is never exercised against the real constraints |

Rule: open all four before writing. If a change touches two layers it almost
always touches the third.

### 1.3 Read before you remember

Context gets compacted. A summary that says "`global_search` returns
`bulk_kind`" is a claim, not evidence. Any fact you are about to build on —
a column name, a function signature, an RPC parameter, a CSS class, a line
number — gets re-read from disk in this session before you use it. Persisted
tool outputs from earlier in the session count as disk; summaries don't.

### 1.4 Grep for the helper first

This codebase already has most of what a feature needs. The cost of a
duplicate is not the extra lines; it is the two copies drifting (the review
found six error-message tables, seven game-name constants and eleven
hand-rolled Escape/outside-click effects; each is one module now). Before
writing a helper, run these and read the hits:

```bash
grep -rn "function <verb>" src/lib src/components src/pages
grep -rn "<the string you were about to type>" src
grep -rn "create or replace function .*<name>" supabase/migrations
```

Things that exist and must be reused (not reimplemented):

- `withLoading(fn)` (`src/lib/loading.js`) around every RPC; `GuardButton`
  for anything that needs a user; `Modal` for every dialog; `useToast`.
- `dbMessage`, `dbErrorCode`, `DB_MESSAGES` (`src/lib/dbErrors.js`): every
  RPC refusal's words, matched by its exact code. `errorMessage(error,
  failure)` in `src/pages/collections/useCollection.js` is the toast built on it.
- `useLiveTable(table, query)` for realtime tables; `channelName(prefix)`
  (`src/lib/channels.js`) names every channel.
- `useDismiss` (`src/lib/useDismiss.js`) for Escape and outside clicks;
  `GAMES`, `GAME_NAMES`, `otherGame` (`src/lib/games.js`); `firstReason`
  (`src/lib/blocked.js`) for a button's "why not"; `useSettingField`
  (`src/pages/settings/`) for a Settings box; `RemoveModal`
  (`src/components/`); `useBackupDownload` (`src/lib/`).
- `isBulk`, `isValuedBulk`, `isPlaceholder`, `cardCounts`, `countText`,
  `bulkSearch` (`src/lib/bulk.js`); `isStruck`, `movesOn`, `struckNote`
  (`src/lib/struck.js`); `rateTotals`, `tiersFrom`, `customNote`
  (`src/lib/rates.js`); `conditionVariants`, `priceLadder`, `CONDITIONS`
  (`src/lib/prices.js`); `nameKey` (`src/lib/normalize.js`).
- Changelog: actions are a registry in `src/lib/changelog.js` (`HEADLINES`);
  every entry is written in SQL (`internal.buy_event` /
  `internal.collection_event`; a collection's Called and the Cash buys file
  through `collection_log_call` / `buy_log_cash_download`, 0064), never by a
  client-side `supabase.from('events').insert`. Counts say cards and bulk
  apart (`internal.count_text`, 0066; `countText` in the app).
- Candidate keys: `mtg:<scryfall_id>`, `pokemon:<lang>:<tcgdex_id>`,
  `pokemon:<lang>:jt:<justtcg_card_id>`, `pokemon:dex:ja:<n>`, `bulk:<kind>`.
  Built only by `src/lib/candidateKey.js` (`magicKey`, `pokemonKey`,
  `justtcgKey`, `bulkItemKey`, `candidateKeyOf`; `editQuery` for SAVE
  EDIT's search). Nothing else may format one by hand.
- SQL: `internal.same_card(a, b)` (the merge rule, 0065), `internal.same_line(a, b)`
  (strike/restore), `internal.strike_line`, `internal.restore_line`,
  `internal.fix_line_rates(buy)`, `internal.collection_for_write`,
  `internal.count_text` / `line_counts` / `bulk_per` (0066). A `public.*`
  function that calls one needs `set search_path = public, internal`.
  Every function's live body is in `supabase/current/<schema>.<fn>.sql`.

---

## 2. The four gates

Every change passes these in order. "Passing" means you could answer the
question out loud with file:line evidence, not that you feel confident.

### Gate 1 — Scoping

Write (to yourself, or to the owner when it changes the diff) before coding:

1. **One sentence**: "After this change, X happens when Y; nothing else changes."
2. **In scope / out of scope**: the files and functions that will change, and
   the adjacent things you are deliberately leaving alone. If the out-of-scope
   list is empty you haven't looked.
3. **Smallest shippable slice.** The owner rejected a 26-file batch
   (`f81276d`) wholesale and accepted the same work as four small changes.
   One behaviour per commit. If a feature needs a migration *and* UI *and*
   docs, that is still one slice if it is one behaviour; it is three slices if
   it is three behaviours.
4. **Questions**: at most three, only when the answer changes what you'd
   write, with your recommended default first. Never ask about things the
   code or DESIGN_SPEC already answers. Never ask "shall I proceed".
5. **Stop conditions**: the owner's standing rules win over the request.
   No new settings, features or dependencies beyond the spec without asking.
   No README/Help edit per change unless asked (flag large changes in one
   line). No push. No touching other projects.

### Gate 2 — Evidence

Before the first edit, you can point at:

- The **current** definition of every function/RPC/component you'll change,
  read this session. For SQL: `supabase/current/<schema>.<fn>.sql`, the live
  body as of the last `node scripts/db-snapshot.mjs`, not your memory of it
  and not an older migration.
- Every **caller** of what you're changing (`grep -rn "<name>(" src`). A
  signature change with an unread caller is a bug you've already written.
- The **test** that covers it (`tests/*.test.js`, or the section of
  `scripts/db-test-run.sql`). If none exists, the slice includes adding one.
- The **spec decision** it implements or amends (`docs/DESIGN_SPEC.md`,
  numbered). If it isn't there, the slice includes writing it.
- For UI copy: the **existing voice**. This app speaks in short, plain
  sentences to counter staff ("Pick a user first", "No connection",
  "Paid/Ours: unlock it to edit"). Match it; don't invent a second tone.

Evidence you may *not* use: a summary from before compaction, a line number
you haven't re-read, "the usual Supabase behaviour", a column you believe
exists.

### Gate 3 — Adversarial planning

Enumerate what could break *before* writing, in this order, and decide for
each whether the change must handle it or is explicitly out of scope:

**State matrix (always):**
- Buy kind: walk-in draft · confirmed buy · collection · project · system
  (Can't upload cards).
- Status: processing · priced · paid · completed · rejected (and `project`
  flag on paid).
- Lock: `checking` · `held` · `other` (view only) · lost mid-action.
- Connection: online · offline (`useConnection().offline`) · epoch bump
  (reconnect → reload).
- User: none picked · picked · changed mid-dialog.
- Version: `p_expected_version` stale → `version_conflict` → reload, not retry.

**Line kinds (always):**
- Normal card · valued bulk · placeholder (manual price, editable name,
  `bulk_kind` set, `set_code = 'BULK'`) · struck (`struck_at` set; counted in
  totals, excluded from export/complete/convert/`movesOn`).
- Magic: finish nonfoil/foil/etched · JP printing (`lang = 'ja'`) in an
  English search · custom rate on the line (`cash_pct`/`credit_pct` own) ·
  tier rates (low/high) vs master vs buy custom.
- Pokémon: en/ja · `No.` numbering · TCGdex-less (JustTCG-only) card ·
  1st Edition · full-art/rule-box sheen.

**Money (always):**
- Rates captured at confirm time (migration 0061) vs recomputed live; never
  mix in one display. `✎` marks custom.
- `payout()` rounds down; totals are sums of rounded lines, never a rounded sum.
- Cents as numbers compared with `Math.abs(a-b) >= 0.005`, never `===`.
- **When a rule about money or exports flips**, list the rows created under
  the old rule and say what happens to them *before* writing the migration.
  0057 ("rates only price") was reversed by 0061 four migrations later, and
  buys confirmed in between lost their custom rates for good.

**Concurrency (when realtime or multi-computer is involved):**
- Two computers on the same buy/collection: lock heartbeat, takeover, the
  realtime payload arriving before your own reload resolves (`ticket` /
  `version` refs in `useCollection.js:77-78,90`).
- A subscription firing twice; an unmounted component receiving a result
  (`let alive = true` pattern).

**Exports (whenever `buy_lines` change shape):**
- `export_lines`, `buys_in_range`, `day_complete`, `buy_mark_completed`,
  `buy_to_project`, `global_search`, backup/restore (`restore_rows`), and the
  app-side `movesOn`/`isValuedBulk` filters. A new line state that isn't
  excluded in every one of these leaks into Crystal Commerce.

Write the list down. Then write the code so that each item is either handled
or named as out of scope in the handoff.

### Gate 4 — Verification

Match the owner's stated process (memory `user-is-qa`): **they test the UI.
You do not.** No browser, no static mock, no screenshot, no "let me render it
and check". What you do run, every time, before saying "done":

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm run lint
npm test
npm run build
```

For a migration, in this order and never skipping the first:

```bash
(echo "begin;"; cat supabase/migrations/00NN_name.sql; echo "rollback;") > /tmp/rehearse.sql
npx supabase db query --linked -f /tmp/rehearse.sql     # must succeed with no errors
npx supabase db push --linked --yes
node scripts/db-test-run.mjs                            # all checks must pass; add checks for the new state first
node scripts/db-snapshot.mjs                            # refresh supabase/current/; commit it with the migration
```

Then the handoff, in this shape:

> Done: <one sentence>. Where to look: <page → action → expected>. Not
> covered: <the out-of-scope items from Gate 3>. Tests: N passing, build OK,
> db-test N checks.

Report failures as failures, with the output. If a step was skipped, say so.

**The one exception: a smoke pass the owner asks for.** On 2026-10-16 the
owner had Claude drive a whole smoke test in the preview browser while
they were away (TEST_PASS.md, in git history at `4412187`; its results are
in docs/TEST_RUNS.md). If asked again, run docs/TEST.md the same way:

- **Before the owner leaves, get everything in one go.** They sign in
  (never type the store password), name the computer, pick or add a
  `SMOKE …` user and download a backup. They approve in advance each kind
  of write the run makes (test buys, status changes, CONFIRM BUY, Settings
  edits typed straight back, the deletes at clean-up) and say what to do
  on a P1 (note it and carry on).
- **Test data is named `SMOKE …`**, with 555 phone numbers. Never touch a
  real customer's buy or collection. Never confirm an EXPORT or COMPLETE:
  they mark real buys.
- **Note JustTCG usage and the Settings values** at the start, type a
  changed value back at once, and compare both at the end.
- **Nothing is fixed during the run.** Each finding gets steps, expected,
  a priority (P1/P2/P3), and whether the live build has the same code, so
  an old bug isn't reported as a regression.
- **Clean up:** delete the SMOKE buy, collections, projects and user; stop
  the preview; remove `.claude/launch.json` (config "pug-dev":
  `npm run dev -- --port 5180 --strictPort`, port 5180).
- **Preview gotchas.** On the app's zoomed pages a screenshot's
  coordinates don't line up with the pointer: click by element ref
  (`find` / `read_page`), not by coordinates. A "Failed to load resource"
  404 from api.scryfall.com is Scryfall's normal "no cards found" for a
  Pokémon query. The dev server inlines `styles/price/*.css` into one
  `price.css` request. Today's EXPORT and COMPLETE are blocked until the
  day is over, so their dialogs can only be opened on a past day.

---

## 3. What Opus repeatedly did here (and the rule for each)

These are the patterns found in the code and the history, not hypotheticals.
Each was fixed by that review; the evidence is as it stood before, and the
rule is what keeps it from coming back.

| Pattern seen | Evidence | Rule |
|---|---|---|
| Edits the file it was pointed at; misses the sibling that enforces the same rule | `importCollection.js:177,314,331,468` still `lang:en` after decision 269 removed it everywhere else | Grep the string you're removing across `src/` and `supabase/` before you call it removed. If a leftover is intentional, say so in a comment citing the decision. |
| Copies a per-page constant instead of importing one | `GAME_NAMES` in `DayPage.jsx:33` and `BuyEditPage.jsx:18`; `GAMES` in `CalendarPage.jsx:18`, `ChangelogPage.jsx:21`, `SearchBar.jsx:12`, `FallbackPanel.jsx:8`, `BulkValuesPanel.jsx:9`; `MESSAGES` ×5 | A constant used in two files lives in `src/lib/`. The second copy is the moment to move it. |
| Writes the same effect by hand each time | Escape + outside-click in `BuyList.jsx:135-148,229-245,358-374,584-601`, `DayPage.jsx:884-898,980-997`, `MoreMenu.jsx:46-60`, `ExportButton.jsx:24-38`, `UserMenu.jsx:32-46`, `SearchBox.jsx:102-109`, `QuotePanel.jsx:37-44` | Three similar effects → one hook in `src/hooks/`. |
| Repeats a 10-line RPC-call ritual per action | Ten `setBusy(true)→withLoading(rpc)→setBusy(false)→toast→reload` blocks in `DayPage.jsx:235-465` while `useCollection` already has `run()` | One `run(name, args, failure)` per page/hook; the action functions become one line each. |
| Lets a component accrete every concern | `PricingScreen.jsx` 900 lines, 17 props, ~25 `useState`; `DayPage.jsx` 1277 lines with three modals and a panel inline | A component over ~300 lines or with a second unrelated `useEffect` cluster gets split: pure logic to `lib/`, state to a hook, sub-views to files. |
| Re-derives a value that is already in scope | `PricingScreen.jsx:545` rebuilds `variantOpts` (L254); L556 recomputes `conditionVariants` though `marketVariants` (L301) exists | Before computing, scroll up. If the same inputs are already combined, use that binding. |
| Re-emits whole SQL function bodies to change one line | `collection_set_status` defined 8×, `export_lines` 7×, `draft_add_line`/`draft_update_line`/`collection_add_line`/`collection_update_line` 6× each; `0055` is 1,871 lines | Unavoidable with `create or replace`, so: (a) one function per migration unless they must move together; (b) write it as a patch of the `supabase/current/<fn>.sql` snapshot, so the diff is reviewable (SQUASH.md section 11). |
| Duplicates the merge predicate in four functions | `0062_placeholders.sql:65-70,124-129,212-217,297-302` (and `internal.same_line`) | One `internal.same_card(a, b)` predicate; four callers. Any new "same line" rule changes one place. |
| Infers in the app what the RPC should return | `markPlaceholder` from `set_code = 'BULK'` because `global_search`'s return table lacks `bulk_kind` | Change the contract, not the consumer: add the column to the return table. |
| Nested ternaries in JSX | `PricingScreen.jsx:763-766`; `QuotePanel.jsx:86-89` | Two levels max. Beyond that, a named `const` or a small function above the `return`. |
| Dates as provenance in comments | 495 `(owner, 2026-MM-DD …)` comments in `src/` | Comments say *why*; `docs/DESIGN_SPEC.md` decision numbers say *who/when*. Cite the number: `// decision 269`. A policy, not a sweep: convert a dated comment when you edit its line, and give a spec entry a decision number when it lacks one. |
| Big-bang commits | `da24b3b` 61 files, `3455cd2` 43, `13e6544` 32, `f81276d` 26 | One behaviour per commit, tests in the same commit. The owner can revert one slice without losing the day. |
| Spec/README churn | `docs/DESIGN_SPEC.md` touched in 285 of 414 commits; README updated in batches on request | Spec: a numbered decision per change, in the change's commit, nothing else. README/Help: only when asked. |
| Verifying visuals itself | A static mock + headless screenshot for the struck row (2026-10-16), corrected by the owner | Never. Describe where to look. |

---

## 4. Project-specific habits that are *right* and must be kept

Not everything here is a problem. These are deliberate and the next model
should recognise them as such, not "clean them up":

- **Plain-language comments and copy.** The code reads like a conversation
  with the counter staff. Keep the register; don't swap in jargon.
- **Pure `lib/` + Node tests.** Everything with logic lives in `src/lib/` and
  is tested with `node --test` — no React test harness. New logic follows.
- **`internal` schema** for helpers only the database calls (migration 0040).
- **Version-checked RPCs** (`p_expected_version`) and `version_conflict` →
  reload. Never retry a conflicting write.
- **Rates captured, not recomputed, once a buy is confirmed** (0061). The
  `✎` mark means custom. Displayed Cash/Credit on a confirmed buy are the
  stored ones.
- **Realtime by table + reload**, not by patching local state from payloads.
- **Owner is QA.** The handoff is "where to look".
- **Backups before destructive data work**; dev project only.

---

## 5. Token and speed discipline

Observed waste: re-reading files already in context, reading 1,200-line files
whole to find one function, narrating options that won't be taken, and
writing verification scripts the owner said not to write.

- Read ranges (`offset`/`limit`), not whole files, once you know the shape.
  Use `grep -n` to find the range first.
- Batch independent reads/greps in one message.
- Don't re-read a file you just edited to confirm the edit.
- Don't restate the request, the plan, or the summary; act.
- One answer, one recommendation. No menus of options unless asked.
- No "let me verify by building a mock". No end-to-end repro scripts.
- When a migration needs the live body: start from
  `supabase/current/<fn>.sql` and patch it with a script that asserts each
  replacement matches once (0066's generator is the model).

---

## 6. Definition of done (copy into your head for every slice)

- [ ] One-sentence scope written; out-of-scope named.
- [ ] Every layer on the path read this session (UI → lib → RPC → db-test).
- [ ] No new copy of a constant/helper that `grep` found elsewhere.
- [ ] Gate-3 list written; each item handled or named out of scope.
- [ ] New line/buy state excluded from *every* export/complete/convert path, or
      explicitly included with a decision number.
- [ ] Test added/updated (`tests/*.test.js` or `db-test-run.sql` section).
- [ ] DESIGN_SPEC decision number added; code comments cite it.
- [ ] `eslint` · `npm test` · `npm run build` (· migration rehearsal ·
      `db push` · `db-test-run`) all green, output seen.
- [ ] Committed with the attribution trailer. Not pushed.
- [ ] Handoff: done / where to look / not covered / numbers.

---

## 7. Checked and found sound (don't "fix" these)

From the review's appendix: things that look odd and are right.

- `byHand = completed && lines.filter(movesOn).every(markedByHand)` in the
  day page's buy panel: correct since struck cards (decision 267).
- Rates captured at confirm (0061): `coalesce(b.custom_cash_pct,
  p_cash_pct)`, then `internal.fix_line_rates(b)`. Displayed Cash/Credit on
  a confirmed buy are stored values; `✎` marks custom. Buys confirmed
  between 0057 and 0061 lost their custom rates; not recoverable.
- `useCollection.js`'s ticket/version refs and `useLiveTable.js`'s
  stale-result handling.
- `let alive = true` / `live` cleanups in `RestoreModal`, `ProductsModal`,
  `ImportDialog`, and `CustomerNameInput`'s `run` counter.
- `todaysPrices.js`'s raw `fetch` with its own retry and `Retry-After` loop:
  it POSTs, and `createTransport` (`transport.js`) only has `getJson`. Add a
  `postJson` to the transport when a second POST appears; until then, leave it.
- `pdfSafe` (`auditPdf.js`), the `pokemonImages.js` fallbacks,
  `transport.js`'s spacing and retries, and the `keptLanguage` filter.
- `scryfall.js` queries without `lang:`, plus `keptLanguage`: decision 269.
- Two "same line" rules on purpose: `internal.same_card` (a merge on add
  ignores rates) and `internal.same_line` (a strike or restore must land on
  an identical line, rates and all).
- Striking every card of one game in a walk-in buy makes that side read
  **Completed** with EXPORT (0): nothing is left to export (`walkInStatus`).
  Restore puts it back.
- A very rare printing can have no price at all, not even a fallback
  (Charizard 4/102 BS 1st Edition: "no price: enter a manual price"):
  JustTCG has none for it. The owner: fine, use a manual price (2026-10-16).

**Removing CSS.** Class names built in template strings don't show up in a
plain grep. These prefixes are used that way and must stay: `col-w-*`,
`era-*`, `tier-*`, `k-*`, `r-*` (rarity), `cond-*`, `is-*`.
To list candidates, then read each hit before deleting:

```bash
cd src/styles && for c in $(grep -ohE "^\.[a-z][a-z0-9-]*" *.css price/*.css | sort -u | sed 's/^\.//'); do
  case "$c" in col-w-*|era-*|tier-*|k-*|r-*|cond-*|is-*|on|off) continue;; esac
  grep -rqE "[\"'\` ]$c[\"'\` ]|\b$c\b" ../ --include="*.jsx" --include="*.js" || echo "$c"
done
```
