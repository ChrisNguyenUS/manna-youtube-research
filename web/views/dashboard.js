import { records as recordsApi, saved as savedApi, jobs as jobsApi, soulprint as soulprintApi } from '../http/client.js';
import { esc, icon, ago, emptyState, fmt, store, persist, toast, img } from '../lib.js';
import { KINDS, PLATFORMS, recordHref } from '../kinds.js';
import { routeInput } from '../smart-input.js';

// Other things a topic can start, next to the main button: [screen, icon, button text, extra URL params].
const MORE = {
  tiktok: [['/tiktok/insight', 'download', 'Collect theo từ khoá', {}]],
  youtube: [['/videos', 'search', 'Video Search', { run: 1 }], ['/channels', 'users', 'Channel Search', {}]],
};
const ROUTE_ICON = { videos: 'play', channel: 'bars', topic: 'compass', empty: 'compass' };
const PLACEHOLDER = { tiktok: 'Chủ đề (vd: di trú mỹ), link video hoặc link kênh TikTok/YouTube', youtube: 'Chủ đề (vd: kể chuyện đêm khuya), link video hoặc link kênh' };

// The four steps of the sidebar, in order: [step, group, what you do there, where it starts, button text, icon, the
// result kinds of that step (its latest one is shown, to pick it up again)].
const STEPS = [
  ['1', 'Research', 'Tìm chủ đề, video và kênh đang thắng.', '#/tiktok/topic', 'Topic Research', 'compass', ['tiktok_topic', 'research', 'tiktok_search', 'video_search', 'channel_search', 'keywords', 'idea_check', 'keyword_score']],
  ['2', 'Analyze', 'Mổ xẻ video và kênh đối thủ: hook, cách kể, CTA.', '#/video', 'Video Analysis', 'play', ['tiktok_video_analysis', 'video_analysis', 'tiktok_channel', 'channel_analysis']],
  ['3', 'Audience', 'Đọc comment: khách hỏi gì, lo gì, muốn xem gì.', '#/tiktok/comments', 'Collect Comments', 'download', ['tiktok_comments', 'comments', 'tiktok_insight', 'youtube_insight', 'comment_5w1h']],
  ['4', 'Create', 'Biến cơ hội thành ý tưởng, làm theo lô 10.', '#/board', 'Idea Board', 'bulb', []],
];

const ACTIVE = ['queued', 'running'];
const RECENT = 12;

