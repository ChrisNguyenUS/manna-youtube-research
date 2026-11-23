// "Phân tích kênh" (TikTok): a channel dashboard built from one tiktok_channel record. All numbers come from that
// record; the dashboard modules live in web/components/tiktok-channel/.
import { records } from '../../http/client.js';
import { esc, icon, runJob, activeJob, watchJob, progressCard, updateProgress, errorCallout, toast, fmt, ago, setUrl, bindTips, followLabel, isFollowing, toggleFollow, img } from '../../lib.js';
import { scope } from '../../dom.js';
import { historyList } from '../../components/history-list.js';
import { tiktokLoginNotice } from '../../components/tiktok-login.js';
import { section, num, pct, fullDate } from '../../components/tiktok-channel/util.js';
import { performanceChart, postingHeatmap } from '../../components/tiktok-channel/charts.js';
import { videoTable } from '../../components/tiktok-channel/videos.js';
import { patternsModule, hashtagModule, captionModule, commentModule } from '../../components/tiktok-channel/content.js';
import { nextSteps, link } from '../../components/next-steps.js';

const KIND = 'tiktok_channel';
const PATH = '/tiktok/channel';
const NAV = [['overview', 'Tổng quan'], ['performance', 'Hiệu suất'], ['timing', 'Giờ đăng'], ['videos', 'Video'], ['content', 'Mẫu nội dung'], ['hashtags', 'Hashtag'], ['captions', 'Caption'], ['comments', 'Comment'], ['library', 'Thư viện video']];

/** KPI card: label with a definition on hover, a big number, one line of context. */
const kpi = (ic, label, value, hint, tip) => `<div class="tc-kpi" data-tip="${esc(tip)}"><div class="tc-kpi-label">${icon(ic)}${label}</div><div class="tc-kpi-value">${value}</div><div class="tc-kpi-hint">${hint}</div></div>`;

