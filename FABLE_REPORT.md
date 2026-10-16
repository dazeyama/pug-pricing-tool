# FABLE_REPORT.md — findings and exact fixes (2026-10-16)

Produced by Claude Fable 5.1 after reading the whole project at commit
`77d8c84` (v0.9.9.8-day1): every file under `src/` (24,128 lines of
JS/JSX, 4,445 of CSS), all 62 migrations (13,814 lines), the Edge
Functions, `scripts/`, `tests/` (37 files, 238 tests), the docs, and the
git history (414 commits, 2026-09-28 → 2026-10-16). Every line number
below was re-read on disk the day this was written; re-check before
editing, since they move.

How to use this file:

- Each item has **Where** (file:line), **What**, **Why it matters**,
  **Fix** (code to write), **Verify** (what to run / where to look).
- Severity: **H** could produce wrong data or a wrong export; **M** will
  bite the next change in that area; **L** housekeeping.
- Effort: **S** under an hour, **M** an afternoon, **L** a day or more.
- One item = one commit, in the order of Part E unless a feature forces
  otherwise. Never bundle a refactor with a behaviour change.
- Nothing here changes behaviour the owner asked for. Where a fix touches
  the database it is a *new* migration (0063+), rehearsed with
  begin/rollback, pushed to dev only, then `node scripts/db-test-run.mjs`.

## Summary

| # | Sev | Eff | Item |
|---|---|---|---|
| A1 | H | S | `global_search` can't say what's a placeholder; the app guesses from `set_code = 'BULK'` |
| A2 | H | M | Two client-side `events` inserts bypass `internal.*_event` |
| A3 | M | S | Realtime channel names from `Math.random()` (×3) |
| A4 | M | S | Flag-warning uses object identity (`mine.indexOf(b)`) |
| A5 | M | S | Error-code matching: six tables, two strategies, substring match in DayPage |
| A6 | M | S | `setLineValue` would turn a placeholder into priced bulk |
| A7 | L | S | Placeholder price `0` passes the box but blocks ADD with the wrong message |
| A8 | L | S | `importCollection.js` still filters `lang:en` after decision 269 |
| A9 | L | S | `loadSets()` clears old localStorage keys on every call |
| A10 | L | S | `useSuggestionCount` re-creates a `matchMedia` query each render; HelpPage effect has no deps |
| A11 | M | S | Deploy workflow builds and publishes without running the tests |
| B1 | M | S | DayPage: ten copies of the RPC ritual; `useCollection` already has `run()` |
| B2 | M | S | Six error-message tables → `lib/dbErrors.js` |
| B3 | L | S | Seven game-name constants → `lib/games.js` |
| B4 | M | S | Eleven hand-rolled Escape/outside-click effects → `useDismiss` |
| B5 | L | S | `RemoveModal` imported across pages from `price/BuyList.jsx` |
| B6 | M | S | `lineKey` rebuilds candidate keys owned by three libs |
| B7 | M | S | PricingScreen recomputes `variantOpts` and `conditionVariants`; duplicate flash+clear; 4-level ternary |
| B8 | M | S | CollectionPage: seven "why blocked" chains re-deriving the same guards |
| B9 | L | S | ExportDialog: `label` passed twice; `always.get(id) ?? true` ×3 |
| B10 | L | S | BuyList: two near-identical `.rate-menu` blocks; string surgery on `countText` |
| B11 | M | M | Four Settings boxes with the same edit/validate/save/revert body → `useSettingField` |
| B12 | L | S | `download()` duplicated in Banners and BackupsPanel |
| C1 | M | L | PricingScreen.jsx: 900 lines, 17 props, ~25 state hooks |
| C2 | M | M | DayPage.jsx: 1,277 lines with a panel, two menus and two modals inline |
| C3 | H | M | Migrations: merge predicate copied ×4 (+`same_line`); whole bodies re-emitted (`collection_set_status` ×8, `export_lines` ×7); no reviewable "current" source |
| C4 | L | M | price.css 1,726 lines; dead selectors (`.sell-tag`, `.setting-value` confirmed) |
| C5 | M | S | No lint config or `lint` script in the repo; no react-hooks rules; 695 KB background |
| C6 | L | — | 495 date-stamped provenance comments; cite decision numbers instead |
| D1–D4 | — | — | Workflow: big-bang commits, spec churn, "data in flight" when a money rule flips |

---

## Part A — Correctness and edge cases

### A1 · `global_search` has no `bulk_kind`; the app infers placeholders from `set_code` — **H / S**

**Where**
- `supabase/migrations/0062_placeholders.sql:346` — `RETURNS TABLE(... set_code text, collector_number text, ...)`: no `bulk_kind`.
- `src/lib/globalSearch.js:44-47` — `markPlaceholder(line)`: "if `set_code` is `BULK` and no `bulk_kind`, invent one from `game`".
- `src/components/SearchBox.jsx:51` — `.map(markPlaceholder)`.

**Why** A consumer guessing a column the producer has is a contract gap.
Any future bulk/placeholder kind, or a real set whose code is `BULK`,
mislabels rows in the header search. It also hides the real fix from the
next reader (the comment says "known by its set BULK").

**Fix** Migration `0063_global_search_bulk_kind.sql`. A return-type change
needs a `drop` first (Postgres refuses `create or replace` with a different
`RETURNS TABLE`):

```sql
-- global_search says which rows are bulk/placeholders (bulk_kind), so the
-- app stops inferring it from set_code (decision 27x).
drop function public.global_search(text, text, integer, text, boolean);   -- 0062:345: (p_name, p_number, p_size, p_set, p_all default false)
create or replace function public.global_search(p_name text, p_number text, p_size integer, p_set text, p_all boolean default false)
 returns table(line_id uuid, buy_id uuid, kind text, status text, customer_name text, paid_method text,
               confirmed_at timestamptz, confirmed_by uuid, created_at timestamptz, buy_number integer,
               game text, lang text, name text, name_en text, set_code text, collector_number text,
               finish text, first_edition boolean, treatments jsonb, condition text, quantity integer,
               image_url text, completed boolean, collection_kind text,
               bulk_kind text)                         -- new, last
 ... body unchanged except: add `l.bulk_kind` as the last select column ...
grant execute on function public.global_search(text, text, integer, text, boolean) to authenticated;   -- grants are lost on drop
```

Then in the app:

```js
// src/lib/globalSearch.js — delete markPlaceholder (L39-47).
// src/components/SearchBox.jsx:51
-  return (data ?? []).map(markPlaceholder);
+  return data ?? [];
// and drop markPlaceholder from the import on L8.
```

`printingKey` (globalSearch.js:50) already branches on `line.bulk_kind`, so
nothing else changes.

**Verify** `scripts/db-test-run.sql` "Placeholders" section: add
`select bulk_kind from global_search('placeholder', null, 10, null)` expecting
`mtg_placeholder`/`pkm_placeholder`; `npm test` (globalSearch.test.js);
header search "placeholder" shows `[Placeholder]` rows. Re-check grants:
the function is called by the browser as `authenticated`.

### A2 · Two client-side `events` inserts bypass the database's event writers — **H / M**

