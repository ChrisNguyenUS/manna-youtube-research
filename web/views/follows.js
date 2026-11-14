// "Theo dõi": followed YouTube and TikTok channels. "Cập nhật" checks them for new videos and outliers.
import { follows } from '../http/client.js';
import { esc, icon, fmt, mult, ago, emptyState, thumb, toast, runJob, activeJob, watchJob, progressCard, updateProgress, errorCallout, loadFollows, store, persist, bindTips } from '../lib.js';
import { scope } from '../dom.js';

const PLATFORM = { youtube: 'YouTube', tiktok: 'TikTok' };
const days = (d) => (d == null ? '' : d < 1 ? `${Math.max(1, Math.round(d * 24))} giờ` : `${Math.round(d)} ngày`);
const analyzeHref = (f) => (f.platform === 'tiktok' ? `#/tiktok/channel?input=${encodeURIComponent('@' + f.ref)}&run=1` : `#/channel?input=${encodeURIComponent(f.ref)}`);

/** One video of a check: thumbnail, views, × typical, age; "Mới" when the previous check had not seen it. */
function tile(f, v, isNew) {
  const src = f.platform === 'youtube' ? thumb(v.id) : v.thumb;
  return `<a class="fl-video ${v.standout && !v.pinned ? 'hot' : ''}" href="${esc(v.url)}" target="_blank" rel="noopener" title="${esc(v.title)}">
    <span class="fl-thumb ${f.platform}">${src ? `<img loading="lazy" src="${esc(src)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : ''}
      ${isNew ? '<span class="badge accent fl-new">Mới</span>' : ''}${v.pinned ? '<span class="badge plain fl-new">Ghim</span>' : ''}</span>
    <span class="fl-title">${esc(String(v.title || '(không tiêu đề)').slice(0, 90))}</span>
    <span class="fl-meta"><b>${fmt(v.views)}</b> view · <span class="badge ${v.standout && !v.pinned ? 'accent' : 'plain'}">${mult(v.score)}</span> · ${days(v.ageDays)}</span></a>`;
}

export async function mount(root, params) {
  const st = store('follows-view', { platform: '', onlyHot: false });
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('eye')} Kênh đang theo dõi</h1>
      <p>Kênh YouTube và TikTok bạn theo dõi. Bấm Cập nhật để xem video mới từ lần trước và video nào đang vượt trội so với chính kênh đó.</p></div>
      <div class="head-actions"><button class="btn primary" data-refresh-all>${icon('refresh')} Cập nhật tất cả</button></div></div>
    <div class="card card-pad"><div class="input-row">
      <select class="input" data-platform style="max-width:130px"><option value="tiktok">TikTok</option><option value="youtube">YouTube</option></select>
      <input class="input" data-input placeholder="@tenkenh hoặc link kênh">
      <button class="btn" data-add>${icon('plus')} Theo dõi</button></div>
      <div class="help muted small" style="margin-top:6px">Hoặc bấm Theo dõi ở màn Phân tích kênh. Kênh TikTok cần trình duyệt ẩn (npm run setup:tiktok); mỗi kênh mất khoảng 15–30 giây.</div></div>
    <div data-prog style="margin-top:14px"></div>
    <div class="row" data-filters style="margin-top:14px"></div>
    <div data-list style="margin-top:10px"></div>`;
  const shown = scope();
  const prog = /** @type {HTMLElement} */ (root.querySelector('[data-prog]'));
  const listEl = /** @type {HTMLElement} */ (root.querySelector('[data-list]'));
  const input = /** @type {HTMLInputElement} */ (root.querySelector('[data-input]'));
  const sel = /** @type {HTMLSelectElement} */ (root.querySelector('[data-platform]'));
  sel.value = st.platform || 'tiktok';
  /** @type {any[]} */
  let all = [];
  let armed = ''; // key of the channel whose unfollow button waits for a second click
  /** @type {string|null} */
  let running = null; // key being checked ('' = all)

  function render() {
    const count = (p) => all.filter((f) => !p || f.platform === p).length;
    root.querySelector('[data-filters]').innerHTML = `<div class="chips">${['', 'youtube', 'tiktok'].map((p) => `<button type="button" class="chip ${st.platform === p ? 'on' : ''}" data-filter="${p}">${p ? PLATFORM[p] : 'Tất cả'} · ${count(p)}</button>`).join('')}</div>
      <label class="check" style="margin-left:12px"><input type="checkbox" data-hot ${st.onlyHot ? 'checked' : ''}> Chỉ video mới hoặc nổi bật</label>`;
    const list = all.filter((f) => !st.platform || f.platform === st.platform);
    if (!list.length) return void (listEl.innerHTML = `<div class="card">${emptyState(all.length ? 'Không có kênh nào ở mục này' : 'Chưa theo dõi kênh nào', ' Thêm kênh ở ô bên trên, hoặc bấm Theo dõi ở màn Phân tích kênh.')}</div>`);
    listEl.innerHTML = list.map((f) => {
      const key = `${f.platform}:${f.ref}`;
      const s = f.lastScan;
      const newSet = new Set(s?.newIds || []);
      const vids = (s?.videos || []).filter((v) => !st.onlyHot || newSet.has(v.id) || (v.standout && !v.pinned));
      const hot = (s?.videos || []).filter((v) => v.standout && !v.pinned).length;
      return `<div class="card fl-card" data-key="${esc(key)}">
        <div class="fl-head">
          ${f.data.avatar ? `<img class="fl-avatar" src="${esc(f.data.avatar)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : `<span class="fl-avatar"></span>`}
          <div class="fl-name"><a href="${esc(f.data.url || '#')}" target="_blank" rel="noopener"><b>${esc(f.title || f.ref)}</b></a>
            <div class="small muted"><span class="badge plain">${PLATFORM[f.platform]}</span> ${esc(f.data.handle || '')}${f.data.followers != null ? ` · ${fmt(f.data.followers)} ${f.platform === 'tiktok' ? 'follower' : 'sub'}` : ''}${f.data.medianViews != null ? ` · trung vị ${fmt(f.data.medianViews)} view` : ''}</div></div>
          <span class="spacer"></span>
          <span class="small muted">${f.checkedAt ? `kiểm tra ${ago(f.checkedAt)}` : 'chưa kiểm tra'}</span>
          ${s?.newIds?.length ? `<span class="badge accent">${s.newIds.length} video mới</span>` : ''}${hot ? `<span class="badge plain">${hot} nổi bật</span>` : ''}
          <button class="btn sm" data-one="${esc(key)}" ${running != null ? 'disabled' : ''}>${icon('refresh')} Cập nhật</button>
          <a class="btn sm" href="${analyzeHref(f)}">${icon('bars')} Phân tích</a>
          ${armed === key ? `<button class="btn sm danger" data-unfollow="${esc(key)}">Bỏ theo dõi?</button>` : `<button class="icon-btn" data-unfollow="${esc(key)}" title="Bỏ theo dõi">${icon('trash')}</button>`}
        </div>
        ${s?.error ? `<div class="callout fl-err">Lần kiểm tra ${ago(Date.parse(s.at))} lỗi: ${esc(s.error.message)}${s.videos?.length ? ' Đang hiện kết quả lần trước.' : ''}</div>` : ''}
        ${s ? (vids.length ? `<div class="fl-videos">${vids.map((v) => tile(f, v, newSet.has(v.id))).join('')}</div>` : `<div class="muted small fl-empty">${st.onlyHot ? 'Không có video mới hay nổi bật.' : 'Không thấy video nào.'}</div>`) : `<div class="muted small fl-empty">Bấm Cập nhật để lấy video mới nhất của kênh.</div>`}
      </div>`;
    }).join('');
  }

  async function load() {
    all = await follows.list();
    render();
  }

  /** Run (or follow an already running) check; the list reloads afterwards. */
  async function check(title, job, key = '') {
    running = key;
    render();
    prog.innerHTML = progressCard(title);
    try {
      const res = await job((p) => updateProgress(prog, p));
      prog.innerHTML = '';
      if (res?.checked > 1 || res?.failed) toast(`Đã kiểm tra ${res.checked} kênh: ${res.newVideos} video mới${res.failed ? `, ${res.failed} kênh lỗi` : ''}`);
    } catch (e) {
      prog.innerHTML = errorCallout(e);
    }
    running = null;
    await load();
  }
  const refresh = (f) => check(f ? `Đang kiểm tra ${f.title || f.ref}` : `Đang kiểm tra ${all.length} kênh`, (on) => runJob('follow_refresh', f ? { platform: f.platform, ref: f.ref } : {}, on), f ? `${f.platform}:${f.ref}` : '');

  root.querySelector('[data-refresh-all]').addEventListener('click', () => (all.length ? refresh(null) : toast('Chưa theo dõi kênh nào', 'error')));
  async function add() {
    const text = input.value.trim();
    if (!text) return toast('Nhập @tên kênh hoặc link', 'error');
    const btn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-add]'));
    btn.disabled = true;
    try {
      const f = await follows.addInput(/** @type {'youtube'|'tiktok'} */ (sel.value), text);
      input.value = '';
      await Promise.all([load(), loadFollows()]);
      refresh(all.find((x) => x.platform === f.platform && x.ref === f.ref) || null);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }
  root.querySelector('[data-add]').addEventListener('click', add);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && add());

  shown.on(root, 'click', '[data-filter]', (e, b) => ((st.platform = b.dataset.filter), persist('follows-view', st), render()));
  shown.on(root, 'change', '[data-hot]', (e, b) => ((st.onlyHot = /** @type {HTMLInputElement} */ (b).checked), persist('follows-view', st), render()));
  shown.on(listEl, 'click', '[data-one]', (e, b) => refresh(all.find((f) => `${f.platform}:${f.ref}` === b.dataset.one)));
  shown.on(listEl, 'click', '[data-unfollow]', async (e, b) => {
    const key = String(b.dataset.unfollow);
    if (armed !== key) return void ((armed = key), render()); // first click only asks
    const f = all.find((x) => `${x.platform}:${x.ref}` === key);
    armed = '';
    if (!f) return;
    await follows.remove({ platform: f.platform, ref: f.ref });
    toast('Đã bỏ theo dõi');
    await Promise.all([load(), loadFollows()]);
  });
  shown.add(bindTips(root));

  await load();
  activeJob('follow_refresh').then((live) => live && check(`Đang kiểm tra: ${live.title}`, (on) => watchJob(live.id, on), live.params?.ref ? `${live.params.platform}:${live.params.ref}` : ''));
  return () => shown.off();
}
