---
name: release
description: Push the PUG Pricing Tool to the live site (GitHub Pages), with or without a version bump. Use only when the owner explicitly asks to push ("push", "push no bump", "push to git pages", "push as v0.9.9.14-name").
---

# Release: push to the live site

Pushing `main` deploys https://dazeyama.github.io/pug-pricing-tool/. Only on the owner's explicit ask, every time.

- **"Push no bump"** (or just "push"): every step but 2. Step 1b (the review) runs either way.
- **"Push as vX"**: every step. The owner names the version.

## 1. Pre-flight

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git fetch origin                           # so origin/main is current
git status --short                         # empty: commit (or ask about) anything left first
git log --oneline origin/main..main        # what will go out
live=$(gh variable get VITE_SUPABASE_URL | sed -E 's#https://([a-z0-9]+)\.supabase\.co.*#\1#')
echo "live site's project: $live"          # psucrzljraxeootwnltf (dev) until launch; zvxquzcfffmxwizonxuo (prod) after
cat supabase/.temp/project-ref             # the linked project: must be the same as $live
npx supabase migration list --linked       # every local migration is on the live site's project
git diff --stat origin/main..main -- supabase/functions   # Edge Functions changed? (step 7)
```

- **The linked project isn't the live site's:** stop and ask. Linking takes the database password, which the owner
  types (`npx supabase link --project-ref <ref>`).
- **A migration that isn't on the live site's project yet:** stop and ask. Code that needs an unapplied migration
  breaks the site.
- **Edge Functions changed** (anything under `supabase/functions/`): note which, for step 7. A change under
  `_shared/` counts for both `prices` and `secrets`.
- Lint, `npm test` (`fail 0`) and the build ran before each commit; if the last commit's run isn't known, run them.

## 1b. Review what's going out

Hand the unpushed range (`origin/main..main`) to the **pug-reviewer** agent (`.claude/agents/pug-reviewer.md`,
read-only) and wait for its report.

- **A confirmed finding that would break the live site, lose or corrupt data, leak a secret, or deploy something
  the owner didn't ask for:** stop. Report it and ask; push nothing.
- **Anything else** (plausible findings, small or cosmetic ones): carry on, and list them in the step 9 report.
- **The agent isn't available** (a session started outside this folder can't load it): say so, and ask whether to
  push without a review.

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

Today's date is `date +%F` (this computer's clock is the store's, Pacific).

1. **NEXT.md:** the "Unpushed" line goes; the push goes under Done with the date, what went out, and the version
   (or "no bump").
2. **CLAUDE.md, Where it stands:** the date, the live version (on a push without a bump: "then pushes without a
   bump, the last on <date>"), the last decision number, and the migrations on the live site's project.
3. Commit them. On a bump this is the version commit: the message `vX` (a one-paragraph summary in the body, the
   usual trailer), then an annotated tag `git tag -a vX -m "vX: <plain summary of what changed>"`. Without a bump:
   "Record the <date> push".

## 4. Secrets check (last, on everything going out)

Real keys only, on the lines being added (key names in grants, docs and this file aren't secrets):

```bash
git diff origin/main..main | grep -E '^\+' | grep -E 'sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.'
git diff --name-only origin/main..main | grep -i -E '\.csv$|(^|/)\.env|PUG Pricing Tool\.txt'
```

Both must print nothing. Any hit: **stop**, say what and where, push nothing.

## 5. Push

```bash
git push origin main
git push origin vX          # bump only
```

**Never `git push --tags`.** Local-only tags (`scanner-attempt-1`, `rollback-pre-launch`, `rollback-pre-squash`,
`pre-export-build`, and `pre-squash` at the squash) stay off GitHub.

## 6. Watch the deploy

```bash
gh run list --limit 1                       # the "Deploy to GitHub Pages" run for this push
gh run watch <id> --exit-status
gh run view <id> --json conclusion -q .conclusion   # success
```

A failure: report it with the run's log (`gh run view <id> --log-failed`), and put the push back under Open in
NEXT.md; don't retry blindly.

## 7. Edge Functions

If step 1 found changes under `supabase/functions/`, ask, then deploy each changed function to the **live site's**
project (`$live` from step 1):

```bash
npx supabase functions deploy <prices|secrets> --project-ref <live ref> --use-api --no-verify-jwt
```

## 8. Confirm it's live

```bash
node scripts/live-check.mjs "<version>" "<a string from a new feature>"
```

It reads the entry chunk and every chunk it loads (features can sit in split chunks), and prints each string as
found or MISSING. Pages can lag a minute behind a finished run: wait 20 seconds and run it again before calling a
string missing.

## 9. Report

No smoke test: the owner does QA. Report the commits that went out, the version and tag (or "no bump"), the
deploy's result, what the live check found, the review's findings that didn't stop the push, and anything
outstanding (Help not updated, a function not deployed).
The release state lives in NEXT.md and CLAUDE.md: don't copy it into memory, and never edit another project's
memory file.
