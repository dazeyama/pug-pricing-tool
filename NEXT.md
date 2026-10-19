# NEXT

What's open, newest task first. Claude reads this at the start of every session and tells the owner what's open,
then marks each task done here when it's finished, listing anything pending or half-finished with the exact file
and function.

## Open

- **Review of the unpushed diff** (2026-10-19): a review agent is checking `git diff origin/main..HEAD` (CLAUDE.md
  sections, `.claude/skills/release/SKILL.md`, `.claude/hooks/lint-edit.mjs`, `.claude/settings.json`,
  `eslint.config.mjs`). Findings to report; nothing to fix until the owner says.
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

- 2026-10-19: NEXT.md started, and CLAUDE.md told to read it first.
- 2026-10-19: jq 1.8.2 installed (winget `jqlang.jq`); on the PATH for new sessions.
- 2026-10-19: Lint hook: `.claude/settings.json` + `.claude/hooks/lint-edit.mjs` (`752f6b0`, `dd7d243`).
- 2026-10-19: Release skill: `.claude/skills/release/SKILL.md` (`9769a39`).
- 2026-10-19: CLAUDE.md: QA Handoff (pre-commit lint, tests, build stay), Writing Code Files, UI Sizing & Layout
  (`bbf06b4`, `aeccf61`).
- 2026-10-19: Pushed without a bump through `d565452`: 332 squash renumbered to a 0001 baseline, 333 default
  rates 33.34/66.68, 334 one-pass smoke test, 335 Convert to collection (migration 0076 on dev), 336 five finished
  docs retired.
