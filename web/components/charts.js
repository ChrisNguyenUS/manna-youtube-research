// Small SVG/HTML charts.
import { esc, fmt, full, mult, dur, ageText, thumb, ytVideo, icon, chips, bindChips, isSaved, toggleSave, store, persist, median, emptyState, bindTips, metric } from '../lib.js';
// ---------- charts ----------
/** Log-scale bar chart of views (oldest → newest), standouts in accent. */
export function viewsChart(videos, medianValue) {
  const list = [...videos].reverse();
  if (!list.length) return '';
  const W = 1000, H = 260, padL = 46, padB = 22, padT = 10;
  const max = Math.max(...list.map((v) => v.views || 1));
  const top = Math.pow(10, Math.ceil(Math.log10(Math.max(max, 10))));
  const y = (val) => padT + (H - padT - padB) * (1 - Math.log10(Math.max(val, 1)) / Math.log10(top));
  const bw = (W - padL) / list.length;
  const ticks = [];
  for (let t = 1; t <= top; t *= 10) ticks.push(t);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lượt xem từng video">
    ${ticks.map((t) => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="#eeecea"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}
    ${list
      .map((v, i) => {
        const h = H - padB - y(v.views || 1);
        return `<rect x="${padL + i * bw + bw * 0.15}" y="${y(v.views || 1)}" width="${Math.max(bw * 0.7, 1)}" height="${Math.max(h, 0)}" rx="1.5" fill="${v.standout ? 'var(--accent)' : '#93b4f0'}" data-tip="${esc(v.title)} — ${full(v.views)} view · ${ageText(v.age, v.ageExact)}"/>`;
      })
      .join('')}
    ${medianValue ? `<line x1="${padL}" x2="${W}" y1="${y(medianValue)}" y2="${y(medianValue)}" stroke="var(--text-2)" stroke-dasharray="4 4"/><text x="${W - 4}" y="${y(medianValue) - 5}" text-anchor="end" style="fill:var(--text-2)">Trung vị ${fmt(medianValue)}</text>` : ''}
    <text x="${padL}" y="${H - 5}">Cũ hơn</text><text x="${W}" y="${H - 5}" text-anchor="end">Mới nhất</text>
  </svg>`;
}

export function hbars(rows, { value = 'medianViews', label = 'label', note = (r) => `${r.count} video`, format = fmt } = {}) {
  const max = Math.max(...rows.map((r) => r[value] || 0), 1);
  return `<div class="hbars">${rows
    .map((r) => `<div class="hbar"><span>${esc(r[label])}</span><span class="track"><i style="width:${((r[value] || 0) / max) * 100}%"></i></span><span class="val"><b>${format(r[value])}</b> <span class="muted small">· ${esc(note(r))}</span></span></div>`)
    .join('')}</div>`;
}
