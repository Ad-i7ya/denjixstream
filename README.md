# DenjiXstream — free movie & TV streaming site (single-file Cloudflare Worker)

An Apple liquid-glass styled streaming site (streamex.sh-style) that runs entirely inside
**one Cloudflare Worker file** (`worker.js` — ~94 KB, includes the UI and the engine).
No server, no database, no monthly cost.
Contact: [@te4m1ord](https://t.me/te4m1ord) on Telegram.

```
┌──────────────┐    ┌──────────────┐    ┌───────────────────┐
│  worker.js   │───►│   TMDB API   │───►│ posters / info /  │
│  (Cloudflare │    │  (metadata)  │    │ search / genres   │
│   Worker)    │    └──────────────┘    └───────────────────┘
│              │    ┌──────────────┐    ┌───────────────────┐
│              │───►│ /api/stream  │───►│ embed servers     │
│              │    │ (server list)│    │ (VidSrc / 2Embed) │
└──────────────┘    └──────────────┘    └───────────────────┘
```

The worker exposes **no public proxy**. It only serves the SPA plus two invisible engine
routes (`/api/tmdb/*` metadata + `/api/stream` server list) — exactly the way streamex.sh
works (its Next.js app fetches TMDB server-side too).

## Features

- **streamex.sh-style UI**: Apple liquid-glass design — frosted sidebar, glass cards,
  spring animations, dark theme, mobile bottom nav.
- **Home**: hero banner, **Continue Watching / Recently Watched** row, trending/popular/
  top-rated/now-playing/upcoming rows with **arrow scroll buttons**.
- **Browse**: genre tiles + chips + sort tabs (Movies & TV), live search.
- **Ctrl+K** glass search popup (fast — 220ms debounce + result cache, arrow keys, Enter, Esc).
- **Detail pages**: hero backdrop, cast row, similar titles, seasons with **horizontally
  scrollable episode rows** (arrow buttons + auto-scroll to current episode).
- **Watch page**: multi-server embed player (VidSrc / 2Embed tabs) + episode navigator.
- **Watchlist & History** stored locally in the browser (localStorage).
- TMDB responses are cached in Cloudflare's Cache API (fast, quota-friendly).

## Project layout

```
streamex-clone/
  src/worker-core.js   Worker: SPA + TMDB proxy + /api/stream (embed servers)
  src/app.js           Frontend app (hash router, views, search popup, history)
  src/styles.css       Apple liquid-glass design system
  build.js             Inlines the three sources → worker.js (single file)
  worker.js            ⭐ THE single deployable file
  test-server.mjs      Local test harness (node)
  deploy.mjs           Push to GitHub + deploy to Cloudflare via APIs
  .deploy.env          Local deploy credentials (gitignored — never commit)
  .env.example         Documented template for the above
```

## Local development

```bash
cd streamex-clone
node build.js            # → worker.js (single file)
node test-server.mjs     # serves the site at http://localhost:8787
```

## Deploy — Cloudflare dashboard (2 minutes, manual, free)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** →
   **Worker** → name it (e.g. `denjixstream`) → **Deploy**.
2. **Edit code** → paste the entire contents of **`worker.js`** → **Save and deploy**.
3. Optional **Settings → Variables and Secrets**: `SITE_NAME`, `TMDB_API_KEY`.

## Deploy — automatic (zero prompts)

Credentials live in `.deploy.env` (gitignored). Just run:

```bash
cd streamex-clone
node build.js
node deploy.mjs          # pushes to GitHub + deploys to Cloudflare
```

- GitHub token: fine-grained PAT with **Contents: Read & write** on the repo
  (+ **Administration: Read & write** to auto-create the repo).
- Cloudflare token: **My Profile → API Tokens → "Edit Cloudflare Workers"** template.

## Editing the stream servers

All servers live in `src/worker-core.js` → `EMBED_SERVERS`. Provider endpoints change
often — update the array, re-run `node build.js`, redeploy. (Keep at least 2-3 servers so
viewers can switch if one is down.)

## Legal

This site does not host or store any media files. It links to content hosted on third-party
services via public embed players. Built for educational/portfolio purposes — users are
responsible for complying with the laws of their jurisdiction. See the site's Legal page.
