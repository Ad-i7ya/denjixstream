# Internal API

The worker exposes exactly three route families. There is **no public proxy** — these
are engine routes used by the frontend only.

## `GET /api/tmdb/*` — TMDB metadata proxy

Proxies any TheMovieDB v3 path, cached in the Cloudflare Cache API (~1 h TTL).

```
GET /api/tmdb/movie/27205?language=en-US&append_to_response=external_ids,videos
GET /api/tmdb/trending/movie/day?language=en-US
GET /api/tmdb/search/multi?query=inception&language=en-US&include_adult=false
GET /api/tmdb/genre/movie/list?language=en-US
```

**Response:** the TMDB JSON payload (with `Access-Control-Allow-Origin: *`).
**Errors:** `404` JSON when the path is unknown or TMDB returns an error.

## `GET /api/stream` — embed server list

Returns the audited embed servers for the requested title.

```
GET /api/stream?type=movie&id=27205
GET /api/stream?type=tv&id=1399&season=1&episode=1
```

**Response:**

```json
{
  "type": "tv",
  "id": 1399,
  "servers": [
    { "name": "ZXC Stream", "rec": true,  "url": "https://www.zxcstream.xyz/player/tv/1399/1/1?autoplay=1" },
    { "name": "VidLink",     "rec": false, "url": "https://vidlink.pro/tv/1399/1/1" }
  ]
}
```

- `rec: true` marks the default (★) server — the player auto-selects it.
- The `url` is fully built server-side from the `EMBED_SERVERS` templates.
- Served with `Cache-Control: no-store` so list changes propagate instantly.

## `GET /avatars/:name` — developer photos

`/avatars/kyren` and `/avatars/denji` serve the two Telegram developer profile photos
(base64-inlined at build time) used in the footer credit chips.

## Adding / editing a server

Servers live in `src/worker-core.js` → `EMBED_SERVERS`:

```js
{ name: 'MyServer', url: (type, id, season, episode) =>
    `https://example.com/embed/${type}/${id}${season ? `/${season}/${episode}` : ''}?autoplay=1` }
```

Rules:

1. **Pass the ad audit** — see [SECURITY.md](SECURITY.md) (HTML + JS bundle scan).
   Popup-cloaking and smartlink servers are rejected.
2. **Support both shapes** — movie (`type/id`) and TV (`type/id/season/episode`).
3. **Keep `autoplay=1`** where the provider supports it — it skips the embed's own
   poster frame (and its ad-layered play button).
4. Mark the best default with `rec: true` (only one, please).
5. Rebuild + redeploy: `node build.js && node deploy.mjs`.