**Where**
- `src/pages/collections/CallChip.jsx:44-57` — `supabase.from('events').insert({ staff_user_id, staff_user_name, staff_user_color, device_id, kind:'collection', action: CALLED, ... })`.
- `src/lib/cashBuys.js:115-125` — `recordCashDownload`: the same shape with `kind:'buy'`.
- Everything else writes events through `internal.buy_event` (`0055_individual_rates.sql:133`) and `internal.collection_event` (moved to `internal` in `0040_internal_helpers.sql:17`).

**Why** The `events` row shape is owned by two SQL functions; these two
sites hard-code it in JS. When `events` gained columns (`totals`, `summary`
in 0055) they had to be remembered here by hand, and nothing fails if they
aren't (RLS allows the insert). The Changelog then renders a half-filled
row. It is also the only place a browser can write a changelog entry with
any `action` it likes.

**Fix** Migration `0064_event_rpcs.sql`, two thin wrappers, then the app
calls them:

```sql
-- A collection's "Called" (CallChip) and a cash-buys download (Changelog's
-- Buys) are logged by the database like every other event (decision 27x).
create or replace function public.collection_log_call(p_buy_id uuid, p_user uuid, p_device uuid)
returns void language plpgsql security invoker set search_path = public, internal as $$
declare b buys;
begin
  select * into b from buys where id = p_buy_id;
  if b.id is null then raise exception 'buy_gone'; end if;
  perform internal.collection_event(b, p_user, p_device, 'collection_called', array[]::text[], 0, 0,
                                    '[]'::jsonb, '[]'::jsonb, null, null);
  -- ^ match internal.collection_event's current argument list exactly:
  --   grep -n "function internal.collection_event\|alter function public.collection_event" supabase/migrations/*.sql
end $$;

create or replace function public.buy_log_cash_download(p_month date, p_paid numeric, p_rows integer, p_user uuid, p_device uuid)
returns void language plpgsql security invoker set search_path = public, internal as $$
begin
  -- buy_event wants a buys row; this event has none. Insert directly here,
  -- in SQL, so the row shape lives next to the other writers:
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, games, day, added, removed, lines, fields, totals, summary)
  select p_user, u.name, u.color, p_device, 'buy', 'cash_downloaded',
         'Cash buys · ' || to_char(p_month, 'FMMonth YYYY'), array[]::text[], p_month, 0, 0,
         '[]'::jsonb, '[]'::jsonb, jsonb_build_object('paid', p_paid, 'rows', p_rows), null
    from staff_users u where u.id = p_user;
end $$;
grant execute on function public.collection_log_call(uuid, uuid, uuid) to authenticated;
grant execute on function public.buy_log_cash_download(date, numeric, integer, uuid, uuid) to authenticated;
```

Keep the existing `action` strings (`CALLED`, `CASH_DOWNLOADED` from
`src/lib/changelog.js`) so old rows and the `HEADLINES` registry still
match. App side:

```js
// CallChip.jsx:44
-    const { error } = await supabase.from('events').insert({ ... });
+    const { error } = await supabase.rpc('collection_log_call', { p_buy_id: buy.id, p_user: user.id, p_device: deviceId });
// cashBuys.js:113
-export function recordCashDownload(month, rows, user, deviceId) {
-  const paid = rows.reduce((s, r) => s + r.paid, 0);
-  return supabase.from('events').insert({ ... });
+export function recordCashDownload(month, rows, user, deviceId) {
+  const paid = rows.reduce((s, r) => s + r.paid, 0);
+  return supabase.rpc('buy_log_cash_download', { p_month: `${month}-01`, p_paid: paid, p_rows: rows.length, p_user: user.id, p_device: deviceId });
```

Then, in the same or a following migration, tighten RLS so `authenticated`
can no longer `insert` into `events` directly: `0002_rls.sql:56` grants
`insert`, `:61` is the policy `"store: append"`. Revoke the grant and drop
the policy only after both RPCs are live, or Called/cash-download break.

**Verify** db-test: call both RPCs and assert one `events` row each with
the expected `action`; Changelog page shows "Called" on a collection and
the cash-download entry under Buys.

### A3 · Realtime channel names from `Math.random()` — **M / S**

**Where** `src/pages/DayPage.jsx:150`, `src/pages/collections/useCollection.js:118`,
`src/pages/collections/useCollectionLock.js:106`. The model to copy is
`src/lib/useLiveTable.js:41`: `` `live:${table}:${++channelSeq}` ``.

**Why** Supabase channel names must be unique per client; `Math.random()`
is fine in practice but non-deterministic (unreproducible in a log) and
three copies of a one-liner. A module counter is unique by construction.

**Fix** `src/lib/channels.js`:

```js
let seq = 0;
/** A unique realtime channel name for this page load: "day:mtg:2026-10-16:7". */
export const channelName = (...parts) => [...parts, ++seq].join(':');
```

```js
// DayPage.jsx:150
-      .channel(`day:${game}:${day}:${Math.random().toString(36).slice(2)}`)
+      .channel(channelName('day', game, day))
// useCollection.js:118            → channelName('collection', id)
// useCollectionLock.js:106        → channelName('lock', id)
// useLiveTable.js:41              → channelName('live', table)   (and delete its own channelSeq)
```

**Verify** `npm test`; open a day page and a collection on two tabs,
change one, the other reloads.

### A4 · Flag warning compares buys by object identity — **M / S**

**Where** `src/pages/DayPage.jsx:335`
`mine.indexOf(b) + 1` inside `unlessFlagged(buys, go)`.

**Why** `buys` is whatever the caller passes; if a reload produced new
objects between computing `buys` and calling this, `indexOf` is `-1`, the
`filter((n) => n > 0)` drops it, and the "flagged for condition check"
warning is silently skipped before an export. Identity is the wrong key
for rows that get refetched.

**Fix**
```js
-    const numbers = buys.filter((b) => b.condition_check).map((b) => mine.indexOf(b) + 1).filter((n) => n > 0);
+    const numberOf = (id) => mine.findIndex((m) => m.id === id) + 1;
+    const numbers = buys.filter((b) => b.condition_check).map((b) => numberOf(b.id)).filter((n) => n > 0);
```

**Verify** Flag a buy (CONFIRM BUY → 🚩), then EXPORT on its day: the
warning names its number.

### A5 · Six error-message tables, two matching strategies — **M / S**

**Where**
- `DayPage.jsx:34-45` `MESSAGES` + `:57-60` `messageFor` — **substring** match: `Object.keys(MESSAGES).find((c) => error?.message?.includes(c))`, first key wins.
- `BuyEditPage.jsx:19-26` `MESSAGES`, used at `:239`.
- `useCollection.js:14-57` `MESSAGES` + `:58-60` `errorCode()` — the same substring strategy — + `:63` `errorMessage()`.
- `useDraft.js:12-22` `STALE` + `CODES`.
- `ccExport.js:186-197` `EXPORT_ERRORS`, used at `:215`.
- `backupIO.js:70` `RESTORE_ERRORS`.

**Why** The same code (`stale_version`, `line_gone`, `no_user`,
`day_not_over`, `not_lock_holder`) has up to three wordings. Two of the
six use `includes()`, which is order-dependent: a future code
`line_struck_twice` would match `line_struck` first; `bad_name` and
`name_needed` don't collide only by luck. The other four index by the
exact message. One table, one exact-match function.

