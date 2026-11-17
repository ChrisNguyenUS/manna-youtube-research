// The outline of one card as Markdown, to hand to Claude for the words. It carries what to say and in what order;
// it never carries a script written by the app's AI.
import { clock } from '../video/transcript.js';

/**
 * @param {{card: any, outline: any, timeline: {key: string, label: string, from: number, to: number}[], gaps: string[]}} v a card view
 * @param {{voice: string}} o voice: Soulprint's "Giọng nói"
 */
export function outlineMarkdown({ card: c, outline: o, timeline, gaps }, { voice }) {
  const L = [`# Dàn ý: ${c.title.text || c.topic || '(chưa có tiêu đề)'}`, '', `Video ngắn ${o.length} giây.${o.scenes.length ? ` Cảnh quay được: ${o.scenes.join(', ')}${o.sceneNote ? ` (${o.sceneNote})` : ''}.` : ''}`];
  if (gaps.length) L.push('', `> Còn thiếu: ${gaps.join('; ')}.`);
  L.push('', '## Ý tưởng', '');
  const line = (k, v) => v && L.push(`- ${k}: ${v}`);
  line('Topic', c.topic);
  line('Nỗi đau', c.pain.text);
  if (c.pain.evidence.length) L.push(...c.pain.evidence.map((e) => `  - "${e.text}" (${e.likes} tim)`));
  if (c.belief.common || c.belief.reality) line('Người xem đang tin', `${c.belief.common}. Video sẽ chỉ ra: ${c.belief.reality}`);
  line('Góc đi ngược', c.angle);
  line('Lead magnet', c.leadMagnet);
  const h = o.chosenHook == null ? null : o.hooks[o.chosenHook];
  if (h) L.push('', `## Hook${h.archetype ? ` (${h.archetype})` : ''}`, '', `- Nghiêng về: ${h.lean}`, `- Ngắt: ${h.interjection}`, `- Bật ngược: ${h.snapback}`, `- Chữ trên màn hình: ${h.text}`, `- Hình mở đầu: ${h.visual}`);
  L.push('', '## Các khối', '');
  for (const t of timeline) {
    if (t.key === 'hook') continue;
    const b = o.blocks[t.key];
    L.push(`### ${clock(t.from)}–${clock(t.to)} ${t.label}`, '', b.point || '(chưa có)', ...(b.example ? ['', `Ví dụ: ${b.example}`] : []), '');
  }
  const lp = o.loop;
  if (lp.stakes || lp.question || lp.headfake || lp.newLoop) L.push('## Vòng lặp giữ người xem', '', `- Cái đang bị đe doạ: ${lp.stakes}`, `- Câu hỏi lớn: ${lp.question}`, `- Cú đánh lạc hướng: ${lp.headfake}`, `- Chỗ mở vòng mới: ${lp.newLoop}`, '');
  if (voice) L.push('## Giọng nói', '', voice, '');
  L.push('---', '', 'Viết lời thoại theo dàn ý này bằng skill content-outline, rồi soát lại theo checklist tính người và 12 quy tắc viết có hồn.');
  return L.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
