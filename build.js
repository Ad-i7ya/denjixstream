// Build: inlines src/styles.css + src/app.js into the worker → single deployable worker.js
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

const styles = read('src/styles.css');
const appjs  = read('src/app.js');
let core = read('src/worker-core.js');

// Inline CSS + JS as safe JSON string literals (handles backticks, ${}, newlines).
// NOTE: must use FUNCTION replacements — String.replace(…, string) interprets
// $ patterns in the replacement ($$ → $, $&, $', …) and would corrupt the JS!
core = core.replace("'/*__STYLES__*/'", () => JSON.stringify(styles));
core = core.replace("'/*__APP_JS__*/'",  () => JSON.stringify(appjs));
core = core.replace("'/*__BUILD__*/'",   () => JSON.stringify(Date.now().toString(36)));

// Inline the developer Telegram profile photos as base64 (assets/kyren.jpg, assets/denji.jpg)
const b64 = (p) => readFileSync(join(root, 'assets', p)).toString('base64');
core = core.replace("'/*__AVATAR_KYREN__*/'", () => JSON.stringify(b64('kyren.jpg')));
core = core.replace("'/*__AVATAR_DENJI__*/'", () => JSON.stringify(b64('denji.jpg')));

writeFileSync(join(root, 'worker.js'), core);

console.log(`✓ worker.js built (${(core.length / 1024).toFixed(1)} KB) — paste this single file into Cloudflare Workers`);
