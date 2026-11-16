import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from '../features/helpers.js';
import { createFakeLlm } from '../../src/llm/fake.js';
import { createHttpServer } from '../../src/http/server.js';

const V = '7000000000000000001';
const L = `https://www.tiktok.com/@creator/video/${V}`;
const none = { who: null, what: null, why: null, when: null, where: null, how: null };
const numbersIn = (user) => [...user.matchAll(/^(\d+) \| /gm)].map((m) => Number(m[1]));
const model = (req) => {
  if (req.task === 'codebook') return { who: [], what: [{ key: 'phong_van', label: 'Phỏng vấn', description: '' }], why: [], when: [], where: [], how: [] };
  if (req.task === 'tag') return { tags: numbersIn(req.user).map((n) => ({ n, ...none, what: 'phong_van' })) };
  return { notes: { who: [], what: [{ text: 'Hỏi nhiều về phỏng vấn', keys: ['phong_van'] }], why: [], when: [], where: [], how: [] }, ideas: [{ title: 'Phỏng vấn hỏi gì', who: null, pain: 'sợ', belief: null, concept: null, extraConcepts: [], funnel: null, evidence: [1] }] };
};

async function boot(opts) {
  const app = testApp(undefined, undefined, opts);
  app.runner.start();
  const srv = createHttpServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  return { app, base: `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`, close: () => (app.runner.stop(), srv.close()) };
}
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const get = async (u) => (await fetch(u)).json();
const waitJob = async (base, id) => { for (let i = 0; i < 200; i++) { const j = await get(`${base}/api/v1/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 20)); } throw new Error('timeout'); };

test('job → report → markdown, with the estimate route answering before /:id', async () => {
  const s = await boot({ llm: createFakeLlm(model), knowledge: '' });
  await s.app.features.tiktokComments({ videos: L, max: 100, replies: true });
  const est = await get(`${s.base}/api/v1/tiktok/5w1h/estimate?videos=${V}`);
  assert.equal(est.ready, true);
  assert.ok(est.comments >= 3 && est.tokens > 0);
  const job = await waitJob(s.base, (await (await post(`${s.base}/api/v1/jobs/comment_5w1h`, { videos: V })).json()).id);
  assert.equal(job.status, 'succeeded', job.error);
  const rep = await get(`${s.base}/api/v1/tiktok/5w1h/${job.result.id}`);
  assert.equal(rep.table.dims.what.groups[0].count, est.comments);
  assert.equal(rep.data.ideas.length, 1);
  assert.ok(rep.comments.every((c) => 'w' in c) && rep.videos.length === 1);
  const md = await (await fetch(`${s.base}/api/v1/records/${job.result.id}/export.md?inline=1`)).text();
  assert.match(md, /## What: /);
  const again = await waitJob(s.base, (await (await post(`${s.base}/api/v1/jobs/comment_5w1h`, { onlyStep3: job.result.id })).json()).id);
  assert.equal(again.status, 'succeeded', again.error);
  assert.equal((await fetch(`${s.base}/api/v1/tiktok/5w1h/999999`)).status, 404);
  s.close();
});

test('without a key: status says so and the job fails with llm_no_key; a wrong onlyStep3 is a 400', async () => {
  const s = await boot();
  assert.deepEqual((await get(`${s.base}/api/v1/status`)).ai, { ready: false });
  const job = await waitJob(s.base, (await (await post(`${s.base}/api/v1/jobs/comment_5w1h`, { videos: V })).json()).id);
  assert.deepEqual([job.status, job.errorCode], ['failed', 'llm_no_key']);
  const bad = await post(`${s.base}/api/v1/jobs/comment_5w1h`, { onlyStep3: 'x' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.field, 'onlyStep3');
  s.close();
});

test('status reports ai.ready once a key is saved, and the key never comes back', async () => {
  const s = await boot();
  const saved = await (await post(`${s.base}/api/v1/settings`, { aiKey: 'sk-or-test', aiTagModel: 'z-ai/glm-5.3-flash' })).json();
  assert.equal(saved.aiKey, '••••');
  assert.equal(saved.aiTagModel, 'z-ai/glm-5.3-flash');
  assert.deepEqual((await get(`${s.base}/api/v1/status`)).ai, { ready: true });
  s.close();
});
