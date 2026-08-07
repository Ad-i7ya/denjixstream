'use strict';
/* ============================================================
   CineGlass — frontend application (streamex.sh-style SPA)
   ============================================================ */
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const SITE_NAME = window.SITE_NAME || 'CineGlass';
const IMG = 'https://image.tmdb.org/t/p';
const IMG_BACKDROP = (p) => p ? `${IMG}/w1280${p}` : '';
const IMG_POSTER   = (p) => p ? `${IMG}/w500${p}`  : '';
const IMG_FACE     = (p) => p ? `${IMG}/w185${p}`  : '';
const IMG_HERO     = (p) => p ? `${IMG}/original${p}` : ''; /* full-res — crisp on big screens, no visible pixels */
const IMG_CARD     = (p) => p ? `${IMG}/w780${p}`  : ''; /* plenty for card sizes, ~1/3 the bytes of w1280 */
const fmtTime = (s) => { if (!isFinite(s)) return '0:00'; s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const year = (d) => (d || '').slice(0, 4);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------------- API ---------------- */
async function api(path, opts) {
  const r = await fetch(`/api/tmdb${path}`, opts);
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

/* ---------------- STORE (localStorage) ---------------- */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const Store = {
  watchlist: { all() { return store.get('sg_watchlist', []); }, has(id, type) { return this.all().some(x => x.id === id && x.type === type); }, toggle(m) { const l = this.all(); const i = l.findIndex(x => x.id === m.id && x.type === m.type); if (i >= 0) l.splice(i, 1); else l.unshift({ id: m.id, type: m.type, title: m.title || m.name, poster: m.poster_path, backdrop: m.backdrop_path, vote: m.vote_average, year: year(m.release_date || m.first_air_date) }); store.set('sg_watchlist', l); return i < 0; } },
  progress: { get(key) { return store.get('sg_progress', {})[key]; }, set(key, p) { const all = store.get('sg_progress', {}); all[key] = p; store.set('sg_progress', all); }, all() { return store.get('sg_progress', {}); } },
  history: { all() { return store.get('sg_history', []); }, add(h) { let l = this.all().filter(x => !(x.key === h.key)); l.unshift(h); store.set('sg_history', l.slice(0, 60)); }, clear() { store.set('sg_history', []); } },
};

/* ---------------- ICONS (heroicons outline) ---------------- */
const ICONS = {
  home: '<path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/>',
  search: '<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>',
  browse: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"/>',
  movie: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0 1 18 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0 1 18 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 0 1 6 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0 .621.504 1.125 1.125 1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M19.125 12h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h1.5m14.25 0h1.5"/>',
  tv: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125Z"/>',
  sparkles: '<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"/>',
  bookmark: '<path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"/>',
  clock: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>',
  play: '<path stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"/>',
  pause: '<path stroke-linejoin="round" d="M6.75 5.25h2.25v13.5H6.75V5.25Zm8.25 0h2.25v13.5H15V5.25Z"/>',
  volume: '<path stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"/>',
  mute: '<path stroke-linejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"/>',
  fullscreen: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25-11.25v4.5m0-4.5h-4.5m4.5 0L15 9m6.75 11.25v-4.5m0 4.5h-4.5m4.5 0L15 15"/>',
  exitfs: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"/>',
  gear: '<path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>',
  download: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/>',
  chevL: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5"/>',
  chevR: '<path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/>',
  star: '<path stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"/>',
  x: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>',
  arrowL: '<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>',
  check: '<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>',
  users: '<path stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/>',
  calendar: '<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>',
  info: '<path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/>',
  dots: '<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"/>',
  film: '<path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"/>',
  telegram: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"/>',
  next: '<path stroke-linecap="round" stroke-linejoin="round" d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5"/>',
  speed: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>',
};
const icon = (name, cls = '') => `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="${cls}">${ICONS[name] || ''}</svg>`;

/* ---------------- LOGO MARK (Apple-minimal play tile) ---------------- */
const LOGO_MARK = `<svg class="logo-mark" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="dxmTile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1e1e27"/><stop offset="1" stop-color="#0a0a10"/>
    </linearGradient>
    <linearGradient id="dxmPlay" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e7ebf6"/>
    </linearGradient>
    <linearGradient id="dxmAcc" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#4db0ff"/><stop offset="1" stop-color="#5e5ce6"/>
    </linearGradient>
  </defs>
  <rect x="2.5" y="2.5" width="59" height="59" rx="16" fill="url(#dxmTile)"/>
  <rect x="2.5" y="2.5" width="59" height="59" rx="16" stroke="rgba(255,255,255,.22)" stroke-width="1.3"/>
  <path d="M9 16.5C9 11.9 12.9 8 17.5 8h29c4.6 0 8.5 3.9 8.5 8.5v6H9v-6Z" fill="rgba(255,255,255,.06)"/>
  <path d="M24.6 21.9v20.2a1.7 1.7 0 0 0 2.56 1.47l16.4-10.1a1.7 1.7 0 0 0 0-2.94l-16.4-10.1a1.7 1.7 0 0 0-2.56 1.47Z" fill="url(#dxmPlay)"/>
  <rect x="46.5" y="27.6" width="6.6" height="2.9" rx="1.45" fill="url(#dxmAcc)"/>
  <rect x="45" y="33.4" width="8.1" height="2.9" rx="1.45" fill="url(#dxmAcc)" opacity=".5"/>
</svg>`;

/* ---------------- TOAST ---------------- */
let toastTimer;
function toast(msg) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------- ROUTER ---------------- */
const routes = {
  '/': viewHome,
  '/search': viewSearch,
  '/browse': viewBrowse,
  '/browse/:id': viewBrowse,
  '/categories': viewCategories,
  '/categories/:type': viewCategories,
  '/anime': viewAnime,
  '/movie/:id': viewDetail,
  '/tv/:id': viewDetail,
  '/watch/movie/:id': viewWatch,
  '/watch/tv/:id/:season/:episode': viewWatch,
  '/watchlist': viewWatchlist,
  '/history': viewHistory,
  '/legal': viewLegal,
};
function matchRoute(hash) {
  const path = (hash.replace(/^#/, '') || '/').split('?')[0];
  for (const [pat, fn] of Object.entries(routes)) {
    const pp = pat.split('/').filter(Boolean), hp = path.split('/').filter(Boolean);
    if (pp.length !== hp.length) continue;
    const params = {}; let ok = true;
    pp.forEach((p, i) => { if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(hp[i]); else if (p !== hp[i]) ok = false; });
    if (ok) return { fn, params };
  }
  return { fn: () => { main.innerHTML = `<div class="empty-state"><h3>Page not found</h3><p class="muted">The page you requested doesn't exist.</p></div>`; }, params: {} };
}
function navigate(hash) { location.hash = hash; }
let routeFirst = true;
/* reduced-motion users get instant navigation — the CSS already zeroes the
   animations, but the JS veil timer needs its own gate too */
const ROUTE_REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
async function router() {
  const tok = ++routeTok;
  stopHeroTimer();
  /* tear down any leftover episode overlay + its cache on navigation */
  const oldOv = document.getElementById('epOverlay');
  if (oldOv) { oldOv.remove(); epOpen = false; epCloseFn = null; document.body.classList.remove('ep-open'); epCache = {}; }
  if (routeFirst || ROUTE_REDUCED) {
    routeFirst = false; /* first paint has nothing to transition from */
  } else {
    /* Apple liquid-glass swap: the veil blurs the outgoing page upward… */
    routeVeil.style.transition = 'opacity .16s ease, -webkit-backdrop-filter .16s ease, backdrop-filter .16s ease';
    routeVeil.style.opacity = '.92';
    routeVeil.style.webkitBackdropFilter = 'blur(16px) saturate(1.15)';
    routeVeil.style.backdropFilter = 'blur(16px) saturate(1.15)';
    await new Promise(r => setTimeout(r, 165));
    if (tok !== routeTok) return; /* a newer navigation superseded this one */
  }
  const { fn, params } = matchRoute(location.hash || '#/');
  window.scrollTo(0, 0);
  fn(params);
  /* pages that open with a title / search bar / player get top clearance so
     the always-visible floating logo never overlaps their header */
  const rp = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  main.classList.toggle('logo-gap', /^\/(search|browse|categories|anime|watchlist|history|legal|watch)\b/.test(rp));
  /* …then dissolve the veil so the new page sharpens into focus. The blur
     drops in 180ms while the tint lingers — smooth on low-end phone GPUs */
  routeVeil.style.transition = 'opacity .5s cubic-bezier(.32,.72,.32,1), -webkit-backdrop-filter .18s ease, backdrop-filter .18s ease';
  routeVeil.style.opacity = '0';
  routeVeil.style.webkitBackdropFilter = 'blur(0px) saturate(1.15)';
  routeVeil.style.backdropFilter = 'blur(0px) saturate(1.15)';
  // route switches reset scroll programmatically (no scroll event fires) — sync the logo state
  requestAnimationFrame(updateFloatLogo);
  // re-trigger the per-view rise AFTER render for Apple-smooth continuity
  main.classList.remove('view-enter'); void main.offsetWidth; main.classList.add('view-enter');
  setActiveNav();
}
window.addEventListener('hashchange', router);

/* ---------------- LAYOUT ---------------- */
const app = document.createElement('div'); app.className = 'app';
const sidebarHTML = `
<aside class="sidebar" id="sidebar">
  <div class="sb-resize" id="sbResize" title="Drag to resize"></div>
  <div class="logo"><a href="#/" title="${esc(SITE_NAME)}">${LOGO_MARK}<span class="logo-word">${esc(SITE_NAME)}</span></a></div>
  <div class="side-section">
    <a class="side-link" data-nav="home" href="#/">${icon('home')}<span>Home</span></a>
    <a class="side-link" data-nav="search" href="#/search">${icon('search')}<span>Search</span></a>      <a class="side-link" data-nav="browse" href="#/browse">${icon('browse')}<span>Browse</span></a>
      <a class="side-link" data-nav="categories" href="#/categories">${icon('film')}<span>Categories</span></a>
      <a class="side-link" data-nav="anime" href="#/anime">${icon('sparkles')}<span>Anime</span></a>
  </div>
  <div class="side-scroll">
    <div class="side-section">
      <span class="side-label">MEDIA</span>
      <a class="side-link" data-nav="movie" href="#/browse/movie">${icon('movie')}<span>Movies</span></a>
      <a class="side-link" data-nav="tv" href="#/browse/tv">${icon('tv')}<span>TV Shows</span></a>
      <a class="side-link" href="#/browse/tv?sort=top_rated">${icon('sparkles')}<span>Top Rated</span></a>
      <a class="side-link" data-nav="watchlist" href="#/watchlist">${icon('bookmark')}<span>Watchlist</span></a>
      <a class="side-link" data-nav="history" href="#/history">${icon('clock')}<span>History</span></a>
    </div>
    <div class="side-section">
      <span class="side-label">MORE</span>
      <a class="side-link" data-nav="legal" href="#/legal">${icon('info')}<span>Legal / DMCA</span></a>
    </div>
  </div>
  <a class="contact-btn" href="https://t.me/te4m1ord" target="_blank" rel="noopener" title="Contact on Telegram">${icon('telegram')}<span>Contact</span></a>
</aside>
<button class="collapse-btn" id="collapseBtn" title="Collapse sidebar">${icon('chevL')}</button>
<div class="main-area">
  <main class="main-scroll" id="main"></main>
</div>
<nav class="mobile-nav">
  <div class="row">
    <a data-nav="home" href="#/">${icon('home')}<span>Home</span></a>
    <a data-nav="search" href="#/search">${icon('search')}<span>Search</span></a>
    <a data-nav="browse" href="#/browse">${icon('browse')}<span>Browse</span></a>
    <a data-nav="watchlist" href="#/watchlist">${icon('bookmark')}<span>Watchlist</span></a>
    <button id="moreBtn">${icon('dots')}<span>More</span></button>
  </div>
</nav>
<div class="toast" id="toast"></div>`;
app.innerHTML = sidebarHTML + `
<button class="menu-btn" id="menuBtn" aria-label="Open menu"><span></span><span></span><span></span></button>
<a class="float-logo" href="#/" title="${esc(SITE_NAME)} — Home">${LOGO_MARK}<span class="logo-word">${esc(SITE_NAME)}</span></a>`;
document.body.prepend(app);
/* liquid-glass route veil — one fixed element that blurs the outgoing page
   while the next route swaps in underneath; opacity is driven by the router */
const routeVeil = document.createElement('div');
routeVeil.id = 'routeVeil';
document.body.appendChild(routeVeil);
let routeTok = 0;
/* hide the floating logo once the page is scrolled down — it fades back in
   only when the user is back at the very top */
const floatLogo = $('.float-logo');
const updateFloatLogo = () => {
  if (!floatLogo) return;
  floatLogo.classList.toggle('scrolled', (window.scrollY || document.documentElement.scrollTop) > 24);
};
window.addEventListener('scroll', updateFloatLogo, { passive: true });
const main = $('#main');
const footerNote = () => `<footer class="site-footer">
  <a class="foot-brand" href="#/">${LOGO_MARK}<span class="logo-word">${esc(SITE_NAME)}</span></a>
  <nav class="foot-links" aria-label="Footer">
    <a href="#/">Home</a><a href="#/browse/movie">Movies</a><a href="#/browse/tv">TV Shows</a>
    <a href="#/anime">Anime</a><a href="#/categories">Categories</a><a href="#/legal">Legal / DMCA</a>
  </nav>
  <p class="foot-legal">This site does not store any files on the server. We only link to media hosted on third-party services. All trademarks and copyrights belong to their respective owners.</p>
  <p class="foot-copy">© ${new Date().getFullYear()} ${esc(SITE_NAME)} · Crafted with <span class="heart">♥</span> for movie lovers</p>
</footer>`;

/* Apple-style hamburger — opens the liquid-glass drawer on tablets/phones */
$('#menuBtn').addEventListener('click', () => {
  const sb = $('#sidebar');
  sb.classList.toggle('open');
  closeMoreSheet();
});

$('#collapseBtn').addEventListener('click', () => {
  const sb = $('#sidebar'), btn = $('#collapseBtn'), el = $('.app');
  const hidden = sb.classList.toggle('collapsed');
  btn.classList.toggle('collapsed', hidden);
  el.classList.toggle('sidebar-hidden', hidden);
  btn.innerHTML = hidden ? icon('chevR') : icon('chevL');
  try { localStorage.setItem('dx_sidebar', hidden ? '1' : '0'); } catch {}
});
/* restore persisted sidebar state (collapsed → content is full screen) */
try {
  if (localStorage.getItem('dx_sidebar') === '1') {
    $('#sidebar').classList.add('collapsed');
    $('.collapse-btn').classList.add('collapsed');
    $('.app').classList.add('sidebar-hidden');
    $('.collapse-btn').innerHTML = icon('chevR');
  }
} catch {}
/* Draggable sidebar width — grab the right edge and drag like a drawer (Apple-style). */
(function initSidebarResize() {
  const el = $('.app');
  const min = 212, max = 420;
  const apply = (w) => {
    const cw = clamp(w, min, max);
    el.style.setProperty('--sbw', cw + 'px');
    try { localStorage.setItem('dx_sidebar_w', String(cw)); } catch {}
  };
  try { const saved = +localStorage.getItem('dx_sidebar_w'); if (saved >= min && saved <= max) apply(saved); } catch {}
  const handle = $('#sbResize'); if (!handle) return;
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = parseFloat(getComputedStyle($('#sidebar')).width) || 264;
    const move = (ev) => apply(startW + (ev.clientX - startX));
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
    };
    document.body.classList.add('resizing');
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
})();
/* Netflix-style "More" bottom sheet on phones */
let moreSheet = null;
$('#moreBtn').addEventListener('click', () => {
  if (moreSheet && moreSheet.isConnected) { closeMoreSheet(); return; }
  moreSheet = document.createElement('div');
  moreSheet.className = 'more-sheet-overlay';
  moreSheet.innerHTML = `<div class="more-sheet">
    <button class="more-sheet-close" id="moreSheetClose" aria-label="Close menu">✕</button>
    <div class="more-grab"></div>
    <div class="more-grid">
      <a href="#/categories">${icon('film')}<span>Categories</span></a>
      <a href="#/anime">${icon('sparkles')}<span>Anime</span></a>
      <a href="#/browse/tv?sort=top_rated">${icon('star')}<span>Top Rated</span></a>
      <a href="#/history">${icon('clock')}<span>History</span></a>
      <a href="#/legal">${icon('info')}<span>Legal</span></a>
      <a href="https://t.me/te4m1ord" target="_blank" rel="noopener">${icon('telegram')}<span>Contact</span></a>
    </div>
  </div>`;
  document.body.appendChild(moreSheet);
  $('#moreSheetClose', moreSheet).addEventListener('click', closeMoreSheet);
  requestAnimationFrame(() => moreSheet.classList.add('open'));
});
function closeMoreSheet() {
  if (!moreSheet) return;
  const el = moreSheet; moreSheet = null;
  el.classList.remove('open');
  /* capture el locally — reading the module var at fire time would be null */
  setTimeout(() => el.remove(), 300);
}
document.addEventListener('click', (e) => {
  if (moreSheet && moreSheet.isConnected) {
    const inSheet = e.target.closest('.more-sheet');
    /* backdrop tap, or any link inside the sheet (navigation) closes it */
    if ((!inSheet && !e.target.closest('#moreBtn')) || (inSheet && e.target.closest('a'))) closeMoreSheet();
  }
  const sb = $('#sidebar');
  if (sb.classList.contains('open')) {
    const inSb = e.target.closest('.sidebar');
    /* backdrop tap, or any sidebar link (navigation) closes the drawer —
       never when the toggle buttons themselves were clicked */
    if ((!inSb && !e.target.closest('#moreBtn') && !e.target.closest('#menuBtn')) || (inSb && e.target.closest('a'))) sb.classList.remove('open');
  }
});

function setActiveNav() {
  const path = (location.hash || '#/').replace(/^#/, '') || '/';
  const key = path.split('/')[1] || 'home';
  const navKey = ['movie', 'tv'].includes(key) ? key : (['watchlist', 'history', 'search', 'browse', 'categories', 'anime', 'legal', 'home'].includes(key) ? key : '');
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === navKey));
}

/* ---------------- COMPONENTS ---------------- */
/* Shared img attrs: shimmer while loading, graceful fade-in/fallback on load/error. */
const IMG_FADE = 'loading="lazy" decoding="async" onload="this.classList.add(\'loaded\')" onerror="this.classList.add(\'img-err\'); this.previousElementSibling.classList.remove(\'shimmer\')"';
/* Card artwork: subtle shimmer while the image loads; a small elegant play mark
   on a soft gradient when there is no image or it fails — no more big odd logos. */
function cardArt(m, title) {
  const src = m.backdrop_path ? IMG_CARD(m.backdrop_path) : '';
  if (!src) return `<div class="card-ph"><i class="ph-play">${icon('play')}</i></div>`;
  return `<div class="card-ph shimmer"><i class="ph-play">${icon('play')}</i></div><img ${IMG_FADE} src="${src}" alt="${esc(title)}">`;
}
function backdropCard(m, { grid = false } = {}) {
  const title = m.title || m.name || '';
  const rating = m.vote_average ? Number(m.vote_average).toFixed(1) : null;
  const sub = (m.release_date ? year(m.release_date) : m.first_air_date ? year(m.first_air_date) : '');
  const href = `#/${m.media_type || (m.first_air_date ? 'tv' : 'movie')}/${m.id}`;
  return `<div class="card ${grid ? 'grid-card' : 'backdrop'}" onclick="location.hash='${href.slice(1)}'">
    ${cardArt(m, title)}
    ${rating ? `<div class="card-rating">${icon('star')} ${rating}</div>` : ''}
    <div class="play-circle">${icon('play')}</div>
    <div class="glass"><div class="title">${esc(title)}</div><div class="sub">${sub ? `<span>${esc(sub)}</span>` : ''}${rating ? `<span class="r">★ ${rating}</span>` : ''}</div></div>
    ${progressFlag(m)}
  </div>`;
}
function continueCard(p) {
  const href = p.type === 'tv' ? `#/watch/tv/${p.id}/${p.season || 1}/${p.episode || 1}` : `#/watch/movie/${p.id}`;
  const hasP = p.duration > 0;
  const pct = hasP ? clamp((p.time / p.duration) * 100, 0, 100) : 0;
  const label = p.type === 'tv' ? `S${p.season}·E${p.episode}` : 'Movie';
  return `<div class="card backdrop" onclick="location.hash='${href.slice(1)}'">
    ${cardArt(p, '')}
    <div class="play-circle">${icon('play')}</div>
    <div class="glass"><div class="title">${esc(p.title || '')}</div><div class="sub">${label}${hasP ? ` · ${Math.round(pct)}%` : ''}</div></div>
    ${hasP ? `<div class="card-progress" style="width:${pct}%"></div>` : ''}
  </div>`;
}
function progressFlag(m) {
  const key = (m.media_type || (m.first_air_date ? 'tv' : 'movie')) + '-' + m.id;
  const p = Store.progress.get(key);
  if (!p || !p.duration) return '';
  const pct = clamp((p.time / p.duration) * 100, 0, 100);
  return `<div class="card-progress" style="width:${pct}%"></div>${pct > 85 ? '<div class="watch-flag">✓ Watched</div>' : ''}`;
}
function rowSection(title, items, viewAll) {
  if (!items || !items.length) return '';
  return `<section style="margin-bottom:22px">
    <div class="section-head"><h2 class="section-title">${esc(title)}</h2>${viewAll ? `<a class="view-all" href="${viewAll}">View all →</a>` : ''}</div>
    <div class="row-wrap">
      <button class="row-nav prev" aria-label="Scroll left">${icon('chevL')}</button>
      <button class="row-nav next" aria-label="Scroll right">${icon('chevR')}</button>
      <div class="row scrollbar-hide">${items.map(m => backdropCard(m)).join('')}</div>
    </div>
  </section>`;
}
function gridSection(title, items, viewAll) {
  if (!items || !items.length) return '';
  return `<section style="margin-bottom:26px">
    <div class="section-head"><h2 class="section-title">${esc(title)}</h2>${viewAll ? `<a class="view-all" href="${viewAll}">View all →</a>` : ''}</div>
    <div class="grid">${items.map(m => backdropCard(m, { grid: true })).join('')}</div>
  </section>`;
}
/* Hero slideshow — auto-rotating featured titles with crossfade, dots + arrows,
   pause on hover, touch swipe. Stays compact so thumbnails never feel huge. */
function heroSlide(m) {
  const title = m.title || m.name;
  const rating = m.vote_average ? Number(m.vote_average).toFixed(1) : null;
  const med = m.media_type || (m.first_air_date ? 'tv' : 'movie');
  return `<div class="hero-slide" data-id="${m.id}" data-media="${med}">
    ${m.backdrop_path ? `<img class="backdrop" src="${IMG_BACKDROP(m.backdrop_path)}" data-hi="${IMG_HERO(m.backdrop_path)}" alt="" loading="lazy" decoding="async">` : ''}
    <div class="blob b1"></div><div class="blob b2"></div>
    <div class="shade"></div>
    <div class="hero-trailer"></div>
    <div class="content">
      <div class="tag">${med === 'tv' ? 'Featured TV Series' : 'Featured Movie'}</div>
      <h1>${esc(title)}</h1>
      <div class="meta">
        ${rating ? `<span class="rate">${icon('star', 'inline')} ${rating}</span>` : ''}
        ${m.release_date ? `<span>${year(m.release_date)}</span>` : m.first_air_date ? `<span>${year(m.first_air_date)}</span>` : ''}
        ${m.vote_count ? `<span>${Number(m.vote_count).toLocaleString()} votes</span>` : ''}
        ${m.original_language ? `<span class="dot"></span><span>${esc(m.original_language.toUpperCase())}</span>` : ''}
      </div>
      <p class="overview">${esc(m.overview || '')}</p>
      <div class="actions">
        <a class="btn btn-primary" href="#/watch/${med}/${m.id}">${icon('play')} Watch Now</a>
        <a class="btn btn-glass" href="#/${med}/${m.id}">${icon('info')} Details</a>
        <button class="btn btn-ghost wl-btn" data-m='${esc(JSON.stringify({ id: m.id, media_type: med, title, name: m.name, poster_path: m.poster_path, backdrop_path: m.backdrop_path, vote_average: m.vote_average, release_date: m.release_date, first_air_date: m.first_air_date }))}'>${icon('bookmark')} <span>Watchlist</span></button>
      </div>
    </div>
  </div>`;
}
function heroCarousel(items) {
  const list = (items || []).filter(m => m.backdrop_path).slice(0, 6);
  if (!list.length) return '';
  return `<div class="hero" id="heroCaro">
    ${list.map(heroSlide).join('')}
    <button class="hero-nav prev" aria-label="Previous title">${icon('chevL')}</button>
    <button class="hero-nav next" aria-label="Next title">${icon('chevR')}</button>
    <div class="hero-dots">${list.map((m, i) => `<button class="hero-dot${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>
  </div>`;
}
let heroTimer = null;
function stopHeroTimer() { if (heroTimer) { clearInterval(heroTimer); heroTimer = null; } }
/* one source of truth for the chrome-hiding trailer embed URL — used by the
   hero hover preview AND the detail-page background trailer so the params
   (modestbranding, rel=0, fs=0, …) can never drift apart */
const ytTrailer = (k) => `https://www.youtube-nocookie.com/embed/${k}?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=${k}&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0`;
/* Netflix-style: hover over the hero and the current slide's trailer plays muted
   inline; moving away stops it. Trailers are fetched lazily once per title and
   cached, and only on hover-capable devices (touch never autoplays video). */
const heroTrailerCache = {};
function stopHeroTrailer(hero) {
  const t = hero && $('.hero-trailer', hero);
  if (t) { t.innerHTML = ''; t.classList.remove('play'); }
  const s = hero && $('.hero-slide.active', hero);
  if (s) s.classList.remove('playing');
}
async function playHeroTrailer(hero) {
  const slide = hero && $('.hero-slide.active', hero);
  if (!slide) return;
  const id = slide.dataset.id, med = slide.dataset.media;
  if (!id) return;
  const key = `${med}:${id}`;
  let k = heroTrailerCache[key];
  if (k === undefined) {
    k = await api(`/${med}/${id}/videos?language=en-US`).then(r => {
      const v = (r.results || []).find(x => x.type === 'Trailer' && x.site === 'YouTube');
      return v ? v.key : null;
    }).catch(() => null);
    heroTrailerCache[key] = k;
  }
  /* the mouse may have left while we fetched — never inject into a cleared slide */
  if (hero.dataset.hov !== '1' || !slide.classList.contains('active')) return;
  const box = $('.hero-trailer', slide);
  if (!box) return;
  if (!k) { box.classList.remove('play'); return; }
  if (!box.innerHTML) {
    /* modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0 + the CSS cover-crop
       keep YouTube's logo, title bar and controls out of view — it plays as a
       native full-bleed trailer, not an embedded YT player */
    box.innerHTML = `<iframe src="${ytTrailer(k)}" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture" tabindex="-1"></iframe>`;
  }
  box.classList.add('play');
  slide.classList.add('playing');
}
function bindHeroCarousel() {
  const hero = $('#heroCaro'); if (!hero) return;
  const slides = $$('.hero-slide', hero); if (!slides.length) return;
  const dots = $$('.hero-dot', hero);
  const canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let idx = 0, timer = null;
  const show = (i) => {
    idx = (i + slides.length) % slides.length;
    slides.forEach((s, k) => {
      s.classList.toggle('active', k === idx);
      /* upgrade only the visible slide to full-res original — keeps the other
         slides light (w1280) so the page doesn't download 6 huge backdrops */
      if (k === idx) {
        const img = $('img.backdrop', s);
        if (img && img.dataset.hi && img.src !== img.dataset.hi) img.src = img.dataset.hi;
      } else {
        const t = $('.hero-trailer', s);
        if (t) { t.innerHTML = ''; t.classList.remove('play'); }
      }
    });
    dots.forEach((d, k) => d.classList.toggle('active', k === idx));
    if (canHover && hero.dataset.hov === '1') playHeroTrailer(hero);
  };
  const next = () => show(idx + 1);
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const start = () => {
    /* never advance the slideshow while the cursor is parked on the hero —
       the hover trailer keeps playing until the cursor moves away (arrows,
       dots and the IntersectionObserver all route through this guard) */
    if (hero.dataset.hov === '1') return;
    stop(); timer = setInterval(next, 6000); heroTimer = timer;
  };
  $('.hero-nav.next', hero)?.addEventListener('click', (e) => { e.stopPropagation(); next(); start(); });
  $('.hero-nav.prev', hero)?.addEventListener('click', (e) => { e.stopPropagation(); show(idx - 1); start(); });
  dots.forEach(d => d.addEventListener('click', () => { show(+d.dataset.i); start(); }));
  hero.addEventListener('mouseenter', () => { stop(); if (canHover) { hero.dataset.hov = '1'; playHeroTrailer(hero); } });
  hero.addEventListener('mouseleave', () => { hero.dataset.hov = '0'; stopHeroTrailer(hero); start(); });
  let tx = 0;
  hero.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; stop(); }, { passive: true });
  hero.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 40) { (dx < 0 ? next() : show(idx - 1)); }
    start();
  }, { passive: true });
  show(0);
  start();
  /* pause the slideshow while it's off-screen — saves compositing while scrolling */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((ents) => ents.forEach(en => en.isIntersecting ? start() : stop()), { threshold: 0.03 });
    io.observe(hero);
  }
}

