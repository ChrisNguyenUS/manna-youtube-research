// YouTube channel dashboard: one video table (tabs, format filter, search, sort, pages) and the video detail drawer.
// The "Thư viện video" section is this table on its "Tất cả" tab.
import { esc, icon, fmt, full, mult, dur, emptyState, store, persist, isSaved, toggleSave } from '../../lib.js';
import { on } from '../../dom.js';
import { pct, ddmm, fullDate, seg } from '../tiktok-channel/util.js';

export const FORMATS = { long: 'Video dài', short: 'Shorts', live: 'Đang live' };
const DAY = 86_400_000;
/** Public interaction rate of one video: (likes + comments) ÷ views; null unless all three are known. */
/** × channel median, with very small values shown as "< ×0,1" instead of ×0. @param {number|null|undefined} x */
export const times = (x) => (x == null ? '–' : x > 0 && x < 0.1 ? '< ×0,1' : mult(x));
export const interaction = (v) => (v.likes != null && v.comments != null && v.views ? (v.likes + v.comments) / v.views : null);

/**
 * Every analysed video in one shape. Long videos come from the channel's Videos tab, Shorts from its Shorts tab
 * (YouTube's own split, not a duration rule). Shorts carry only title and views.
 * @param {any} d channel_analysis data @param {any[]} history snapshots, oldest first
 */
export function allVideos(d, history) {
  const shortsMed = d.stats.shortsMedian;
  const growth = (id, views) => {
    const first = history.find((s) => s.views?.[id] != null);
    const last = history[history.length - 1];
    if (!first || !last || first === last || last.views?.[id] == null) return null;
    const days = (last.at - first.at) / DAY;
    return days > 0 ? (last.views[id] - first.views[id]) / days : null;
  };
  const med = d.stats.medianAll;
  // Unrounded (the report keeps one decimal, which turns very weak videos into ×0).
  const long = d.videos.map((v) => ({ ...v, format: v.isLive ? 'live' : 'long', rate: interaction(v), score: med && v.views != null ? v.views / med : null, growth: growth(v.id, v.views) }));
  const shorts = (d.shorts || []).map((s) => ({
    id: s.id, title: s.title, url: s.url || `https://www.youtube.com/shorts/${s.id}`, views: s.views, format: 'short', likes: null, comments: null, rate: null,
    durationSec: null, publishedAt: null, age: null, score: shortsMed && s.views != null ? s.views / shortsMed : null, growth: growth(s.id, s.views),
  }));
  return [...long, ...shorts];
}

const SORTS = [
  ['views', 'Nhiều view nhất'], ['likes', 'Nhiều lượt thích nhất'], ['comments', 'Nhiều bình luận nhất'], ['rate', 'Tương tác cao nhất'],
  ['date', 'Mới nhất'], ['duration', 'Dài nhất'], ['score', '× trung vị cao nhất'], ['growth', 'Tăng view nhanh nhất (từ lúc theo dõi)'],
];
const val = (v, k) => {
  const x = k === 'date' ? (v.publishedAt ? Date.parse(v.publishedAt) : v.age != null ? -v.age * DAY : null) : k === 'duration' ? v.durationSec : v[k];
  return x == null ? null : x;
};

/**
 * @param {HTMLElement} el @param {any} d channel_analysis data @param {any[]} list from allVideos
 * @param {{canGrow: boolean}} o canGrow: at least two snapshots exist
 */
