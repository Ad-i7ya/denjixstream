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
     thumbnail, and users never have to click an ad-layered play button.
     ★ = default recommended server. Verified popup-free embeds come first:
     their pages and JS bundles carry NO window.open / popunder / _blank ad
     triggers (audited 2026-08). vidsrc.me/airflix-style hidden-iframe popup
     cloaking servers AND the XPass/2Embed/VidZen smartlink-popunder servers
     were removed — their ad tabs cannot be blocked without sandboxing, which
     the embeds themselves refuse. */
  { name: 'ZXC Stream', flag: '★', rec: true, url: (t, i, s, e) => `https://www.zxcstream.xyz/player/${t}/${i}${s ? `/${s}/${e}` : ''}?autoplay=1` },
  { name: 'VidLink', url: (t, i, s, e) => `https://vidlink.pro/${t}/${i}${s ? `/${s}/${e}` : ''}` },
  { name: 'VidGod', url: (t, i, s, e) => `https://vidgod.site/${t}/${i}${s ? `/${s}/${e}` : ''}?autoplay=true` },
  { name: 'VideoEasy', url: (t, i, s, e) => `https://player.videasy.net/${t}/${i}${s ? `/${s}/${e}` : ''}?autoplay=1` },
  { name: 'VidCore', url: (t, i, s, e) => `https://vidcore.net/${t}/${i}${s ? `/${s}/${e}` : ''}?autoplay=1` },
  { name: 'VidLinkMe', url: (t, i, s, e) => `https://vidlink.me/${t}/${i}${s ? `/${s}/${e}` : ''}` },
  /* XPass, 2Embed and VidZen were removed after a fresh audit — their pages
     ship window.open / _blank ad triggers (VidZen literally opens a SMARTLINK
     popunder). The six above are clean in their HTML AND JS bundles. */
];

function resolveServers(type, id, season, episode) {
  /* sbx flag mirrors streamex.sh: only a few embeds need the sandbox attribute
     (most players refuse to boot under sandbox and show a 'sandbox' error) */
  return EMBED_SERVERS.map(s => ({ name: s.name, type: 'embed', rec: !!s.rec, sbx: !!s.sbx, url: s.url(type, id, season, episode) }));
}

async function streamHandler(request, url, env, ctx) {
  const type = url.searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const id = url.searchParams.get('id') || '';
  const season = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');
  if (!/^\d+$/.test(id)) return json({ error: 'bad id' }, 400);
  const cacheKey = `stream:v2:${type}:${id}:${season || ''}:${episode || ''}`;
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
/* favicon mirrors the Aurora X mark, brightened for tiny sizes */
const FAVICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ac8fa"/><stop offset=".5" stop-color="#0a84ff"/><stop offset="1" stop-color="#bf5af2"/></linearGradient><linearGradient id="fhi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="fglo" cx=".32" cy=".26" r="1.05"><stop offset="0" stop-color="#5ac8fa" stop-opacity=".6"/><stop offset=".5" stop-color="#0a84ff" stop-opacity=".25"/><stop offset="1" stop-color="#bf5af2" stop-opacity="0"/></radialGradient></defs><rect x="3" y="3" width="58" height="58" rx="16.5" fill="#101019"/><rect x="3" y="3" width="58" height="58" rx="16.5" fill="url(#fglo)"/><rect x="3" y="3" width="58" height="58" rx="16.5" stroke="rgba(255,255,255,.4)" stroke-width="1.5"/><path d="M9.5 16.5C9.5 11.9 13.4 8 18 8h28c4.6 0 8.5 3.9 8.5 8.5v5H9.5v-5Z" fill="url(#fhi)"/><path d="M21.5 20.5L42.5 43.5M42.5 20.5L21.5 43.5" stroke="url(#fg)" stroke-width="9.5" stroke-linecap="round"/><path d="M28.8 26.6V37.4L36.8 32Z" fill="#fff" stroke="#fff" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="31" cy="14" r="2.1" fill="#5ac8fa" opacity=".95"/></svg>';

/* Inlined at build time by build.js (do not edit placeholders) */
const STYLES = '/*__STYLES__*/';
const APP_JS  = '/*__APP_JS__*/';
/* Build stamp → cache key changes every build, so stale HTML is never served */
const BUILD_STAMP = '/*__BUILD__*/';

/* Developer Telegram profile photos — base64 JPEGs inlined at build time by
   build.js from assets/ (do not edit the placeholder lines) */
const AVATAR_KYREN = '/*__AVATAR_KYREN__*/';
const AVATAR_DENJI = '/*__AVATAR_DENJI__*/';
const b64ToBytes = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

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
    '<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n' +
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
    /* developer Telegram profile photos (embedded at build time) */
    if (path === '/avatars/kyren.jpg' || path === '/avatars/kyren')
      return new Response(b64ToBytes(AVATAR_KYREN), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
    if (path === '/avatars/denji.jpg' || path === '/avatars/denji')
      return new Response(b64ToBytes(AVATAR_DENJI), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
    if (path.startsWith('/api/tmdb/')) return tmdbHandler(request, url, env, ctx);
    if (path === '/api/stream') return streamHandler(request, url, env, ctx);
    if (path.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return serveApp(request, env, siteName, ctx);
  },
};
