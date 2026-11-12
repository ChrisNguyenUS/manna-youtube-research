import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeTikTok } from '../../src/sources/fake/tiktok.js';
import { tiktokInsightMarkdown } from '../../src/core/report/tiktok.js';

const until = (fn, ms = 3000) => new Promise((res, rej) => { const s = Date.now(); const t = setInterval(() => { if (fn()) (clearInterval(t), res(undefined)); else if (Date.now() - s > ms) (clearInterval(t), rej(new Error('timeout'))); }, 5); });

test('insight: top on-topic videos with comments, question themes, fears, buying, attention ranking', async () => {
  const a = testApp();
  const r = await a.features.tiktokInsight({ keywords: 'thi quốc tịch mỹ', top: 5 }, () => {});
  assert.deepEqual(r.videos.map((v) => v.id).sort(), ['7000000000000000001', '7000000000000000002'], 'off-topic and zero-comment videos skipped');
  assert.equal(r.insight.questions[0].text, 'Phỏng vấn có khó không ạ?');
  assert.equal(r.insight.fears[0].text, 'Em sợ bị đánh trượt lắm');
  assert.equal(r.insight.buying[0].text, 'Dịch vụ giá bao nhiêu vậy');
  const reply = r.comments.find((c) => c.isReply);
  assert.equal(reply.parentText, 'Phỏng vấn có khó không ạ?');
  assert.ok(r.insight.topByAttention[0].attentionPerDay >= r.insight.topByAttention.at(-1).attentionPerDay);
  assert.deepEqual(Object.keys(r.insight.groupCounts).sort(), ['buying', 'fears', 'questions']);
});

test('no commenter identity in record or Markdown (Review Focus #5)', async () => {
  const a = testApp();
  const r = await a.features.tiktokInsight({ keywords: 'thi quốc tịch mỹ' }, () => {});
  const stored = JSON.stringify(a.store.records.get('local', r.id).data);
  assert.doesNotMatch(stored, /unique_id|nickname|"user"/);
  const md = tiktokInsightMarkdown(a.store.records.get('local', r.id).data);
  for (const h of ['## Run info', '## Video đã đọc comment', '## Khách đang hỏi gì', '## Nỗi sợ và rào cản', '## Đang cân nhắc mua', '## Câu chữ thật của khách', '## Comment nổi bật', '## Viết báo cáo từ dữ liệu trên']) assert.ok(md.includes(h), h);
});

test('feature clamps an unsupported top to 10 (HTTP rejects it earlier)', async () => {
  const r = await testApp().features.tiktokInsight({ keywords: 'thi quốc tịch mỹ', top: 7 }, () => {});
  assert.ok(r.videos.length <= 10);
});

test('cancelling insight mid-way saves nothing (Review Focus #4)', async () => {
  const tiktok = createFakeTikTok({ delayMs: 60 });
  const a = testApp(undefined, tiktok);
  a.runner.start();
  const { id } = a.runner.enqueue('local', 'tiktok_insight', { keywords: 'thi quốc tịch mỹ' }, 'x');
  await until(() => a.runner.get(id).status === 'running');
  await new Promise((r) => setTimeout(r, 90));
  a.runner.cancel(id);
  await until(() => a.runner.get(id).status === 'cancelled');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(a.store.records.list('local', 'tiktok_insight').length, 0);
  a.runner.stop();
});

test('comments by link: bad links skipped, good ones saved (Review Focus #2)', async () => {
  const a = testApp();
  const r = await a.features.tiktokComments({ videos: 'https://www.tiktok.com/@a/video/7000000000000000001\nhttps://www.tiktok.com/@a\nrác', max: 100 }, () => {});
  assert.equal(r.jobs.length, 1);
  assert.deepEqual(r.skipped, ['https://www.tiktok.com/@a', 'rác']);
  const rec = a.store.records.get('local', r.jobs[0].id);
  assert.equal(rec.kind, 'tiktok_comments');
  assert.equal(rec.data.insight.counts.fears, 1);
});

test('I4: a link whose comments fail is skipped, the job continues, skipped is saved', async () => {
  const tt = createFakeTikTok();
  const orig = tt.getComments;
  tt.getComments = async (id, o, p) => (id === '7000000000000000002' ? Promise.reject(new Error('TikTok từ chối trang comment')) : orig(id, o, p));
  const a = testApp(undefined, tt);
  const r = await a.features.tiktokComments({ videos: 'https://www.tiktok.com/@a/video/7000000000000000002\nhttps://www.tiktok.com/@a/video/7000000000000000001', max: 100 }, () => {});
  assert.equal(r.jobs.length, 1);
  assert.deepEqual(r.skipped, ['https://www.tiktok.com/@a/video/7000000000000000002']);
  assert.deepEqual(a.store.records.get('local', r.jobs[0].id).data.skipped, ['https://www.tiktok.com/@a/video/7000000000000000002']);
});
