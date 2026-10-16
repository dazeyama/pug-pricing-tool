# FABLE.md — how to work on this codebase

Written by Claude Fable 5.1 on 2026-10-16 after reading the whole project
(`src/`, `supabase/migrations/`, `supabase/functions/`, `scripts/`, `tests/`,
`docs/`) and the 414 commits that built it between 2026-09-28 and 2026-10-16.
It is for whichever model continues the work (Opus, by default). CLAUDE.md
still holds the project facts and the hard rules; this file holds the *method*:
how to think before touching code here, what to check, and what the last
nineteen days show gets skipped.

Read this once at the start of a session, then CLAUDE.md, then the part of
`docs/DESIGN_SPEC.md` the task touches. `FABLE_REPORT.md` is the companion:
the concrete fixes found on 2026-10-16, each with file:line evidence.

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
| UI | `src/pages/**`, `src/components/**` | tooltips/blocked reasons go stale (`CollectionPage.jsx:93-126`) |
| Pure logic | `src/lib/**` (tested under Node) | the same rule gets re-derived inline in a component (`PricingScreen.jsx:96-97` rebuilds the candidate keys that `cardSearch.js:76,251`, `bulk.js:98`, `justtcgCards.js:327` own) |
| RPC contract | `supabase/migrations/00NN_*.sql`, `public.*` / `internal.*` | the function's return table lacks a column the app now needs, so the app infers it (`global_search` has no `bulk_kind`; `globalSearch.js:44 markPlaceholder` guesses from `set_code = 'BULK'`) |
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
duplicate is not the extra lines; it is the two copies drifting (five
`MESSAGES` tables, four `GAMES`/`GAME_NAMES` constants, eleven hand-rolled
Escape/outside-click effects — see FABLE_REPORT B2–B4). Before writing a
helper, run these and read the hits:

```bash
grep -rn "function <verb>" src/lib src/components src/pages
grep -rn "<the string you were about to type>" src
grep -rn "create or replace function .*<name>" supabase/migrations
```

Things that exist and must be reused (not reimplemented):

- `withLoading(fn)` (`src/lib/loading.js`) around every RPC; `GuardButton`
  for anything that needs a user; `Modal` for every dialog; `useToast`.
- `errorMessage(error, failure)` in `src/pages/collections/useCollection.js:63`
  — the pattern every RPC failure should go through (today it is copied).
- `useLiveTable(table, query)` for realtime tables; its channel naming
  (`live:${table}:${++channelSeq}`) is the model for the three
  `Math.random()` channels in `DayPage.jsx:150`, `useCollection.js:118`,
  `useCollectionLock.js:106`.
- `isBulk`, `isValuedBulk`, `isPlaceholder`, `cardCounts`, `countText`,
  `bulkSearch` (`src/lib/bulk.js`); `isStruck`, `movesOn`, `struckNote`
  (`src/lib/struck.js`); `rateTotals`, `tiersFrom`, `customNote`
  (`src/lib/rates.js`); `conditionVariants`, `priceLadder`, `CONDITIONS`
  (`src/lib/prices.js`); `nameKey` (`src/lib/normalize.js`).
- Changelog: actions are a registry in `src/lib/changelog.js` (`HEADLINES`);
  new events are written by `internal.buy_event` / `internal.collection_event`
  in SQL, never by a client-side `supabase.from('events').insert` (two legacy
  sites still do: `CallChip.jsx:44`, `cashBuys.js:115`).
- Candidate keys: `mtg:<scryfall_id>`, `pokemon:<lang>:<tcgdex_id>`,
  `pokemon:<lang>:jt:<justtcg_card_id>`, `pokemon:dex:ja:<n>`, `bulk:<kind>`.
  They are owned by `cardSearch.js` / `bulk.js` / `justtcgCards.js`. Nothing
  else may format one by hand.
