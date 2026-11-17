// Markdown of brick-library rows, to hand to Claude or keep as notes.
import { clock } from '../video/transcript.js';
import { AUDIENCE, BLOCK_LABELS } from '../bricks/schema.js';

const FIT = { yes: 'có', no: 'không', unclear: 'chưa rõ' };
const PLATFORM = { tiktok: 'TikTok', youtube: 'YouTube' };

/** @param {any} r a row as features.bricks.get() returns it (bricks with the owner's edits applied) */
export function brickSection(r) {
  const b = r.bricks;
  const m = r.meta;
  const L = [`## ${m.title || r.videoId}`, '', `${PLATFORM[r.platform] ?? r.platform}${m.channelTitle ? ` · ${m.channelTitle}` : ''}${m.views != null ? ` · ${Number(m.views).toLocaleString('vi-VN')} view` : ''}${m.score != null ? ` · vượt kênh ${m.score}×` : ''} · ${m.url}`, ''];
  if (b.flags.noTranscript) L.push('> Video không có lời thoại: gạch được bóc từ tiêu đề và bình luận.', '');
  if (b.flags.truncated) L.push('> Video dài: chỉ 20 phút đầu được đọc.', '');
  const line = (label, value) => value && L.push(`- ${label}: ${value}`);
  line('Topic', b.topic);
  line('Pillar', b.pillar);
  line('Ý tưởng gốc', b.seed);
  line('Góc tiếp cận', b.angle);
  if (b.belief) (line('Niềm tin phổ biến', b.belief.common), line('Thực tế', b.belief.reality));
  line('Concept', [b.concept, ...b.extraConcepts].filter(Boolean).join(' · '));
  if (b.facts.length) L.push('- Sự thật chính:', ...b.facts.map((f) => `  - ${f}`));
  line('Hook nguyên văn', b.hook.spoken && `*${b.hook.spoken}*`);
  line('Công thức hook', b.hook.formula && `*${b.hook.formula}*`);
  line('Kiểu hook', [b.hook.archetype, b.hook.category].filter(Boolean).join(' · '));
  line('Cách kể', [b.story.category, b.story.description].filter(Boolean).join(': '));
  if (b.story.blocks.length) L.push('- Các khối:', ...b.story.blocks.map((x) => `  - ${clock(x.from)}${x.to != null ? `–${clock(x.to)}` : ''} ${BLOCK_LABELS[x.type] ?? x.type}: ${x.summary}`));
  line('Hình và tiếng', [b.visual.format, b.visual.keyVisuals, b.visual.audio].filter(Boolean).join(' · '));
  if (b.audience.total) line('Khán giả', AUDIENCE.filter(([k]) => b.audience.counts[k]).map(([k, l]) => `${l} ${b.audience.counts[k]}`).join(', '));
  if (b.fit.verdict !== 'unclear' || b.fit.reason) line('Hợp kênh', `${FIT[b.fit.verdict]}${b.fit.reason ? `. ${b.fit.reason}` : ''}`);
  if (b.flags.unsupported.length) L.push('', `> AI không dẫn được căn cứ cho: ${b.flags.unsupported.join(', ')}.`);
  return L.join('\n');
}

/** @param {any[]} rows */
export const bricksMarkdown = (rows) => [`# Thư viện gạch: ${rows.length} video`, '', 'Gạch do AI bóc từ lời thoại và bình luận, đã gồm phần chủ kênh sửa tay. Đây là quan sát, không phải kết luận vì sao video thắng.', '', ...rows.map(brickSection)].join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n';

/** @param {any} r a full library row with its deep dive */
export function deepDiveMarkdown(r) {
  const d = r.deepDive;
  if (!d) return `# ${r.meta.title || r.videoId}\n\nVideo này chưa được đào sâu.\n`;
  const list = (items) => items.map((x) => `- ${x}`).join('\n');
  const factors = (items) => items.map((x, i) => `${i + 1}. **${x.what}** ${x.why}`).join('\n\n') || '(không có)';
  return [`# Đào sâu: ${r.meta.title || r.videoId}`, '', `${r.meta.channelTitle ?? ''} · ${r.meta.url ?? ''}`, '', '> AI viết theo phương pháp Quan sát, Phân tích, Đúc kết. AI không xem được hình và không nghe được tiếng; mọi nhận định là giả thiết.',
    d.flagged.length ? `> Còn ${d.flagged.length} câu trong phần đúc kết dùng từ chưa đủ đời thường.` : '',
    '## Điểm ấn tượng', list(d.impressions), '## Hình thức', d.form,
    '## Nội dung theo thời gian', `- 3 giây đầu: ${d.timeline.first3s}\n- 10 giây tiếp: ${d.timeline.next10s}\n- 30 giây tiếp: ${d.timeline.next30s}\n- Câu kết: ${d.timeline.ending}\n- Cách triển khai: ${d.timeline.overall}`,
    '## Bình luận', d.comments,
    '## Nhận định', `- Clip nói về: ${d.verdict.about}\n- Nhắm tới: ${d.verdict.audience}\n- Cảm xúc: ${d.verdict.emotion}\n- Thông điệp: ${d.verdict.message}`, d.verdict.special.length ? `Điểm đặc biệt:\n${list(d.verdict.special)}` : '',
    '## Giả thiết', d.hypotheses.map((h) => `- Nếu bỏ "${h.factor}": ${h.ifRemoved}`).join('\n'),
    '## Đúc kết', '### Yếu tố cốt lõi', factors(d.core), '### Yếu tố bổ trợ', factors(d.support),
    `## Công thức triển khai: ${d.formula.name}`, d.formula.appliesTo ? `Áp dụng cho: ${d.formula.appliesTo}` : '', d.formula.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    '## Tự phản biện', list(d.doubts)].filter(Boolean).join('\n\n') + '\n';
}