**Fix** `src/lib/dbErrors.js`:

```js
// Every refusal a database function raises (`raise exception 'code'`), as a
// sentence for a toast. One wording per code, used by every page.
export const DB_MESSAGES = {
  stale_version: 'This changed on another computer — reloaded.',
  line_gone: 'That card was already removed.',
  buy_gone: 'That buy was already deleted.',
  buy_completed: 'That buy is Completed (exported): mark it Paid/Ours again (its ⋯) to change it.',
  day_not_over: "Today can't be exported until it's over.",
  no_user: 'Pick a user first.',
  not_lock_holder: 'Another computer is editing this collection now: take over first.',
  line_struck: 'That card was already struck.',
  line_not_struck: 'That card was already restored.',
  // … merge the remaining keys from the six tables; where two wordings
  // differ, keep the one that names the next action.
};

/** The refusal code in a PostgREST error, or null for anything else. */
export function dbErrorCode(error) {
  const m = /^([a-z][a-z0-9_]*)$/.exec(String(error?.message ?? '').trim());
  return m && m[1] in DB_MESSAGES ? m[1] : null;
}

/** A toast-ready sentence: the code's, or `failure: <raw message>`. */
export function dbMessage(error, failure) {
  const code = dbErrorCode(error);
  return code ? DB_MESSAGES[code] : `${failure}: ${error?.message ?? 'unknown error'}`;
}
```

Check first how PostgREST delivers `raise exception 'stale_version'`: if the
message carries a prefix or suffix on this project, make the regex
`/\b([a-z][a-z0-9_]*)\b/` over the whole message but require the match to be
a key — never a bare `includes`. Then replace the six tables with imports,
keeping any page-specific extras as `{ ...DB_MESSAGES, local_code: '…' }`.

Find the overlaps before merging:
```bash
grep -hoE "^\s+[a-z_]+:" src/pages/DayPage.jsx src/pages/BuyEditPage.jsx src/pages/collections/useCollection.js src/pages/price/useDraft.js src/lib/ccExport.js src/lib/backupIO.js | sort | uniq -c | sort -rn
```

**Verify** `tests/dbErrors.test.js`: every key in `DB_MESSAGES` round-trips
through `dbErrorCode({ message: key })`; a message with a suffix
(`stale_version: detail`) still resolves if the regex allows it; an
unknown message returns `failure: raw`.

### A6 · `setLineValue` would turn a placeholder into priced bulk — **M / S**

**Where** `src/pages/price/PricingScreen.jsx:686-689`:
```js
const setLineValue = (line, value) => {
  const item = bulkItem(line.bulk_kind);
  return list.update(line, buildBulkLine(item, line.quantity, bulkValues[item.kind], value), user?.id);
};
```
Reached from `BuyList.jsx:771-780` "Clear value", which is shown only for
`isValuedBulk(line) && line.price_source === 'manual'`, so a placeholder
can't get here today.

**Why** `buildBulkLine` writes `price_source: 'bulk'` when `value` is null,
and `bulkValues[item.kind]` is `undefined` for a placeholder kind. The
database would refuse (`buy_lines_placeholder_check`, 0062:18) — correct,
but the only guard is a UI condition two files away. The next menu item
that calls `onSetLineValue` will hit it.

**Fix**
```js
 const setLineValue = (line, value) => {
+  // A placeholder has no Settings value to fall back to: its price is typed (decision 270).
+  if (isPlaceholder(line)) return list.update(line, buildPlaceholderLine(bulkItem(line.bulk_kind), line.quantity, value ?? line.unit_price, line.name), user?.id);
   const item = bulkItem(line.bulk_kind);
   return list.update(line, buildBulkLine(item, line.quantity, bulkValues[item.kind], value), user?.id);
 };
```
(`isPlaceholder`, `buildPlaceholderLine` are already exported from
`src/lib/bulk.js`.)

**Verify** `tests/bulk.test.js`: `buildPlaceholderLine(item, 2, 3.5, 'X')`
has `price_source: 'manual'`; db-test "Placeholders" already asserts the
constraint.

### A7 · Placeholder price `0` passes the box but blocks ADD with the wrong message — **L / S**

**Where** `src/pages/price/Bulk.jsx:142` `VALID_MONEY = /^\d{1,6}(\.\d{1,2})?$/`
(accepts `0`); `:159,168` use it. `PricingScreen.jsx:330` blocks with
`!(unitPrice > 0)` and says "Type its price: a placeholder has none of its own".

**Why** Staff types `0`, the box accepts it, ADD CARD stays grey and tells
them to type a price they just typed.

**Fix** Say what's wrong where it's wrong:
```js
// PricingScreen.jsx:330
-    if (bulk.item.placeholder && !(unitPrice > 0)) addBlocked = "Type its price: a placeholder has none of its own";
+    if (bulk.item.placeholder && unitPrice == null) addBlocked = "Type its price: a placeholder has none of its own";
+    else if (bulk.item.placeholder && !(unitPrice > 0)) addBlocked = "A placeholder's price has to be over $0";
```

**Verify** Buy tab → search "placeholder" → type `0` → tooltip on ADD CARD.

### A8 · `importCollection.js` still filters `lang:en` — **L / S**

**Where** `src/lib/importCollection.js:177, 314, 331, 468` — four Scryfall
queries with `lang:en game:paper`. Decision 269 (2026-10-16) removed
`lang:` from `scryfall.js searchPrints`/`fetchSiblings`, `cardSearch.js`
and `buyLine.js` so English-pack Japanese printings (Mystical Archive) are
found.

**Why** Probably intentional — a Crystal Commerce Mass Create import names
English products — but nothing says so, and the next reader of decision 269
will "fix" it or wonder. Either way it's a decision, not an accident.

**Fix** If intentional (recommended): one comment at the first site and a
line in DESIGN_SPEC under 269:
```js
// Imports are English only (decision 269 exception): a Mass Create file names
// Crystal Commerce's English products, so JP printings never match a row.
```
If not: drop `lang:en` at the four sites and filter the results with
`keptLanguage` from `scryfall.js` (export it).

**Verify** `tests/importMatch.test.js` unchanged; import a Mass Create CSV
with a Mystical Archive row and see which printing it matches.

### A9 · `loadSets()` clears old localStorage keys on every call — **L / S**

**Where** `src/lib/scryfall.js:29-34` runs `localStorage.removeItem(...)`
×2 before the `setsPromise ??=` memo, so every caller pays it.

**Fix** Move the cleanup into the download callback (runs once per 24h) or
into a one-time `migrateStorage()` in `src/main.jsx`:
```js
 export function loadSets() {
-  try { localStorage.removeItem('pug.scryfall.sets'); localStorage.removeItem('pug.scryfall.sets.v2'); } catch { /* … */ }
   setsPromise ??= storedOrDownload('pug.scryfall.sets.v3', DAY, async () => {
+    try { localStorage.removeItem('pug.scryfall.sets'); localStorage.removeItem('pug.scryfall.sets.v2'); } catch { /* storage blocked */ }
     const data = await transport.getJson(`${API}/sets`);
```

