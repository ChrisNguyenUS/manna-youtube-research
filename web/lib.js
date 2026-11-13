import { jobs, saved as savedApi, metrics } from './http/client.js';
// Shared helpers for all views.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Vietnamese short numbers: 5,8 N · 364 N · 1,2 Tr · 2,3 Tỷ */
export function fmt(n) {
  if (n == null || Number.isNaN(n)) return '–';
  const a = Math.abs(n);
  const f = (x, u) => (x < 10 ? x.toFixed(1).replace('.', ',').replace(',0', '') : Math.round(x)) + ' ' + u;
  if (a >= 1e9) return f(n / 1e9, 'Tỷ');
  if (a >= 1e6) return f(n / 1e6, 'Tr');
  if (a >= 1e3) return f(n / 1e3, 'N');
  return String(Math.round(n));
}
export const full = (n) => (n == null ? '–' : Math.round(n).toLocaleString('vi-VN'));
export const mult = (x) => (x == null ? '–' : '×' + (x >= 10 ? Math.round(x) : String(Math.round(x * 10) / 10).replace('.', ',')));
export function dur(s) {
  if (s == null) return '–';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
export function ageText(days, exact = true) {
  if (days == null) return '–';
  const p = exact ? '' : '~';
  if (days < 1) return `${p}${Math.max(1, Math.round(days * 24))} giờ`;
  if (days < 30) return `${p}${Math.round(days)} ngày`;
  if (days < 365) return `${p}${Math.round(days / 30.4)} tháng`;
  return `${p}${(days / 365).toFixed(1).replace('.', ',').replace(',0', '')} năm`;
}
export function ago(ts) {
  const d = (Date.now() - ts) / 86400000;
  if (d < 1 / 24) return `${Math.max(1, Math.round(d * 1440))} phút trước`;
  if (d < 1) return `${Math.round(d * 24)} giờ trước`;
  return `${Math.round(d)} ngày trước`;
}
export const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
export const ytVideo = (id) => `https://www.youtube.com/watch?v=${id}`;
export const ytChannel = (c) => (c.handle ? `https://www.youtube.com/${c.handle}` : `https://www.youtube.com/channel/${c.id}`);

// ---------- icons (lucide-style strokes) ----------
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  bars: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  columns: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>',
  message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5.1A8 8 0 1 1 21 12z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  key: '<path d="M4 7h16M4 12h10M4 17h6"/><circle cx="18" cy="16" r="3"/><path d="m20.2 18.2 1.8 1.8"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  play: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-7 0-3-2-5.5-3.5-7-.3 2-1.5 3-2.5 3.5C13.5 8 12 4.5 9 2c.3 3-1.5 5.5-3 7.5C4.8 11 4 12.8 4 15c0 4.3 3.5 7 8 7z"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>',
  doc: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h7M9 17h7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  heart: '<path d="M12 20s-7.5-4.6-9.3-9.2C1.4 7.4 3.6 4 7 4c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 15.4 12 20 12 20z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
};
export const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------- api ----------

// ---------- background jobs (shown in the sidebar) ----------
const watchers = new Map();
let JOB_INDEX = new Map();
// Sidebar buttons: cancel a running job, or re-run one interrupted by an app restart.
document.addEventListener('click', async (e) => {
  const c = e.target.closest?.('[data-job-cancel]');
  if (c) {
    await jobs.cancel(c.dataset.jobCancel);
    return refreshJobs();
  }
  const r = e.target.closest?.('[data-job-retry]');
  const j = r && JOB_INDEX.get(r.dataset.jobRetry);
  if (j) {
    await jobs.start(j.kind, j.params);
    toast('Đã chạy lại tác vụ');
    refreshJobs();
  }
});
export async function runJob(kind, body, onProgress) {
  const { id } = await jobs.start(kind, body);
  refreshJobs();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const j = await jobs.get(id);
        onProgress?.(j.progress, j);
        if (j.status === 'succeeded') {
          refreshJobs();
          return resolve(j.result);
        }
        if (j.status in STOPPED) {
          refreshJobs();
          return reject(new Error(j.error || STOPPED[j.status]));
        }
        setTimeout(tick, 700);
      } catch (e) {
        reject(e);
      }
    };
    watchers.set(id, true);
    tick();
  });
}

const STOPPED = { failed: 'Lỗi', cancelled: 'Đã huỷ', interrupted: 'Bị gián đoạn (app đã tắt giữa chừng)' };
const STATE = { queued: 'Chờ', running: 'Đang chạy', succeeded: 'Xong', failed: 'Lỗi', cancelled: 'Đã huỷ', interrupted: 'Bị gián đoạn' };
const ACTIVE = ['queued', 'running'];

