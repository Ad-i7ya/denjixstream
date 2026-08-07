# DenjiXstream

> Free, ad-proof movie & TV streaming — an Apple **Liquid Glass** experience that runs entirely inside a **single Cloudflare Worker**. No server, no database, no monthly cost.

| | |
|---|---|
| **Live site** | https://denjixstream.te4m1ord.workers.dev |
| **Source** | https://github.com/Ad-i7ya/denjixstream |
| **Stack** | Cloudflare Workers · vanilla JS SPA · TheMovieDB (TMDB) API · localStorage |
| **Contact** | [@te4m1ord](https://t.me/te4m1ord) (Denji) · [@kzr0x](https://t.me/kzr0x) (Kyren) |

---

## What it is

A streamex.sh-style streaming site with a distinctive Apple "liquid glass" aesthetic —
layered blur, specular highlights, spring physics, and a fully responsive layout for
both desktop and phone orientation. The entire application — UI, styles, router, TMDB
proxy and embed-server engine — is compiled into **one deployable file** (`worker.js`)
and served by Cloudflare at zero infra cost.

```
┌────────────────────┐   ┌──────────────────┐   ┌─────────────────────────┐
│   worker.js        │──►│  /api/tmdb/*     │──►│  TheMovieDB metadata    │
│   (single file,    │   │  (cached proxy)  │   │  posters · info · search│
│   Cloudflare)      │   └──────────────────┘   └─────────────────────────┘
│                    │   ┌──────────────────┐   ┌─────────────────────────┐
│   SPA + engine     │──►│  /api/stream     │──►│  6 audited ad-free      │
│                    │   │  (server list)   │   │  embed servers           │
└────────────────────┘   └──────────────────┘   └─────────────────────────┘
```

The worker exposes **no public proxy** — only two invisible engine routes
(`/api/tmdb/*` metadata + `/api/stream` server list). Everything else is a static SPA,
exactly how streamex.sh works.

## Features

**Design & UX**
- Apple **Liquid Glass** design system — frosted glass sidebar, glass cards, specular
  highlights, spring animations, deep near-black theme.
- Smooth **route transitions** (frosted veil swap), hero **trailer-on-hover**,
  slideshow with dots/arrows that pauses while your cursor is parked on it.
- **Responsive**: desktop sidebar (drag-to-resize, collapse to fullscreen) · phone
  bottom-nav, drawer menu and orientation-tuned layouts (Netflix-style).
- **Ctrl+K** quick-search popup (220 ms debounce, result cache, arrow keys, Enter, Esc)
  — a visible `Ctrl K` / `⌘K` chip sits inside the search bar too.

**Content**
- **Home**: hero slideshow, Continue Watching, trending, popular, top-rated,
  now-playing, upcoming and more rows — arrow-scrolled, never mouse-wheel hijacked.
- **Browse / Categories**: genre tiles with imagery, Movies & TV tabs, sort chips.
- **Anime** section with its own category rows.
- **Search** page with preview content and live multi-type results.
- **Detail pages**: hero backdrop + background trailer, cast, similar titles, seasons
  with horizontally scrollable episode rows (episode numbers visible).
- **Watch page**: multi-server embed player (6 audited ad-free servers), episode
  navigator overlay, fullscreen, animated loading ring, graceful error card.

**Ad-proofing (sandbox-free)**
- Player runs with **no `sandbox` attribute** — embeds that refuse sandboxed frames
  work at 100% compatibility.
- **3-layer popup auto-close** — `popup` event listener, `window.open` wrapper and a
  periodic sweep slam ad tabs shut; `t.me`/YouTube/GitHub links are allowlisted.
- **Click shield** — every stray tap is swallowed until the user deliberately taps
  **"Enable player"**, so clickjacking ad-overlays can never fire.
- Server list is **curated by audit** — every server is verified ad-free in its HTML
  *and* JS bundles. See [docs/SECURITY.md](docs/SECURITY.md).

**Personal**
- **Watchlist** and **History** stored locally (localStorage) — no accounts needed.
- Footer credits the developers with Telegram profile photos.

**Admin panel (private)**
- A separate, **private** worker (`denjixstream-admin`) gives the owner full control:
  usage analytics (visitors, devices, OS, browsers, countries, top pages/titles/searches),
  live logs, embed-server management, announcement banner, maintenance mode, and account
  settings — behind a Google-style email+password sign-in. See
  [denjixstream-admin](https://github.com/Ad-i7ya/denjixstream-admin) (private repo) and
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project layout

```
denjixstream/
├── src/
│   ├── worker-core.js      Worker engine: SPA shell + TMDB proxy + /api/stream
│   ├── app.js              Frontend app: hash router, views, search, player, shield
│   └── styles.css          Apple "Liquid Glass" design system
├── assets/                 Developer Telegram profile photos (inlined at build)
├── build.js                Inlines src/* → single deployable worker.js
├── worker.js               ⭐ THE deployable single file (generated)
├── test-server.mjs         Local test harness (node, port 8787)
├── deploy.mjs              One-command GitHub push + Cloudflare deploy
├── .env.example            Documented template for deploy credentials
├── docs/                   Architecture, deployment, security, API, testing
└── package.json            npm scripts (build / serve / deploy)
```

## Quick start

```bash
cd denjixstream
node build.js            # compile src/* → worker.js
node test-server.mjs     # serve locally at http://localhost:8787
```

## Deploy

**Dashboard (2 minutes, free):** Cloudflare → Workers & Pages → Create Worker →
paste the entire contents of `worker.js` → Save & Deploy. Optionally set
`TMDB_API_KEY` and `SITE_NAME` under Settings → Variables.

**Automatic (one command):**

```bash
cp .env.example .deploy.env   # fill in GITHUB_TOKEN / CF_API_TOKEN / CF_ACCOUNT_ID
node build.js
node deploy.mjs               # pushes to GitHub + deploys to Cloudflare
```

Full instructions: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

| Doc | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Single-file worker design, build pipeline, routing, data flow |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Manual & automatic deploy, env vars, custom domains, updates |
| [docs/SECURITY.md](docs/SECURITY.md) | Ad-proofing strategy, no-sandbox rationale, server audit policy |
| [docs/API.md](docs/API.md) | Internal endpoints, embed-server list, adding a server |
| [docs/TESTING.md](docs/TESTING.md) | Local harness, jsdom verification, release checklist |

## Admin panel & analytics

The site ships a tiny telemetry beacon (`/api/beacon` — anonymous page/watched/search
events) and reads admin-driven config (`/api/siteconfig`). Data lives in a **shared KV
namespace** that the private **DenjiXstream Admin** worker administers. Deploying the
admin panel: `cd denjixstream-admin && node build-admin.js && node deploy-admin.mjs`
(see the admin repo's README). The public worker degrades gracefully if KV is absent.

## Editing the stream servers

All servers live in `src/worker-core.js` → `EMBED_SERVERS`. Provider endpoints change
often — update the array, re-run `node build.js`, redeploy. **Only add servers that pass
the ad audit** (see [docs/SECURITY.md](docs/SECURITY.md) — popup-cloaking embeds cannot
be blocked from a sandbox-free page).

## License

[MIT](LICENSE) © 2026 Ad-i7ya (DenjiXstream).

## Legal

This site does not host or store any media files. It links to content hosted on
third-party services via public embed players. Built for educational/portfolio purposes —
users are responsible for complying with the laws of their jurisdiction. See the site's
Legal page (`#/legal`).
