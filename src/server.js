import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';
import { createApp } from './app.js';
import { METRICS, metricLabel } from './core/metrics/definitions.js';
import { researchMarkdown, channelMarkdown, commentsMarkdown } from './core/report/markdown.js';
import { toCsv } from './core/report/csv.js';

const app = createApp();
const { port: PORT, host: HOST } = app.config;
const PUBLIC = path.join(ROOT, 'public');
const WS = app.ws;
// Workspace-bound shorthands used by the routes below (replaced by http/routes in Task 11).
const records = { list: (k, l) => app.store.records.list(WS, k, l), get: (id) => app.store.records.get(WS, id), remove: (id) => app.store.records.remove(WS, id), counts: () => app.store.records.counts(WS) };
const saved = { list: (k) => app.store.saved.list(WS, k), keys: () => app.store.saved.keys(WS), put: (...a) => app.store.saved.put(WS, ...a), note: (...a) => app.store.saved.note(WS, ...a), remove: (...a) => app.store.saved.remove(WS, ...a) };
const settingsStore = { all: app.settings, set: (o) => app.store.settings.set(WS, o) };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const json = (res, body, status = 200) => send(res, status, body);
const download = (res, name, body, type) => send(res, 200, body, type, { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` });

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

const slug = (s) => String(s || 'export').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50) || 'export';
const stamp = () => new Date().toISOString().slice(0, 10);

const VIDEO_COLS = [
  { key: 'title', label: 'Tiêu đề' },
  { key: 'url', label: 'Link' },
  { key: 'channelTitle', label: 'Kênh' },
  { key: 'channelSubs', label: 'Sub kênh' },
  { key: 'views', label: 'View' },
  { key: 'outlierScore', label: metricLabel('outlierScore') },
  { key: 'channelMedianViews', label: metricLabel('channelMedianViews') },
  { key: 'viewSub', label: metricLabel('viewSub') },
  { key: 'vph', label: metricLabel('vph') },
  { key: 'viewsPerDay', label: metricLabel('viewsPerDay') },
  { key: 'likes', label: 'Like' },
  { key: 'durationSec', label: 'Dài (giây)' },
  { key: 'age', label: 'Tuổi (ngày)' },
  { key: 'publishedAt', label: 'Ngày đăng' },
  { key: 'published', label: 'Đăng (YouTube ghi)' },
  { label: 'Từ khoá', get: (v) => (v.queries || []).join('; ') },
];
const CHANNEL_COLS = [
  { key: 'title', label: 'Kênh' },
  { key: 'handle', label: 'Handle' },
  { key: 'url', label: 'Link' },
  { key: 'subs', label: 'Sub' },
  { key: 'videoCount', label: 'Số video' },
  { key: 'totalViews', label: 'Tổng view' },
  { key: 'medianViews', label: 'View trung vị 30 video' },
  { key: 'viewSubRatio', label: 'View trung vị / sub' },
  { key: 'views7d', label: 'View video đăng 7 ngày' },
  { key: 'views30d', label: 'View video đăng 30 ngày' },
  { key: 'uploadsPerWeek', label: 'Video/tuần' },
  { key: 'lastUploadDays', label: 'Đăng gần nhất (ngày)' },
  { key: 'country', label: 'Quốc gia' },
  { key: 'joined', label: 'Ngày tạo kênh' },
];
const COMMENT_COLS = [
  { key: 'text', label: 'Comment' },
  { key: 'likes', label: 'Like' },
  { key: 'replies', label: 'Trả lời' },
  { key: 'published', label: 'Đăng' },
  { label: 'Là trả lời', get: (c) => (c.isReply ? 'Có' : '') },
  { label: 'Câu hỏi', get: (c) => (c.question ? 'Có' : '') },
  { key: 'videoTitle', label: 'Video' },
];

// Routes: [method, regex, handler(req, res, match, body, url)]
const runner = app.runner;
runner.start();

/** Job as the web UI sees it: small, no big results (those live in /records). */
function jobView(j) {
  const inline = j.result?.inline ? j.result : null;
  return {
    id: j.id, kind: j.kind, title: j.title, status: j.status, params: j.params,
    progress: j.progress || { step: 'Đang chờ', done: 0, total: 0 },
    error: j.error, resultId: j.record_id,
    result: j.status === 'succeeded' ? inline || { id: j.record_id } : null,
    startedAt: j.started_at, endedAt: j.finished_at,
  };
}

/** @type {Array<[string, RegExp, (...a: any[]) => any]>} */
const routes = [
  ['POST', /^\/api\/jobs\/(\w+)$/, async (req, res, m, body) => {
    const title = body.keywords || body.topic || body.input || body.seed || body.ideas || body.videos || m[1];
    let job;
    try {
      job = runner.enqueue(WS, m[1], body, String(title).slice(0, 80));
    } catch (e) {
      return json(res, { error: e.message }, e.code === 'invalid_input' ? 400 : 500);
    }
    const { id, reused } = job;
    json(res, { id, reused });
  }],
  ['POST', /^\/api\/jobs\/(\d+)\/cancel$/, (req, res, m) => {
    runner.cancel(Number(m[1]));
    json(res, { ok: true });
  }],
  ['GET', /^\/api\/jobs$/, (req, res) => json(res, runner.list(WS).map(jobView))],
  ['GET', /^\/api\/jobs\/(\d+)$/, (req, res, m) => {
    const j = runner.get(Number(m[1]));
    if (!j) return json(res, { error: 'Không thấy tác vụ' }, 404);
    json(res, jobView(j));
  }],
  ['GET', /^\/api\/records$/, (req, res, m, b, url) => json(res, records.list(url.searchParams.get('kind'), Number(url.searchParams.get('limit')) || 50))],
  ['GET', /^\/api\/records\/(\d+)$/, (req, res, m) => {
    const r = records.get(Number(m[1]));
    r ? json(res, r) : json(res, { error: 'Không thấy' }, 404);
  }],
  ['DELETE', /^\/api\/records\/(\d+)$/, (req, res, m) => {
    records.remove(Number(m[1]));
    json(res, { ok: true });
  }],
  ['GET', /^\/api\/records\/(\d+)\/export\.(md|csv)$/, (req, res, m, b, url) => {
    const r = records.get(Number(m[1]));
    if (!r) return json(res, { error: 'Không thấy' }, 404);
    const name = `${slug(r.title)}-${stamp()}`;
    const what = url.searchParams.get('what');
    if (m[2] === 'md') {
      const md = r.kind === 'research' ? researchMarkdown(r.data) : r.kind === 'channel_analysis' ? channelMarkdown(r.data) : r.kind === 'comments' ? commentsMarkdown(r.data) : '```json\n' + JSON.stringify(r.data, null, 2) + '\n```\n';
      return url.searchParams.get('inline') ? send(res, 200, md, 'text/markdown; charset=utf-8') : download(res, `${name}.md`, md, 'text/markdown; charset=utf-8');
    }
    let csv;
    if (r.kind === 'channel_search') csv = toCsv(r.data.channels, CHANNEL_COLS);
    else if (r.kind === 'comments') csv = toCsv(r.data.comments.map((c) => ({ ...c, videoTitle: r.data.video.title })), COMMENT_COLS);
    else if (r.kind === 'research' && what === 'comments') csv = toCsv([...(r.data.comments?.insights.top || [])], COMMENT_COLS);
    else if (r.kind === 'idea_check' && r.data.results[0]?.stats) csv = toCsv(r.data.results.filter((x) => !x.error), [
      { key: 'keyword', label: 'Từ khoá' }, { key: 'overall', label: 'Điểm tổng' }, { key: 'volume', label: 'Volume' }, { key: 'competition', label: 'Competition' },
      { label: 'View cao nhất', get: (x) => x.stats.highestViews }, { label: 'View TB', get: (x) => Math.round(x.stats.avgViews ?? 0) }, { label: 'Sub TB', get: (x) => Math.round(x.stats.avgSubs ?? 0) },
      { label: 'Mới 7 ngày', get: (x) => `${x.stats.added7d}/${x.stats.results}` }, { label: 'CC', get: (x) => `${x.stats.ccCount ?? '–'}/${x.stats.results}` }, { label: 'Tuổi TB (ngày)', get: (x) => Math.round(x.stats.avgAgeDays ?? 0) },
    ]);
    else if (r.kind === 'keywords') csv = toCsv(r.data.list, [{ key: 'keyword', label: 'Từ khoá' }, { key: 'hits', label: 'Số lần xuất hiện' }, { key: 'bestRank', label: 'Thứ hạng' }]);
    else csv = toCsv(r.data.videos || [], VIDEO_COLS);
    download(res, `${name}.csv`, csv, 'text/csv; charset=utf-8');
  }],
  ['POST', /^\/api\/compare$/, (req, res, m, body) => json(res, app.features.compareChannels(body.ids || []))],
  ['GET', /^\/api\/saved$/, (req, res, m, b, url) => json(res, saved.list(url.searchParams.get('kind')))],
  ['GET', /^\/api\/saved\/keys$/, (req, res) => json(res, saved.keys())],
  ['POST', /^\/api\/saved$/, (req, res, m, body) => {
    saved.put(body.kind, body.ref, body.title, body.data || {}, body.note || '');
    json(res, { ok: true });
  }],
  ['PATCH', /^\/api\/saved$/, (req, res, m, body) => {
    saved.note(body.kind, body.ref, body.note || '');
    json(res, { ok: true });
  }],
  ['DELETE', /^\/api\/saved$/, (req, res, m, body) => {
    saved.remove(body.kind, body.ref);
    json(res, { ok: true });
  }],
  ['GET', /^\/api\/settings$/, (req, res) => json(res, { ...settingsStore.all(), aiKey: settingsStore.all().aiKey ? '••••' : '' })],
  ['POST', /^\/api\/settings$/, (req, res, m, body) => {
    if (body.aiKey === '••••') delete body.aiKey;
    const s = settingsStore.set(body);
    app.source.configure?.(s);
    json(res, { ...s, aiKey: s.aiKey ? '••••' : '' });
  }],
  ['GET', /^\/api\/metrics$/, (req, res) => json(res, METRICS)],
  ['GET', /^\/api\/status$/, (req, res) => json(res, { gl: app.settings().gl, concurrency: app.settings().concurrency, delayMs: app.settings().delayMs, ...app.source.stats(), counts: records.counts(), running: runner.list(WS).filter((j) => j.status === 'running').length })],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const [method, re, handler] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) {
          const body = ['POST', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : {};
          return await handler(req, res, m, body, url);
        }
      }
      return json(res, { error: 'Not found' }, 404);
    }
    let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    json(res, { error: e.message }, 500);
  }
});

server.listen(PORT, HOST, () => console.log(`YouTube Research → http://localhost:${PORT}`));