### A10 · Effects with incomplete deps; a `matchMedia` per render — **L / S**

**Where**
- `src/pages/price/Suggestions.jsx:24` creates `window.matchMedia(SHORT)` on every render; the effect at `:26-32` has `[]` deps but closes over that first `query` — works, wastes a MediaQueryList per render.
- `src/pages/HelpPage.jsx:58-71` `useEffect(() => { … }, )` — no deps array: the keydown listener is removed and re-added after every render.
- No `react-hooks/exhaustive-deps` rule runs (see C5), so these are found by reading, not by lint.

**Fix**
```js
// Suggestions.jsx
 export function useSuggestionCount(cols = 5) {
-  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(SHORT) : null;
-  const [short, setShort] = useState(() => Boolean(query?.matches));
+  const [short, setShort] = useState(() => Boolean(window.matchMedia?.(SHORT).matches));
   useEffect(() => {
+    const query = window.matchMedia?.(SHORT);
     if (!query) return undefined;
```
```js
// HelpPage.jsx:71
-  });
+  }, [prev, next, zoom]);   // `go` is stable enough (navigate); add it if the lint asks
```

**Verify** `npm run lint` after C5; Help ←/→ still turn pages; the
suggestion grid still drops to one row below 650px.

### A11 · Deploy publishes without running the tests — **M / S**

**Where** `.github/workflows/deploy.yml:33-34` — `npm ci` → `npm run build`
→ publish. No `npm test`, no lint.

