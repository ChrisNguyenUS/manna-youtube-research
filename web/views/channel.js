// "Phân tích kênh" (YouTube): a public-channel / competitor dashboard built from one channel_analysis record plus the
// earlier analyses of the same channel (each one a snapshot of its public numbers). Modules: web/components/youtube-channel/.
import { scope } from '../dom.js';
import { records, channelHistory } from '../http/client.js';
import { esc, icon, runJob, progressCard, updateProgress, toast, fmt, ago, emptyState, ytChannel, bindTips, isSaved, toggleSave, isFollowing, followLabel, toggleFollow, setUrl, resumeJob, errorCallout, img } from '../lib.js';
import { section, num, pct, fullDate } from '../components/tiktok-channel/util.js';
import { trendChart, videosChart, scheduleHeatmap } from '../components/youtube-channel/charts.js';
import { allVideos, videoTable } from '../components/youtube-channel/videos.js';
import { formatModule, topicModule, keywordModule, commentModule } from '../components/youtube-channel/content.js';
import { nextSteps, link } from '../components/next-steps.js';

const NAV = [['overview', 'Tổng quan'], ['trend', 'Xu hướng'], ['format', 'Định dạng'], ['schedule', 'Lịch đăng'], ['topics', 'Chủ đề'], ['keywords', 'Từ khoá & tiêu đề'], ['videos', 'Hiệu suất video'], ['library', 'Thư viện video'], ['comments', 'Comment']];
const kpi = (ic, label, value, hint, tip) => `<div class="tc-kpi" data-tip="${esc(tip)}"><div class="tc-kpi-label">${icon(ic)}${label}</div><div class="tc-kpi-value">${value}</div><div class="tc-kpi-hint">${hint}</div></div>`;

