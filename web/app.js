import { status as statusApi } from './http/client.js';
import { icon, refreshJobs, loadSaved, loadMetrics, esc, toast, store, persist } from './lib.js';
import * as dashboard from './views/dashboard.js';
import * as videos from './views/videos.js';
import * as channels from './views/channels.js';
import * as research from './views/research.js';
import * as channel from './views/channel.js';
import * as compare from './views/compare.js';
import * as comments from './views/comments.js';
import * as ideas from './views/ideas.js';
import * as keywords from './views/keywords.js';
import * as saved from './views/saved.js';
import * as settings from './views/settings.js';
import * as ttSearch from './views/tiktok/search.js';
import * as ttInsight from './views/tiktok/insight.js';
import * as ttComments from './views/tiktok/comments.js';
import * as ttTopic from './views/tiktok/topic.js';

const HOME = ['/', 'home', 'Tổng quan', dashboard];
// Grouped by platform. `more` holds the tools the main screens already cover; they sit behind "Công cụ khác".
const GROUPS = [
  {
    key: 'tiktok', title: 'TikTok',
    items: [
      ['/tiktok/topic', 'compass', 'Tìm theo chủ đề', ttTopic],
      ['/tiktok/insight', 'message', 'Insight khách hàng', ttInsight],
    ],
    more: [
      ['/tiktok/search', 'search', 'Tìm video', ttSearch],
      ['/tiktok/comments', 'message', 'Comment', ttComments],
    ],
  },
  {
    key: 'youtube', title: 'YouTube',
    items: [
      ['/videos', 'search', 'Tìm video', videos],
      ['/channels', 'users', 'Tìm kênh', channels],
      ['/research', 'compass', 'Nghiên cứu chủ đề', research],
      ['/keywords', 'key', 'Từ khoá người xem gõ', keywords],
      ['/ideas', 'bulb', 'Chấm điểm từ khoá', ideas],
      ['/channel', 'bars', 'Phân tích kênh', channel],
      ['/compare', 'columns', 'So sánh kênh', compare],
      ['/comments', 'message', 'Comment', comments],
    ],
    more: [],
  },
  {
    key: 'library', title: 'Lưu trữ',
    items: [
      ['/saved', 'bookmark', 'Đã lưu', saved],
      ['/settings', 'settings', 'Cài đặt', settings],
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
async function route() {
  const { path, params } = parseHash();
  const entry = ROUTES.find((n) => n[0] === path) || HOME;
  renderNav(entry[0]);
  const main = document.getElementById('main');
  unmount?.(); // let the previous view remove its listeners
  unmount = null;
  main.scrollTop = 0;
  main.innerHTML = '<div class="page"></div>';
  try {
    const off = await entry[3].mount(main.firstChild, params);
    unmount = typeof off === 'function' ? off : null;
  } catch (e) {
    main.firstChild.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
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
setInterval(status, 4000);
