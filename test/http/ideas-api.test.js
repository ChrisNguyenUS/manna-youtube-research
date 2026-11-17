import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from '../features/helpers.js';
import { createHttpServer } from '../../src/http/server.js';

async function boot() {
  const app = testApp();
  const srv = createHttpServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  return { app, base: `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`, close: () => srv.close() };
}
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const get = async (u) => (await fetch(u)).json();

test('board → create → edit → export → new batch → delete', async () => {
  const s = await boot();
  assert.equal((await get(`${s.base}/api/v1/ideas`)).batch.title, 'Lô 1');
  const c = await (await post(`${s.base}/api/v1/ideas`, { from: 'self' })).json();
  const e = await (await post(`${s.base}/api/v1/ideas/${c.id}`, { patch: { topic: 'Phỏng vấn', status: 'chosen' } })).json();
  assert.deepEqual([e.card.topic, e.status], ['Phỏng vấn', 'chosen']);
  assert.equal((await get(`${s.base}/api/v1/ideas/${c.id}`)).card.topic, 'Phỏng vấn');
  const md = await (await fetch(`${s.base}/api/v1/ideas/export.md?inline=1`)).text();
  assert.match(md, /^# Lô 1: 1 thẻ/);
  const nb = await (await post(`${s.base}/api/v1/ideas/batches`, { title: 'Lô mới' })).json();
  assert.equal(nb.batch.title, 'Lô mới');
  assert.equal((await fetch(`${s.base}/api/v1/ideas/${c.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${s.base}/api/v1/ideas/${c.id}`)).status, 404);
  s.close();
});

test('bad input is a 400, an unknown card a 404', async () => {
  const s = await boot();
  assert.equal((await post(`${s.base}/api/v1/ideas`, {})).status, 400);
  assert.equal((await post(`${s.base}/api/v1/ideas`, { from: 'brick:x' })).status, 400);
  const c = await (await post(`${s.base}/api/v1/ideas`, { from: 'self' })).json();
  assert.equal((await post(`${s.base}/api/v1/ideas/${c.id}`, {})).status, 400);
  assert.equal((await post(`${s.base}/api/v1/ideas/abc`, { patch: {} })).status, 400);
  assert.equal((await fetch(`${s.base}/api/v1/ideas/9999`)).status, 404);
  assert.equal((await fetch(`${s.base}/api/v1/ideas?batch=9999`)).status, 404);
  s.close();
});

test('outline, script, lint and the hand-off over HTTP', async () => {
  const s = await boot();
  const c = await (await post(`${s.base}/api/v1/ideas`, { from: 'self' })).json();
  const o = await (await post(`${s.base}/api/v1/ideas/${c.id}/outline`, { outline: { length: 60 } })).json();
  assert.equal(o.outline.length, 60);
  const sc = await (await post(`${s.base}/api/v1/ideas/${c.id}/script`, { text: 'Bấm theo dõi nhé.' })).json();
  assert.deepEqual([sc.view.script, sc.lint.issues], ['Bấm theo dõi nhé.', []]);
  const l = await (await post(`${s.base}/api/v1/ideas/lint`, { text: 'Kể thôi.' })).json();
  assert.deepEqual([l.maxWords, l.issues.map((x) => x.rule)], [135, ['cta']]);
  const md = await (await fetch(`${s.base}/api/v1/ideas/${c.id}/outline.md?inline=1`)).text();
  assert.match(md, /^# Dàn ý/);
  assert.equal((await post(`${s.base}/api/v1/ideas/${c.id}/outline`, {})).status, 400);
  assert.equal((await post(`${s.base}/api/v1/ideas/${c.id}/script`, {})).status, 400);
  assert.equal((await post(`${s.base}/api/v1/ideas/lint`, {})).status, 400);
  s.close();
});

test('posted video, own counts, the review, closing and the refresh job over HTTP', async () => {
  const s = await boot();
  try {
    const c = await (await post(`${s.base}/api/v1/ideas`, { from: 'self' })).json();
    const v = await (await post(`${s.base}/api/v1/ideas/${c.id}/video`, { url: 'https://www.tiktok.com/@creator/video/7000000000000000002' })).json();
    assert.deepEqual([v.status, v.published.videoId], ['posted', '7000000000000000002']);
    assert.equal((await post(`${s.base}/api/v1/ideas/${c.id}/video`, {})).status, 400);
    const bad = await post(`${s.base}/api/v1/ideas/${c.id}/result`, { leads: -1 });
    assert.deepEqual([bad.status, (await bad.json()).error.field], [400, 'leads']);
    assert.equal((await (await post(`${s.base}/api/v1/ideas/${c.id}/result`, { leads: 3 })).json()).published.leads, 3);
    const r = await get(`${s.base}/api/v1/ideas/batches/${c.batchId}/review`);
    assert.deepEqual([r.posted, r.rows.length, r.levels.length], [1, 1, 3]);
    assert.match(await (await fetch(`${s.base}/api/v1/ideas/batches/${c.batchId}/review.md?inline=1`)).text(), /^# Chấm lô/);
    const job = await (await post(`${s.base}/api/v1/jobs/batch_refresh`, { batchId: c.batchId })).json();
    let j = job;
    for (let i = 0; i < 50 && !['succeeded', 'failed'].includes(j.status); i++) j = await (await new Promise((ok) => setTimeout(ok, 20)), get(`${s.base}/api/v1/jobs/${job.id}`));
    assert.deepEqual([j.status, j.title, j.result.checked], ['succeeded', 'Cập nhật số liệu lô', 1]);
    assert.equal((await post(`${s.base}/api/v1/jobs/batch_refresh`, {})).status, 400, 'batchId is required');
    const closed = await (await post(`${s.base}/api/v1/ideas/batches/${c.batchId}/close`, { learned: { keep: ['Giữ hook'], review: [] } })).json();
    assert.deepEqual([closed.batch.status, closed.batch.learned.keep], ['closed', ['Giữ hook']]);
    assert.equal((await get(`${s.base}/api/v1/ideas`)).learnedFrom.id, c.batchId);
    assert.equal((await get(`${s.base}/api/v1/ideas/batches/999/review`)).error.code, 'not_found');
    const off = await (await fetch(`${s.base}/api/v1/ideas/${c.id}/video`, { method: 'DELETE' })).json();
    assert.deepEqual([off.published, off.status], [null, 'filmed']);
  } finally {
    s.close();
  }
});
