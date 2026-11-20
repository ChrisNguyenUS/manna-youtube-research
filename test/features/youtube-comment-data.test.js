import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { youtubeCommentsIn } from '../../src/features/youtube-comment-data.js';

test('collected YouTube comments: Lấy comment, Insight and research runs, one entry per video, a comment counted once', async () => {
  const a = testApp();
  await a.features.fetchComments({ videos: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', max: 100 }, () => {});
  await a.features.fetchComments({ videos: 'aaaaaaaaaaa', max: 100 }, () => {}); // same video again: same comment
  const ins = await a.features.youtubeInsight({ keywords: 'lịch sử', top: 5, commentsPerVideo: 100 }, () => {});
  const vids = a.features.youtubeCommentData.videos();
  const one = vids.find((v) => v.id === 'aaaaaaaaaaa');
  assert.equal(one.total, 1, 'collected twice, counted once');
  assert.deepEqual(one.collections.map((c) => c.kind).sort(), ['comments', 'comments', 'youtube_insight'], 'twice by link, once in the Insight report');
  assert.equal(one.url, 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
  for (const v of ins.videos) assert.ok(vids.some((x) => x.id === v.id && x.collections.some((c) => c.kind === 'youtube_insight')), v.id);

  const d = a.features.youtubeCommentData.comments(['aaaaaaaaaaa', ins.videos[0].id]);
  assert.equal(d.videos.length, 2);
  assert.equal(d.comments.length, 2);
  assert.ok(d.comments.every((c) => Array.isArray(c.intents) && c.createdAt));
  assert.ok(d.counts && d.themes.topics);
});

test('research keeps the comments it reads from now on, and they are collected; older reports (summary only) give none', async () => {
  const a = testApp();
  const r = await a.features.research({ topic: 'lịch sử', perKeyword: 10 }, () => {});
  await a.features.researchComments(r.id, { top: 2, max: 50 }, () => {});
  const rec = a.store.records.get('local', r.id);
  assert.ok(rec.data.comments.list.length > 0);
  assert.ok(a.features.youtubeCommentData.videos().some((v) => v.collections.some((c) => c.kind === 'research')));
  assert.deepEqual(youtubeCommentsIn({ kind: 'research', data: { videos: [], comments: { total: 3, insights: {} } } }), []);
});

test('Thu thập bình luận on YouTube: runs with their counts (newest first, repeats marked) and coverage of chosen videos', async () => {
  const a = testApp();
  const first = await a.features.fetchComments({ videos: 'aaaaaaaaaaa', max: 100 }, () => {});
  await a.features.fetchComments({ videos: 'https://youtu.be/aaaaaaaaaaa', max: 100 }, () => {});
  assert.equal(first.inline, true, 'the screen gets the run as is, like TikTok');
  assert.equal(first.jobs.length, 1);
  const runs = a.features.youtubeCommentData.collections();
  assert.equal(runs.length, 2);
  assert.ok(runs[0].createdAt >= runs[1].createdAt);
  assert.deepEqual([runs[0].video.id, runs[0].video.url, runs[0].timesCollected], ['aaaaaaaaaaa', 'https://www.youtube.com/watch?v=aaaaaaaaaaa', 2]);
  assert.equal(runs[0].parents + runs[0].replies, runs[0].total);
  const cov = a.features.youtubeCommentData.coverage(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  assert.deepEqual(cov.map((c) => c.videoId), ['aaaaaaaaaaa'], 'a video never collected is left out');
  assert.equal(cov[0].parents + cov[0].replies, 1);
});
