import { esc, icon, chips, bindChips, runJob, progressCard, updateProgress, toast, store, persist, api, fmt, full, ago, emptyState, thumb, ytVideo, ytChannel, isSaved, toggleSave, bindTips, ageText } from '../lib.js';
import { REGIONS } from './videos.js';

const FORM = { keywords: '', source: 'both', perKeyword: 40, gl: '', upload: 'year' };
const FILTER = { subs: '', subsMin: '', subsMax: '', v7: '', v30: '', ratio: '', last: '', country: [], age: '', vcount: '', q: '', sort: 'v30' };

const SUBS = [
  { v: '0-10000', label: '< 10N' },
  { v: '10000-50000', label: '10N–50N' },
  { v: '50000-100000', label: '50N–100N' },
  { v: '100000-200000', label: '100N–200N' },
  { v: '200000-500000', label: '200N–500N' },
  { v: '500000-1000000', label: '500N–1Tr' },
  { v: '1000000-', label: '1Tr+' },
  { v: '2000000-', label: '2Tr+' },
];

function filterChannels(list, f) {
  const [slo, shi] = f.subs ? f.subs.split('-').map((x) => (x ? Number(x) : null)) : [null, null];
  const smin = f.subsMin !== '' ? Number(f.subsMin) * 1000 : null;
  const smax = f.subsMax !== '' ? Number(f.subsMax) * 1000 : null;
  const q = f.q.toLowerCase().trim();
  const out = list.filter((c) => {
    if (slo != null && !(c.subs >= slo)) return false;
    if (shi != null && !(c.subs < shi)) return false;
    if (smin != null && !(c.subs >= smin)) return false;
    if (smax != null && !(c.subs <= smax)) return false;
    if (f.v7 && !(c.views7d >= Number(f.v7))) return false;
    if (f.v30 && !(c.views30d >= Number(f.v30))) return false;
    if (f.ratio && !(c.viewSubRatio >= Number(f.ratio))) return false;
    if (f.last) {
      if (f.last === 'gt30') {
        if (!(c.lastUploadDays > 30)) return false;
      } else if (!(c.lastUploadDays != null && c.lastUploadDays <= Number(f.last))) return false;
    }
    if (f.country.length && !f.country.includes(c.country || '?')) return false;
    if (f.age && !(c.channelAgeDays != null && c.channelAgeDays <= Number(f.age))) return false;
    if (f.vcount) {
      const [a, b] = f.vcount.split('-').map((x) => (x ? Number(x) : null));
      if (a != null && !(c.videoCount >= a)) return false;
      if (b != null && !(c.videoCount <= b)) return false;
    }
    if (q && !`${c.title} ${c.handle} ${c.description}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const key = { v30: 'views30d', v7: 'views7d', subs: 'subs', subsAsc: 'subs', ratio: 'viewSubRatio', median: 'medianViews', newest: 'channelAgeDays', recent: 'lastUploadDays' }[f.sort];
  const asc = ['subsAsc', 'newest', 'recent'].includes(f.sort);
  return out.sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null) return 1;
    if (y == null) return -1;
    return asc ? x - y : y - x;
  });
}

export async function mount(root, params) {
  const st = store('channels-form', FORM);
  const f = store('channels-filter', FILTER);
  if (!Array.isArray(f.country)) f.country = [];
  if (params.q) st.keywords = params.q;
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('users')} Tìm kênh</h1>
      <p>Như Playboard nhưng chạy trên máy: tìm kênh theo từ khoá rồi lọc theo sub, view gần đây, tỉ lệ view/sub ("nhiều view nhưng ít sub"), tuổi kênh, quốc gia, nhịp đăng.</p></div></div>
    <div class="card card-pad">
      <div class="form-grid">
        <div class="field"><label>Từ khoá</label><input class="input" data-k="keywords" placeholder="VD: storytelling, kể chuyện đêm khuya" value="${esc(st.keywords)}"></div>
        <div class="field"><label>Khu vực</label><select class="select input" data-k="gl">${REGIONS.map(([v, l]) => `<option value="${v}" ${st.gl === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="section-label">Lấy kênh từ</div>
      <div class="row">${chips('source', [{ v: 'both', label: 'Cả hai (khuyên dùng)' }, { v: 'channels', label: 'Ô tìm kênh của YouTube' }, { v: 'videos', label: 'Chủ của video hot' }], st.source)}
        <span class="spacer"></span><label class="small muted">Mỗi từ khoá</label>${chips('perKeyword', [{ v: 20, label: '20' }, { v: 40, label: '40' }, { v: 80, label: '80' }], st.perKeyword)}</div>
      <div class="help muted small" style="margin-top:6px">"Chủ của video hot" lấy kênh có video nhiều view trong <b>1 năm</b> gần nhất cho từ khoá: cách nhanh nhất ra kênh nhỏ đang lên.</div>
      <div class="row" style="margin-top:14px"><button class="btn primary lg" data-run>${icon('users')} Tìm kênh</button><span class="muted small">Mỗi kênh cần 3 request (thông tin, About, 30 video mới nhất) · 40 kênh ≈ 30–60 giây</span></div>
    </div>
    <div data-out style="margin-top:14px"></div>
    <div class="card" data-history style="margin-top:14px"></div>`;

  bindChips(root.querySelector('.card'), (name, v) => {
    st[name] = name === 'perKeyword' ? Number(v) : v;
    persist('channels-form', st);
  });
  root.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => ((st[el.dataset.k] = el.value), persist('channels-form', st))));
  root.querySelector('[data-k="keywords"]').addEventListener('keydown', (e) => e.key === 'Enter' && run());
  root.querySelector('[data-run]').addEventListener('click', run);
  const out = root.querySelector('[data-out]');

  async function run() {
    st.keywords = root.querySelector('[data-k="keywords"]').value.trim();
    persist('channels-form', st);
    if (!st.keywords) return toast('Nhập từ khoá', 'error');
    out.innerHTML = progressCard(`Đang tìm kênh: ${st.keywords}`);
    try {
      const res = await runJob('channel_search', st, (p) => updateProgress(out, p));
      await show(res.id);
      history();
    } catch (e) {
      out.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  }

  async function show(id) {
    const rec = await api(`/api/records/${id}`);
    const all = rec.data.channels;
    const countries = [...new Set(all.map((c) => c.country || '?'))].sort((a, b) => all.filter((c) => (c.country || '?') === b).length - all.filter((c) => (c.country || '?') === a).length);
    out.innerHTML = `
      <div class="row" style="margin-bottom:10px"><span class="muted">Khoảng <b style="color:var(--accent)">${all.length}</b> kênh cho <b>"${esc(rec.data.keywords.join(', '))}"</b> · tìm ${ago(rec.created_at)}</span><span class="spacer"></span>
        <a class="btn sm" href="/api/records/${id}/export.csv">${icon('download')} CSV</a></div>
      <div class="filter-table" data-filters>
        <div class="filter-row"><div class="fr-label">Người theo dõi</div>${chips('subs', SUBS, f.subs)}
          <div class="range"><input class="input sm" data-f="subsMin" placeholder="Min (N)" value="${esc(f.subsMin)}"> – <input class="input sm" data-f="subsMax" placeholder="Max (N)" value="${esc(f.subsMax)}"></div></div>
        <div class="filter-row"><div class="fr-label" data-tip="Tổng view của các video kênh đăng trong 7 ngày qua (tính từ 30 video mới nhất).">View video 7 ngày ⓘ</div>${chips('v7', [{ v: 10000, label: '10N+' }, { v: 50000, label: '50N+' }, { v: 100000, label: '100N+' }, { v: 200000, label: '200N+' }, { v: 500000, label: '500N+' }, { v: 1000000, label: '1Tr+' }], f.v7)}<div></div></div>
        <div class="filter-row"><div class="fr-label" data-tip="Tổng view của các video đăng trong 30 ngày qua.">View video 30 ngày ⓘ</div>${chips('v30', [{ v: 50000, label: '50N+' }, { v: 100000, label: '100N+' }, { v: 500000, label: '500N+' }, { v: 1000000, label: '1Tr+' }, { v: 5000000, label: '5Tr+' }], f.v30)}<div></div></div>
        <div class="filter-row"><div class="fr-label" data-tip="View trung vị của 30 video mới nhất ÷ số sub. Cao = nhiều view nhưng ít sub: kênh đang được YouTube đẩy.">Nhiều view, ít sub ⓘ</div>${chips('ratio', [{ v: 0.1, label: 'Trung vị ≥ 10% sub' }, { v: 0.5, label: '≥ 50% sub' }, { v: 1, label: '≥ 100% sub' }, { v: 3, label: '≥ 3× sub' }], f.ratio)}<div></div></div>
        <div class="filter-row"><div class="fr-label">Đăng gần nhất</div>${chips('last', [{ v: 7, label: '7 ngày' }, { v: 15, label: '15 ngày' }, { v: 30, label: '30 ngày' }, { v: 180, label: '180 ngày' }, { v: 'gt30', label: 'Trước 30 ngày' }], f.last)}<div></div></div>
        <div class="filter-row"><div class="fr-label">Tuổi kênh</div>${chips('age', [{ v: 90, label: '≤ 3 tháng' }, { v: 180, label: '≤ 6 tháng' }, { v: 365, label: '≤ 1 năm' }, { v: 730, label: '≤ 2 năm' }], f.age)}<div></div></div>
        <div class="filter-row"><div class="fr-label">Số video</div>${chips('vcount', [{ v: '0-30', label: '≤ 30' }, { v: '0-100', label: '≤ 100' }, { v: '100-500', label: '100–500' }, { v: '500-', label: '500+' }], f.vcount)}<div></div></div>
        <div class="filter-row"><div class="fr-label">Quốc gia</div>${chips('country', countries.map((c) => ({ v: c, label: c === '?' ? 'Không ghi' : c })), f.country, { multi: true })}<div></div></div>
      </div>
      <div class="card" style="margin-top:14px">
        <div class="row" style="padding:12px 18px;border-bottom:1px solid var(--line)"><b data-count></b><span class="muted">kênh</span>
          <input class="input sm" style="max-width:240px" data-f="q" placeholder="Lọc theo tên, mô tả" value="${esc(f.q)}"><span class="spacer"></span>
          <label class="small muted">Xếp theo</label><select class="select input sm" style="width:auto" data-f="sort">
          ${[['v30', 'View 30 ngày'], ['v7', 'View 7 ngày'], ['ratio', 'View/sub cao nhất'], ['median', 'View trung vị'], ['subs', 'Sub nhiều nhất'], ['subsAsc', 'Sub ít nhất'], ['newest', 'Kênh mới nhất'], ['recent', 'Đăng gần nhất']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <button class="btn sm ghost" data-reset>Xoá lọc</button></div>
        <div class="clist" data-list></div>
      </div>`;
    const filters = out.querySelector('[data-filters]');
    filters.querySelectorAll('[data-chips]').forEach((g) => (g.dataset.allowOff = ''));
    bindChips(filters, (name, v) => {
      f[name] = v;
      if (name === 'subs') (f.subsMin = ''), (f.subsMax = ''), filters.querySelectorAll('[data-f^="subsM"]').forEach((i) => (i.value = ''));
      persist('channels-filter', f);
      render();
    });
    out.querySelectorAll('[data-f]').forEach((el) =>
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        f[el.dataset.f] = el.value;
        if (el.dataset.f.startsWith('subsM')) (f.subs = ''), filters.querySelectorAll('[data-chips="subs"] .chip').forEach((c) => c.classList.remove('on'));
        persist('channels-filter', f);
        render();
      }),
    );
    out.querySelector('[data-reset]').addEventListener('click', () => {
      Object.assign(f, { ...FILTER, country: [] });
      persist('channels-filter', f);
      show(id);
    });
    bindTips(out);
    out.querySelector('[data-list]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-save]');
      if (b) {
        const c = all.find((x) => x.id === b.dataset.save);
        toggleSave('channel', c.id, c.title, { id: c.id, title: c.title, handle: c.handle, avatar: c.avatar, subs: c.subs, medianViews: c.medianViews, viewSubRatio: c.viewSubRatio, country: c.country }, b);
      }
    });
    function render() {
      const list = filterChannels(all, f);
      out.querySelector('[data-count]').textContent = list.length;
      out.querySelector('[data-list]').innerHTML = list.length ? list.slice(0, 300).map(card).join('') : emptyState('Không có kênh nào khớp bộ lọc', 'Bỏ bớt bộ lọc ở trên.');
    }
    render();
  }

  function card(c) {
    const v = c.topVideo;
    return `<div class="ccard">
      ${c.avatar ? `<img class="avatar" loading="lazy" src="${esc(c.avatar)}" referrerpolicy="no-referrer" alt="">` : '<div class="avatar"></div>'}
      <div><h3><a href="${ytChannel(c)}" target="_blank" rel="noopener">${esc(c.title)}</a>
          ${c.channelAgeDays != null && c.channelAgeDays <= 365 ? `<span class="badge blue">Kênh mới · ${ageText(c.channelAgeDays)}</span>` : ''}
          ${c.viewSubRatio >= 1 ? `<span class="badge good">View &gt; sub</span>` : ''}</h3>
        <div class="desc">${esc(c.description || '')}</div>
        <div>${(c.queries || []).map((q) => `<span class="tag">${esc(q)}</span>`).join('')}${c.country ? `<span class="tag">${esc(c.country)}</span>` : ''}</div>
        <div class="meta" style="margin-top:4px">${fmt(c.subs)} sub · ${c.videoCount ?? '–'} video · ${fmt(c.totalViews)} tổng view${c.joined ? ` · tạo ${new Date(c.joined).toLocaleDateString('vi-VN')}` : ''}</div>
        <div class="row" style="margin-top:8px"><a class="btn sm" href="#/channel?input=${encodeURIComponent(c.id)}">${icon('bars')} Phân tích</a>
          <button class="icon-btn ${isSaved('channel', c.id) ? 'on' : ''}" data-save="${c.id}" title="Lưu kênh">${icon('bookmark')}</button></div></div>
      <div class="cstats">
        <span>View video 7 ngày</span><b>${full(c.views7d)}</b>
        <span>View video 30 ngày</span><b>${full(c.views30d)}</b>
        <span>View trung vị</span><b>${fmt(c.medianViews)}</b>
        <span data-tip="View trung vị ÷ sub">Trung vị / sub</span><b style="color:${c.viewSubRatio >= 1 ? 'var(--good)' : 'inherit'}">${c.viewSubRatio == null ? '–' : Math.round(c.viewSubRatio * 100) + '%'}</b>
        <span>Video/tuần</span><b>${c.uploadsPerWeek ?? '–'}</b>
        <span>Đăng gần nhất</span><b>${c.lastUploadDays == null ? '–' : ageText(c.lastUploadDays, false) + ' trước'}</b>
      </div>
      ${v ? `<a class="cthumb" href="${ytVideo(v.id)}" target="_blank" rel="noopener" data-tip="${esc(v.title)}"><img loading="lazy" src="${thumb(v.id)}" alt=""><span class="ov">▶ ${fmt(v.views)}</span></a>` : '<div></div>'}
    </div>`;
  }

  async function history() {
    const list = await api('/api/records?kind=channel_search&limit=15');
    root.querySelector('[data-history]').innerHTML = `<div class="card-head"><h3>Lần tìm trước</h3></div>${
      list.length ? list.map((r) => `<div class="list-row"><a class="name" href="#/channels?id=${r.id}">${esc(r.title)}</a><span class="when">${ago(r.created_at)}</span><button class="icon-btn" data-del="${r.id}">${icon('trash')}</button></div>`).join('') : emptyState('Chưa tìm lần nào')
    }`;
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => (await api(`/api/records/${b.dataset.del}`, { method: 'DELETE' }), history())));
  }
  history();
  if (params.id) show(params.id);
}
