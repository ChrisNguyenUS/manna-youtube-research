// test/http/video-analysis-export.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from '../features/helpers.js';
import { createHttpServer } from '../../src/http/server.js';
import { FAKE_GONE_ID } from '../../src/sources/fake/tiktok.js';
import { videoAnalysisMarkdown, transcriptNoteText } from '../../src/core/report/video-analysis.js';

const L = (id) => `https://www.tiktok.com/@creator/video/${id}`;
async function boot() {
  const app = testApp();
  const srv = createHttpServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  const base = `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`;
  const { id } = await app.features.tiktokVideoAnalysis({ videos: `${L('7000000000000000001')}\n${L(FAKE_GONE_ID)}\n${L('7000000000000000002')}` }, () => {});
  return { app, base, id, close: () => srv.close() };
}

test('Markdown of the batch: compare table, then each video with hook, script and quoted comments', async () => {
  const s = await boot();
  const r = await fetch(`${s.base}/api/v1/records/${s.id}/export.md`);
  assert.match(r.headers.get('content-disposition') || '', /attachment/);
  const md = await r.text();
  assert.match(md, /^# Phân tích video TikTok — 3 video/);
  assert.match(md, /Không có tên người bình luận/);
  assert.match(md, /\| # \| Video \| Kênh \| View \|/);
  assert.match(md, /## 1\. Phỏng vấn quốc tịch Mỹ đậu rồi/);
  assert.match(md, /\*\*Mở đầu:\*\* Phỏng vấn quốc tịch Mỹ đậu rồi hôm nay mình kể lại từng câu hỏi/);
  assert.match(md, /\[0:00\] Phỏng vấn quốc tịch Mỹ đậu rồi\n\[0:03\] hôm nay mình kể lại từng câu hỏi/);
  assert.match(md, /Phụ đề tự động/);
  assert.match(md, /- \(♥50 ↩1\) Phỏng vấn có khó không ạ\?/);
  assert.match(md, /## 2\. [^\n]*\n\nLink: [^\n]*\n\n> Không phân tích được: Video không còn hoặc đang để riêng tư/);
  assert.match(md, /## 3\. Kinh nghiệm thi quốc tịch mỹ[\s\S]*Video không có phụ đề/);
  s.close();
});

test('Markdown of one video: ?video=N (1-based); out of range → 400', async () => {
  const s = await boot();
  const one = await (await fetch(`${s.base}/api/v1/records/${s.id}/export.md?video=3&inline=1`)).text();
  assert.match(one, /^# Kinh nghiệm thi quốc tịch mỹ/);
  assert.ok(!one.includes('Phỏng vấn quốc tịch Mỹ đậu rồi hôm nay'));
  assert.ok(!one.includes('| # | Video |'), 'no compare table for a single video');
  assert.equal((await fetch(`${s.base}/api/v1/records/${s.id}/export.md?video=9`)).status, 400);
  assert.equal((await fetch(`${s.base}/api/v1/records/${s.id}/export.md?video=abc`)).status, 400);
  s.close();
});

test('CSV: one line per video, failed and script-less rows included', async () => {
  const s = await boot();
  const csv = await (await fetch(`${s.base}/api/v1/records/${s.id}/export.csv`)).text();
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /Link.*Caption.*Kênh.*View.*Tỉ lệ tương tác.*Mở đầu.*Số từ.*Tốc độ nói.*Comment đã đọc.*Ghi chú script.*Lỗi/);
  assert.match(lines[1], /7000000000000000001.*Phỏng vấn quốc tịch Mỹ đậu rồi hôm nay/);
  assert.match(lines[2], /7000000000000000009.*Video không còn hoặc đang để riêng tư/);
  assert.match(lines[3], /Video không có phụ đề/);
  s.close();
});

test('report helpers stand on their own', () => {
  assert.equal(transcriptNoteText('none'), 'Video không có phụ đề');
  assert.equal(transcriptNoteText('off'), 'Không lấy script');
  assert.equal(transcriptNoteText(null), '');
  assert.match(videoAnalysisMarkdown({ platform: 'tiktok', analyzedAt: '2026-11-13T00:00:00.000Z', videos: [] }), /0 video/);
});

test('a job started from the screen is named by how many videos it has, not by its pasted links', async () => {
  const s = await boot();
  s.app.runner.start();
  const post = (body) => fetch(`${s.base}/api/v1/jobs/tiktok_video_analysis`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const one = await post({ videos: L('7000000000000000001'), comments: 0 });
  const two = await post({ videos: `${L('7000000000000000001')}\n${L('7000000000000000002')}`, comments: 0 });
  const title = async (id) => (await (await fetch(`${s.base}/api/v1/jobs/${id}`)).json()).title;
  try {
    assert.equal(await title(one.id), '1 video');
    assert.equal(await title(two.id), '2 video');
  } finally {
    // A failed assertion must still stop the runner and the server, or the test process never exits.
    s.app.runner.stop();
    s.close();
  }
});
