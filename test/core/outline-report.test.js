import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outlineMarkdown } from '../../src/core/report/outline.js';
import { cleanOutline, timelineOf, outlineGaps } from '../../src/core/outline/outline.js';
import { cleanCard } from '../../src/core/ideas/card.js';

test('the hand-off: the card, the hook in three layers, the blocks with times, the voice, and no script from the app', () => {
  const card = cleanCard({ topic: 'Phỏng vấn quốc tịch', pain: { text: 'Sợ trượt', evidence: [{ text: 'Em sợ lắm', likes: 9 }] }, belief: { common: 'Phải học thuộc 100 câu', reality: 'Chỉ cần hiểu 20 câu' }, angle: 'Không cần học thuộc', title: { text: 'Đi phỏng vấn mà học thuộc 100 câu là sai' }, leadMagnet: 'Danh sách 20 câu' });
  const outline = cleanOutline({ length: 45, scenes: ['face'], hooks: [{ archetype: 'Contrarian', lean: 'Ai cũng học thuộc 100 câu', interjection: 'Nhưng', snapback: 'Học thuộc lại dễ trượt', text: 'Đừng học thuộc', visual: 'Gấp xấp giấy' }], chosenHook: 0,
    blocks: { lockin: { point: 'Hứa 20 câu' }, body1: { point: 'Vì sao học thuộc dễ trượt', example: 'Bị hỏi lại kiểu khác' }, rehook1: { point: 'Nhưng câu 7 mới khó' }, body2: { point: 'Cách hiểu câu 7' }, cta: { point: 'Comment HỎI để nhận danh sách' } } });
  const md = outlineMarkdown({ card, outline, timeline: timelineOf(outline), gaps: outlineGaps(outline, card) }, { voice: 'Thẳng, vui, xưng mình' });
  assert.match(md, /^# Dàn ý: Đi phỏng vấn mà học thuộc 100 câu là sai/);
  assert.match(md, /- Nỗi đau: Sợ trượt\n {2}- "Em sợ lắm" \(9 tim\)/);
  assert.match(md, /## Hook \(Contrarian\)\n\n- Nghiêng về: Ai cũng học thuộc 100 câu\n- Ngắt: Nhưng\n- Bật ngược: Học thuộc lại dễ trượt\n- Chữ trên màn hình: Đừng học thuộc\n- Hình mở đầu: Gấp xấp giấy/);
  assert.match(md, /### 0:08–0:25 Thân 1\n\nVì sao học thuộc dễ trượt\n\nVí dụ: Bị hỏi lại kiểu khác/);
  assert.match(md, /### 0:42–0:45 CTA\n\nComment HỎI để nhận danh sách/);
  assert.match(md, /## Giọng nói\n\nThẳng, vui, xưng mình/);
  assert.match(md, /skill content-outline/);
  assert.ok(!/Lời thoại:/.test(md));
  const thin = outlineMarkdown({ card, outline: cleanOutline({}), timeline: timelineOf(cleanOutline({})), gaps: ['Chưa chọn hook'] }, { voice: '' });
  assert.match(thin, /> Còn thiếu: Chưa chọn hook/);
  assert.ok(!/## Giọng nói/.test(thin));
});
