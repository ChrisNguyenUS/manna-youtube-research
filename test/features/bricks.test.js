import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeLlm } from '../../src/llm/fake.js';

const seg = (start, text, end) => ({ start, end, text });
const A = '7000000000000000001';
const B = '7000000000000000002';
const entry = (id, caption, o = {}) => ({
  link: `https://www.tiktok.com/@na/video/${id}`, video: { id, caption, author: 'na', url: `https://www.tiktok.com/@na/video/${id}`, cover: null, plays: 1000, durationSec: 20 },
  row: { views: 1000 }, transcript: { language: 'vi', kind: 'auto', segments: [seg(0, `${caption} mở đầu`, 6), seg(6, 'đoạn giữa', 12), seg(12, 'kết', 20)] },
  comments: [{ id: `c-${id}`, text: 'Thương quá', likes: 5, replies: 0, videoId: id }], ...o,
});
const answer = (over = {}) => ({
  topic: 'Chủ đề', pillar: null, seed: 'Ý gốc', angle: 'Góc', belief_common: null, belief_reality: null, facts: [], concept: 'Số', extraConcepts: [],
  hook_formula: '[x] thì [y]', hook_archetype: 'Teacher', hook_category: 'Dạy', story_category: 'Tự sự', story_description: 'Kể',
  blocks: [{ fromSeg: 1, toSeg: 1, type: 'hook', summary: 'mở' }], comments: [{ n: 1, cls: 'empathy' }], fit: 'unclear', fit_reason: '',
  evidence: { topic: [1], seed: [1], angle: [2], belief: [], facts: [] }, ...over,
});
/** @param {(req: any) => any} [script] @param {{ready?: boolean, knowledgeFiles?: Record<string, string>}} [opts] */
function setup(script = () => answer(), opts = {}) {
  const llm = createFakeLlm(script, { ready: opts.ready ?? true });
  const a = testApp(undefined, undefined, { llm, knowledgeFiles: opts.knowledgeFiles ?? {} });
  const recordId = a.store.records.add(a.ws, 'tiktok_video_analysis', 'lô', { data: { platform: 'tiktok', videos: [entry(A, 'Video một'), entry(B, 'Video hai'), { link: 'x', video: null, comments: [], error: { message: 'hỏng' } }] } });
  return { a, llm, recordId, f: a.features.bricks };
}

test('extracting from a video-analysis report: one row per readable video, with what the model saw', async () => {
  const { f, llm, recordId, a } = setup();
  a.store.settings.set(a.ws, { aiWriteModel: 'write/model' });
  const steps = [];
  const r = await f.extract({ recordId }, (p) => steps.push(p.step));
  assert.deepEqual([r.inline, r.done, r.skipped, r.failed], [true, 2, 0, []]);
  assert.deepEqual([r.usage.model, r.usage.calls], ['write/model', 2]);
  assert.equal(llm.calls[0].task, 'bricks');
  const rows = f.list();
  assert.deepEqual(rows.map((x) => [x.platform, x.videoId, x.channelRef, x.meta.title]).sort(), [['tiktok', A, 'tiktok:na', 'Video một'], ['tiktok', B, 'tiktok:na', 'Video hai']]);
  const one = f.get('tiktok', A);
  assert.deepEqual([one.bricks.concept, one.bricks.hook.archetype, one.bricks.hook.spoken], ['Số', 'Teacher', 'Video một mở đầu']);
  assert.deepEqual([one.source.segments.length, one.source.comments[0].id, one.bricks.audience.examples.empathy], [3, `c-${A}`, [`c-${A}`]]);
  assert.deepEqual([one.editedPaths, one.hasDeepDive, one.deepDive], [[], false, null]);
  assert.ok(steps.some((s) => /Bóc gạch 2\/2/.test(s)));
});

test('the channel\'s pillars, filter and the concepts file reach the prompt', async () => {
  const { a, f, llm, recordId } = setup(() => answer({ pillar: 'Phỏng vấn', fit: 'yes', fit_reason: 'đúng avatar' }), { knowledgeFiles: { 'viral-concepts': 'CONCEPT 1: SO SÁNH', dick: 'DICK' } });
  a.features.soulprint.save({ pillars: [{ name: 'Phỏng vấn' }, { name: 'Giấy tờ' }], filter: 'Có giá trị với Lan không?' });
  await f.extract({ recordId });
  assert.match(llm.calls[0].system, /Phỏng vấn, Giấy tờ/);
  assert.match(llm.calls[0].system, /CONCEPT 1: SO SÁNH/);
  assert.ok(!/DICK/.test(llm.calls[0].system), 'only the concepts file is given to this step');
  assert.deepEqual([f.get('tiktok', A).bricks.pillar, f.get('tiktok', A).bricks.fit.verdict], ['Phỏng vấn', 'yes']);
});

