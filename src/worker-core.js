/* ============================================================
   KnightXstream — Cloudflare Worker (streamex.sh-style)

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
     SITE_NAME      site name shown in the logo (default KnightXstream)
   ============================================================ */

const DEFAULT_SITE_NAME = 'KnightXstream';
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

/* Build a concrete embed URL from an admin-managed pattern.
   Patterns may or may not carry {s}/{e} tokens:
     https://host/player/{type}/{id}/{s}/{e}?autoplay=1   (TV-ready)
     https://host/{type}/{id}?autoplay=1                   (movie-only legacy)
   For movies any {s}/{e} tokens (and their slashes) are stripped; for TV a
   legacy pattern without tokens gets /{season}/{episode} appended so every
   title resolves correctly regardless of how the pattern was saved. */
function buildFromPattern(pattern, type, id, season, episode) {
  let u = String(pattern || '');
  const qIdx = u.indexOf('?');
  const q = qIdx >= 0 ? u.slice(qIdx) : '';
  let base = qIdx >= 0 ? u.slice(0, qIdx) : u;
  base = base.replace(/\{type\}/g, type).replace(/\{id\}/g, id);
  if (season != null && episode != null) {
    if (base.includes('{s}') || base.includes('{e}')) {
      base = base.replace(/\{s\}/g, season).replace(/\{e\}/g, episode);
    } else {
      base = base.replace(/\/?$/, '') + '/' + season + '/' + episode;
    }
  } else {
    base = base.replace(/\/?\{s\}\/?/g, '').replace(/\/?\{e\}\/?/g, '').replace(/\/+$/, '');
  }
  return base + q;
}

async function streamHandler(request, url, env, ctx) {
  const type = url.searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const id = url.searchParams.get('id') || '';
  const season = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');
  if (!/^\d+$/.test(id)) return json({ error: 'bad id' }, 400);
  /* always read a FRESH config here (not the 30s isolate cache) so a server
     list saved from the admin panel is reflected immediately */
  const cfg = await siteConfig(env, true);
  const cfgRev = cfg.servers ? cfg.serversRev : 'd';
  const cacheKey = `stream:v3:${type}:${id}:${season || ''}:${episode || ''}:${cfgRev}`;
  const c = cacheStore();
  if (c) {
    try {
      const hit = await c.match(new Request(cacheKey, { method: 'GET' }));
      if (hit) return cors(hit);
    } catch (_) {}
  }
  const servers = cfg.servers && cfg.servers.length
    ? cfg.servers.filter(s => s.enabled !== false).map(s => ({ name: s.name, type: 'embed', rec: !!s.rec, url: buildFromPattern(s.pattern, type, Number(id), season ? Number(season) : null, episode ? Number(episode) : null) }))
    : resolveServers(type, Number(id), season ? Number(season) : null, episode ? Number(episode) : null);
  const body = { type, id: Number(id), season: season ? Number(season) : null, episode: episode ? Number(episode) : null, servers, resolvedAt: Date.now() };
  if (c && ctx) {
    try { ctx.waitUntil(c.put(new Request(cacheKey, { method: 'GET' }), new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } }))); } catch (_) {}
  }
  return json(body);
}

/* ---------------- KV analytics + admin-driven site config ----------------
   Shared with the private admin panel worker (knightxstream-admin) via a KV
   namespace. The main site only ever WRITES day-blob events and READS the
   cfg key — admin panel controls (announcement, maintenance, server list)
   are applied here. KV free tier is ~1k writes/day, so every visitor event
   is ONE read-modify-write on its daily blob (bots are skipped; stats can be
   disabled from the panel). Concurrency may occasionally drop an event. */
