# NEXT

What's open, newest task first. Claude reads this at the start of every session and tells the owner what's open,
then marks each task done here when it's finished, listing anything pending or half-finished with the exact file
and function.

## Open

- **The review's findings, waiting on the owner** (nothing fixed yet):
  - `.claude/skills/release/SKILL.md` step 2: the secrets grep matches the skill's own text and every
    `service_role` grant in a migration, so it would stop every push.
  - `SKILL.md` step 3.4: still says to add a "Then live as…" paragraph to CLAUDE.md's history, which no longer
    exists; should update CLAUDE.md "Where it stands" instead.
  - `SKILL.md` step 8: updates memory but not NEXT.md or CLAUDE.md "Where it stands".
  - `SKILL.md` step 7 (Edge Functions): skipped on "push no bump" and checked after the push; move it to pre-flight.
  - `SKILL.md`: hard-codes the dev project ref; wrong after the move to prod.
  - `SKILL.md` step 3.1: `git tag` sorts alphabetically; use `git tag --sort=-creatordate`.
  - `SKILL.md` step 6: the live check reads only the entry chunk; features in split chunks look missing.
  - `SKILL.md` step 1: no `git fetch` before comparing with `origin/main`.
  - `.claude/hooks/lint-edit.mjs` line 26: the "this project only" check passes files on another drive (D:), so a
    `.py` edit in klug alters gets `py_compile` (a `__pycache__` there); a missing Python reports a false error.
  - `.claude/settings.json`: the hook needs Git Bash and `node` on the PATH; elsewhere it quietly does nothing.
  - `lint-edit.mjs` line 5: "no jq on this machine" is out of date; an ESLint crash exits 1, not 2.
  - Dates: today's entries say 2026-10-19 (UTC); the store's clock was still 2026-10-18.
- **Unpushed:** `bbf06b4`, `aeccf61`, `9769a39`, `752f6b0`, `dd7d243` (CLAUDE.md rules, the release skill, the
  lint hook, ESLint's `.claude/**` globals), plus this file. Push only on request.
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

- 2026-10-19: Review of the unpushed diff (read-only, a review agent): findings listed under Open.
- 2026-10-19: CLAUDE.md cleaned up: the release history cut to a short "Where it stands", stale lines fixed (the
  Changelog lock is 0002; one small change at a time instead of phases), the duplicate QA line gone and the browser
  rule's one exception spelled out, the rules from memory added (Help edits only when asked, nothing about the AI
  in team write-ups, one-pager style, the JustTCG key and store password, the migration routine, scratch files),
  the retired-doc pointers in one line and a start-of-session order.
- 2026-10-19: NEXT.md started, and CLAUDE.md told to read it first.
- 2026-10-19: jq 1.8.2 installed (winget `jqlang.jq`); on the PATH for new sessions.
- 2026-10-19: Lint hook: `.claude/settings.json` + `.claude/hooks/lint-edit.mjs` (`752f6b0`, `dd7d243`).
- 2026-10-19: Release skill: `.claude/skills/release/SKILL.md` (`9769a39`).
- 2026-10-19: CLAUDE.md: QA Handoff (pre-commit lint, tests, build stay), Writing Code Files, UI Sizing & Layout
  (`bbf06b4`, `aeccf61`).
- 2026-10-19: Pushed without a bump through `d565452`: 332 squash renumbered to a 0001 baseline, 333 default
  rates 33.34/66.68, 334 one-pass smoke test, 335 Convert to collection (migration 0076 on dev), 336 five finished
  docs retired.