**Why** "Pushing IS publishing" (the file's own words). A red test suite
goes live.

**Fix**
```yaml
       - run: npm ci
+      - run: npm test
+      - run: npm run lint        # after C5 adds the script
       - run: npm run build
```

**Verify** Next push: the Actions run shows the test step before build.

---

## Part B — Duplication to extract

### B1 · DayPage: ten copies of the RPC ritual — **M / S**

**Where** `src/pages/DayPage.jsx` — `setBusy(true)` → `withLoading(() =>
supabase.rpc(...))` → `setBusy(false)` → `toast(messageFor(...))` →
`reload()` at L235, 253, 271, 286, 318, 341, 364, 382, 423, 465.
`useCollection.js:129` already has the shape as `run()` (a `useCallback`).

**Fix** One helper inside `DayPage`:
```js
  /**
   * One database write: busy while it runs, a toast when it's refused, then a
   * reload either way. `failure` is the toast's lead, or a function of the
   * error returning a lead or null (null: no toast, the caller handles it).
   * Returns the error, or null.
   */
  async function run(fn, args, failure) {
    setBusy(true);
    const { error } = await withLoading(() => supabase.rpc(fn, args));
    setBusy(false);
    if (error) {
      const lead = typeof failure === 'function' ? failure(error) : failure;
      if (lead) toast(dbMessage(error, lead), 'err');
    }
    await reload();
    return error ?? null;
  }
```
Then, for example, L231-266 becomes:
```js
  async function remove(line, qty) {
    const { buy, number, mode } = removing;
    setRemoving(null);
    const args = { p_line_id: line.id, p_qty: qty, p_user: user.id, p_device: deviceId, p_expected_version: buy.version,
      p_text: lineText(line, Math.min(qty, line.quantity)) };
    if (mode === 'strike') { await run('buy_strike_line', args, "Couldn't strike the card"); return; }
    if (buy.buy_lines.length === 1 && qty >= line.quantity) { setDeleting({ buy, number, lastCard: true }); return; }
    const error = await run('buy_remove_line', args, (e) => (e.message?.includes('last_card') ? null : "Couldn't remove the card"));
    if (error?.message?.includes('last_card')) setDeleting({ buy, number, lastCard: true });
  }
  async function restore(buy, line) {
    if (!guard()) return;
    await run('buy_restore_line', { p_line_id: line.id, p_user: user.id, p_device: deviceId, p_expected_version: buy.version, p_text: lineText(line) }, "Couldn't restore the card");
  }
```
Apply to the other eight. Expect DayPage to lose ~120 lines.

**Verify** `npm test`, `npm run build`; day page: strike, restore, remove,
delete, mark completed, unexport, convert all still toast on refusal and
reload after.

### B2 · Six error tables → `lib/dbErrors.js` — **M / S**

See A5 for the module. Replace: `DayPage.jsx:34-60`, `BuyEditPage.jsx:19-26,239`,
`useCollection.js:14-66` (keep `errorMessage` as a re-export for the
ImportDialog import at `ImportDialog.jsx:16`), `useDraft.js:12-22`,
`ccExport.js:186-197,215`, `backupIO.js:70`.

### B3 · Seven game-name constants → `lib/games.js` — **L / S**

**Where** `DayPage.jsx:33` and `BuyEditPage.jsx:18` (`GAME_NAMES`);
`CalendarPage.jsx:18`, `ChangelogPage.jsx:21`, `SearchBar.jsx:12`,
`FallbackPanel.jsx:8`, `BulkValuesPanel.jsx:9` (`GAMES`); `BuyList.jsx:15`
(`GROUPS`); `GameBadge.jsx:6` hard-codes `'MTG' : 'PKM'`.

**Fix** `src/lib/games.js`:
```js
/** The two games, in display order: key (the database's), badge label, name. */
export const GAMES = [
  { key: 'mtg', label: 'MTG', name: 'Magic' },
  { key: 'pokemon', label: 'PKM', name: 'Pokémon' },
];
export const GAME_NAMES = Object.fromEntries(GAMES.map((g) => [g.key, g.name]));
export const GAME_LABELS = Object.fromEntries(GAMES.map((g) => [g.key, g.label]));
export const otherGame = (key) => (key === 'mtg' ? 'pokemon' : 'mtg');
```
`FallbackPanel` derives its setting key: `` key: `fallback_pct_${g.key}` ``.
`Suggestions.jsx:164` (`off === 'mtg' ? 'Pokémon' : 'Magic'`) and
`SearchBar.jsx` use `GAME_NAMES[otherGame(off)]`.

### B4 · Eleven hand-rolled Escape/outside-click effects → `useDismiss` — **M / S**

**Where** `BuyList.jsx:135-148` (RatesPanel, ignores `.pct-link`),
`:229-245` (CardRatePanel), `:358-374` (BulkValuePanel), `:584-601` (rate
menu); `DayPage.jsx:884-898`, `:980-997`; `MoreMenu.jsx:46-60`;
`ExportButton.jsx:24-38`; `UserMenu.jsx:32-46`; `SearchBox.jsx:102-109`
(mousedown only); `QuotePanel.jsx:37-44` (mousedown only, while pinned).

**Fix** `src/hooks/useDismiss.js`:
```js
import { useEffect } from 'react';

/**
 * Close a floating thing when Escape is pressed or the mouse goes down
 * outside `ref` (and outside any element matching `ignore`). `onClose` must
 * be stable (useCallback) or the listeners re-bind each render.
 * @param {{ escape?: boolean, when?: boolean, ignore?: string }} [opts]
 */
export function useDismiss(ref, onClose, { escape = true, when = true, ignore = null } = {}) {
  useEffect(() => {
    if (!when) return undefined;
    const onKey = (e) => { if (escape && e.key === 'Escape') onClose(); };
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      if (ignore && e.target.closest?.(ignore)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [ref, onClose, escape, when, ignore]);
}
```
Example, `BuyList.jsx:135-148`:
```js
-  useEffect(() => { const onKey = …; const onDown = …; window.addEventListener… }, [onClose]);
+  useDismiss(box, onClose, { ignore: '.pct-link' });
```
`QuotePanel.jsx:37-44` → `useDismiss(box, () => setPinned(null), { escape: false, when: Boolean(pinned) })`
(wrap the closer in `useCallback`). `CardZoom.jsx:49-72` stays as is: it
captures keys and manages focus, a different job.

**Verify** Each panel/menu: Esc closes, click outside closes, click inside
doesn't; the Rates panel stays open when its `.pct-link` is clicked.

### B5 · `RemoveModal` lives in `price/BuyList.jsx` but is a shared dialog — **L / S**

**Where** `src/pages/price/BuyList.jsx:75` `export function RemoveModal`;
imported by `src/pages/DayPage.jsx:26` from `./price/BuyList.jsx`.

**Fix** Move `REMOVE_WORDS` and `RemoveModal` to
`src/components/RemoveModal.jsx`; import it in both. BuyList keeps no page
re-exports.

### B6 · `lineKey` rebuilds candidate keys three libs own — **M / S**

**Where** `src/pages/price/PricingScreen.jsx:96-97`:
```js
const lineKey = (line) => (isBulk(line) ? `bulk:${line.bulk_kind}` : line.game === 'mtg' ? `mtg:${line.scryfall_id}`
  : line.tcgdex_id ? `pokemon:${line.lang}:${line.tcgdex_id}` : `pokemon:${line.lang}:jt:${line.justtcg_card_id}`);
```
The formats are produced in `cardSearch.js:76` (`mtg:`), `:251`
(`pokemon:<lang>:<id>`), `:177` (`pokemon:dex:ja:<n>`), `bulk.js:98`
(`bulk:`), `justtcgCards.js:327` (`pokemon:<lang>:jt:<id>`).

**Why** The inverse mapping (saved line → the candidate it came from) is
knowledge of the line builders, not of the screen. The `dex` format isn't
covered, so a `No.`-searched Japanese card never highlights its line.

**Fix** In `src/lib/buyLine.js` (which already maps candidate → line):
```js
/** The search key of the candidate a saved line was built from (the inverse of buildLine/buildBulkLine). */
export function candidateKeyOf(line) {
  if (line.bulk_kind) return `bulk:${line.bulk_kind}`;
  if (line.game === 'mtg') return `mtg:${line.scryfall_id}`;
  if (line.tcgdex_id) return `pokemon:${line.lang}:${line.tcgdex_id}`;
  return `pokemon:${line.lang}:jt:${line.justtcg_card_id}`;
}
```
Replace `lineKey` with it in PricingScreen (and anywhere else `grep -rn
"jt:\${" src/pages` finds). Add `tests/buyLine.test.js`: for a Magic
candidate, a TCGdex Pokémon, a JustTCG-only Pokémon and a bulk item,
`candidateKeyOf(buildLine(...)) === candidate.key`.

### B7 · PricingScreen recomputes what it already has — **M / S**

**Where**
- `:254-259` `variantOpts = { game, lang, finish, firstEdition }`; `:545` rebuilds the same four fields as `opts`.
- `:301` `marketVariants = conditionVariants(result?.card, variantOpts)`; `:556` calls `conditionVariants(result?.card, opts)[condition]` again.
- `:538-542` and `:573-579` are the same five lines (update-or-add, flash, clear).
- `:763-766` a four-level nested ternary for `source`.

**Fix**
```js
   async function addCard() {
     …
+    /** Save the built line over the one being edited or as a new one, flash it, clear the card. */
+    const commit = async (line) => {
+      const id = editing ? await list.update(editing.line, line, user.id) : await list.add(line, user.id);
+      if (!id) return;
+      setFlashId(id);
+      setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1600);
+      clear();
+    };
     if (bulk) {
       const line = bulk.item.placeholder ? buildPlaceholderLine(…) : buildBulkLine(…);
-      const id = …; if (!id) return; setFlashId(id); setTimeout(…); clear(); return;
+      await commit(line);
+      return;
     }
-    const opts = { game: selected.game, lang: selected.lang, finish: …, firstEdition: … };
     const line = buildLine({
       …
-      variant: ladder[condition]?.source === 'justtcg' ? conditionVariants(result?.card, opts)[condition] : null,
+      variant: ladder[condition]?.source === 'justtcg' ? marketVariants[condition] ?? null : null,
       …
     });
-    const id = …; if (!id) return; setFlashId(id); setTimeout(…); clear();
+    await commit(line);
   }
```
(`selected` and `card` are the same candidate at L545 — confirm with
`grep -n "const card = " PricingScreen.jsx` before relying on `variantOpts`.)
```js
+  /** Which source the price panel names for the chosen condition (QuotePanel's `source`). */
+  function quoteSource() {
+    if (manual != null) return 'manual';
+    if (bulk) return null;
+    const l = ladder[condition];
+    if (l.base?.from === 'Cardmarket' && l.source === 'fallback') return 'cardmarket';
+    if (showsTcgplayer(ladder, condition, fallbackPct?.[condition])) return 'tcgplayer';
+    return l.source;
+  }
   …
-              source={manual != null ? 'manual' : bulk ? null : … : ladder[condition].source}
+              source={quoteSource()}
```

**Verify** `npm test`; add a card, edit a line (SAVE EDIT), add bulk, add a
placeholder: the row flashes and the card clears; the price panel's tag
reads manual / cardmarket / TCGplayer / fallback as before.

### B8 · CollectionPage: seven "why blocked" chains — **M / S**

**Where** `src/pages/CollectionPage.jsx:93-104` (`locked`, `removeLocked`),
`:109-115` (`repriceBlocked`), `:120-126` (`importBlocked`), `:235-239`
(`printBlockedWhy`), `:302-306` (`statusBlocked`), `:307-308`
(`deleteBlocked`), `:310-315` (`convertBlocked`); plus `startExport()`
`:189-232` and `printCollection()` `:246-261`, which re-check the same
things with `toast` instead of a tooltip.

**Why** Five of them start with the same three or four tests
(`!user` / `offline` / `viewOnly` / `lock.status !== 'held'`) in slightly
different words ("take over to edit" / "to reprice" / "to change the
status" / "first"). A new guard (say, a maintenance flag) has to be added
in seven places.

**Fix** `src/lib/blocked.js`:
```js
/** The first reason that applies, or null: firstReason([[offline, 'No connection'], …]). */
export const firstReason = (pairs) => pairs.find(([when]) => when)?.[1] ?? null;
```
In CollectionPage, one shared prefix and short tails:
```js
  const takeOver = (verb) => `View only: ${holderLabel} is editing this collection. Take over to ${verb}`;
  const editGuard = (verb) => firstReason([
    [!user, 'Pick a user first'],
    [offline, 'No connection'],
    [viewOnly, takeOver(verb)],
    [lock.status !== 'held', 'Checking who is editing this collection'],
  ]);
  const repriceBlocked = editGuard('reprice') ?? firstReason([
    [locked && !system, locked],
    [!col.lines.some((l) => !isStruck(l)), 'No cards to reprice'],
  ]);
  const importBlocked = editGuard('import') ?? firstReason([
    [system, "Can't upload cards only takes cards from exports"],
    [locked, locked],
    [!col.loaded, 'Loading the collection'],
    [col.lines.length > 0, 'It already has cards: a file only goes into an empty collection or project'],
  ]);
  const statusBlocked = editGuard('change the status');
  …
```
`printCollection()` then becomes `if (printBlockedWhy) { toast(printBlockedWhy, 'err'); return; } print(…)`,
and `startExport()` keeps only the Completed/Rejected/not-paid branches
that have *different* behaviour (re-download, warn), delegating the common
guards to one `exportBlocked` string.

**Verify** Each tooltip on ⋯ / REPRICE? / EXPORT / Convert / Delete reads
as before (compare against the current strings before and after; keep the
owner's wording).

### B9 · ExportDialog small duplicates — **L / S**

**Where** `src/pages/export/ExportDialog.jsx:281-283` `rowProps(r)` already
returns `label: lineLabel(r)`; `:386-392` passes `label={lineLabel(r)}`
*and* `{...rowProps(r)}` (the spread wins; `lineLabel` runs twice).
`always.get(r.line.id) ?? true` at `:155`, `:225`, `:301`.

**Fix**
```js
-                  <ChooseRow key={r.line.id} r={r} label={lineLabel(r)} {...rowProps(r)} />
+                  <ChooseRow key={r.line.id} {...rowProps(r)} />
```
```js
+  const alwaysOf = (id) => always.get(id) ?? true;   // "always pick this product" defaults on
```
and use it at the three sites. Check the Matched section (`:396+`) for the
same `label=` + spread pattern.

### B10 · BuyList: two `.rate-menu` blocks; string surgery — **L / S**

**Where** `src/pages/price/BuyList.jsx:746-758` (struck line → Restore) and
`:759-794` (Set Rate / Set value / Clear value / Clear Rate) — two menus
with the same wrapper, positioning and `is-blocked` pattern.
`:663` `countText({ ...cardCounts(mine), struck: 0 }).replace(/ cards?\b/, '')`.

**Fix** One menu from a list of items:
```js
  const menuItems = (line) => (isStruck(line)
    ? [{ label: 'Restore', blocked: removeLocked, tip: 'Take the strike off: back on the list with its price and rate', run: () => restore(line) }]
    : [
      { label: isValuedBulk(line) ? 'Set value' : 'Set Rate', blocked: rateBlocked(line),
        tip: isValuedBulk(line) ? 'Give this bulk its own value per item' : 'Give this card its own Cash and Credit rates', run: () => startRate(line) },
      isValuedBulk(line) && line.price_source === 'manual' && { label: 'Clear value', blocked: rateBlocked(line), tip: 'Back to the value in Settings → Bulk values', run: () => clearRate(line) },
      hasOwnRate(line) && { label: 'Clear Rate', blocked: rateBlocked(line),
        tip: `Back to Credit ${otherRate(line, rates).credit}%, Cash ${otherRate(line, rates).cash}%`, run: () => clearRate(line) },
    ].filter(Boolean));
  …
  {rateMenu && (
    <div className="rate-menu" role="menu" style={{ top: rateMenu.top, left: rateMenu.left }}>
      {menuItems(rateMenu.line).map((it) => (
        <button key={it.label} type="button" role="menuitem" className={it.blocked ? 'is-blocked' : ''} title={it.blocked ?? it.tip} onClick={it.run}>
          {it.label}
        </button>
      ))}
    </div>
  )}
```
For L663, add to `src/lib/bulk.js` a `countText(counts, { short: true })`
option that omits the word "cards", and use it instead of the regex.

### B11 · Four Settings boxes with the same body → `useSettingField` — **M / M**

**Where** `PercentagesPanel.jsx:10-66` (`PercentField`),
`RatesTiersPanel.jsx:15-78` (`TierBox`), `BulkValuesPanel.jsx:15-66`
(`ValueBox`), `FallbackPanel.jsx:14-66` (`PctBox`). Each: `stored` →
`text` state → `editing` flag → "follow other computers unless typing"
effect → `commit()` that validates, reverts on error, saves, toasts.
Also `ThisComputerPanel.jsx:12-27` (no save, same shape).

**Fix** `src/pages/settings/useSettingField.js`:
```js
import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast.jsx';

/**
 * A Settings box that shows a stored value, follows changes from other
 * computers unless someone is typing in it, and on blur validates, saves
 * and toasts (or reverts and says why).
 * @param {{ stored: number, validate: (raw: string) => string|null, save: (next: number) => Promise<string|null>, saved: (next: number) => string, clean?: (raw: string) => string }} p
 */
export function useSettingField({ stored, validate, save, saved, clean = (s) => s.trim() }) {
  const toast = useToast();
  const [text, setText] = useState(String(stored));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(String(stored)); }, [stored, editing]);

  async function commit() {
    setEditing(false);
    const raw = clean(text);
    const problem = validate(raw);
    if (problem) { toast(problem, 'err'); setText(String(stored)); return; }
    const next = Number(raw);
    if (next === stored) return;
    const err = await save(next);
    if (err) { toast(`Couldn't save: ${err}`, 'err'); setText(String(stored)); }
    else toast(saved(next), 'ok');
  }
  return {
    text,
    inputProps: {
      value: text,
      onFocus: () => setEditing(true),
      onChange: (e) => setText(e.target.value),
      onBlur: commit,
      onKeyDown: (e) => { if (e.key === 'Enter') e.currentTarget.blur(); },
    },
  };
}
```
`PercentField` keeps its inline `<p className="field-error">` by passing a
`validate` that returns the message and reading it from a small extra
`error` state if the owner wants it inline rather than toasted (today it is
inline there and toasted elsewhere — pick one; recommend the toast, which
the other three use).

**Verify** Each Settings box: a bad value reverts with a message; a good
value saves and toasts; another tab's change appears unless the box has focus.

### B12 · `download()` duplicated — **L / S**

**Where** `src/components/Banners.jsx:42-51` and
`src/pages/settings/BackupsPanel.jsx:38-47` are identical.

**Fix** `src/lib/backupIO.js`:
```js
/** Download a backup and say so; busy/idle through `setBusy`. */
export async function downloadBackup({ userId, toast, setBusy }) {
  setBusy(true);
  try { toast(`Backup saved: ${await saveBackup({ userId })}`, 'ok'); }
  catch (e) { toast(e.message, 'err'); }
  finally { setBusy(false); }
}
```

---

## Part C — Architecture

### C1 · PricingScreen.jsx is a 900-line god component — **M / L**

**Where** `src/pages/price/PricingScreen.jsx`: 17 props, ~25 `useState`,
search + selection + prices + bulk/placeholder + layout + keyboard + add
in one function. B6/B7 shrink it by ~60 lines; the structure needs more.

**Why** Every feature this month (bulk, placeholders, JP, struck) landed
here. Each added two or three state hooks and an `else if` to the
`addBlocked` chain (`:322-335+`). At this size a change can't be read in
one screen, and effects with partial deps (the `:356-382` cluster) hide
ordering bugs.

**Fix** Extract in this order (each its own commit, no behaviour change,
`npm test`/`build` between):

1. `src/pages/price/useAddCard.js` — `addBlocked` (`:322-335+`) and
   `addCard()` (`:532-580`) with their inputs passed in; returns
   `{ addBlocked, addCard }`. This is the most logic with the least UI.
2. `src/pages/price/useBulkPick.js` — the bulk/placeholder state
   (`bulk`, `manual` for bulk, `placeholderName`, `bulkValues`, `setLineValue`).
3. `src/pages/price/usePricingKeys.js` — `onKeyDown` (`:583+`) and the
   focus refs.
4. `src/pages/price/useQuote.js` — `variantOpts`, `market`, `fallback`,
   `ladder`, `trends`, `quoteRate`, `quoteSource()` (`:252-310`, `:763-766`).

Target: `PricingScreen.jsx` ≤ 350 lines of composition. Keep the
`BACKGROUND`/`listRoom`/`cardSpace` layout code where it is; it's already
backed by `lib/thumbGrid.js` and `lib/cardRoom.js`.

### C2 · DayPage.jsx is 1,277 lines with four sub-components inline — **M / M**

**Where** `BuyPanel` (`:946`), `ConvertBuyModal` (`:1200`),
`DeleteBuyModal` (`:1255`), the two right-click/⋯ menus (`:884-898`,
`:980-997`), plus ten action functions (B1).

**Fix** `src/pages/day/`: `BuyPanel.jsx`, `BuyMenu.jsx`, `ConvertBuyModal.jsx`,
`DeleteBuyModal.jsx`, `useDayActions.js` (the `run()` from B1 and the ten
actions). `DayPage.jsx` keeps the query, realtime subscription, and
composition. Do B1, B3, B4, B5 first; they remove most of the glue.

### C3 · Migrations: copied predicates and unreviewable bodies — **H / M**

**Where**
- The merge predicate (`l.game = r.game and l.lang = r.lang and coalesce(scryfall_id…) … and l.name = r.name`) is written out in `0062_placeholders.sql:60-70`, `:119-129`, `:207-217`, `:292-302` — once each in `draft_add_line`, `collection_add_line`, `draft_update_line`, `collection_update_line` — and a *different* "same line" rule lives in `internal.same_line` (`0059_struck_cards.sql:25-42`: also compares `set_code`, `collector_number`, `justtcg_variant_id` and the four rate columns).
- `collection_set_status` is defined 8 times across migrations, `export_lines` 7, `draft_add_line` / `draft_update_line` / `collection_add_line` / `collection_update_line` / `buy_to_project` 6 each, `global_search` / `confirm_buy` / `collection_reprice` / `buy_mark_completed` 5 each. `0055_individual_rates.sql` is 1,871 lines; `0059` 1,189; `0058` 905.
- The current body of any function exists only in the live database (fetched with `pg_get_functiondef` into a scratchpad JSON and patched by one-off Python each time).

**Why** (1) Two "same card" rules that drift: a line struck then restored
merges by `same_line`; a line added twice merges by the inline predicate.
Today they differ on `set_code`/`collector_number`/`justtcg_variant_id`
and the rate columns — probably intended (a merge on add ignores rates; a
restore must match them), but nothing says so and the four inline copies
can drift from each other. (2) Re-emitting 300-line bodies to change one
`and` makes the diff unreadable and review impossible; the next model
patches the wrong copy.

**Fix**

(a) Migration `0065_same_card.sql`: one predicate, four callers.
```sql
-- The same printing at the same price: what a second ADD CARD merges into
-- (decision 27x). Rates are not compared: the copies take the line's rate
-- (owner, 2026-10-15). internal.same_line (0059) is stricter — it also
-- matches the rates — because a restore must land on an identical line.
create function internal.same_card(l buy_lines, r buy_lines) returns boolean
language sql immutable set search_path = public, internal as $$
  select l.game = r.game and l.lang = r.lang
     and coalesce(l.scryfall_id, '') = coalesce(r.scryfall_id, '')
     and coalesce(l.tcgdex_id, '') = coalesce(r.tcgdex_id, '')
     and l.finish = r.finish and l.first_edition = coalesce(r.first_edition, false)
     and l.treatments = coalesce(r.treatments, '[]'::jsonb)
     and l.condition = r.condition
     and l.unit_price = r.unit_price and l.price_source = r.price_source
     and l.bulk_kind is not distinct from r.bulk_kind
     and l.name = r.name
$$;
```
Then in each of the four functions the `where` becomes
`where l.buy_id = v_buy and internal.same_card(l, r)` (the `r` there is the
record built from the JSON argument; confirm it is a `buy_lines`-typed
record or cast its fields — read `0062:40-58` first). Re-emit those four
bodies *once more* for this, and that's the last time they carry the
predicate.

(b) A reviewable "current" source. `scripts/db-snapshot.mjs` (run after
every `db push`) writes one file per function:
```sql
select n.nspname, p.proname, pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'internal') order by 1, 2;
```
→ `supabase/current/public.collection_set_status.sql`, etc. Commit them
with the migration. The next migration is then written as a diff against
a file in the repo, and `git diff` of `supabase/current/` shows exactly
what a migration changed. Add `supabase/current/README.md`: "generated;
never edit; regenerate with `node scripts/db-snapshot.mjs`".

(c) Rule for new migrations: one function per file unless two must change
atomically; the header comment names the decision and the *lines* that
changed ("export_lines: the `where` gains `and l.struck_at is null`").

**Verify** db-test "Walk-in" and "Collections" sections: adding the same
card twice merges; adding it at another price doesn't; a placeholder with
a different name doesn't; `node scripts/db-snapshot.mjs` reproduces the
committed files byte-for-byte.

### C4 · CSS: one 1,726-line file; dead selectors — **L / M**

**Where** `src/styles/price.css` (1,726 of 4,445 lines). Confirmed dead
(zero uses in any `.jsx`): `.sell-tag` (`export.css:113`), `.setting-value`
(`panels.css:26`). Candidates from the 2026-10-16 scan still to confirm by
hand: `good-ghost`, `org`, `w3` (not found as top-level rules — check nested
selectors). Dynamic prefixes that *are* used and must not be removed:
`col-w-*`, `era-*`, `tier-*`, `k-*`, `r-*` (rarity), `cond-*`, `stage-slot`.

**Fix** Delete the two confirmed rules. Split `price.css` along the
screen's areas (`search.css`, `thumbs.css`, `card.css`, `finish.css`,
`quote.css`, `buylist.css`, `bulk.css`, `zoom.css`), imported from one
`price.css`. To find more dead rules:
```bash
cd src/styles && for c in $(grep -ohE "^\.[a-z][a-z0-9-]*" *.css | sort -u | sed 's/^\.//'); do
  case "$c" in col-w-*|era-*|tier-*|k-*|r-*|cond-*|stage-slot|is-*|on|off) continue;; esac
  grep -rqE "[\"'\` ]$c[\"'\` ]|\b$c\b" ../ --include="*.jsx" --include="*.js" || echo "$c"
