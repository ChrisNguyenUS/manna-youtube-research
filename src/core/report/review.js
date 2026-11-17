// A reviewed batch as Markdown: the ranking by game, the bricks of the two halves, the bottom half's differences, and
// what was kept when the batch was closed. Counting only; it never claims a cause.
import { rowText } from '../ideas/review.js';

const n = (v) => (v == null ? '–' : String(v));
const cell = (t) => String(t ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');

/** @param {any} r the review of features.ideas.review() */
export function reviewMarkdown(r) {
  const conv = r.game === 'conversion';
  const L = [`# Chấm lô: ${r.batch.title}`, ''];
  L.push(r.gameLabel ? `Game ${r.gameLabel}: ${conv ? 'xếp theo khách, rồi follower tăng, rồi view' : 'xếp theo view, rồi tỉ lệ chia sẻ'}.` : r.note, '', `${r.posted}/${r.live} thẻ đã gắn link video.`);
  L.push('', '## Xếp hạng', '', '| # | Video | Khách | Follower tăng | View | Chia sẻ | Ghi chú |', '|---|---|---|---|---|---|---|');
  for (const x of r.rows) {
    const m = x.metrics;
    const flags = [x.missing ? (conv ? 'chưa nhập' : 'chưa có view') : '', m.fresh ? 'còn mới' : ''].filter(Boolean).join(', ');
    L.push(`| ${x.rank} | ${cell(x.title)} | ${n(m.leads)} | ${n(m.followers)} | ${n(m.views)} | ${n(m.shares)} | ${flags} |`);
  }
  L.push('', '## Gạch thắng và thua', '');
  if (r.table.note) L.push(`> ${r.table.note}`, '');
  if (r.table.rows.length) for (const x of r.table.rows) L.push(`- ${rowText(x)}${x.label ? ` (**${x.label === 'keep' ? 'nên giữ' : 'xem lại'}**)` : ''}`);
  else L.push('Chưa có gì để so: cần ít nhất 2 video đủ số liệu và đăng từ 3 ngày.');
  if (r.losers.length) {
    L.push('', '## Nửa dưới: gạch nào khác', '');
    for (const l of r.losers) L.push(`- ${l.title}: ${l.diffs.length ? l.diffs.map((d) => `${d.attr} ${d.mine} (nửa trên cùng pillar: ${d.theirs.join(', ')})`).join('; ') : l.note}`);
  }
  const learned = r.batch.learned;
  if (learned && (learned.keep.length || learned.review.length)) {
    L.push('', '## Mang sang lô sau', '');
    for (const t of learned.keep) L.push(`- Nên giữ: ${t}`);
    for (const t of learned.review) L.push(`- Nên xem lại: ${t}`);
  }
  L.push('', '---', '', 'Bảng gạch là đối chiếu trên một lô nhỏ, không phải nguyên nhân chắc chắn.');
  return L.join('\n') + '\n';
}
