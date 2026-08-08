import { JSDOM } from 'jsdom';
import fs from 'fs';
import { execSync } from 'child_process';

// regenerate gated HTML from the CURRENT built worker
execSync(`node -e "
import('./worker.js?v=' + Date.now()).then(m => {
  const w = m.default;
  const env = { SITE_NAME: 'KnightXstream', TURNSTILE_SITE_KEY: '0x4AAAAAAACtest0000000000', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' };
  const ctx = { waitUntil: () => {} };
  w.fetch(new Request('http://x.dev/'), env, ctx).then(r => r.text()).then(h => { require('fs').writeFileSync('/tmp/gateflow_src.html', h); });
});
"`, { cwd: '/home/adi24_2011_own/freebuff/streamex-clone' });
await new Promise(r => setTimeout(r, 500));

const full = fs.readFileSync('/tmp/gateflow_src.html', 'utf8');

// locate the gate script (first <script> after the kxGate div)
const gs = full.indexOf('<div id="kxGate">');
const after = full.slice(gs);
const scStart = after.indexOf('<script>');
const scEnd = after.indexOf('</script>', scStart) + '</script>'.length;
const gateScript = after.slice(scStart, scEnd);
console.log('gate script length:', gateScript.length);
console.log('has reload:', gateScript.includes('location.reload'));
console.log('has getCookie:', gateScript.includes('getCookie'));

// minimal page: gate markup (without style, to keep it light) + the gate script
const gateDiv = after.slice(0, after.indexOf('<style>'));
const mini = `<!DOCTYPE html><html><body>${gateDiv}${gateScript}<div id="appBoots"></div></body></html>`;

let reloaded = 0, replaced = 0, errors = [];
const dom = new JSDOM(mini, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.matchMedia = () => ({ matches: false, addEventListener: () => {} });
try { w.location.reload = () => { reloaded++; }; } catch (e) { errors.push('reload stub: ' + e.message); }
try { w.location.replace = () => { replaced++; }; } catch (e) { errors.push('replace stub: ' + e.message); }
// cookie works natively in jsdom for document.cookie
// Turnstile mock fires the callback
w.turnstile = {
  render(el) {
    const cb = el.getAttribute && el.getAttribute('data-callback');
    setTimeout(() => {
      if (cb && typeof w[cb] === 'function') w[cb]('FAKE_TOKEN_123');
      else errors.push('callback ' + cb + ' not a function at render');
    }, 30);
  },
  reset() {},
};
w.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/api/gate/verify')) return { ok: true, json: async () => ({ ok: true }) };
  if (u.includes('/api/siteconfig')) return { ok: true, json: async () => ({}) };
  return { ok: false, json: async () => ({}) };
};
w.Headers = class {}; w.Request = class {};

await new Promise(r => setTimeout(r, 2000));

console.log('--- result ---');
console.log('reloaded:', reloaded);
console.log('replaced:', replaced);
console.log('cookie:', d.cookie);
console.log('errors:', errors.length ? errors : 'none');
console.log('gate div in DOM:', !!d.getElementById('kxGate'));
