import { scope } from '../dom.js';
import { records } from '../http/client.js';
import { esc, icon, runJob, progressCard, updateProgress, toast, fmt, full, mult, ago, emptyState, thumb, ytVideo, ytChannel, dur, ageText, bindTips, isSaved, toggleSave, setUrl } from '../lib.js';
import { viewsChart, hbars, patternList, phraseChips } from '../components/index.js';

export async function mount(root, params) {
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('bars')} Phân tích kênh</h1>
      <p>Kênh nào đang ăn view nhờ video gì, độ dài nào, từ khoá nào, đăng nhịp ra sao. Chỉ dùng số liệu công khai.</p></div>
      <div class="head-actions"><a class="btn" href="#/compare">${icon('columns')} So sánh</a></div></div>
    <div class="card card-pad"><div class="input-row">
      <input class="input" data-input placeholder="@tenkenh, link kênh, hoặc link một video của kênh" value="${esc(params.input && !params.input.startsWith('UC') ? params.input : '')}">
      <button class="btn primary" data-run>${icon('bars')} Phân tích</button></div>
      <div class="help muted small" style="margin-top:6px">Lấy 120 video dài mới nhất + Shorts; ngày đăng chính xác cho 30 video mới nhất. Khoảng 15–30 giây.</div></div>
    <div data-out style="margin-top:14px"></div>
    <div class="card" data-list style="margin-top:14px"></div>`;
  const out = root.querySelector('[data-out]');
  const shown = scope(); // per-render listeners on long-lived elements
  const listed = scope();
  const input = root.querySelector('[data-input]');
  root.querySelector('[data-run]').addEventListener('click', () => run(input.value.trim()));
  input.addEventListener('keydown', (e) => e.key === 'Enter' && run(input.value.trim()));

  async function run(value) {
    if (!value) return toast('Nhập kênh', 'error');
    out.innerHTML = progressCard(`Đang phân tích ${value}`);
    try {
      const res = await runJob('channel_analysis', { input: value }, (p) => updateProgress(out, p));
      await show(res.id);
      list();
    } catch (e) {
      out.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  }

  async function show(id) {
    const rec = await records.get(id);
    setUrl('/channel', { id: rec.id }); // a reload or a copied link opens this result again
    const { info, stats, videos, shorts, durations, phrases, patterns, dayOfWeek, titleShape } = rec.data;
    const standouts = videos.filter((v) => v.standout).sort((a, b) => b.views - a.views);
    out.innerHTML = `
      <div class="card card-pad"><div class="row">
        ${info.avatar ? `<img src="${esc(info.avatar)}" referrerpolicy="no-referrer" alt="" style="width:56px;height:56px;border-radius:50%">` : ''}
        <div><h2 style="margin:0;font-size:20px"><a href="${ytChannel(info)}" target="_blank" rel="noopener">${esc(info.title)}</a></h2>
          <div class="muted small"><span style="color:var(--accent)">${esc(info.handle || '')}</span> · phân tích ${ago(rec.created_at)}${info.country ? ` · ${esc(info.country)}` : ''}${info.joined ? ` · tạo kênh ${new Date(info.joined).toLocaleDateString('vi-VN')}` : ''}</div></div>
        <span class="spacer"></span>
        <button class="btn sm ${isSaved('channel', info.id) ? 'on' : ''}" data-save>${icon('bookmark')} ${isSaved('channel', info.id) ? 'Đã lưu' : 'Lưu kênh'}</button>
        <button class="btn sm" data-rerun>${icon('refresh')} Phân tích lại</button>
        <a class="btn sm" href="${records.exportUrl(id, 'md')}">${icon('download')} Markdown</a>
        <a class="btn sm" href="${records.exportUrl(id, 'csv')}">${icon('download')} CSV</a></div></div>
      <div class="kpis" style="margin-top:14px">
        <div class="kpi"><div class="label">Người theo dõi</div><div class="value">${fmt(info.subs)}</div><div class="hint">${fmt(info.totalViews)} tổng view</div></div>
        <div class="kpi"><div class="label">Video dài</div><div class="value">${info.videoCount ?? stats.longCount}</div><div class="hint">đã lấy ${stats.longCount} · ${fmt(stats.longViews)} view</div></div>
        <div class="kpi"><div class="label">Shorts</div><div class="value">${stats.shortsCount}${stats.shortsCount >= 60 ? '+' : ''}</div><div class="hint">trung vị ${fmt(stats.shortsMedian)} view</div></div>
        <div class="kpi"><div class="label">View trung vị mỗi video</div><div class="value">${fmt(stats.medianAll)}</div><div class="hint">${stats.viewSubRatio != null ? Math.round(stats.viewSubRatio * 100) + '% số sub' : ''}</div></div>
        <div class="kpi"><div class="label">Video nổi bật</div><div class="value">${stats.standoutCount}</div><div class="hint">view ≥ ${stats.outlierMultiple} lần trung vị</div></div>
        <div class="kpi"><div class="label">Nhịp đăng</div><div class="value">${stats.uploadsPerWeek ?? '–'}/tuần</div><div class="hint">${stats.daysPerVideo ? `${String(stats.daysPerVideo).replace('.', ',')} ngày/video` : ''}${stats.lastUploadDays != null ? ` · mới nhất ${ageText(stats.lastUploadDays, false)} trước` : ''}</div></div>
      </div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>Lượt xem ${videos.length} video dài gần nhất</h3><span class="sub"><span class="badge blue">Video thường</span> <span class="badge accent">Nổi bật (≥ ${stats.outlierMultiple}× trung vị)</span></span></div>
        <div class="card-pad">${viewsChart(videos, stats.medianAll)}<p class="muted small" style="margin:6px 0 0">Trục đứng chia theo cấp 10 vì có video vượt trội rất xa. Rê chuột lên cột để xem chi tiết.</p></div></div>
      <div class="grid grid-3" style="margin-top:14px">
        <div class="card"><div class="card-head"><h3>Độ dài nào ăn view</h3></div><div class="card-pad">${hbars(durations)}<p class="muted small">View trung vị theo độ dài video.</p></div></div>
        <div class="card"><div class="card-head"><h3>Từ khoá kéo view trong tiêu đề</h3></div><div class="card-pad">${phraseChips(phrases, { value: 'medianViews', format: fmt })}<p class="muted small">View trung vị của video có cụm từ đó (xuất hiện ≥ 2 lần). Tiêu đề trung vị ${titleShape.medianChars} ký tự.</p></div></div>
        <div class="card"><div class="card-head"><h3>Ngày hay đăng</h3></div><div class="card-pad"><div class="chips">${dayOfWeek.filter((x) => x.count).sort((a, b) => b.count - a.count).map((x) => `<span class="tag" data-tip="View trung vị ${fmt(x.medianViews)}">${x.label} · <b>${x.count}</b></span>`).join('') || '<span class="muted">Chưa có ngày chính xác</span>'}</div>
          <p class="muted small">${stats.exactFrom ? `Tính từ ${new Date(stats.exactFrom).toLocaleDateString('vi-VN')} → ${new Date(stats.exactTo).toLocaleDateString('vi-VN')}.` : ''}</p></div></div>
      </div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>Mẫu tiêu đề của kênh</h3><span class="sub">Hiệu quả = × trung vị kênh của nhóm ÷ chung</span></div>${patternList(patterns, { valueLabel: '× trung vị kênh' })}</div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>${icon('flame')} Video nổi bật: đáng học hoặc xin phép dịch</h3><span class="sub">${standouts.length} video</span></div>${videoRows(standouts)}</div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>Tất cả video dài (mới → cũ)</h3></div>${videoRows(videos)}</div>
      ${shorts.length ? `<div class="card" style="margin-top:14px"><div class="card-head"><h3>Shorts gần nhất</h3></div><div class="card-pad"><div class="chips">${shorts.map((s) => `<a class="tag" href="${s.url}" target="_blank" rel="noopener">${esc(s.title.slice(0, 60))} · <b>${fmt(s.views)}</b></a>`).join('')}</div></div></div>` : ''}`;
    shown.off();
    shown.add(bindTips(out));
    out.querySelector('[data-rerun]').addEventListener('click', () => run(info.id));
    out.querySelector('[data-save]').addEventListener('click', async (e) => {
      await toggleSave('channel', info.id, info.title, { id: info.id, title: info.title, handle: info.handle, avatar: info.avatar, subs: info.subs, medianViews: stats.medianAll, country: info.country });
      e.currentTarget.innerHTML = `${icon('bookmark')} ${isSaved('channel', info.id) ? 'Đã lưu' : 'Lưu kênh'}`;
    });
    shown.on(out, 'click', '[data-cm]', (e, b) => window.__go('/comments', { videos: b.dataset.cm }));
  }

  function videoRows(list) {
    if (!list.length) return emptyState('Không có');
    return `<div class="table-wrap"><table class="t"><thead><tr><th class="thumb"></th><th>Tiêu đề</th><th class="r">Lượt xem</th><th class="r">So với trung vị</th><th class="r">Dài</th><th class="r">Đăng</th><th></th></tr></thead><tbody>
      ${list.map((v) => `<tr><td class="thumb"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(v.id)}" alt=""></a></td>
        <td class="title-cell"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a></td>
        <td class="r num"><b>${fmt(v.views)}</b></td><td class="r"><span class="badge ${v.standout ? 'accent' : 'plain'}">${mult(v.vsMedian)}</span></td>
        <td class="r num">${dur(v.durationSec)}</td><td class="r num" ${v.publishedAt ? `data-tip="${new Date(v.publishedAt).toLocaleDateString('vi-VN')}"` : ''}>${ageText(v.age, v.ageExact)}</td>
        <td class="actions"><button class="btn sm" data-cm="${v.id}">${icon('message')} Comment</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function list() {
    const rows = await records.list('channel_analysis', 100);
    const latest = new Map();
    for (const r of rows) if (!latest.has(r.ref)) latest.set(r.ref, r);
    const items = [...latest.values()];
    root.querySelector('[data-list]').innerHTML = `<div class="card-head"><h3>Kênh đã phân tích</h3><span class="sub">Tích 2–4 kênh rồi bấm So sánh</span></div>
      ${items.length ? `<table class="t"><thead><tr><th style="width:30px"></th><th>Kênh</th><th class="r">Phân tích lúc</th><th></th></tr></thead><tbody>
        ${items.map((r) => `<tr><td><input type="checkbox" data-cmp="${r.ref}"></td><td><a class="name" style="color:var(--accent);font-weight:600" href="#/channel?id=${r.id}">${esc(r.title)}</a></td><td class="r muted">${ago(r.created_at)}</td>
          <td class="actions"><button class="btn sm" data-re="${r.ref}">${icon('refresh')} Phân tích lại</button> <button class="icon-btn" data-del="${r.id}">${icon('trash')}</button></td></tr>`).join('')}</tbody></table>
        <div class="row" style="padding:12px 18px"><button class="btn primary sm" data-compare disabled>${icon('columns')} So sánh</button></div>` : emptyState('Chưa phân tích kênh nào')}`;
    const box = root.querySelector('[data-list]');
    const btn = box.querySelector('[data-compare]');
    listed.off();
    listed.on(box, 'change', null, () => {
      const n = box.querySelectorAll('[data-cmp]:checked').length;
      if (btn) (btn.disabled = n < 2 || n > 4), (btn.innerHTML = `${icon('columns')} So sánh (${n})`);
    });
    btn?.addEventListener('click', () => window.__go('/compare', { ids: [...box.querySelectorAll('[data-cmp]:checked')].map((x) => x.dataset.cmp).join(',') }));
    box.querySelectorAll('[data-re]').forEach((b) => b.addEventListener('click', () => run(b.dataset.re)));
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => (await records.remove(b.dataset.del), list())));
  }
  list();
  if (params.id) show(params.id);
  else if (params.input) {
    input.value = params.input;
    run(params.input);
  }
  return () => {
    shown.off();
    listed.off();
  };
}
