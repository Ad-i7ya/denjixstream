# DenjiXstream — free movie & TV streaming site (single-file Cloudflare Worker)

An Apple liquid-glass styled streaming site (streamex.sh features) that runs entirely inside
**one Cloudflare Worker file** (`worker.js` — ~98 KB, includes the UI, the API proxy and the
video plumbing). No server, no database, no monthly cost.
Contact: [@te4m1ord](https://t.me/te4m1ord) on Telegram.

```
┌──────────────┐    ┌──────────────┐    ┌───────────────────┐
│  worker.js   │───►│   TMDB API   │───►│ posters / info /  │
│  (Cloudflare │    │  (metadata)  │    │ search / genres   │
│   Worker)    │    └──────────────┘    └───────────────────┘
│              │    ┌──────────────┐    ┌───────────────────┐
│              │───►│ stream       │───►│ direct m3u8 (no   │
│              │    │ resolvers    │    │ ads) + embeds     │
└──────────────┘    └──────────────┘    └───────────────────┘
```

## Features

- **streamex.sh-style UI**: glass sidebar (`backdrop-blur`), Audiowide logo, glass cards,
  gradient `#121212` theme, 16:9 backdrop rows, hero banner, mobile bottom nav.
- **Browse**: Home (trending/popular/top-rated/now playing/upcoming), Browse with genre &
  sort filters, live Search (movies + TV).
- **Detail pages**: hero backdrop, cast row, similar titles, seasons with **horizontally
  scrollable episode rows** (auto-scrolls to the current episode).
- **Custom glass player** (hls.js) for **direct sources — zero ads**: server switcher,
  quality selector, playback speed, volume, fullscreen, picture-in-picture, download,
  resume-where-you-left-off, and **auto-play next episode** (TV). Keyboard: `Space` play/pause,
  `←/→` seek 5s, `↑/↓` volume, `F` fullscreen, `M` mute, `N` next episode.
- **Watchlist & History** (stored in the browser via localStorage).
- **Ad-free first**: the worker tries to resolve direct m3u8 streams server-side (played in
  our own player). Third-party **embed servers are only fallbacks**, clearly labelled.
- TMDB responses are cached in Cloudflare's Cache API (fast, and saves quota).

## Project layout

```
streamex-clone/
  src/worker-core.js   Worker logic (routing, TMDB proxy, stream resolver, media proxy)
  src/app.js           Frontend app (hash router, views, player)
  src/styles.css       Design system (glassmorphism)
  build.js             Inlines the three sources → worker.js
  worker.js            ⭐ THE single deployable file
  test-server.mjs      Local test harness (node)
  deploy.mjs           Push to GitHub + deploy to Cloudflare via APIs
```

## Local development

```bash
cd streamex-clone
node build.js            # → worker.js (single file)
node test-server.mjs     # serves the site at http://localhost:8787
```

## Deploy — Cloudflare dashboard (2 minutes, manual, free)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Worker** → name it (e.g. `cineglass`) → **Deploy**.
2. Click **Edit code**, select all, **paste the entire contents of `worker.js`**, **Save and deploy**.
3. Optional: **Settings → Variables and Secrets**:
   - `SITE_NAME` → your site's name (shown in the logo)
   - `TMDB_API_KEY` → your own free key from the TMDB website (a public key is used by default)
   - `PROXY_HOSTS` → optional comma-separated allowlist of stream CDN domains
4. Done — visit `https://cineglass.<your-subdomain>.workers.dev`. You can also add a custom
   domain under **Settings → Domains & Routes**.

## Deploy — automatic (GitHub + Cloudflare APIs)

```bash
cd streamex-clone
node build.js
GITHUB_TOKEN=github_pat_xxx node deploy.mjs --github
CF_API_TOKEN=xxx CF_ACCOUNT_ID=xxx node deploy.mjs --cloudflare
# or everything at once:
GITHUB_TOKEN=... CF_API_TOKEN=... CF_ACCOUNT_ID=... CF_WORKER_NAME=cineglass node deploy.mjs
```

- GitHub token: fine-grained PAT with **Contents: Read & write** on the new repo.
- Cloudflare token: **Account → Workers Scripts → Edit** (Account Resources: your account).
- For auto-deploy on every push: connect the repo to Cloudflare via
  **Workers → your worker → Settings → Builds → Git integration** (Cloudflare GitHub App).

## Editing the stream providers

All providers live in `src/worker-core.js`:

- `DIRECT_APIS` — JSON APIs that return direct m3u8 URLs (ad-free)
- `PAGE_SCAN_RESOLVERS` — pages that are scanned for a direct m3u8
- `EMBED_SERVERS` — iframe fallback players (may show ads; last resort)

Provider endpoints change often — update these arrays, re-run `node build.js`, redeploy.

## How the media proxy works

`/proxy?url=…` fetches streams through the Worker, which:
- forwards `Range` requests (seek) and sets a proper `Referer` (required by many CDNs),
- **rewrites HLS manifests** so every variant and segment URL also goes through `/proxy`
  (this is what makes ad-free direct playback work in the browser),
- caches segments in the Cache API,
- blocks private/loopback IPs and non-http(s) schemes (SSRF guard); optional `PROXY_HOSTS`
  allowlist for extra lockdown.

## Legal

This site does not host or store any media files. It links to content hosted on third-party
services and streams it via public players. Built for educational/portfolio purposes — users
are responsible for complying with the laws of their jurisdiction. See the site's Legal page.
