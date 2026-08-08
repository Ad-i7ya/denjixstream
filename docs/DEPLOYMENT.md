# Deployment

KnightXstream deploys to **Cloudflare Workers** — the free tier is plenty. There are
two ways: paste the single file into the dashboard (2 minutes), or use the
one-command `deploy.mjs` script that also pushes to GitHub.

## Prerequisites

- A free [Cloudflare](https://dash.cloudflare.com) account.
- (Recommended) A free [TheMovieDB](https://www.themoviedb.org) API key.
- (For automatic deploy) A GitHub account + token and a Cloudflare API token.

## Option A — Dashboard (manual, 2 minutes)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Worker** → give it a name (e.g. `knightxstream`) → **Deploy**.
2. **Edit code** → delete the boilerplate → paste the **entire contents of
   `worker.js`** → **Save and deploy**.
3. Optional — **Settings → Variables and Secrets**:
   - `TMDB_API_KEY` — your own TMDB key (defaults to a public tutorial key).
   - `SITE_NAME` — brand shown in the logo (default `KnightXstream`).
4. Visit your `*.workers.dev` URL. Done.

## Option B — Automatic (`node deploy.mjs`)

The script pushes the repo to GitHub *and* uploads the worker via the Cloudflare API —
no wrangler, no prompts.

### 1. Prepare credentials

```bash
cd knightxstream
cp .env.example .deploy.env
```

Fill in `.deploy.env` (it is gitignored — never commit it):

| Variable | Where to get it |
|---|---|
| `GITHUB_TOKEN` | GitHub → Settings → Developer settings → Personal access tokens → *Fine-grained* PAT with **Contents: Read & write** on the repo (+ **Administration: Read & write** to auto-create it) |
| `CF_API_TOKEN` | Cloudflare → My Profile → API Tokens → *Edit Cloudflare Workers* template |
| `CF_ACCOUNT_ID` | Cloudflare → Workers & Pages → right sidebar (32 hex chars) |
| `SITE_NAME` | Optional (default `KnightXstream`) |
| `REPO_NAME` | Optional (default `knightxstream`) |
| `CF_WORKER_NAME` | Optional (default `knightxstream`) |

### 2. Build & deploy

```bash
node build.js        # compile src/* → worker.js
node deploy.mjs      # GitHub push + Cloudflare upload + enable workers.dev route
```

Real environment variables always override `.deploy.env`.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `TMDB_API_KEY` | TMDB metadata access | public tutorial key |
| `SITE_NAME` | Brand in the logo/wordmark | `KnightXstream` |
| `GITHUB_TOKEN` | deploy.mjs only | — |
| `CF_API_TOKEN` / `CF_ACCOUNT_ID` | deploy.mjs only | — |
| `REPO_NAME` / `CF_WORKER_NAME` | deploy.mjs only | `knightxstream` |
| `KNIGHTX_KV_ID` | shared analytics KV namespace (set by the admin deploy) | — |

## Admin panel (private)

The private admin worker (`knightxstream-admin`) adds a shared **KV namespace** binding
to this worker and a telemetry **beacon** (`/api/beacon`) plus admin-driven config
(`/api/siteconfig`). Deploy it once with:

```bash
cd knightxstream-admin            # separate repo (private on GitHub)
cp .env.example .deploy.env      # GITHUB_TOKEN / CF_API_TOKEN / CF_ACCOUNT_ID
node build-admin.js
node deploy-admin.mjs            # creates the KV namespace, deploys admin worker + re-deploys this site
```

`deploy-admin.mjs` writes `KNIGHTX_KV_ID` (and the generated `ADMIN_PASSWORD` /
`SESSION_SECRET`) back into `.deploy.env` — future `node deploy.mjs` runs keep the
KV binding automatically. If KV is absent, the public site degrades gracefully
(no beacon writes, default config).

> **Rotate tokens after use.** `.deploy.env` contains live credentials; it is
> gitignored, but treat it as sensitive.

## Custom domain

1. Workers & Pages → your worker → **Settings → Domains & Routes → Add**.
2. Choose a zone on your account (or add your domain to Cloudflare first).
3. Follow the DNS/validation steps — Cloudflare issues the TLS certificate
   automatically.

## Updating the site

```bash
# edit src/…  (never hand-edit worker.js)
node build.js
node deploy.mjs
```

Cloudflare propagates script updates within ~30–60 seconds. Hard-refresh
(`Ctrl+Shift+R`) to bypass your browser cache.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Blank page after deploy | Hard refresh; confirm `worker.js` fully pasted (268 KB+); check `node --check worker.js` |
| TMDB data missing | `TMDB_API_KEY` invalid/quota — set your own key in Variables |
| A server won't play | Geo-blocking or the provider is down — switch to another tab (6 servers listed) |
| Old version still served | Edge cache (`Cache-Control: max-age=60`) — wait ~1 min or append `?cb=<random>` |
| deploy.mjs GitHub 403 | Fine-grained PAT needs **Administration** permission to create repos — create the repo manually and re-run |
