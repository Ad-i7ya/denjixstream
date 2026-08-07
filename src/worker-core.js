/* ============================================================
   DenjiXstream — Cloudflare Worker (streamex.sh-style)

   The site is a pure frontend. This worker only does two things
   invisibly behind the scenes:
     1. /api/tmdb/*  → proxies TheMovieDB (cached) for data
     2. /api/stream  → returns the list of embed servers
   Everything else is served as a static SPA. No open proxy,
   no media proxy, no direct-stream plumbing.

   DEPLOY: Cloudflare Dashboard → Workers & Pages → Create Worker
   → paste this entire file → Save & Deploy.

   OPTIONAL env vars (Dashboard → Settings → Variables and Secrets):
     TMDB_API_KEY   your own TheMovieDB API key (defaults to a public key)
     SITE_NAME      site name shown in the logo (default DenjiXstream)
   ============================================================ */

const DEFAULT_SITE_NAME = 'DenjiXstream';
const DEFAULT_TMDB_KEY  = '8265bd1679663a7ea12ac168da84d2e8'; // public tutorial key — replace with your own
const TMDB_BASE = 'https://api.themoviedb.org/3';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* ---------------- helpers ---------------- */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
  });
}
function cors(res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', '*');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
const cacheStore = () => (typeof caches !== 'undefined' ? caches.default : null);

async function cachedFetch(key, url, init = {}, ttlSeconds = 1800, ctx) {
  const c = cacheStore();
  if (c) {
    try {
      const hit = await c.match(new Request(key, { method: 'GET' }));
      if (hit) return hit;
    } catch (_) {}
  }
  const res = await fetch(url, init);
  if (res.ok) {
    try {
      const copy = res.clone();
      const h = new Headers(copy.headers);
      h.set('Cache-Control', `public, max-age=${ttlSeconds}`);
      const out = new Response(copy.body, { status: copy.status, headers: h });
      if (c && ctx && ctx.waitUntil) ctx.waitUntil(c.put(new Request(key, { method: 'GET' }), out));
    } catch (_) {}
  }
  return res;
}

/* ---------------- TMDB proxy (invisible engine) ---------------- */
async function tmdbHandler(request, url, env, ctx) {
  const rest = url.pathname.replace(/^\/api\/tmdb\//, '');
  if (!rest) return json({ error: 'bad path' }, 400);
  const key = env.TMDB_API_KEY || DEFAULT_TMDB_KEY;
  const apiUrl = new URL(`${TMDB_BASE}/${rest}`);
  url.searchParams.forEach((v, k) => { if (!apiUrl.searchParams.has(k)) apiUrl.searchParams.set(k, v); });
  apiUrl.searchParams.set('api_key', key);
  const res = await cachedFetch(`tmdb:${apiUrl.toString()}`, apiUrl.toString(), {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  }, 1800, ctx);
  return cors(res);
}

/* ---------------- Stream resolution (verified-working embed servers) ----------------
   vidplays.fun (VidPlay), cinemaos.tech, peachify, screenscape, modocine & vixsrc
   died since the streamex list was extracted — every server below was HTTP-tested
   today for both movies AND TV. XPass leads (fast, reliable, no popups). */
const EMBED_SERVERS = [
  /* autoplay=1 on every URL (VidGod already had autoplay=true): the embed's own
     poster/thumbnail frame is skipped and the video starts directly — no stale
     thumbnail, and users never have to click an ad-layered play button. */
  { name: 'XPass', flag: '★', rec: true, url: (t, i, s, e) => `https://play.xpass.top/e/${t}/${i}${s ? `/${s}/${e}` : ''}?autoplay=1` },
  { name: 'VidGod', url: (t, i, s, e) => `https://vidgod.site/${t}/${i}${s ? `/${s}/${e}` : ''}?autoplay=true` },
  { name: 'VidCore', url: (t, i, s, e) => `https://vidcore.net/${t}/${i}${s ? `/${s}/${e}` : ''}?autoplay=1` },
  { name: 'VSrc', url: (t, i, s, e) => `https://vsembed.ru/embed/${t}/${i}${s ? `/${s}/${e}` : ''}?autoplay=1` },
  { name: 'AirFlix', url: (t, i, s, e) => `https://airflix1.com/embed/${t}/${i}${s ? `/${s}/${e}` : ''}?autoplay=1` },
  { name: '2Embed', url: (t, i, s, e) => `https://www.2embed.cc/embed/${t}/${i}${s ? `/${s}/${e}` : ''}` },
  { name: 'VidZen', url: (t, i, s, e) => `https://vidzen.fun/${t}/${i}${s ? `/${s}/${e}` : ''}?autoplay=1` },
  { name: 'VideoEasy', url: (t, i, s, e) => `https://player.videasy.net/${t}/${i}${s ? `/${s}/${e}` : ''}?autoplay=1` },
  { name: 'ZXC Stream', url: (t, i, s, e) => `https://www.zxcstream.xyz/player/${t}/${i}${s ? `/${s}/${e}` : ''}?autoplay=1` },
];

function resolveServers(type, id, season, episode) {
  return EMBED_SERVERS.map(s => ({ name: s.name, type: 'embed', rec: !!s.rec, url: s.url(type, id, season, episode) }));
}

async function streamHandler(request, url, env, ctx) {
  const type = url.searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const id = url.searchParams.get('id') || '';
  const season = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');
  if (!/^\d+$/.test(id)) return json({ error: 'bad id' }, 400);
  const cacheKey = `stream:${type}:${id}:${season || ''}:${episode || ''}`;
  const c = cacheStore();
  if (c) {
    try {
      const hit = await c.match(new Request(cacheKey, { method: 'GET' }));
      if (hit) return cors(hit);
    } catch (_) {}
  }
  const servers = resolveServers(type, Number(id), season ? Number(season) : null, episode ? Number(episode) : null);
  const body = { type, id: Number(id), season: season ? Number(season) : null, episode: episode ? Number(episode) : null, servers, resolvedAt: Date.now() };
  if (c && ctx) {
    try { ctx.waitUntil(c.put(new Request(cacheKey, { method: 'GET' }), new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } }))); } catch (_) {}
  }
  return json(body);
}

