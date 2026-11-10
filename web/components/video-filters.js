// Client-side video filters (instant, no new scrape) and the filter panel UI.
import { outlierTip } from './video-table.js';
import { esc, fmt, full, mult, dur, ageText, thumb, ytVideo, icon, chips, bindChips, isSaved, toggleSave, store, persist, median, emptyState, bindTips, metric } from '../lib.js';
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
