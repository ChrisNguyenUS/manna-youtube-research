import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeLlm } from '../../src/llm/fake.js';
import { createFakeTikTok } from '../../src/sources/fake/tiktok.js';

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

const scan = (id, title, score, o = {}) => ({ id, title, url: `https://www.tiktok.com/@monica/video/${id}`, thumb: null, views: Math.round(score * 1000), score, ageDays: 10, standout: score >= 3, pinned: false, ...o });

test('followed channels: standouts not yet in the library are candidates; contrast adds the weakest videos', async () => {
  const { a, f, llm } = setup();
  a.store.follows.put(a.ws, 'tiktok', 'monica', 'Monica', {});
  const ids = (await a.tiktok.searchVideos('x', { max: 4 })).map((v) => v.id);
  a.store.follows.saveScan(a.ws, 'tiktok', 'monica', { lastScan: { at: 'now', newIds: [], outlierIds: [], videos: [scan(ids[0], 'Thắng 1', 6), scan(ids[1], 'Thắng 2', 3), scan(ids[2], 'Thua 1', 0.4), scan(ids[3], 'Thua mới', 0.1, { ageDays: 1 })] } });
  assert.deepEqual(f.candidates(), { min: 3, channels: [{ platform: 'tiktok', ref: 'monica', title: 'Monica', standouts: 2, fresh: 2, contrast: 1 }] });
  const r = await f.extract({ follows: 'tiktok:monica' });
  assert.deepEqual([r.done, r.failed], [2, []]);
  assert.deepEqual(f.list().map((x) => [x.videoId, x.meta.score, x.channelRef, x.meta.channelTitle]).sort(), [[ids[0], 6, 'tiktok:monica', 'Monica'], [ids[1], 3, 'tiktok:monica', 'Monica']].sort());
  assert.equal(f.candidates().channels[0].fresh, 0);
  const more = await f.extract({ follows: 'all', contrast: true });
  assert.deepEqual([more.done, more.skipped], [1, 2], 'the weak old-enough video is added; the day-old one is left out');
  assert.equal(llm.calls.length, 3);
  a.store.settings.set(a.ws, { bricksMinScore: 5 });
  assert.deepEqual([f.candidates().min, f.candidates().channels[0].standouts], [5, 1]);
  await assert.rejects(f.extract({ follows: 'tiktok:khongco' }), (/** @type {any} */ e) => e.code === 'invalid_input');
});

test('compare: by channel, with the library threshold; channels lists what can be compared', async () => {
  const { a, f } = setup();
  const put = (id, score, concept) => a.store.bricks.put(a.ws, { platform: 'tiktok', videoId: id, channelRef: 'tiktok:monica', meta: { title: id, channelTitle: 'Monica', score }, source: { segments: [], comments: [] }, model: 'm',
    data: { topic: 't', pillar: '', seed: '', angle: '', belief: null, facts: [], concept, extraConcepts: [], hook: { spoken: '', formula: '', archetype: 'Teacher', category: '' }, story: { category: '', description: '', blocks: [] }, audience: { total: 0, counts: {}, examples: {} }, fit: { verdict: 'unclear', reason: '' }, visual: { format: '', keyVisuals: '', audio: '' }, evidence: {}, flags: { noTranscript: true, truncated: false, unsupported: [] } } });
  ['w1', 'w2', 'w3'].forEach((id) => put(id, 5, 'So sánh'));
  ['l1', 'l2', 'l3'].forEach((id) => put(id, 0.5, 'Số'));
  const c = f.compare('tiktok:monica');
  assert.deepEqual([c.channelRef, c.title, c.winners, c.losers, c.enough], ['tiktok:monica', 'Monica', 3, 3, true]);
  assert.equal(c.attrs.find((x) => x.key === 'concept').values[0].core, true);
  assert.deepEqual(f.channels(), [{ channelRef: 'tiktok:monica', title: 'Monica', videos: 6 }]);
  assert.deepEqual([f.compare('tiktok:khac').winners, f.compare('tiktok:khac').enough], [0, false]);
});

const DIVE = {
  impressions: ['a', 'b', 'c'], form: 'chưa có dữ liệu', timeline: { first3s: '1', next10s: '2', next30s: '3', ending: '4', overall: '5' }, comments: 'c',
  verdict: { about: 'a', audience: 'b', emotion: 'c', message: 'd', special: ['x', 'y', 'z'] }, hypotheses: [{ factor: 'f', ifRemoved: 'r' }],
  core: [{ what: 'Tạo engagement', why: 'Vì người xem dừng lại' }], support: [], formula: { name: 'n', appliesTo: 'a', steps: ['s'] }, doubts: ['d'],
};

