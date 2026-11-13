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
      const res = await runJob('tiktok_comments', st, (p) => updateProgress(out, p));
      history();
      showMany(res?.jobs || [], res?.skipped || []);
    } catch (e) {
      out.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  });

  // A multi-link job: one tab per video; the first opens right away.
  function showMany(jobs, skipped) {
    if (!jobs.length) return;
    if (jobs.length === 1 && !skipped.length) return show(jobs[0].id);
    out.innerHTML = `<div class="tabs" data-many>${jobs.map((j, i) => `<button class="tab ${i ? '' : 'on'}" data-rec="${j.id}">Video ${i + 1} (${j.count})</button>`).join('')}</div>
      ${skipped.length ? `<div class="callout" style="margin:10px 0">Bỏ qua ${skipped.length} link: ${esc(skipped.join(', '))}</div>` : ''}<div data-one></div>`;
    const tabs = out.querySelector('[data-many]');
    tabs.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-rec]');
      if (!b) return;
      tabs.querySelectorAll('[data-rec]').forEach((x) => x.classList.toggle('on', x === b));
      show(b.dataset.rec, out.querySelector('[data-one]'));
    });
    show(jobs[0].id, out.querySelector('[data-one]'));
  }

  async function show(id, target = out) {
    const rec = await records.get(id);
    const d = rec.data;
    target.innerHTML = `<div class="card"><div class="card-pad row"><div><a href="${esc(d.video.url)}" target="_blank" rel="noopener"><b>${esc(d.video.url)}</b></a><div class="muted small">${d.comments.length} comment · ${ago(rec.created_at)}${d.skipped?.length ? ` · bỏ qua ${d.skipped.length} link: ${esc(d.skipped.join(', '))}` : ''}</div></div>
      <span class="spacer"></span><a class="btn sm" href="${records.exportUrl(id, 'csv')}">${icon('download')} CSV</a><a class="btn sm" href="${records.exportUrl(id, 'md')}">${icon('download')} Markdown</a></div>
      ${commentGroups(d.insight, { extraTabs: [['top', 'Like nhiều nhất', d.insight.top]] })}</div>`;
    shown.off();
    shown.add(bindCommentGroups(target));
  }
  async function history() {
    const list = await records.list('tiktok_comments', 40);
    root.querySelector('[data-history]').innerHTML = `<div class="card-head"><h3>Đã lấy</h3></div>${list.length ? list.map((r) => `<div class="list-row"><a class="name" href="#/tiktok/comments?id=${r.id}">${esc(r.title)}</a><span class="when">${ago(r.created_at)}</span><button class="icon-btn" data-del="${r.id}">${icon('trash')}</button></div>`).join('') : emptyState('Chưa lấy comment nào')}`;
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => (await records.remove(b.dataset.del), history())));
  }
  history();
  if (params.id) show(params.id);
  // Sent from "Tìm theo chủ đề" with the ticked videos: start at once, once (a reload or Back/Forward must not run it again).
  if (params.run && params.videos) {
    window.history.replaceState(null, '', '#/tiktok/comments');
    form.querySelector('[data-run]').click();
  }
  return () => shown.off();
}
