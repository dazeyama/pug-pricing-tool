# NEXT

What's open, newest task first. Claude reads this at the start of every session and tells the owner what's open,
then marks each task done here when it's finished, listing anything pending or half-finished with the exact file
and function.

## Open

- **Unpushed:** everything since the 2026-10-18 push (`d565452`): the CLAUDE.md rules and cleanup, the release
  skill and `scripts/live-check.mjs`, the lint hook, NEXT.md, and the date fixes. Push only on request.
- **The lint hook hasn't run in a live session yet:** `.claude/settings.json` → `.claude/hooks/lint-edit.mjs`. It
  loads only in a session started in this folder; the first such session can confirm an Edit triggers it.
- **Help:** `README.md` "A buy's ⋯ menu" table (line ~1113, after **Convert to project**) has no row for **Convert
  to collection** (decision 335). Only when the owner asks for Help.
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
