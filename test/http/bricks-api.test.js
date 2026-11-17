import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from '../features/helpers.js';
import { createFakeLlm } from '../../src/llm/fake.js';
import { createHttpServer } from '../../src/http/server.js';

const A = '7000000000000000001';
const reply = { topic: 'Chủ đề', pillar: null, seed: 'Ý gốc', angle: 'Góc', belief_common: 'Tin', belief_reality: 'Thật', facts: ['f'], concept: 'Số', extraConcepts: [], hook_formula: '[x]', hook_archetype: 'Teacher', hook_category: 'Dạy',
  story_category: 'Tự sự', story_description: 'Kể', blocks: [{ fromSeg: 1, toSeg: 1, type: 'hook', summary: 'mở' }], comments: [], fit: 'unclear', fit_reason: '', evidence: { topic: [1], seed: [1], angle: [1], belief: [1], facts: [1] } };

async function boot() {
  const app = testApp(undefined, undefined, { llm: createFakeLlm(() => reply) });
  app.runner.start();
  const recordId = app.store.records.add(app.ws, 'tiktok_video_analysis', 'lô', { data: { platform: 'tiktok', videos: [{ link: 'l', video: { id: A, caption: 'Video một', author: 'na', url: 'u', durationSec: 9 }, row: { views: 5 }, transcript: { segments: [{ start: 0, end: 4, text: 'mở đầu' }] }, comments: [] }] } });
  const srv = createHttpServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  return { app, recordId, base: `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`, close: () => (app.runner.stop(), srv.close()) };
}
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const get = async (u) => (await fetch(u)).json();
const waitJob = async (base, id) => { for (let i = 0; i < 200; i++) { const j = await get(`${base}/api/v1/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 20)); } throw new Error('timeout'); };

test('job → list → detail → edit → markdown → delete', async () => {
  const s = await boot();
  const job = await waitJob(s.base, (await (await post(`${s.base}/api/v1/jobs/brick_extract`, { recordId: s.recordId })).json()).id);
  assert.equal(job.status, 'succeeded', job.error);
  assert.deepEqual([job.result.done, job.result.failed], [1, []]);
  const list = await get(`${s.base}/api/v1/bricks`);
  assert.deepEqual(list.rows.map((r) => r.videoId), [A]);
  assert.deepEqual([list.concepts.length, list.archetypes.length, list.ai], [40, 6, true]);
  const one = await get(`${s.base}/api/v1/bricks/tiktok/${A}`);
  assert.equal(one.bricks.hook.spoken, 'mở đầu');
  const edited = await (await post(`${s.base}/api/v1/bricks/tiktok/${A}`, { edits: { topic: 'Tôi sửa' } })).json();
  assert.deepEqual([edited.bricks.topic, edited.editedPaths], ['Tôi sửa', ['topic']]);
  const md = await (await fetch(`${s.base}/api/v1/bricks/export.md?keys=tiktok:${A}&inline=1`)).text();
  assert.match(md, /^# Thư viện gạch: 1 video/);
  assert.match(md, /## Video một/);
  assert.match(md, /- Topic: Tôi sửa/);
  assert.match(md, /- Niềm tin phổ biến: Tin\n- Thực tế: Thật/);
  assert.match(md, /- Hook nguyên văn: \*mở đầu\*/);
  assert.equal((await fetch(`${s.base}/api/v1/bricks/tiktok/${A}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${s.base}/api/v1/bricks/tiktok/${A}`)).status, 404);
  s.close();
});

test('bad input: a job with nothing to do fails clearly, edits need an object, unknown video is 404', async () => {
  const s = await boot();
  const job = await waitJob(s.base, (await (await post(`${s.base}/api/v1/jobs/brick_extract`, {})).json()).id);
  assert.deepEqual([job.status, job.errorCode], ['failed', 'invalid_input']);
  assert.equal((await post(`${s.base}/api/v1/bricks/tiktok/${A}`, {})).status, 400);
  assert.equal((await post(`${s.base}/api/v1/bricks/tiktok/khongco`, { edits: { topic: 'x' } })).status, 404);
  assert.equal((await post(`${s.base}/api/v1/jobs/brick_extract`, { recordId: 'x' })).status, 400);
  s.close();
});

test('candidates and compare answer on an empty library; follows is accepted by the job schema', async () => {
  const s = await boot();
  assert.deepEqual(await get(`${s.base}/api/v1/bricks/candidates`), { min: 3, channels: [] });
  const c = await get(`${s.base}/api/v1/bricks/compare?channel=tiktok:x`);
  assert.deepEqual([c.winners, c.enough, c.need], [0, false, { winners: 3, losers: 3 }]);
  assert.equal((await fetch(`${s.base}/api/v1/bricks/compare`)).status, 400);
  const job = await waitJob(s.base, (await (await post(`${s.base}/api/v1/jobs/brick_extract`, { follows: 'all', contrast: true })).json()).id);
  assert.deepEqual([job.status, job.errorCode], ['failed', 'invalid_input'], 'no followed channel has anything to extract');
  s.close();
});
