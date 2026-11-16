import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fiveWMarkdown } from '../../src/core/report/five-w.js';

const none = { who: null, what: null, why: null, when: null, where: null, how: null };
const group = { key: 'phong_van', label: 'Phỏng vấn', description: '', count: 2, ids: ['c1', 'c2'] };
const dim = (groups, enough = true) => ({ tagged: groups.length ? 2 : 0, share: groups.length ? 1 : 0, enough, groups });
const REPORT = {
  id: 3, title: '1 video · 2 comment', createdAt: Date.UTC(2026, 10, 16),
  videos: [{ id: '7000000000000000001', url: 'https://www.tiktok.com/video/7000000000000000001', caption: 'Phỏng vấn đậu rồi', author: 'monica' }],
  comments: [{ id: 'c1', text: 'Phỏng vấn có khó không?', likes: 9, replies: 1 }, { id: 'c2', text: 'Em sợ trượt', likes: 2, replies: 0 }],
  table: { total: 2, dims: { who: dim([], false), what: dim([group]), why: dim([], false), when: dim([], false), where: dim([], false), how: dim([], false) } },
  data: {
    counts: { sent: 2, tagged: 2, untagged: 0, dropped: 0, failedBatches: 0, badTags: 0, badRefs: 0 }, hasKnowledge: true, summaryError: null,
    codebook: { who: [{ key: 'nguoi_bao_lanh', label: 'Người bảo lãnh', description: '' }], what: [group], why: [], when: [], where: [], how: [] },
    notes: { ...Object.fromEntries(['who', 'why', 'when', 'where', 'how'].map((d) => [d, []])), what: [{ text: 'Ai cũng hỏi về phỏng vấn', keys: ['phong_van'] }] },
    ideas: [{ title: 'Phỏng vấn hỏi gì', who: 'nguoi_bao_lanh', pain: 'sợ trượt', belief: { text: 'phỏng vấn rất khó', evidence: ['c2', 'gone'] }, concept: 'Bật mí bí mật', extraConcepts: ['Số'], funnel: 'biet', evidence: ['c1'] }],
    usage: { tagModel: 'a/b', writeModel: 'c/d', calls: 3, tokensIn: 1200, tokensOut: 300, costUsd: 0.0123 },
  },
};

test('markdown: header with model and cost, every dimension, groups with real comments, ideas with evidence', () => {
  const md = fiveWMarkdown(REPORT);
  assert.match(md, /^# 5W1H comment TikTok: 1 video · 2 comment/);
  assert.match(md, /2 comment đã xếp nhóm/);
  assert.match(md, /a\/b.*c\/d.*1\.500 token.*\$0\.0123/s);
  assert.match(md, /## What: Họ nói về chuyện gì, vướng việc gì\n\n- Ai cũng hỏi về phỏng vấn\n\n### Phỏng vấn \(2 comment\)\n- "Phỏng vấn có khó không\?" \(9 tim, 1 trả lời\)/);
  assert.match(md, /## Who: [^\n]+\n\nKhông đủ dữ liệu/);
  assert.match(md, /### 1\. Phỏng vấn hỏi gì\n- Ai: Người bảo lãnh\n- Nỗi đau: sợ trượt\n- Đang tin: phỏng vấn rất khó \("Em sợ trượt"\)\n- Concept: Bật mí bí mật \(phụ: Số\)\n- Phễu: Biết\n- Chưa có tiền lệ outlier\n- Bằng chứng: "Phỏng vấn có khó không\?"/);
});

test('markdown: a report without the AI summary says so instead of breaking', () => {
  const md = fiveWMarkdown({ ...REPORT, data: { ...REPORT.data, notes: null, ideas: null, summaryError: 'hết quota', usage: { ...REPORT.data.usage, costUsd: null } } });
  assert.match(md, /AI chưa viết được phần nhận định và gợi ý \(hết quota\)/);
  assert.ok(!/\$/.test(md.split('\n').slice(0, 6).join('\n')), 'no cost line when the provider gave none');
  assert.match(md, /### Phỏng vấn \(2 comment\)/);
});
