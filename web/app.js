import { status as statusApi, shutdown, jobs as jobsApi } from './http/client.js';
import { icon, refreshJobs, loadSaved, loadFollows, loadMetrics, esc, toast, store, persist, leaveView } from './lib.js';
import { HOME, SOULPRINT, GROUPS, ALIASES, PLATFORM_LABELS, has, platformOf, tabsFor, firstPath, findItem } from './nav.js';

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path, params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

const NAV_STATE = { collapsed: {}, platform: {} };
const navItem = (it, path) => `<a class="nav-item ${has(it, path) ? 'active' : ''}" href="#${firstPath(it, store('nav', NAV_STATE).platform?.[it.label])}" ${has(it, path) ? 'aria-current="page"' : ''}>${icon(it.icon)}<span>${esc(it.label)}</span></a>`;
let navPath = '/';
function renderNav(path = navPath) {
  navPath = path;
  const st = store('nav', NAV_STATE);
  document.getElementById('nav').innerHTML =
    navItem(HOME, path) +
    navItem(SOULPRINT, path) +
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
  if (ALIASES[path]) {
    const qs = new URLSearchParams(params).toString();
    return void location.replace('#' + ALIASES[path] + (qs ? '?' + qs : ''));
  }
  const item = findItem(path);
  const shown = tabsFor(item, path);
  const tab = shown.find((t) => t[0] === path) || shown[0];
  const platform = platformOf(item, tab[0]);
  if (platform) {
    const st = store('nav', NAV_STATE);
    if (st.platform?.[item.label] !== platform) persist('nav', { ...st, platform: { ...st.platform, [item.label]: platform } });
  }
  renderNav(tab[0]);
  const main = document.getElementById('main');
  unmount?.(); // let the previous view remove its listeners
  leaveView(); // its job watchers stop; the jobs themselves keep running
  unmount = null;
  main.scrollTop = 0;
  // Above the page: the TikTok | YouTube switch of an entry that exists on both, then the tabs of the screens that
  // share the entry. An entry that exists on one platform says which.
  const platformSwitch = platform
    ? `<div class="page-plat" role="group" aria-label="Nền tảng">${Object.entries(PLATFORM_LABELS).map(([k, l]) => `<a href="#${firstPath(item, k)}" class="${k === platform ? 'on' : ''}" ${k === platform ? 'aria-current="true"' : ''}>${l}</a>`).join('')}</div>`
    : item.only ? `<span class="page-plat-only">${PLATFORM_LABELS[item.only]}</span>` : '';
  const tabLinks = shown.length > 1 ? `<nav class="page-tabs" aria-label="${esc(item.label)}">${shown.map((t) => `<a href="#${t[0]}" class="${t === tab ? 'on' : ''}" ${t === tab ? 'aria-current="page"' : ''}>${esc(t[1])}</a>`).join('')}</nav>` : '';
  const tabs = platformSwitch || tabLinks ? `<div class="page-tabs-wrap">${platformSwitch}${tabLinks}</div>` : '';
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
await Promise.all([loadSaved(), loadFollows(), loadMetrics()]);
route();
refreshJobs();
status();
// The status bar only matters while the window is looked at: no polling in a hidden tab, a fresh read when it comes back.
setInterval(() => document.hidden || status(), 5000);
document.addEventListener('visibilitychange', () => document.hidden || stopped || (status(), refreshJobs()));
