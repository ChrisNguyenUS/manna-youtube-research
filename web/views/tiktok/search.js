import { records } from '../../http/client.js';
import { tiktokLoginNotice } from '../../components/tiktok-login.js';
import { findHead, platformTabs, searchBar, section, fieldRows, checkRow, advanced, changedCount, estimate, regionSelect, bindShell } from '../../components/find-shell.js';
import { findHistory, rerunRecord } from '../../components/find-history.js';
import { TIKTOK_REGIONS, TIKTOK_COUNTRY, TIKTOK_AGE_CHIPS, TIKTOK_PLAYS_CHIPS, knownRegion } from '../../search-options.js';
import { esc, icon, chips, bindChips, runJob, progressCard, updateProgress, toast, store, persist, fmt, ago, emptyState, bindTips, setUrl, resumeJob, toggleSave, errorCallout } from '../../lib.js';
import { tiktokVideoCard, offTopicDetails } from '../../components/index.js';
import { scope } from '../../dom.js';
import { savedTikTokVideo } from '../../saved-items.js';

const FORM = { keywords: '', gl: '', perKeyword: 60, keepOffTopic: false, minPlays: 0, minLikes: 0, maxAgeDays: 0, minEngagement: 0 };
const ADVANCED = ['perKeyword'];
const OFF_TOPIC_TIP = 'Đúng chủ đề = caption/hashtag có từ khoá (bỏ chữ “mỹ”, năm), hoặc có ≥ 2 hashtag của chủ đề; video về nước khác bị bỏ. Bỏ tích để giữ hết.';
const FILTER = { age: '', minLikes: '', minComments: '', onTopic: true, sort: 'hot' };
const SORTS = { hot: 'hotScore', plays: 'plays', likes: 'likes', shares: 'shares', saves: 'saves', new: 'ageDays' };

