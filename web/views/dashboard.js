import { records as recordsApi, saved as savedApi, status as statusApi } from '../http/client.js';
import { esc, icon, ago, emptyState, fmt } from '../lib.js';

const KIND = {
  research: ['Nghiên cứu', '/research', 'compass'],
  video_search: ['Tìm video', '/videos', 'search'],
  channel_search: ['Tìm kênh', '/channels', 'users'],
  channel_analysis: ['Phân tích kênh', '/channel', 'bars'],
  comments: ['Comment', '/comments', 'message'],
  idea_check: ['Chấm điểm', '/ideas', 'bulb'],
  keywords: ['Từ khoá', '/keywords', 'key'],
};

const STEPS = [
  ['1', 'Tìm ngách', 'Chủ đề bạn thích, làm được lâu dài. Ưu tiên kênh nhiều view nhưng ít sub, video mới trong năm có view tốt.', '#/channels', 'Tìm kênh'],
  ['2', 'Tìm format thắng', 'Format đã thắng ở lĩnh vực A, áp sang lĩnh vực B. Nội dung cũ làm lại với góc nhìn mới. Kiểm tra xem đã có ai làm chưa.', '#/ideas', 'Chấm điểm từ khoá'],
  ['3', 'Mổ xẻ video viral', 'Gom 10 video viral của đối thủ: hook, bố cục, cách kể, nhịp, CTA → thành khung kịch bản.', '#/channel', 'Phân tích kênh'],
  ['4', 'Nghe khán giả', 'Comment: họ hỏi gì, than gì, muốn xem gì tiếp → khoảng trống cho video tiếp theo.', '#/research', 'Nghiên cứu chủ đề'],
];

export async function mount(root) {
  const [records, saved, status] = await Promise.all([recordsApi.list(null, 12), savedApi.list('channel'), statusApi.get()]);
  const c = status.counts || {};
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('home')} Tổng quan</h1><p>Nghiên cứu YouTube trên máy của bạn: miễn phí, không cần key, dữ liệu công khai.</p></div></div>
    <div class="card card-pad"><div class="input-row">
      <input class="input" data-q placeholder="Gõ từ khoá rồi Enter để tìm video nhiều view (VD: kể chuyện đêm khuya)">
      <button class="btn primary" data-go="videos">${icon('search')} Tìm video</button><button class="btn" data-go="channels">${icon('users')} Tìm kênh</button><button class="btn" data-go="research">${icon('compass')} Nghiên cứu</button></div></div>
    <div class="kpis" style="margin-top:14px">
      <div class="kpi"><div class="label">Báo cáo chủ đề</div><div class="value">${c.research || 0}</div><div class="hint"><a href="#/research" style="color:var(--accent)">Lập báo cáo mới</a></div></div>
      <div class="kpi"><div class="label">Lần tìm video</div><div class="value">${c.video_search || 0}</div><div class="hint">${c.channel_search || 0} lần tìm kênh</div></div>
      <div class="kpi"><div class="label">Kênh đã phân tích</div><div class="value">${c.channel_analysis || 0}</div><div class="hint"><a href="#/compare" style="color:var(--accent)">So sánh kênh</a></div></div>
      <div class="kpi"><div class="label">Kênh đã lưu</div><div class="value">${saved.length}</div><div class="hint">${c.comments || 0} video đã lấy comment</div></div>
    </div>
    <div class="grid grid-2" style="margin-top:14px">
      <div class="card"><div class="card-head"><h3>Quy trình nghiên cứu</h3><span class="sub">theo Thanh Hải – Learn AI</span></div>
        ${STEPS.map(([n, t, d, href, cta]) => `<div class="list-row" style="align-items:flex-start"><span class="badge accent" style="margin-top:2px">${n}</span><div><b>${t}</b><div class="muted small">${d}</div></div><a class="btn sm" style="margin-left:auto" href="${href}">${cta}</a></div>`).join('')}</div>
      <div class="card"><div class="card-head"><h3>Gần đây</h3></div>
        ${records.length ? records.map((r) => {
          const [label, path, ic] = KIND[r.kind] || [r.kind, '/', 'doc'];
          return `<div class="list-row"><span class="badge plain">${icon(ic).replace('<svg', '<svg width="12" height="12" style="stroke:currentColor;fill:none;stroke-width:2"')} ${label}</span><a class="name" href="#${path}?id=${r.id}">${esc(r.title)}</a><span class="when">${ago(r.created_at)}</span></div>`;
        }).join('') : emptyState('Chưa có gì', 'Bắt đầu bằng ô tìm ở trên.')}</div>
    </div>
    ${saved.length ? `<div class="card" style="margin-top:14px"><div class="card-head"><h3>Kênh đã lưu</h3><a class="btn sm" href="#/saved">Xem tất cả</a></div>
      ${saved.slice(0, 8).map((s) => `<div class="list-row">${s.data.avatar ? `<img src="${esc(s.data.avatar)}" referrerpolicy="no-referrer" style="width:30px;height:30px;border-radius:50%" alt="">` : ''}<a class="name" href="#/channel?input=${encodeURIComponent(s.data.id)}">${esc(s.title)}</a><span class="muted small">${fmt(s.data.subs)} sub${s.note ? ' · ' + esc(s.note) : ''}</span></div>`).join('')}</div>` : ''}`;
  const q = root.querySelector('[data-q]');
  const go = (where) => q.value.trim() && window.__go('/' + where, where === 'research' ? {} : { q: q.value.trim(), run: 1 });
  q.addEventListener('keydown', (e) => e.key === 'Enter' && go('videos'));
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.go === 'research') {
      try { localStorage.setItem('ytr:research-form', JSON.stringify({ ...JSON.parse(localStorage.getItem('ytr:research-form') || '{}'), topic: q.value.trim() })); } catch { /* ignore */ }
      window.__go('/research');
    } else go(b.dataset.go);
  }));
}
