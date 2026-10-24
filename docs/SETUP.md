# PUG Pricing Tool: setup and operations

How to run, configure and deploy the app, and how to change the store password. The
full design is in [DESIGN_SPEC.md](DESIGN_SPEC.md); the app is built in phases (spec
Section 15), and this file grows with it.

- **Live site:** https://dazeyama.github.io/pug-pricing-tool/ (published by pushing to `main`)
- **Stack:** React + Vite (JavaScript), Supabase (Postgres, Auth, Realtime, Storage,
  Edge Functions), hosted on GitHub Pages.

## Run it on this computer

Double-click **`start.bat`**. It installs packages on the first run, starts the dev
server on port 5180, and opens http://localhost:5180/. Press **SPACE** in its window
to stop, or run **`stop.bat`** to free the port.

Needs Node.js LTS (`winget install OpenJS.NodeJS.LTS`).

`localhost` uses the **dev** Supabase project, so testing never touches the store's
real data. The live site uses the **prod** project.

### Testing the phone scanner

A phone's camera only works on an HTTPS page, so for the scanner the dev server
has a second way to start, reachable from the shop's Wi-Fi:

1. Double-click **`start-phone.bat`**. It stops `start.bat`'s server if it's running
   (both use port 5180), starts `npm run dev:lan`, opens the laptop's page, and
   prints the phone's address, such as `https://192.168.1.23:5180/#/scan`. SPACE
   stops it. (By hand: `npm run dev:lan`, and the laptop's address from `ipconfig`,
   the Wi-Fi adapter's IPv4 address.)
2. If Windows Firewall asks about Node.js the first time, allow it on private networks.
3. On the phone, on the same Wi-Fi, open the address it printed, e.g.
   `https://192.168.1.23:5180/#/scan`. The certificate is the dev server's own, so
   the browser warns once: Chrome → **Advanced → Proceed**; Safari → **Show
   Details → visit this website**.
4. Sign in with the store password and name the phone. On the laptop, open the
   Price tab (or a collection) at `https://localhost:5180/`, accepting the same
   warning once: while `dev:lan` runs, the dev server is HTTPS only.

Like `localhost`, this uses the **dev** project: test scans land in dev's buys.
Without a phone, `#/scan` on the laptop opens the same page and **START CAMERA**
uses the webcam (`http://localhost:5180/#/scan` needs no certificate).

## Configuration

Two git-ignored files hold each project's public settings:

| File | Used by | Supabase project |
|---|---|---|
| `.env.development` | `start.bat` / `npm run dev` | `pug-pricing-dev` |
| `.env.production` | `npm run build` on this computer | `pug-pricing-prod` |

Each has `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and
`VITE_STORE_LOGIN_EMAIL`. The live build gets the same three names from the GitHub
repository's **Actions variables** (Settings → Secrets and variables → Actions →
Variables).

The publishable key (`sb_publishable_…`) is public by design; Row Level Security
protects the data. The **secret key** (`sb_secret_…`) never goes in these files, the
repo, or chat.

## The store password

The app has one Supabase Auth account (`playersuniongamecoop@gmail.com`) in each
project. The login screen asks only for its password.

**To change it:** Supabase dashboard → the project → Authentication → Users → click the
store account → look for a password option in its menu. If the dashboard doesn't offer
one, open PowerShell **in the project folder** and run the lines below, filling in the
three values. The secret key comes from Project Settings → API Keys; paste it only into
this terminal, never into a file or chat.

```powershell
$env:SB_URL = "https://<project>.supabase.co"
$env:SB_SECRET = "sb_secret_..."
$env:NEW_PW = "<the new password>"
node -e "const {createClient}=require('@supabase/supabase-js');const s=createClient(process.env.SB_URL,process.env.SB_SECRET);s.auth.admin.listUsers().then(async({data})=>{const u=data.users.find(x=>x.email==='playersuniongamecoop@gmail.com');const r=await s.auth.admin.updateUserById(u.id,{password:process.env.NEW_PW});console.log(r.error?r.error.message:'Password changed.')})"
```

Close the terminal afterwards so the key doesn't linger. Do it for dev and prod
separately. Every computer then needs the new password at its next sign-in.

Public sign-ups must stay **off** in both projects (Authentication → Sign In /
Providers → "Allow new users to sign up"), or anyone could create an account.

## Backups

On Supabase's Free plan there are no automatic backups, so download one at least weekly:
**Settings → Backups → Download backup** (or the yellow reminder banner, which appears once the
last one is over 7 days old). The file is `pug-pricing-backup-<date>-<time>.json`. Keep copies
off the store computers, and never put one in the repo (`.gitignore` blocks the name).

**To restore:** Settings → Backups → **Restore from backup…**, pick the file, check the counts,
type `RESTORE` and press Restore: a backup of what's there now downloads (`…-before-restore.json`);
check it saved, then press Restore again, and everything is replaced in one step and the page reloads. Computers' names, the Crystal Commerce
CSVs and the API keys stay as they are. Try it on **dev** first.

**Restoring into a new project** (the old one is gone; decision 348). In order:

1. Create the Supabase project; in it, Authentication → Users → add the store account (the store email,
   Auto Confirm User), and turn **off** "Allow new users to sign up".
2. `npx supabase db push --linked --project-ref <new ref>`: the baseline and every migration after it. The CLI stays
   linked to dev (decision 377); if the CLI asks for the new project's database password, the owner types it.
3. Deploy the Edge Functions: `npx supabase functions deploy prices --project-ref <new ref> --use-api --no-verify-jwt`,
   and the same for `secrets`.
4. Point the site at it: the GitHub Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then
   re-run the deploy (or push). Settings → Data API → Max rows as before: 1,000, the default (the app pages
   through any limit, so a lower one is slower, not wrong; decisions 346, 365, 373).
5. Sign in on the site, add one staff user (Restore needs a picked user), then Settings → Backups → **Restore
   from backup…** with the newest backup. Buys, collections, the Changelog, staff, settings and the learned Crystal
   Commerce matches come back; the buy numbers carry on past the highest in the file.
6. **Buy numbers used after that backup** are on labels but not in the file. If any buys were confirmed after it,
   move the counter past them by hand in the SQL editor, never backwards:
   `select setval('buys_number_seq', greatest(<highest number on a label>, (select last_value from buys_number_seq)), true);`
7. Upload the Master Crystal Inventory CSV again (it lived in the old project's storage), and put the JustTCG key
   back in Settings → API keys. Everyone signs in again; computers keep their names.
8. Check the CLI is still linked to dev (`supabase/.temp/project-ref` reads `psucrzljraxeootwnltf`): a plain
   `db push --linked` goes to whichever project is linked, so the link stays on dev and prod is always named.

Try it on a throwaway project before it's needed.

### Restoring a paused project

Prod is on the Free plan (decision 376), and Supabase pauses a Free project that has had
little database activity over seven days: the store's daily use keeps it awake, but a
week closed (a holiday) can pause it. Supabase emails the project owner about a week
before, and again when it's paused. Nothing is lost: a paused project keeps its data and
settings, and can be restored for a year after it was paused ("Once the project is paused,
there is a 1-year window to restore the project on the platform from within Supabase
Studio").

**What it looks like:** the live site loads but can't sign in, or shows "Couldn't load"
messages everywhere, and the Supabase dashboard shows the project as paused.

**To restore it:** Supabase dashboard → your organization → the paused project →
**Resume project**, and confirm. It takes a few minutes. Then, on the live site, sign in and
look without writing anything (decision 380): Settings shows the JustTCG key masked, the
usage and the Master Crystal Inventory, and the Changelog opens. Don't price a test card or
press Test: both move the usage counter. The API key and the Edge Functions are kept, so the
store's first real card proves them. Live updates come back with it; nothing has to be set
again.

**To keep it from pausing** during a planned closure: open the live site and sign in once
during the week, or visit the project in the dashboard when the warning email comes.
Paid plans are never paused.

**If the year has passed** and the project can't be resumed, it's gone: follow "Restoring
into a new project" above with the newest backup file. That's the reason for the weekly
backup download.

If prod moves to the Pro plan (daily backups), set `CLOUD_BACKUPS` to `true` in
`src/lib/backup.js`; the reminder banner then stops.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`: it builds with the repository's
Actions variables and publishes `dist/` to GitHub Pages. Only push when the site should
change.

**The live site runs on prod** (`zvxquzcfffmxwizonxuo`) since v1.0.0-launch, 2026-10-19: the
three Actions variables hold the `.env.production` values. Before that (2026-09-30 to
2026-10-19) they held `.env.development`'s, so the builds up to v0.9.9.15-review ran at the
store against dev's data. To point the site at another project, set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` to that project's values and push or re-run the workflow
(about three minutes). `localhost` is unaffected: `start.bat` reads `.env.development`.
