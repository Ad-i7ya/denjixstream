# Contributing to KnightXstream

Thanks for wanting to help! This is a small, self-contained project — a single-file
Cloudflare Worker with a vanilla-JS frontend. Keep changes small, consistent and
tested.

## Ground rules

- **Never commit secrets.** `.deploy.env` holds real tokens and is gitignored —
  keep it that way. Use `.env.example` as the documented template.
- **Never add a proxy route.** The worker intentionally exposes only
  `/api/tmdb/*` and `/api/stream`.
- **Servers must pass the ad audit.** Only add embed servers whose HTML *and* JS
  bundles carry no `window.open` / popunder / `_blank` ad triggers. See
  [docs/SECURITY.md](docs/SECURITY.md) for the exact checklist. Popup-cloaking
  embeds are rejected — they cannot be blocked from a sandbox-free page.
- **Preserve the design system.** The Apple liquid-glass aesthetic lives in
  `src/styles.css` variables — extend them, don't hard-code new colors.

## Workflow

```bash
cd knightxstream
node build.js            # compile src/* → worker.js
node test-server.mjs     # serve at http://localhost:8787
```

1. Make your change in `src/` (never hand-edit `worker.js` — it's generated).
2. Rebuild: `node build.js` (this also refreshes the build tag).
3. Verify the site locally with `node test-server.mjs`.
4. For player/ad-defense logic, run the jsdom harness — see
   [docs/TESTING.md](docs/TESTING.md).
5. Commit with a clear, conventional message:
   `feat: …`, `fix: …`, `perf: …`, `docs: …`, `chore: …`.
6. Open a pull request against `main`.

## Release checklist

- [ ] `node build.js` completes cleanly
- [ ] `node --check worker.js` passes
- [ ] Local smoke test on `http://localhost:8787` (home, search, detail, watch, phone width)
- [ ] Server list verified against the audit checklist
- [ ] `node deploy.mjs` pushed to GitHub and Cloudflare
- [ ] CHANGELOG.md updated