/* ---------------- App (SPA) ---------------- */
const FAVICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4db0ff"/><stop offset=".5" stop-color="#0a84ff"/><stop offset="1" stop-color="#5e5ce6"/></linearGradient><linearGradient id="fhi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="fglo" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="#8cc8ff" stop-opacity=".5"/><stop offset="1" stop-color="#0a84ff" stop-opacity="0"/></radialGradient></defs><rect x="3" y="3" width="58" height="58" rx="17" fill="#0e0e14"/><rect x="3" y="3" width="58" height="58" rx="17" fill="url(#fglo)"/><rect x="3" y="3" width="58" height="58" rx="17" fill="url(#fg)"/><rect x="3" y="3" width="58" height="58" rx="17" stroke="rgba(255,255,255,.4)" stroke-width="1.6"/><path d="M7.5 20.5C7.5 13.6 13.1 8 20 8h24c6.9 0 12.5 5.6 12.5 12.5v5.5H7.5v-5.5Z" fill="url(#fhi)"/><circle cx="32" cy="35" r="14.5" fill="rgba(255,255,255,.15)"/><path d="M27.2 25.8v18.4l15.6-9.2-15.6-9.2Z" fill="#fff"/></svg>';

/* Inlined at build time by build.js (do not edit placeholders) */
const STYLES = '/*__STYLES__*/';
const APP_JS  = '/*__APP_JS__*/';
/* Build stamp → cache key changes every build, so stale HTML is never served */
const BUILD_STAMP = '/*__BUILD__*/';

async function serveApp(request, env, siteName, ctx) {
  // Built with concatenation (not a template literal) so inlined CSS/JS
  // containing backticks or ${...} can never break the worker.
  const c = cacheStore();
  const cacheKey = 'app:' + siteName + ':' + BUILD_STAMP;
  if (c && request.method === 'GET') {
    try {
      const hit = await c.match(new Request(cacheKey, { method: 'GET' }));
      if (hit) return hit;
    } catch (_) {}
  }
  const html =
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no">\n' +
    '<title>' + siteName + ' - Discover and Watch Movies &amp; TV Shows</title>\n' +
    '<meta name="description" content="Discover and stream your favorite movies and TV shows in high quality. Free streaming site.">\n' +
    '<meta name="theme-color" content="#121212">\n' +
    '<meta property="og:site_name" content="' + siteName + '">\n' +
    '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent(FAVICON) + '">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n' +
    '<style>\n' + STYLES + '\n</style>\n' +
    '</head>\n<body>\n' +
    '<script>window.SITE_NAME = ' + JSON.stringify(siteName) + ';</script>\n' +
    '<script>\n' + APP_JS + '\n</script>\n' +
    '</body>\n</html>';
  const res = new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
  if (c && ctx && request.method === 'GET') {
    try { ctx.waitUntil(c.put(new Request(cacheKey, { method: 'GET' }), res.clone())); } catch (_) {}
  }
  return res;
}

/* ---------------- Entry ---------------- */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const siteName = env.SITE_NAME || DEFAULT_SITE_NAME;

    if (request.method === 'OPTIONS') {
      return new Response('OK', { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
    }
    if (path === '/favicon.ico') {
      return new Response(FAVICON, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
    }
    if (path.startsWith('/api/tmdb/')) return tmdbHandler(request, url, env, ctx);
    if (path === '/api/stream') return streamHandler(request, url, env, ctx);
    if (path.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return serveApp(request, env, siteName, ctx);
  },
};