/* ---------------- Row nav + auto-bind ---------------- */
/* Manual rAF-driven slide: sets scrollLeft directly so it works in every browser
   and can't be fought by scroll-snap or smooth-scroll quirks. */
function slideRow(row, dir) {
  const max = Math.max(0, row.scrollWidth - row.clientWidth);
  const target = clamp(row.scrollLeft + dir * Math.max(240, row.clientWidth * 0.85), 0, max);
  const start = row.scrollLeft, dist = target - start;
  if (!dist) return;
  /* scroll-snap re-snaps on every frame and fights the per-frame scrollLeft
     writes, making the glide sticky/jerky — switch it off for the glide and
     restore it only when the LAST animation finishes (token guard for rapid
     arrow clicks). */
  const tok = (row._glideTok = (row._glideTok || 0) + 1);
  row.style.scrollSnapType = 'none';
  /* duration scales with distance — tiny nudges feel snappy, long scrolls glide */
  const dur = clamp(280 + Math.abs(dist) * 0.45, 280, 700);
  const t0 = performance.now();
  const ease = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    row.scrollLeft = start + dist * ease(p);
    if (p < 1) { requestAnimationFrame(step); return; }
    if (row._glideTok === tok) row.style.scrollSnapType = '';
  };
  requestAnimationFrame(step);
}
/* Show each arrow only when scrolling in that direction is actually possible. */
function updateRowArrows(wrap, row) {
  const max = Math.max(0, (row.scrollWidth || 0) - (row.clientWidth || 0));
  const atEnd = row.scrollLeft >= max - 4;
  $('.row-nav.prev', wrap)?.classList.toggle('off', row.scrollLeft <= 4);
  $('.row-nav.next', wrap)?.classList.toggle('off', atEnd);
}
/* Rows move ONLY via the arrow buttons (like the user wants):
   - mouse-wheel / trackpad horizontal scroll is blocked,
   - no drag-scroll, no touch-scroll of the row itself,
   - arrows appear/disappear based on the actual scroll position. */
