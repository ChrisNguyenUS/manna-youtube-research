import { records } from '../../http/client.js';
import { esc, icon, chips, bindChips, runJob, progressCard, updateProgress, toast, store, persist, fmt, ago, emptyState, bindTips, setUrl, resumeJob, toggleSave } from '../../lib.js';
import { tiktokVideoCard, tiktokVideoFilters, offTopicDetails, tiktokCriteria } from '../../components/index.js';
import { scope } from '../../dom.js';
import { savedTikTokVideo } from '../../saved-items.js';

const FORM = { keywords: '', perKeyword: 60, keepOffTopic: false, minPlays: 0, minLikes: 0, maxAgeDays: 0, minEngagement: 0 };
const FILTER = { age: '', minLikes: '', minComments: '', onTopic: true, sort: 'hot' };
const SORTS = { hot: 'hotScore', plays: 'plays', likes: 'likes', shares: 'shares', saves: 'saves', new: 'ageDays' };

export async function mount(root, params) {
  const st = store('tt-search-form', FORM);
  const f = store('tt-search-filter', FILTER);
  if (params.q) st.keywords = params.q;
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('search')} Tìm video TikTok</h1>
      <p>Video hot theo từ khoá, chỉ giữ video đúng chủ đề (có từ khoá, hoặc có hashtag của chủ đề; bỏ video về nước khác). Từ khoá nên có chữ tiếng Việt và ghi rõ nước (vd "thi quốc tịch mỹ").</p></div></div>
    <div class="card card-pad">
      <div class="field"><label>Từ khoá (cách nhau bằng dấu phẩy)</label><input class="input" data-k="keywords" placeholder="VD: phỏng vấn quốc tịch, thi quốc tịch mỹ" value="${esc(st.keywords)}"></div>
      <div class="row" style="margin-top:12px"><span class="small muted">Video mỗi từ khoá</span>${chips('perKeyword', [30, 60, 120, 200].map((v) => ({ v, label: String(v) })), st.perKeyword)}
        <label class="check" style="margin-left:12px"><input type="checkbox" data-k="keepOffTopic" ${st.keepOffTopic ? 'checked' : ''}> Giữ cả video lạc đề</label></div>
      ${tiktokVideoFilters(st)}
      <div class="row" style="margin-top:14px"><button class="btn primary lg" data-run>${icon('search')} Tìm video</button><span class="muted small">~1–2 phút mỗi từ khoá · miễn phí</span></div>
    </div>
    <div data-out style="margin-top:14px"></div><div class="card" data-history style="margin-top:14px"></div>`;
  const out = root.querySelector('[data-out]');
  const shown = scope();
  bindChips(root.querySelector('.card'), (n, v) => ((st[n] = Number(v)), persist('tt-search-form', st)));
  root.querySelector('[data-k="keepOffTopic"]').addEventListener('change', (e) => ((st.keepOffTopic = e.target.checked), persist('tt-search-form', st)));
  root.querySelector('[data-run]').addEventListener('click', run);

  async function run() {
    st.keywords = root.querySelector('[data-k="keywords"]').value.trim();
    persist('tt-search-form', st);
    if (!st.keywords) return toast('Nhập từ khoá', 'error');
    out.innerHTML = progressCard(`Đang tìm TikTok: ${st.keywords}`);
    try {
      const res = await runJob('tiktok_search', st, (p) => updateProgress(out, p));
      await show(res.id);
      history();
    } catch (e) {
      out.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  }

  async function show(id) {
    const rec = await records.get(id);
    setUrl('/tiktok/search', { id: rec.id }); // a reload or a copied link opens this result again
    const d = rec.data;
    const selected = new Set();
    const c = d.counts;
    out.innerHTML = `<div class="kpis">
        <div class="kpi"><div class="label">Video giữ lại</div><div class="value">${d.videos.length}</div><div class="hint">${c.found} tìm được · ${c.duplicates} trùng</div></div>
        <div class="kpi"><div class="label">Lạc đề đã bỏ</div><div class="value">${c.offTopic}</div><div class="hint">không khớp chủ đề hoặc về nước khác${c.belowFilters ? ` · ${c.belowFilters} dưới ngưỡng lọc` : ''}</div></div>
        <div class="kpi"><div class="label">Không có comment</div><div class="value">${c.zeroComment}</div><div class="hint">${c.emptyKeywords.length ? `Từ khoá không ra video: ${esc(c.emptyKeywords.join(', '))}` : 'mọi từ khoá đều có video'}</div></div></div>
      ${offTopicDetails(d.offTopicVideos, c.offTopic)}
      <div class="filter-table" style="margin-top:14px" data-filters>
        <div class="filter-row"><div class="fr-label">Đăng trong</div>${chips('age', [7, 30, 90].map((v) => ({ v, label: `${v} ngày` })), f.age)}<div></div></div>
        <div class="filter-row"><div class="fr-label">Like tối thiểu</div>${chips('minLikes', [100, 1000, 10000].map((v) => ({ v, label: fmt(v) + '+' })), f.minLikes)}<div></div></div>
        <div class="filter-row"><div class="fr-label">Comment tối thiểu</div>${chips('minComments', [10, 50, 200].map((v) => ({ v, label: v + '+' })), f.minComments)}<div></div></div>
      </div>
      <div class="card" style="margin-top:14px"><div class="row" style="padding:12px 16px;border-bottom:1px solid var(--line)"><b data-count></b><span class="muted">video</span><span class="spacer"></span>
        <label class="small muted">Xếp theo</label><select class="select input sm" style="width:auto" data-sort>${Object.entries({ hot: 'Hot', plays: 'View', likes: 'Like', shares: 'Share', saves: 'Save', new: 'Mới nhất' }).map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn sm primary" data-cm disabled>${icon('message')} Lấy comment</button>
        <a class="btn sm" href="${records.exportUrl(id, 'csv')}">${icon('download')} CSV</a></div><div class="vgrid" data-list></div></div>`;
    const filters = out.querySelector('[data-filters]');
    filters.querySelectorAll('[data-chips]').forEach((g) => (g.dataset.allowOff = ''));
    bindChips(filters, (n, v) => ((f[n] = v), persist('tt-search-filter', f), render()));
    out.querySelector('[data-sort]').addEventListener('change', (e) => ((f.sort = e.target.value), persist('tt-search-filter', f), render()));
    shown.off();
    shown.add(bindTips(out));
    shown.on(out, 'click', '[data-ttsave]', (e, el) => {
      const v = d.videos.find((x) => x.id === el.dataset.ttsave);
      if (!v) return;
      const it = savedTikTokVideo(v);
      toggleSave('tiktok_video', it.ref, it.title, it.data, el);
    });
    shown.on(out, 'change', '[data-sel]', (e, el) => {
      el.checked ? selected.add(el.dataset.sel) : selected.delete(el.dataset.sel);
      out.querySelector('[data-cm]').disabled = !selected.size;
    });
    out.querySelector('[data-cm]').addEventListener('click', () => window.__go('/tiktok/comments', { videos: d.videos.filter((v) => selected.has(v.id)).map((v) => v.url).join('\n') }));
    function render() {
      const key = SORTS[f.sort] || 'hotScore';
      const list = d.videos
        .filter((v) => (!f.age || (v.ageDays != null && v.ageDays <= Number(f.age))) && (!f.minLikes || v.likes >= Number(f.minLikes)) && (!f.minComments || v.comments >= Number(f.minComments)))
        .sort((a, b) => (f.sort === 'new' ? (a.ageDays ?? 1e9) - (b.ageDays ?? 1e9) : (b[key] ?? -1) - (a[key] ?? -1)));
      out.querySelector('[data-count]').textContent = list.length;
      out.querySelector('[data-list]').innerHTML = list.length ? list.map((v) => tiktokVideoCard(v, { selected })).join('') : emptyState('Không có video khớp bộ lọc');
    }
    render();
  }

  async function history() {
    const list = await records.list('tiktok_search', 5);
    root.querySelector('[data-history]').innerHTML = `<div class="card-head"><h3>Lần tìm trước</h3><a class="btn sm" href="#/history?kind=tiktok_search">Xem tất cả</a></div>${list.length ? list.map((r) => `<div class="list-row"><a class="name" href="#/tiktok/search?id=${r.id}">${esc(r.title)}</a>${tiktokCriteria(r.params) ? `<span class="small muted">${esc(tiktokCriteria(r.params))}</span>` : ''}<span class="when">${ago(r.created_at)}</span><button class="icon-btn" data-del="${r.id}" title="Xoá">${icon('trash')}</button></div>`).join('') : emptyState('Chưa tìm lần nào')}`;
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => (await records.remove(b.dataset.del), history())));
  }
  history();
  if (params.id) show(params.id);
  else resumeJob('tiktok_search', out, (j) => `Đang tìm TikTok: ${j.title}`, async (res) => (await show(res.id), history()));
  return () => shown.off();
}
