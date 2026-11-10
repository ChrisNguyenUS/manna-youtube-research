import { status as statusApi } from './http/client.js';
import { icon, refreshJobs, loadSaved, loadMetrics, esc, toast } from './lib.js';
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

const NAV = [
  ['Khám phá'],
  ['/', 'home', 'Tổng quan', dashboard],
  ['/videos', 'search', 'Tìm video', videos],
  ['/channels', 'users', 'Tìm kênh', channels],
  ['/research', 'compass', 'Nghiên cứu chủ đề', research],
  ['/keywords', 'key', 'Từ khoá người xem gõ', keywords],
  ['Phân tích'],
  ['/channel', 'bars', 'Phân tích kênh', channel],
  ['/compare', 'columns', 'So sánh kênh', compare],
  ['/comments', 'message', 'Comment', comments],
  ['/ideas', 'bulb', 'Chấm điểm từ khoá', ideas],
  ['Lưu trữ'],
  ['/saved', 'bookmark', 'Đã lưu', saved],
  ['/settings', 'settings', 'Cài đặt', settings],
];

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path, params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function renderNav(path) {
  document.getElementById('nav').innerHTML = NAV.map((n) =>
    n.length === 1 ? `<div class="nav-group">${esc(n[0])}</div>` : `<a class="nav-item ${n[0] === path ? 'active' : ''}" href="#${n[0]}">${icon(n[1])}<span>${esc(n[2])}</span></a>`,
  ).join('');
}

let unmount = null;
async function route() {
  const { path, params } = parseHash();
  const entry = NAV.find((n) => n[0] === path) || NAV[1];
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