const rowData = [];
window.addEventListener('resize', debounce(() => { rowData.forEach(r => { const wrap = r.closest('.row-wrap'); if (wrap) updateRowArrows(wrap, r); }); }, 120));
function bindRowNavs() {
  $$('.row-wrap').forEach(wrap => {
    if (wrap.dataset.navBound) return;
    wrap.dataset.navBound = '1';
    const row = $('.row, .episode-row, .cast-row', wrap); if (!row) return;
    const prev = $('.row-nav.prev', wrap), next = $('.row-nav.next', wrap);
    prev?.addEventListener('click', () => slideRow(row, -1));
    next?.addEventListener('click', () => slideRow(row, 1));
    /* Rows are overflow-x:hidden on desktop (see .row in styles.css), so the
       browser natively ignores every wheel/trackpad left-right gesture — rows
       only move via the arrow buttons. No wheel listener on purpose: a strict
       deltaX guard would also swallow vertical page scroll on diagonal
       trackpad swipes. Phones switch rows to overflow-x:auto + touch swipe. */
    /* keep arrows honest as the row scrolls (also after slideRow animation) */
    row.addEventListener('scroll', () => updateRowArrows(wrap, row), { passive: true });
    rowData.push(row);
    const upd = debounce(() => updateRowArrows(wrap, row), 60);
    new MutationObserver(upd).observe(row, { childList: true, subtree: true });
    updateRowArrows(wrap, row);
  });
}

