import { esc, fmt, full, mult, dur, ageText, thumb, ytVideo, icon, chips, bindChips, isSaved, toggleSave, store, persist, median, emptyState, bindTips, metric } from './lib.js';

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

export const VIDEO_FILTER_DEFAULT = { region: '', oscore: '', vph: '', subs: '', subsMin: '', subsMax: '', views: '', viewSub: '', age: '', noShorts: true, q: '', sort: 'views', view: 'table' };

export function filterVideos(videos, f) {
  const [slo, shi] = range(f.subs);
  const smin = f.subsMin !== '' ? Number(f.subsMin) * 1000 : null;
  const smax = f.subsMax !== '' ? Number(f.subsMax) * 1000 : null;
  const q = (f.q || '').toLowerCase().trim();
  let list = videos.filter((v) => {
    if (f.region && !(v.regions || []).includes(f.region)) return false;
    if (f.subs && !inRange(v.channelSubs, slo, shi)) return false;
    if (smin != null && !(v.channelSubs >= smin)) return false;
    if (smax != null && !(v.channelSubs <= smax)) return false;
    if (f.views && !(v.views >= Number(f.views))) return false;
    if (f.viewSub && !(v.viewSub >= Number(f.viewSub))) return false;
    if (f.oscore && !(v.outlierScore >= Number(f.oscore))) return false;
    if (f.vph && !(v.vph >= Number(f.vph))) return false;
    if (f.age && !(v.age != null && v.age <= Number(f.age))) return false;
    if (f.noShorts && v.durationSec != null && v.durationSec <= 60) return false;
    if (q && !`${v.title} ${v.channelTitle}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const key = { views: 'views', oscore: 'outlierScore', viewSub: 'viewSub', vpd: 'viewsPerDay', vph: 'vph', new: 'age', subsAsc: 'channelSubs', likes: 'likes', dur: 'durationSec' }[f.sort] || 'views';
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

export function videoFilterPanel(f, regions = []) {
  return `<div class="filter-table">
    ${regions.length > 1 ? `<div class="filter-row"><div class="fr-label" data-tip="Chỉ giữ video xuất hiện trong kết quả tìm ở nước này">Hiện ở nước ⓘ</div>${chips('region', regions.map((r) => ({ v: r, label: r })), f.region)}<div></div></div>` : ''}
    <div class="filter-row"><div class="fr-label">Sub của kênh</div>${chips('subs', SUB_RANGES, f.subs)}
      <div class="range"><input class="input sm" data-f="subsMin" placeholder="Min (N)" value="${esc(f.subsMin)}"> – <input class="input sm" data-f="subsMax" placeholder="Max (N)" value="${esc(f.subsMax)}"></div></div>
    <div class="filter-row"><div class="fr-label">Lượt xem</div>${chips('views', [{ v: 10000, label: '10N+' }, { v: 50000, label: '50N+' }, { v: 100000, label: '100N+' }, { v: 500000, label: '500N+' }, { v: 1000000, label: '1Tr+' }], f.views)}<div></div></div>
    <div class="filter-row"><div class="fr-label" data-tip="${esc(outlierTip())}">Outlier (× kênh) ⓘ</div>${chips('oscore', [{ v: 2, label: '2×+' }, { v: 5, label: '5×+' }, { v: 10, label: '10×+' }, { v: 50, label: '50×+' }], f.oscore)}<div></div></div>
    <div class="filter-row"><div class="fr-label" data-tip="Lượt xem chia số sub của kênh. Lớn hơn 1 = video kéo được người ngoài tệp sub.">Vượt tệp sub (view/sub) ⓘ</div>${chips('viewSub', [{ v: 0.5, label: '×0,5+' }, { v: 1, label: '×1+' }, { v: 3, label: '×3+' }, { v: 10, label: '×10+' }], f.viewSub)}<div></div></div>
    <div class="filter-row"><div class="fr-label" data-tip="View mỗi giờ kể từ lúc đăng">VPH ⓘ</div>${chips('vph', [{ v: 1, label: '1+' }, { v: 10, label: '10+' }, { v: 100, label: '100+' }, { v: 1000, label: '1N+' }, { v: 10000, label: '10N+' }], f.vph)}<div></div></div>
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
      ${[['views', 'Lượt xem'], ['oscore', 'Outlier (× kênh)'], ['viewSub', 'View/sub'], ['vph', 'VPH (view/giờ)'], ['vpd', 'View/ngày'], ['new', 'Mới nhất'], ['subsAsc', 'Kênh ít sub nhất'], ['likes', 'Like'], ['dur', 'Dài nhất']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <button class="icon-btn ${f.view === 'grid' ? 'on' : ''}" data-viewmode="grid" title="Dạng lưới">${icon('grid')}</button>
    <button class="icon-btn ${f.view === 'table' ? 'on' : ''}" data-viewmode="table" title="Dạng bảng">${icon('list')}</button>
  </div>`;
}

/** Tooltip text for the outlier column; read at render time so it follows the server registry. */
export const outlierTip = () => `${metric('outlierScore').label.vi} = ${metric('outlierScore').formula}. Như 1of10/vidIQ.`;
/** vidIQ-style brackets: < 2× · 2–5× · 5–10× · 10×+ */
export function oscoreBadge(v) {
  const o = v.outlierScore;
  if (o == null) return '<span class="muted">–</span>';
  const cls = o >= 10 ? 'accent' : o >= 5 ? 'purple' : o >= 2 ? 'blue' : 'plain';
  const tip = v.outlierBasis === 'vph' ? `VPH gấp ${o} lần video mới của kênh (video < 7 ngày)` : `${full(v.views)} view ÷ ${full(v.channelMedianViews)} (trung vị ${v.channelBaselineSample} video của kênh)`;
  return `<span class="badge ${cls}" data-tip="${esc(tip)}">${mult(o)}${v.outlierBasis === 'vph' ? '<small> VPH</small>' : ''}</span>`;
}
const outlierBadge = (o) => (o == null ? '<span class="muted">–</span>' : `<span class="badge ${o >= 10 ? 'accent' : o >= 1 ? 'good' : 'plain'}">${mult(o)}</span>`);

export function videoTable(list, { selected = new Set(), rankOffset = 0 } = {}) {
  if (!list.length) return emptyState('Không có video nào khớp bộ lọc', 'Bỏ bớt bộ lọc ở trên.');
  return `<div class="table-wrap"><table class="t"><thead><tr>
    <th style="width:28px"><input type="checkbox" data-selall></th><th>#</th><th class="thumb"></th><th>Video</th>
    <th class="r">View</th><th class="r" data-tip="${esc(outlierTip())}">Outlier</th><th class="r" data-tip="View ÷ sub của kênh">View/sub</th><th class="r" data-tip="View mỗi giờ kể từ lúc đăng">VPH</th><th class="r">View/ngày</th><th class="r">Sub kênh</th><th class="r">Dài</th><th class="r">Đăng</th><th></th></tr></thead><tbody>
    ${list
      .map(
        (v, i) => `<tr data-id="${v.id}">
      <td><input type="checkbox" data-sel="${v.id}" ${selected.has(v.id) ? 'checked' : ''}></td>
      <td class="muted num">${i + 1 + rankOffset}</td>
      <td class="thumb"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(v.id)}" alt=""></a></td>
      <td class="title-cell"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        <div class="meta"><a href="#/channel?input=${encodeURIComponent(v.channelId || '')}" style="display:inline" data-tip="Phân tích kênh này">${esc(v.channelTitle)}</a>${v.likes != null ? ` · ${fmt(v.likes)} like` : ''}${v.regions?.length > 1 ? ` · <span class="tag" data-tip="Video hiện trong kết quả tìm ở các nước này">🌐 ${esc(v.regions.join(' '))}</span>` : ''}${v.queries?.length ? ` · <span class="tag">${esc(v.queries[0])}</span>` : ''}</div></td>
      <td class="r num"><b>${fmt(v.views)}</b></td>
      <td class="r">${oscoreBadge(v)}</td>
      <td class="r">${outlierBadge(v.viewSub)}</td>
      <td class="r num">${v.vph == null ? '–' : v.vph < 10 ? String(v.vph).replace('.', ',') : fmt(v.vph)}</td>
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
        ${v.outlierScore != null ? `<span class="ov mult" data-tip="${esc(outlierTip())}">${mult(v.outlierScore)} kênh</span>` : v.outlier != null ? `<span class="ov mult">${mult(v.outlier)} sub</span>` : ''}<span class="ov rank">#${i + 1}</span><span class="ov dur">${dur(v.durationSec)}</span>
        <label class="ov sel"><input type="checkbox" data-sel="${v.id}" ${selected.has(v.id) ? 'checked' : ''}></label></div>
      <div class="body"><a class="t1" href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        <div class="stats"><b>${fmt(v.views)}</b> lượt xem · ${v.vph == null ? '–' : fmt(v.vph)} VPH · ${ageText(v.age, v.ageExact)}</div>
        <div class="stats">${esc(v.channelTitle)} · ${fmt(v.channelSubs)} sub${v.viewSub != null ? ` · ${mult(v.viewSub)} sub` : ''}${v.regions?.length > 1 ? ` · 🌐 ${esc(v.regions.join(' '))}` : ''}</div>
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
export function mountVideoResults(container, videos, { key = 'vf', onComments, regions = [] } = {}) {
  const f = store(key, VIDEO_FILTER_DEFAULT);
  if (f.region && !regions.includes(f.region)) f.region = '';
  const selected = new Set();
  container.innerHTML = `<div data-filters></div><div class="card" style="margin-top:14px"><div data-toolbar></div><div data-sel-bar></div><div data-list></div></div>`;
  container.querySelector('[data-filters]').innerHTML = videoFilterPanel(f, regions);
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
      toggleSave('video', v.id, v.title, { id: v.id, title: v.title, channelTitle: v.channelTitle, channelId: v.channelId, views: v.views, channelSubs: v.channelSubs, viewSub: v.viewSub, durationSec: v.durationSec }, sv);
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

export function phraseChips(phrases, { value = 'medianViewSub', format = mult } = {}) {
  if (!phrases?.length) return emptyState('Chưa có cụm từ lặp lại');
  return `<div class="chips">${phrases.map((p) => `<span class="tag" data-tip="${p.count} video">${esc(p.phrase)} · <b>${format(p[value])}</b></span>`).join('')}</div>`;
}

// ---------- keyword score card (vidIQ-style) ----------
const GOOD = '#2f9e44', MID = '#f08c00', BAD = '#c92a2a';
const goodColor = (goodness) => (goodness >= 60 ? GOOD : goodness >= 40 ? MID : BAD);

export const VERDICT = {
  open: ['good', 'Ít người làm gần đây', 'Có người xem nhưng ít video trong 1 năm qua: cửa còn mở.'],
  competitive: ['plain', 'Đã có người làm', 'Cần góc nhìn mới hoặc làm tốt hơn top hiện tại.'],
  saturated: ['warn', 'Nhiều người làm, đang thắng', 'Ngách nóng: nhiều video mới vượt kênh. Vào được nhưng phải khác biệt.'],
  low_demand: ['bad', 'Ít người xem', 'Video top có rất ít view.'],
};

function gauge(score) {
  const R = 80, cx = 100, cy = 96;
  const pt = (pct) => {
    const a = Math.PI * (1 - pct / 100);
    return [cx + R * Math.cos(a), cy - R * Math.sin(a)];
  };
  const [sx, sy] = pt(0), [fx, fy] = pt(100), [ex, ey] = pt(Math.max(score, 0.5));
  return `<svg viewBox="0 0 200 104" class="gauge" role="img" aria-label="Điểm ${score} trên 100">
    <path d="M${sx} ${sy} A${R} ${R} 0 0 1 ${fx} ${fy}" fill="none" stroke="#efedea" stroke-width="13" stroke-linecap="round"/>
    <path d="M${sx} ${sy} A${R} ${R} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="${goodColor(score)}" stroke-width="13" stroke-linecap="round"/>
    <text x="100" y="92" text-anchor="middle" style="font:600 46px var(--font);fill:var(--text)">${score}</text></svg>`;
}

/** Full-width bar like vidIQ. goodness 0–100 decides the color (competition is inverted). */
function bar(label, value, bandLabel, goodness, tip) {
  const c = goodColor(goodness);
  return `<div class="sbar" data-tip="${esc(tip)}"><div class="row between"><span class="sbar-label">${esc(label)} ⓘ</span><b style="color:${c}">${esc(bandLabel)} · ${value}</b></div>
    <div class="sbar-track"><i style="width:${Math.max(value, 2)}%;background:${c}"></i></div></div>`;
}

const breakdown = (list) => list.map((p) => `• ${p.label}: ${p.score}${p.note ? ` (${p.note})` : ''} × ${Math.round(p.weight * 100)}%`).join('\n');

export function scoreCard(r, { onRelated = true } = {}) {
  if (r.error) return `<div class="card card-pad"><b>${esc(r.keyword)}</b><div class="callout" style="margin-top:8px">Lỗi: ${esc(r.error)}</div></div>`;
  const s = r.stats, n = s.results;
  const [vcls, vlabel, vwhy] = VERDICT[r.verdict] || ['plain', '–', ''];
  const stat = (label, value, tip = '') => `<span ${tip ? `data-tip="${esc(tip)}"` : ''}>${esc(label)}</span><b>${value}</b>`;
  return `<div class="card score-card" data-kw="${esc(r.keyword)}">
    <div class="score-term"><span>${esc(r.keyword)}</span>${r.regions?.length > 1 ? `<span class="badge plain">🌐 ${r.regions.length} nước</span>` : r.regions?.[0] ? `<span class="badge plain">${esc(r.regions[0])}</span>` : ''}</div>
    <div class="card-pad" style="padding-bottom:8px">
      ${gauge(r.overall)}
      <div class="score-overall">Điểm tổng<div style="color:${goodColor(r.overall)}">${esc(r.bands.overall.label.toUpperCase())}</div></div>
      ${bar('Volume (ước tính)', r.volume, r.bands.volume.label, r.volume, 'Nhu cầu ước tính từ view của video top, KHÔNG phải lượng tìm kiếm thật:\n' + breakdown(r.parts.volume))}
      ${bar('Competition', r.competition, r.bands.competition.label, 100 - r.competition, 'Độ cạnh tranh (cao = khó):\n' + breakdown(r.parts.competition))}
      <div class="verdict"><span class="badge ${vcls}">${esc(vlabel)}</span> <span class="muted small">${esc(vwhy)} ${r.recentYear}/${n} video trong 1 năm, ${r.strong}/${n} vượt kênh.</span></div>
    </div>
    <div class="score-section">Thống kê top ${n} kết quả</div>
    <div class="card-pad score-stats">
      ${stat('View cao nhất', full(s.highestViews))}
      ${stat('View trung bình', full(s.avgViews))}
      ${stat('Sub trung bình', full(s.avgSubs))}
      ${stat('Tuổi trung bình', ageText(s.avgAgeDays, false))}
      ${stat('Tiêu đề chứa từ khoá', `${s.titleMatch}/${n}`, 'Tiêu đề có đủ các chữ của từ khoá (không phân biệt dấu)')}
      ${stat('Mô tả chứa từ khoá', `${s.descMatch ?? '–'}/${n}`, 'Theo đoạn mô tả YouTube hiện trong kết quả tìm')}
      ${stat('Đăng trong 7 ngày', `${s.added7d}/${n}`)}
      ${stat('Có phụ đề (Captions)', `${s.captionsCount ?? '–'}/${n}`)}
      ${stat('Creative Commons', `${s.ccCount ?? '–'}/${n}`)}
      ${stat('Kênh ≥ 1 triệu sub', `${s.bigChannels}/${n}`)}
      ${r.recent30 ? stat('Video mới 30 ngày', `${r.recent30.count}${r.recent30.count >= 40 ? '+' : ''}`, 'Số video đăng trong 30 ngày qua khớp từ khoá (tối đa 40)') + stat('VPH trung vị video mới', r.recent30.medianVph == null ? '–' : fmt(r.recent30.medianVph), 'View mỗi giờ của video đăng trong 30 ngày qua') : ''}
    </div>
    ${r.topChannels?.length ? `<div class="score-section">Top kênh cho từ khoá này</div><div class="card-pad" style="padding-top:8px">${r.topChannels
      .map((c) => `<div class="row" style="gap:8px;margin:6px 0">${c.avatar ? `<img src="${esc(c.avatar)}" referrerpolicy="no-referrer" alt="" style="width:26px;height:26px;border-radius:50%">` : ''}
        <a href="#/channel?input=${encodeURIComponent(c.id)}" style="font-weight:600">${esc(c.title)}</a><span class="muted small">${fmt(c.subs)} sub</span><span class="spacer"></span><span class="small muted">${c.count} video</span></div>`)
      .join('')}</div>` : ''}
    ${onRelated && r.related?.length ? `<div class="score-section row between"><span>Từ khoá liên quan</span><button class="btn sm" data-score-related disabled>Chấm điểm đã chọn</button></div>
      <div class="card-pad" style="padding-top:6px">${r.related
        .map((k) => `<label class="related-row"><input type="checkbox" data-rel="${esc(k.keyword)}"><span>${esc(k.keyword)}</span><b data-rel-score="${esc(k.keyword)}">${k.overall != null ? k.overall : ''}</b></label>`)
        .join('')}</div>` : ''}
    <div class="row" style="padding:12px 18px 16px;border-top:1px solid var(--line)">
      <a class="btn sm" href="#/videos?q=${encodeURIComponent(r.keyword)}&run=1">${icon('search')} Tìm video</a>
      <a class="btn sm" href="#/channels?q=${encodeURIComponent(r.keyword)}">${icon('users')} Tìm kênh</a>
      <details class="small" style="margin-left:auto"><summary class="muted" style="cursor:pointer">Top ${r.top?.length || 0} video</summary>
        ${(r.top || []).map((v) => `<div style="margin-top:6px"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title.slice(0, 70))}</a> <span class="muted">${fmt(v.views)} · ${fmt(v.channelSubs)} sub</span></div>`).join('')}</details></div>
  </div>`;
}

/** Wire "related keywords" checkboxes inside score cards: score selected ones (lite) and show the number. */
export function bindScoreCards(root, runJob, gl) {
  root.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-rel]');
    if (!cb) return;
    const card = cb.closest('.score-card');
    card.querySelector('[data-score-related]').disabled = !card.querySelector('[data-rel]:checked');
  });
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-score-related]');
    if (!btn) return;
    const card = btn.closest('.score-card');
    const kws = [...card.querySelectorAll('[data-rel]:checked')].map((x) => x.dataset.rel);
    btn.disabled = true;
    btn.textContent = 'Đang chấm…';
    try {
      const res = await runJob('keyword_score', { keywords: kws, gl, lite: true });
      for (const x of res.results || []) {
        const el = [...card.querySelectorAll('[data-rel-score]')].find((b) => b.dataset.relScore === x.keyword);
        if (el && x.overall != null) {
          el.textContent = x.overall;
          el.style.color = goodColor(x.overall);
          el.dataset.tip = `Volume ${x.volume} · Competition ${x.competition}`;
        }
      }
      card.querySelectorAll('[data-rel]:checked').forEach((x) => (x.checked = false));
    } finally {
      btn.textContent = 'Chấm điểm đã chọn';
    }
  });
}

export { median };