export async function mount(root, params) {
  root.innerHTML = `<div class="tc">
    <div class="page-head"><div><h1>${icon('bars')} Channel Analysis</h1><p>Hiệu suất, video nổi bật, giờ đăng, hashtag và caption của một kênh, tính từ số liệu công khai.</p></div></div>
      <form class="card card-pad tc-form" data-form><input class="input" data-input placeholder="@tenkenh hoặc link kênh / video" value="${esc(params.input || '')}" aria-label="Kênh TikTok">
        <button class="btn primary" type="submit">${icon('bars')} Phân tích</button></form>
    <div data-login></div>
    <div data-prog></div>
    <div data-out></div>
    <div class="card" data-history></div></div>`;
  const shown = scope();
  const input = /** @type {HTMLInputElement} */ (root.querySelector('[data-input]'));
  const prog = /** @type {HTMLElement} */ (root.querySelector('[data-prog]'));
  const out = /** @type {HTMLElement} */ (root.querySelector('[data-out]'));
  const offLogin = tiktokLoginNotice(root.querySelector('[data-login]'));
  const history = historyList(root.querySelector('[data-history]'), { kind: KIND, path: PATH, empty: 'Chưa phân tích kênh nào' });

  async function follow(title, job) {
    prog.innerHTML = progressCard(title);
    try {
      const res = await job((p) => updateProgress(prog, p));
      prog.innerHTML = '';
      await show(res.id);
      history();
    } catch (e) {
      prog.innerHTML = errorCallout(e);
    }
  }
  function run(value) {
    if (!value) return toast('Nhập kênh TikTok', 'error');
    follow(`Đang phân tích ${value}. Khoảng 1–2 phút.`, (onProgress) => runJob(KIND, { input: value }, onProgress));
  }
  root.querySelector('[data-form]').addEventListener('submit', (e) => (e.preventDefault(), run(input.value.trim())));

  async function show(id) {
    const rec = await records.get(id);
    setUrl(PATH, { id: rec.id }); // a reload or a copied link opens this result again
    const d = rec.data;
    const { profile: p, stats: s } = d;
    const ref = p.username.toLowerCase();
    const vids = d.videos.filter((v) => !v.pinned);
    const totalPlays = d.videos.reduce((a, v) => a + (v.plays || 0), 0);
    const avg = vids.length ? Math.round(vids.reduce((a, v) => a + (v.plays || 0), 0) / vids.length) : null;
    const rate = s.postsPerWeek == null ? '–' : s.postsPerWeek >= 14 ? `${num(s.postsPerWeek / 7)} video/ngày` : `${num(s.postsPerWeek)} video/tuần`;
    input.value = `@${p.username}`;
    out.innerHTML = `
      <div class="card tc-head">
        ${p.avatar ? `<img class="tc-avatar" src="${esc(img(p.avatar))}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '<span class="tc-avatar"></span>'}
        <div class="tc-id"><h2>${esc(p.nickname || p.username)}${p.verified ? ' <span class="badge tc-up">Đã xác minh</span>' : ''}</h2>
          <a href="${esc(p.url)}" target="_blank" rel="noopener">@${esc(p.username)} ${icon('ext')}</a>${p.bio ? `<p>${esc(p.bio.slice(0, 160))}</p>` : ''}</div>
        <div class="tc-meta"><span title="${esc(fullDate(d.analyzedAt))}">Phân tích ${ago(rec.created_at)} · ${fullDate(d.analyzedAt)}</span><span>Nhịp đăng: <b>${rate}</b>${s.lastPostDays != null ? ` · video mới nhất ${s.lastPostDays < 1 ? 'trong 24 giờ' : `${Math.round(s.lastPostDays)} ngày`} trước` : ''}</span></div>
        <div class="tc-actions">
          <button class="btn sm ${isFollowing('tiktok', ref) ? 'on' : ''}" data-follow>${followLabel('tiktok', ref)}</button>
          <details class="tc-menu"><summary class="btn sm">${icon('download')} Export</summary><div><a href="${records.exportUrl(rec.id, 'md')}">Markdown (.md)</a><a href="${records.exportUrl(rec.id, 'csv')}">Bảng video (.csv)</a></div></details>
          <button class="btn sm primary" data-rerun>${icon('refresh')} Phân tích lại</button></div>
      </div>
      ${(() => {
        const top = [...vids].filter((v) => v.url).sort((a, b) => (b.outlierScore ?? 0) - (a.outlierScore ?? 0) || (b.plays ?? 0) - (a.plays ?? 0)).slice(0, 5).map((v) => v.url);
        return top.length ? nextSteps([
          { href: link('/video', { videos: top.join('\n'), run: 1 }), icon: 'play', label: `Video Analysis ${top.length} video nổi bật`, hint: 'Script, số liệu và comment của các video vượt trung vị kênh nhiều nhất', primary: true },
          { href: link('/tiktok/comments', { videos: top.join('\n') }), icon: 'download', label: 'Collect comment các video này', hint: 'Mở Collect Comments với link đã điền sẵn' },
        ]) : '';
      })()}
      ${p.private ? '<div class="callout">Kênh để riêng tư, không xem được video.</div>' : ''}
      ${s.baselineBiased ? '<div class="callout">Lần này trang kênh không trả video mới nhất, chỉ có video tìm thấy qua tìm kiếm (thường là video nổi). View trung vị có thể cao hơn thực tế, nên số video "nổi bật" ít hơn thực tế. Bấm Phân tích lại để thử lấy lại.</div>' : ''}
      <nav class="tc-nav" aria-label="Các phần của báo cáo">${NAV.map(([k, l]) => `<button type="button" data-go="${k}">${l}</button>`).join('')}</nav>
      <div class="tc-kpis" data-sec="overview">
        ${kpi('users', 'Follower', fmt(s.followers), `${fmt(s.likes)} like cả kênh`, 'Số người theo dõi kênh lúc phân tích. App chưa lưu số cũ nên chưa so sánh được tăng trưởng.')}
        ${kpi('eye', 'Tổng view', fmt(totalPlays), `của ${d.videos.length} video đã lấy`, 'Cộng lượt xem các video app lấy được, không phải tổng lượt xem cả kênh (TikTok không công bố số này).')}
        ${kpi('play', 'Số video', fmt(s.videoCount), `đã lấy ${d.videos.length} video`, 'Số video kênh đang có trên TikTok; phân tích dựa trên các video đã lấy.')}
        ${kpi('bars', 'View trung vị / video', fmt(s.medianPlays), `trung bình ${fmt(avg)} · bằng ${pct(s.playsPerFollower)} follower`, `Lượt xem của video ở giữa khi xếp ${s.baselineSample} video mới nhất (đã đăng từ ${s.minAge} ngày, bỏ video ghim). Trung vị không bị vài video viral kéo lệch như trung bình.`)}
        ${kpi('heart', 'Tỷ lệ tương tác', pct(s.medianEngagement), 'trung vị mỗi video', '(Tim + bình luận + chia sẻ + lưu) ÷ lượt xem, lấy trung vị các video.')}
        ${kpi('flame', 'Video nổi bật', String(s.standoutCount), `≥ ${s.outlierMultiple}× view trung vị`, `Video có lượt xem từ ${s.outlierMultiple} lần view trung vị kênh trở lên. Đổi hệ số ở Cài đặt.`)}
      </div>
      <div class="tc-row-2">
        ${section('performance', 'Hiệu suất video theo ngày đăng', '<div data-chart></div>')}
        ${section('timing', 'Khung giờ đăng', '<div data-heat></div>', { sub: 'Mỗi ô: các video đăng vào ngày và khung giờ đó' })}
      </div>
      ${section('videos', 'Video của kênh', '<div data-videos></div>', { sub: 'Bấm một video để xem chi tiết, phân tích script hoặc đọc bình luận' })}
      ${section('content', 'Mẫu nội dung', patternsModule(d), { sub: 'Độ dài video và kiểu caption nào thường đi cùng nhiều view ở kênh này' })}
      <div class="tc-row-2b">
        ${section('hashtags', 'Hashtag', '<div data-tags></div>', { sub: 'Hashtag dùng nhiều chưa chắc là hashtag đi cùng video nhiều view' })}
        ${section('captions', 'Caption', captionModule(d))}
      </div>
      ${section('comments', 'Comment', commentModule(d))}`;
    shown.off();
    shown.add(bindTips(out));
    const table = videoTable(/** @type {HTMLElement} */ (out.querySelector('[data-videos]')), d);
    shown.add(table.off);
    shown.add(performanceChart(/** @type {HTMLElement} */ (out.querySelector('[data-chart]')), d, table.open));
    shown.add(postingHeatmap(/** @type {HTMLElement} */ (out.querySelector('[data-heat]')), d));
    shown.add(hashtagModule(/** @type {HTMLElement} */ (out.querySelector('[data-tags]')), d));
    shown.on(out, 'click', '[data-go]', (e, b) => {
      const k = b.dataset.go;
      if (k === 'library') table.show('all', true);
      out.querySelector(`[data-sec="${k === 'library' ? 'videos' : k}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    out.querySelector('[data-rerun]').addEventListener('click', () => run(`@${p.username}`));
    out.querySelector('[data-follow]').addEventListener('click', (e) => toggleFollow('tiktok', ref, p.nickname || `@${p.username}`,
      { title: p.nickname, handle: `@${p.username}`, avatar: p.avatar, followers: p.followers, medianViews: s.medianPlays, url: p.url }, /** @type {HTMLElement} */ (e.currentTarget)));
  }

  history();
  if (params.id) show(params.id).catch((e) => (out.innerHTML = errorCallout(e)));
  else if (params.input && params.run) {
    setUrl(PATH, { input: params.input }); // started once: a reload must not start it again
    run(params.input);
  } else activeJob(KIND).then((live) => live && follow(`Đang phân tích ${live.title}`, (onProgress) => watchJob(live.id, onProgress)));
  return () => {
    shown.off();
    offLogin();
  };
}
