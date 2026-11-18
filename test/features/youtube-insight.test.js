import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { tiktokInsightMarkdown } from '../../src/core/report/tiktok.js';
import { JOB_SCHEMAS } from '../../src/http/routes/jobs.js';
import { validate } from '../../src/http/validate.js';

test('youtube insight: hottest videos by views/day, their comments, the same customer-voice report as TikTok', async () => {
  const a = testApp();
  const r = await a.features.youtubeInsight({ keywords: 'lịch sử', top: 5, commentsPerVideo: 100, minDur: 240, maxDur: 1200 }, () => {});
  assert.ok(r.videos.length > 0 && r.videos.length <= 5);
  for (let i = 1; i < r.videos.length; i++) assert.ok((r.videos[i - 1].viewsPerDay ?? -1) >= (r.videos[i].viewsPerDay ?? -1), 'hottest first');
  const v = r.videos[0];
  assert.equal(v.url, `https://www.youtube.com/watch?v=${v.id}`);
  assert.equal(v.plays, v.views, 'read by the insight screens under the TikTok names');
  assert.equal(r.comments[0].videoId, r.videos.find((x) => x.id === r.comments[0].videoId).id);
  assert.ok(r.comments[0].createdAt, 'YouTube age turned into a date');
  assert.ok(r.comments[0].attentionPerDay > 0);
  assert.deepEqual(Object.keys(r.insight.groupCounts).sort(), ['buying', 'fears', 'questions']);
  assert.equal(r.insight.questions[0].text, 'Làm phần 2 đi ad?');
  const rec = a.store.records.get('local', r.id);
  assert.equal(rec.kind, 'youtube_insight');
  assert.equal(a.store.records.list('local', 'video_search').length, 0, 'the search itself is not kept');
  assert.ok(a.features.tiktokInsightTopics(r.id).topics, 'topic explorer reads YouTube reports too');
  const md = tiktokInsightMarkdown(rec.data);
  assert.ok(md.startsWith('# Insight YouTube: lịch sử'));
  assert.ok(md.includes('| # | Tiêu đề | Kênh |'));
  assert.ok(md.includes('cào từ YouTube') && !md.includes('TikTok'), 'says where the data comes from');
});

test('youtube insight job input: duration and region allowed, unsupported scale rejected', () => {
  const s = JOB_SCHEMAS.youtube_insight;
  assert.equal(validate(s, { keywords: 'x', gl: 'US', upload: 'month', minDur: 240, maxDur: 1200, top: 10, commentsPerVideo: 300 }).ok, true);
  assert.equal(validate(s, { keywords: 'x', top: 7 }).ok, false);
  assert.equal(validate(s, { keywords: 'x', commentsPerVideo: 50 }).ok, false);
});