/* ---------------- Views ---------------- */
const SKELETON_ROW = `<div class="row">${Array.from({ length: 5 }, () => '<div class="card backdrop"><div class="skeleton" style="width:100%;height:100%"></div></div>').join('')}</div>`;
const SKELETON_GRID = `<div class="grid">${Array.from({ length: 10 }, () => '<div class="card grid-card"><div class="skeleton" style="width:100%;height:100%"></div></div>').join('')}</div>`;

function apiWrap(p) { return p.catch(e => { console.error(e); main.innerHTML = `<div class="empty-state"><h3>Something went wrong</h3><p class="muted">${esc(e.message)}. Try again in a moment.</p></div>`; }); }

async function viewHome() {
  main.innerHTML = `<div class="skeleton" style="height:300px;border-radius:20px"></div>${SKELETON_ROW}${SKELETON_ROW}${SKELETON_GRID}`;
  const [trendingMovie, trendingTv, popular, topRated, nowPlaying, upcoming] = await Promise.all([
    api('/trending/movie/day?language=en-US').then(r => r.results).catch(() => []),
    api('/trending/tv/day?language=en-US').then(r => r.results).catch(() => []),
    api('/movie/popular?language=en-US').then(r => r.results).catch(() => []),
    api('/movie/top_rated?language=en-US').then(r => r.results).catch(() => []),
    api('/movie/now_playing?language=en-US').then(r => r.results).catch(() => []),
    api('/movie/upcoming?language=en-US').then(r => r.results).catch(() => []),
  ]);
  const heroItems = [...trendingMovie.map(m => ({ ...m, media_type: 'movie' })), ...trendingTv.map(m => ({ ...m, media_type: 'tv' }))];
  const cont = Object.values(Store.progress.all())
    .filter(p => p && p.duration && p.time > 30 && p.time / p.duration < 0.92)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, 12);
  const recent = cont.length ? [] : Store.history.all().slice(0, 12).map(h => ({
    type: h.type, id: h.id, title: h.title, backdrop_path: h.backdrop,
    season: h.season, episode: h.episode, time: 0, duration: 0, ts: h.ts,
  }));
  const contItems = cont.length ? cont : recent;
  const contTitle = cont.length ? 'Continue Watching' : 'Recently Watched';
  const contRow = contItems.length ? `<section style="margin-bottom:22px">
    <div class="section-head"><h2 class="section-title">${icon('clock')} ${contTitle}</h2><a class="view-all" href="#/history">History →</a></div>
    <div class="row-wrap">
      <button class="row-nav prev" aria-label="Scroll left">${icon('chevL')}</button>
      <button class="row-nav next" aria-label="Scroll right">${icon('chevR')}</button>
      <div class="row scrollbar-hide">${contItems.map(continueCard).join('')}</div>
    </div>
  </section>` : '';
  main.innerHTML = heroCarousel(heroItems) +
    contRow +
    rowSection('Trending Now', trendingMovie, '#/browse/movie?sort=trending') +
    rowSection('Trending TV Shows', trendingTv, '#/browse/tv?sort=trending') +
    rowSection('Popular Movies', popular, '#/browse/movie') +
    gridSection('Top Rated', topRated.slice(0, 10), '#/browse/movie?sort=top_rated') +
    rowSection('Now Playing', nowPlaying, '#/browse/movie?sort=now_playing') +
    rowSection('Upcoming', upcoming, '#/browse/movie?sort=upcoming') +
    '<div id="genreRows"></div>' +
    footerNote();
  bindHeroCarousel();
  bindWatchlistButtons();
  loadGenreRows();
}

/* Extra category rows load right after the main rows — the home page becomes a
   long, browsable scroll where every section is its own category. */
async function loadGenreRows() {
  const box = $('#genreRows'); if (!box) return;
  const out = await Promise.all([
    genreRow('Action', 28),
    genreRow('Sci-Fi & Fantasy', 878),
    genreRow('Comedy', 35),
    genreRow('Horror', 27),
    genreRow('Romance', 10749),
    genreRow('Crime', 80),
    genreRow('Animation', 16),
    genreRow('Documentary', 99),
    genreRow('Drama', 18),
    grossRow(),
    airingRow(),
  ]);
  box.innerHTML = out.join('');
  box.querySelectorAll('section').forEach((s, i) => s.style.animationDelay = (i * 55) + 'ms');
}
async function genreRow(title, gid) {
  const r = await api(`/discover/movie?language=en-US&with_genres=${gid}&sort_by=popularity.desc`).catch(() => null);
  const items = ((r && r.results) || []).slice(0, 16);
  return items.length ? rowSection(title, items, `#/browse/movie?genre=${gid}`) : '';
}
async function grossRow() {
  const r = await api('/discover/movie?language=en-US&sort_by=revenue.desc').catch(() => null);
  const items = ((r && r.results) || []).slice(0, 16);
  return items.length ? rowSection('Highest Grossing', items, '#/browse/movie?sort=revenue') : '';
}
async function airingRow() {
  const r = await api('/tv/airing_today?language=en-US').catch(() => null);
  const items = ((r && r.results) || []).slice(0, 16).map(m => ({ ...m, media_type: 'tv' }));
  return items.length ? rowSection('Airing Today TV', items, '#/browse/tv?sort=on_the_air') : '';
}

function parseQuery(q) { return Object.fromEntries(new URLSearchParams(q || '')); }

async function viewBrowse(params) {
  const type = params.id || 'movie';
  const q = parseQuery(location.hash.split('?')[1]);
  const sort = q.sort || 'popular';
  const genreId = q.genre || '';
  const decade = /^\d{4}$/.test(q.decade || '') ? q.decade : '';
  const simId = /^\d+$/.test(q.id || '') ? q.id : '';
  const anime = q.anime === '1';
  const title = anime ? (type === 'movie' ? 'Anime Movies' : 'Anime Series') : ({ movie: 'Movies', tv: 'TV Shows' }[type] || 'Browse');
  const movieSorts = [['popular', 'Popular'], ['trending', 'Trending'], ['top_rated', 'Top Rated'], ['now_playing', 'Now Playing'], ['upcoming', 'Upcoming']];
  const tvSorts = [['popular', 'Popular'], ['trending', 'Trending'], ['top_rated', 'Top Rated'], ['on_the_air', 'On The Air']];
  const sorts = type === 'movie' ? movieSorts : tvSorts;
  const qsExtra = `${genreId ? '&genre=' + genreId : ''}${decade ? '&decade=' + decade : ''}${anime ? '&anime=1' : ''}`;
  main.innerHTML = `<h1 class="page-title" style="margin-bottom:18px">${esc(title)}${decade ? ` <span class="muted" style="font-size:15px;font-weight:500">· ${decade}s</span>` : ''}</h1>
    <div class="filter-tabs">${sorts.map(s => `<button class="chip ${sort === s[0] ? 'active' : ''}" onclick="location.hash='#/browse/${type}?sort=${s[0]}${qsExtra}'">${s[1]}</button>`).join('')}</div>
    ${decade ? `<div class="filter-tabs"><a class="chip active" href="#/browse/${type}?decade=${decade}${anime ? '&anime=1' : ''}">${icon('calendar','inline')} ${decade}s</a><a class="chip" href="#/browse/${type}${anime ? '?anime=1' : ''}">✕ Clear decade</a></div>` : ''}
    <div id="genreChips" class="filter-tabs"></div>
    <div id="gridWrap">${SKELETON_GRID}</div>
    <div class="load-more-wrap" id="loadMoreWrap"></div>`;
  api(`/genre/${type}/list?language=en-US`).then(g => {
    $('#genreChips').innerHTML = `<button class="chip ${!genreId ? 'active' : ''}" onclick="location.hash='#/browse/${type}?sort=${sort}${decade ? '&decade=' + decade : ''}${anime ? '&anime=1' : ''}'">All</button>` +
      g.genres.map(x => `<button class="chip ${genreId == x.id ? 'active' : ''}" onclick="location.hash='#/browse/${type}?sort=${sort}&genre=${x.id}${decade ? '&decade=' + decade : ''}${anime ? '&anime=1' : ''}'">${esc(x.name)}</button>`).join('');
    if (!genreId && !decade && !anime) {
      const tiles = `<div class="genre-tiles">${g.genres.map(x => `<a class="genre-tile" href="#/browse/${type}?sort=${sort}&genre=${x.id}">${icon('film')} ${esc(x.name)}</a>`).join('')}</div>`;
      $('#gridWrap').insertAdjacentHTML('beforebegin', tiles);
    }
  }).catch(() => {});
  /* ---- paginated loader (Load More on every category) ---- */
  let page = 1, totalPages = 1, busy = false;
  const grid = $('#gridWrap');
  const buildPath = (p) => {
    const sortBy = sort === 'trending' ? 'popularity.desc' : sort === 'top_rated' ? 'vote_average.desc' : sort === 'now_playing' ? 'primary_release_date.desc' : sort === 'upcoming' ? 'primary_release_date.asc' : sort === 'on_the_air' ? 'first_air_date.desc' : 'popularity.desc';
    const pg = `&page=${p}`;
    if (anime) return `/discover/${type}?language=en-US&with_original_language=ja&with_genres=16&sort_by=${sortBy}${pg}`;
    if (genreId) return `/discover/${type}?language=en-US&with_genres=${genreId}&sort_by=${sortBy}${decade ? '&' + dateRange(type, decade) : ''}${pg}`;
    if (decade) return `/discover/${type}?language=en-US&${dateRange(type, decade)}&sort_by=${sortBy}${pg}`;
    if (sort === 'revenue') return `/discover/${type}?language=en-US&sort_by=revenue.desc${pg}`;
    if (sort === 'similar' && simId) return `/${type}/${simId}/similar?language=en-US&page=${p}`;
    if (sort === 'trending') return `/trending/${type}/day?language=en-US${pg}`;
    return `/${type}/${sort}?language=en-US${pg}`;
  };
  const renderMore = () => {
    const wrap = $('#loadMoreWrap');
    if (!wrap) return;
    wrap.innerHTML = (page < totalPages) ? `<button class="btn btn-glass load-more" id="loadMoreBtn">${icon('next')} Load More</button>
      <div class="muted" style="font-size:12px;margin-top:10px;text-align:center">Page ${page} of ${totalPages}</div>` : (totalPages > 1 ? `<div class="muted" style="text-align:center;font-size:13px">You've reached the end 🎬</div>` : '');
    $('#loadMoreBtn')?.addEventListener('click', async () => {
      if (busy) return; busy = true;
      const btn = $('#loadMoreBtn'); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="mini-spin"></span> Loading…'; }
      const data = await api(buildPath(page + 1)).catch(() => null);
      busy = false;
      if (!data) { const b2 = $('#loadMoreBtn'); if (b2) { b2.disabled = false; b2.innerHTML = `${icon('next')} Load More`; toast('Could not load more — try again'); } return; }
      if (data.results?.length) {
        page += 1; totalPages = data.total_pages || totalPages;
        grid.insertAdjacentHTML('beforeend', `<div class="grid">${data.results.map(m => backdropCard({ ...m, media_type: type })).join('')}</div>`);
        bindWatchlistButtons();
      }
      renderMore();
    });
  };
  const first = await apiWrap(api(buildPath(1)));
  if (first && first.results) {
    totalPages = first.total_pages || 1; page = 1;
    grid.innerHTML = `<div class="grid">${first.results.map(m => backdropCard({ ...m, media_type: type })).join('')}</div>`;
    renderMore();
  }
  bindWatchlistButtons();
}

