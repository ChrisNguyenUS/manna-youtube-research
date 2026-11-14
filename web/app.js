import { status as statusApi, shutdown, jobs as jobsApi } from './http/client.js';
import { icon, refreshJobs, loadSaved, loadMetrics, esc, toast, store, persist, leaveView } from './lib.js';

/**
 * The sidebar. One entry per job to be done; screens that work on the same thing share an entry and show as tabs
 * above the page (Tìm kênh · Phân tích · So sánh under "Kênh"). A tab is [path, tab label, loader of its screen].
 * @typedef {[string, string, () => Promise<any>]} Tab
 * @typedef {{icon: string, label: string, tabs: Tab[]}} Item
 */
/** @type {Item} */
const HOME = { icon: 'home', label: 'Tổng quan', tabs: [['/', 'Tổng quan', () => import('./views/dashboard.js')]] };
/** @type {{key: string, title: string, items: Item[]}[]} */
const GROUPS = [
  {
    key: 'tiktok', title: 'TikTok',
    items: [
      { icon: 'compass', label: 'Tìm theo chủ đề', tabs: [['/tiktok/topic', 'Tìm theo chủ đề', () => import('./views/tiktok/topic.js')]] },
      { icon: 'message', label: 'Insight khách hàng', tabs: [['/tiktok/insight', 'Insight khách hàng', () => import('./views/tiktok/insight.js')]] },
      { icon: 'bars', label: 'Phân tích video', tabs: [['/tiktok/video', 'Phân tích video', () => import('./views/tiktok/video.js')]] },
      {
        icon: 'play', label: 'Video & comment',
        tabs: [
          ['/tiktok/search', 'Tìm video', () => import('./views/tiktok/search.js')],
          ['/tiktok/comments', 'Lấy comment', () => import('./views/tiktok/comments.js')],
        ],
      },
    ],
  },
  {
    key: 'youtube', title: 'YouTube',
    items: [
      { icon: 'compass', label: 'Nghiên cứu chủ đề', tabs: [['/research', 'Nghiên cứu chủ đề', () => import('./views/research.js')]] },
      {
        icon: 'play', label: 'Video & comment',
        tabs: [
          ['/videos', 'Tìm video', () => import('./views/videos.js')],
          ['/comments', 'Lấy comment', () => import('./views/comments.js')],
        ],
      },
      {
        icon: 'users', label: 'Kênh',
        tabs: [
          ['/channels', 'Tìm kênh', () => import('./views/channels.js')],
          ['/channel', 'Phân tích kênh', () => import('./views/channel.js')],
          ['/compare', 'So sánh kênh', () => import('./views/compare.js')],
        ],
      },
      {
        icon: 'key', label: 'Từ khoá',
        tabs: [
          ['/keywords', 'Gợi ý từ khoá', () => import('./views/keywords.js')],
          ['/ideas', 'Chấm điểm từ khoá', () => import('./views/ideas.js')],
        ],
      },
    ],
  },
  {
    key: 'library', title: 'Lưu trữ',
    items: [
      { icon: 'clock', label: 'Lịch sử', tabs: [['/history', 'Lịch sử', () => import('./views/history.js')]] },
      { icon: 'bookmark', label: 'Đã lưu', tabs: [['/saved', 'Đã lưu', () => import('./views/saved.js')]] },
      { icon: 'settings', label: 'Cài đặt', tabs: [['/settings', 'Cài đặt', () => import('./views/settings.js')]] },
    ],
  },
];
const ITEMS = [HOME, ...GROUPS.flatMap((g) => g.items)];
const has = (item, path) => item.tabs.some((t) => t[0] === path);

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path, params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

const NAV_STATE = { collapsed: {} };
const navItem = (it, path) => `<a class="nav-item ${has(it, path) ? 'active' : ''}" href="#${it.tabs[0][0]}" ${has(it, path) ? 'aria-current="page"' : ''}>${icon(it.icon)}<span>${esc(it.label)}</span></a>`;
let navPath = '/';
function renderNav(path = navPath) {
  navPath = path;
  const st = store('nav', NAV_STATE);
  document.getElementById('nav').innerHTML =
    navItem(HOME, path) +
    GROUPS.map((g) => {
      // The group holding the open screen is always shown, whatever was folded before.
      const open = !st.collapsed[g.key] || g.items.some((it) => has(it, path));
      return `<button type="button" class="nav-group" data-nav-group="${g.key}" aria-expanded="${open}"><span>${esc(g.title)}</span>${icon('chevron')}</button>
        ${open ? `<div class="nav-list">${g.items.map((it) => navItem(it, path)).join('')}</div>` : ''}`;
    }).join('');
}
document.getElementById('nav').addEventListener('click', (e) => {
  const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-nav-group]'));
  if (!b) return;
  const st = store('nav', NAV_STATE);
  st.collapsed = { ...st.collapsed, [String(b.dataset.navGroup)]: b.getAttribute('aria-expanded') === 'true' };
  persist('nav', st);
  renderNav();
});