- SQL: `internal.same_line(a, b)`, `internal.strike_line`, `internal.restore_line`,
  `internal.fix_line_rates(buy)`, `internal.collection_for_write`. A `public.*`
  function that calls one needs `set search_path = public, internal`.

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
  read this session. For SQL: the live body via `pg_get_functiondef` (or the
  last migration that defined it — `grep -rn "create or replace function
  public.<name>" supabase/migrations | tail -1`), not your memory of it.
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
npx --yes eslint@9 -c <config> "src/**/*.{js,jsx}"   # see FABLE_REPORT C5: add the config to the repo
npm test
npm run build
```

For a migration, in this order and never skipping the first:

```bash
(echo "begin;"; cat supabase/migrations/00NN_name.sql; echo "rollback;") > /tmp/rehearse.sql
npx supabase db query --linked -f /tmp/rehearse.sql     # must succeed with no errors
npx supabase db push --yes
node scripts/db-test-run.mjs                            # all checks must pass; add checks for the new state first
```

Then the handoff, in this shape:

> Done: <one sentence>. Where to look: <page → action → expected>. Not
> covered: <the out-of-scope items from Gate 3>. Tests: N passing, build OK,
> db-test N checks.

Report failures as failures, with the output. If a step was skipped, say so.

---

## 3. What Opus repeatedly did here (and the rule for each)

These are the patterns found in the code and the history, not hypotheticals.
Each has a concrete item in FABLE_REPORT.

| Pattern seen | Evidence | Rule |
|---|---|---|
| Edits the file it was pointed at; misses the sibling that enforces the same rule | `importCollection.js:177,314,331,468` still `lang:en` after decision 269 removed it everywhere else | Grep the string you're removing across `src/` and `supabase/` before you call it removed. If a leftover is intentional, say so in a comment citing the decision. |
| Copies a per-page constant instead of importing one | `GAME_NAMES` in `DayPage.jsx:33` and `BuyEditPage.jsx:18`; `GAMES` in `CalendarPage.jsx:18`, `ChangelogPage.jsx:21`, `SearchBar.jsx:12`, `FallbackPanel.jsx:8`, `BulkValuesPanel.jsx:9`; `MESSAGES` ×5 | A constant used in two files lives in `src/lib/`. The second copy is the moment to move it. |
| Writes the same effect by hand each time | Escape + outside-click in `BuyList.jsx:135-148,229-245,358-374,584-601`, `DayPage.jsx:884-898,980-997`, `MoreMenu.jsx:46-60`, `ExportButton.jsx:24-38`, `UserMenu.jsx:32-46`, `SearchBox.jsx:102-109`, `QuotePanel.jsx:37-44` | Three similar effects → one hook in `src/hooks/`. |
| Repeats a 10-line RPC-call ritual per action | Ten `setBusy(true)→withLoading(rpc)→setBusy(false)→toast→reload` blocks in `DayPage.jsx:235-465` while `useCollection` already has `run()` | One `run(name, args, failure)` per page/hook; the action functions become one line each. |
| Lets a component accrete every concern | `PricingScreen.jsx` 900 lines, 17 props, ~25 `useState`; `DayPage.jsx` 1277 lines with three modals and a panel inline | A component over ~300 lines or with a second unrelated `useEffect` cluster gets split: pure logic to `lib/`, state to a hook, sub-views to files. |
| Re-derives a value that is already in scope | `PricingScreen.jsx:545` rebuilds `variantOpts` (L254); L556 recomputes `conditionVariants` though `marketVariants` (L301) exists | Before computing, scroll up. If the same inputs are already combined, use that binding. |
| Re-emits whole SQL function bodies to change one line | `collection_set_status` defined 8×, `export_lines` 7×, `draft_add_line`/`draft_update_line`/`collection_add_line`/`collection_update_line` 6× each; `0055` is 1,871 lines | Unavoidable with `create or replace`, so: (a) one function per migration unless they must move together; (b) keep a generated `supabase/current/<fn>.sql` snapshot so diffs are reviewable (FABLE_REPORT C3). |
| Duplicates the merge predicate in four functions | `0062_placeholders.sql:65-70,124-129,212-217,297-302` (and `internal.same_line`) | One `internal.same_card(a, b)` predicate; four callers. Any new "same line" rule changes one place. |
| Infers in the app what the RPC should return | `markPlaceholder` from `set_code = 'BULK'` because `global_search`'s return table lacks `bulk_kind` | Change the contract, not the consumer: add the column to the return table. |
| Nested ternaries in JSX | `PricingScreen.jsx:763-766`; `QuotePanel.jsx:86-89` | Two levels max. Beyond that, a named `const` or a small function above the `return`. |
| Dates as provenance in comments | 495 `(owner, 2026-MM-DD …)` comments in `src/` | Comments say *why*; `docs/DESIGN_SPEC.md` decision numbers say *who/when*. Cite the number: `// decision 269`. |
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
- When a migration needs the live body: fetch it once into the scratchpad as
  JSON, patch it with a script, and keep that script — the next migration on
  the same function starts from it.

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