let jobsTimer = null;
export async function refreshJobs() {
  try {
    const list = await jobs.list();
    const box = document.getElementById('jobs');
    box.hidden = !list.length;
    document.getElementById('jobs-list').innerHTML = list
      .slice(0, 5)
      .map((j) => {
        const pct = j.progress.total ? Math.min(100, Math.round((j.progress.done / j.progress.total) * 100)) : j.status === 'succeeded' ? 100 : 8;
        const step = j.status === 'failed' ? j.error : ACTIVE.includes(j.status) ? j.progress.step : j.title;
        return `<div class="job"><span class="job-state ${j.status}">${STATE[j.status] || j.status}</span><div class="job-title">${esc(LABELS[j.kind] || j.kind)}</div>
          <div class="job-step">${esc(step)}</div>
          ${ACTIVE.includes(j.status) ? `<div class="bar"><i style="width:${pct}%"></i></div><button class="btn sm ghost" data-job-cancel="${j.id}" style="margin-top:4px">Huỷ</button>` : ''}
          ${j.status === 'interrupted' ? `<button class="btn sm" data-job-retry="${j.id}" style="margin-top:6px">Chạy lại</button>` : ''}</div>`;
      })
      .join('');
    clearTimeout(jobsTimer);
    if (list.some((j) => ACTIVE.includes(j.status))) jobsTimer = setTimeout(refreshJobs, 1200);
    JOB_INDEX = new Map(list.map((j) => [String(j.id), j]));
  } catch {
    /* server restarting */
  }
}
const LABELS = { tiktok_topic: 'Tìm theo chủ đề TikTok', tiktok_search: 'Tìm video TikTok', tiktok_insight: 'Insight TikTok', tiktok_comments: 'Comment TikTok', video_search: 'Tìm video', channel_search: 'Tìm kênh', channel_analysis: 'Phân tích kênh', research: 'Nghiên cứu chủ đề', research_comments: 'Đọc comment', comments: 'Lấy comment', idea_check: 'Chấm điểm từ khoá', keyword_score: 'Chấm điểm từ khoá liên quan', keywords: 'Từ khoá' };

export function progressCard(title) {
  return `<div class="card progress-card" data-progress><b>${esc(title)}</b><div class="muted small" data-step>Bắt đầu…</div><div class="bar"><i style="width:4%"></i></div></div>`;
}
export function updateProgress(root, p) {
  const el = root.querySelector('[data-progress]');
  if (!el || !p) return;
  el.querySelector('[data-step]').textContent = `${p.step}${p.total ? ` · ${p.done}/${p.total}` : ''}`;
  const pct = p.total ? Math.min(100, Math.max(4, Math.round((p.done / p.total) * 100))) : 10;
  el.querySelector('.bar i').style.width = pct + '%';
}

export function toast(msg, kind = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.hidden = true), kind === 'error' ? 6000 : 2600);
}

// ---------- tiny persisted state ----------
export function store(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem('ytr:' + key) || '{}');
    // Filters saved before the metric rename (view/sub was called "outlier").
    if ('outlier' in raw) {
      raw.viewSub = raw.outlier;
      delete raw.outlier;
    }
    if (raw.sort === 'outlier') raw.sort = 'viewSub';
    return { ...fallback, ...raw };
  } catch {
    return { ...fallback };
  }
}

// ---------- metric registry (served by /api/metrics from src/core/metrics/definitions.js) ----------
let METRICS = {};
export async function loadMetrics() {
  METRICS = await metrics.load().catch(() => ({}));
}
/** @param {string} id */
export const metric = (id) => METRICS[id] || { label: { vi: id, en: id }, formula: '' };
export function persist(key, value) {
  try {
    localStorage.setItem('ytr:' + key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

// ---------- chips ----------
/** options: [{v, label}] ; value may be array when multi */
export function chips(name, options, value, { multi = false } = {}) {
  return `<div class="chips" data-chips="${name}" ${multi ? 'data-multi' : ''}>${options
    .map((o) => {
      const on = multi ? (value || []).includes(o.v) : String(value) === String(o.v);
      return `<button type="button" class="chip ${on ? 'on' : ''}" data-v="${esc(o.v)}">${esc(o.label)}</button>`;
    })
    .join('')}</div>`;
}
/** Wire chip groups inside root. onChange(name, value) */
export function bindChips(root, onChange, { toggleOff = true } = {}) {
  root.querySelectorAll('[data-chips]').forEach((g) => {
    g.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      const name = g.dataset.chips;
      if (g.hasAttribute('data-multi')) {
        b.classList.toggle('on');
        onChange(name, [...g.querySelectorAll('.chip.on')].map((x) => x.dataset.v));
      } else {
        const was = b.classList.contains('on');
        g.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
        if (!(was && toggleOff && g.dataset.allowOff !== undefined)) b.classList.add('on');
        onChange(name, was && g.dataset.allowOff !== undefined ? '' : b.dataset.v);
      }
    });
  });
}

// ---------- saved (bookmarks) ----------
let savedKeys = new Set();
export async function loadSaved() {
  savedKeys = new Set(await savedApi.keys().catch(() => []));
}
export const isSaved = (kind, ref) => savedKeys.has(`${kind}:${ref}`);
export async function toggleSave(kind, ref, title, data, btn) {
  if (isSaved(kind, ref)) {
    await savedApi.remove({ kind, ref });
    savedKeys.delete(`${kind}:${ref}`);
    btn?.classList.remove('on');
    toast('Đã bỏ lưu');
  } else {
    await savedApi.put({ kind, ref, title, data });
    savedKeys.add(`${kind}:${ref}`);
    btn?.classList.add('on');
    toast('Đã lưu vào Đã lưu');
  }
}

export const median = (a) => {
  const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function emptyState(title, text = '') {
  return `<div class="empty"><b>${esc(title)}</b>${esc(text)}</div>`;
}

/** Tooltip for elements with data-tip */
/** Tooltip for elements with data-tip. Returns off() to remove its listeners. */
export function bindTips(root) {
  let tip = document.querySelector('.tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    document.body.appendChild(tip);
  }
  const move = (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) return (tip.hidden = true);
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 330) + 'px';
    tip.style.top = e.clientY + 14 + 'px';
  };
  const leave = () => (tip.hidden = true);
  root.addEventListener('mousemove', move);
  root.addEventListener('mouseleave', leave);
  return () => {
    root.removeEventListener('mousemove', move);
    root.removeEventListener('mouseleave', leave);
    tip.hidden = true;
  };
}