export function videoTable(el, d, list, { canGrow }) {
  const st = store('yc-videos', { tab: 'top', fmt: 'all', sort: '', size: 20, range: 'all' });
  if (!canGrow && st.sort === 'growth') st.sort = '';
  let q = '';
  let page = 0;
  const s = d.stats;
  const settled = (v) => v.age != null && v.age >= 7;
  const TABS = {
    top: { label: 'Hiệu suất cao', sort: 'score', pick: (v) => (v.format === 'short' ? v.score != null && v.score >= s.outlierMultiple : v.standout), help: `Video dài có view ≥ ${s.outlierMultiple}× view trung vị video dài (${fmt(s.medianAll)}); Shorts so với trung vị Shorts (${fmt(s.shortsMedian)}). Mỗi định dạng so với chính nó.` },
    under: { label: 'Hiệu suất thấp', sort: 'score', asc: true, pick: (v) => v.format === 'long' && settled(v) && v.score != null && v.score < 0.5, help: 'Video dài đăng từ 7 ngày trở lên mà view dưới một nửa trung vị video dài của kênh. Video mới chưa bị tính vì còn đang lên view.' },
    recent: { label: 'Mới đăng', sort: 'date', pick: (v) => v.age != null && v.age <= 30, help: 'Video dài đăng trong 30 ngày trước lúc phân tích. Shorts không có ngày đăng.' },
    discussed: { label: 'Nhiều bình luận', sort: 'comments', pick: (v) => v.comments != null, help: `Chỉ ${list.filter((v) => v.comments != null).length} video mới nhất có số bình luận (lấy riêng từng video); các video khác chưa có số này.` },
    all: { label: 'Tất cả video', sort: 'date', pick: () => true, help: `${list.length} video đã lấy: ${list.filter((v) => v.format !== 'short').length} video dài (tab Video) và ${list.filter((v) => v.format === 'short').length} Shorts (tab Shorts). Livestream đã kết thúc chưa được lấy.` },
  };

  function rows() {
    const t = TABS[st.tab];
    const key = st.sort || t.sort;
    const asc = !st.sort && t.asc;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = list.filter((v) => t.pick(v) && (st.fmt === 'all' || v.format === st.fmt) && (st.range === 'all' || (v.age != null && v.age <= Number(st.range))) && words.every((w) => String(v.title).toLowerCase().includes(w)));
    // Videos without the sort value go last, whichever the direction.
    return out.sort((a, b) => {
      const x = val(a, key), y = val(b, key);
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return asc ? x - y : y - x;
    });
  }

  function render(focus = false) {
    const all = rows();
    const pages = Math.max(1, Math.ceil(all.length / st.size));
    page = Math.min(page, pages - 1);
    const shown = all.slice(page * st.size, (page + 1) * st.size);
    const key = st.sort || TABS[st.tab].sort;
    const count = (k) => list.filter(TABS[k].pick).length;
    el.innerHTML = `<div class="tc-tabs" role="tablist">${Object.entries(TABS).map(([k, t]) => `<button type="button" role="tab" aria-selected="${st.tab === k}" class="${st.tab === k ? 'on' : ''}" data-tab="${k}">${t.label} <span>${count(k)}</span></button>`).join('')}</div>
      <div class="tc-tools-row tc-filter">
        <label class="tc-search">${icon('search')}<input class="input" type="search" data-q placeholder="Tìm theo tiêu đề" value="${esc(q)}" aria-label="Tìm video"></label>
        ${seg('fmt', [['all', 'Mọi định dạng'], ['long', 'Video dài'], ['short', 'Shorts'], ['live', 'Live']], st.fmt)}
        ${seg('range', [['30', '30 ngày'], ['90', '90 ngày'], ['180', '180 ngày'], ['all', 'Mọi lúc']], st.range)}
        <select class="input tc-sort" data-sort aria-label="Sắp xếp">${SORTS.map(([k, l]) => `<option value="${k}" ${k === key ? 'selected' : ''} ${k === 'growth' && !canGrow ? 'disabled' : ''}>${l}${k === 'growth' && !canGrow ? ' (cần 2 lần phân tích)' : ''}</option>`).join('')}</select>
      </div>
      <p class="tc-note">${esc(TABS[st.tab].help)}</p>
      ${shown.length ? `<div class="table-wrap"><table class="t tc-vt yc-vt"><thead><tr><th class="tc-th-vid">Video</th><th class="r">View</th><th class="r">Thích</th><th class="r">Bình luận</th><th class="r" title="(thích + bình luận) ÷ view">Tương tác</th><th class="r">× TV</th><th class="r">Dài</th><th>Định dạng</th><th class="r">Ngày đăng</th><th></th></tr></thead><tbody>
        ${shown.map((v) => `<tr>
          <td><div class="tc-vcell"><a href="${esc(v.url)}" target="_blank" rel="noopener" title="Mở trên YouTube" class="yc-thumb ${v.format}"><img loading="lazy" src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" onerror="this.style.visibility='hidden'">${v.durationSec ? `<span>${dur(v.durationSec)}</span>` : ''}</a>
            <button type="button" class="tc-vtext yc-open" data-open="${esc(v.id)}"><span class="tc-cap">${esc(v.title)}</span>${v.standout ? `<span class="tc-badges"><span class="badge tc-hi">${icon('flame')} Nổi bật</span></span>` : ''}</button></div></td>
          <td class="r num"><b>${fmt(v.views)}</b></td><td class="r num">${v.likes == null ? '<span class="muted">–</span>' : fmt(v.likes)}</td><td class="r num">${v.comments == null ? '<span class="muted">–</span>' : fmt(v.comments)}</td>
          <td class="r num">${pct(v.rate)}</td><td class="r"><span class="badge ${v.standout || (v.format === 'short' && v.score >= s.outlierMultiple) ? 'tc-hi' : v.score != null && v.score < 1 ? 'plain' : 'tc-up'}">${times(v.score)}</span></td>
          <td class="r num">${v.durationSec ? dur(v.durationSec) : '–'}</td><td><span class="badge plain">${FORMATS[v.format]}</span></td>
          <td class="r num" ${v.publishedAt ? `title="${esc(fullDate(v.publishedAt))}"` : ''}>${v.publishedAt ? ddmm(v.publishedAt) : v.published ? `<span class="muted" title="Ước tính từ chữ YouTube hiển thị">${esc(v.published)}</span>` : '–'}</td>
          <td class="actions"><button type="button" class="btn sm" data-open="${esc(v.id)}">Chi tiết</button></td></tr>`).join('')}</tbody></table></div>
        <div class="tc-more-row"><span class="muted small">${page * st.size + 1}–${page * st.size + shown.length} / ${all.length} video</span>
          <span class="yc-pager"><select class="input tc-sort" data-size aria-label="Số video mỗi trang">${[10, 20, 50].map((n) => `<option value="${n}" ${st.size === n ? 'selected' : ''}>${n} / trang</option>`).join('')}</select>
          <button type="button" class="btn sm" data-page="-1" ${page === 0 ? 'disabled' : ''}>‹ Trước</button><span class="small">Trang ${page + 1}/${pages}</span><button type="button" class="btn sm" data-page="1" ${page >= pages - 1 ? 'disabled' : ''}>Sau ›</button></span></div>`
        : emptyState(q ? 'Không có video khớp' : 'Không có video nào ở mục này', q ? ' Thử từ khác hoặc bỏ bộ lọc.' : '')}`;
    if (focus) {
      const i = /** @type {HTMLInputElement} */ (el.querySelector('[data-q]'));
      i.focus();
      i.setSelectionRange(i.value.length, i.value.length);
    }
  }

  const drawer = document.createElement('div');
  drawer.className = 'tc-drawer-root';
  document.body.append(drawer);
  function open(v) {
    if (!v) return;
    const back = /** @type {HTMLElement|null} */ (document.activeElement);
    const saved = isSaved('video', v.id);
    drawer.innerHTML = `<div class="tc-overlay" data-close></div>
      <aside class="tc-drawer" role="dialog" aria-modal="true" aria-label="Chi tiết video" tabindex="-1">
        <div class="tc-drawer-head"><b>Chi tiết video</b><button type="button" class="icon-btn" data-close aria-label="Đóng">${icon('x')}</button></div>
        <div class="tc-drawer-body">
          <a href="${esc(v.url)}" target="_blank" rel="noopener"><img class="yc-d-thumb" src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt=""></a>
          <p class="tc-d-cap"><b>${esc(v.title)}</b></p>
          <div class="tc-badges"><span class="badge plain">${FORMATS[v.format]}</span>${v.standout ? `<span class="badge tc-hi">${icon('flame')} Nổi bật</span>` : ''}${v.category ? `<span class="badge plain">${esc(v.category)}</span>` : ''}</div>
          <div class="tc-d-grid">
            ${[['View', full(v.views)], ['× trung vị', times(v.score)], ['Thích', v.likes == null ? 'chưa có' : full(v.likes)], ['Bình luận', v.comments == null ? 'chưa có' : full(v.comments)],
              ['Tương tác', pct(v.rate)], ['Dài', v.durationSec ? dur(v.durationSec) : '–'], ['Đăng', v.publishedAt ? fullDate(v.publishedAt) : v.published || '–'], ['View/ngày (cả đời video)', v.viewsPerDay != null ? fmt(v.viewsPerDay) : '–']]
              .map(([l, x]) => `<div><span>${l}</span><b>${x}</b></div>`).join('')}
          </div>
          ${v.growth != null ? `<p class="small">Từ lúc theo dõi: tăng khoảng <b>${fmt(v.growth)}</b> view/ngày (giữa lần phân tích đầu và gần nhất có video này).</p>` : ''}
          <p class="tc-note">× trung vị = view ÷ view trung vị ${v.format === 'short' ? `Shorts của kênh (${fmt(s.shortsMedian)})` : `video dài của kênh (${fmt(s.medianAll)})`}. Tương tác công khai ước tính = (thích + bình luận) ÷ view; không phải tỷ lệ tương tác trong YouTube Studio. View/ngày cả đời = view ÷ tuổi video, không phải tốc độ hiện tại.</p>
          ${v.tags?.length ? `<div class="chips">${v.tags.slice(0, 20).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
          <div class="tc-d-actions">
            <a class="btn primary" href="#/comments?videos=${encodeURIComponent(v.id)}">${icon('message')} Lấy và đọc bình luận</a>
            <a class="btn" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('ext')} Mở trên YouTube</a>
            <button type="button" class="btn ${saved ? 'on' : ''}" data-save>${icon('bookmark')} ${saved ? 'Đã lưu video' : 'Lưu video'}</button>
          </div>
        </div></aside>`;
    drawer.classList.add('open');
    /** @type {HTMLElement} */ (drawer.querySelector('.tc-drawer')).focus();
    const close = () => {
      drawer.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      back?.focus?.();
    };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    drawer.querySelectorAll('[data-close], .tc-d-actions a:not([target])').forEach((b) => b.addEventListener('click', close));
    drawer.querySelector('[data-save]').addEventListener('click', async (e) => {
      const b = /** @type {HTMLElement} */ (e.currentTarget);
      await toggleSave('video', v.id, v.title, { id: v.id, title: v.title, channelTitle: d.info.title, views: v.views, viewSub: v.viewSub ?? null }, b);
      b.innerHTML = `${icon('bookmark')} ${isSaved('video', v.id) ? 'Đã lưu video' : 'Lưu video'}`;
    });
  }

  const save = () => persist('yc-videos', st);
  const byId = (id) => list.find((v) => String(v.id) === String(id));
  const offs = [
    on(el, 'click', '[data-tab]', (e, b) => ((st.tab = b.dataset.tab), (st.sort = ''), (page = 0), save(), render())),
    on(el, 'click', '[data-seg]', (e, b) => ((st[b.dataset.seg] = b.dataset.v), (page = 0), save(), render())),
    on(el, 'change', '[data-sort]', (e, b) => ((st.sort = /** @type {HTMLSelectElement} */ (b).value), (page = 0), save(), render())),
    on(el, 'change', '[data-size]', (e, b) => ((st.size = Number(/** @type {HTMLSelectElement} */ (b).value)), (page = 0), save(), render())),
    on(el, 'click', '[data-page]', (e, b) => ((page += Number(b.dataset.page)), render())),
    on(el, 'input', '[data-q]', (e, b) => ((q = /** @type {HTMLInputElement} */ (b).value), (page = 0), render(true))),
    on(el, 'click', '[data-open]', (e, b) => open(byId(b.dataset.open))),
  ];
  render();
  return {
    off: () => (offs.forEach((f) => f()), drawer.remove()),
    open,
    /** @param {string} tab @param {string} [fmt] @param {boolean} [focus] */
    show(tab, fmt = 'all', focus = false) {
      Object.assign(st, { tab, fmt, sort: '' });
      page = 0;
      render(focus);
    },
  };
}

