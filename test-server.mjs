// Local test harness — runs the built worker.js on http://localhost:8787
// Usage:  node test-server.mjs   (after running:  node build.js)
import { createServer } from 'http';
import worker from './worker.js';

const env = { SITE_NAME: 'DenjiXstream' }; // add TMDB_API_KEY here to override
const ctx = { waitUntil: () => {} };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:8787');
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) headers.set(k, v);
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await new Promise((resolve) => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); });
    }
    const request = new Request(url, { method: req.method, headers, body });
    const response = await worker.fetch(request, env, ctx);
    const outHeaders = {};
    response.headers.forEach((v, k) => { outHeaders[k] = v; });
    res.writeHead(response.status, outHeaders);
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Worker error: ' + (err && err.message));
  }
});

server.listen(8787, () => console.log('▶ CineGlass running at http://localhost:8787'));
