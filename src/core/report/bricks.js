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
