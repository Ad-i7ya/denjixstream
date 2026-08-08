# Changelog

All notable changes to **KnightXstream** are documented here. The project uses
[Calendar Versioning](https://calver.org)-style releases (`YYYY.MM`) for simplicity,
with patch numbers for hotfixes.

## [1.0.0] — 2026-08

### Added
- **Apple Liquid Glass design system** (`src/styles.css`): layered blur + saturation,
  specular highlights, spring physics, deep near-black theme.
- **Single-file Cloudflare Worker architecture**: `build.js` inlines
  `src/app.js` + `src/styles.css` + `src/worker-core.js` into one deployable
  `worker.js` (~268 KB) — no server, no database, zero infra cost.
- **Home page**: hero slideshow (crossfade, dots/arrows, pause-on-hover),
  trailer-on-hover previews, Continue Watching, trending / popular / top-rated /
  now-playing / upcoming rows with arrow-only horizontal scrolling.
- **Browse, Categories & Anime sections**: genre tiles with imagery, Movies/TV tabs,
  sort chips, anime category rows.
- **Search**: dedicated search page with preview content, plus a **Ctrl+K** glass
  quick-search popup with a visible `Ctrl K` / `⌘K` chip in the search bar.
- **Detail pages**: hero backdrop with background trailer, cast, similar titles,
  seasons with horizontally scrollable episode rows (episode numbers shown).
- **Watch page**: multi-server embed player, episode navigator overlay, fullscreen,
  animated loading ring, graceful error card (no silent black screens).
- **Watchlist & History** (localStorage), route transitions (frosted veil), floating
  logo with scroll-aware visibility, developer footer with Telegram profile photos.
- **Ad-proofing (sandbox-free)**:
  - No `sandbox` attribute on the player iframe — 100% embed compatibility.
  - 3-layer popup auto-close: `popup` event listener + `window.open` wrapper +
    periodic sweep; `t.me` / YouTube / GitHub allowlist.
  - Click shield that swallows every stray interaction until the user deliberately
    taps **"Enable player"** (keyboard accessible).
  - **6 audited ad-free servers** (ZXC Stream ★, VidLink, VidGod, VideoEasy,
    VidCore, VidLinkMe).

### Removed
- Popup-cloaking embed servers (`vidsrc.me`, `airflix`) and smartlink-popunder
  servers (`XPass`, `2Embed`, `VidZen`) — their ad tabs are unblockable from a
  sandbox-free page (browser security boundary), verified by audit.
- All public proxy routes — the worker only exposes `/api/tmdb/*` and `/api/stream`.

### Fixed (selected, over the development cycle)
- Sandbox errors on several embed servers → sandbox attribute removed entirely.
- Ad redirects on click → click shield + server curation.
- Oversized thumbnails/hero frames → image-size pipeline + fixed-aspect crops.
- Mouse-wheel row hijacking → arrow-only horizontal scrolling.
- Phone layout issues → orientation-tuned bottom nav, drawer, and hero sizing.
- Search autofill turning white → autofill overrides.
- Blank page / page-not-found routes → router coverage for all routes.
- Stray page-wide horizontal overflow → everything constrained to viewport size.

## [0.1.0] — 2026-07

- Initial streamex.sh-style prototype: liquid-glass UI, TMDB metadata proxy,
  multi-server embed player, hash router.
