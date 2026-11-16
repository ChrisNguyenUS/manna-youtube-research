// The web UI has no DOM tests; this pins the wiring a refactor could silently drop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KINDS, recordHref, jobHref } from '../web/kinds.js';

test('5W1H is a known result kind that opens on its own screen', () => {
  assert.deepEqual(KINDS.comment_5w1h, { label: '5W1H comment (AI)', path: '/tiktok/5w1h', icon: 'target', platform: 'tiktok' });
  assert.equal(recordHref({ id: 7, kind: 'comment_5w1h' }), '#/tiktok/5w1h?id=7');
  assert.equal(jobHref({ kind: 'comment_5w1h', status: 'succeeded', result: { id: 9 } }), '#/tiktok/5w1h?id=9');
});

test('the screen is a tab next to Thu thập bình luận, has a job label and a way in from the comment screen', () => {
  assert.match(fs.readFileSync('web/app.js', 'utf8'), /\['\/tiktok\/5w1h', '5W1H \(AI\)', \(\) => import\('\.\/views\/tiktok\/five-w\.js'\)\]/);
  assert.match(fs.readFileSync('web/lib.js', 'utf8'), /comment_5w1h: 'Phân tích 5W1H \(AI\)'/);
  assert.match(fs.readFileSync('web/views/tiktok/comments.js', 'utf8'), /href="#\/tiktok\/5w1h"/);
});

test('settings ask for the OpenRouter key and two models, and no longer say "sắp có"', () => {
  const src = fs.readFileSync('web/views/settings.js', 'utf8');
  for (const k of ['aiKey', 'aiTagModel', 'aiWriteModel']) assert.match(src, new RegExp(`data-k="${k}"`));
  assert.ok(!/sắp có|aiProvider/.test(src));
});

test('the report screen says who wrote what, and labels every idea as lacking an outlier precedent', () => {
  const src = fs.readFileSync('web/views/tiktok/five-w.js', 'utf8');
  assert.match(src, /Nhận định do AI viết, số đếm do app tính/);
  assert.match(src, /Chưa có tiền lệ outlier/);
  assert.match(src, /không đủ dữ liệu/i);
  assert.match(src, /Chưa nhập API key OpenRouter/);
});

test('the report is a tab strip with one panel and uppercase field labels', () => {
  const src = fs.readFileSync('web/views/tiktok/five-w.js', 'utf8');
  for (const s of ['fw-tabs', 'role="tablist"', 'data-panel', 'CÂU HỎI', 'NHẬN ĐỊNH', 'NHÓM', 'BÌNH LUẬN CỦA NHÓM', 'DÀNH CHO', 'NỖI ĐAU', 'ĐANG TIN', 'CONCEPT', 'PHỄU', 'BẰNG CHỨNG']) assert.ok(src.includes(s), s);
  assert.ok(!src.includes('fw-grid'));
});
