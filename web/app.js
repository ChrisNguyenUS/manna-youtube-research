import { status as statusApi } from './http/client.js';
import { icon, refreshJobs, loadSaved, loadMetrics, esc, toast, store, persist, leaveView } from './lib.js';

const HOME = ['/', 'home', 'Tổng quan', () => import('./views/dashboard.js')];
// Grouped by platform. `more` holds the tools the main screens already cover; they sit behind "Công cụ khác".
const GROUPS = [
  {
    key: 'tiktok', title: 'TikTok',
    items: [
      ['/tiktok/topic', 'compass', 'Tìm theo chủ đề', () => import('./views/tiktok/topic.js')],
      ['/tiktok/insight', 'message', 'Insight khách hàng', () => import('./views/tiktok/insight.js')],
    ],
    more: [
      ['/tiktok/search', 'search', 'Tìm video', () => import('./views/tiktok/search.js')],
      ['/tiktok/comments', 'message', 'Comment', () => import('./views/tiktok/comments.js')],
    ],
  },
  {
    key: 'youtube', title: 'YouTube',
    items: [
      ['/videos', 'search', 'Tìm video', () => import('./views/videos.js')],
      ['/channels', 'users', 'Tìm kênh', () => import('./views/channels.js')],
      ['/research', 'compass', 'Nghiên cứu chủ đề', () => import('./views/research.js')],
      ['/keywords', 'key', 'Từ khoá người xem gõ', () => import('./views/keywords.js')],
      ['/ideas', 'bulb', 'Chấm điểm từ khoá', () => import('./views/ideas.js')],
      ['/channel', 'bars', 'Phân tích kênh', () => import('./views/channel.js')],
      ['/compare', 'columns', 'So sánh kênh', () => import('./views/compare.js')],
      ['/comments', 'message', 'Comment', () => import('./views/comments.js')],
    ],
    more: [],
  },
  {
    key: 'library', title: 'Lưu trữ',
    items: [
      ['/history', 'clock', 'Lịch sử', () => import('./views/history.js')],
      ['/saved', 'bookmark', 'Đã lưu', () => import('./views/saved.js')],
      ['/settings', 'settings', 'Cài đặt', () => import('./views/settings.js')],
    ],
    more: [],
  },
];
const ROUTES = [HOME, ...GROUPS.flatMap((g) => [...g.items, ...g.more])];

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path, params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

const NAV_STATE = { collapsed: {}, more: {} };
const navItem = (n, path) => `<a class="nav-item ${n[0] === path ? 'active' : ''}" href="#${n[0]}" ${n[0] === path ? 'aria-current="page"' : ''}>${icon(n[1])}<span>${esc(n[2])}</span></a>`;
let navPath = '/';
function renderNav(path = navPath) {
  navPath = path;
  const st = store('nav', NAV_STATE);
  document.getElementById('nav').innerHTML =
    navItem(HOME, path) +
    GROUPS.map((g) => {
      // The group (and its extra tools) holding the open screen is always shown, whatever was folded before.
      const inMore = g.more.some((n) => n[0] === path);
      const open = !st.collapsed[g.key] || inMore || g.items.some((n) => n[0] === path);
      const moreOpen = !!st.more[g.key] || inMore;
      return `<button type="button" class="nav-group" data-nav-group="${g.key}" aria-expanded="${open}"><span>${esc(g.title)}</span>${icon('chevron')}</button>
        ${open ? `<div class="nav-list">${g.items.map((n) => navItem(n, path)).join('')}
          ${g.more.length ? `<button type="button" class="nav-item nav-more" data-nav-more="${g.key}" aria-expanded="${moreOpen}">${icon('chevron')}<span>Công cụ khác</span></button>${moreOpen ? `<div class="nav-sub">${g.more.map((n) => navItem(n, path)).join('')}</div>` : ''}` : ''}</div>` : ''}`;
    }).join('');
}
document.getElementById('nav').addEventListener('click', (e) => {
  const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-nav-group],[data-nav-more]'));
  if (!b) return;
  const st = store('nav', NAV_STATE);
  const open = b.getAttribute('aria-expanded') === 'true';
  if (b.dataset.navGroup) st.collapsed = { ...st.collapsed, [b.dataset.navGroup]: open };
  else st.more = { ...st.more, [String(b.dataset.navMore)]: !open };
  persist('nav', st);
  renderNav();
});

let unmount = null;
let routeSeq = 0;
async function route() {
  const { path, params } = parseHash();
  const entry = ROUTES.find((n) => n[0] === path) || HOME;
  renderNav(entry[0]);
  const main = document.getElementById('main');
  unmount?.(); // let the previous view remove its listeners
  leaveView(); // its job watchers stop; the jobs themselves keep running
  unmount = null;
  main.scrollTop = 0;
  main.innerHTML = '<div class="page"></div>';
  const page = main.firstChild;
  const mine = ++routeSeq;
  try {
    // A screen's code is fetched the first time it is opened (the browser keeps it afterwards).
    const view = await entry[3]();
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

async function status() {
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

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || String(e.reason), 'error'));
await Promise.all([loadSaved(), loadMetrics()]);
route();
refreshJobs();
status();
// The status bar only matters while the window is looked at: no polling in a hidden tab, a fresh read when it comes back.
setInterval(() => document.hidden || status(), 5000);
document.addEventListener('visibilitychange', () => document.hidden || (status(), refreshJobs()));