/* ---------------- CATEGORIES PAGE ---------------- */
function dateRange(type, decade) {
  const df = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  const start = Number(decade);
  return `${df}.lte=${start + 9}-12-31${start >= 1980 ? `&${df}.gte=${decade}-01-01` : ''}`;
}
const CAT_GRADS = [
  'linear-gradient(135deg,#0a84ff,#5e5ce6)',
  'linear-gradient(135deg,#ff375f,#ff9f0a)',
  'linear-gradient(135deg,#30d158,#0a84ff)',
  'linear-gradient(135deg,#ffd60a,#ff375f)',
  'linear-gradient(135deg,#5e5ce6,#ff375f)',
  'linear-gradient(135deg,#0a84ff,#30d158)',
  'linear-gradient(135deg,#bf5af2,#0a84ff)',
  'linear-gradient(135deg,#ff9f0a,#ff375f)',
  'linear-gradient(135deg,#ff6482,#ff9f0a)',
  'linear-gradient(135deg,#64d2ff,#5e5ce6)',
];
async function viewCategories(params) {
  const type = params.type || 'movie';
  main.innerHTML = `<h1 class="page-title" style="margin-bottom:18px">${icon('browse','inline')} Categories</h1>
    <div class="filter-tabs" id="catTabs">
      <a class="chip ${type === 'movie' ? 'active' : ''}" href="#/categories/movie">${icon('movie','inline')} Movies</a>
      <a class="chip ${type === 'tv' ? 'active' : ''}" href="#/categories/tv">${icon('tv','inline')} TV Shows</a>
    </div>
    <div id="catBody"><div class="skeleton" style="height:220px;border-radius:20px"></div></div>`;
  const g = await api(`/genre/${type}/list?language=en-US`).catch(() => ({ genres: [] }));
  const genres = g.genres || [];
  /* One UNIQUE backdrop per genre: a hit movie tagged with several genres (Action +
     Adventure + Sci-Fi…) used to repeat the same art across 2–3 tiles. We walk down
     each genre's results until we find an image no other tile has claimed yet. */
  const used = new Set();
  const arts = await Promise.all(genres.slice(0, 18).map(async (x) => {
    const r = await api(`/discover/${type}?language=en-US&with_genres=${x.id}&sort_by=popularity.desc`).catch(() => null);
    const results = (r && r.results) || [];
    for (const m of results) {
      if (m && m.backdrop_path && !used.has(m.backdrop_path)) { used.add(m.backdrop_path); return IMG_CARD(m.backdrop_path); }
    }
    return (results[0] && results[0].backdrop_path) ? IMG_CARD(results[0].backdrop_path) : '';
  }));
  const decades = [['2020', '2020s'], ['2010', '2010s'], ['2000', '2000s'], ['1990', '1990s'], ['1980', '1980s'], ['1970', '1970s & older']];
  /* one unique backdrop per decade too — pulled from a real hit of that era */
  const dArts = await Promise.all(decades.map(async ([d]) => {
    const r = await api(`/discover/${type}?language=en-US&${dateRange(type, d)}&sort_by=popularity.desc`).catch(() => null);
    const results = (r && r.results) || [];
    for (const m of results) {
      if (m && m.backdrop_path && !used.has(m.backdrop_path)) { used.add(m.backdrop_path); return IMG_CARD(m.backdrop_path); }
    }
    return (results[0] && results[0].backdrop_path) ? IMG_CARD(results[0].backdrop_path) : '';
  }));
  $('#catBody').innerHTML =
    `<h2 class="section-title" style="margin-bottom:14px">${icon('film','inline')} Browse by genre</h2>` +
    `<div class="cat-grid">${genres.map((x, i) => `<a class="cat-tile" style="background:${CAT_GRADS[i % CAT_GRADS.length]}" href="#/browse/${type}?genre=${x.id}" title="${esc(x.name)}">${arts[i] ? `<img class="cat-bg" src="${arts[i]}" alt="" loading="lazy" decoding="async">` : ''}<span class="cat-shade"></span><span class="cat-name">${esc(x.name)}</span><span class="cat-arrow">${icon('chevR')}</span></a>`).join('')}</div>` +
    `<h2 class="section-title" style="margin:30px 0 14px">${icon('calendar','inline')} Browse by decade</h2>` +
    `<div class="cat-grid cat-decades">${decades.map(([d, label], i) => `<a class="cat-tile cat-decade" href="#/browse/${type}?decade=${d}">${dArts[i] ? `<img class="cat-bg" src="${dArts[i]}" alt="" loading="lazy" decoding="async">` : ''}<span class="cat-shade"></span><span class="cat-name">${label}</span><span class="cat-arrow">${icon('chevR')}</span></a>`).join('')}</div>` +
    `<h2 class="section-title" style="margin:30px 0 14px">${icon('sparkles','inline')} Quick picks</h2>` +
    `<div class="filter-tabs">${[['popular', 'Popular'], ['trending', 'Trending'], ['top_rated', 'Top Rated'], type === 'movie' ? ['now_playing', 'Now Playing'] : ['on_the_air', 'On The Air']].map(s => `<a class="chip" href="#/browse/${type}?sort=${s[0]}">${s[1]}</a>`).join('')}</div>`;
}

/* ---------------- ANIME PAGE ---------------- */
async function viewAnime() {
  main.innerHTML = `<h1 class="page-title" style="margin-bottom:18px">${icon('sparkles', 'inline')} Anime</h1>
    <div class="filter-tabs" id="animeTabs">
      <button class="chip active" data-aw="mix">All</button>
      <button class="chip" data-aw="series">Series</button>
      <button class="chip" data-aw="movies">Movies</button>
    </div>
    <div id="animeBody">${SKELETON_ROW}${SKELETON_ROW}${SKELETON_GRID}</div>`;
  const load = async (aw) => {
    const body = $('#animeBody');
    body.innerHTML = SKELETON_ROW + SKELETON_ROW + SKELETON_GRID;
    const [series, movies, top] = await Promise.all([
      api('/discover/tv?language=en-US&with_original_language=ja&with_genres=16&sort_by=popularity.desc&page=1').then(r => r.results).catch(() => []),
      api('/discover/movie?language=en-US&with_original_language=ja&with_genres=16&sort_by=popularity.desc&page=1').then(r => r.results).catch(() => []),
      api('/discover/tv?language=en-US&with_original_language=ja&with_genres=16&sort_by=vote_average.desc&vote_count.gte=200&page=1').then(r => r.results).catch(() => []),
    ]);
    const rows = [];
    if (aw !== 'movies') rows.push(rowSection('Trending Anime Series', series.map(m => ({ ...m, media_type: 'tv' })), '#/browse/tv?anime=1'));
    if (aw !== 'series') rows.push(rowSection('Anime Movies', movies.map(m => ({ ...m, media_type: 'movie' })), '#/browse/movie?anime=1'));
    rows.push(gridSection('Top Rated Anime', top.slice(0, 10).map(m => ({ ...m, media_type: 'tv' })), '#/browse/tv?sort=top_rated&anime=1'));
    body.innerHTML = rows.join('') + footerNote();
    bindWatchlistButtons();
  };
  $('#animeTabs').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    $$('.chip', $('#animeTabs')).forEach(c => c.classList.toggle('active', c === b));
    load(b.dataset.aw);
  });
  load('mix');
}

