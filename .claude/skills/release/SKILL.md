---
name: release
description: Push the PUG Pricing Tool to the live site (GitHub Pages), with or without a version bump. Use only when the owner explicitly asks to push ("push", "push no bump", "push to git pages", "push as v0.9.9.14-name").
---

# Release: push to the live site

Pushing `main` deploys https://dazeyama.github.io/pug-pricing-tool/, which runs on the **dev** Supabase project
until launch. Only on the owner's explicit ask, every time.

- **"Push no bump"** (or just "push"): steps 1, 2, 4, 5, 6, 8.
- **"Push as vX"**: every step. The owner names the version.

## 1. Pre-flight

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git status --short                         # empty: commit (or ask about) anything left first
git log --oneline origin/main..main        # what will go out
cat supabase/.temp/project-ref             # psucrzljraxeootwnltf (dev)
npx supabase migration list --linked       # every local migration is on the remote too
```

- A migration that isn't on dev yet: **stop and ask.** The live site uses dev, so code that needs an unapplied
  migration breaks it.
- Lint, `npm test` (`fail 0`) and the build ran before each commit; if the last commit's run isn't known, run them.

## 2. Secrets check

```bash
git diff origin/main..main | grep -i -E "sb_secret|service_role|eyJhbGci"
git diff --name-only origin/main..main | grep -i -E "\.csv$|\.env|PUG Pricing Tool.txt"
```

Any hit: **stop**, say what and where, push nothing.

## 3. The version (bump only)

1. Check the name is free and higher than the last release: `git tag` and `git ls-remote --tags origin`. A
   number already used (v0.9.9.12 was `henry`) means the next free one; say so in the report.
2. No AI or model names in the version or the tag message: they're team-facing (a "-fable" release is written
   "-refactor").
3. Set the version in `package.json` (`"version"`) and both places in `package-lock.json`.
4. Add a "Then live as vX (date): …" paragraph to CLAUDE.md's history, naming the decisions since the last
   release and any migrations on dev.
5. Commit with the message `vX` (a one-paragraph summary in the body, the usual trailer), then an annotated tag:
   `git tag -a vX -m "vX: <plain summary of what changed>"`.

There is no VERSION.md, and README.md is the app's Help (no changelog): don't edit it unless the owner asks.

## 4. Push

```bash
git push origin main
git push origin vX          # bump only
```

**Never `git push --tags`.** Local-only tags (`scanner-attempt-1`, `rollback-pre-launch`, `rollback-pre-squash`,
`pre-export-build`, and `pre-squash` at the squash) stay off GitHub.

## 5. Watch the deploy

```bash
gh run list --limit 1                       # the "Deploy to GitHub Pages" run for this push
gh run watch <id> --exit-status
gh run view <id> --json conclusion -q .conclusion   # success
```

A failure: report it with the run's log (`gh run view <id> --log-failed`); don't retry blindly.

## 6. Confirm it's live

```bash
js=$(curl -s "https://dazeyama.github.io/pug-pricing-tool/?v=$(date +%s)" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
curl -s "https://dazeyama.github.io/pug-pricing-tool/$js" | grep -o -E "<version>|<a string from a new feature>" | sort -u
```

Pages can lag a minute behind a finished run: wait 20 seconds and look again before calling it missing.

## 7. Edge Functions

If `supabase/functions/` changed since the last push, the site needs them deployed too:
`npx supabase functions deploy <name> --project-ref psucrzljraxeootwnltf --use-api --no-verify-jwt`. Ask first.

## 8. Report

No smoke test: the owner does QA. Report the commits that went out, the version and tag (or "no bump"), the
deploy's result, what the live bundle showed, and anything outstanding (Help not updated, a function not
deployed). Update the PUG line in memory (`MEMORY.md`): what's live, at which commit, nothing unpushed.
