import { records } from '../http/client.js';
import { findHead, findBar, findRows, findAdvanced, regionSelect, bindPlatformSwitch } from '../components/find-shell.js';
import { findHistory, rerunRecord } from '../components/find-history.js';
import { DUR_CHIPS, UPLOAD_CHIPS, REGIONS, durToSeconds, knownRegion } from '../search-options.js';
import { esc, icon, chips, bindChips, runJob, progressCard, updateProgress, toast, store, persist, fmt, ago, emptyState, setUrl, resumeJob, errorCallout } from '../lib.js';
import { mountVideoResults } from '../components/index.js';

const DEFAULT = { keywords: '', upload: 'year', sort: 'popularity', dur: '', minDur: '', maxDur: '', perKeyword: 60, gl: '', exactTop: 30, cc: false };
// Kept here too: older screens import them from this file.
export { DUR_CHIPS, UPLOAD_CHIPS, REGIONS, durToSeconds };

export async function mount(root, params) {
  const st = store('videos-form', DEFAULT);
  if (params.q) st.keywords = params.q;
  if (knownRegion(params.gl, REGIONS)) st.gl = params.gl; // carried over from the TikTok side
  root.innerHTML = `
    ${findHead('search', 'Tìm video', 'Video theo từ khoá, lọc theo thời gian đăng, độ dài, khu vực. Cột <b>Vượt kênh</b> = view ÷ sub: video thắng nhờ nội dung, không nhờ kênh to.')}
    <div class="card card-pad" data-form>
      ${findBar({ path: '/videos', input: `<input class="input" data-k="keywords" placeholder="Từ khoá, cách nhau bằng dấu phẩy. VD: kể chuyện lịch sử, chuyện đêm khuya" value="${esc(st.keywords)}">`, button: `<button class="btn primary lg" data-run>${icon('search')} Tìm video</button>` })}
      ${findRows([
        ['Khu vực', regionSelect(st.gl, REGIONS)],
        ['Đăng trong', chips('upload', UPLOAD_CHIPS, st.upload)],
        ['Độ dài', `${chips('dur', DUR_CHIPS, st.dur)}<span class="muted small">hoặc</span>
          <input class="input sm" style="width:80px" data-k="minDur" placeholder="Từ (phút)" value="${esc(st.minDur)}"> – <input class="input sm" style="width:80px" data-k="maxDur" placeholder="Đến" value="${esc(st.maxDur)}">`],
      ])}
      ${findAdvanced([
        ['YouTube xếp theo', chips('sort', [{ v: 'popularity', label: 'Phổ biến (nhiều view)' }, { v: 'relevance', label: 'Liên quan' }, { v: 'date', label: 'Mới đăng' }], st.sort)],
        ['Video mỗi từ khoá', chips('perKeyword', [{ v: 40, label: '40' }, { v: 60, label: '60' }, { v: 120, label: '120' }, { v: 200, label: '200' }], st.perKeyword)],
        ['Thêm', `<label class="check"><input type="checkbox" data-k="exactTop" ${st.exactTop ? 'checked' : ''}> Lấy ngày đăng chính xác + like cho 30 video nhiều view nhất <span class="muted">(chậm hơn ~10 giây)</span></label>
          <label class="check"><input type="checkbox" data-k="cc" ${st.cc ? 'checked' : ''}> Chỉ Creative Commons</label>`],
      ])}
      <div class="find-note muted small">Miễn phí · dữ liệu công khai của YouTube</div>
    </div>
    <div data-out style="margin-top:14px"></div>
    <div class="card" data-history style="margin-top:14px"></div>`;
  bindPlatformSwitch(root, () => ({ q: /** @type {HTMLInputElement} */ (root.querySelector('[data-k="keywords"]')).value.trim(), gl: st.gl }));

  bindChips(root, (name, v) => {
    st[name] = name === 'perKeyword' ? Number(v) : v;
    if (name === 'dur') (st.minDur = ''), (st.maxDur = ''), root.querySelectorAll('[data-k="minDur"],[data-k="maxDur"]').forEach((i) => (i.value = ''));
    persist('videos-form', st);
  });
  root.querySelectorAll('[data-k]').forEach((el) =>
    el.addEventListener('change', () => {
      st[el.dataset.k] = el.type === 'checkbox' ? (el.dataset.k === 'exactTop' ? (el.checked ? 30 : 0) : el.checked) : el.value;
      if (el.dataset.k === 'minDur' || el.dataset.k === 'maxDur') {
        st.dur = '';
        root.querySelectorAll('[data-chips="dur"] .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === ''));
      }
      persist('videos-form', st);
    }),
  );
  root.querySelector('[data-k="keywords"]').addEventListener('keydown', (e) => e.key === 'Enter' && run());
  root.querySelector('[data-run]').addEventListener('click', run);

  const out = root.querySelector('[data-out]');
  async function run() {
    st.keywords = root.querySelector('[data-k="keywords"]').value.trim();
    persist('videos-form', st);
    if (!st.keywords) return toast('Nhập từ khoá', 'error');
    await start({ keywords: st.keywords, upload: st.upload, sort: st.sort, perKeyword: st.perKeyword, gl: st.gl, exactTop: st.exactTop, likes: !!st.exactTop, cc: st.cc, ...durToSeconds(st) });
  }

  /** @param {Record<string, any>} body */
  async function start(body) {
    out.innerHTML = progressCard(`Đang tìm: ${body.keywords}`);
    try {
      const res = await runJob('video_search', body, (p) => updateProgress(out, p));
      await show(res.id);
      history();
    } catch (e) {
      out.innerHTML = errorCallout(e);
    }
  }

  async function show(id) {
    const rec = await records.get(id);
    setUrl('/videos', { id: rec.id }); // a reload or a copied link opens this result again
    const d = rec.data;
    const s = d.summary;
    out.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="label">Video</div><div class="value">${s.count}</div><div class="hint">${d.keywords.length} từ khoá · ${s.channels} kênh</div></div>
        <div class="kpi"><div class="label">View trung vị</div><div class="value">${fmt(s.medianViews)}</div><div class="hint">của các video tìm được</div></div>
        <div class="kpi"><div class="label">Trên 1 triệu view</div><div class="value">${s.over1m}</div><div class="hint">${s.over100k} video trên 100 N</div></div>
        <div class="kpi"><div class="label">Outlier ≥ 5× kênh</div><div class="value">${s.outlierScore5 ?? '–'}</div><div class="hint accent">gấp 5 lần video thường của kênh</div></div>
        <div class="kpi"><div class="label">Vượt tệp sub</div><div class="value">${s.viewSubOver1}</div><div class="hint">view ≥ số sub kênh</div></div>
      </div>
      <div class="row" style="margin:14px 0 0"><span class="muted small">Tìm ${ago(rec.created_at)} · "${esc(d.keywords.join(', '))}"${d.regions?.length > 1 ? ` · 🌐 ${d.regions.length} nước: ${esc(d.regions.join(', '))}` : ''}</span><span class="spacer"></span>
        <a class="btn sm" href="#/ideas?ideas=${encodeURIComponent(d.keywords.join('\n'))}&run=1" data-tip="Điểm Volume / Competition kiểu vidIQ cho từ khoá này">${icon('bulb')} Chấm điểm từ khoá</a>
        <a class="btn sm" href="${records.exportUrl(id, 'csv')}">${icon('download')} CSV</a></div>
      <div data-results style="margin-top:14px"></div>`;
    mountVideoResults(out.querySelector('[data-results]'), d.videos, {
      key: 'vf-videos',
      regions: d.regions || [],
      onComments: (ids) => window.__go('/comments', { videos: ids.join(',') }),
    });
  }

  const history = findHistory(root.querySelector('[data-history]'), 'video');
  history();
  const again = await rerunRecord(params, '/videos');
  if (again) start(again.params);
  else if (params.id) show(params.id);
  else if (params.q && params.run) run();
  else resumeJob('video_search', out, (j) => `Đang tìm: ${j.title}`, async (res) => (await show(res.id), history()));
}