const searchPreview = async () => {
  const box = $('#searchResults'); if (!box) return;
  box.innerHTML = SKELETON_GRID;
  const [tm, tt, pop] = await Promise.all([
    api('/trending/movie/day?language=en-US').then(r => r.results).catch(() => []),
    api('/trending/tv/day?language=en-US').then(r => r.results).catch(() => []),
    api('/movie/popular?language=en-US').then(r => r.results).catch(() => []),
  ]);
  const mix = [...tm.map(m => ({ ...m, media_type: 'movie' })), ...tt.map(m => ({ ...m, media_type: 'tv' }))]
    .filter(m => m.poster_path || m.backdrop_path);
  box.innerHTML =
    `<h2 class="section-title" style="margin:6px 0 14px">${icon('sparkles', 'inline')} Trending right now</h2>` +
    (mix.length ? `<div class="grid">${mix.slice(0, 18).map(m => backdropCard(m)).join('')}</div>`
      : `<div class="empty-state">${icon('search')}<h3>Nothing trending yet</h3><p class="muted">Start typing to find movies and shows.</p></div>`) +
    `<h2 class="section-title" style="margin:30px 0 14px">${icon('star', 'inline')} Popular picks</h2>` +
    `<div class="grid">${pop.slice(0, 12).map(m => backdropCard(m)).join('')}</div>`;
  bindWatchlistButtons();
};
async function viewSearch() {
  const q = parseQuery(location.hash.split('?')[1]);
  const query = (q.q || '').trim();
  main.innerHTML = `<div class="search-bar">${icon('search')}<input id="searchInput" placeholder="Search movies, TV shows..." value="${esc(query)}" autofocus autocomplete="off" spellcheck="false" name="dx-search"></div>
    <div class="filter-tabs" id="searchTabs">
      <button class="chip active" data-st="multi">All</button>
      <button class="chip" data-st="movie">Movies</button>
      <button class="chip" data-st="tv">TV Shows</button>
    </div>
    <div id="searchResults">${query ? SKELETON_GRID : `<div class="skeleton" style="height:300px;border-radius:20px"></div>`}</div>`;
  const input = $('#searchInput'), tabs = $('#searchTabs');
  let st = 'multi';
  const run = debounce(async () => {
    const v = input.value.trim();
    if (!v) { history.replaceState(null, '', '#/search'); searchPreview(); return; }
    history.replaceState(null, '', '#/search?q=' + encodeURIComponent(v));
    $('#searchResults').innerHTML = SKELETON_GRID;
    const path = st === 'multi' ? '/search/multi' : `/search/${st}`;
    const r = await api(`${path}?query=${encodeURIComponent(v)}&language=en-US&include_adult=false`).catch(() => ({ results: [] }));
    const items = r.results.filter(x => (x.media_type === 'movie' || x.media_type === 'tv') && (x.poster_path || x.backdrop_path));
    $('#searchResults').innerHTML = items.length ? `<div class="grid">${items.map(m => backdropCard(m)).join('')}</div>` : `<div class="empty-state">${icon('search')}<h3>No results for “${esc(v)}”</h3><p class="muted">Try a different title or filter.</p></div>`;
    bindWatchlistButtons();
  }, 350);
  input.addEventListener('input', run);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    st = b.dataset.st; $$('.chip', tabs).forEach(c => c.classList.toggle('active', c === b)); run();
  });
  if (query) { input.value = query; run(); } else searchPreview();
}

async function viewDetail(params) {
  const type = params.id ? (location.hash.includes('/tv/') ? 'tv' : 'movie') : 'movie';
  const id = params.id;
  main.innerHTML = `<div class="skeleton" style="height:340px;border-radius:20px"></div>${SKELETON_ROW}`;
  const [d, credits, similar] = await Promise.all([
    api(`/${type}/${id}?language=en-US&append_to_response=external_ids,videos`).catch(() => null),
    api(`/${type}/${id}/credits?language=en-US`).catch(() => ({ cast: [] })),
    api(`/${type}/${id}/similar?language=en-US`).then(r => r.results).catch(() => []),
  ]);
  if (!d) { main.innerHTML = `<div class="empty-state"><h3>Title not found</h3></div>`; return; }
  const title = d.title || d.name;
  const trailer = (d.videos?.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
  /* phones on Data Saver skip the background trailer — the hero falls back to
     the normal still backdrop, exactly like a title without a trailer */
  const skipTrailer = !!(navigator.connection && navigator.connection.saveData);
  const cast = credits.cast?.slice(0, 14) || [];
  const genres = (d.genres || []).map(g => g.name);
  const meta = [];
  if (d.vote_average) meta.push(`<span class="rate">${icon('star', 'inline')} ${Number(d.vote_average).toFixed(1)}</span>`);
  if (d.release_date) meta.push(`<span>${year(d.release_date)}</span>`); else if (d.first_air_date) meta.push(`<span>${year(d.first_air_date)}</span>`);
  if (d.runtime) meta.push(`<span>${d.runtime}m</span>`);
  if (d.number_of_seasons) meta.push(`<span>${d.number_of_seasons} seasons</span>`);
  if (d.status) meta.push(`<span>${esc(d.status)}</span>`);
  const wl = Store.watchlist.has(Number(id), type);
  main.innerHTML = `
    <div class="detail-hero${trailer && !skipTrailer ? ' has-trailer' : ''}">
      ${d.backdrop_path ? `<img class="backdrop" src="${IMG_HERO(d.backdrop_path)}" alt="">` : ''}
      ${trailer && !skipTrailer ? `<div class="detail-trailer"><iframe src="${ytTrailer(trailer.key)}" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture" tabindex="-1"></iframe></div>` : ''}
      <div class="shade"></div>
      <div class="content">
        <div class="poster">${d.poster_path ? `<img src="${IMG_POSTER(d.poster_path)}" alt="">` : ''}</div>
        <div class="detail-info">
          <h1>${esc(title)}</h1>
          <div class="meta">${meta.join('<span class="dot"></span>')}</div>
          ${genres.length ? `<div class="genres">${genres.map(g => `<span class="chip" style="padding:4px 12px;font-size:12px">${esc(g)}</span>`).join('')}</div>` : ''}
          <p class="overview">${esc(d.overview || '')}</p>
          <div class="detail-actions">
            <a class="btn btn-primary" href="#/watch/${type}/${id}${type === 'tv' && d.seasons?.length ? '/1/1' : ''}">${icon('play')} Watch Now</a>
            ${trailer ? `<button class="btn btn-glass" id="trailerBtn">${icon('film')} Trailer</button>` : ''}
            <button class="btn btn-ghost wl-btn" data-m='${esc(JSON.stringify({ id: Number(id), media_type: type, title, name: d.name, poster_path: d.poster_path, backdrop_path: d.backdrop_path, vote_average: d.vote_average, release_date: d.release_date, first_air_date: d.first_air_date }))}'>${icon('bookmark')} <span>${wl ? 'In Watchlist ✓' : 'Watchlist'}</span></button>
          </div>
        </div>
      </div>
    </div>
    ${type === 'tv' ? `<div id="tvSection"><div class="detail-panel"><div class="skeleton" style="height:160px"></div></div></div>` : ''}
    ${cast.length ? `<div class="detail-panel"><h3>${icon('users')} Cast <span class="muted" style="font-size:12px;font-weight:500">(${cast.length})</span></h3><div class="row-wrap cast-wrap">
      <button class="row-nav prev" aria-label="Scroll left">${icon('chevL')}</button>
      <button class="row-nav next" aria-label="Scroll right">${icon('chevR')}</button>
      <div class="cast-row scrollbar-hide">${cast.map(c => `<div class="cast-card"><div class="avatar">${c.profile_path ? `<img loading="lazy" src="${IMG_FACE(c.profile_path)}" alt="">` : `<i class="ph-play ph-sm">${icon('users')}</i>`}</div><div class="name">${esc(c.name || '')}</div><div class="role">${esc(c.character || '')}</div></div>`).join('')}</div>
    </div></div>` : ''}
    ${rowSection('Similar Titles', similar, `#/browse/${type}?sort=similar&id=${id}`)}
    ${footerNote()}`;
  bindWatchlistButtons();
  $('#trailerBtn')?.addEventListener('click', () => { const v = trailer; if (v) window.open(`https://www.youtube.com/embed/${v.key}?autoplay=1`, '_blank', 'noopener'); });
  if (type === 'tv') renderTvSection(d, id);
}

async function renderTvSection(d, id) {
  const seasons = (d.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
  const el = $('#tvSection'); if (!el) return;
  if (!seasons.length) { el.innerHTML = ''; return; }
  let seasonNum = seasons[0].season_number;
  el.innerHTML = `<div class="detail-panel"><h3>${icon('tv')} Episodes</h3>
    <div class="season-tabs scrollbar-hide">${seasons.map(s => `<button class="chip" data-s="${s.season_number}">Season ${s.season_number}</button>`).join('')}</div>
    <div class="row-wrap">
      <button class="row-nav prev" aria-label="Scroll left">${icon('chevL')}</button>
      <button class="row-nav next" aria-label="Scroll right">${icon('chevR')}</button>
      <div class="episode-row scrollbar-hide" id="epRow"><div class="skeleton" style="width:240px;height:170px"></div></div>
    </div></div>`;
  const loadSeason = async (n) => {
    seasonNum = n; $$('.season-tabs .chip').forEach(c => c.classList.toggle('active', +c.dataset.s === n));
    const row = $('#epRow'); row.innerHTML = '<div class="skeleton" style="width:268px;height:190px"></div><div class="skeleton" style="width:268px;height:190px"></div>';
    const data = await api(`/tv/${id}/season/${n}?language=en-US`).catch(() => null);
    if (!data) { row.innerHTML = '<div class="muted" style="padding:20px">Could not load episodes.</div>'; return; }
    row.innerHTML = data.episodes.map(ep => episodeCard(ep, id, n)).join('');
  };
  el.querySelector('.season-tabs').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) loadSeason(+b.dataset.s); });
  loadSeason(seasonNum);
}

function episodeCard(ep, tvId, season) {
  const key = `tv-${tvId}`;
  const p = Store.progress.get(key);
  const watched = p && p.season === season && p.episode === ep.episode_number && p.duration && p.time / p.duration > 0.85;
  return `<div class="ep-card" onclick="location.hash='#/watch/tv/${tvId}/${season}/${ep.episode_number}'">
    <div class="thumb">
      ${ep.still_path ? `<div class="card-ph shimmer"><i class="ph-play">${icon('play')}</i></div><img ${IMG_FADE} src="${IMG_CARD(ep.still_path)}" alt="">` : `<div class="card-ph"><i class="ph-play">${icon('play')}</i></div>`}
      <div class="num">E${ep.episode_number}</div>
      ${watched ? '<div class="watched">✓ Watched</div>' : ''}
    </div>
    <div class="body">
      <div class="t">${esc(ep.name || `Episode ${ep.episode_number}`)}</div>
      <div class="d">${ep.runtime ? ep.runtime + 'm · ' : ''}${esc(ep.overview || '')}</div>
    </div>
  </div>`;
}

