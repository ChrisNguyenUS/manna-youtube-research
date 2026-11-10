import { records, compareChannels } from '../http/client.js';
import { esc, icon, fmt, mult, ago, emptyState, ytVideo, ytChannel, ageText } from '../lib.js';

export async function mount(root, params) {
  root.innerHTML = `<div class="page-head"><div><h1>${icon('columns')} So sánh kênh</h1>
    <p>Đặt 2–4 kênh cạnh nhau: người theo dõi, view trung vị, tỉ lệ video nổi bật, nhịp đăng, độ dài, từ khoá.</p></div>
    <div class="head-actions"><button class="btn primary" data-go disabled>${icon('columns')} So sánh</button></div></div>
    <div class="card" data-pick></div><div data-out style="margin-top:14px"></div>`;
  const rows = await records.list('channel_analysis', 100);
  const latest = new Map();
  for (const r of rows) if (!latest.has(r.ref)) latest.set(r.ref, r);
  const preset = new Set((params.ids || '').split(',').filter(Boolean));
  const pick = root.querySelector('[data-pick]');
  pick.innerHTML = latest.size
    ? `<div class="card-head"><h3>Tích 2–4 kênh đã phân tích</h3><a class="btn sm" href="#/channel">${icon('plus')} Phân tích kênh mới</a></div><table class="t"><tbody>${[...latest.values()].map((r) => `<tr><td style="width:30px"><input type="checkbox" data-id="${r.ref}" ${preset.has(r.ref) ? 'checked' : ''}></td><td><b>${esc(r.title)}</b></td><td class="r muted">${ago(r.created_at)}</td></tr>`).join('')}</tbody></table>`
    : emptyState('Chưa có kênh nào', 'Vào Phân tích kênh trước.');
  const go = root.querySelector('[data-go]');
  const sync = () => {
    const n = pick.querySelectorAll('[data-id]:checked').length;
    go.disabled = n < 2 || n > 4;
    go.innerHTML = `${icon('columns')} So sánh (${n})`;
  };
  pick.addEventListener('change', sync);
  sync();
  go.addEventListener('click', () => compare([...pick.querySelectorAll('[data-id]:checked')].map((x) => x.dataset.id)));
  if (preset.size >= 2) compare([...preset]);

  async function compare(ids) {
    const list = await compareChannels(ids);
    const best = (fn, hi = true) => {
      const vals = list.map(fn).filter((x) => x != null);
      return hi ? Math.max(...vals) : Math.min(...vals);
    };
    const row = (label, fn, format = fmt, hi = true) => {
      const b = best(fn, hi);
      return `<tr><td class="muted">${label}</td>${list.map((c) => {
        const v = fn(c);
        return `<td class="r num" style="${v === b && list.length > 1 ? 'color:var(--good);font-weight:700' : ''}">${v == null ? '–' : format(v)}</td>`;
      }).join('')}</tr>`;
    };
    root.querySelector('[data-out]').innerHTML = `<div class="card"><div class="table-wrap"><table class="t">
      <thead><tr><th></th>${list.map((c) => `<th class="r" style="text-transform:none;font-size:13px;color:var(--text)"><a href="${ytChannel(c.info)}" target="_blank" rel="noopener">${esc(c.info.title)}</a><div class="muted small" style="font-weight:400">${ago(c.created_at)}</div></th>`).join('')}</tr></thead>
      <tbody>
        ${row('Người theo dõi', (c) => c.info.subs)}
        ${row('Tổng view', (c) => c.info.totalViews)}
        ${row('Số video', (c) => c.info.videoCount, String)}
        ${row('Tuổi kênh', (c) => (c.info.joined ? (Date.now() - Date.parse(c.info.joined)) / 86400000 : null), (d) => ageText(d), false)}
        ${row('View trung vị / video', (c) => c.stats.medianAll)}
        ${row('Trung vị ÷ sub', (c) => c.stats.viewSubRatio, (x) => Math.round(x * 100) + '%')}
        ${row('Video nổi bật', (c) => (c.stats.longCount ? c.stats.standoutCount / c.stats.longCount : null), (x) => Math.round(x * 100) + '%')}
        ${row('View video 30 ngày', (c) => c.stats.views30d)}
        ${row('Video/tuần', (c) => c.stats.uploadsPerWeek, String)}
        ${row('Shorts trung vị', (c) => c.stats.shortsMedian)}
        <tr><td class="muted">Độ dài ăn view nhất</td>${list.map((c) => {
          const b = [...c.durations].filter((x) => x.count >= 2).sort((a, z) => z.medianViews - a.medianViews)[0];
          return `<td class="r">${b ? `${esc(b.label)} <span class="muted small">(${fmt(b.medianViews)})</span>` : '–'}</td>`;
        }).join('')}</tr>
        <tr><td class="muted">Mẫu tiêu đề hiệu quả nhất</td>${list.map((c) => `<td class="r">${c.patterns[0] ? `${esc(c.patterns[0].label)} <span class="muted small">${mult(c.patterns[0].lift)}</span>` : '–'}</td>`).join('')}</tr>
        <tr><td class="muted">Từ khoá kéo view</td>${list.map((c) => `<td class="r small">${c.phrases.slice(0, 6).map((p) => esc(p.phrase)).join(', ')}</td>`).join('')}</tr>
        <tr><td class="muted">Top video</td>${list.map((c) => `<td class="small">${c.top.map((v) => `<div style="margin-bottom:4px"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title.slice(0, 70))}</a> <b>${fmt(v.views)}</b></div>`).join('')}</td>`).join('')}</tr>
      </tbody></table></div></div>`;
  }
}