export async function mount(root, params) {
  const st = store('tt-search-form', FORM);
  const f = store('tt-search-filter', FILTER);
  if (params.q) st.keywords = params.q;
  if (knownRegion(params.gl, TIKTOK_REGIONS)) st.gl = params.gl; // carried over from the YouTube side
  root.innerHTML = `
    ${findHead('search', 'Tìm video', 'Video TikTok hot theo từ khoá, chỉ giữ video đúng chủ đề (có từ khoá hoặc hashtag của chủ đề, không nói về nước khác).')}
    ${platformTabs('/tiktok/search')}
    <div data-ttlogin></div>
    <div data-form>
      ${searchBar({ key: 'keywords', value: st.keywords, label: 'Từ khoá', placeholder: 'Từ khoá, cách nhau bằng dấu phẩy. VD: phỏng vấn quốc tịch, thi quốc tịch mỹ', button: `<button class="btn primary lg" data-run>${icon('search')} Tìm video</button>` })}
      ${section('target', 'Phạm vi tìm', fieldRows([
        ['globe', 'Khu vực', `${regionSelect(st.gl, TIKTOK_REGIONS)}<span class="rs-tip" tabindex="0" data-tip="TikTok luôn tìm như người xem ở Việt Nam. Khu vực ở đây là nước mà video phải nói tới: video về thủ tục nước khác bị bỏ." aria-label="Giải thích khu vực">${icon('info')}</span><span class="muted small">Video nói về nước này</span>`],
        ['calendar', 'Đăng trong', chips('maxAgeDays', TIKTOK_AGE_CHIPS, st.maxAgeDays || 0)],
        ['eye', 'View tối thiểu', chips('minPlays', TIKTOK_PLAYS_CHIPS, st.minPlays || 0)],
      ]))}
      ${section('sliders', 'Tiêu chí tìm kiếm', fieldRows([
        ['heart', 'Like tối thiểu', chips('minLikes', [0, 1_000, 10_000, 100_000].map((v) => ({ v, label: v ? `≥ ${fmt(v)}` : 'Không lọc' })), st.minLikes || 0)],
        ['bars', '<span data-tip="(like + comment + share + save) ÷ view">Tương tác ≥</span>', chips('minEngagement', [0, 3, 5, 10].map((v) => ({ v, label: v ? `${v}%` : 'Không lọc' })), st.minEngagement || 0)],
      ]), checkRow('filterOffTopic', 'Lọc video lạc đề', !st.keepOffTopic, OFF_TOPIC_TIP))}
      ${advanced({ summary: 'Video mỗi từ khoá', changed: changedCount(st, FORM, ADVANCED), rows: [['play', 'Video mỗi từ khoá', chips('perKeyword', [30, 60, 120, 200].map((v) => ({ v, label: String(v) })), st.perKeyword)]] })}
      ${estimate('Miễn phí · khoảng 1–2 phút mỗi từ khoá. Từ khoá nên có chữ tiếng Việt và ghi rõ nước (vd "thi quốc tịch mỹ").')}
    </div>
    <div data-out style="margin-top:14px"></div><div class="card" data-history style="margin-top:18px"></div>`;
  const out = root.querySelector('[data-out]');
  const form = root.querySelector('[data-form]');
  const shown = scope();
  shown.add(tiktokLoginNotice(root.querySelector('[data-ttlogin]')));
  const formTips = bindTips(form);
  bindShell(root, { carry: () => ({ q: /** @type {HTMLInputElement} */ (form.querySelector('[data-k="keywords"]')).value.trim(), gl: st.gl }), changed: () => changedCount(st, FORM, ADVANCED) });
  bindChips(form, (n, v) => ((st[n] = Number(v)), persist('tt-search-form', st)));
  // Shown the way round people think of it ("lọc" = drop off-topic videos); stored as before (keepOffTopic).
  form.querySelector('[data-k="filterOffTopic"]').addEventListener('change', (e) => ((st.keepOffTopic = !e.target.checked), persist('tt-search-form', st)));
  form.querySelector('[data-k="gl"]').addEventListener('change', (e) => ((st.gl = e.target.value), persist('tt-search-form', st)));
  form.querySelector('[data-k="keywords"]').addEventListener('keydown', (e) => e.key === 'Enter' && run());
  form.querySelector('[data-run]').addEventListener('click', run);

  async function run() {
    st.keywords = form.querySelector('[data-k="keywords"]').value.trim();
    persist('tt-search-form', st);
    if (!st.keywords) return toast('Nhập từ khoá', 'error');
    const { gl, ...body } = st;
    await start({ ...body, ...(TIKTOK_COUNTRY[gl] ? { country: TIKTOK_COUNTRY[gl] } : {}) });
  }

  /** @param {Record<string, any>} body */
  let running = false; // one search at a time from this screen
  async function start(body) {
    if (running) return toast('Lần tìm trước vẫn đang chạy');
    running = true;
    const btn = /** @type {HTMLButtonElement} */ (form.querySelector('[data-run]'));
    btn.disabled = true;
    out.innerHTML = progressCard(`Đang tìm TikTok: ${body.keywords}`);
    try {
      const res = await runJob('tiktok_search', body, (p) => updateProgress(out, p));
      await show(res.id);
      history();
    } catch (e) {
      out.innerHTML = errorCallout(e);
    } finally {
      running = false;
      btn.disabled = false;
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
        <button type="button" class="btn sm" data-selall>Chọn tất cả</button>
        <button class="btn sm primary" data-cm disabled title="Tích “Chọn” ở góc video trước">${icon('message')} Lấy comment</button>
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
      syncPick();
    });
    out.querySelector('[data-cm]').addEventListener('click', () => window.__go('/tiktok/comments', { videos: d.videos.filter((v) => selected.has(v.id)).map((v) => v.url).join('\n') }));
    // The button says how many videos it will read; "Chọn tất cả" works on the videos passing the filters, and flips to "Bỏ chọn".
    function syncPick() {
      const cm = out.querySelector('[data-cm]');
      cm.disabled = !selected.size;
      cm.innerHTML = `${icon('message')} Lấy comment${selected.size ? ` (${selected.size})` : ''}`;
      const boxes = [...out.querySelectorAll('[data-sel]')];
      out.querySelector('[data-selall]').textContent = boxes.length && boxes.every((b) => b.checked) ? 'Bỏ chọn' : 'Chọn tất cả';
    }
    shown.on(out, 'click', '[data-selall]', () => {
      const boxes = [...out.querySelectorAll('[data-sel]')];
      const on = !(boxes.length && boxes.every((b) => b.checked));
      for (const b of boxes) {
        b.checked = on;
        on ? selected.add(b.dataset.sel) : selected.delete(b.dataset.sel);
      }
      syncPick();
    });
    function render() {
      const key = SORTS[f.sort] || 'hotScore';
      const list = d.videos
        .filter((v) => (!f.age || (v.ageDays != null && v.ageDays <= Number(f.age))) && (!f.minLikes || v.likes >= Number(f.minLikes)) && (!f.minComments || v.comments >= Number(f.minComments)))
        .sort((a, b) => (f.sort === 'new' ? (a.ageDays ?? 1e9) - (b.ageDays ?? 1e9) : (b[key] ?? -1) - (a[key] ?? -1)));
      out.querySelector('[data-count]').textContent = list.length;
      out.querySelector('[data-list]').innerHTML = list.length ? list.map((v) => tiktokVideoCard(v, { selected })).join('') : emptyState('Không có video khớp bộ lọc');
      syncPick();
    }
    render();
  }

  const history = findHistory(root.querySelector('[data-history]'), 'video');
  history();
  const again = await rerunRecord(params, '/tiktok/search');
  if (again) start(again.params);
  else if (params.id) show(params.id);
  else resumeJob('tiktok_search', out, (j) => `Đang tìm TikTok: ${j.title}`, async (res) => (await show(res.id), history()));
  return () => (shown.off(), formTips());
}
