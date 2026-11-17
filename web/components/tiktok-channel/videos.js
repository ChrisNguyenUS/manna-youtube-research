// One video table for the TikTok channel dashboard (tabs: top, under, recent, all), plus the video detail drawer.
// The "Thư viện video" section is this table on its "Tất cả" tab.
import { esc, icon, fmt, full, mult, dur, emptyState, store, persist } from '../../lib.js';
import { on } from '../../dom.js';
import { num, pct, ddmm, fullDate, cover, inRange, RANGES, seg } from './util.js';

const PAGE = 15;
const COLS = [
  ['plays', 'Lượt xem'], ['likes', 'Tim'], ['comments', 'Bình luận'], ['shares', 'Chia sẻ'], ['engagementRate', 'Tương tác'], ['outlierScore', '× trung vị'], ['createdAt', 'Ngày đăng'],
];
const val = (v, k) => (k === 'createdAt' ? Date.parse(v.createdAt || '') || 0 : v[k] ?? -Infinity);
const tiktokLinks = (list) => list.map((v) => v.url).join('\n');
export const analyzeHref = (videos) => `#/video?videos=${encodeURIComponent(tiktokLinks(videos))}`;

/**
 * @param {HTMLElement} el
 * @param {any} data the tiktok_channel record data
 * @returns {{off: () => void, open: (v: any) => void, show: (tab: string, focus?: boolean) => void}}
 */