/* ---------------- WATCH / PLAYER ---------------- */
async function viewWatch(params) {
  const isTv = params.season !== undefined;
  const id = params.id;
  const season = isTv ? +params.season : null;
  const episode = isTv ? +params.episode : null;
  const type = isTv ? 'tv' : 'movie';
  main.innerHTML = `<div id="playerShell" class="player-wrap" style="margin-bottom:22px"><div class="spinner" style="margin:180px auto"></div></div>
    <div id="watchMeta"><div class="skeleton" style="height:40px;width:60%"></div></div><div id="watchServers"></div><div id="watchEps"></div>${footerNote()}`;
  const [d, servers] = await Promise.all([
    api(`/${type}/${id}?language=en-US`).catch(() => null),
    fetch(`/api/stream?type=${type}&id=${id}${isTv ? `&season=${season}&episode=${episode}` : ''}`).then(r => r.json()).catch(() => ({ servers: [] })),
  ]);
  const title = d ? (d.title || d.name) : (type === 'tv' ? 'TV Show' : 'Movie');
  const epName = isTv ? (season + '×' + episode) : '';
  $('#watchMeta').innerHTML = `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:18px">
    <a class="btn btn-ghost" style="padding:8px 12px" href="#/${type}/${id}">${icon('arrowL')}</a>
    <div><h1 class="page-title" style="font-size:22px">${esc(title)}</h1>${epName ? `<div class="muted" style="font-size:13px">Season ${season} · Episode ${episode}</div>` : `<div class="muted" style="font-size:13px">${esc(d?.tagline || '')}</div>`}</div>
  </div>`;
  if (isTv) Store.history.add({ key: `tv-${id}`, type: 'tv', id: +id, title, poster: d?.poster_path, backdrop: d?.backdrop_path, season, episode, ts: Date.now() });
  else Store.history.add({ key: `movie-${id}`, type: 'movie', id: +id, title, poster: d?.poster_path, backdrop: d?.backdrop_path, ts: Date.now() });
  if (isTv) renderWatchEpisodes(d, id, season, episode);

  const srv = $('#watchServers');
  if (!servers.servers || !servers.servers.length) {
    srv.innerHTML = `<div class="detail-panel"><h3>${icon('gear')} Servers</h3><div class="muted">No playable sources found for this title right now. Try again later.</div></div>`;
    return;
  }
  srv.innerHTML = `<div class="detail-panel"><h3>${icon('gear')} Servers</h3><div class="server-tabs scrollbar-hide" id="srvTabs">${servers.servers.map((s, i) => `<button class="server-tab ${s.rec ? 'active' : ''}" data-i="${i}">${s.rec ? '<span class="srv-dot rec"></span>' : ''}<span>${esc(s.name)}</span>${s.rec ? '<em class="srv-pick">★</em>' : ''}</button>`).join('')}</div>
    <div class="muted" style="font-size:12px;margin-top:10px">Ad-safe mode is on (no pop-ups/redirects). If a server refuses to play, just pick another one below — all ${servers.servers.length} are here.</div></div>`;
  const tabs = $('#srvTabs');
  /* ---- Player: liquid-glass chrome + unique loading ring + error card (no black screen) ---- */
  const playerChrome = (s, loadingTxt) => `
    <div class="pl-top">
      <div class="pl-title"><span class="pl-mark">${LOGO_MARK.replace('logo-mark', 'pl-mark-svg')}</span><span class="pl-t">${esc(title)}</span>${epName ? `<em class="pl-ep">${esc(epName)}</em>` : ''}</div>
      <div class="pl-right"><span class="pl-badge">${esc(s.name)}</span>${isTv ? `<button class="pl-fs" id="plEps" title="Episodes">${icon('tv')}<b>${esc(epName || 'Eps')}</b></button>` : ''}<button class="pl-fs" id="plFs" title="Fullscreen">${icon('fullscreen')}</button></div>
    </div>
    <div class="pl-loading" id="plLoading"><div class="pl-ring"><i></i></div><div class="pl-loading-txt">${esc(loadingTxt || 'Connecting to ' + s.name)}</div></div>
    <div class="pl-err" id="plErr">
      <div class="pl-err-ico">${icon('info')}</div>
      <div class="pl-err-title">This server may be blocked or unavailable</div>
      <div class="pl-err-sub">Some servers are geo-blocked or busy — switch to another one below, or retry in a moment.</div>
      <button class="btn btn-primary" id="plRetry">${icon('play')} Retry</button>
    </div>
    <!-- sandbox: players boot fully (scripts/same-origin/forms/popups/modals/
         downloads/presentation) while allow-top-navigation stays OFF so an
         embed can never redirect the whole tab away from the site. Popups may
         open but stay INSIDE the sandbox (no allow-popups-to-escape-sandbox)
         — popunder ads can't escape to real tabs. The pl-shield swallows stray
         clicks for the first seconds, and the servers were chosen ad-light. -->
    <div class="pl-shield" aria-hidden="true"></div>
    <iframe id="plFrame" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups allow-downloads allow-modals allow-orientation-lock" allowfullscreen allow="autoplay; fullscreen; encrypted-media; picture-in-picture" referrerpolicy="no-referrer" scrolling="no" title="Video player" loading="eager"></iframe>`;
  let loadTimer = null;
  const select = (i) => {
    const s = servers.servers[i];
    $$('.server-tab', tabs).forEach(t => t.classList.toggle('active', +t.dataset.i === i));
    const shell = $('#playerShell');
    shell.innerHTML = playerChrome(s);
    const frame = $('#plFrame'), err = $('#plErr'), loading = $('#plLoading');
    let loaded = false;
    const hideLoading = () => { loading.style.opacity = '0'; loading.style.pointerEvents = 'none'; };
    const showErr = () => { err.classList.add('show'); hideLoading(); };
    clearTimeout(loadTimer);
    /* an embed that loads a page is “playing” — hide the ring; if nothing loads
       in 14s, show the animated error card instead of a silent black screen */
    frame.addEventListener('load', () => { loaded = true; hideLoading(); const sh = $('.pl-shield', shell); if (sh) sh.remove(); });
    loadTimer = setTimeout(() => { if (!loaded) showErr(); }, 14000);
    $('#plRetry')?.addEventListener('click', (e) => { e.stopPropagation(); err.classList.remove('show'); hideLoading(); const f = $('#plFrame'); f.src = f.src; loadTimer = setTimeout(() => { if (!loaded) showErr(); }, 14000); });
    $('#plFs')?.addEventListener('click', (e) => { e.stopPropagation(); const el = shell; if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); });
    $('#plEps')?.addEventListener('click', (e) => { e.stopPropagation(); epOpen && epCloseFn ? epCloseFn() : openEpOverlay(); });
    /* set src only after the load listener is attached (no race → loading ring
       always resolves to either the video or the error card) */
    frame.src = s.url;
  };
  tabs.addEventListener('click', e => { const b = e.target.closest('.server-tab'); if (b) select(+b.dataset.i); });
  /* default to the recommended (★) server if one is flagged, else the first */
  const recIdx = servers.servers.findIndex(s => s.rec);
  select(recIdx >= 0 ? recIdx : 0);
  bindWatchlistButtons();
  /* streamex-style: the episode side panel is already open on TV shows.
     Guarded by getElementById so navigating away within the delay can't
     scroll-lock the next page (overlay is torn down by the router). */
  if (isTv) setTimeout(() => { if (document.getElementById('epOverlay')) window.openEpOverlay && window.openEpOverlay(); }, 800);
}

/* ---- Overlayed scrollable episode list (like streamex.sh): a glass drawer that
        opens from the player's Episodes button, with season tabs + vertical list ---- */
