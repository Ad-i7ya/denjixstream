# Architecture

DenjiXstream is a **single-file Cloudflare Worker**: one JavaScript module serves the
entire site — HTML, CSS, the frontend application, the TMDB metadata proxy and the
embed-server engine. There is no backend, no database and no build output beyond the
one file you deploy.

## The single-file model

```
src/worker-core.js ─┐
src/app.js ─────────┤──►  build.js  ──►  worker.js  (ONE deployable file)
src/styles.css ─────┘
assets/*.jpg ───────┘      (inlined as base64)
```

`build.js` reads the three sources plus the developer avatar images and inlines them
into `worker.js` as JSON string literals. The worker then serves:

- `GET /` → a complete HTML document (CSS inlined in `<style>`, app JS inlined in
  `<script>`, avatars inlined as base64 `data:` URIs).
- `GET /api/tmdb/*` → cached TMDB proxy.
- `GET /api/stream` → JSON list of embed servers (merged with admin overrides).
- `POST /api/beacon` → anonymous telemetry (only with the KV binding).
- `GET /api/siteconfig` → admin-driven config: announcement, maintenance, servers.
- `GET /avatars/kyren|denji` → the two Telegram developer photos.

**Why one file?** Zero infrastructure to maintain, deployable by pasting into the
Cloudflare dashboard, and cheap enough for the free tier. The tradeoff (large single
file) is acceptable for a streaming SPA.

## Request flow

```
Browser ──► Cloudflare Worker ──► routes:
                 │
                 ├── "/"            → 200 HTML (SPA shell)
                 ├── "/api/tmdb/*"  → fetch TMDB, Cache-API cache (1 h), JSON
                 ├── "/api/stream"  → JSON embed-server list (no-store)
                 ├── "/api/beacon"  → POST telemetry → day:* blob (if bound)
                 ├── "/api/siteconfig" → config from KV (announcement etc.)
                 ├── "/avatars/*"   → base64 avatar (cacheable)
                 └── anything else  → 404 JSON
```

The frontend is a **hash router** — navigation happens in the browser, and the worker
is only contacted for the initial document, TMDB metadata and the server list.

## Frontend architecture (`src/app.js`)

Vanilla ES module app (`'use strict'`, no framework):

- **Router** — maps `location.hash` to a view function:

  | Route | View |
  |---|---|
  | `#/` | Home (hero + rows) |
  | `#/search` | Search page (filters + live results) |
  | `#/browse`, `#/browse/:type` | Browse movies/TV with sort chips |
  | `#/categories`, `#/categories/:type` | Genre categories with imagery |
  | `#/anime` | Anime section |
  | `#/movie/:id`, `#/tv/:id` | Detail page (hero, cast, seasons, similar) |
  | `#/watch/movie/:id` | Movie player |
  | `#/watch/tv/:id/:season/:episode` | TV player + episode navigator |
  | `#/watchlist`, `#/history`, `#/legal` | Personal & info pages |

- **Route transition** — a fixed frosted-glass veil blurs the outgoing page, the new
  page renders beneath, and the veil dissolves (Apple-style continuity).
- **Data layer** — `api(path)` calls `/api/tmdb${path}`; responses are cached in a
  module-level Map where useful. Watchlist/history/progress live in `localStorage`
  (keys `sg_watchlist`, `sg_history`, `sg_progress`).
- **Components** — card system (`backdropCard`, `cardArt`, shimmer placeholders),
  horizontal row scrollers (arrow-only, no wheel hijack), hero carousel with
  trailer-on-hover, search popup, episode overlay drawer, player chrome.

## Player & ad-defense engine

See [SECURITY.md](SECURITY.md) for the full threat model. Summary of layers:

1. **No `sandbox` attribute** — embeds run as on a normal page (many refuse
   sandboxed frames).
2. **`popup` event listener** — closes any popup that surfaces on our window while
   the player is on screen, unless the URL is allowlisted (`t.me`, `telegram.me`,
   `youtube.com`, `youtu.be`, `github.com`).
3. **`window.open` wrapper** — a second net for engines that skip the event.
4. **Periodic sweep** (400 ms) — re-closes remembered ad tabs whose `close()` was
   rejected at open time.
5. **Click shield** (`pl-shield`) — swallows every pointer interaction in capture
   phase until the user deliberately taps **"Enable player"** (a native, keyboard
   accessible `<button>`), so clickjacking ad-overlays never receive a click.

## Admin panel & shared KV

A separate **private** worker — `denjixstream-admin` (own repo) — administers this site
through a shared **KV** namespace (keys: `cfg`, `auth`, `day:YYYY-MM-DD` daily blobs):

```
public worker  /api/beacon ──write──►  day:* blobs  ◄──read──  admin /api/stats, /api/visitors, /api/logs
public worker  /api/siteconfig ◄─read─  cfg          ◄─write──  admin /api/config, /api/servers
public worker  /api/stream  ◄─read──  cfg.servers (overrides the built-in list)
```

The public side only writes events and reads config; every admin control is a write
from the admin worker. `EMBED_SERVERS` patterns (`{type}/{id}/{s}/{e}`) are the
shared contract between the two workers.

## Server engine (`src/worker-core.js`)

`EMBED_SERVERS` is an array of `{ name, flag, rec, url }` where `url` is a template
function `(type, id, season, episode) => embedUrl`. The engine builds per-title URLs
for movies and TV episodes and returns them from `/api/stream`. The starred
(`rec: true`) server is auto-selected in the player. See [API.md](API.md).

## Caching

- TMDB proxy responses are stored in the Cloudflare **Cache API** (≈1 h TTL),
  keyed by the TMDB path — quota-friendly and fast.
- HTML responses are served with `Cache-Control: public, max-age=60`.
- `/api/stream` is `no-store` so server-list changes propagate instantly.
