import { records as recordsApi, saved as savedApi, jobs as jobsApi } from '../http/client.js';
import { esc, icon, ago, emptyState, fmt, store, persist, toast } from '../lib.js';
import { KINDS, PLATFORMS, recordHref } from '../kinds.js';

// What the topic box starts on each platform: [screen, icon, button text, extra URL params]. The first one is what Enter does.
const STARTS = {
  tiktok: [
    ['/tiktok/topic', 'compass', 'Tìm theo chủ đề', { run: 1 }],
    ['/tiktok/insight', 'message', 'Insight khách hàng', {}],
  ],
  youtube: [
    ['/videos', 'search', 'Tìm video', { run: 1 }],
    ['/channels', 'users', 'Tìm kênh', {}],
    ['/research', 'compass', 'Nghiên cứu chủ đề', {}],
  ],
};
const PLACEHOLDER = { tiktok: 'Chủ đề trên TikTok, ví dụ: di trú mỹ, bảo lãnh vợ chồng', youtube: 'Từ khoá trên YouTube, ví dụ: kể chuyện đêm khuya' };

const STEPS = [
  ['1', 'Tìm ngách', 'Chủ đề bạn thích, làm được lâu dài. Ưu tiên kênh nhiều view nhưng ít sub, video mới trong năm có view tốt.', '#/channels', 'Tìm kênh'],
  ['2', 'Tìm format thắng', 'Format đã thắng ở lĩnh vực A, áp sang lĩnh vực B. Nội dung cũ làm lại với góc nhìn mới. Kiểm tra xem đã có ai làm chưa.', '#/ideas', 'Chấm điểm từ khoá'],
  ['3', 'Mổ xẻ video viral', 'Gom 10 video viral của đối thủ: hook, bố cục, cách kể, nhịp, CTA → thành khung kịch bản.', '#/channel', 'Phân tích kênh'],
  ['4', 'Nghe khán giả', 'Comment: họ hỏi gì, than gì, muốn xem gì tiếp → khoảng trống cho video tiếp theo.', '#/research', 'Nghiên cứu chủ đề'],
];

const ACTIVE = ['queued', 'running'];
const RECENT = 12;

export async function mount(root) {
  const st = store('home', { platform: 'tiktok', show: 'all' });
  if (!STARTS[st.platform]) st.platform = 'tiktok';
  const [records, saved] = await Promise.all([recordsApi.list(null, 60), savedApi.list('channel')]);

  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('home')} Tổng quan</h1><p>Nghiên cứu content TikTok và YouTube trên máy của bạn: miễn phí, không cần key.</p></div></div>
    <div class="card card-pad home-start">
      <div class="row"><b>Bắt đầu nghiên cứu trên</b>
        <div class="ix-seg" role="radiogroup" aria-label="Nền tảng" data-platform>${Object.entries(PLATFORMS).map(([k, l]) => `<button type="button" role="radio" data-v="${k}">${l}</button>`).join('')}</div></div>
      <div class="input-row" style="margin-top:12px"><input class="input" data-q autocomplete="off"><span class="row home-go" data-starts></span></div>
    </div>
    <div class="grid grid-2 home-grid" style="margin-top:14px">
      <div class="card" data-resume></div>
      <div>
        ${saved.length ? `<div class="card"><div class="card-head"><h3>${icon('bookmark')} Kênh đã lưu</h3><a class="btn sm" href="#/saved">Xem tất cả</a></div>
          ${saved.slice(0, 6).map((s) => `<div class="list-row">${s.data.avatar ? `<img src="${esc(s.data.avatar)}" referrerpolicy="no-referrer" style="width:30px;height:30px;border-radius:50%" alt="">` : ''}<a class="name" href="#/channel?input=${encodeURIComponent(s.data.id)}">${esc(s.title)}</a><span class="muted small">${fmt(s.data.subs)} sub${s.note ? ' · ' + esc(s.note) : ''}</span></div>`).join('')}</div>` : ''}
        <div class="card"><div class="card-head"><h3>${icon('compass')} Quy trình nghiên cứu YouTube</h3><span class="sub">theo Thanh Hải – Learn AI</span></div>
          ${STEPS.map(([n, t, d, href, cta]) => `<div class="list-row" style="align-items:flex-start"><span class="badge accent" style="margin-top:2px">${n}</span><div><b>${t}</b><div class="muted small">${d}</div></div><a class="btn sm" style="margin-left:auto;flex:none" href="${href}">${cta}</a></div>`).join('')}</div>
      </div>
    </div>`;

  // ---------- start box ----------
  const q = /** @type {HTMLInputElement} */ (root.querySelector('[data-q]'));
  function start(i = 0) {
    const [path, , label, extra] = STARTS[st.platform][i];
    const text = q.value.trim();
    if (!text) return q.focus(), toast(`Nhập chủ đề rồi bấm ${label}`, 'error');
    window.__go(path, { q: text, ...extra });
  }
  function renderStart() {
    root.querySelectorAll('[data-platform] button').forEach((b) => {
      const on = /** @type {HTMLElement} */ (b).dataset.v === st.platform;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    q.placeholder = PLACEHOLDER[st.platform];
    root.querySelector('[data-starts]').innerHTML = STARTS[st.platform].map(([, ic, label], i) => `<button class="btn ${i ? '' : 'primary'}" data-start="${i}">${icon(ic)} ${label}</button>`).join('');
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
  q.addEventListener('keydown', (e) => e.key === 'Enter' && start(0));
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
