import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeComment5w1h } from '../../src/features/ai/comment-5w1h.js';
import { createFakeLlm } from '../../src/llm/fake.js';
import { CancelledError } from '../../src/core/cancel.js';
import { DEFAULT_MODEL } from '../../src/core/ai/base.js';

const V = '7000000000000000001';
const none = { who: null, what: null, why: null, when: null, where: null, how: null };
const COMMENTS = [
  { id: 'c1', text: 'Phỏng vấn có khó không ạ?', likes: 9, replies: 1, videoId: V },
  { id: 'c2', text: 'Em sợ trượt quá', likes: 5, replies: 0, videoId: V },
  { id: 'c3', text: 'Mất bao lâu vậy chị', likes: 3, replies: 0, videoId: V },
  { id: 'c4', text: 'Chồng em bảo lãnh 2 năm rồi', likes: 2, replies: 0, videoId: V },
  { id: 'c5', text: 'Cần giấy tờ gì ạ', likes: 1, replies: 0, videoId: V },
  { id: 'c6', text: '😂', likes: 0, replies: 0, videoId: V },
];
const CODEBOOK = { who: [{ key: 'nguoi_bao_lanh', label: 'Người bảo lãnh', description: '' }], what: [{ key: 'phong_van', label: 'Phỏng vấn', description: '' }], why: [], when: [], where: [], how: [] };
const numbersIn = (user) => [...user.matchAll(/^(\d+) \| /gm)].map((m) => Number(m[1]));
const SUMMARY = { notes: { ...Object.fromEntries(['who', 'why', 'when', 'where', 'how'].map((d) => [d, []])), what: [{ text: 'Ai cũng hỏi về phỏng vấn', keys: ['phong_van'] }] }, ideas: [{ title: 'Phỏng vấn hỏi gì', who: null, pain: 'sợ trượt', belief: null, concept: null, extraConcepts: [], funnel: null, evidence: [1, 99] }] };
/** A model that behaves: answers by task. `over` replaces one task's answer. */
const good = (over = {}) => (req) => {
  if (over[req.task]) return over[req.task](req);
  if (req.task === 'codebook') return CODEBOOK;
  if (req.task === 'tag') return { tags: numbersIn(req.user).map((n) => ({ n, ...none, what: 'phong_van' })) };
  return SUMMARY;
};

function setup(script, o = {}) {
  const saved = new Map();
  const records = {
    add: (kind, title, { params, data }) => (saved.set(saved.size + 1, { id: saved.size + 1, kind, title, created_at: 5, params, data: structuredClone(data) }), saved.size),
    get: (id) => saved.get(id),
    update: (id, data) => void (saved.get(id).data = structuredClone(data)),
  };
  const llm = createFakeLlm(script, { ready: o.ready ?? true });
  const state = { comments: COMMENTS };
  const f = makeComment5w1h({
    llm, records, knowledge: o.knowledge ?? '', batchSize: 2, profileText: () => o.profileText ?? '',
    settings: () => ({ aiTagModel: 'tag/model', aiWriteModel: 'write/model', ...o.settings }),
    readComments: (ids) => ({ videos: ids.map((id) => ({ id, caption: 'cap' })), comments: state.comments }),
  });
  return { f, llm, saved, state };
}

test('a full run: codebook, three batches, summary; counts come from the tags; references are resolved', async () => {
  const { f, llm, saved } = setup(good());
  const steps = [];
  const { id } = await f.run({ videos: `${V}, rác` }, (p) => steps.push(p.step));
  const d = saved.get(id).data;
  assert.deepEqual(d.videoIds, [V]);
  assert.deepEqual(d.counts, { sent: 5, tagged: 5, untagged: 0, dropped: 0, failedBatches: 0, badTags: 0, badRefs: 1 });
  assert.equal(d.tags.c1.what, 'phong_van');
  assert.equal(d.tags.c6, undefined, 'a comment without words is never sent');
  assert.deepEqual(d.ideas[0].evidence, ['c1'], 'number 99 does not exist and is removed');
  assert.deepEqual(d.notes.what, [{ text: 'Ai cũng hỏi về phỏng vấn', keys: ['phong_van'] }]);
  assert.equal(d.summaryError, null);
  assert.equal(d.hasKnowledge, false);
  assert.deepEqual(d.usage, { tagModel: 'tag/model', writeModel: 'write/model', calls: 5, tokensIn: 50, tokensOut: 25, costUsd: 1.25 });
  assert.deepEqual(llm.calls.map((c) => [c.task, c.model]), [['codebook', 'tag/model'], ['tag', 'tag/model'], ['tag', 'tag/model'], ['tag', 'tag/model'], ['summary', 'write/model']]);
  assert.deepEqual([...new Set(steps)], ['Lập bảng mã', 'Gắn mã', 'Tổng hợp']);
  assert.equal(saved.get(id).title, '1 video · 5 comment');
});

test('a batch that fails twice is left untagged and the run continues', async () => {
  const failing = (req) => (numbersIn(req.user).includes(3) ? Object.assign(new Error('x'), { code: 'llm_unavailable' }) : { tags: numbersIn(req.user).map((n) => ({ n, ...none, what: 'phong_van' })) });
  const { f, llm, saved } = setup(good({ tag: failing }));
  const d = saved.get((await f.run({ videos: V })).id).data;
  assert.deepEqual([d.counts.tagged, d.counts.untagged, d.counts.failedBatches], [3, 2, 1]);
  assert.equal(llm.calls.filter((c) => c.task === 'tag').length, 4, 'the failing batch was tried twice');
  assert.ok(d.ideas, 'the summary is still written from what was tagged');
});

