import { esc, fmt, full, mult, dur, ageText, thumb, ytVideo, icon, chips, bindChips, isSaved, toggleSave, store, persist, median, emptyState, bindTips } from './lib.js';

// ---------- video filters (client side, instant) ----------
export const SUB_RANGES = [
  { v: '0-1000', label: '< 1N' },
  { v: '1000-10000', label: '1N–10N' },
  { v: '10000-50000', label: '10N–50N' },
  { v: '50000-100000', label: '50N–100N' },
  { v: '100000-500000', label: '100N–500N' },
  { v: '500000-1000000', label: '500N–1Tr' },
  { v: '1000000-', label: '1Tr+' },
];
const range = (s) => {
  const [a, b] = String(s || '').split('-');
  return [a ? Number(a) : null, b ? Number(b) : null];
};
const inRange = (x, lo, hi) => x != null && (lo == null || x >= lo) && (hi == null || x < hi);

export const VIDEO_FILTER_DEFAULT = { subs: '', subsMin: '', subsMax: '', views: '', outlier: '', age: '', noShorts: true, q: '', sort: 'views', view: 'table' };

export function filterVideos(videos, f) {
  const [slo, shi] = range(f.subs);
  const smin = f.subsMin !== '' ? Number(f.subsMin) * 1000 : null;
  const smax = f.subsMax !== '' ? Number(f.subsMax) * 1000 : null;
  const q = (f.q || '').toLowerCase().trim();
  let list = videos.filter((v) => {
    if (f.subs && !inRange(v.channelSubs, slo, shi)) return false;
    if (smin != null && !(v.channelSubs >= smin)) return false;
    if (smax != null && !(v.channelSubs <= smax)) return false;
    if (f.views && !(v.views >= Number(f.views))) return false;
    if (f.outlier && !(v.outlier >= Number(f.outlier))) return false;
    if (f.age && !(v.age != null && v.age <= Number(f.age))) return false;
    if (f.noShorts && v.durationSec != null && v.durationSec <= 60) return false;
    if (q && !`${v.title} ${v.channelTitle}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const key = { views: 'views', outlier: 'outlier', vpd: 'viewsPerDay', new: 'age', subsAsc: 'channelSubs', likes: 'likes', dur: 'durationSec' }[f.sort] || 'views';
  const asc = f.sort === 'new' || f.sort === 'subsAsc';
  list.sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return asc ? x - y : y - x;
  });
  return list;
}

export function videoFilterPanel(f) {
  return `<div class="filter-table">
    <div class="filter-row"><div class="fr-label">Sub của kênh</div>${chips('subs', SUB_RANGES, f.subs)}
      <div class="range"><input class="input sm" data-f="subsMin" placeholder="Min (N)" value="${esc(f.subsMin)}"> – <input class="input sm" data-f="subsMax" placeholder="Max (N)" value="${esc(f.subsMax)}"></div></div>
    <div class="filter-row"><div class="fr-label">Lượt xem</div>${chips('views', [{ v: 10000, label: '10N+' }, { v: 50000, label: '50N+' }, { v: 100000, label: '100N+' }, { v: 500000, label: '500N+' }, { v: 1000000, label: '1Tr+' }], f.views)}<div></div></div>
    <div class="filter-row"><div class="fr-label" data-tip="Lượt xem chia số sub của kênh. Lớn hơn 1 = video kéo được người ngoài tệp sub: chủ đề/tiêu đề đang thắng, không phải nhờ kênh to.">Vượt kênh (view/sub) ⓘ</div>${chips('outlier', [{ v: 0.5, label: '×0,5+' }, { v: 1, label: '×1+' }, { v: 3, label: '×3+' }, { v: 10, label: '×10+' }], f.outlier)}<div></div></div>
    <div class="filter-row"><div class="fr-label">Đăng trong</div>${chips('age', [{ v: 7, label: '7 ngày' }, { v: 30, label: '30 ngày' }, { v: 90, label: '90 ngày' }, { v: 180, label: '6 tháng' }, { v: 365, label: '1 năm' }], f.age)}
      <div class="range"><label class="check small"><input type="checkbox" data-f="noShorts" ${f.noShorts ? 'checked' : ''}> Bỏ video ≤ 60 giây</label></div></div>
  </div>`;
}

/** Bind filter panel + toolbar; calls rerender() after each change. */
export function bindVideoFilters(root, f, key, rerender) {
  root.querySelectorAll('[data-chips]').forEach((g) => (g.dataset.allowOff = ''));
  bindChips(root, (name, v) => {
    if (name in f) {
      f[name] = v;
      if (name === 'subs') (f.subsMin = ''), (f.subsMax = '');
      persist(key, f);
      rerender();
    }
  });
  root.querySelectorAll('[data-f]').forEach((el) => {
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      f[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.f.startsWith('subsM')) {
        f.subs = '';
        root.querySelectorAll('[data-chips="subs"] .chip').forEach((c) => c.classList.remove('on'));
      }
      persist(key, f);
      rerender();
    });
  });
}

export function videoToolbar(f, count, total) {
  return `<div class="row" style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <b>${count}</b><span class="muted">/ ${total} video</span>
    <input class="input sm" style="max-width:240px" data-f="q" placeholder="Lọc theo chữ trong tiêu đề, kênh" value="${esc(f.q)}">
    <span class="spacer"></span>
    <label class="small muted">Xếp theo</label>
    <select class="select input sm" style="width:auto" data-f="sort">
      ${[['views', 'Lượt xem'], ['outlier', 'Vượt kênh'], ['vpd', 'View/ngày'], ['new', 'Mới nhất'], ['subsAsc', 'Kênh ít sub nhất'], ['likes', 'Like'], ['dur', 'Dài nhất']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <button class="icon-btn ${f.view === 'grid' ? 'on' : ''}" data-viewmode="grid" title="Dạng lưới">${icon('grid')}</button>
    <button class="icon-btn ${f.view === 'table' ? 'on' : ''}" data-viewmode="table" title="Dạng bảng">${icon('list')}</button>
  </div>`;
}

const outlierBadge = (o) => (o == null ? '<span class="muted">–</span>' : `<span class="badge ${o >= 10 ? 'accent' : o >= 1 ? 'good' : 'plain'}">${mult(o)}</span>`);

export function videoTable(list, { selected = new Set(), rankOffset = 0 } = {}) {
  if (!list.length) return emptyState('Không có video nào khớp bộ lọc', 'Bỏ bớt bộ lọc ở trên.');
  return `<div class="table-wrap"><table class="t"><thead><tr>
    <th style="width:28px"><input type="checkbox" data-selall></th><th>#</th><th class="thumb"></th><th>Video</th>
    <th class="r">View</th><th class="r" data-tip="View / sub của kênh">Vượt kênh</th><th class="r">View/ngày</th><th class="r">Sub kênh</th><th class="r">Dài</th><th class="r">Đăng</th><th></th></tr></thead><tbody>
    ${list
      .map(
        (v, i) => `<tr data-id="${v.id}">
      <td><input type="checkbox" data-sel="${v.id}" ${selected.has(v.id) ? 'checked' : ''}></td>
      <td class="muted num">${i + 1 + rankOffset}</td>
      <td class="thumb"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(v.id)}" alt=""></a></td>
      <td class="title-cell"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        <div class="meta"><a href="#/channel?input=${encodeURIComponent(v.channelId || '')}" style="display:inline" data-tip="Phân tích kênh này">${esc(v.channelTitle)}</a>${v.likes != null ? ` · ${fmt(v.likes)} like` : ''}${v.queries?.length ? ` · <span class="tag">${esc(v.queries[0])}</span>` : ''}</div></td>
      <td class="r num"><b>${fmt(v.views)}</b></td>
      <td class="r">${outlierBadge(v.outlier)}</td>
      <td class="r num">${fmt(v.viewsPerDay)}</td>
      <td class="r num">${fmt(v.channelSubs)}</td>
      <td class="r num">${dur(v.durationSec)}</td>
      <td class="r num" ${v.publishedAt ? `data-tip="${esc(new Date(v.publishedAt).toLocaleDateString('vi-VN'))}"` : 'data-tip="Ước tính từ YouTube (vd: 3 tháng trước)"'}>${ageText(v.age, v.ageExact)}</td>
      <td class="actions"><button class="icon-btn ${isSaved('video', v.id) ? 'on' : ''}" data-save="${v.id}" title="Lưu">${icon('bookmark')}</button></td>
    </tr>`,
      )
      .join('')}</tbody></table></div>`;
}

export function videoGrid(list, { selected = new Set() } = {}) {
  if (!list.length) return emptyState('Không có video nào khớp bộ lọc');
  return `<div class="vgrid">${list
    .map(
      (v, i) => `<div class="vcard" data-id="${v.id}">
      <div class="img"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(v.id)}" alt=""></a>
        ${v.outlier != null ? `<span class="ov mult">${mult(v.outlier)} sub</span>` : ''}<span class="ov rank">#${i + 1}</span><span class="ov dur">${dur(v.durationSec)}</span>
        <label class="ov sel"><input type="checkbox" data-sel="${v.id}" ${selected.has(v.id) ? 'checked' : ''}></label></div>
      <div class="body"><a class="t1" href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        <div class="stats"><b>${fmt(v.views)}</b> lượt xem · ${fmt(v.viewsPerDay)}/ngày · ${ageText(v.age, v.ageExact)}</div>
        <div class="stats">${esc(v.channelTitle)} · ${fmt(v.channelSubs)} sub</div>
        <div class="foot"><a class="btn sm" href="#/channel?input=${encodeURIComponent(v.channelId || '')}">${icon('bars')} Kênh</a>
          <button class="btn sm" data-comment="${v.id}">${icon('message')} Comment</button>
          <button class="icon-btn ${isSaved('video', v.id) ? 'on' : ''}" data-save="${v.id}" title="Lưu">${icon('bookmark')}</button></div></div>
    </div>`,
    )
    .join('')}</div>`;
}

/**
 * Full interactive video results block. Returns { el, getSelected }.
 * opts: { key (filter storage key), extraActions(html) }
 */
export function mountVideoResults(container, videos, { key = 'vf', onComments } = {}) {
  const f = store(key, VIDEO_FILTER_DEFAULT);
  const selected = new Set();
  container.innerHTML = `<div data-filters></div><div class="card" style="margin-top:14px"><div data-toolbar></div><div data-sel-bar></div><div data-list></div></div>`;
  container.querySelector('[data-filters]').innerHTML = videoFilterPanel(f);
  bindVideoFilters(container.querySelector('[data-filters]'), f, key, render);
  bindTips(container);

  function render() {
    const list = filterVideos(videos, f);
    const tb = container.querySelector('[data-toolbar]');
    tb.innerHTML = videoToolbar(f, list.length, videos.length);
    tb.querySelectorAll('[data-f]').forEach((el) =>
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        f[el.dataset.f] = el.value;
        persist(key, f);
        if (el.tagName === 'SELECT') render();
        else renderList(filterVideos(videos, f));
      }),
    );
    tb.querySelectorAll('[data-viewmode]').forEach((b) =>
      b.addEventListener('click', () => {
        f.view = b.dataset.viewmode;
        persist(key, f);
        render();
      }),
    );
    renderList(list);
  }
  function renderList(list) {
    const shown = list.slice(0, 500);
    container.querySelector('[data-list]').innerHTML = f.view === 'grid' ? videoGrid(shown, { selected }) : videoTable(shown, { selected });
    const n = tbCount();
    if (n) n.textContent = list.length;
    selBar();
  }
  const tbCount = () => container.querySelector('[data-toolbar] b');
  function selBar() {
    const bar = container.querySelector('[data-sel-bar]');
    bar.innerHTML = selected.size
      ? `<div class="row" style="padding:10px 16px;background:var(--accent-soft);border-bottom:1px solid var(--accent-line)"><b>Đã chọn ${selected.size} video</b>
        <button class="btn sm primary" data-bulk-comments>${icon('message')} Lấy comment</button>
        <button class="btn sm" data-bulk-clear>Bỏ chọn</button></div>`
      : '';
    bar.querySelector('[data-bulk-comments]')?.addEventListener('click', () => onComments?.([...selected]));
    bar.querySelector('[data-bulk-clear]')?.addEventListener('click', () => {
      selected.clear();
      render();
    });
  }
  container.addEventListener('change', (e) => {
    const s = e.target.closest('[data-sel]');
    if (s) {
      s.checked ? selected.add(s.dataset.sel) : selected.delete(s.dataset.sel);
      selBar();
    }
    if (e.target.matches('[data-selall]')) {
      const ids = filterVideos(videos, f).slice(0, 500).map((v) => v.id);
      ids.forEach((id) => (e.target.checked ? selected.add(id) : selected.delete(id)));
      renderList(filterVideos(videos, f));
    }
  });
  container.addEventListener('click', (e) => {
    const sv = e.target.closest('[data-save]');
    if (sv) {
      const v = videos.find((x) => x.id === sv.dataset.save);
      toggleSave('video', v.id, v.title, { id: v.id, title: v.title, channelTitle: v.channelTitle, channelId: v.channelId, views: v.views, channelSubs: v.channelSubs, outlier: v.outlier, durationSec: v.durationSec }, sv);
    }
    const cm = e.target.closest('[data-comment]');
    if (cm) onComments?.([cm.dataset.comment]);
  });
  render();
  return { selected };
}

// ---------- charts ----------
/** Log-scale bar chart of views (oldest → newest), standouts in accent. */
export function viewsChart(videos, medianValue) {
  const list = [...videos].reverse();
  if (!list.length) return '';
  const W = 1000, H = 260, padL = 46, padB = 22, padT = 10;
  const max = Math.max(...list.map((v) => v.views || 1));
  const top = Math.pow(10, Math.ceil(Math.log10(Math.max(max, 10))));
  const y = (val) => padT + (H - padT - padB) * (1 - Math.log10(Math.max(val, 1)) / Math.log10(top));
  const bw = (W - padL) / list.length;
  const ticks = [];
  for (let t = 1; t <= top; t *= 10) ticks.push(t);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lượt xem từng video">
    ${ticks.map((t) => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="#eeecea"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}
    ${list
      .map((v, i) => {
        const h = H - padB - y(v.views || 1);
        return `<rect x="${padL + i * bw + bw * 0.15}" y="${y(v.views || 1)}" width="${Math.max(bw * 0.7, 1)}" height="${Math.max(h, 0)}" rx="1.5" fill="${v.standout ? 'var(--accent)' : '#93b4f0'}" data-tip="${esc(v.title)} — ${full(v.views)} view · ${ageText(v.age, v.ageExact)}"/>`;
      })
      .join('')}
    ${medianValue ? `<line x1="${padL}" x2="${W}" y1="${y(medianValue)}" y2="${y(medianValue)}" stroke="var(--text-2)" stroke-dasharray="4 4"/><text x="${W - 4}" y="${y(medianValue) - 5}" text-anchor="end" style="fill:var(--text-2)">Trung vị ${fmt(medianValue)}</text>` : ''}
    <text x="${padL}" y="${H - 5}">Cũ hơn</text><text x="${W}" y="${H - 5}" text-anchor="end">Mới nhất</text>
  </svg>`;
}

export function hbars(rows, { value = 'medianViews', label = 'label', note = (r) => `${r.count} video`, format = fmt } = {}) {
  const max = Math.max(...rows.map((r) => r[value] || 0), 1);
  return `<div class="hbars">${rows
    .map((r) => `<div class="hbar"><span>${esc(r[label])}</span><span class="track"><i style="width:${((r[value] || 0) / max) * 100}%"></i></span><span class="val"><b>${format(r[value])}</b> <span class="muted small">· ${esc(note(r))}</span></span></div>`)
    .join('')}</div>`;
}

export function patternList(patterns, { valueLabel = 'vượt kênh' } = {}) {
  if (!patterns?.length) return emptyState('Chưa đủ dữ liệu');
  return `<table class="t"><thead><tr><th>Mẫu</th><th class="r">Số video</th><th class="r" data-tip="Trung vị ${valueLabel} của nhóm chia trung vị chung. >1 = mẫu này đang ăn hơn mức trung bình.">Hiệu quả</th><th>Ví dụ tốt nhất</th></tr></thead><tbody>
    ${patterns
      .map(
        (p) => `<tr><td><b>${esc(p.label)}</b><div class="muted small">${esc(p.hint)}</div></td><td class="r num">${p.count} <span class="muted small">(${Math.round(p.share * 100)}%)</span></td>
      <td class="r"><span class="badge ${p.lift >= 1.2 ? 'good' : p.lift < 0.8 ? 'bad' : 'plain'}">${mult(p.lift)}</span></td>
      <td>${p.example ? `<a href="${ytVideo(p.example.id)}" target="_blank" rel="noopener">${esc(p.example.title)}</a> <span class="muted small">${mult(p.example.value)} · ${fmt(p.example.views)} view</span>` : ''}</td></tr>`,
      )
      .join('')}</tbody></table>`;
}

export function phraseChips(phrases, { value = 'medianOutlier', format = mult } = {}) {
  if (!phrases?.length) return emptyState('Chưa có cụm từ lặp lại');
  return `<div class="chips">${phrases.map((p) => `<span class="tag" data-tip="${p.count} video">${esc(p.phrase)} · <b>${format(p[value])}</b></span>`).join('')}</div>`;
}

export { median };