test('deep dive: one call, then one rewrite of the texts that are not plain; saved on the row and kept by a re-extract', async () => {
  const { a, f, llm, recordId } = setup((req) => (req.task === 'bricks' ? answer() : req.task === 'deep_dive' ? DIVE : { texts: ['Làm người xem dừng lại'] }), { knowledgeFiles: { analyst: '### BƯỚC 1' } });
  await f.extract({ recordId });
  const r = await f.deepDive({ platform: 'tiktok', videoId: A });
  assert.deepEqual([r.inline, r.platform, r.videoId, r.usage.calls], [true, 'tiktok', A, 2]);
  assert.match(llm.calls.find((c) => c.task === 'deep_dive').system, /### BƯỚC 1/);
  const row = f.get('tiktok', A);
  assert.deepEqual([row.hasDeepDive, row.deepDive.core[0].what, row.deepDive.flagged], [true, 'Làm người xem dừng lại', []]);
  await f.extract({ recordId, redo: true });
  assert.equal(f.get('tiktok', A).hasDeepDive, true);
  assert.match(a.features.bricks.deepDiveMarkdown('tiktok', A), /## Đúc kết\n\n### Yếu tố cốt lõi\n\n1\. \*\*Làm người xem dừng lại\*\*/);
  await assert.rejects(f.deepDive({ platform: 'tiktok', videoId: 'x' }), (/** @type {any} */ e) => e.code === 'not_found');
});

test('deep dive: nothing to rewrite means one call; a failed rewrite keeps the first answer and flags it', async () => {
  const clean = setup((req) => (req.task === 'bricks' ? answer() : { ...DIVE, core: [{ what: 'Câu mở đầu ngược đời', why: 'Ai cũng dừng lại' }] }));
  await clean.f.extract({ recordId: clean.recordId });
  assert.equal((await clean.f.deepDive({ platform: 'tiktok', videoId: A })).usage.calls, 1);
  const broken = setup((req) => (req.task === 'bricks' ? answer() : req.task === 'deep_dive' ? DIVE : Object.assign(new Error('x'), { code: 'llm_unavailable' })));
  await broken.f.extract({ recordId: broken.recordId });
  await broken.f.deepDive({ platform: 'tiktok', videoId: A });
  assert.deepEqual([broken.f.get('tiktok', A).deepDive.core[0].what, broken.f.get('tiktok', A).deepDive.flagged], ['Tạo engagement', ['core.0.what']]);
});

test('a re-extract keeps the score and channel it had when the channel\'s latest check no longer lists the video', async () => {
  const { a, f } = setup();
  const vids = await a.tiktok.searchVideos('x', { max: 2 });
  a.store.follows.put(a.ws, 'tiktok', 'monica', 'Monica', {});
  a.store.follows.saveScan(a.ws, 'tiktok', 'monica', { lastScan: { at: '1', newIds: [], outlierIds: [], videos: [scan(vids[0].id, 'Thắng', 6)] } });
  await f.extract({ follows: 'tiktok:monica' });
  a.store.follows.saveScan(a.ws, 'tiktok', 'monica', { lastScan: { at: '2', newIds: [], outlierIds: [], videos: [scan(vids[1].id, 'Mới', 1)] } });
  await f.extract({ links: f.get('tiktok', vids[0].id).meta.url, redo: true });
  const r = f.get('tiktok', vids[0].id);
  assert.deepEqual([r.meta.score, r.meta.ageDays, r.meta.channelTitle, r.channelRef], [6, 10, 'Monica', 'tiktok:monica']);
  a.store.follows.saveScan(a.ws, 'tiktok', 'monica', { lastScan: { at: '3', newIds: [], outlierIds: [], videos: [scan(vids[0].id, 'Thắng', 9)] } });
  await f.extract({ links: r.meta.url, redo: true });
  assert.equal(f.get('tiktok', vids[0].id).meta.score, 9, 'a newer check wins');
});

test('a short link to a video already in the library is skipped after loading, without a model call', async () => {
  const fake = createFakeTikTok();
  const first = (await fake.searchVideos('x', { max: 1 }))[0].id;
  const tiktok = { ...fake, getVideo: (u) => fake.getVideo(/vm\.tiktok\.com/.test(u) ? `https://www.tiktok.com/@x/video/${first}` : u) };
  const llm = createFakeLlm(() => answer());
  const a = testApp(undefined, tiktok, { llm, knowledgeFiles: {} });
  await a.features.bricks.extract({ links: `https://www.tiktok.com/@x/video/${first}` });
  const steps = [];
  const r = await a.features.bricks.extract({ links: 'https://vm.tiktok.com/ZSabc/' }, (p) => steps.push(p.step));
  assert.deepEqual([r.done, r.skipped, llm.calls.length], [0, 1, 1]);
  assert.equal(steps.at(-1), 'Bóc gạch 1/1');
});

test('a stored row missing fields still opens, with the missing ones empty', () => {
  const { a, f } = setup();
  a.store.bricks.put(a.ws, { platform: 'tiktok', videoId: 'old', channelRef: '', meta: { title: 'cũ' }, source: { segments: [], comments: [] }, model: 'm', data: { topic: 'Chỉ có topic' } });
  const r = f.get('tiktok', 'old');
  assert.deepEqual([r.bricks.topic, r.bricks.evidence.topic, r.bricks.hook.spoken, r.bricks.story.blocks, r.bricks.flags.unsupported], ['Chỉ có topic', [], '', [], []]);
  assert.equal(f.list().find((x) => x.videoId === 'old').bricks.audience.total, 0);
});
