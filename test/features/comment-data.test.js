import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeTikTok } from '../../src/sources/fake/tiktok.js';
import { commentIntents } from '../../src/core/analysis/comment-intents.js';

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

test('Video Analysis reuses comments already collected only when enough were collected', async () => {
  const tt = createFakeTikTok();
  const a = testApp(undefined, tt);
  await a.features.tiktokComments({ videos: L(A), max: 100, replies: true });
  const calls = () => tt.stats().requests;
  // 3 parent comments collected; asking for 100 of a video with 40 comments in total: not enough → read again.
  let before = calls();
  let r = await a.features.tiktokVideoAnalysis({ videos: L(A), script: false, comments: 100, reuse: true });
  let e = a.store.records.get('local', r.id).data.videos[0];
  assert.equal(e.commentsReused, null);
  assert.ok(calls() - before >= 2, 'video page + comments');
  // Pretend the video has only 4 comments: the collected ones are all of them → reused, no comment request.
  tt.state.videoComments = 4;
  before = calls();
  r = await a.features.tiktokVideoAnalysis({ videos: L(A), script: false, comments: 100, reuse: true });
  e = a.store.records.get('local', r.id).data.videos[0];
  assert.deepEqual([e.commentsReused.parents, e.commentsReused.replies], [3, 1]);
  assert.equal(e.comments.length, 4);
  assert.equal(calls() - before, 1, 'only the video page');
});
