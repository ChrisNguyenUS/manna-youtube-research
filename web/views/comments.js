import { records } from '../http/client.js';
import { historyList } from '../components/history-list.js';
import { esc, icon, chips, bindChips, runJob, progressCard, updateProgress, toast, store, persist, fmt, ago, emptyState, ytVideo, thumb, setUrl, resumeJob, errorCallout } from '../lib.js';

const FORM = { videos: '', max: 100, sort: 'top', replies: false };

export async function mount(root, params) {
  const st = store('comments-form', FORM);
  if (params.videos) st.videos = params.videos.split(',').map((id) => (id.length === 11 ? `https://www.youtube.com/watch?v=${id}` : id)).join('\n');
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('message')} Comment</h1>
      <p>Lấy comment của video bất kỳ, tự tách câu hỏi, yêu cầu ("làm phần 2 đi"), lời phàn nàn. Không lưu tên người bình luận.</p></div></div>
    <div class="card card-pad">
      <div class="field"><label>Link video (mỗi dòng một link, hoặc chọn video ở Tìm video rồi bấm Lấy comment)</label>
        <textarea class="input" data-k="videos" rows="3" placeholder="https://www.youtube.com/watch?v=...">${esc(st.videos)}</textarea></div>
      <div class="row" style="margin-top:12px"><span class="small muted">Số comment mỗi video</span>${chips('max', [{ v: 50, label: '50' }, { v: 100, label: '100' }, { v: 300, label: '300' }, { v: 1000, label: '1.000' }], st.max)}
        <span class="small muted" style="margin-left:12px">Xếp</span>${chips('sort', [{ v: 'top', label: 'Nổi bật' }, { v: 'newest', label: 'Mới nhất' }], st.sort)}
        <label class="check" style="margin-left:12px"><input type="checkbox" data-k="replies" ${st.replies ? 'checked' : ''}> Lấy cả trả lời</label></div>
      <div class="row" style="margin-top:14px"><button class="btn primary lg" data-run>${icon('message')} Lấy comment</button></div>
    </div>
    <div data-out style="margin-top:14px"></div>
    <div class="card" data-history style="margin-top:14px"></div>`;
  bindChips(root.querySelector('.card'), (n, v) => ((st[n] = n === 'max' ? Number(v) : v), persist('comments-form', st)));
  root.querySelector('[data-k="replies"]').addEventListener('change', (e) => ((st.replies = e.target.checked), persist('comments-form', st)));
  root.querySelector('[data-run]').addEventListener('click', run);
  const out = root.querySelector('[data-out]');

  async function run() {
    st.videos = root.querySelector('[data-k="videos"]').value.trim();
    persist('comments-form', st);
    if (!st.videos) return toast('Dán link video', 'error');
    out.innerHTML = progressCard('Đang lấy comment');
    try {
      await runJob('comments', st, (p) => updateProgress(out, p));
      history();
      const recs = await records.list('comments', 1);
      out.innerHTML = '';
      if (recs[0]) show(recs[0].id);
    } catch (e) {
      out.innerHTML = errorCallout(e);
    }
  }

  async function show(id) {
    const rec = await records.get(id);
    setUrl('/comments', { id: rec.id }); // a reload or a copied link opens this result again
    const d = rec.data;
    const i = d.insights;
    let tab = 'questions';
    let q = '';
    out.innerHTML = `<div class="card"><div class="card-pad row">
        <img src="${thumb(d.video.id)}" alt="" style="width:120px;border-radius:6px">
        <div><a href="${ytVideo(d.video.id)}" target="_blank" rel="noopener"><b>${esc(d.video.title)}</b></a><div class="muted small">${esc(d.video.channelTitle || '')} · ${fmt(d.video.views)} view · ${d.comments.length} comment đã lấy ${d.disabled ? '· <b style="color:var(--bad)">video tắt comment</b>' : ''} · ${ago(rec.created_at)}</div></div>
        <span class="spacer"></span><a class="btn sm" href="${records.exportUrl(id, 'csv')}">${icon('download')} CSV</a><a class="btn sm" href="${records.exportUrl(id, 'md')}">${icon('download')} Markdown</a></div>
      <div class="tabs">${[['questions', `Câu hỏi (${i.counts.questions})`], ['fears', `Lo sợ (${i.counts.fears ?? 0})`], ['buying', `Muốn mua (${i.counts.buying ?? 0})`], ['requests', `Muốn xem (${i.counts.requests})`], ['complaints', `Phàn nàn (${i.counts.complaints})`], ['top', 'Like nhiều nhất'], ['all', `Tất cả (${d.comments.length})`]].map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="card-pad"><div class="chips" style="margin-bottom:12px">${i.phrases.map((p) => `<span class="tag">${esc(p.phrase)} · <b>${p.count}</b></span>`).join('')}</div><div data-body></div></div></div>`;
    const body = out.querySelector('[data-body]');
    const render = () => {
      let list = tab === 'all' ? [...d.comments].sort((a, b) => b.likes - a.likes) : i[tab] ?? []; // records before 2026-11-11 have no fears/buying
      if (tab === 'all') {
        if (q) list = list.filter((c) => c.text.toLowerCase().includes(q));
        body.innerHTML = `<input class="input sm" data-q placeholder="Tìm trong comment" value="${esc(q)}" style="max-width:300px;margin-bottom:10px">` + quotes(list.slice(0, 400));
        const inp = body.querySelector('[data-q]');
        inp.addEventListener('input', () => {
          q = inp.value.toLowerCase();
          const pos = inp.selectionStart;
          render();
          const n = body.querySelector('[data-q]');
          n.focus();
          n.setSelectionRange(pos, pos);
        });
      } else body.innerHTML = quotes(list);
    };
    out.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      out.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
      render();
    }));
    render();
  }
  const quotes = (list) => (list.length ? list.map((c) => `<blockquote class="quote">${esc(c.text)}<div class="m">${c.likes} like · ${c.replies} trả lời · ${esc(c.published || '')}${c.isReply ? ' · trả lời' : ''}${c.hearted ? ' · ❤ chủ kênh' : ''}</div></blockquote>`).join('') : emptyState('Không có'));

  const history = historyList(root.querySelector('[data-history]'), { kind: 'comments', path: '/comments', title: 'Đã lấy', empty: 'Chưa lấy comment nào' });
  history();
  if (params.id) show(params.id);
  else if (!params.videos) resumeJob('comments', out, () => 'Đang lấy comment', async () => {
    history();
    const recs = await records.list('comments', 1);
    out.innerHTML = '';
    if (recs[0]) show(recs[0].id);
  });
}