test('a failing summary still saves the counted report, and onlyStep3 writes it later with one call', async () => {
  let broken = true;
  const { f, llm, saved } = setup(good({ summary: () => (broken ? Object.assign(new Error('hết quota'), { code: 'llm_unavailable' }) : SUMMARY) }));
  const { id } = await f.run({ videos: V });
  assert.deepEqual([saved.get(id).data.notes, saved.get(id).data.ideas, saved.get(id).data.summaryError], [null, null, 'hết quota']);
  assert.equal(saved.get(id).data.counts.tagged, 5);
  broken = false;
  const before = llm.calls.length;
  assert.deepEqual(await f.run({ onlyStep3: id }), { id });
  assert.equal(llm.calls.length - before, 1);
  const d = saved.get(id).data;
  assert.deepEqual([d.ideas.length, d.summaryError], [1, null]);
  assert.equal(d.usage.calls, 7, '1 codebook + 3 batches + 2 failed summaries, then 1 more');
  await assert.rejects(f.run({ onlyStep3: 999 }), (/** @type {any} */ e) => e.code === 'not_found');
});

test('cancel stops between batches and saves nothing', async () => {
  const { f, saved } = setup(good());
  let n = 0;
  await assert.rejects(f.run({ videos: V }, () => { if (++n === 3) throw new CancelledError(); }), (/** @type {any} */ e) => e.name === 'CancelledError');
  assert.equal(saved.size, 0);
});

test('no key, no videos, no usable comments: clear errors and no model call', async () => {
  const off = setup(good(), { ready: false });
  await assert.rejects(off.f.run({ videos: V }), (/** @type {any} */ e) => e.code === 'llm_no_key');
  const on = setup(good());
  await assert.rejects(on.f.run({ videos: 'abc' }), (/** @type {any} */ e) => e.code === 'invalid_input' && /ít nhất một video/.test(e.message));
  on.state.comments = [COMMENTS[5]];
  await assert.rejects(on.f.run({ videos: V }), (/** @type {any} */ e) => e.code === 'invalid_input' && /Không có comment nào có chữ/.test(e.message));
  assert.equal(off.llm.calls.length + on.llm.calls.length, 0);
});

test('a wrong key stops the job at once; a codebook that fails twice fails the job; every batch failing fails the job', async () => {
  const auth = setup(good({ tag: () => Object.assign(new Error('key'), { code: 'llm_auth' }) }));
  await assert.rejects(auth.f.run({ videos: V }), (/** @type {any} */ e) => e.code === 'llm_auth');
  assert.equal(auth.saved.size, 0);
  const cb = setup(good({ codebook: () => ({}) }));
  await assert.rejects(cb.f.run({ videos: V }), (/** @type {any} */ e) => e.code === 'llm_bad_output');
  assert.equal(cb.llm.calls.length, 2);
  const all = setup(good({ tag: () => ({ tags: [] }) }));
  await assert.rejects(all.f.run({ videos: V }), (/** @type {any} */ e) => e.code === 'llm_unavailable' && /đổi model/.test(e.message));
});

test('empty model settings fall back to the default model (Review Focus #5)', async () => {
  const { f, llm } = setup(good(), { settings: { aiTagModel: '', aiWriteModel: '  ' } });
  await f.run({ videos: V });
  assert.deepEqual([...new Set(llm.calls.map((c) => c.model))], [DEFAULT_MODEL]);
});

test('estimate says how much would be sent and whether a key is set', () => {
  const { f } = setup(good(), { ready: false });
  const e = f.estimate(V);
  assert.deepEqual([e.comments, e.unique, e.dropped, e.ready], [5, 5, 0, false]);
  assert.ok(e.tokens > 10);
});

test('report joins the saved tags with today\'s comments, even after the dataset changed (Review Focus #4)', async () => {
  const { f, state, saved } = setup(good());
  const { id } = await f.run({ videos: V });
  // c2 is gone, a new comment arrived, and an idea points at the comment that is gone.
  state.comments = [...COMMENTS.filter((c) => c.id !== 'c2'), { id: 'new', text: 'Bình luận mới', likes: 100, replies: 0, videoId: V }];
  saved.get(id).data.ideas[0].evidence = ['c2', 'c1'];
  const r = f.report(id);
  assert.equal(r.table.total, 4, 'only comments that are both tagged and still present');
  assert.deepEqual(r.table.dims.what.groups[0].ids, ['c1', 'c3', 'c4', 'c5']);
  assert.equal(r.comments.find((c) => c.id === 'new').w, null);
  assert.equal(r.comments.find((c) => c.id === 'c1').w.what, 'phong_van');
  assert.deepEqual([r.id, r.title, r.createdAt, r.videos.length], [id, '1 video · 5 comment', 5, 1]);
  assert.throws(() => f.report(999), (/** @type {any} */ e) => e.code === 'not_found');
});

test('knowledge is passed to the summary and recorded', async () => {
  const { f, llm, saved } = setup(good(), { knowledge: 'CONCEPT 1: SO SÁNH' });
  const { id } = await f.run({ videos: V });
  assert.match(llm.calls.at(-1).system, /CONCEPT 1: SO SÁNH/);
  assert.equal(saved.get(id).data.hasKnowledge, true);
});

test('the channel profile reaches the summary step only, and the report records whether there was one', async () => {
  const withP = setup(good(), { profileText: 'HỒ SƠ KÊNH (Soulprint)\nAvatar: Lan' });
  const { id } = await withP.f.run({ videos: V });
  assert.match(withP.llm.calls.at(-1).system, /Avatar: Lan/);
  assert.ok(withP.llm.calls.slice(0, -1).every((c) => !/Avatar: Lan/.test(c.system + c.user)));
  assert.equal(withP.saved.get(id).data.hasProfile, true);
  const without = setup(good());
  assert.equal(without.saved.get((await without.f.run({ videos: V })).id).data.hasProfile, false);
});
