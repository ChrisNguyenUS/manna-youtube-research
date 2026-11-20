// Markdown of one batch of the idea board.
import { LEGO, STATUSES, FUNNEL } from '../ideas/card.js';

const label = (pairs, k) => pairs.find((x) => x[0] === k)?.[1] ?? k;
const OK = { yes: 'có', no: 'chưa', unknown: 'chưa rõ', skip: 'không áp dụng' };
const SRC = { self: 'tự nghĩ', brick: 'thư viện gạch', pain: 'nỗi đau trong Soulprint', '5w1h': 'gợi ý 5W1H', redo: 'làm lại video của bạn', ci: 'cơ hội nội dung (Customer Intelligence)' };

/** @param {{batch: any, cards: any[], counts: any}} b the board of one batch */
export function ideasMarkdown(b) {
  const L = [`# ${b.batch.title}: ${b.counts.live} thẻ`, '', `${b.counts.outlier} thẻ từ video đã thắng, ${b.counts.other} thẻ khác, ${b.counts.ready} thẻ đủ căn cứ để chốt.`];
  b.cards.filter((x) => x.status !== 'dropped').forEach((x, i) => {
    const c = x.card;
    const line = (k, v) => v && L.push(`- ${k}: ${v}`);
    L.push('', `## ${i + 1}. ${c.title.text || c.topic || '(chưa có tiêu đề)'} (${label(STATUSES, x.status)})`, '');
    const s = c.origin.snapshot;
    const src = x.fromWinner ? 'video đã thắng' : c.origin.kind === 'brick' && s?.score != null ? `thư viện gạch, video vượt kênh ${s.score}×` : SRC[c.origin.kind];
    line('Nguồn', `${src}${s?.title ? `: ${s.title}` : s?.text ? `: ${s.text}` : ''}${s?.url ? ` (${s.url})` : ''}`);
    line('Topic', c.topic);
    line('Pillar', c.pillar);
    line('Nỗi đau', c.pain.text);
    if (c.pain.evidence.length) L.push(...c.pain.evidence.map((e) => `  - "${e.text}" (${e.likes} tim)`));
    if (c.belief.common || c.belief.reality) line('Niềm tin sẽ lật', `${c.belief.common} → ${c.belief.reality}`);
    line('Góc', c.angle);
    if (c.title.d || c.title.i || c.title.c || c.title.k) line('DICK', [['Đối tượng', c.title.d], ['Insight', c.title.i], ['Concept', c.title.c], ['Khác', c.title.k]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('; '));
    line('Concept', c.concept);
    line('Phễu', c.funnel && label(FUNNEL, c.funnel));
    line('Lead magnet', c.leadMagnet);
    line('Giữ gạch', c.keep.map((k) => label(LEGO, k)).join(', '));
    line('Làm lại gạch', c.remix.map((k) => label(LEGO, k)).join(', '));
    line('Ngày đăng', c.publishDate);
    L.push(...x.checks.map((q) => `- Câu ${q.key.slice(1)}: ${OK[q.ok]}${q.note ? `. ${q.note}` : ''}`));
  });
  return L.join('\n') + '\n';
}
