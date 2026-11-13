// HTTP adapter: static files + JSON API. Listens only where config says (127.0.0.1 by default).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';
import { createRouter, errorBody, httpError } from './router.js';
import { jobRoutes } from './routes/jobs.js';
import { recordRoutes } from './routes/records.js';
import { savedRoutes } from './routes/saved.js';
import { settingsRoutes } from './routes/settings.js';
import { tiktokRoutes } from './routes/tiktok.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const MAX_BODY = 1_000_000;

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw httpError('invalid_input', 'Dữ liệu gửi lên quá lớn');
    chunks.push(c);
  }
  const s = Buffer.concat(chunks).toString('utf8');
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    throw httpError('invalid_input', 'JSON không hợp lệ');
  }
}

/** @param {ReturnType<typeof import('../app.js').createApp>} app @param {{publicDir?: string}} [o] */
export function createHttpServer(app, { publicDir = path.join(ROOT, 'web') } = {}) {
  const router = createRouter([...jobRoutes, ...recordRoutes, ...savedRoutes, ...settingsRoutes, ...tiktokRoutes]);
  const root = path.resolve(publicDir);

  function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  }

  function serveStatic(req, res, pathname) {
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      rel = '/';
    }
    let file = path.resolve(root, '.' + (rel === '/' ? '/index.html' : rel));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    // Always ask, rarely download: the browser revalidates each file and gets 304 unless it changed on disk,
    // so an updated app is picked up on the next reload without a stale-cache step.
    const st = fs.statSync(file);
    const etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
    const headers = { etag, 'cache-control': 'no-cache' };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream', headers);
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    // Aborted when the client goes away before the answer is sent; long handlers (TikTok scrape) stop on it.
    const ac = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) ac.abort();
    });
    try {
      if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
      const { route, params, pathMatched } = router.match(req.method || 'GET', url.pathname);
      if (!route) throw httpError('not_found', pathMatched ? 'Sai phương thức' : 'Không có API này');
      const body = ['POST', 'PATCH', 'DELETE'].includes(req.method || '') ? await readBody(req) : {};
      const out = await route.handler({ app, ws: app.ws, params, query: url.searchParams, body, signal: ac.signal, headers: req.headers });
      if (out?.__raw) return send(res, 200, out.body, out.type, out.headers);
      send(res, 200, out ?? { ok: true });
    } catch (e) {
      if (ac.signal.aborted) return; // nobody is listening any more
      const { status, body } = errorBody(e);
      if (status === 500) console.error(e);
      send(res, status, body);
    }
  });
}