done
```
Confirm each hit by reading before deleting (class names built with
template strings won't match a plain grep).

### C5 · Tooling: lint not in the repo; no react-hooks rules; CI runs no tests; 695 KB background — **M / S**

**Where** `package.json:6-11` has no `lint` script; the ESLint config used
this month lives in Claude's scratchpad, not the repo, and only enables
`no-undef`. `.github/workflows/deploy.yml:33-34` (see A11).
`public/background.webp` is 695,496 bytes — the largest asset by 10×.

**Fix** `eslint.config.mjs` at the repo root:
```js
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'supabase/functions/**'] },
  {
    files: ['src/**/*.{js,jsx}', 'tests/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'react-refresh/only-export-components': 'off',   // pages export helpers next to components on purpose
    },
  },
];
```
```json
  "scripts": { …, "lint": "eslint ." },
  "devDependencies": { …, "@eslint/js": "^9", "eslint": "^9", "eslint-plugin-react-hooks": "^5", "eslint-plugin-react-refresh": "^0.4", "globals": "^15" }
```
Run it once; expect `exhaustive-deps` warnings in PricingScreen,
Suggestions (A10), HelpPage (A10), CustomerNameInput. Fix or annotate each
with a one-line reason — never blanket-disable the rule.
Background: `cwebp -q 72 -resize 1920 0 background.webp -o background.webp`
(or the owner's tool of choice), target ≤ 200 KB; keep the original outside
the repo.

**Verify** `npm run lint` clean; `npm run build`; CI run shows lint + test
steps.

### C6 · 495 date-stamped provenance comments — **L / —**

**Where** `grep -rhoE "\(owner[^)]*20[0-9]{2}-[0-9]{2}-[0-9]{2}" src | wc -l` → 495.

**Why** They record *who/when*, which git and DESIGN_SPEC already hold, and
not *why*, which the next reader needs. They also make every feature's
comment a different shape.

**Fix** Policy, not a sweep: new comments cite the decision
(`// decision 269: JP printings in English packs are searchable`); when a
line with a dated comment is edited, convert it. Add the decision numbers
to DESIGN_SPEC entries that lack one.

