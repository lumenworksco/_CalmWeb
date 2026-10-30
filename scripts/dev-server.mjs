#!/usr/bin/env node
// Local development server: one origin serving the site (docs/), the admin (admin/ at /admin/),
// the real ingest Worker code (/api, /f/<slug>) and an in-memory fake of Supabase (/supabase).
// No Docker, no accounts, no secrets. Data lives in memory and is gone when you stop it.
//   node scripts/dev-server.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/src/index.js';
import { createFake, DEV_SERVICE_KEY } from './fake-supabase.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 3400);
const fake = createFake();
const env = { SUPABASE_URL: `http://localhost:${port}/supabase`, SUPABASE_SERVICE_KEY: DEV_SERVICE_KEY, CHALLENGE_SECRET: 'dev-only-secret', MIN_FILL_MS: process.env.MIN_FILL_MS ?? '1500' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.pdf': 'application/pdf', '.csv': 'text/csv' };

// The Worker calls fetch() for Supabase; route those to the in-memory fake.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  return url.startsWith(env.SUPABASE_URL) ? fake(new Request(url, init)) : realFetch(input, init);
};

function serveFile(res, file) {
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res); return true;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
  let out;
  if (url.pathname.startsWith('/supabase/')) out = await fake(request);
  else if (url.pathname.startsWith('/api/')) out = await worker.fetch(request, env);
  else if (/^\/f\/[a-z0-9-]+\/?$/.test(url.pathname)) { const f = path.join(root, 'docs/f/index.html'); res.writeHead(200, { 'content-type': TYPES['.html'] }); return fs.createReadStream(f).pipe(res); }
  if (out) { res.writeHead(out.status, Object.fromEntries(out.headers)); return res.end(Buffer.from(await out.arrayBuffer())); }

  let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
  const candidates = p.startsWith('/admin/') ? [path.join(root, p.replace(/^\/admin\//, 'admin/'))] : [];
  candidates.push(path.join(root, 'docs', p));
  if (candidates.some((f) => serveFile(res, f))) return;
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
}).listen(port, () => console.log(`CalmWeb dev server: http://localhost:${port}   admin: http://localhost:${port}/admin/  (login code 000000)`));