let epSeasons = [];
let epCache = {};
let epOpen = false;
let epCloseFn = null;
/* single global Escape handler — registered once, routed through epCloseFn so
   navigating between TV shows never stacks duplicate keydown listeners */
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && epCloseFn) epCloseFn(); });
/* side panel closes when clicking anywhere outside it (or the Episodes button) */
document.addEventListener('click', (e) => {
  if (epOpen && epCloseFn && !e.target.closest('.ep-overlay') && !e.target.closest('#plEps')) epCloseFn();
});
function buildEpOverlay(id, curSeason, curEpisode) {
  if (document.getElementById('epOverlay')) return;
  const ov = document.createElement('div');
  ov.className = 'ep-overlay';
  ov.id = 'epOverlay';
  ov.innerHTML = `<div class="ep-panel">
    <div class="ep-head">
      <div class="ep-head-l">${icon('tv')} <span>Episodes</span></div>
      <div class="ep-head-r">
        <div class="season-tabs scrollbar-hide" id="epSeasons"></div>
        <button class="ep-close" id="epClose" aria-label="Close">${icon('x')}</button>
      </div>
    </div>
    <div class="ep-list scrollbar-hide" id="epList"><div class="skeleton" style="height:90px;margin-bottom:10px"></div><div class="skeleton" style="height:90px;margin-bottom:10px"></div></div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => { ov.classList.remove('open'); epOpen = false; epCloseFn = null; document.body.classList.remove('ep-open'); };
  epCloseFn = close;
  $('#epClose', ov).addEventListener('click', close);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  const tabs = $('#epSeasons', ov);
  tabs.innerHTML = epSeasons.map(s => `<button class="chip ${s.season_number === curSeason ? 'active' : ''}" data-s="${s.season_number}">S${s.season_number}</button>`).join('');
  const list = $('#epList', ov);
  const loadSeason = async (n, highlight) => {
    $$('.chip', tabs).forEach(c => c.classList.toggle('active', +c.dataset.s === n));
    if (epCache[n]) { list.innerHTML = epCache[n]; }
    else {
      list.innerHTML = '<div class="skeleton" style="height:90px;margin-bottom:10px"></div><div class="skeleton" style="height:90px;margin-bottom:10px"></div>';
      const data = await api(`/tv/${id}/season/${n}?language=en-US`).catch(() => null);
      if (!data) { list.innerHTML = '<div class="ep-empty">Could not load episodes.</div>'; return; }
      epCache[n] = data.episodes.map(ep => epOverlayItem(ep, id, n, curSeason, curEpisode)).join('');
      list.innerHTML = epCache[n];
    }
    if (highlight) {
      const cur = list.querySelector('.ep-item.current');
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };
  tabs.addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) loadSeason(+b.dataset.s, false); });
  window.openEpOverlay = () => {
    if (!ov.isConnected) return; /* router already tore the panel down (navigated away) */
    ov.classList.add('open'); epOpen = true; document.body.classList.add('ep-open');
    loadSeason(curSeason, true);
  };
}
function epOverlayItem(ep, tvId, season, curSeason, curEpisode) {
  const current = season === curSeason && ep.episode_number === curEpisode;
  const p = Store.progress.get(`tv-${tvId}`);
  const watched = p && p.season === season && p.episode === ep.episode_number && p.duration && p.time / p.duration > 0.85;
  const href = `#/watch/tv/${tvId}/${season}/${ep.episode_number}`;
  return `<a class="ep-item ${current ? 'current' : ''} ${watched ? 'watched' : ''}" href="${href}">
    <div class="ep-thumb">
      ${ep.still_path ? `<div class="card-ph shimmer"></div><img loading="lazy" decoding="async" src="${IMG_CARD(ep.still_path)}" alt="" onload="this.classList.add('loaded')" onerror="this.previousElementSibling.classList.remove('shimmer')">` : `<div class="card-ph"><i class="ph-play ph-sm">${icon('play')}</i></div>`}
      <span class="ep-num">${String(ep.episode_number).padStart(2, '0')}</span>
      ${watched ? '<span class="ep-done">✓</span>' : ''}
    </div>
    <div class="ep-info">
      <div class="ep-t">${esc(ep.name || `Episode ${ep.episode_number}`)}</div>
      <div class="ep-d">${ep.runtime ? esc(ep.runtime) + 'm · ' : ''}${esc(ep.air_date || '')}${ep.vote_average ? ' · ★ ' + Number(ep.vote_average).toFixed(1) : ''}</div>
      <div class="ep-o">${esc(ep.overview || '')}</div>
    </div>
    ${current ? '<span class="ep-cur">Playing</span>' : `<span class="ep-go">${icon('play')}</span>`}
  </a>`;
}
async function renderWatchEpisodes(d, id, curSeason, curEpisode) {
  const seasons = (d.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
  epSeasons = seasons;
  buildEpOverlay(id, curSeason, curEpisode);
  const el = $('#watchEps'); if (!el || !seasons.length) { el?.remove(); return; }
  el.innerHTML = `<div class="detail-panel"><h3>${icon('tv')} Episodes</h3>
    <div class="season-tabs scrollbar-hide">${seasons.map(s => `<button class="chip ${s.season_number === curSeason ? 'active' : ''}" data-s="${s.season_number}">Season ${s.season_number}</button>`).join('')}</div>
    <div class="row-wrap">
      <button class="row-nav prev" aria-label="Scroll left">${icon('chevL')}</button>
      <button class="row-nav next" aria-label="Scroll right">${icon('chevR')}</button>
      <div class="episode-row scrollbar-hide" id="watchEpRow"></div>
    </div></div>`;
  const row = $('#watchEpRow');
  const load = async (n) => {
    $$('.season-tabs .chip', el).forEach(c => c.classList.toggle('active', +c.dataset.s === n));
    row.innerHTML = '<div class="skeleton" style="width:240px;height:170px"></div>';
    const data = await api(`/tv/${id}/season/${n}?language=en-US`).catch(() => null);
    if (!data) { row.innerHTML = ''; return; }
    row.innerHTML = data.episodes.map(ep => episodeCard(ep, id, n)).join('');
    if (n === curSeason) {
      const idx = data.episodes.findIndex(e => e.episode_number === curEpisode);
      if (idx >= 0 && row.children[idx] && row.children[idx].scrollIntoView) row.children[idx].scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    }
  };
  el.querySelector('.season-tabs').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) load(+b.dataset.s); });
  load(curSeason);
}

/* ---------------- WATCHLIST / HISTORY / LEGAL ---------------- */
async function viewWatchlist() {
  const items = Store.watchlist.all();
  main.innerHTML = `<h1 class="page-title" style="margin-bottom:20px">${icon('bookmark', 'inline')} Watchlist</h1>` +
    (items.length ? `<div class="grid">${items.map(m => backdropCard({ ...m, media_type: m.type })).join('')}</div>` : `<div class="empty-state">${icon('bookmark')}<h3>Your watchlist is empty</h3><p class="muted">Tap the bookmark icon on any title to save it here.</p></div>`) +
    footerNote();
  bindWatchlistButtons();
}

function viewHistory() {
  const items = Store.history.all();
  main.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px"><h1 class="page-title">${icon('clock', 'inline')} History</h1>${items.length ? `<button class="btn btn-ghost" id="clearHist">Clear history</button>` : ''}</div>` +
    (items.length ? `<div class="grid">${items.map(h => {
      const m = { ...h, media_type: h.type, title: h.title, name: h.title };
      const href = h.type === 'tv' ? `#/watch/tv/${h.id}/${h.season}/${h.episode}` : `#/watch/movie/${h.id}`;
      return `<div class="card grid-card" onclick="location.hash='${href.slice(1)}'">${h.backdrop ? `<img loading="lazy" src="${IMG_CARD(h.backdrop)}" alt="">` : ''}<div class="glass"><div class="title">${esc(h.title)}</div><div class="sub">${h.type === 'tv' ? `S${h.season}·E${h.episode}` : 'Movie'} · ${new Date(h.ts).toLocaleDateString()}</div></div>${progressFlag(m)}</div>`;
    }).join('')}</div>` : `<div class="empty-state">${icon('clock')}<h3>No watch history yet</h3><p class="muted">Titles you watch will appear here.</p></div>`) +
    footerNote();
  $('#clearHist')?.addEventListener('click', () => { Store.history.clear(); viewHistory(); toast('History cleared'); });
}

function viewLegal() {
  main.innerHTML = `<div class="detail-panel" style="max-width:760px;margin:0 auto">
    <h1 class="page-title" style="margin-bottom:16px">Legal / DMCA</h1>
    <p class="muted" style="line-height:1.8;font-size:14px">
      ${esc(SITE_NAME)} does not host, store, upload or distribute any media files, video content or copyrighted material on its servers.
      All content displayed is streamed from third-party providers, and ${esc(SITE_NAME)} merely links to publicly available media.
      <br><br>If you believe any content infringes your copyright, contact us with the details and the offending links will be removed promptly.
      <br><br>This project is for educational purposes. Users are responsible for complying with the laws of their jurisdiction.
    </p></div>`;
}

/* ---------------- WATCHLIST BUTTONS ---------------- */
function bindWatchlistButtons() {
  $$('.wl-btn').forEach(b => {
    b.onclick = (e) => { e.stopPropagation(); e.preventDefault();
      let m; try { m = JSON.parse(b.dataset.m); } catch { return; }
      const added = Store.watchlist.toggle(m);
      const span = b.querySelector('span'); if (span) span.textContent = added ? 'In Watchlist ✓' : 'Watchlist';
      b.closest('.card')?.classList.toggle('in-wl', added);
      toast(added ? 'Added to watchlist' : 'Removed from watchlist');
    };
  });
}

/* ---------------- Ctrl+K glass search popup ---------------- */
const searchCache = new Map();
let popOpen = false;
function buildSearchPopup() {
  if (document.getElementById('searchOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'search-overlay';
  overlay.id = 'searchOverlay';
  overlay.innerHTML = `<div class="search-pop">
    <div class="pop-bar">${icon('search')}<input id="popInput" placeholder="Search movies & TV shows…" autocomplete="off" spellcheck="false"><button class="pop-close" id="popClose" aria-label="Close">${icon('x')}</button></div>
    <div class="pop-results" id="popResults"><div class="pop-hint">Type to search — try “inception” or “game of thrones”</div></div>
    <div class="pop-footer">${icon('gear')} <kbd>Ctrl</kbd>+<kbd>K</kbd> to open · <kbd>Esc</kbd> to close · <kbd>Enter</kbd> to view all</div>
  </div>`;
  document.body.appendChild(overlay);
  const input = $('#popInput');
  const results = $('#popResults');
  let timer = null, items = [], focused = -1;
  const close = () => { overlay.classList.remove('open'); popOpen = false; };
  $('#popClose', overlay).addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  const render = (list) => {
    focused = -1;
    results.innerHTML = list.length ? '' : '<div class="pop-hint">No results — try a different title</div>';
    list.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'pop-item' + (i === focused ? ' focused' : '');
      el.innerHTML = `<div class="thumb shimmer-thumb">${it.poster_path ? `<img src="${IMG_POSTER(it.poster_path)}" alt="" decoding="async" onload="this.classList.add('loaded')" onerror="this.classList.add('img-err'); this.parentElement.classList.remove('shimmer-thumb')">` : `<i class="ph-play ph-sm">${icon('play')}</i>`}</div>
        <div class="info"><div class="t">${esc(it.title || it.name || '')}</div><div class="d">${it.release_date ? year(it.release_date) : it.first_air_date ? year(it.first_air_date) : ''}${it.vote_average ? ' · ★ ' + Number(it.vote_average).toFixed(1) : ''}</div></div>
        <span class="type-chip ${it.media_type === 'tv' ? 'tv' : ''}">${it.media_type === 'tv' ? 'TV' : 'MOVIE'}</span>`;
      el.addEventListener('click', () => { close(); navigate(`#/${it.media_type}/${it.id}`); });
      results.appendChild(el);
    });
    items = list;
  };
  const run = async () => {
    const q = input.value.trim();
    if (q.length < 2) { render([]); results.innerHTML = '<div class="pop-hint">Type to search — try “inception” or “game of thrones”</div>'; return; }
    if (searchCache.has(q)) { render(searchCache.get(q)); return; }
    const r = await api(`/search/multi?query=${encodeURIComponent(q)}&language=en-US&include_adult=false`).catch(() => ({ results: [] }));
    const list = r.results.filter(x => (x.media_type === 'movie' || x.media_type === 'tv') && (x.poster_path || x.backdrop_path)).slice(0, 8);
    searchCache.set(q, list); if (searchCache.size > 60) searchCache.clear();
    render(list);
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 220); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      focused = (focused + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      $$('.pop-item', results).forEach((el, i) => el.classList.toggle('focused', i === focused));
    } else if (e.key === 'Enter') {
      const q = input.value.trim();
      if (focused >= 0 && items[focused]) { close(); navigate(`#/${items[focused].media_type}/${items[focused].id}`); }
      else if (q) { close(); navigate(`#/search?q=${encodeURIComponent(q)}`); }
    } else if (e.key === 'Escape') { close(); }
  });
  window.openSearch = () => { overlay.classList.add('open'); popOpen = true; setTimeout(() => input.focus(), 60); input.select?.(); };
}
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (typeof window.openSearch !== 'function') buildSearchPopup();
    window.openSearch();
  }
});

/* ---------------- BOOT ---------------- */
function boot() {
  buildSearchPopup();
  new MutationObserver(() => bindRowNavs()).observe(main, { childList: true, subtree: true });
  router();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
