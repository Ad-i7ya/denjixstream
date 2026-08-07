/* ============================================================
   CineGlass — Cloudflare Worker
   Single-file streaming site (streamex.sh-style).

   DEPLOY: Cloudflare Dashboard → Workers & Pages → Create Worker
   → paste this entire file → Save & Deploy.

   OPTIONAL env vars (Dashboard → Settings → Variables and Secrets):
     TMDB_API_KEY   your own TheMovieDB API key (defaults to a public key)
     SITE_NAME      site name shown in the logo (default CineGlass)

   All video sources are resolved server-side. "Direct" sources are
   plain m3u8 streams played in our own ad-free player (via hls.js).
   "Embed" sources are iframe fallbacks from third-party players.
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

/* ---------------- TMDB proxy ---------------- */
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

/* ---------------- Stream resolution ---------------- */
const EMBED_SERVERS = [
  { name: 'VidSrc',        url: (t, i, s, e) => `https://vidsrc.to/embed/${t}/${i}${s ? `?season=${s}&episode=${e}` : ''}` },
  { name: '2Embed',        url: (t, i, s, e) => `https://www.2embed.cc/embed/${t}/${i}${s ? `?s=${s}&e=${e}` : ''}` },
];

const DIRECT_APIS = [
  { name: 'VidBinge', url: (t, i, s, e) => `https://vidbinge.dev/api/tmdb/${t}/${i}${s ? `/${s}/${e}` : ''}`, pick: (j) => j?.streams?.[0]?.url || j?.url || j?.sources?.[0]?.file || null },
  { name: 'MoviesAPI', url: (t, i, s, e) => `https://moviesapi.club/tmdb/${t}/${i}${s ? `/${s}/${e}` : ''}`, pick: (j) => j?.sources?.[0]?.file || j?.stream?.url || null },
];

/* page-scan direct resolvers: fetch the page, regex for a direct m3u8 */
const PAGE_SCAN_RESOLVERS = [
  { name: 'Embed.su', url: (t, i, s, e) => `https://embed.su/embed/${t}/${i}${s ? `?s=${s}&e=${e}` : ''}` },
  { name: 'VidSrc Direct', url: (t, i, s, e) => `https://vidsrc.to/embed/${t}/${i}${s ? `?season=${s}&episode=${e}` : ''}` },
];

function proxyUrl(u) { return `/proxy?url=${encodeURIComponent(u)}`; }

async function fetchText(url, extra = {}) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: new URL(url).origin + '/', Accept: '*/*', ...extra } });
    if (!res.ok) return null;
    return await res.text();
  } catch (_) { return null; }
}

