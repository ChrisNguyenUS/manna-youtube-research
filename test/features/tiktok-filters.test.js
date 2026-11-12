// Video filters (views, likes, age, engagement) and comment filtering, ported from the tiktok-actors pipeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeTikTok, FAKE_COMMENTS } from '../../src/sources/fake/tiktok.js';
import { hasWords, classifyComment } from '../../src/core/analysis/text.js';
import { tiktokInsightMarkdown } from '../../src/core/report/tiktok.js';

const V1 = '7000000000000000001'; // 900 like, 9.7% tương tác, 2 ngày
const V2 = '7000000000000000002'; // 300 like, 3.7%, 10 ngày
const V4 = '7000000000000000004'; // 500 like, 5.3%, 1 ngày, 0 comment

test('search: min likes, min views, max age and min engagement drop videos and are counted', async () => {
  const a = testApp();
  const ids = async (p) => (await a.features.tiktokSearch({ keywords: 'thi quốc tịch mỹ', ...p }, () => {}, { save: false })).videos.map((v) => v.id);
  assert.deepEqual(await ids({ minLikes: 400 }), [V1, V4]);
  assert.deepEqual(await ids({ maxAgeDays: 5 }), [V1, V4]);
  assert.deepEqual(await ids({ minEngagement: 5 }), [V1, V4]);
  assert.deepEqual(await ids({ minPlays: 10001 }), []);
  const r = await a.features.tiktokSearch({ keywords: 'thi quốc tịch mỹ', minLikes: 400 }, () => {}, { save: false });
  assert.equal(r.counts.belowFilters, 1);
});

test('insight reads comments only from videos that pass the filters', async () => {
  const a = testApp();
  const r = await a.features.tiktokInsight({ keywords: 'thi quốc tịch mỹ', top: 5, minEngagement: 5 }, () => {});
  assert.deepEqual(r.videos.map((v) => v.id), [V1]);
});

test('hasWords: emoji, stickers and bare @tags are not readable', () => {
  for (const t of ['😂😂😂', '@… @…', '[sticker]', 'a', '']) assert.equal(hasWords(t), false, t);
  for (const t of ['ok', 'Hay quá 😂', 'n400']) assert.equal(hasWords(t), true, t);
});

test('Vietnamese questions without "?" are caught', () => {
  for (const t of ['cho em hỏi diện này mất mấy tháng', 'đậu chưa ạ', 'phỏng vấn có khó không', 'thi lại được ko']) assert.equal(classifyComment(t).question, true, t);
  for (const t of ['hay quá', 'không khó đâu bạn']) assert.equal(classifyComment(t).question, false, t);
});

test('insight leaves out unreadable comments and quotes show the video rank', async () => {
  const tt = createFakeTikTok({ comments: [...FAKE_COMMENTS, { id: 'e1', parentId: null, isReply: false, text: '😂😂😂', likes: 999, replies: 0, createdAt: new Date().toISOString(), pinned: false }] });
  const a = testApp(undefined, tt);
  const r = await a.features.tiktokInsight({ keywords: 'thi quốc tịch mỹ', top: 5 }, () => {});
  assert.ok(!r.insight.topByAttention.some((c) => c.id === 'e1'));
  const md = tiktokInsightMarkdown(a.store.records.get('local', r.id).data);
  const line = md.split('## Khách lo sợ')[1].split('\n').find((l) => l.startsWith('- '));
  assert.match(line, /video #1/);
});