test('a video already in the library is skipped; redo refreshes it and keeps the owner\'s edits (Review Focus #4)', async () => {
  let topic = 'Chủ đề cũ';
  const { f, llm, recordId } = setup(() => answer({ topic }));
  await f.extract({ recordId });
  f.update('tiktok', A, { topic: 'Tôi sửa', 'visual.format': 'Quay mặt nói', 'hook.spoken': 'không được sửa', concept: 'lạ' });
  assert.deepEqual(f.get('tiktok', A).editedPaths, ['topic', 'visual.format']);
  const again = await f.extract({ recordId });
  assert.deepEqual([again.done, again.skipped, llm.calls.length], [0, 2, 2]);
  topic = 'Chủ đề mới';
  const redo = await f.extract({ recordId, redo: true });
  assert.deepEqual([redo.done, redo.skipped], [2, 0]);
  const a = f.get('tiktok', A);
  assert.deepEqual([a.bricks.topic, a.bricks.visual.format, a.editedPaths], ['Tôi sửa', 'Quay mặt nói', ['topic', 'visual.format']]);
  assert.equal(f.get('tiktok', B).bricks.topic, 'Chủ đề mới');
});

test('one video the model cannot read twice is listed as failed; the others are saved; a wrong key stops the job', async () => {
  const flaky = setup((req) => (/Video hai/.test(req.user) ? {} : answer()));
  const r = await flaky.f.extract({ recordId: flaky.recordId });
  assert.deepEqual([r.done, r.failed.length, r.failed[0].title], [1, 1, 'Video hai']);
  assert.match(r.failed[0].reason, /AI không bóc được/);
  assert.equal(flaky.llm.calls.length, 3, 'the failing video was tried twice');
  const auth = setup(() => Object.assign(new Error('key'), { code: 'llm_auth' }));
  await assert.rejects(auth.f.extract({ recordId: auth.recordId }), (/** @type {any} */ e) => e.code === 'llm_auth');
});

test('no key, nothing to extract, a missing report: clear errors and no model call', async () => {
  const off = setup(undefined, { ready: false });
  await assert.rejects(off.f.extract({ recordId: off.recordId }), (/** @type {any} */ e) => e.code === 'llm_no_key');
  const on = setup();
  await assert.rejects(on.f.extract({}), (/** @type {any} */ e) => e.code === 'invalid_input');
  await assert.rejects(on.f.extract({ recordId: 9999 }), (/** @type {any} */ e) => e.code === 'not_found');
  await assert.rejects(on.f.extract({ links: 'không phải link' }), (/** @type {any} */ e) => e.code === 'invalid_input');
  assert.equal(off.llm.calls.length + on.llm.calls.length, 0);
});

test('pasted links are fetched from their platform; a video that cannot be fetched is listed as failed', async () => {
  const { a, f } = setup();
  const id = a.tiktok && (await a.tiktok.searchVideos('x', { max: 1 }))[0].id; // the fake's first video is the one with subtitles
  const r = await f.extract({ links: `https://www.tiktok.com/@x/video/${id}\nhttps://www.tiktok.com/@x/video/7000000000000000009\ndQw4w9WgXcQ` });
  assert.deepEqual([r.done, r.failed.length], [2, 1]);
  assert.match(r.failed[0].reason, /không còn|riêng tư/);
  assert.equal(f.get('tiktok', id).source.segments.length > 0, true);
  const yt = f.get('youtube', 'dQw4w9WgXcQ');
  assert.deepEqual([yt.bricks.flags.noTranscript, yt.meta.url], [true, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']);
});

test('edit and remove: unknown fields are ignored, an unknown video is not_found', async () => {
  const { f, recordId } = setup();
  await f.extract({ recordId });
  assert.deepEqual(f.update('tiktok', A, { 'belief.common': 'Niềm tin', nope: 1 }).bricks.belief, { common: 'Niềm tin', reality: '' });
  f.update('tiktok', A, { 'belief.common': '' });
  assert.deepEqual(f.get('tiktok', A).editedPaths, ['belief.common']);
  assert.throws(() => f.update('tiktok', 'x', { topic: 'a' }), (/** @type {any} */ e) => e.code === 'not_found');
  f.remove('tiktok', A);
  assert.throws(() => f.get('tiktok', A), (/** @type {any} */ e) => e.code === 'not_found');
  assert.equal(f.list().length, 1);
});