/* 2embed chain → cineby-style player → scan for direct m3u8 */
async function directVia2embed(type, id, season, episode) {
  try {
    const embedUrl = `https://www.2embed.cc/embed/${type}/${id}${season ? `?s=${season}&e=${episode}` : ''}`;
    const html = await fetchText(embedUrl);
    if (!html) return null;
    // iframesrc data-src → https://streamsrcs.2embed.cc/vnest?tmdb=ID
    let vnest = (html.match(/data-src="([^"]+vnest[^"]*)"/) || [])[1] || (html.match(/(https:\/\/streamsrcs\.2embed\.cc\/[^"']+)/) || [])[1];
    if (!vnest) return null;
    vnest = new URL(vnest, embedUrl).toString();
    const vh = await fetchText(vnest);
    if (!vh) return null;
    // vnest.js sets framesrc → "https://<base>/movie/<id>?autostart=true"
    const vjs = (vh.match(/src="([^"]*vnest\.js[^"]*)"/) || [])[1];
    const framesrc = (vh.match(/id="framesrc"[^>]*src="([^"]*)"/) || [])[1];
    if (!vjs) return null;
    const vjsText = await fetchText(new URL(vjs, vnest).toString());
    if (!vjsText) return null;
    const base = (vjsText.match(/(https:\/\/[a-z0-9.-]+\/[a-z]+\/)/i) || [])[1];
    if (!base || !framesrc) return null;
    const playerUrl = `${base}${framesrc}?autostart=true`;
    const m3u8 = await findM3u8InPage(playerUrl);
    return m3u8;
  } catch (_) { return null; }
}

async function findM3u8InPage(url) {
  const html = await fetchText(url);
  if (!html) return null;
  const re = /(https?:\\?\/\\?\/[^"'\\\s]+?\.m3u8[^"'\\\s]*)/i;
  const m = html.match(re);
  if (m) return m[1].replace(/\\\//g, '/');
  const j = html.match(/"hls"\s*:\s*"([^"]+)"/i) || html.match(/"url"\s*:\s*"([^"]+\.m3u8[^"]*)"/i);
  if (j) return j[1];
  // some players embed config as JSON in a script tag
  const cfg = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (cfg) { const m2 = cfg[1].match(/(https?:\\?\/\\?\/[^"'\\\s]+?\.m3u8[^"'\\\s]*)/i); if (m2) return m2[1].replace(/\\\//g, '/'); }
  return null;
}

async function resolveServers(type, id, season, episode) {
  const servers = [];
  const tv = Boolean(season);

  // --- direct (ad-free) attempts ---
  for (const api of DIRECT_APIS) {
    try {
      const u = api.url(type, id, season, episode);
      const t = await fetchText(u, { Accept: 'application/json' });
      if (t && /^\s*[\[{]/.test(t)) {
        const j = JSON.parse(t);
        const url = api.pick(j);
        if (url) {
          servers.push({ name: api.name, type: 'direct', url, hls: /\.m3u8/i.test(url), proxyUrl: proxyUrl(url) });
          break;
        }
      }
    } catch (_) {}
  }
  if (!servers.length) {
    for (const r of PAGE_SCAN_RESOLVERS) {
      const m3u8 = await findM3u8InPage(r.url(type, id, season, episode));
      if (m3u8) { servers.push({ name: r.name, type: 'direct', url: m3u8, hls: true, proxyUrl: proxyUrl(m3u8) }); break; }
    }
  }
  if (!servers.length) {
    const m3u8 = await directVia2embed(type, id, season, episode);
    if (m3u8) servers.push({ name: '2Embed Direct', type: 'direct', url: m3u8, hls: true, proxyUrl: proxyUrl(m3u8) });
  }

  // --- iframe fallbacks ---
  for (const s of EMBED_SERVERS) {
    servers.push({ name: s.name, type: 'embed', url: s.url(type, id, season, episode) });
  }
  return servers;
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
  const servers = await resolveServers(type, Number(id), season ? Number(season) : null, episode ? Number(episode) : null);
  const body = { type, id: Number(id), season: season ? Number(season) : null, episode: episode ? Number(episode) : null, servers, resolvedAt: Date.now() };
  const res = json(body);
  if (c && ctx) {
    try { ctx.waitUntil(c.put(new Request(cacheKey, { method: 'GET' }), new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } }))); } catch (_) {}
  }
  return res;
}

/* ---------------- Media proxy (m3u8 rewriting + CORS) ---------------- */
function rewriteManifest(text, baseUrl) {
  return text.split('\n').map((line) => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith('#')) {
      // Rewrite URI= references inside playlist tags (KEY, MAP, SESSION-KEY...)
      if (/URI="/.test(t)) {
        return t.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxyUrl(new URL(u, baseUrl).toString())}"`);
      }
      return line;
    }
    try { return proxyUrl(new URL(t, baseUrl).toString()); } catch (_) { return line; }
  }).join('\n');
}

/* SSRF guard: block obviously-private / loopback targets. Hostnames resolving
   to private IPs can't be checked cheaply here, so a PROXY_HOSTS env allowlist
   (comma-separated) can be set to restrict proxying to known stream CDNs. */
function isBlockedHost(u) {
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host === 'metadata.google.internal') return true;
  const ip = host.replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const p = ip.split('.').map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
  }
  if (ip === '::1' || ip === '::' || /^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip)) return true;
  return false;
}

async function proxyHandler(request, url, env, ctx) {
  const target = url.searchParams.get('url');
  if (!target) return json({ error: 'missing url' }, 400);
  let u;
  try { u = new URL(target); } catch (_) { return json({ error: 'bad url' }, 400); }
  if (!/^https?:$/.test(u.protocol)) return json({ error: 'bad protocol' }, 400);
  if (isBlockedHost(u)) return json({ error: 'blocked host' }, 403);
  const allowlist = (env.PROXY_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allowlist.length && !allowlist.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) {
    return json({ error: 'host not allowed' }, 403);
  }

  const headers = { 'User-Agent': UA };
  // Referer is often required by CDNs to authorize stream segments
  headers.Referer = u.origin + '/';
  const range = request.headers.get('Range');
  if (range) headers.Range = range;

  const cacheKey = `proxy:${u.toString()}`;
  const isManifest = /\.m3u8(\?|$)/i.test(u.pathname);
  const c = cacheStore();
  if (!range && c && !isManifest) {
    try {
      const hit = await c.match(new Request(cacheKey, { method: 'GET' }));
      if (hit) return cors(hit);
    } catch (_) {}
  }

  let res;
  try { res = await fetch(u.toString(), { headers }); } catch (_) { return json({ error: 'upstream failed' }, 502); }
  if (!res.ok && !range) return cors(res);

  if (isManifest && res.ok) {
    const text = await res.text();
    const rewritten = rewriteManifest(text, u.toString());
    const out = new Response(rewritten, { status: 200, headers: {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': '*',
      'Cache-Control': 'no-cache',
    }});
    return out;
  }

  const outHeaders = new Headers(res.headers);
  outHeaders.set('Access-Control-Allow-Origin', '*');
  outHeaders.set('Access-Control-Expose-Headers', '*');
  if (range) outHeaders.set('Access-Control-Allow-Headers', 'Range');

  const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
  if (!range && c && ctx && res.ok) {
    try { ctx.waitUntil(c.put(new Request(cacheKey, { method: 'GET' }), out.clone())); } catch (_) {}
  }
  return out;
}

/* ---------------- App (SPA) ---------------- */
const FAVICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="#121212"/><path d="M14 18a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V18Z" fill="none" stroke="url(#g)" stroke-width="3"/><path d="M26 24v16l12-8-12-8Z" fill="url(#g)"/></svg>';

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
    '<meta name="description" content="Discover and stream your favorite movies and TV shows in high quality. Free, no ads on direct sources.">\n' +
    '<meta name="theme-color" content="#121212">\n' +
    '<meta property="og:site_name" content="' + siteName + '">\n' +
    '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent(FAVICON) + '">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n' +
    '<style>\n' + STYLES + '\n</style>\n' +
    '</head>\n<body>\n' +
    '<script>window.SITE_NAME = ' + JSON.stringify(siteName) + ';</script>\n' +
    '<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>\n' +
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
    if (path.startsWith('/proxy')) return proxyHandler(request, url, env, ctx);
    if (path.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return serveApp(request, env, siteName, ctx);
  },
};
