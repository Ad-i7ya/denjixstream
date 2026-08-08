// One-shot deployment: GitHub push + Cloudflare Workers upload (no wrangler needed)
//
//   node build.js                          # build worker.js first
//   GITHUB_TOKEN=... node deploy.mjs --github
//   CF_API_TOKEN=... CF_ACCOUNT_ID=... node deploy.mjs --cloudflare
//   (or set all + SITE_NAME + CF_WORKER_NAME and run:  node deploy.mjs)
//
// Tokens are read from the environment only. Rotate them after use.
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));

// Auto-load .deploy.env (gitignored) so deploys never need prompts.
// Real env vars always win over the file.
const envFile = join(root, '.deploy.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] && m[2] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
const doGithub = args.includes('--github') || args.length === 0;
const doCloudflare = args.includes('--cloudflare') || args.length === 0;

const CF_API = 'https://api.cloudflare.com/client/v4';
const CF_WORKER_NAME = process.env.CF_WORKER_NAME || 'knightxstream';
const SITE_NAME = process.env.SITE_NAME || 'KnightXstream';
const REPO_NAME = process.env.REPO_NAME || 'knightxstream';

/* ---------------- GitHub ---------------- */
async function deployGithub() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN env var missing');
  console.log('→ GitHub: verifying token…');
  const who = await (await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}` } })).json();
  if (!who.login) throw new Error('GitHub token invalid: ' + (who.message || ''));
  console.log(`→ GitHub: authenticated as ${who.login}`);

  const existing = await fetch(`https://api.github.com/repos/${who.login}/${REPO_NAME}`, { headers: { Authorization: `Bearer ${token}` } });
  if (existing.status !== 200) {
    console.log(`→ GitHub: creating repo "${REPO_NAME}"…`);
    const created = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: REPO_NAME, private: false, description: `${SITE_NAME} — free movie & TV streaming site (single-file Cloudflare Worker)` }),
    });
    if (created.status === 403) {
      throw new Error('Repo creation denied (403). Fine-grained PATs need "Administration" permission to create repos — or just create the repo on github.com first and re-run (it will push updates).');
    }
    if (created.status !== 201) throw new Error('Could not create repo: ' + (await created.text()));
  } else {
    console.log(`→ GitHub: repo "${REPO_NAME}" already exists — pushing updates`);
  }

  console.log('→ GitHub: committing and pushing…');
  execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'inherit' });
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'inherit' });
  try { execFileSync('git', ['-c', 'user.email=deploy@cineglass.local', '-c', 'user.name=Deploy', 'commit', '-m', 'Deploy CineGlass worker'], { cwd: root, stdio: 'inherit' }); } catch (_) { console.log('→ GitHub: nothing new to commit'); }
  const remote = `https://x-access-token:${token}@github.com/${who.login}/${REPO_NAME}.git`;
  try { execFileSync('git', ['remote', 'remove', 'origin'], { cwd: root, stdio: 'ignore' }); } catch (_) {}
  try { execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root, stdio: 'inherit' }); } catch (_) {}
  execFileSync('git', ['push', '-u', 'origin', 'main', '--force'], { cwd: root, stdio: 'inherit' });
  console.log(`✓ GitHub: pushed → https://github.com/${who.login}/${REPO_NAME}`);
}

/* ---------------- Cloudflare ---------------- */
async function deployCloudflare() {
  const token = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  if (!token || !accountId) throw new Error('CF_API_TOKEN and CF_ACCOUNT_ID env vars required');
  const code = readFileSync(join(root, 'worker.js'), 'utf8');
  if (!code.includes('export default')) throw new Error('worker.js not built — run `node build.js` first');

  console.log(`→ Cloudflare: uploading "${CF_WORKER_NAME}"…`);
  const form = new FormData();
  // metadata as a plain string part (no filename) — the known-good Cloudflare pattern.
  // Bindings = the worker's env vars, set automatically so the site needs nothing else.
  const bindings = [
    { name: 'TMDB_API_KEY', type: 'plain_text', text: process.env.TMDB_API_KEY || '8265bd1679663a7ea12ac168da84d2e8' },
    { name: 'SITE_NAME', type: 'plain_text', text: SITE_NAME },
    /* Cloudflare Turnstile human-verification gate — both keys together
       activate it; with neither (or only one) the gate stays inert and the
       site behaves exactly as before. Get keys: dash.cloudflare.com →
       Turnstile → Add Site (hostname: your workers.dev domain). */
    ...(process.env.TURNSTILE_SITE_KEY ? [{ name: 'TURNSTILE_SITE_KEY', type: 'plain_text', text: process.env.TURNSTILE_SITE_KEY }] : []),
    ...(process.env.TURNSTILE_SECRET_KEY ? [{ name: 'TURNSTILE_SECRET_KEY', type: 'secret_text', text: process.env.TURNSTILE_SECRET_KEY }] : []),
  ];
  /* shared analytics KV namespace (created by deploy-admin.mjs in
     knightxstream-admin) — without this the beacon /api/siteconfig
     gracefully degrade to no-ops */
  if (process.env.KNIGHTX_KV_ID) bindings.push({ name: 'KNIGHTX_KV', type: 'kv_namespace', namespace_id: process.env.KNIGHTX_KV_ID });
  form.append('metadata', JSON.stringify({ main_module: 'worker.js', compatibility_date: '2024-09-23', bindings }));
  form.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');
  const res = await fetch(`${CF_API}/accounts/${accountId}/workers/scripts/${CF_WORKER_NAME}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const out = await res.json();
  if (!res.ok || !out.success) throw new Error('Cloudflare upload failed: ' + JSON.stringify(out.errors || out));
  console.log(`✓ Cloudflare: deployed "${CF_WORKER_NAME}"`);

  // enable the workers.dev subdomain route (dashboard does this automatically)
  console.log('→ Cloudflare: enabling workers.dev route…');
  const sub = await fetch(`${CF_API}/accounts/${accountId}/workers/scripts/${CF_WORKER_NAME}/subdomain`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  });
  const subOut = await sub.json();
  if (!subOut.success) console.log('  (route enable skipped: ' + JSON.stringify(subOut.errors || subOut).slice(0, 120) + ')');

  const sd = await fetch(`${CF_API}/accounts/${accountId}/workers/subdomain`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
  const subdomain = sd?.result?.subdomain || '<your-subdomain>';
  console.log(`  → LIVE: https://${CF_WORKER_NAME}.${subdomain}.workers.dev`);
  console.log('  Set variables: Workers → ' + CF_WORKER_NAME + ' → Settings → Variables → TMDB_API_KEY / SITE_NAME');
}

(async () => {
  try {
    if (doGithub) await deployGithub();
    if (doCloudflare) await deployCloudflare();
    console.log('\nAll done ✓');
  } catch (err) {
    console.error('\n✗ ' + err.message);
    process.exit(1);
  }
})();
