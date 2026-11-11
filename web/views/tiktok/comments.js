import { records } from '../../http/client.js';
import { esc, icon, chips, bindChips, runJob, progressCard, updateProgress, toast, store, persist, ago, emptyState } from '../../lib.js';
import { commentGroups, bindCommentGroups } from '../../components/index.js';
import { scope } from '../../dom.js';

const FORM = { videos: '', max: 300, replies: true };

export async function mount(root, params) {
  const st = store('tt-comments-form', FORM);
  if (params.videos) st.videos = params.videos;
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('message')} Comment TikTok</h1><p>Dán link video TikTok (kể cả vm.tiktok.com), mỗi dòng một link. Không lưu tên người bình luận.</p></div></div>
    <div class="card card-pad" data-form>
      <textarea class="input" rows="3" data-videos placeholder="https://www.tiktok.com/@user/video/...">${esc(st.videos)}</textarea>
      <div class="row" style="margin-top:12px"><span class="small muted">Số comment</span>${chips('max', [100, 300].map((v) => ({ v, label: String(v) })), st.max)}
        <label class="check" style="margin-left:12px"><input type="checkbox" data-replies ${st.replies ? 'checked' : ''}> Lấy cả trả lời</label></div>
      <div class="row" style="margin-top:14px"><button class="btn primary lg" data-run>${icon('message')} Lấy comment</button></div></div>
    <div data-out style="margin-top:14px"></div><div class="card" data-history style="margin-top:14px"></div>`;
  const form = root.querySelector('[data-form]');
  const out = root.querySelector('[data-out]');
  const shown = scope();
  bindChips(form, (n, v) => ((st[n] = Number(v)), persist('tt-comments-form', st)));
  form.querySelector('[data-replies]').addEventListener('change', (e) => ((st.replies = e.target.checked), persist('tt-comments-form', st)));
  form.querySelector('[data-run]').addEventListener('click', async () => {
    st.videos = form.querySelector('[data-videos]').value.trim();
    persist('tt-comments-form', st);
    if (!st.videos) return toast('Dán link TikTok', 'error');
    out.innerHTML = progressCard('Đang lấy comment TikTok');
    try {
      await runJob('tiktok_comments', st, (p) => updateProgress(out, p));
      history();
      const latest = await records.list('tiktok_comments', 1);
      if (latest[0]) show(latest[0].id);
    } catch (e) {
      out.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  });

  async function show(id) {
    const rec = await records.get(id);
    const d = rec.data;
    out.innerHTML = `<div class="card"><div class="card-pad row"><div><a href="${esc(d.video.url)}" target="_blank" rel="noopener"><b>${esc(d.video.url)}</b></a><div class="muted small">${d.comments.length} comment · ${ago(rec.created_at)}</div></div>
      <span class="spacer"></span><a class="btn sm" href="${records.exportUrl(id, 'csv')}">${icon('download')} CSV</a><a class="btn sm" href="${records.exportUrl(id, 'md')}">${icon('download')} Markdown</a></div>
      ${commentGroups(d.insight, { extraTabs: [['top', 'Like nhiều nhất', d.insight.top]] })}</div>`;
    shown.off();
    shown.add(bindCommentGroups(out));
  }
  async function history() {
    const list = await records.list('tiktok_comments', 40);
    root.querySelector('[data-history]').innerHTML = `<div class="card-head"><h3>Đã lấy</h3></div>${list.length ? list.map((r) => `<div class="list-row"><a class="name" href="#/tiktok/comments?id=${r.id}">${esc(r.title)}</a><span class="when">${ago(r.created_at)}</span><button class="icon-btn" data-del="${r.id}">${icon('trash')}</button></div>`).join('') : emptyState('Chưa lấy comment nào')}`;
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => (await records.remove(b.dataset.del), history())));
  }
  history();
  if (params.id) show(params.id);
  return () => shown.off();
}
