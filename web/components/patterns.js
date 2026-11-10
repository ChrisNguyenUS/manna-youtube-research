// Title pattern table and phrase chips.
import { esc, fmt, full, mult, dur, ageText, thumb, ytVideo, icon, chips, bindChips, isSaved, toggleSave, store, persist, median, emptyState, bindTips, metric } from '../lib.js';
export function patternList(patterns, { valueLabel = 'vượt kênh' } = {}) {
  if (!patterns?.length) return emptyState('Chưa đủ dữ liệu');
  return `<table class="t"><thead><tr><th>Mẫu</th><th class="r">Số video</th><th class="r" data-tip="Trung vị ${valueLabel} của nhóm chia trung vị chung. >1 = mẫu này đang ăn hơn mức trung bình.">Hiệu quả</th><th>Ví dụ tốt nhất</th></tr></thead><tbody>
    ${patterns
      .map(
        (p) => `<tr><td><b>${esc(p.label)}</b><div class="muted small">${esc(p.hint)}</div></td><td class="r num">${p.count} <span class="muted small">(${Math.round(p.share * 100)}%)</span></td>
      <td class="r"><span class="badge ${p.lift >= 1.2 ? 'good' : p.lift < 0.8 ? 'bad' : 'plain'}">${mult(p.lift)}</span></td>
      <td>${p.example ? `<a href="${ytVideo(p.example.id)}" target="_blank" rel="noopener">${esc(p.example.title)}</a> <span class="muted small">${mult(p.example.value)} · ${fmt(p.example.views)} view</span>` : ''}</td></tr>`,
      )
      .join('')}</tbody></table>`;
}

export function phraseChips(phrases, { value = 'medianViewSub', format = mult } = {}) {
  if (!phrases?.length) return emptyState('Chưa có cụm từ lặp lại');
  return `<div class="chips">${phrases.map((p) => `<span class="tag" data-tip="${p.count} video">${esc(p.phrase)} · <b>${format(p[value])}</b></span>`).join('')}</div>`;
}
