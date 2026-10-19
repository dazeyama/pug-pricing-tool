# NEXT

What's open, newest task first. Claude reads this at the start of every session and tells the owner what's open,
then marks each task done here when it's finished, listing anything pending or half-finished with the exact file
and function.

## Open

- **Unpushed:** decision 337 (CONFIRM BUY's customer name capped at 80) and the Help's struck-cards wording.
- **Before the squash:** a full smoke test pass, `docs/TEST.md` (180 cases), on dev.
- **Phase 10 launch** (owner's go): the squash and the switch to prod, `SQUASH.md` sections 1–10 (N is 0076; the
  baseline `0001_baseline.sql`). Decide the **Supabase plan for prod** first (`docs/DESIGN_SPEC.md` Appendix D 2:
  Free vs Pro).
- **After launch:**
  - migration **0002**, the Changelog lock (`SQUASH.md` section 11a), on the owner's day;
  - watch JustTCG usage and the plan (Appendix D 4);
  - tune the stamp cutoff `STAMP_SEEN = 0.53` in `src/scan/stamps.js` from the run log's `stamp` lines
    (`C:\ClaudeProjects\temp\scan-run\scan-log.jsonl`, LAN dev server only).

## Done

- 2026-10-19: The v0.9.9.14-nightb4 review's notes:
  - decision 337: CONFIRM BUY's Customer name stops at 80 characters (`src/pages/price/ConfirmBuyModal.jsx`, was
    120), as `buy_to_collection` and `buy_to_project` require; no buy on dev had a longer name. Left as they are:
    the collection name fields (120 typed, "Keep the name to 80 characters" past 80) and `confirm_buy`, which has no
    length check of its own (no migration);
  - Help, `README.md` "A buy's ⋯ menu": struck cards stay on the buy if it stays, and the Changelog keeps them if
    it's deleted (was "stay behind");
  - the published tag `v0.9.9.9-fable`: closed by the owner, left as it is.
- 2026-10-19: Pushed as **v0.9.9.14-nightb4** (tag `v0.9.9.14-nightb4`), the release skill's first run in its new
  order (record edits reviewed before the record commit, the deploy run found by commit): the Help's Convert to
  collection row, the release skill and `scripts/live-check.mjs` fixes, and the NEXT.md notes. No migrations (dev
  has 0001–0076) and no Edge Functions. Nothing unpushed.
- 2026-10-19: The lint hook works (`.claude/settings.json` → `.claude/hooks/lint-edit.mjs`): an Edit adding an unused
  `const` to `scripts/live-check.mjs` came back at once with `no-unused-vars` at 13:7, as a blocking hook error.
  The probe line was taken out straight after; no file changed. A passing edit gives no message.
- 2026-10-18: Help: `README.md` "A buy's ⋯ menu" has a **Convert to collection** row (decision 335), and the struck
  cards and locked lines name it next to Convert to project.
- 2026-10-18: The pre-push review's three notes fixed:
  - `.claude/skills/release/SKILL.md`: the record edits (steps 2 and 3) stay uncommitted until the review (now step
    4) has seen them, then step 5 commits them; the steps after are renumbered (secrets 6, push 7, deploy 8, Edge
    Functions 9, live check 10, report 11);
  - the same file, step 8: the deploy run is found by the pushed commit (`gh run list --commit "$sha"`), and its
    success with a matching `headSha` is the proof; step 10 says a no-bump push with no new text can't be told
    apart by the live check;
  - `scripts/live-check.mjs` line 43: chunk names may contain hyphens.
- 2026-10-18: pug-reviewer reached from a session started in this folder (first use): it loaded with Read, Grep,
  Glob and Bash, read CLAUDE.md and reviewed the one unpushed commit (`df6f846`, NEXT.md only). One docs note: the
  push entry below says "five small notes" but Open lists three, and "Nothing unpushed" is stale until the next push.
- 2026-10-18: Pushed without a bump (the release skill's first run): the CLAUDE.md rules and cleanup, NEXT.md, the
  release skill and `scripts/live-check.mjs`, the lint hook, pug-reviewer, the review checkpoints, the date fixes.
  The pre-push review found nothing that stops a push; its five small notes are in the push report. Nothing
  unpushed.
- 2026-10-18: pug-reviewer wired in at the two regular points: before every push (release skill step 1b; a
  confirmed serious finding stops the push) and before every migration is applied to dev (CLAUDE.md, Database,
  step 1).
- 2026-10-18: The standard review agent: `.claude/agents/pug-reviewer.md` (read-only tools, this project's rules,
  ranked findings, no fixes); listed in CLAUDE.md "Where things are". First use: in a session started in this
  folder (this session started in `klug alters`, so it can't load it).
- 2026-10-18: The review's 13 findings fixed:
  - the release skill (`.claude/skills/release/SKILL.md`): a secrets check for real keys only, on added lines (no
    hits in all of history; catches fake keys); the push recorded in NEXT.md and CLAUDE.md "Where it stands" before
    it, so nothing's left unpushed; Edge Functions checked in pre-flight for both modes; the live site's project
    read from the repo variable (`gh variable get VITE_SUPABASE_URL`), not hard-coded; `git fetch`; tags sorted by
    date; the store's date from `date +%F` (Git Bash doesn't know `America/Los_Angeles`);
  - `scripts/live-check.mjs`: the live check reads every chunk, following references (9 of 9);
  - the hook (`.claude/hooks/lint-edit.mjs`): files on another drive skipped; Python checked with `compile()`, no
    `__pycache__`, skipped when there's no Python; an ESLint failure reported back (exit 2); `.claude/settings.json`
    pinned to bash, with `node` found even off the PATH;
  - the hook commit and its ESLint fix folded into one (`a47a862`), so no commit fails lint alone;
  - 99 dates in 40 files corrected from 2026-10-19 (UTC) to 2026-10-18 (two applied migrations left as run);
  - CLAUDE.md: no `sed -i` on source files; Claude's own memory notes on this project are allowed.
- 2026-10-18: Review of the unpushed diff (read-only, a review agent).
- 2026-10-18: CLAUDE.md cleaned up: the release history cut to a short "Where it stands", stale lines fixed (the
  Changelog lock is 0002; one small change at a time instead of phases), the duplicate QA line gone and the browser
  rule's one exception spelled out, the rules from memory added (Help edits only when asked, nothing about the AI
  in team write-ups, one-pager style, the JustTCG key and store password, the migration routine, scratch files),
  the retired-doc pointers in one line and a start-of-session order.
- 2026-10-18: NEXT.md started, and CLAUDE.md told to read it first.
- 2026-10-18: jq 1.8.2 installed (winget `jqlang.jq`); on the PATH for new sessions.
- 2026-10-18: Lint hook: `.claude/settings.json` + `.claude/hooks/lint-edit.mjs` (`a47a862`).
- 2026-10-18: Release skill: `.claude/skills/release/SKILL.md` (`9769a39`).
- 2026-10-18: CLAUDE.md: QA Handoff (pre-commit lint, tests, build stay), Writing Code Files, UI Sizing & Layout
  (`bbf06b4`, `aeccf61`).
- 2026-10-18: Pushed without a bump through `d565452`: 332 squash renumbered to a 0001 baseline, 333 default
  rates 33.34/66.68, 334 one-pass smoke test, 335 Convert to collection (migration 0076 on dev), 336 five finished
  docs retired.