---

## Part D — Workflow observations (from the history)

**D1 · Big-bang commits.** `da24b3b` (61 files), `3455cd2` (43),
`13e6544` (32), `f81276d` (26: struck cards, +1,854 lines), `675e439`
(25). The owner rejected `f81276d`'s approach wholesale and accepted the
same work as four small changes (memory: small-changes-first). Rule: one
behaviour per commit; a migration and the UI that needs it may share a
commit, two behaviours may not.

**D2 · Spec as changelog.** `docs/DESIGN_SPEC.md` changed in 285 of 414
commits (69%). The numbered-decision scheme (267–270 this week) is right;
the churn comes from re-editing prose elsewhere in the file. Rule: a
change adds one numbered decision and touches nothing else in the spec.

**D3 · Rework is low in subjects, high in session.** Only 14 subjects
(3.4%) say fix/revert/again. The costly rework was within sessions:
0057 ("rates only price") then 0061 ("confirm keeps rates") reversed a
money rule four migrations later, and buys confirmed in between lost
their custom rates for good. Rule (Gate 3 in FABLE.md): when a rule about
money or exports flips, list the rows created under the old rule and say
what happens to them *before* writing the migration.

**D4 · Docs on request only.** README/Help were updated in batches when
asked; CLAUDE.md's phase line and the memory file were updated per release.
That matches the owner's stated preference; keep it. The tests directory
is the real contract: 37 files, all `lib/` — keep logic there.