export async function mount(root) {
  const st = store('home', { platform: 'tiktok', show: 'all' });
  if (!MORE[st.platform]) st.platform = 'tiktok';
  const [records, saved] = await Promise.all([recordsApi.list(null, 60), savedApi.list('channel')]);

  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('home')} Home</h1><p>Nghiên cứu content TikTok và YouTube trên máy của bạn: miễn phí, không cần key.</p></div></div>
    <a class="card card-pad sp-home" href="#/soulprint" data-soulprint hidden></a>
    <div class="card card-pad home-start">
      <div class="row"><b>Bắt đầu</b>
        <div class="ix-seg" role="radiogroup" aria-label="Nền tảng" data-platform>${Object.entries(PLATFORMS).map(([k, l]) => `<button type="button" role="radio" data-v="${k}">${l}</button>`).join('')}</div></div>
      <div class="input-row" style="margin-top:12px"><input class="input" data-q autocomplete="off" aria-label="Chủ đề, link video hoặc link kênh"><span class="row home-go" data-starts></span></div>
      <div class="muted small home-route" data-route aria-live="polite"></div>
    </div>
    <div class="home-steps">${STEPS.map(([n, t, d, href, cta, ic, kinds]) => {
      const last = records.find((r) => kinds.includes(r.kind));
      return `<div class="card home-step"><div class="home-step-h"><span class="badge accent">${n}</span><b>${t}</b></div>
        <p class="muted small">${d}</p>
        ${last ? `<a class="home-step-last small" href="${recordHref(last)}" title="Mở lại kết quả gần nhất của bước này">${icon('clock')}<span>${esc(last.title)}</span><em>${ago(last.created_at)}</em></a>` : '<span class="home-step-last small muted">Chưa có kết quả</span>'}
        <a class="btn sm" href="${href}">${icon(ic)} ${cta}</a></div>`;
    }).join('')}</div>
    <div class="${saved.length ? 'grid grid-2 home-grid' : ''}" style="margin-top:14px">
      <div class="card" data-resume></div>
      ${saved.length ? `<div class="card"><div class="card-head"><h3>${icon('bookmark')} Kênh đã lưu</h3><a class="btn sm" href="#/saved">Xem tất cả</a></div>
          ${saved.slice(0, 6).map((s) => `<div class="list-row">${s.data.avatar ? `<img src="${esc(img(s.data.avatar))}" referrerpolicy="no-referrer" style="width:30px;height:30px;border-radius:50%" alt="">` : ''}<a class="name" href="#/channel?input=${encodeURIComponent(s.data.id)}">${esc(s.title)}</a><span class="muted small">${fmt(s.data.subs)} sub${s.note ? ' · ' + esc(s.note) : ''}</span></div>`).join('')}</div>` : ''}
    </div>`;

  // Soulprint progress: what the AI features know about this channel so far.
  soulprintApi.get().then((s) => {
    const el = root.querySelector('[data-soulprint]');
    if (!el) return;
    const missing = s.readiness.checks.filter((c) => !c.ok).map((c) => c.label);
    el.innerHTML = `${icon('fingerprint')}<span><b>Soulprint ${s.readiness.done}/${s.readiness.total}</b><span class="muted small">${s.readiness.ready ? 'Hồ sơ đủ dùng: game, avatar, nỗi đau, câu định vị và pillars đã có.' : `Còn thiếu: ${esc(missing.join(', '))}`}</span></span>`;
    el.hidden = false;
  }).catch(() => {});

  // ---------- start box ----------
  const q = /** @type {HTMLInputElement} */ (root.querySelector('[data-q]'));
  /** The main button follows what is in the box (smart-input.js); the others start another screen with it as a topic. */
  function start(i = -1) {
    const text = q.value.trim();
    if (!text) return q.focus(), toast('Nhập chủ đề, link video hoặc link kênh', 'error');
    if (i < 0) {
      const r = routeInput(text, st.platform);
      return window.__go(r.path, r.params);
    }
    const [path, , , extra] = MORE[st.platform][i];
    window.__go(path, { q: text, ...extra });
  }
  function renderRoute() {
    const r = routeInput(q.value, st.platform);
    const main = r.kind === 'empty' ? routeInput('x', st.platform) : r;
    const label = { videos: 'Video Analysis', channel: 'Channel Analysis', topic: 'Topic Research', empty: 'Topic Research' }[main.kind];
    root.querySelector('[data-starts]').innerHTML = `<button class="btn primary" data-start="-1">${icon(ROUTE_ICON[main.kind])} ${label}</button>${
      main.kind === 'topic' ? MORE[st.platform].map(([, ic, l], i) => `<button class="btn" data-start="${i}">${icon(ic)} ${l}</button>`).join('') : ''}`;
    root.querySelector('[data-route]').textContent = r.kind === 'empty' ? 'Gõ chủ đề, hoặc dán link video / link kênh: app tự mở đúng màn.' : `Nhận ra: ${r.label}`;
  }
  function renderStart() {
    root.querySelectorAll('[data-platform] button').forEach((b) => {
      const on = /** @type {HTMLElement} */ (b).dataset.v === st.platform;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    q.placeholder = PLACEHOLDER[st.platform];
    renderRoute();
  }
  root.querySelector('[data-platform]').addEventListener('click', (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('button'));
    if (!b) return;
    st.platform = b.dataset.v;
    persist('home', st);
    renderStart();
    q.focus();
  });
  root.querySelector('[data-starts]').addEventListener('click', (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-start]'));
    if (b) start(Number(b.dataset.start));
  });
  q.addEventListener('keydown', (e) => e.key === 'Enter' && start());
  q.addEventListener('input', renderRoute);
  renderStart();

  // ---------- pick up where you left off: running jobs first, then the latest results of both platforms ----------
  const resume = root.querySelector('[data-resume]');
  const badge = (kind) => {
    const k = KINDS[kind];
    return k ? `<span class="badge plain home-kind">${icon(k.icon)} ${PLATFORMS[k.platform]} · ${esc(k.label)}</span>` : `<span class="badge plain">${esc(kind)}</span>`;
  };
  let running = [];
  let timer = 0;
  function renderResume() {
    const list = records.filter((r) => st.show === 'all' || KINDS[r.kind]?.platform === st.show);
    const tabs = [['all', 'Tất cả'], ...Object.entries(PLATFORMS)];
    resume.innerHTML = `<div class="card-head"><h3>${icon('clock')} Làm tiếp</h3>
        <div class="chips" data-show>${tabs.map(([k, l]) => `<button type="button" class="chip ${st.show === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${running.map((j) => {
        const p = j.progress || {};
        const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 8;
        return `<div class="list-row home-job">${badge(j.kind)}<div class="home-jobmain"><a class="name" href="#${KINDS[j.kind]?.path || '/'}">${esc(j.title)}</a>
          <div class="muted small">${j.status === 'queued' ? 'Đang chờ' : esc(p.step || 'Đang chạy')}</div><div class="bar"><i style="width:${pct}%"></i></div></div><span class="when">đang chạy</span></div>`;
      }).join('')}
      ${list.length
        ? list.slice(0, RECENT).map((r) => `<div class="list-row">${badge(r.kind)}<a class="name home-title" href="${recordHref(r)}">${esc(r.title)}</a><span class="when">${ago(r.created_at)}</span></div>`).join('')
        : running.length ? '' : emptyState('Chưa có gì', st.show === 'all' ? 'Nhập một chủ đề ở ô phía trên để bắt đầu.' : `Chưa có báo cáo ${PLATFORMS[st.show]} nào.`)}`;
  }
  resume.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-show] .chip'));
    if (!b) return;
    st.show = b.dataset.v;
    persist('home', st);
    renderResume();
  });
  async function pollJobs() {
    const had = running.length;
    running = (await jobsApi.list().catch(() => [])).filter((j) => ACTIVE.includes(j.status));
    // A job that just finished has a new result: reload the list once.
    if (had && running.length < had) records.splice(0, records.length, ...(await recordsApi.list(null, 60).catch(() => records)));
    renderResume();
    if (running.length) timer = window.setTimeout(pollJobs, 2500);
  }
  renderResume();
  pollJobs();
  return () => clearTimeout(timer);
}
