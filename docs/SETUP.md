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

### Testing the phone scanner (docs/SCAN_FUNCTION.md)

A phone's camera only works on an HTTPS page, so for the scanner the dev server
has a second way to start, reachable from the shop's Wi-Fi:

1. Double-click **`start-phone.bat`**. It stops `start.bat`'s server if it's running
   (both use port 5180), starts `npm run dev:lan`, opens the laptop's page, and
   prints the phone's address, such as `https://192.168.1.23:5180/#/scan`. SPACE
   stops it. (By hand: `npm run dev:lan`, and the laptop's address from `ipconfig`,
   the Wi-Fi adapter's IPv4 address.)
2. If Windows Firewall asks about Node.js the first time, allow it on private networks.
3. On the phone, on the same Wi-Fi, open that address followed by `#/scan`, e.g.
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
type `RESTORE`. A backup of what's there now downloads first (`…-before-restore.json`), then
everything is replaced in one step and the page reloads. Computers' names, the Crystal Commerce
CSVs and the API keys stay as they are. Try it on **dev** first.

If prod moves to the Pro plan (daily backups), set `CLOUD_BACKUPS` to `true` in
`src/lib/backup.js`; the reminder banner then stops.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`: it builds with the repository's
Actions variables and publishes `dist/` to GitHub Pages. Only push when the site should
change.

**For now the live site runs on dev** (owner's decision, 2026-09-30): the three Actions
variables hold the **`pug-pricing-dev`** values from `.env.development`, so version
0.9.0-dev, then 0.9.1-final (2026-09-30), 0.9.9-export (2026-10-01), 0.9.9-day0 and 0.9.9.1-smoke (2026-10-02), can be tried at the store against the dev data before launch. **At launch
(Phase 10), set them back to the `.env.production` values** (prod, `zvxquzcfffmxwizonxuo`)
after prod is migrated, then push again or re-run the workflow.