export function videoTable(el, data) {
  const st = store('tc-videos', { tab: 'top', sort: '', dir: 'desc', range: 'all' });
  const s = data.stats;
  let q = '';
  let limit = PAGE;
  const TABS = {
    top: { label: 'Nổi bật', def: ['outlierScore', 'desc'], pick: (v) => v.standout && !v.pinned, help: `Video có lượt xem ≥ ${s.outlierMultiple} lần view trung vị kênh (${fmt(s.medianPlays)}). Không tính video ghim.` },
    under: { label: 'Dưới trung vị', def: ['outlierScore', 'asc'], pick: (v) => !v.pinned && !v.young && v.outlierScore != null && v.outlierScore < 1, help: `Video đã đăng ít nhất ${s.minAge} ngày mà lượt xem dưới view trung vị kênh.` },
    recent: { label: 'Gần đây', def: ['createdAt', 'desc'], pick: (v) => v.ageDays != null && v.ageDays <= 30, help: 'Video đăng trong 30 ngày trước lúc phân tích.' },
    all: { label: 'Tất cả', def: ['createdAt', 'desc'], pick: () => true, help: `Toàn bộ ${data.videos.length} video đã lấy: ${s.newestCount} mới nhất từ trang kênh${s.searchCount ? `, ${s.searchCount} qua tìm kiếm TikTok` : ''}${data.videos.some((v) => v.pinned) ? ', kể cả video ghim' : ''}.` },
  };
  const drawer = document.createElement('div');
  drawer.className = 'tc-drawer-root';
  document.body.append(drawer);

  function rows() {
    const t = TABS[st.tab];
    const [key, dir] = st.sort ? [st.sort, st.dir] : t.def;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return data.videos
      .filter((v) => t.pick(v) && inRange(v, st.range) && words.every((w) => `${v.caption} ${(v.hashtags || []).join(' ')}`.toLowerCase().includes(w)))
      .sort((a, b) => (dir === 'asc' ? 1 : -1) * (val(a, key) - val(b, key)));
  }

  function render(keepFocus = false) {
    const list = rows();
    const [key, dir] = st.sort ? [st.sort, st.dir] : TABS[st.tab].def;
    const count = (k) => data.videos.filter(TABS[k].pick).length;
    const head = `<div class="tc-tabs" role="tablist">${Object.entries(TABS).map(([k, t]) => `<button type="button" role="tab" aria-selected="${st.tab === k}" class="${st.tab === k ? 'on' : ''}" data-tab="${k}">${t.label} <span>${count(k)}</span></button>`).join('')}</div>
      <div class="tc-tools-row tc-filter">
        <label class="tc-search">${icon('search')}<input class="input" type="search" data-q placeholder="Tìm trong caption hoặc hashtag" value="${esc(q)}" aria-label="Tìm video"></label>
        ${seg('range', RANGES, st.range)}
        <select class="input tc-sort" data-sort aria-label="Sắp xếp">${COLS.map(([k, l]) => `<option value="${k}" ${k === key ? 'selected' : ''}>Sắp theo: ${l}</option>`).join('')}</select>
        <button type="button" class="btn sm" data-dir title="Đổi chiều sắp xếp">${dir === 'asc' ? '↑ Tăng dần' : '↓ Giảm dần'}</button>
      </div>
      <p class="tc-note">${esc(TABS[st.tab].help)}</p>`;
    const th = (k, l) => `<th class="r"><button type="button" class="tc-th ${key === k ? 'on' : ''}" data-col="${k}">${l}${key === k ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`;
    const body = list.length
      ? `<div class="table-wrap"><table class="t tc-vt"><thead><tr><th class="tc-th-vid">Video</th>${COLS.map(([k, l]) => th(k, l)).join('')}<th></th></tr></thead><tbody>
        ${list.slice(0, limit).map((v) => `<tr>
          <td><button type="button" class="tc-vcell" data-open="${esc(v.id)}">${cover(v, 'tc-vthumb')}<span class="tc-vtext"><span class="tc-cap">${esc(v.caption || '(không caption)')}</span>
            <span class="tc-badges">${v.standout && !v.pinned ? `<span class="badge tc-hi">${icon('flame')} Nổi bật</span>` : ''}${v.pinned ? '<span class="badge plain">Ghim</span>' : ''}${v.young ? '<span class="badge plain">Mới đăng</span>' : ''}${v.from === 'search' ? '<span class="badge plain">Từ tìm kiếm</span>' : ''}<span class="muted small">${dur(v.durationSec)}</span></span></span></button></td>
          <td class="r num"><b>${fmt(v.plays)}</b></td><td class="r num">${fmt(v.likes)}</td><td class="r num">${fmt(v.comments)}</td><td class="r num">${fmt(v.shares)}</td>
          <td class="r num">${pct(v.engagementRate)}</td><td class="r"><span class="badge ${v.standout && !v.pinned ? 'tc-hi' : v.outlierScore != null && v.outlierScore < 1 ? 'plain' : 'tc-up'}">${mult(v.outlierScore)}</span></td>
          <td class="r num" title="${esc(fullDate(v.createdAt))}">${ddmm(v.createdAt)}</td>
          <td class="actions"><button type="button" class="btn sm" data-open="${esc(v.id)}">Chi tiết</button></td></tr>`).join('')}</tbody></table></div>
        <div class="tc-more-row"><span class="muted small">Đang hiện ${Math.min(limit, list.length)}/${list.length} video</span>${list.length > limit ? `<button type="button" class="btn sm" data-more>Xem thêm ${Math.min(PAGE, list.length - limit)}</button>` : ''}</div>`
      : emptyState(q ? 'Không có video khớp' : 'Không có video nào ở mục này', q ? ' Thử từ khác hoặc bỏ lọc ngày.' : '');
    el.innerHTML = head + body;
    if (keepFocus) {
      const i = /** @type {HTMLInputElement} */ (el.querySelector('[data-q]'));
      i.focus();
      i.setSelectionRange(i.value.length, i.value.length);
    }
  }

  function open(v) {
    if (!v) return;
    const back = /** @type {HTMLElement|null} */ (document.activeElement);
    drawer.innerHTML = `<div class="tc-overlay" data-close></div>
      <aside class="tc-drawer" role="dialog" aria-modal="true" aria-label="Chi tiết video" tabindex="-1">
        <div class="tc-drawer-head"><b>Chi tiết video</b><button type="button" class="icon-btn" data-close aria-label="Đóng">${icon('x')}</button></div>
        <div class="tc-drawer-body">
          <div class="tc-d-top">${cover(v, 'tc-d-cover')}<div>
            <p class="tc-d-cap">${esc(v.caption || '(không caption)')}</p>
            <div class="tc-badges">${v.standout && !v.pinned ? `<span class="badge tc-hi">${icon('flame')} Nổi bật</span>` : ''}${v.pinned ? '<span class="badge plain">Video ghim</span>' : ''}${v.young ? '<span class="badge plain">Mới đăng, view còn đang lên</span>' : ''}<span class="badge plain">${v.from === 'search' ? 'Lấy qua tìm kiếm' : 'Lấy từ trang kênh'}</span></div>
            <p class="muted small">Đăng ${fullDate(v.createdAt)} · dài ${dur(v.durationSec)}${v.musicTitle ? ` · nhạc: ${esc(v.musicTitle)}` : ''}</p></div></div>
          <div class="tc-d-grid">
            ${[['Lượt xem', full(v.plays)], ['× trung vị kênh', mult(v.outlierScore)], ['Tim', full(v.likes)], ['Bình luận', full(v.comments)], ['Chia sẻ', full(v.shares)], ['Lưu', full(v.saves)], ['Tương tác', pct(v.engagementRate)], ['Tuổi', v.ageDays == null ? '–' : `${num(v.ageDays)} ngày`]].map(([l, x]) => `<div><span>${l}</span><b>${x}</b></div>`).join('')}
          </div>
          <p class="tc-note">× trung vị kênh = lượt xem ÷ ${fmt(s.medianPlays)} (view trung vị của kênh). Tương tác = (tim + bình luận + chia sẻ + lưu) ÷ lượt xem.</p>
          ${v.hashtags?.length ? `<div class="chips">${v.hashtags.map((h) => `<span class="tag">#${esc(h)}</span>`).join('')}</div>` : ''}
          <div class="tc-d-actions">
            <a class="btn primary" href="${analyzeHref([v])}">${icon('bars')} Phân tích video: script và bình luận</a>
            <a class="btn" href="#/tiktok/comments?videos=${encodeURIComponent(v.url)}">${icon('message')} Chỉ lấy bình luận</a>
            <a class="btn" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('ext')} Mở trên TikTok</a>
          </div>
        </div></aside>`;
    drawer.classList.add('open');
    const panel = /** @type {HTMLElement} */ (drawer.querySelector('.tc-drawer'));
    panel.focus();
    const close = () => {
      drawer.classList.remove('open');
      drawer.innerHTML = '';
      document.removeEventListener('keydown', esc_);
      back?.focus?.();
    };
    const esc_ = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', esc_);
    drawer.querySelectorAll('[data-close], .tc-d-actions a:not([target])').forEach((b) => b.addEventListener('click', close));
  }

  const save = () => persist('tc-videos', st);
  const byId = (id) => data.videos.find((v) => String(v.id) === String(id));
  const offs = [
    on(el, 'click', '[data-tab]', (e, b) => ((st.tab = b.dataset.tab), (st.sort = ''), (limit = PAGE), save(), render())),
    on(el, 'click', '[data-seg]', (e, b) => ((st.range = b.dataset.v), (limit = PAGE), save(), render())),
    on(el, 'change', '[data-sort]', (e, b) => ((st.sort = /** @type {HTMLSelectElement} */ (b).value), (st.dir = 'desc'), save(), render())),
    on(el, 'click', '[data-dir]', () => {
      const [k, d] = st.sort ? [st.sort, st.dir] : TABS[st.tab].def;
      Object.assign(st, { sort: k, dir: d === 'asc' ? 'desc' : 'asc' });
      save();
      render();
    }),
    on(el, 'click', '[data-col]', (e, b) => {
      const [k, d] = st.sort ? [st.sort, st.dir] : TABS[st.tab].def;
      Object.assign(st, { sort: b.dataset.col, dir: k === b.dataset.col && d === 'desc' ? 'asc' : 'desc' });
      save();
      render();
    }),
    on(el, 'input', '[data-q]', (e, b) => ((q = /** @type {HTMLInputElement} */ (b).value), (limit = PAGE), render(true))),
    on(el, 'click', '[data-more]', () => ((limit += PAGE), render())),
    on(el, 'click', '[data-open]', (e, b) => open(byId(b.dataset.open))),
  ];
  if (!data.videos.some(TABS[st.tab].pick)) st.tab = 'all';
  render();
  return {
    off: () => (offs.forEach((f) => f()), drawer.remove()),
    open,
    show(tab, focus = false) {
      st.tab = tab;
      st.sort = '';
      limit = PAGE;
      render(focus);
    },
  };
}
