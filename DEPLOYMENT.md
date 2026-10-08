# Deploying RailJourney to Vercel (step by step)

This guide assumes you have never deployed before. You will put the code on GitHub, connect GitHub to Vercel, tell
Vercel your API keys, and deploy. Nothing here needs a credit card (Vercel's Hobby plan and GitHub are free).

**The golden rule:** API keys never go in your code or on GitHub. They live in a local `.env` file (which Git
ignores) and in Vercel's *Environment Variables* screen.

## How the app runs on Vercel

- The website (`dist/`) is served as static files.
- Everything under `/api/*` runs as one Vercel Function (`api/index.ts`) which holds your secret keys. The browser
  never sees them.
- `vercel.json` tells Vercel to send `/api/*` to that function and every other address to the website.

## What you need before starting

- A GitHub account and a Vercel account (sign up at vercel.com **with GitHub**, it is easiest).
- Your keys: RailRadar, OpenWeather, OpenTopography, MapTiler.
- [Git](https://git-scm.com/downloads) and Node 24 installed on your computer.

## Step 1 — Check nothing secret is in your project

```bash
git status            # .env must NOT be listed
git check-ignore .env # must print ".env"
```

If `.env` shows up in `git status`, stop and do not commit. Ask for help.

## Step 2 — Create the GitHub repository

1. Go to https://github.com/new
2. Repository name: `RailJourney`. Choose **Public** or **Private** (Vercel works with both).
3. Do **not** tick "Add a README", "Add .gitignore" or "Add a license" (the project already has files).
4. Click **Create repository**.

## Step 3 — Push the project to GitHub

In a terminal, inside the project folder:

```bash
git init -b main                 # skip if the folder is already a Git repo
git add -A
git status                       # read the list: no .env, no node_modules, no dist
git commit -m "Prepare for Vercel deployment"
git remote add origin https://github.com/<your-username>/RailJourney.git
git push -u origin main
```

Replace `<your-username>`. If asked to sign in, use the GitHub CLI (`gh auth login`) or a Personal Access Token.

> Pushed a key by accident? Treat it as stolen: **rotate it** (create a new one on the provider's website and
> delete the old one). Deleting it from GitHub afterwards is not enough, because it stays in the history.

## Step 4 — Make a signing secret for share links

Share links are signed so they work without a database. Generate a random secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Copy the output somewhere safe (a password manager). You will paste it into Vercel in Step 6. Do not put it in
any file that is committed.

## Step 5 — Connect GitHub to Vercel

1. Go to https://vercel.com/new
2. Under **Import Git Repository**, find `RailJourney` and click **Import**. (If it is missing, click
   *Adjust GitHub App Permissions* and allow access to the repository.)
3. Vercel detects **Vite** automatically. Leave these as they are (they come from `vercel.json`):
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. **Do not click Deploy yet.** Open **Environment Variables** first (next step).

## Step 6 — Add the environment variables in Vercel

On the same import screen (or later in **Project → Settings → Environment Variables**), add each row. Keep all
three environments ticked (Production, Preview, Development) unless you have a reason not to.

| Name | Value | Secret? |
| --- | --- | --- |
| `TRAIN_PROVIDER` | `railradar` | no |
| `RAILRADAR_BASE_URL` | `https://api.railradar.in/v1` | no |
| `RAILRADAR_API_KEY` | your RailRadar key | **yes** |
| `OPENWEATHER_API_KEY` | your OpenWeather key | **yes** |
| `OPENTOPOGRAPHY_API_KEY` | your OpenTopography key | **yes** |
| `SHARE_SIGNING_SECRET` | the random value from Step 4 | **yes** |
| `VITE_MAPTILER_KEY` | your MapTiler key | **public** (see below) |

Notes:

- **`VITE_MAPTILER_KEY` is public by design.** MapTiler needs the key in the browser, so anyone can see it in the
  site's code. Protect it in the MapTiler dashboard instead: open your key's settings and **restrict it to your
  site's domain** (for example `your-app.vercel.app`). Because Vite bakes it in at build time, add it *before*
  deploying; if you add or change it later, **redeploy**.
- For the secret rows, switch on **Sensitive** if Vercel offers it (the value is then hidden after saving).
- `TRUST_PROXY` is turned on automatically on Vercel. You do not need to add it.
- Everything else (cache times, rate limits, and so on) has a sensible default. The full list is in
  `.env.example`.
- `TRAIN_PROVIDER=mock` is **refused in production** on purpose, so do not use it on Vercel.

## Step 7 — Deploy

Click **Deploy**. After about a minute you get a URL like `https://railjourney-xxxx.vercel.app`. From now on,
every `git push` to `main` deploys automatically, and every branch or pull request gets its own preview URL.

## Step 8 — Test that every API works

Replace `YOUR-SITE` with your Vercel address.

1. **API is alive:** open `https://YOUR-SITE/api/health`. You should see `{"status":"ok","provider":"railradar"}`.
   If the provider says `mock`, `TRAIN_PROVIDER` is not set.
2. **Train data (RailRadar):** on the home page search for `12951`, or open
   `https://YOUR-SITE/api/trains/search?q=12951`. You should see real train names.
3. **Live tracking:** open a train. You should see its position, delay and the list of halts.
4. **Map (MapTiler):** the live page should show a detailed map with place names. A plain dark background with no
   labels means `VITE_MAPTILER_KEY` is missing or was added after the build (add it, then redeploy).
5. **Weather (OpenWeather):** switch the panel to **Weather**. You should see temperatures for three places.
6. **Terrain:** switch to **Terrain**. You should see an elevation graph. (OpenTopography's free key allows 50 calls
   a day; the graph uses a keyless backup so it keeps working when that runs out.)
7. **Share link:** click the share button, open the link in a private window. It should show the same train.
8. **Secrets are not exposed:** on your site press F12, open **Network**, reload, and click through some requests.
   You should see calls to `/api/...` on your own domain and to MapTiler tiles, but **never** your RailRadar,
   OpenWeather or OpenTopography key.

If something fails, open Vercel → your project → **Logs** (or **Deployments → the deployment → Functions**) to see
the error. Common causes:

| Symptom | Likely cause |
| --- | --- |
| `/api/health` shows an error page | A required variable is missing. The log says which (`SHARE_SIGNING_SECRET`, `RAILRADAR_API_KEY`…). Add it and redeploy. |
| Search says "not configured" | `TRAIN_PROVIDER` or `RAILRADAR_API_KEY` missing. |
| Map has no labels | `VITE_MAPTILER_KEY` missing, or the key is restricted to a different domain. |
| Works, then stops after a few hours | RailRadar free tier is 1,000 requests a month. See `README.md` → Free-tier limits. |
| Request takes about 10 s then fails | The function time limit. `vercel.json` allows 30 s; Hobby plans may cap this lower. |

## Rotating a key later

1. Create a new key on the provider's site and delete the old one.
2. In Vercel: Project → Settings → Environment Variables → edit the value.
3. Go to **Deployments**, open the latest one, and choose **Redeploy** (changes only apply to new deployments).
4. Update your local `.env` too.

## Running locally (unchanged)

```bash
npm ci
cp .env.example .env     # then fill in your keys
npm run dev
```
