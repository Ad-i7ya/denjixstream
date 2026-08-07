# Testing

## Local server (smoke test)

The worker is a plain ES module, so it runs under Node with zero dependencies:

```bash
node build.js            # compile src/* → worker.js
node test-server.mjs     # serves the site at http://localhost:8787
```

`test-server.mjs` wraps the worker's `fetch()` in a minimal HTTP server. Smoke-test
these flows:

- [ ] Home renders rows; hero slideshow advances; hover plays a trailer (desktop)
- [ ] Search page + `Ctrl+K` popup work; the `Ctrl K` chip opens the popup
- [ ] A movie detail page: backdrop, cast, similar, episodes for TV
- [ ] Watch page: player loads the ★ server, shield swallows stray taps, the
      **"Enable player"** button releases it
- [ ] Phone width (`<768 px`): bottom nav, drawer sidebar, no horizontal overflow
- [ ] Watchlist / History persist after reload

## jsdom harness (player & ad-defense logic)

The browser-level ad-defense behavior (shield, popup nets) can be verified headlessly
with jsdom + the served HTML:

```js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('/tmp/home.html', 'utf8');          // curl localhost:8787
const dom = new JSDOM(html, { url: 'http://localhost/#/watch/movie/27205',
  runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.scrollTo = () => {};  w.matchMedia = () => ({ matches: false });
w.HTMLElement.prototype.scrollIntoView = () => {};
w.fetch = async (u) => ({ ok: true, json: async () => ({ results: [] }) });

setTimeout(() => {
  const shield = d.querySelector('.pl-shield');
  const chip   = d.querySelector('.pl-shield-chip');
  const tap = (el) => el.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  tap(shield); tap(shield);                                  // stray taps…
  console.assert(!shield.classList.contains('released'), 'shield must stay armed');
  const click = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  chip.dispatchEvent(click);                                 // deliberate enable
  console.assert(shield.classList.contains('released'), 'chip tap must release');
  console.assert(click.defaultPrevented, 'releasing tap must be swallowed');
  console.log('shield: OK');
  process.exit(0);
}, 2500);
```

## Static verification (fast)

```bash
node --check src/app.js && node --check src/worker-core.js
node build.js && node --check worker.js
node -e "JSON.parse(require('fs').readFileSync('package.json')); console.log('package.json OK')"
```

## Server audit (before adding any embed)

```bash
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0'
curl -sL -A "$UA" 'https://<embed>/movie/27205' -o /tmp/audit.html
grep -oiE 'window\.open|popunder|ad\.onclick|SMARTLINK' /tmp/audit.html   # must be empty
grep -oiE 'target.?=.?_blank' /tmp/audit.html                              # must be empty
```

Also scan the page's JS bundles the same way (see [SECURITY.md](SECURITY.md)).

## Release checklist

See [CONTRIBUTING.md](../CONTRIBUTING.md#release-checklist).
