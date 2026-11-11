import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from '../features/helpers.js';
import { createFakeTikTok } from '../../src/sources/fake/tiktok.js';
import { createHttpServer } from '../../src/http/server.js';

async function boot(tiktok) {
  const app = testApp(undefined, tiktok);
  app.runner.start();
  const srv = createHttpServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  return { app, base: `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`, close: () => (app.runner.stop(), srv.close()) };
}
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const waitJob = async (base, id) => { for (let i = 0; i < 200; i++) { const j = await (await fetch(`${base}/api/v1/jobs/${id}`)).json(); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 20)); } throw new Error('timeout'); };

test('schemas: missing keywords and top=7 are 400', async () => {
  const s = await boot();
  assert.equal((await post(`${s.base}/api/v1/jobs/tiktok_insight`, {})).status, 400);
  const r = await post(`${s.base}/api/v1/jobs/tiktok_insight`, { keywords: 'x', top: 7 });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.field, 'top');
  s.close();
});

test('status reports TikTok readiness', async () => {
  const s = await boot(createFakeTikTok({ searchReady: false }));
  const st = await (await fetch(`${s.base}/api/v1/status`)).json();
  assert.deepEqual(st.tiktok, { searchReady: false, reason: 'Cần cài: npm run setup:tiktok' });
  s.close();
});

test('setup missing: TikTok search job fails clearly while a YouTube job still succeeds (Review Focus #1)', async () => {
  const s = await boot(createFakeTikTok({ searchReady: false }));
  const tt = await (await post(`${s.base}/api/v1/jobs/tiktok_search`, { keywords: 'x' })).json();
  const yt = await (await post(`${s.base}/api/v1/jobs/idea_check`, { keywords: ['lịch sử'] })).json();
  const [a, b] = [await waitJob(s.base, tt.id), await waitJob(s.base, yt.id)];
  assert.equal(a.status, 'failed');
  assert.match(a.error, /npm run setup:tiktok/);
  assert.equal(b.status, 'succeeded');
  s.close();
});

test('insight export: markdown and csv', async () => {
  const s = await boot();
  const { id } = await (await post(`${s.base}/api/v1/jobs/tiktok_insight`, { keywords: 'thi quốc tịch mỹ', top: 5 })).json();
  const j = await waitJob(s.base, id);
  const md = await (await fetch(`${s.base}/api/v1/records/${j.result.id}/export.md?inline=1`)).text();
  assert.match(md, /## Khách lo sợ/);
  const csv = await (await fetch(`${s.base}/api/v1/records/${j.result.id}/export.csv`)).text();
  assert.match(csv.split('\n')[0], /Comment,Like,Trả lời,Attention\/ngày,Là trả lời,Nhóm,Video/);
  s.close();
});

test('app.close closes the TikTok browser', async () => {
  const tiktok = createFakeTikTok();
  const app = testApp(undefined, tiktok);
  await app.close();
  assert.equal(tiktok.state.closed, 1);
});
