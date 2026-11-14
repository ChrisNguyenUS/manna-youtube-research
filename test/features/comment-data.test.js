import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeTikTok } from '../../src/sources/fake/tiktok.js';
import { commentIntents } from '../../src/core/analysis/comment-intents.js';
import { reuseState } from '../../src/core/tiktok/comment-reuse.js';

const L = (id) => `https://www.tiktok.com/@creator/video/${id}`;
const A = '7000000000000000001';

test('intents: several per comment, "other" when none, praise is not "không hay", "chuẩn bị" is not praise', () => {
  assert.deepEqual(commentIntents('Phỏng vấn có khó không ạ? Em sợ bị đánh trượt').intents, ['question', 'concern']);
  assert.deepEqual(commentIntents('Cảm ơn chị, video hay quá').intents, ['positive']);
  assert.deepEqual(commentIntents('video không hay quá').intents, ['other']);
  assert.deepEqual(commentIntents('đang chuẩn bị hồ sơ').intents, ['other']);
  assert.deepEqual(commentIntents('😂😂').intents, ['other']);
  assert.equal(commentIntents('Để lại số điện thoại, chuyên viên bên em liên hệ').seller, true);
});

test('collected comments become one dataset: videos with counts, comments with intents, history with the video', async () => {
  const a = testApp();
  await a.features.tiktokComments({ videos: L(A), max: 100, replies: true });
  await a.features.tiktokComments({ videos: L(A), max: 100, replies: true });
  const vids = a.features.commentData.videos();
  assert.equal(vids.length, 1);
  assert.deepEqual([vids[0].id, vids[0].parents, vids[0].replies, vids[0].collections.length], [A, 3, 1, 2]);
  assert.equal(vids[0].caption, 'Phỏng vấn quốc tịch Mỹ đậu rồi', 'caption read from the video page');
  const got = a.features.commentData.comments([A]);
  assert.equal(got.comments.length, 4, 'collected twice, stored once');
  assert.deepEqual(got.comments.find((c) => c.id === 'c1').intents, ['question']);
  assert.equal(got.comments.find((c) => c.id === 'r1').parentText, 'Phỏng vấn có khó không ạ?');
  const runs = a.features.commentData.collections();
  assert.deepEqual(runs.map((r) => [r.parents, r.replies, r.timesCollected]), [[3, 1, 2], [3, 1, 2]]);
});

test('reuse states come from what earlier runs got: ready, all collected, missing N, replies never read', () => {
  const run = (o) => ({ kind: 'tiktok_comments', params: { max: 100, replies: true }, createdAt: 1, parents: 100, total: 150, ...o });
  const cov = (parents, replies = 0) => ({ parents, replies, lastSeen: 5 });
  assert.equal(reuseState(cov(100, 40), [run()], { max: 100, replies: true }).state, 'ready');
  const ex = reuseState(cov(42, 10), [run({ parents: 42, createdAt: 7 })], { max: 300, replies: true });
  assert.deepEqual([ex.state, ex.exhaustedAt], ['exhausted', 7], 'asked 100, got 42: the video had no more');
  const part = reuseState(cov(100), [run()], { max: 300, replies: true });
  assert.deepEqual([part.state, part.missing], ['partial', 200], 'got all 100 asked for: more may exist');
  assert.equal(reuseState(cov(100), [run({ params: { max: 100, replies: false } })], { max: 100, replies: true }).state, 'partial', 'replies never collected');
  assert.equal(reuseState(undefined, [], { max: 100, replies: true }).state, 'none');
});

test('Video Analysis reuses collected comments when the dataset allows it, and reads TikTok otherwise', async () => {
  const tt = createFakeTikTok();
  const a = testApp(undefined, tt);
  await a.features.tiktokComments({ videos: L(A), max: 100, replies: false });
  // Replies asked for but never collected: read again.
  let before = tt.stats().requests;
  let r = await a.features.tiktokVideoAnalysis({ videos: L(A), script: false, comments: 100, replies: true, reuse: true });
  let e = a.store.records.get('local', r.id).data.videos[0];
  assert.equal(e.commentsReused, null);
  assert.ok(tt.stats().requests - before >= 2, 'video page + comments');
  // Now an earlier run asked for 100 parents with replies and got 3: all there was. Reused, no comment request.
  before = tt.stats().requests;
  r = await a.features.tiktokVideoAnalysis({ videos: L(A), script: false, comments: 300, replies: true, reuse: true });
  e = a.store.records.get('local', r.id).data.videos[0];
  assert.deepEqual([e.commentsReused.state, e.commentsReused.parents, e.commentsReused.replies], ['exhausted', 3, 1]);
  assert.equal(tt.stats().requests - before, 1, 'only the video page');
  // Reuse off: always read TikTok.
  before = tt.stats().requests;
  await a.features.tiktokVideoAnalysis({ videos: L(A), script: false, comments: 100, replies: true, reuse: false });
  assert.ok(tt.stats().requests - before >= 2);
});
