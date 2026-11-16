// "Thu thập bình luận" (TikTok): collect public comments of one or more videos, then read them in the shared comment
// explorer. Every run is kept (history); the comments themselves live once in the shared dataset.
import { records, tiktokCommentData } from '../../http/client.js';
import { esc, icon, fmt, runJob, progressCard, updateProgress, toast, store, persist, ago, emptyState, resumeJob, errorCallout } from '../../lib.js';
import { commentExplorer } from '../../components/comment-explorer.js';
import { scope } from '../../dom.js';

const FORM = { videos: '', max: 100, replies: true };
const PER_PARENT = 20; // replies read under each comment (sources/tiktok/comments.js)
const ID = /(?:\/(?:video|photo|v)\/|^)(\d{15,25})(?:\D|$)/;
const SHORT = /^https?:\/\/(vm|vt)\.tiktok\.com\/|^https?:\/\/(www\.)?tiktok\.com\/t\//i;

/** Pasted text → valid links (with the video id when the link shows it), duplicates and lines that are not TikTok links. */
export function readLinks(text) {
  const seen = new Set();
  const ok = [];
  const dup = [];
  const bad = [];
  // One entry per line (or comma); a line of plain words is one wrong entry, not one per word.
  const entries = String(text || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)
    .flatMap((line) => {
      const links = line.split(/\s+/).filter((t) => /^https?:\/\//i.test(t) || /^\d{15,25}$/.test(t));
      return links.length ? links : [line];
    });
  for (const raw of entries) {
    const link = raw.replace(/[?#].*$/, '');
    const id = link.match(ID)?.[1] ?? null;
    const key = id ?? link;
    if (!id && !SHORT.test(link)) bad.push(raw);
    else if (seen.has(key)) dup.push(raw);
    else (seen.add(key), ok.push({ link, id }));
  }
  return { ok, dup, bad };
}

export async function mount(root, params) {
  const st = store('tt-comments-form', FORM);
  if (params.videos) st.videos = params.videos;
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('message')} Thu thập bình luận</h1><p>Lấy bình luận công khai của video TikTok rồi lọc theo câu hỏi, ý định mua, lo ngại… Không lưu tên người bình luận.</p></div><a class="btn" href="#/tiktok/5w1h">${icon('target')} Phân tích 5W1H (AI)</a></div>
    <div class="card card-pad cc-form" data-form>
      <div class="cc-input"><textarea class="input" rows="2" data-videos placeholder="Dán link video TikTok, mỗi dòng một link (kể cả vm.tiktok.com)" aria-label="Link video">${esc(st.videos)}</textarea>
        <button type="button" class="icon-btn" data-clear title="Xoá hết" aria-label="Xoá hết link">${icon('x')}</button></div>
      <div class="cc-check" data-check aria-live="polite"></div>
      <div class="cc-opts">
        <span class="small muted">Comment gốc mỗi video</span><div class="cx-seg" role="group">${[100, 300].map((n) => `<button type="button" data-max="${n}" class="${st.max === n ? 'on' : ''}">${n}</button>`).join('')}</div>
        <label class="check"><input type="checkbox" data-replies ${st.replies ? 'checked' : ''}> Lấy cả trả lời <span class="muted small">(tối đa ${PER_PARENT} trả lời mỗi comment, tính thêm ngoài số trên)</span></label>
        <span class="spacer"></span><button class="btn primary" data-run>${icon('message')} Thu thập</button>
      </div>
    </div>
    <div data-prog></div>
    <div data-out></div>
    <div class="card" data-history></div>`;
  const form = /** @type {HTMLElement} */ (root.querySelector('[data-form]'));
  const area = /** @type {HTMLTextAreaElement} */ (form.querySelector('[data-videos]'));
  const prog = /** @type {HTMLElement} */ (root.querySelector('[data-prog]'));
  const out = /** @type {HTMLElement} */ (root.querySelector('[data-out]'));
  const shown = scope();
  const save = () => persist('tt-comments-form', st);
  let checkSeq = 0;

  async function check() {
    const r = readLinks(area.value);
    const runBtn = /** @type {HTMLButtonElement} */ (form.querySelector('[data-run]'));
    runBtn.disabled = !r.ok.length;
    runBtn.innerHTML = `${icon('message')} Thu thập${r.ok.length ? ` ${r.ok.length} video` : ''}`;
    area.rows = Math.min(8, Math.max(2, area.value.split('\n').length));
    const parts = [r.ok.length ? `<span class="cc-ok">${icon('check')} ${r.ok.length} video hợp lệ</span>` : ''];
    if (r.dup.length) parts.push(`<span class="cc-warn">${r.dup.length} link trùng, sẽ bỏ qua</span>`);
    if (r.bad.length) parts.push(`<span class="cc-bad" title="${esc(r.bad.join('\n'))}">${r.bad.length} không phải link video TikTok: ${esc(r.bad.slice(0, 2).join(', '))}${r.bad.length > 2 ? '…' : ''}</span>`);
    const box = form.querySelector('[data-check]');
    box.innerHTML = parts.filter(Boolean).join('') || '<span class="muted">Link dạng tiktok.com/@kênh/video/… hoặc vm.tiktok.com/…</span>';
    // Videos already collected before: say so, with a link to read them without collecting again.
    const ids = r.ok.map((x) => x.id).filter(Boolean);
    const mine = ++checkSeq;
    if (!ids.length) return;
    const cov = await tiktokCommentData.coverage(ids).catch(() => []);
    if (mine !== checkSeq || !cov.length) return;
    box.insertAdjacentHTML('beforeend', `<span class="cc-known">${cov.length} video đã có comment: ${cov.map((c) => `<a href="#/tiktok/comments?video=${esc(c.videoId)}">${fmt(c.parents)} gốc + ${fmt(c.replies)} trả lời, ${ago(c.lastSeen)}</a>`).join(' · ')}. Thu thập lại sẽ cập nhật số tim và trả lời.</span>`);
  }
  area.addEventListener('input', () => ((st.videos = area.value), save(), check()));
  form.querySelector('[data-clear]').addEventListener('click', () => ((area.value = ''), (st.videos = ''), save(), check(), area.focus()));
  form.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-max]');
    if (!b) return;
    st.max = Number(b.dataset.max);
    save();
    form.querySelectorAll('[data-max]').forEach((x) => x.classList.toggle('on', x === b));
  });
  form.querySelector('[data-replies]').addEventListener('change', (e) => ((st.replies = /** @type {HTMLInputElement} */ (e.target).checked), save()));

  async function run() {
    const r = readLinks(area.value);
    if (!r.ok.length) return toast('Dán ít nhất một link video TikTok', 'error');
    prog.innerHTML = progressCard(`Đang thu thập bình luận ${r.ok.length} video`);
    out.innerHTML = '';
    try {
      const res = await runJob('tiktok_comments', { videos: r.ok.map((x) => x.link).join('\n'), max: st.max, replies: st.replies }, (p) => updateProgress(prog, p));
      prog.innerHTML = '';
      history();
      await showRun((res?.jobs || []).map((j) => j.id), res?.skipped || []);
    } catch (e) {
      prog.innerHTML = errorCallout(e);
    }
  }
  form.querySelector('[data-run]').addEventListener('click', run);

  /** Summary numbers of a set of comments. */
  const summary = (comments, videoCount, at, extra = '') => {
    const parents = comments.filter((c) => !c.parentId).length;
    const tagged = comments.filter((c) => (c.intents ?? []).some((k) => k !== 'other')).length;
    return `<div class="cc-sum">
      <div><span>Video</span><b>${videoCount}</b></div><div><span>Comment gốc</span><b>${fmt(parents)}</b></div><div><span>Trả lời</span><b>${fmt(comments.length - parents)}</b></div>
      <div><span>Tổng</span><b>${fmt(comments.length)}</b></div><div><span>Đã phân loại</span><b>${fmt(tagged)}</b><small>${comments.length ? Math.round((tagged / comments.length) * 100) : 0}% có ý định rõ</small></div>
      <div><span>Thu thập</span><b class="cc-when">${esc(at)}</b></div></div>${extra}`;
  };

  /** One or several "Thu thập bình luận" reports (one run) in one explorer. @param {number[]} ids @param {string[]} [skipped] */
  async function showRun(ids, skipped = []) {
    if (!ids.length) return;
    const recs = (await Promise.all(ids.map((id) => records.get(id).catch(() => null)))).filter(Boolean);
    if (!recs.length) return void (out.innerHTML = errorCallout(new Error('Không mở được lần thu thập này')));
    if (ids.length === 1) window.history.replaceState(null, '', `#/tiktok/comments?id=${ids[0]}`);
    const videos = new Map(recs.map((r) => [String(r.data.video.id), r.data.video]));
    const comments = recs.flatMap((r) => r.data.comments.map((c) => ({ ...c, videoId: String(c.videoId ?? r.data.video.id) })));
    const p = recs[0].params || {};
    const perVideo = recs.map((r) => {
      const v = r.data.video;
      const n = r.data.comments.length;
      const parents = r.data.comments.filter((c) => !c.parentId).length;
      return `<div class="cc-vrow">${v.cover ? `<img src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '<span class="cc-noimg"></span>'}
        <div class="cc-vtext"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.caption || v.url)}</a><span class="muted small">${v.author ? `@${esc(v.author)} · ` : ''}${fmt(parents)} gốc + ${fmt(n - parents)} trả lời${v.comments != null ? ` · video có ${fmt(v.comments)} bình luận` : ''}</span></div>
        <span class="cc-vacts"><a class="btn sm" href="${records.exportUrl(r.id, 'csv')}">${icon('download')} CSV</a><a class="btn sm" href="${records.exportUrl(r.id, 'md')}">${icon('download')} MD</a>
          <a class="btn sm" href="#/tiktok/video?videos=${encodeURIComponent(v.url)}">${icon('bars')} Phân tích video</a></span></div>`;
    }).join('');
    const why = `Đã chọn ${p.max ?? '?'} comment gốc mỗi video${p.replies !== false ? ` và trả lời (tối đa ${PER_PARENT} mỗi comment)` : ', không lấy trả lời'}; video ít comment hơn thì lấy hết.`;
    out.innerHTML = `<div class="card cc-run">${summary(comments, recs.length, new Date(recs[0].created_at).toLocaleString('vi-VN'), `<p class="cx-note" style="padding:0 16px">${esc(why)}${skipped.length ? ` Bỏ qua ${skipped.length} link: ${esc(skipped.join(', '))}.` : ''}</p>`)}
      <div class="cc-videos">${perVideo}</div><div data-explorer></div></div>`;
    mountExplorer(comments, videos, { title: recs.length === 1 ? recs[0].title : `${recs.length} video`, recordId: recs[0].id });
  }

  /** Every collected comment of one video (all runs, Phân tích video and Insight included). @param {string} id */
  async function showVideo(id) {
    out.innerHTML = progressCard('Đang mở bình luận đã thu thập');
    try {
      const d = await tiktokCommentData.of([id]);
      const v = d.videos[0];
      if (!v) return void (out.innerHTML = `<div class="card card-pad">${emptyState('Video này chưa có bình luận nào được thu thập')}</div>`);
      out.innerHTML = `<div class="card cc-run">${summary(d.comments, 1, `lần cuối ${ago(v.lastSeen)}`)}
        <div class="cc-videos"><div class="cc-vrow">${v.cover ? `<img src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '<span class="cc-noimg"></span>'}
          <div class="cc-vtext"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.caption || v.url)}</a><span class="muted small">${v.author ? `@${esc(v.author)} · ` : ''}gộp mọi lần thu thập, kể cả từ Phân tích video và Insight</span></div>
          <span class="cc-vacts"><button type="button" class="btn sm" data-recollect="${esc(v.url)}">${icon('refresh')} Thu thập lại</button><a class="btn sm" href="#/tiktok/video?videos=${encodeURIComponent(v.url)}">${icon('bars')} Phân tích video</a></span></div></div>
        <div data-explorer></div></div>`;
      out.querySelector('[data-recollect]')?.addEventListener('click', (e) => {
        area.value = /** @type {HTMLElement} */ (e.currentTarget).dataset.recollect;
        st.videos = area.value;
        save();
        check();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      mountExplorer(d.comments, new Map(d.videos.map((x) => [String(x.id), x])), { title: v.caption || v.url });
    } catch (e) {
      out.innerHTML = errorCallout(e);
    }
  }

  function mountExplorer(comments, videos, source) {
    shown.off();
    const el = /** @type {HTMLElement} */ (out.querySelector('[data-explorer]'));
    shown.add(commentExplorer(el, { comments, videos, mode: 'full', source }).off);
  }

  // History: each run with its video, counts and actions; repeated videos are marked.
  const hist = { all: /** @type {any[]} */ ([]), limit: 5, armed: '' };
  const histBox = /** @type {HTMLElement} */ (root.querySelector('[data-history]'));
  async function history() {
    hist.all = await tiktokCommentData.collections().catch(() => []);
    renderHistory();
  }
  function renderHistory() {
    const list = hist.all.slice(0, hist.limit);
    histBox.innerHTML = `<div class="card-head"><h3>${icon('clock')} Lịch sử thu thập</h3><span class="sub">${hist.all.length} lần</span></div>
      ${list.length ? list.map((r) => `<div class="cc-hrow">
        ${r.video.cover ? `<img src="${esc(r.video.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '<span class="cc-noimg"></span>'}
        <div class="cc-vtext"><a href="#/tiktok/comments?id=${r.id}"><b>${esc(r.video.caption || r.video.url)}</b></a>
          <span class="muted small">${r.video.author ? `@${esc(r.video.author)} · ` : ''}<a href="${esc(r.video.url)}" target="_blank" rel="noopener" class="muted">${esc(r.video.url.replace(/^https:\/\/www\./, ''))}</a></span></div>
        <span class="cc-hnums"><b>${fmt(r.parents)}</b> gốc · <b>${fmt(r.replies)}</b> trả lời${r.timesCollected > 1 ? ` <span class="badge plain" title="Video này đã thu thập ${r.timesCollected} lần">${r.timesCollected} lần</span>` : ''}</span>
        <span class="muted small cc-hwhen">${ago(r.createdAt)}</span>
        <span class="cc-hacts"><a class="btn sm" href="#/tiktok/comments?id=${r.id}">Mở</a><a class="btn sm" href="#/tiktok/video?videos=${encodeURIComponent(r.video.url)}" title="Phân tích video">${icon('bars')}</a>
          ${hist.armed === String(r.id) ? `<button type="button" class="btn sm danger" data-del="${r.id}">Xoá hẳn?</button>` : `<button type="button" class="icon-btn" data-del="${r.id}" title="Xoá lần thu thập này (bình luận vẫn còn nếu nơi khác cũng đã lấy)">${icon('trash')}</button>`}</span>
      </div>`).join('') + (hist.all.length > hist.limit ? `<div class="cc-more"><button type="button" class="btn sm" data-hmore>Xem thêm ${Math.min(10, hist.all.length - hist.limit)}</button></div>` : '') : emptyState('Chưa thu thập lần nào')}`;
  }
  histBox.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-hmore]')) return void ((hist.limit += 10), renderHistory());
    const del = /** @type {HTMLElement|null} */ (t.closest('[data-del]'));
    if (!del) return;
    if (hist.armed !== del.dataset.del) return void ((hist.armed = del.dataset.del), renderHistory()); // first click only asks
    await records.remove(del.dataset.del);
    hist.armed = '';
    toast('Đã xoá lần thu thập');
    history();
  });

  check();
  history();
  if (params.id) showRun([Number(params.id)]);
  else if (params.video) showVideo(String(params.video));
  else if (!params.videos) resumeJob('tiktok_comments', prog, () => 'Đang thu thập bình luận', async (res) => (history(), showRun((res?.jobs || []).map((j) => j.id), res?.skipped || [])));
  // Sent from another screen with links: start once (a reload or Back/Forward must not run it again).
  if (params.run && params.videos) {
    window.history.replaceState(null, '', '#/tiktok/comments');
    run();
  }
  return () => shown.off();
}
