// Markdown of a 5W1H report, complete enough to hand to Claude without opening the app.
import { DIMS, DIM_INFO } from '../ai/five-w.js';

const FUNNEL_LABELS = { biet: 'Biết', thich: 'Thích', tin: 'Tin', yeu: 'Yêu' };
const num = (n) => Number(n || 0).toLocaleString('vi-VN');
const PER_GROUP = 8;

/** @param {{title: string, createdAt: number, videos: any[], comments: any[], table: any, data: any}} r the object features.comment5w1h.report() returns */
export function fiveWMarkdown(r) {
  const d = r.data;
  const byId = new Map(r.comments.map((c) => [String(c.id), c]));
  const quote = (id) => (byId.has(id) ? `"${String(byId.get(id).text).replace(/\s+/g, ' ').trim()}"` : null);
  const quotes = (ids) => ids.map(quote).filter(Boolean).join(' · ');
  const label = (dim, key) => d.codebook[dim].find((g) => g.key === key)?.label ?? key;
  const u = d.usage;
  const out = [
    `# 5W1H comment TikTok: ${r.title}`,
    '',
    `${num(r.table.total)} comment đã xếp nhóm${d.counts.untagged ? `, ${num(d.counts.untagged)} chưa phân loại` : ''}${d.counts.dropped ? `, ${num(d.counts.dropped)} bị bỏ vì vượt giới hạn` : ''}. Ngày ${new Date(r.createdAt).toISOString().slice(0, 10)}.`,
    `Nhận định do AI viết, số đếm do app tính. Model gắn mã: ${u.tagModel}. Model tổng hợp: ${u.writeModel}. ${num(u.tokensIn + u.tokensOut)} token${u.costUsd == null ? '' : `, $${u.costUsd.toFixed(4)}`}.`,
    '',
    '## Video',
    ...r.videos.map((v) => `- ${v.caption || v.url}${v.author ? ` (@${v.author})` : ''}: ${v.url}`),
  ];
  if (!d.notes) out.push('', `> AI chưa viết được phần nhận định và gợi ý (${d.summaryError || 'không rõ lỗi'}). Các nhóm và số đếm bên dưới vẫn đúng.`);
  for (const dim of DIMS) {
    const t = r.table.dims[dim];
    out.push('', `## ${DIM_INFO[dim][0]}: ${DIM_INFO[dim][1]}`, '');
    if (!t.enough) {
      out.push('Không đủ dữ liệu: bình luận gần như không nói về chiều này.');
      continue;
    }
    const notes = d.notes?.[dim] ?? [];
    if (notes.length) out.push(...notes.map((n) => `- ${n.text}`), '');
    for (const g of t.groups) {
      out.push(`### ${g.label} (${num(g.count)} comment)`);
      out.push(...g.ids.slice(0, PER_GROUP).map((id) => { const c = byId.get(id); return `- "${String(c.text).replace(/\s+/g, ' ').trim()}" (${num(c.likes)} tim, ${num(c.replies)} trả lời)`; }), '');
    }
    if (out.at(-1) === '') out.pop();
  }
  if (d.ideas?.length) {
    out.push('', '## Gợi ý content', '', 'Các gợi ý này dựa trên nỗi đau trong comment. Chưa đối chiếu với video đã thắng.');
    d.ideas.forEach((x, i) => {
      out.push('', `### ${i + 1}. ${x.title}`);
      if (x.who) out.push(`- Ai: ${label('who', x.who)}`);
      if (x.pain) out.push(`- Nỗi đau: ${x.pain}`);
      if (x.belief) out.push(`- Đang tin: ${x.belief.text}${quotes(x.belief.evidence) ? ` (${quotes(x.belief.evidence)})` : ''}`);
      if (x.concept) out.push(`- Concept: ${x.concept}${x.extraConcepts.length ? ` (phụ: ${x.extraConcepts.join(', ')})` : ''}`);
      if (x.funnel) out.push(`- Phễu: ${FUNNEL_LABELS[x.funnel]}`);
      out.push('- Chưa có tiền lệ outlier');
      if (quotes(x.evidence)) out.push(`- Bằng chứng: ${quotes(x.evidence)}`);
    });
  }
  return out.join('\n') + '\n';
}
