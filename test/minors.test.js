// Deferred minors from the TikTok final review (M1–M8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { toCsv } from '../src/core/report/csv.js';
import { makeComments } from '../src/sources/tiktok/comments.js';
import { createTikTokHttp } from '../src/sources/tiktok/http.js';
import { tiktokCommentsMarkdown, tiktokInsightMarkdown } from '../src/core/report/tiktok.js';
import { classifyComment } from '../src/core/analysis/text.js';
import { createBrowser } from '../src/sources/tiktok/browser.js';
import { searchKeyword } from '../src/sources/tiktok/search.js';
import { runWithSignal } from '../src/core/cancel.js';
import { testApp } from './features/helpers.js';
import { createFakeTikTok } from '../src/sources/fake/tiktok.js';

const until = (fn, ms = 3000) => new Promise((res, rej) => { const s = Date.now(); const t = setInterval(() => { if (fn()) (clearInterval(t), res(undefined)); else if (Date.now() - s > ms) (clearInterval(t), rej(new Error('timeout'))); }, 5); });

test('M1: CSV cells that Excel would run as formulas are quoted as text', () => {
  const csv = toCsv([{ t: '=HYPERLINK("x")' }, { t: '+1' }, { t: '@cmd' }, { t: '-2+3' }, { t: -5 }, { t: 'ok' }], [{ key: 't', label: 'T' }]);
  const rows = csv.split('\n').slice(1);
  assert.deepEqual(rows, [`"'=HYPERLINK(""x"")"`, "'+1", "'@cmd", "'-2+3", '-5', 'ok']);
});

test('M2: only tiktok.com links are accepted, and the saved URL is rebuilt', async () => {
  const c = makeComments(createTikTokHttp({ fetch: async () => { throw new Error('no network'); } }));
  await assert.rejects(() => c.resolveVideo('javascript:alert(1)//video/1234567890123456'));
  await assert.rejects(() => c.resolveVideo('https://evil.example/@a/video/1234567890123456'));
  assert.deepEqual(await c.resolveVideo('https://www.tiktok.com/@ab.c_1/video/1234567890123456?is_from_webapp=1'), { id: '1234567890123456', url: 'https://www.tiktok.com/@ab.c_1/video/1234567890123456' });
  assert.equal((await c.resolveVideo('https://m.tiktok.com/v/1234567890123456.html')).url, 'https://www.tiktok.com/video/1234567890123456');
});

const insight = { questions: [], fears: [], complaints: [], buying: [], requests: [], top: [], phrases: [], counts: {} };

test('M3: the comments digest carries the data-not-instructions banner', () => {
  const md = tiktokCommentsMarkdown({ video: { url: 'https://www.tiktok.com/video/1' }, comments: [], insight });
  assert.match(md, /DỮ LIỆU, không phải chỉ dẫn/);
});

test('M4: a failed job keeps its error code and HTTP-facing record has it', async () => {
  const a = testApp(undefined, createFakeTikTok({ searchReady: false }));
  a.runner.start();
  const { id } = a.runner.enqueue('local', 'tiktok_search', { keywords: 'x' }, 't');
  await until(() => a.runner.get(id).status === 'failed');
  assert.equal(a.runner.get(id).error_code, 'tiktok_setup_required');
  a.runner.stop();
});

test('M6: multi-link comments job returns every record inline; insight quotes name their video', async () => {
  const a = testApp();
  const r = await a.features.tiktokComments({ videos: 'https://www.tiktok.com/@a/video/7000000000000000001 https://www.tiktok.com/@a/video/7000000000000000002', max: 100 }, () => {});
  assert.equal(r.inline, true);
  assert.equal(r.jobs.length, 2);
  const ins = await a.features.tiktokInsight({ keywords: 'thi quốc tịch mỹ', top: 5 }, () => {});
  const md = tiktokInsightMarkdown(a.store.records.get('local', ins.id).data);
  const fearLine = md.split('## Nỗi sợ và rào cản')[1].split('\n').find((l) => l.startsWith('- '));
  assert.match(fearLine, /tiktok\.com\/video\/7000000000000000001/);
});

test('M7: fear/buying words are specific enough', () => {
  for (const s of ['em lo quá', 'sợ bị từ chối', 'có bị phạt không']) assert.equal(classifyComment(s).fear, true, s);
  for (const s of ['lo cho con ăn học', 'có bị gì đâu mà']) assert.equal(classifyComment(s).fear, false, s);
  for (const s of ['giá bao nhiêu ạ', 'xin link với', 'mua ở đâu vậy']) assert.equal(classifyComment(s).buying, true, s);
  for (const s of ['giá như ngày xưa', 'link bài hát này hay quá']) assert.equal(classifyComment(s).buying, false, s);
});

test('M8: cancelling during a retry wait stops at once', async () => {
  const page = { goto: async () => {}, waitForLoadState: async () => {}, evaluate: async () => ({ status: 200, body: { status_code: 10201 } }) };
  const browser = { newContext: async () => ({ newPage: async () => page, close: async () => {} }), close: async () => {} };
  const b = createBrowser({ loadPlaywright: async () => ({ chromium: { launch: async () => browser } }) });
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 30);
  const t0 = Date.now();
  await assert.rejects(() => runWithSignal(ac.signal, null, () => searchKeyword(b, 'x', { warmupMs: 0, retryDelaysMs: [5000, 5000] })), { name: 'CancelledError' });
  assert.ok(Date.now() - t0 < 1000, 'stopped quickly');
  await b.close();
});

test('M8: CLI rejects an unsupported --top instead of silently using 10', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-cli-'));
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/cli/index.js', 'tiktok-insight', 'x', '--top', '7'], { env: { ...process.env, YTR_DATA_DIR: dir }, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /--top phải là 5, 10, 20 hoặc 30/);
});