const UA_PARTS = (ua) => {
  const s = String(ua || '');
  const os = /Android/.test(s) ? 'Android' : /iPhone|iPod/.test(s) ? 'iOS' : /iPad/.test(s) ? 'iPadOS' : /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /CrOS/.test(s) ? 'ChromeOS' : /Linux/.test(s) ? 'Linux' : 'Other';
  const browser = /EdgA?\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /FxiOS\//.test(s) || /Firefox\//.test(s) ? 'Firefox' : /CriOS\//.test(s) ? 'Chrome' : /SamsungBrowser\//.test(s) ? 'Samsung Internet' : /YaBrowser\//.test(s) ? 'Yandex' : /UCBrowser\//.test(s) ? 'UC Browser' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Other';
  const mVer = (re) => { const m = s.match(re); return m ? m[1].split('.')[0] : ''; };
  const ver = mVer(/(?:Edg|OPR|Firefox|Chrome|Safari|CriOS|FxiOS|SamsungBrowser|YaBrowser)\/([\d.]+)/) || '';
  const device = /iPad/.test(s) ? 'Tablet' : /iPhone/.test(s) ? 'Phone' : /Android/.test(s) ? (/Mobile/.test(s) ? 'Phone' : 'Tablet') : /Touch/.test(s) ? 'Tablet' : 'Desktop';
  /* exact device model from the UA — e.g. SM-G991B, iPhone15,2, Pixel 7a, Redmi Note 12 */
  const model = (() => {
    const re = /SM-[A-Za-z0-9]+|Pixel\s?[0-9][a-zA-Z]*|iPhone[0-9]+,[0-9]+|iPad[0-9]+,[0-9]+|Galaxy [A-Za-z0-9 ]{1,20}|OnePlus [A-Za-z0-9 ]{1,15}|Xiaomi [A-Za-z0-9 ]{1,15}|Redmi [A-Za-z0-9 ]{1,15}|POCO [A-Za-z0-9 ]{1,15}|HUAWEI [A-Za-z0-9-]{1,15}|Nexus [0-9]/;
    const m = s.match(re); return m ? m[0] : '';
  })();
  return { os, browser, device, ver, model };
};
const kvGet = async (kv, key, fallback) => { try { const v = await kv.get(key, 'json'); return v === null ? fallback : v; } catch (_) { return fallback; } };
/* only allow safe link schemes for admin-driven links (blocks javascript:/data:) */
const safeLink = (raw) => {
  const s = String(raw || '').trim().slice(0, 300);
  return /^(https?:\/\/|mailto:|tel:|\/)/i.test(s) ? s : null;
};
const kvPut = async (kv, key, val, ttlSeconds) => { try { await kv.put(key, JSON.stringify(val), ttlSeconds ? { expirationTtl: ttlSeconds } : undefined); } catch (_) {} };
const DAY_TTL = 365 * 86400;
/* cfg is read on every beacon/siteconfig — cache per isolate for 30s */
let cfgCache = { t: 0, v: null };
async function siteConfig(env, fresh = false) {
  const out = { announcement: null, maintenance: false, statsEnabled: true, servers: null, serversRev: '0', tagline: null, devs: null, heroTrailer: true, anime: true, siteName: null, hero: true, contactBtn: true, watchlist: true, history: true, legalText: null, rows: null, search: true, categories: true, movies: true, tv: true, report: true, epAutoOpen: true, epAutoplay: false, popupSweep: true, accent: null, aurora: true, glass: 'full', compact: false, effects: 'full', metaDesc: null, keywords: null, customCss: null, customJs: null, defaultRoute: 'home' };
  const kv = env.KNIGHTX_KV;
  if (!kv) return out;
  if (!fresh && cfgCache.v && Date.now() - cfgCache.t < 30000) return cfgCache.v;
  const m = await kvGet(kv, 'cfg', {});
  out.announcement = (m.announcement && m.announcement.text)
    ? { text: String(m.announcement.text).slice(0, 240), enabled: !!m.announcement.enabled, kind: ['info', 'success', 'warning'].includes(m.announcement.kind) ? m.announcement.kind : 'info', link: safeLink(m.announcement.link), dur: Math.min(Math.max(Number(m.announcement.dur) || 0, 0), 9999), durUnit: ['m', 'h', 'd'].includes(m.announcement.durUnit) ? m.announcement.durUnit : 'h' }
    : null;
  out.maintenance = m.maintenance === true;
  out.statsEnabled = m.statsEnabled !== false;
  if (Array.isArray(m.servers) && m.servers.length) out.servers = m.servers;
  out.serversRev = String(m.servers_ts || '0');
  out.tagline = String(m.tagline || '').slice(0, 80) || null;
  out.heroTrailer = m.heroTrailer !== false;
  out.anime = m.anime !== false;
  out.siteName = String(m.siteName || '').trim().slice(0, 40) || null;
  out.hero = m.hero !== false;
  out.contactBtn = m.contactBtn !== false;
  out.watchlist = m.watchlist !== false;
  out.history = m.history !== false;
  out.legalText = String(m.legalText || '').slice(0, 300) || null;
  if (Array.isArray(m.devs)) out.devs = m.devs.slice(0, 6).map(d => ({ name: String(d.name || '').slice(0, 40), handle: String(d.handle || '').replace(/^@/, '').slice(0, 40) })).filter(d => d.name && d.handle);
  /* — full site control surface — */
  const R = ['rowContinue', 'rowTrending', 'rowTrendingTv', 'rowPopular', 'rowTopRated', 'rowNowPlaying', 'rowUpcoming', 'rowGenres', 'rowGross', 'rowAiring'];
  out.rows = {};
  for (const k of R) out.rows[k] = m.rows ? m.rows[k] !== false : true;
  out.search = m.search !== false;
  out.categories = m.categories !== false;
  out.movies = m.movies !== false;
  out.tv = m.tv !== false;
  out.report = m.report !== false;
  out.epAutoOpen = m.epAutoOpen !== false;
  out.epAutoplay = m.epAutoplay === true;
  out.popupSweep = m.popupSweep !== false;
  out.accent = /^#[0-9a-fA-F]{6}$/.test(String(m.accent || '')) ? String(m.accent).toLowerCase() : null;
  out.aurora = m.aurora !== false;
  out.glass = m.glass === 'lite' ? 'lite' : 'full';
  out.compact = m.compact === true;
  out.effects = m.effects === 'lite' ? 'lite' : 'full';
  out.metaDesc = String(m.metaDesc || '').slice(0, 200) || null;
  out.keywords = String(m.keywords || '').slice(0, 300) || null;
  out.customCss = String(m.customCss || '').slice(0, 20000) || null;
  out.customJs = String(m.customJs || '').slice(0, 20000) || null;
  out.defaultRoute = ['home', 'movies', 'tv', 'anime', 'categories'].includes(m.defaultRoute) ? m.defaultRoute : 'home';
  cfgCache = { t: Date.now(), v: out };
  return out;
}
async function beaconHandler(request, env) {
  const kv = env.KNIGHTX_KV;
  if (!kv) return json({ ok: false }, 503);
  const st = await siteConfig(env);
  if (!st.statsEnabled) return json({ ok: true, skipped: true });
  const ua = request.headers.get('user-agent') || '';
  if (/bot|crawl|spider|curl|wget|headless|preview|slurp|python/i.test(ua)) return json({ ok: true, skipped: true });
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const p = UA_PARTS(ua);
  const t = Date.now();
  const rawEv = String(body.ev || 'page').toLowerCase();
  const evType = ['page', 'watch', 'search', 'visit', 'error'].includes(rawEv) ? rawEv : 'page';
  const ev = {
    t, ip: (request.headers.get('cf-connecting-ip') || '').slice(0, 64),
    dv: p.device, os: p.os, br: p.browser, bv: p.ver, model: p.model || '', co: (request.headers.get('cf-ipcountry') || '').slice(0, 8),
    city: (request.headers.get('cf-ipcity') || '').slice(0, 60), region: (request.headers.get('cf-region') || '').slice(0, 40), asn: (request.headers.get('cf-asn') || '').slice(0, 16),
    pg: String(body.page || '/').slice(0, 200), ev: evType,
    ti: String(body.title || '').slice(0, 200), q: String(body.q || '').slice(0, 120),
    rf: String(body.ref || '').slice(0, 300), sc: String(body.scr || '').slice(0, 24), lg: String(body.lang || '').slice(0, 12), tz: String(body.tz || '').slice(0, 8),
    conn: String(body.conn || '').slice(0, 12), mem: String(body.mem || '').slice(0, 8), cores: String(body.cores || '').slice(0, 8),
  };
  /* primary path: permanent event log in D1 (no caps, no TTL, survives every deploy) */
  const d1 = env.KNIGHTX_D1;
  if (d1) {
    try {
      if (!(await kvGet(kv, 'd1schema', 0))) {
        await d1.batch([
          d1.prepare('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, ip TEXT, device TEXT, os TEXT, browser TEXT, bver TEXT, model TEXT, country TEXT, city TEXT, region TEXT, asn TEXT, page TEXT, ev TEXT, title TEXT, q TEXT, ref TEXT, screen TEXT, lang TEXT, tz TEXT, conn TEXT, mem TEXT, cores TEXT)'),
          d1.prepare('CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)'),
          d1.prepare('CREATE INDEX IF NOT EXISTS idx_events_ip ON events(ip)'),
          d1.prepare('CREATE INDEX IF NOT EXISTS idx_events_ip_ts ON events(ip, ts)'),
        ]);
        await kvPut(kv, 'd1schema', 1);
      }
      await d1.prepare('INSERT INTO events (ts, ip, device, os, browser, bver, model, country, city, region, asn, page, ev, title, q, ref, screen, lang, tz, conn, mem, cores) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(ev.t, ev.ip, ev.dv, ev.os, ev.br, ev.bv, ev.model, ev.co, ev.city, ev.region, ev.asn, ev.pg, ev.ev, ev.ti, ev.q, ev.rf, ev.sc, ev.lg, ev.tz, ev.conn, ev.mem, ev.cores)
        .run();
      return json({ ok: true });
    } catch (_) { /* fall back to KV day blobs below */ }
  }
  const key = 'day:' + new Date(t).toISOString().slice(0, 10);
  const blob = await kvGet(kv, key, { d: key.slice(4), n: 0, counts: { ev: {}, device: {}, os: {}, br: {}, co: {}, pg: {}, ti: {}, q: {}, sc: {}, lg: {} }, visitors: {}, events: [] });
  const inc = (o, k) => { if (o && k) o[k] = (o[k] || 0) + 1; };
  /* normalize counts so blobs written by older builds (missing sc/lg keys) never throw */
  const c = blob.counts || (blob.counts = {});
  ['ev', 'device', 'os', 'br', 'co', 'pg', 'ti', 'q', 'sc', 'lg'].forEach(k => { if (!c[k]) c[k] = {}; });
  blob.n += 1;
  inc(c.ev, ev.ev); inc(c.device, ev.dv); inc(c.os, ev.os); inc(c.br, ev.br); inc(c.co, ev.co);
  inc(c.pg, ev.pg);
  if (ev.ev === 'watch') inc(c.ti, ev.ti);
  if (ev.ev === 'search') inc(c.q, ev.q);
  if (ev.sc) inc(c.sc, ev.sc); if (ev.lg) inc(c.lg, ev.lg);
  const v = blob.visitors[ev.ip] || { n: 0, first: t, last: t };
  v.n += 1; v.first = Math.min(v.first || t, t); v.last = Math.max(v.last || t, t);
  /* latest activity wins — shared IPs show the device that used it last */
  v.dv = ev.dv; v.os = ev.os; v.br = ev.br; if (p.ver) v.bv = p.ver; if (ev.co) v.co = ev.co;
  if (ev.sc) v.sc = ev.sc; if (ev.lg) v.lg = ev.lg; if (ev.tz) v.tz = ev.tz; if (ev.rf) v.rf = ev.rf;
  blob.visitors[ev.ip] = v;
  if (blob.events.length < 1500) blob.events.push(ev);
  await kvPut(kv, key, blob, DAY_TTL);
  return json({ ok: true });
}


/* ---------------- User reports ("Report a problem") ----------------
   Public endpoint: users describe a problem and it lands permanently in D1,
   where the private admin panel lists / reads / deletes them. Rate-limited to
   one report per IP per minute; stored in KV only as a fallback. */
const reportThrottle = new Map();
async function reportHandler(request, env) {
  const ip = (request.headers.get('cf-connecting-ip') || '').slice(0, 64);
  const now = Date.now();
  if (now - (reportThrottle.get(ip) || 0) < 60000) return json({ error: 'You just sent a report — try again in a minute.' }, 429);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  /* when Turnstile is configured, reports must carry a valid widget token
     (the gate's verify sets dx_pass — a gated visitor who passed also has
     one, so report submissions only need the token when no cookie exists) */
  if (gateActive(env)) {
    const passed = !!readCookie(request, GATE_COOKIE);
    if (!passed) {
      const v = await turnstileVerify(String(body.token || '').slice(0, 2048), env.TURNSTILE_SECRET_KEY, request);
      if (!v.success) return json({ error: 'Human verification failed. Please try again.', codes: v.codes }, 403);
    }
  }
  const cat = ['video', 'title', 'ads', 'broken', 'other'].includes(body.cat) ? body.cat : 'other';
  const msg = String(body.msg || '').trim().slice(0, 1000);
  if (msg.length < 5) return json({ error: 'Please describe the problem (at least 5 characters).' }, 400);
  reportThrottle.set(ip, now);
  /* keep the throttle map bounded — drop entries older than a minute */
  if (reportThrottle.size > 500) for (const [k, v] of reportThrottle) if (now - v > 60000) reportThrottle.delete(k);
  const p = UA_PARTS(request.headers.get('user-agent') || '');
  const report = {
    ts: now, ip,
    device: p.device, model: p.model || '', os: p.os, browser: p.browser,
    co: (request.headers.get('cf-ipcountry') || '').slice(0, 8), city: (request.headers.get('cf-ipcity') || '').slice(0, 60),
    cat, msg, contact: String(body.contact || '').slice(0, 120), page: String(body.page || '/').slice(0, 200), status: 'new',
  };
  const d1 = env.KNIGHTX_D1;
  if (d1) {
    try {
      if (!(await kvGet(env.KNIGHTX_KV, 'd1reports', 0))) {
        await d1.batch([
          d1.prepare('CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, ip TEXT, device TEXT, model TEXT, os TEXT, browser TEXT, country TEXT, city TEXT, cat TEXT, msg TEXT, contact TEXT, page TEXT, status TEXT)'),
          d1.prepare('CREATE INDEX IF NOT EXISTS idx_reports_ts ON reports(ts)'),
          d1.prepare('CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)'),
        ]);
        await kvPut(env.KNIGHTX_KV, 'd1reports', 1);
      }
      await d1.prepare('INSERT INTO reports (ts, ip, device, model, os, browser, country, city, cat, msg, contact, page, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(report.ts, report.ip, report.device, report.model, report.os, report.browser, report.co, report.city, report.cat, report.msg, report.contact, report.page, report.status)
        .run();
      return json({ ok: true });
    } catch (_) { /* fall back to KV below */ }
  }
  const list = await kvGet(env.KNIGHTX_KV, 'reports', []);
  list.unshift(report);
  await kvPut(env.KNIGHTX_KV, 'reports', list.slice(0, 300));
  return json({ ok: true });
}

/* ---------------- Turnstile human-verification gate ----------------
   Optional whole-site gate powered by Cloudflare Turnstile (free). It is
   completely inert unless BOTH TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY
   are bound — with no keys the site behaves exactly as before.

   Flow:
     1. Visitor loads the app with no valid dx_pass cookie and keys present
        → serveApp injects a tiny splash + Turnstile widget into the page.
     2. The widget's token is POSTed to /api/gate/verify, which calls
        siteverify with the secret. On success a signed dx_pass cookie is set
        (30-day expiry) and the page is reloaded.
     3. Every later visit carries dx_pass → the worker serves the normal
        shell with NO gate, so verified browsers never see Turnstile again
        (also true for hard refreshes).
   The cookie is a plain short token (this is a frontend SPA — anything in the
   page can be read; the gate only stops casual/bot traffic, it is not a
   security boundary). */
const GATE_COOKIE = 'dx_pass';
const readCookie = (request, name) => {
  const h = request.headers.get('cookie') || '';
  const m = h.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
};
/* POST https://challenges.cloudflare.com/turnstile/v0/siteverify
   body: secret, response(token), remoteip, idempotency_key optional */
const turnstileVerify = async (token, secret, request) => {
  if (!secret || !token) return { success: false, codes: ['missing-input-response'] };
  try {
    const body = { secret, response: token, remoteip: request.headers.get('cf-connecting-ip') || '' };
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    return { success: j.success === true, codes: j['error-codes'] || [] };
  } catch (_) {
    return { success: false, codes: ['internal-error'] };
  }
};
const gateActive = (env) => !!(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
/* the gate HTML injected only when needed (see serveApp) — splash + widget */
const GATE_SK = '/*__GATE_SK__*/'; /* build-time placeholder: never "0x…"-aware, replaced by serveApp */
function gateHTML(siteName, sk) {
  return `\n<div id="kxGate">\n  <div class="kxg-card">\n    <div class="kxg-logo"><img src="/logo.jpg?v=3" alt="" aria-hidden="true"></div>\n    <h1>${String(siteName || 'KnightXstream').replace(/</g, '&lt;')}</h1>\n    <p class="kxg-sub">Verifying you're human…</p>\n    <div class="kxg-spin"><i></i><i></i><i></i></div>\n    <div class="cf-turnstile" data-sitekey="${sk}" data-theme="dark" data-callback="window.__kxGateDone"></div>\n    <p class="kxg-err" id="kxgErr" hidden>Something went wrong. <button onclick="window.__kxGateRetry()">Retry</button></p>\n  </div>\n</div>\n<style>\n#kxGate{position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 120% at 50% 0%,#0d0d15 0%,#050508 60%);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}\n#kxGate .kxg-card{display:flex;flex-direction:column;align-items:center;gap:14px;padding:38px 46px;border-radius:26px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 24px 70px rgba(0,0,0,.6);backdrop-filter:blur(30px) saturate(170%);-webkit-backdrop-filter:blur(30px) saturate(170%);text-align:center;max-width:min(92vw,420px)}\n#kxGate .kxg-logo{width:72px;height:72px;border-radius:22px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.18)}\n#kxGate .kxg-logo img{width:100%;height:100%;object-fit:cover;display:block}\n#kxGate h1{font:700 24px/1.2 -apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;color:#f5f5f7;margin:0}\n#kxGate .kxg-sub{color:#8a8a9a;font:500 13.5px/1.5 -apple-system,'SF Pro Text','Segoe UI',sans-serif;margin:0}\n#kxGate .kxg-spin{display:flex;gap:7px;margin:6px 0 2px}\n#kxGate .kxg-spin i{width:9px;height:9px;border-radius:50%;background:#0a84ff;opacity:.25;animation:kxgp 1.1s ease-in-out infinite}\n#kxGate .kxg-spin i:nth-child(2){animation-delay:.18s}\n#kxGate .kxg-spin i:nth-child(3){animation-delay:.36s}\n@keyframes kxgp{0%,100%{opacity:.22;transform:translateY(0)}50%{opacity:1;transform:translateY(-5px)}}\n#kxGate .kxg-err{color:#ff9f9f;font:500 13px -apple-system,'SF Pro Text',sans-serif;margin:0}\n#kxGate .kxg-err button{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:10px;padding:4px 14px;font:600 12.5px inherit;cursor:pointer;margin-left:6px}\n#kxGate .cf-turnstile{transform:scale(.92);margin:2px 0 0}\n@media (max-width:480px){#kxGate .kxg-card{padding:30px 24px;border-radius:22px}}\n@media (prefers-reduced-motion:reduce){#kxGate .kxg-spin i{animation:none;opacity:.6}}\n</style>`;
}
/* gate script — only injected for visitors without the pass cookie. It renders
   the Turnstile widget, posts the token to /api/gate/verify, then reloads so
   the app boots with the cookie in place (refresh = no gate ever again). */
const GATE_JS = `\n<script>\n(function(){\n  var scriptEl=null;
  function done(){ try{ setTimeout(function(){ location.reload(); }, 250); }catch(e){ location.reload(); } }\n  window.__kxGateDone=function(token){\n    fetch('/api/gate/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token})})\n      .then(function(r){ if(r.ok){ done(); } else { fail(); } })\n      .catch(fail);\n  };
  function fail(){ var e=document.getElementById('kxgErr'); if(e){ e.hidden=false; } var s=document.getElementById('kxgSpin'); if(s){ s.style.display='none'; }
    if(typeof window.turnstile!=='undefined' && document.querySelector('.cf-turnstile')){ try{ window.turnstile.reset(document.querySelector('.cf-turnstile')); }catch(_){ } }
  }
  window.__kxGateRetry=function(){
    if(typeof window.turnstile==='undefined'){ load(); return; }
    var e=document.getElementById('kxgErr'); if(e){ e.hidden=true; }
    var s=document.getElementById('kxgSpin'); if(s){ s.style.display=''; }
    fail();
  };
  function load(){\n    if(typeof window.turnstile==='undefined' && !scriptEl){
      scriptEl=document.createElement('script');
      scriptEl.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__kxGateLoad';
      scriptEl.async=true; scriptEl.defer=true;
      scriptEl.onerror=fail;
      document.head.appendChild(scriptEl);
      return;
    }
    if(typeof window.turnstile!=='undefined' && document.querySelector('.cf-turnstile') && !document.querySelector('.cf-turnstile iframe')){
      try{ window.turnstile.render('.cf-turnstile'); }catch(e){}
    }
  }
  window.__kxGateLoad=load;
  load();
})();\n</script>`;

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
/* logo mark (assets/logo.jpg) — inlined at build time, served from /logo.jpg */
const LOGO_B64 = '/*__LOGO__*/';
/* brand favicon (assets/favicon.png) — inlined at build time, served from /favicon.png */
const FAVICON_PNG = '/*__FAVICON_PNG__*/';
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
  /* admin-driven meta tags (description/keywords) are read live and folded
     into the cache key so a config change busts the served head instantly */
  let metaDesc = null, keywords = null, cfgTag = '';
  try {
    const sc = await siteConfig(env);
    metaDesc = sc.metaDesc; keywords = sc.keywords; cfgTag = (sc.metaDesc || '') + '|' + (sc.keywords || '');
  } catch (_) {}
  const cfgHash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const gated = gateActive(env);
  /* a verified browser (dx_pass cookie present) gets the NORMAL shell — no
     splash, no widget, ever again (hard refresh included). Others get the
     gate variant. The cookie state is folded into the cache key + a Vary
     header so the edge cache can never serve the gated page to someone who
     already passed, or vice versa. */
  const passed = gated && !!readCookie(request, GATE_COOKIE);
  const cacheKey = 'app:' + siteName + ':' + BUILD_STAMP + ':' + cfgHash(cfgTag) + ':' + (gated ? (passed ? 'p' : 'g') : 'o');
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
    '<meta name="description" content="' + (metaDesc || 'Discover and stream your favorite movies and TV shows in high quality. Free streaming site.') + '">\n' +
    (keywords ? '<meta name="keywords" content="' + keywords + '">\n' : '') +
    '<meta name="theme-color" content="#121212">\n' +
    '<meta property="og:site_name" content="' + siteName + '">\n' +
    '<link rel="icon" type="image/png" href="/favicon.png">\n' +
    '<meta property="og:image" content="' + new URL(request.url).origin + '/logo.jpg">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    /* the site is image-heavy — warm up the TMDB image CDN connection so
       every poster/backdrop skips the DNS+TLS round trip (big perceived-LCP win) */
    '<link rel="preconnect" href="https://image.tmdb.org">\n' +
    '<link rel="dns-prefetch" href="https://image.tmdb.org">\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n' +
    '<style>\n' + STYLES + '\n</style>\n' +
    '</head>\n<body>\n' +
    /* the gate (if active + this visitor hasn't passed yet) mounts OVER the
       app and reloads once verified — verified visitors never see this */
    (gated && !passed ? gateHTML(siteName, env.TURNSTILE_SITE_KEY) + GATE_JS : '') +
    /* the app can re-check gating (e.g. the report modal shows a Turnstile
       widget only when the gate is active and no pass cookie exists yet) */
    '<script>window.SITE_NAME = ' + JSON.stringify(siteName) + ';window.__GATE = ' + JSON.stringify(gated ? { sk: env.TURNSTILE_SITE_KEY, active: true } : { active: false }) + ';</script>\n' +
    '<script>\n' + APP_JS + '\n</script>\n' +
    '</body>\n</html>';
  const res = new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'Vary': gated ? 'Cookie' : 'Accept-Encoding' } });
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
    if (path === '/favicon.png' || path === '/favicon.ico')
      return new Response(b64ToBytes(FAVICON_PNG), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
    /* brand logo mark (embedded at build time — never fetched from an external host).
       Short max-age + versioned query in the app so a logo refresh is never stuck
       behind a day-long edge cache. */
    if (path === '/logo.jpg' || path === '/logo')
      return new Response(b64ToBytes(LOGO_B64), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
    /* developer Telegram profile photos (embedded at build time) */
    if (path === '/avatars/kyren.jpg' || path === '/avatars/kyren')
      return new Response(b64ToBytes(AVATAR_KYREN), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
    if (path === '/avatars/denji.jpg' || path === '/avatars/denji')
      return new Response(b64ToBytes(AVATAR_DENJI), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
    if (path.startsWith('/api/tmdb/')) return tmdbHandler(request, url, env, ctx);
    if (path === '/api/stream') return streamHandler(request, url, env, ctx);
    if (path === '/api/beacon' && request.method === 'POST') return beaconHandler(request, env);
    /* Turnstile gate — verify the widget token, then set the pass cookie.
       Only exists when the keys are configured; otherwise 404 (inert). */
    if (path === '/api/gate/verify' && request.method === 'POST') {
      if (!gateActive(env)) return json({ error: 'not found' }, 404);
      let token = '';
      try { const b = await request.json(); token = String(b.token || '').slice(0, 2048); } catch (_) {}
      const v = await turnstileVerify(token, env.TURNSTILE_SECRET_KEY, request);
      if (!v.success) return json({ error: 'Verification failed. Please try again.', codes: v.codes }, 403);
      /* short token (this is a frontend SPA; the gate stops casual bots only) */
      const cookie = GATE_COOKIE + '=' + encodeURIComponent('v1.' + Date.now().toString(36)) +
        '; Path=/; Max-Age=' + (30 * 86400) + '; SameSite=Lax';
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie, 'Cache-Control': 'no-store' },
      });
    }
    if (path === '/api/report' && request.method === 'POST') return reportHandler(request, env);
    if (path === '/api/siteconfig') return json(await siteConfig(env, true)); /* explicit GET always fresh — admin controls feel live */
    if (path.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return serveApp(request, env, siteName, ctx);
  },
};