---

## Part E — Suggested order

Each line is one commit; run `npm test && npm run build` (and lint once C5
is in) before each. Database items also run the rehearsal, `db push`, and
`node scripts/db-test-run.mjs`.

**Sprint 1 — tooling and pure refactors (no behaviour change)**
1. C5 lint config + `lint` script + fix/annotate what it flags
2. A11 CI runs `npm test` and `npm run lint`
3. B3 `lib/games.js`
4. B2/A5 `lib/dbErrors.js` (+ test)
5. B4 `hooks/useDismiss.js`
6. B1 DayPage `run()`
7. B5 `components/RemoveModal.jsx`
8. B6 `candidateKeyOf` (+ test)
9. B7 PricingScreen `commit()`, `marketVariants`, `quoteSource()`
10. B9, B10, B12 small duplicates

**Sprint 2 — small correctness**
11. A3 `channelName`
12. A4 `findIndex` by id
13. A6 placeholder guard in `setLineValue`
14. A7 placeholder `0` message
15. A9 `loadSets` cleanup placement
16. A10 effect deps
17. A8 `lang:en` comment + spec line

**Sprint 3 — database contract**
18. A1 `0063` `global_search` returns `bulk_kind`; drop `markPlaceholder`
19. A2 `0064` event RPCs; app calls them; tighten `events` RLS
20. C3a `0065` `internal.same_card`
21. C3b `scripts/db-snapshot.mjs` + `supabase/current/`

**Sprint 4 — structure**
22. B8 CollectionPage guards
23. B11 `useSettingField`
24. C1 PricingScreen hooks (four commits)
25. C2 DayPage split
26. C4 CSS split + dead rules

---

## Appendix — checked and found sound (don't "fix" these)

- `DayPage.jsx` `byHand = completed && lines.filter(movesOn).every(markedByHand)` — correct after 2026-10-16.
- Rates captured at confirm (0061): `v_cash := coalesce(b.custom_cash_pct, p_cash_pct)` then `internal.fix_line_rates(b)`; displayed Cash/Credit on buys are stored values, `✎` marks custom. Buys confirmed between 0057 and 0061 lost custom rates; not recoverable.
- `useCollection.js:77-78,90` ticket/version refs and `useLiveTable.js:21-26` — correct stale-result handling.
- `let alive = true` / `live` cleanup in `RestoreModal`, `ProductsModal`, `ImportDialog`, `CustomerNameInput` (`run` counter) — correct.
- `todaysPrices.js:44-65` raw `fetch` with its own retry/`Retry-After` loop: a justified exception (it POSTs; `createTransport` in `transport.js:33` exposes `getJson` only). Leave it; a comment saying so would help, or add a `postJson` to the transport when a second POST appears.
- `pdfSafe` (`auditPdf.js:85-97`), `pokemonImages.js` fallbacks, `transport.js` spacing/retries, `keptLanguage` filter — sound.
- `scryfall.js` queries without `lang:` plus `keptLanguage` — matches decision 269.
- Tests: 238 passing at `77d8c84`; db-test 394 checks passing on dev.

## Appendix — commands

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm test && npm run build
npm run lint                                     # after C5
# migration
(echo "begin;"; cat supabase/migrations/00NN_x.sql; echo "rollback;") > "$TMP/rehearse.sql" && npx supabase db query --linked -f "$TMP/rehearse.sql"
npx supabase db push --yes && node scripts/db-test-run.mjs
# current body of a function (until C3b lands)
npx supabase db query --linked -f <(echo "select pg_get_functiondef('public.global_search'::regproc);")
```