let unmount = null;
let routeSeq = 0;
async function route() {
  const { path, params } = parseHash();
  const item = ITEMS.find((it) => has(it, path)) || HOME;
  const tab = item.tabs.find((t) => t[0] === path) || item.tabs[0];
  renderNav(tab[0]);
  const main = document.getElementById('main');
  unmount?.(); // let the previous view remove its listeners
  leaveView(); // its job watchers stop; the jobs themselves keep running
  unmount = null;
  main.scrollTop = 0;
  // Screens that share a sidebar entry: their tabs sit above the page and switch between them.
  const tabs = item.tabs.length > 1 ? `<div class="page-tabs-wrap"><nav class="page-tabs" aria-label="${esc(item.label)}">${item.tabs.map((t) => `<a href="#${t[0]}" class="${t === tab ? 'on' : ''}" ${t === tab ? 'aria-current="page"' : ''}>${esc(t[1])}</a>`).join('')}</nav></div>` : '';
  main.innerHTML = `${tabs}<div class="page"></div>`;
  const page = /** @type {HTMLElement} */ (main.querySelector('.page'));
  const mine = ++routeSeq;
  try {
    // A screen's code is fetched the first time it is opened (the browser keeps it afterwards).
    const view = await tab[2]();
    if (mine !== routeSeq) return; // another screen was opened while this one was loading
    const off = await view.mount(page, params);
    if (mine !== routeSeq) return void (typeof off === 'function' && off());
    unmount = typeof off === 'function' ? off : null;
  } catch (e) {
    if (mine === routeSeq) page.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
  }
}

export function go(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  location.hash = '#' + path + (qs ? '?' + qs : '');
}
window.__go = go;

let stopped = false;
async function status() {
  if (stopped) return;
  try {
    const s = await statusApi.get();
    document.getElementById('statusbar').innerHTML = `<span><span class="dot"></span>YouTube: <b>${s.failures ? 'có lỗi' : 'ổn'}</b></span>
      <span>Khu vực: <b>${esc(s.gl)}</b></span><span>Request: <b>${s.requests}</b>${s.failures ? ` · lỗi <b>${s.failures}</b>` : ''}</span>
      <span>Việc nền: <b>${s.running ? s.running + ' đang chạy' : 'rảnh'}</b></span>
      <span class="right">Không cần key · miễn phí · dữ liệu lưu trên máy</span>`;
  } catch {
    document.getElementById('statusbar').innerHTML = '<span style="color:var(--bad)">Mất kết nối server — chạy lại npm start</span>';
  }
}

// ---------- "Tắt app" in the status bar: first click asks (and says what would be interrupted), second click stops ----------
const power = /** @type {HTMLButtonElement} */ (document.getElementById('power'));
let armTimer = 0;
function drawPower(text = 'Tắt app', armed = false) {
  power.innerHTML = `${icon('power')}<span>${esc(text)}</span>`;
  power.classList.toggle('armed', armed);
}
drawPower();
power.addEventListener('click', async () => {
  if (!power.classList.contains('armed')) {
    const running = (await jobsApi.list().catch(() => [])).filter((j) => j.status === 'running' || j.status === 'queued').length;
    drawPower(running ? `Tắt hẳn? ${running} việc đang chạy sẽ dừng` : 'Bấm lần nữa để tắt', true);
    clearTimeout(armTimer);
    armTimer = window.setTimeout(drawPower, 5000); // not confirmed: back to normal
    return;
  }
  clearTimeout(armTimer);
  power.disabled = true;
  try {
    await shutdown();
  } catch (e) {
    power.disabled = false;
    drawPower();
    return toast(e.message, 'error');
  }
  stopped = true;
  unmount?.();
  leaveView();
  document.getElementById('main').innerHTML = `<div class="stopped"><h1>Đã tắt Content Research</h1>
    <p>Server và các việc đang chạy đã dừng. Dữ liệu vẫn nằm trên máy.</p><p>Muốn dùng lại: bấm icon <b>Content Research</b>, hoặc chạy <code>npm start</code>. Cửa sổ này có thể đóng.</p></div>`;
  document.getElementById('statusbar').innerHTML = '<span>Đã tắt</span>';
  power.hidden = true;
});

window.addEventListener('hashchange', () => stopped || route());
window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || String(e.reason), 'error'));
await Promise.all([loadSaved(), loadMetrics()]);
route();
refreshJobs();
status();
// The status bar only matters while the window is looked at: no polling in a hidden tab, a fresh read when it comes back.
setInterval(() => document.hidden || status(), 5000);
document.addEventListener('visibilitychange', () => document.hidden || stopped || (status(), refreshJobs()));