export async function mount(root, params) {
  root.innerHTML = `<div class="tc">
    <div class="page-head"><div><h1>${icon('bars')} Channel Analysis</h1><p>Nghiên cứu kênh công khai (đối thủ): đăng gì, video nào hiệu quả, chủ đề và lịch đăng. Chỉ dùng số liệu công khai.</p></div></div>
      <form class="card card-pad tc-form" data-form><input class="input" data-input placeholder="@kênh, link kênh hoặc link video" value="${esc(params.input && !params.input.startsWith('UC') ? params.input : '')}" aria-label="Kênh YouTube">
        <button class="btn primary" type="submit">${icon('bars')} Phân tích</button></form>
    <div data-prog></div>
    <div data-out></div>
    <div class="card" data-list></div></div>`;
  const prog = /** @type {HTMLElement} */ (root.querySelector('[data-prog]'));
  const out = /** @type {HTMLElement} */ (root.querySelector('[data-out]'));
  const shown = scope(); // per-render listeners on long-lived elements
  const listed = scope();
  const input = /** @type {HTMLInputElement} */ (root.querySelector('[data-input]'));
  root.querySelector('[data-form]').addEventListener('submit', (e) => (e.preventDefault(), run(input.value.trim())));

  async function run(value) {
    if (!value) return toast('Nhập kênh', 'error');
    prog.innerHTML = progressCard(`Đang phân tích ${value}. Khoảng 20–40 giây.`);
    try {
      const res = await runJob('channel_analysis', { input: value }, (p) => updateProgress(prog, p));
      prog.innerHTML = '';
      await show(res.id);
      list();
    } catch (e) {
      prog.innerHTML = errorCallout(e);
    }
  }

  async function show(id) {
    out.innerHTML = `<div class="card tc-sec yc-skeleton"><span></span><span></span><span></span></div>`;
    const rec = await records.get(id);
    setUrl('/channel', { id: rec.id }); // a reload or a copied link opens this result again
    const d = rec.data;
    const { info, stats: s } = d;
    const history = await channelHistory(info.id).catch(() => []);
    const list = allVideos(d, history);
    const long = list.filter((v) => v.format !== 'short');
    const detailed = long.filter((v) => v.likes != null && v.comments != null && v.views);
    const rate = detailed.length ? detailed.reduce((a, v) => a + v.likes + v.comments, 0) / detailed.reduce((a, v) => a + v.views, 0) : null;
    const avgViews = long.length ? Math.round(long.reduce((a, v) => a + (v.views || 0), 0) / long.length) : null;
    const first = history[0];
    const perMonth = s.uploadsPerWeek != null ? (s.uploadsPerWeek * 30) / 7 : null;
    input.value = info.handle || info.title;
    out.innerHTML = `
      <div class="card tc-head">
        ${info.avatar ? `<img class="tc-avatar" src="${esc(img(info.avatar))}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '<span class="tc-avatar"></span>'}
        <div class="tc-id"><div class="yc-label">KÊNH CÔNG KHAI · PHÂN TÍCH ĐỐI THỦ</div><h2>${esc(info.title)}</h2>
          <a href="${ytChannel(info)}" target="_blank" rel="noopener">${esc(info.handle || info.id)} ${icon('ext')}</a>
          <p class="yc-ids">ID ${esc(info.id)}${info.country ? ` · ${esc(info.country)}` : ''}${info.joined ? ` · tạo kênh ${new Date(info.joined).toLocaleDateString('vi-VN')}` : ''}</p></div>
        <div class="tc-meta"><span>Phân tích lần này: <b>${fullDate(new Date(rec.created_at).toISOString())}</b> (${ago(rec.created_at)})</span>
          <span>Trong Watchlist từ: <b>${first ? fullDate(new Date(first.at).toISOString()) : '–'}</b> · ${history.length} lần chụp số liệu</span><span>Nguồn: dữ liệu công khai trên YouTube</span></div>
        <div class="tc-actions">
          <button class="btn sm ${isFollowing('youtube', info.id) ? 'on' : ''}" data-follow title="Thêm kênh vào Watchlist">${followLabel('youtube', info.id)}</button>
          <button class="btn sm ${isSaved('channel', info.id) ? 'on' : ''}" data-save>${icon('bookmark')} ${isSaved('channel', info.id) ? 'Đã lưu' : 'Lưu kênh'}</button>
          <details class="tc-menu"><summary class="btn sm">${icon('download')} Export</summary><div><a href="${records.exportUrl(rec.id, 'md')}">Markdown (.md)</a><a href="${records.exportUrl(rec.id, 'csv')}">Bảng video (.csv)</a></div></details>
          <a class="btn sm" href="${ytChannel(info)}" target="_blank" rel="noopener">${icon('ext')} Mở kênh</a>
          <button class="btn sm primary" data-rerun>${icon('refresh')} Làm mới số liệu</button></div>
      </div>
      ${(() => {
        const top = long.filter((v) => v.id && v.score != null).sort((a, b) => b.score - a.score).slice(0, 5).map((v) => v.id);
        return top.length ? nextSteps([
          { href: link('/video', { videos: top.map((id) => `https://www.youtube.com/watch?v=${id}`).join('\n'), run: 1 }), icon: 'play', label: `Video Analysis ${top.length} video vượt trung vị`, hint: 'Script, số liệu và comment của các video vượt trung vị kênh nhiều nhất', primary: true },
          { href: link('/comments', { videos: top.join(',') }), icon: 'download', label: 'Collect comment các video này', hint: 'Mở Collect Comments với video đã điền sẵn' },
        ]) : '';
      })()}
      ${s.detailSample == null ? '<div class="callout info">Báo cáo này được tạo trước khi app lấy lượt thích và bình luận. Bấm Làm mới số liệu để có tỷ lệ tương tác, danh mục và tag.</div>' : ''}
      <nav class="tc-nav" aria-label="Các phần của báo cáo">${NAV.map(([k, l]) => `<button type="button" data-go="${k}">${l}</button>`).join('')}</nav>
      <div class="tc-kpis" data-sec="overview">
        ${kpi('users', 'Subscriber', info.subs == null ? 'Ẩn' : `≈ ${fmt(info.subs)}`, info.subs == null ? 'kênh ẩn số subscriber' : 'YouTube làm tròn số này', 'Số subscriber công khai. YouTube làm tròn (ví dụ 1,24 Tr), có kênh chọn ẩn.')}
        ${kpi('eye', 'Tổng view kênh', info.totalViews == null ? '–' : fmt(info.totalViews), 'cộng dồn từ khi tạo kênh', 'Tổng view công khai cả đời kênh (mục Giới thiệu). Không phải view trong một khoảng thời gian.')}
        ${kpi('play', 'Tổng video', info.videoCount == null ? '–' : fmt(info.videoCount), `đã lấy ${long.length} video dài, ${list.length - long.length} Shorts`, 'Số video công khai YouTube báo cho kênh.')}
        ${kpi('bars', 'View TB / video dài', fmt(avgViews), `trung vị ${fmt(s.medianAll)} · ${long.length} video`, `Tổng view ÷ ${long.length} video dài mới nhất đã lấy. Trung vị ít bị video viral kéo lệch hơn trung bình.`)}
        ${kpi('heart', 'Tương tác công khai (ước tính)', pct(rate), detailed.length ? `trên ${detailed.length} video có đủ số` : 'chưa có số thích/bình luận', '(Tổng thích + tổng bình luận) ÷ tổng view × 100, tính trên các video mới nhất có đủ ba số. Không phải tỷ lệ tương tác trong YouTube Studio.')}
        ${kpi('calendar', 'Nhịp đăng', s.uploadsPerWeek != null ? `${num(s.uploadsPerWeek)}/tuần` : '–', `${perMonth != null ? `${num(perMonth)}/tháng · ` : ''}${s.daysPerVideo ? `${num(s.daysPerVideo)} ngày/video` : ''}`, 'Số video dài đăng trong 90 ngày gần nhất quy ra mỗi tuần; khoảng cách trung bình giữa các video tính từ các video có ngày đăng chính xác.')}
      </div>
      <div class="tc-row-2">
        ${section('trend', 'Xu hướng kênh theo các lần chụp', '<div data-trend></div>', { sub: 'Số công khai tại mỗi lần phân tích kênh' })}
        ${section('format', 'Định dạng nội dung', formatModule(d, list))}
      </div>
      ${section('views', 'Lượt xem từng video dài', '<div data-vchart></div>', { sub: `${long.length} video dài mới nhất, cũ → mới` })}
      <div class="tc-row-2b">
        ${section('schedule', 'Lịch đăng', '<div data-heat></div>', { sub: 'Ngày và khung giờ kênh đăng video dài' })}
        ${section('topics', 'Chủ đề nội dung', '<div data-topics></div>', { sub: 'Từ tiêu đề, danh mục và tag công khai' })}
      </div>
      ${section('keywords', 'Từ khoá & tiêu đề', '<div data-kw></div>')}
      ${section('videos', 'Hiệu suất video', '<div data-videos></div>', { sub: 'Bấm ảnh để mở YouTube, bấm tiêu đề để xem chi tiết' })}
      ${section('comments', 'Bình luận công khai', commentModule(list))}`;
    shown.off();
    shown.add(bindTips(out));
    const $ = (sel) => /** @type {HTMLElement} */ (out.querySelector(sel));
    const table = videoTable($('[data-videos]'), d, list, { canGrow: history.length >= 2 });
    shown.add(table.off);
    shown.add(trendChart($('[data-trend]'), history, () => run(info.id)));
    shown.add(videosChart($('[data-vchart]'), long.filter((v) => v.format === 'long'), s, table.open) || (() => {}));
    shown.add(scheduleHeatmap($('[data-heat]'), long));
    shown.add(topicModule($('[data-topics]'), d, list));
    shown.add(keywordModule($('[data-kw]'), d, list));
    shown.on(out, 'click', '[data-go]', (e, b) => {
      const k = b.dataset.go;
      if (k === 'library') table.show('all', 'all', true);
      out.querySelector(`[data-sec="${k === 'library' ? 'videos' : k}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('[data-rerun]').addEventListener('click', () => run(info.id));
    $('[data-save]').addEventListener('click', async (e) => {
      const b = /** @type {HTMLElement} */ (e.currentTarget);
      await toggleSave('channel', info.id, info.title, { id: info.id, title: info.title, handle: info.handle, avatar: info.avatar, subs: info.subs, medianViews: s.medianAll, country: info.country });
      b.classList.toggle('on', isSaved('channel', info.id));
      b.innerHTML = `${icon('bookmark')} ${isSaved('channel', info.id) ? 'Đã lưu' : 'Lưu kênh'}`;
    });
    $('[data-follow]').addEventListener('click', (e) => toggleFollow('youtube', info.id, info.title,
      { title: info.title, handle: info.handle, avatar: info.avatar, followers: info.subs, medianViews: s.medianAll, url: ytChannel(info) }, /** @type {HTMLElement} */ (e.currentTarget)));
  }

  /** Channels analysed before: open, analyse again, delete, or tick 2–4 to compare (unchanged behaviour). */
  async function list() {
    const rows = await records.list('channel_analysis', 100);
    const latest = new Map();
    for (const r of rows) if (!latest.has(r.ref)) latest.set(r.ref, r);
    const items = [...latest.values()];
    const box = /** @type {HTMLElement} */ (root.querySelector('[data-list]'));
    box.innerHTML = `<div class="card-head"><h3>${icon('clock')} Recent</h3><span class="sub">Tích 2–4 kênh rồi bấm So sánh</span></div>
      ${items.length ? `<div class="table-wrap"><table class="t"><thead><tr><th style="width:30px"></th><th>Kênh</th><th class="r">Phân tích lúc</th><th></th></tr></thead><tbody>
        ${items.map((r) => `<tr><td><input type="checkbox" data-cmp="${r.ref}" aria-label="Chọn để so sánh"></td><td><a class="name" style="color:var(--accent);font-weight:600" href="#/channel?id=${r.id}">${esc(r.title)}</a></td><td class="r muted">${ago(r.created_at)}</td>
          <td class="actions"><button class="btn sm" data-re="${r.ref}">${icon('refresh')} Phân tích lại</button> <button class="icon-btn" data-del="${r.id}" aria-label="Xoá">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>
        <div class="row" style="padding:12px 18px"><button class="btn primary sm" data-compare disabled>${icon('columns')} So sánh</button></div>` : emptyState('Chưa phân tích kênh nào')}`;
    const btn = /** @type {HTMLButtonElement|null} */ (box.querySelector('[data-compare]'));
    listed.off();
    listed.on(box, 'change', null, () => {
      const n = box.querySelectorAll('[data-cmp]:checked').length;
      if (btn) (btn.disabled = n < 2 || n > 4), (btn.innerHTML = `${icon('columns')} So sánh (${n})`);
    });
    btn?.addEventListener('click', () => window.__go('/compare', { ids: [...box.querySelectorAll('[data-cmp]:checked')].map((x) => /** @type {HTMLElement} */ (x).dataset.cmp).join(',') }));
    box.querySelectorAll('[data-re]').forEach((b) => b.addEventListener('click', () => run(/** @type {HTMLElement} */ (b).dataset.re)));
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => (await records.remove(/** @type {HTMLElement} */ (b).dataset.del), list())));
  }
  list();
  if (params.id) show(params.id).catch((e) => (out.innerHTML = errorCallout(e)));
  else if (params.input) {
    input.value = params.input;
    run(params.input);
  } else resumeJob('channel_analysis', prog, (j) => `Đang phân tích ${j.title}`, async (res) => (await show(res.id), list()));
  return () => {
    shown.off();
    listed.off();
  };
}
