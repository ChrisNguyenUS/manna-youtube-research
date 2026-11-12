import { records } from '../../http/client.js';
import { esc, icon, chips, bindChips, runJob, progressCard, updateProgress, toast, store, persist, fmt, ago, emptyState } from '../../lib.js';
import { tiktokVideoCard, commentGroups, bindCommentGroups, quotes, tiktokVideoFilters } from '../../components/index.js';
import { scope } from '../../dom.js';

const FORM = { keywords: '', top: 10, commentsPerVideo: 300, replies: true, keepOffTopic: false, minPlays: 0, minLikes: 0, maxAgeDays: 0, minEngagement: 0 };

export async function mount(root, params) {
  const st = store('tt-insight-form', FORM);
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('message')} Insight khách hàng (TikTok)</h1>
      <p>Comment của các video top đúng chủ đề: khách hỏi gì (theo nhóm), sợ gì, ai đang cân nhắc thuê dịch vụ, và câu chữ thật của họ. Xuất Markdown để Claude viết góc quảng cáo và hook.</p></div></div>
    <div class="card card-pad" data-form>
      <div class="field"><label>Từ khoá (tiếng Việt, cụ thể, ghi rõ nước)</label><input class="input" data-k="keywords" placeholder="VD: phỏng vấn quốc tịch, thi quốc tịch mỹ" value="${esc(st.keywords)}"></div>
      <div class="row" style="margin-top:12px"><span class="small muted">Top video</span>${chips('top', [5, 10, 20, 30].map((v) => ({ v, label: String(v) })), st.top)}
        <span class="small muted" style="margin-left:12px">Comment mỗi video</span>${chips('commentsPerVideo', [100, 300].map((v) => ({ v, label: String(v) })), st.commentsPerVideo)}</div>
      <div class="row" style="margin-top:8px"><label class="check"><input type="checkbox" data-k="replies" ${st.replies ? 'checked' : ''}> Lấy cả trả lời</label>
        <label class="check" style="margin-left:12px"><input type="checkbox" data-k="keepOffTopic" ${st.keepOffTopic ? 'checked' : ''}> Giữ cả video lạc đề</label></div>
      ${tiktokVideoFilters(st)}
      <div class="row" style="margin-top:14px"><button class="btn primary lg" data-run>${icon('doc')} Lập báo cáo</button><span class="muted small">~3–5 phút cho 10 video · miễn phí</span></div>
    </div>
    <div data-out style="margin-top:14px"></div><div class="card" data-history style="margin-top:14px"></div>`;
  const form = root.querySelector('[data-form]');
  const out = root.querySelector('[data-out]');
  const shown = scope();
  bindChips(form, (n, v) => ((st[n] = Number(v)), persist('tt-insight-form', st)));
  form.querySelectorAll('input[type=checkbox][data-k]').forEach((el) => el.addEventListener('change', () => ((st[el.dataset.k] = el.checked), persist('tt-insight-form', st))));
  form.querySelector('[data-run]').addEventListener('click', run);

  async function run() {
    st.keywords = form.querySelector('[data-k="keywords"]').value.trim();
    persist('tt-insight-form', st);
    if (!st.keywords) return toast('Nhập từ khoá', 'error');
    out.innerHTML = progressCard(`Đang lập báo cáo: ${st.keywords}`);
    try {
      const res = await runJob('tiktok_insight', st, (p) => updateProgress(out, p));
      history();
      await show(res.id);
    } catch (e) {
      out.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  }

  async function show(id) {
    const rec = await records.get(id);
    const d = rec.data;
    const g = d.insight.groupCounts;
    out.innerHTML = `
      <div class="card card-pad"><div class="row between"><div><h2 style="margin:0;font-size:18px">${esc(d.keywords.join(', '))}</h2><div class="muted small">${ago(rec.created_at)} · ${d.counts.found} video tìm được · ${d.counts.offTopic} lạc đề bỏ${d.counts.belowFilters ? ` · ${d.counts.belowFilters} dưới ngưỡng lọc` : ''}${d.failedVideos.length ? ` · ${d.failedVideos.length} video lỗi` : ''}</div></div>
        <div class="head-actions"><a class="btn sm" href="${records.exportUrl(id, 'md')}">${icon('download')} Markdown</a><a class="btn sm" href="${records.exportUrl(id, 'csv')}">${icon('download')} CSV</a></div></div></div>
      <div class="kpis" style="margin-top:14px">
        <div class="kpi"><div class="label">Video đọc comment</div><div class="value">${d.videos.length}</div></div>
        <div class="kpi"><div class="label">Comment đã đọc</div><div class="value">${fmt(d.counts.commentsRead)}</div></div>
        <div class="kpi"><div class="label">Câu hỏi</div><div class="value">${g.questions}</div></div>
        <div class="kpi"><div class="label">Lo sợ</div><div class="value">${g.fears}</div></div>
        <div class="kpi"><div class="label">${d.insight.themes ? 'Cân nhắc mua' : 'Muốn mua'}</div><div class="value">${g.buying}</div></div></div>
      ${d.insight.themes ? `<div class="card" style="margin-top:14px"><div class="card-head"><h3>Khách đang hỏi gì</h3><span class="sub">Gom theo nhóm, xếp theo số câu hỏi + tim + trả lời</span></div>
        <div class="tt-themes">${d.insight.themes.map((t) => `<div class="tt-theme"><div class="row between"><b>${esc(t.label)}</b><span class="small muted">${t.count} câu hỏi · ♥ ${fmt(t.likes)} · ↩ ${fmt(t.replies)}</span></div>${quotes(t.examples)}</div>`).join('') || emptyState('Chưa có câu hỏi')}</div></div>` : ''}
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>Khách đang nói gì</h3><span class="sub">Trích nguyên văn, không có tên người viết</span></div>
        ${commentGroups(d.insight, { extraTabs: [['top', 'Comment nổi bật', d.insight.topByAttention]] })}</div>
      ${d.insight.voiceLines ? `<div class="card" style="margin-top:14px"><div class="card-head"><h3>Câu chữ thật của khách</h3><span class="sub">Câu ngắn nguyên văn được nhiều người phản ứng: nguyên liệu cho hook</span></div>
        <div class="card-pad">${d.insight.voiceLines.map((v) => `<div class="tt-voice">“${esc(v.text)}” <span class="small muted">♥ ${fmt(v.likes)} · ↩ ${fmt(v.replies)}</span></div>`).join('') || '<span class="muted">Chưa đủ comment</span>'}</div></div>`
        : `<div class="card" style="margin-top:14px"><div class="card-head"><h3>Câu chữ thật</h3><span class="sub">Cụm từ lặp lại ≥ 3 lần: nguyên liệu cho hook</span></div>
        <div class="card-pad"><div class="chips">${(d.insight.phrases || []).map((p) => `<span class="tag">${esc(p.phrase)} · <b>${p.count}</b></span>`).join('') || '<span class="muted">Chưa đủ comment</span>'}</div></div></div>`}
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>Video hot</h3></div><div class="vgrid">${d.videos.map((v) => tiktokVideoCard(v)).join('') || emptyState('Không có')}</div></div>`;
    shown.off();
    shown.add(bindCommentGroups(out));
  }

  async function history() {
    const list = await records.list('tiktok_insight', 30);
    root.querySelector('[data-history]').innerHTML = `<div class="card-head"><h3>Báo cáo đã lập</h3></div>${list.length ? list.map((r) => `<div class="list-row"><a class="name" href="#/tiktok/insight?id=${r.id}">${esc(r.title)}</a><span class="when">${ago(r.created_at)}</span><button class="icon-btn" data-del="${r.id}" title="Xoá">${icon('trash')}</button></div>`).join('') : emptyState('Chưa có báo cáo nào')}`;
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => (await records.remove(b.dataset.del), history())));
  }
  history();
  if (params.id) show(params.id);
  return () => shown.off();
}
