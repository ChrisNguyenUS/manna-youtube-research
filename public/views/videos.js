import { esc, icon, chips, bindChips, runJob, progressCard, updateProgress, toast, store, persist, api, fmt, ago, emptyState } from '../lib.js';
import { mountVideoResults } from '../components.js';

const DEFAULT = { keywords: '', upload: 'year', sort: 'popularity', dur: '', minDur: '', maxDur: '', perKeyword: 60, gl: '', exactTop: 30, cc: false };
export const DUR_CHIPS = [
  { v: '', label: 'Tất cả' },
  { v: '0-4', label: 'Ngắn < 4 phút' },
  { v: '4-20', label: '4–20 phút' },
  { v: '20-', label: 'Dài > 20 phút' },
  { v: '60-', label: '> 1 giờ' },
];
export const UPLOAD_CHIPS = [
  { v: 'today', label: 'Hôm nay' },
  { v: 'week', label: '7 ngày' },
  { v: 'month', label: '30 ngày' },
  { v: 'year', label: '1 năm' },
  { v: 'any', label: 'Mọi lúc' },
];
export const REGIONS = [
  ['', 'Theo Cài đặt'], ['GLOBAL', '🌐 Toàn cầu (nhiều nước)'], ['VN', 'Việt Nam'], ['US', 'Mỹ'], ['GB', 'Anh'], ['CA', 'Canada'], ['AU', 'Úc'], ['IN', 'Ấn Độ'], ['PH', 'Philippines'], ['ID', 'Indonesia'], ['JP', 'Nhật'], ['KR', 'Hàn'], ['DE', 'Đức'], ['FR', 'Pháp'], ['BR', 'Brazil'],
];
export function durToSeconds(st) {
  let min = st.minDur !== '' && st.minDur != null ? Number(st.minDur) : null;
  let max = st.maxDur !== '' && st.maxDur != null ? Number(st.maxDur) : null;
  if (st.dur) {
    const [a, b] = st.dur.split('-');
    min = a ? Number(a) : null;
    max = b ? Number(b) : null;
  }
  return { minDur: min != null ? min * 60 : undefined, maxDur: max != null ? max * 60 : undefined };
}

export async function mount(root, params) {
  const st = store('videos-form', DEFAULT);
  if (params.q) st.keywords = params.q;
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('search')} Tìm video</h1>
      <p>Tìm video theo từ khoá, lọc theo thời gian đăng, độ dài, số sub của kênh. Cột <b>Vượt kênh</b> = view ÷ sub: video thắng nhờ nội dung, không nhờ kênh to.</p></div></div>
    <div class="card card-pad">
      <div class="form-grid">
        <div class="field"><label>Từ khoá (cách nhau bằng dấu phẩy)</label><input class="input" data-k="keywords" placeholder="VD: kể chuyện lịch sử, chuyện đêm khuya" value="${esc(st.keywords)}"></div>
        <div class="field"><label>Khu vực tìm</label><select class="select input" data-k="gl">${REGIONS.map(([v, l]) => `<option value="${v}" ${st.gl === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="section-label">Đăng trong</div>${chips('upload', UPLOAD_CHIPS, st.upload)}
      <div class="section-label">Độ dài</div>
      <div class="row">${chips('dur', DUR_CHIPS, st.dur)}<span class="muted small">hoặc</span>
        <input class="input sm" style="width:80px" data-k="minDur" placeholder="Từ (phút)" value="${esc(st.minDur)}"> – <input class="input sm" style="width:80px" data-k="maxDur" placeholder="Đến" value="${esc(st.maxDur)}"></div>
      <div class="section-label">YouTube xếp theo</div>
      <div class="row">${chips('sort', [{ v: 'popularity', label: 'Phổ biến (nhiều view)' }, { v: 'relevance', label: 'Liên quan' }, { v: 'date', label: 'Mới đăng' }], st.sort)}
        <span class="spacer"></span><label class="small muted">Số video mỗi từ khoá</label>${chips('perKeyword', [{ v: 40, label: '40' }, { v: 60, label: '60' }, { v: 120, label: '120' }, { v: 200, label: '200' }], st.perKeyword)}</div>
      <div class="row" style="margin-top:14px">
        <button class="btn primary lg" data-run>${icon('search')} Tìm video</button>
        <label class="check"><input type="checkbox" data-k="exactTop" ${st.exactTop ? 'checked' : ''}> Lấy ngày đăng chính xác + like cho 30 video nhiều view nhất <span class="muted">(chậm hơn ~10 giây)</span></label>
        <label class="check"><input type="checkbox" data-k="cc" ${st.cc ? 'checked' : ''}> Chỉ Creative Commons</label>
      </div>
    </div>
    <div data-out style="margin-top:14px"></div>
    <div class="card" data-history style="margin-top:14px"></div>`;

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
    out.innerHTML = progressCard(`Đang tìm: ${st.keywords}`);
    try {
      const res = await runJob('video_search', { keywords: st.keywords, upload: st.upload, sort: st.sort, perKeyword: st.perKeyword, gl: st.gl, exactTop: st.exactTop, likes: !!st.exactTop, cc: st.cc, ...durToSeconds(st) }, (p) => updateProgress(out, p));
      await show(res.id);
      history();
    } catch (e) {
      out.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  }

  async function show(id) {
    const rec = await api(`/api/records/${id}`);
    const d = rec.data;
    const s = d.summary;
    out.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="label">Video</div><div class="value">${s.count}</div><div class="hint">${d.keywords.length} từ khoá · ${s.channels} kênh</div></div>
        <div class="kpi"><div class="label">View trung vị</div><div class="value">${fmt(s.medianViews)}</div><div class="hint">của các video tìm được</div></div>
        <div class="kpi"><div class="label">Trên 1 triệu view</div><div class="value">${s.over1m}</div><div class="hint">${s.over100k} video trên 100 N</div></div>
        <div class="kpi"><div class="label">Vượt kênh (view ≥ sub)</div><div class="value">${s.outliers}</div><div class="hint accent">nội dung thắng, không nhờ kênh</div></div>
      </div>
      <div class="row" style="margin:14px 0 0"><span class="muted small">Tìm ${ago(rec.created_at)} · "${esc(d.keywords.join(', '))}"${d.regions?.length > 1 ? ` · 🌐 ${d.regions.length} nước: ${esc(d.regions.join(', '))}` : ''}</span><span class="spacer"></span>
        <a class="btn sm" href="/api/records/${id}/export.csv">${icon('download')} CSV</a></div>
      <div data-results style="margin-top:14px"></div>`;
    mountVideoResults(out.querySelector('[data-results]'), d.videos, {
      key: 'vf-videos',
      regions: d.regions || [],
      onComments: (ids) => window.__go('/comments', { videos: ids.join(',') }),
    });
  }

  async function history() {
    const list = await api('/api/records?kind=video_search&limit=15');
    root.querySelector('[data-history]').innerHTML = `<div class="card-head"><h3>Lần tìm trước</h3></div>${
      list.length
        ? list.map((r) => `<div class="list-row"><a class="name" href="#/videos?id=${r.id}">${esc(r.title)}</a><span class="muted small">${esc(r.params?.upload || '')}</span><span class="when">${ago(r.created_at)}</span><button class="icon-btn" data-del="${r.id}" title="Xoá">${icon('trash')}</button></div>`).join('')
        : emptyState('Chưa tìm lần nào')
    }`;
    root.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        await api(`/api/records/${b.dataset.del}`, { method: 'DELETE' });
        history();
      }),
    );
  }
  history();
  if (params.id) show(params.id);
  else if (params.q && params.run) run();
}
