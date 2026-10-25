---
name: release
description: Push the PUG Pricing Tool to the live site (GitHub Pages), with or without a version bump. Use only when the owner explicitly asks to push ("push", "push no bump", "push to git pages", "push as v0.9.9.14-name").
---

# Release: push to the live site

Pushing `main` deploys https://dazeyama.github.io/pug-pricing-tool/. Only on the owner's explicit ask, every time.

- **"Push no bump"** (or just "push"): every step but 2. Step 4 (the review) runs either way.
- **"Push as vX"**: every step. The owner names the version.

## 1. Pre-flight

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git fetch origin                           # so origin/main is current
git status --short                         # empty: commit (or ask about) anything left first
git log --oneline origin/main..main        # what will go out
live=$(gh variable get VITE_SUPABASE_URL | sed -E 's#https://([a-z0-9]+)\.supabase\.co.*#\1#')
echo "live site's project: $live"          # zvxquzcfffmxwizonxuo (prod) since v1.0.0-launch, 2026-10-19
npx supabase migration list --linked --project-ref "$live"   # every local migration is on the live site's project
git diff --stat origin/main..main -- supabase/functions   # Edge Functions changed? (step 9)
```

- **The CLI's link stays on dev** (`supabase/.temp/project-ref`, `psucrzljraxeootwnltf`, for the day's work): the
  commands here that touch the live site's project name it with `--linked --project-ref $live` (the flag overrides
  the link for that one command), so nothing is relinked for a push (decision 377; the CLI asked no password for
  prod on 2026-10-19).
- **A migration that isn't on the live site's project yet:** stop and ask. Code that needs an unapplied migration
  breaks the site.
- **Edge Functions changed** (anything under `supabase/functions/`): note which, for step 9. A change under
  `_shared/` counts for both `prices` and `secrets`.
- Lint, `npm test` (`fail 0`) and the build ran before each commit; if the last commit's run isn't known, run them.

## 2. The version (bump only)

1. The name must be unused and higher than the last release:
   `git tag --sort=-creatordate | head -5` (newest first; plain `git tag` sorts v0.9.9.9 after v0.9.9.13) and
   `git ls-remote --tags origin`. A number already used (v0.9.9.12 was `henry`) means the next free one; say so
   in the report.
2. No AI or model names in the version or the tag message: they're team-facing (a "-fable" release is written
   "-refactor").
3. Set the version in `package.json` (`"version"`) and both places in `package-lock.json`.

There is no VERSION.md, and README.md is the app's Help (no changelog): don't edit it unless the owner asks.

## 3. Record the push (before it, so nothing is left unpushed)

Today's date is `date +%F` (this computer's clock is the store's, Pacific). Edit, but don't commit yet: step 4
reviews these edits with the rest.

1. **NEXT.md:** the "Unpushed" line goes; the push goes under Done with the date, what went out, and the version
   (or "no bump").
2. **CLAUDE.md, Where it stands:** the date, the live version (on a push without a bump: "then pushes without a
   bump, the last on <date>"), the last decision number, and the migrations on the live site's project.

## 4. Review what's going out

Hand the **pug-reviewer** agent (`.claude/agents/pug-reviewer.md`, read-only) the unpushed range
(`origin/main..main`) and the uncommitted record edits from steps 2 and 3 (`git diff`), and wait for its report.

- **A confirmed finding that would break the live site, lose or corrupt data, leak a secret, or deploy something
  the owner didn't ask for:** stop. Report it and ask; push nothing. The record edits stay uncommitted: they say
  the push happened, so they're undone or redone once the owner decides.
- **Anything else** (plausible findings, small or cosmetic ones): carry on, and list them in the step 11 report.
- **The agent isn't available** (a session started outside this folder can't load it): say so, and ask whether to
  push without a review.

## 5. Commit the record

On a bump this is the version commit: the message `vX` (a one-paragraph summary in the body, the usual trailer),
then an annotated tag `git tag -a vX -m "vX: <plain summary of what changed>"`. Without a bump: "Record the <date>
push".

## 6. Secrets check (last, on everything going out)

Real keys only, on the lines being added (key names in grants, docs and this file aren't secrets):

```bash
git diff origin/main..main | grep -E '^\+' | grep -E 'sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.'
git diff --name-only origin/main..main | grep -i -E '\.csv$|(^|/)\.env|PUG Pricing Tool\.txt'
```

Both must print nothing. Any hit: **stop**, say what and where, push nothing.

## 7. Push

```bash
git push origin main
git push origin vX          # bump only
```

**Never `git push --tags`.** Local-only tags (`scanner-attempt-1`; the rollback tags went at the launch clean-up,
decision 536) stay off GitHub.

## 8. Watch the deploy

Find the run by the pushed commit, not by "the latest run": an older run can still be the newest for a few seconds
after the push.

```bash
sha=$(git rev-parse HEAD)
gh run list --commit "$sha" --workflow "Deploy to GitHub Pages" --json databaseId,status -q '.[0]'
gh run watch <id> --exit-status
gh run view <id> --json conclusion,headSha -q '.conclusion + " " + .headSha'   # success <sha>
```

An empty list means the run hasn't been created yet: wait 10 seconds and list again. A run that ends in
**success** with `headSha` equal to `$sha` is the proof the push deployed; step 10 only checks what the site
serves.

A failure: report it with the run's log (`gh run view <id> --log-failed`), and put the push back under Open in
NEXT.md; don't retry blindly.

## 9. Edge Functions

If step 1 found changes under `supabase/functions/`, ask, then deploy each changed function to the **live site's**
project (`$live` from step 1):

```bash
npx supabase functions deploy <prices|secrets> --project-ref <live ref> --use-api --no-verify-jwt
```

## 10. Confirm it's live

```bash
node scripts/live-check.mjs "<version>" "<a string from a new feature>"
```

It reads the entry chunk and every chunk it loads (features can sit in split chunks), and prints each string as
found or MISSING. Pages can lag a minute behind a finished run: wait 20 seconds and run it again before calling a
string missing.

On a push without a bump and with no new user-facing text, the version string was already live, so a found line
can't tell the new build from the old one. Run it anyway (it still shows the site is up and serving the version),
and rest the proof on step 8's run for `$sha`.

## 11. Report

No smoke test: the owner does QA. Report the commits that went out, the version and tag (or "no bump"), the
deploy's result and the commit it ran for, what the live check found, the review's findings that didn't stop the
push, and anything outstanding (Help not updated, a function not deployed).
The release state lives in NEXT.md and CLAUDE.md: don't copy it into memory, and never edit another project's
memory file.
