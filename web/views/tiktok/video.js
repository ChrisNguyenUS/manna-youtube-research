// "Phân tích video" (TikTok): paste up to 10 links → numbers, script and comments of each, side by side.
// Comments already collected anywhere in the app (Thu thập bình luận, earlier analyses, Insight) are reused when the
// dataset allows it (core/tiktok/comment-reuse.js); the form says, per video, what will happen.
import { records, tiktokCommentData } from '../../http/client.js';
import { esc, icon, runJob, watchJob, activeJob, progressCard, updateProgress, errorCallout, toast, store, persist, setUrl, bindTips, fmt, ago, emptyState } from '../../lib.js';
import { scope } from '../../dom.js';
import { videoAnalysis } from '../../components/video-analysis.js';

const KIND = 'tiktok_video_analysis';
const PATH = '/tiktok/video';
const MAX = 10;
const FORM = { videos: '', script: true, comments: 100, replies: true, reuse: true };
const TIKTOK = /^(https?:\/\/)?([a-z0-9-]+\.)*tiktok\.com\//i;
const YOUTUBE = /^(https?:\/\/)?([a-z0-9-]+\.)*(youtube\.com|youtu\.be)\//i;
const idOf = (link) => link.match(/\/(?:video|photo)\/(\d{15,25})/)?.[1] ?? (/^\d{15,25}$/.test(link) ? link : null);

/** Pasted text → valid links, duplicates (same video), YouTube links and lines that are not links. */
export function readLinks(text) {
  const seen = new Set();
  const ok = [];
  const dup = [];
  const other = [];
  const bad = [];
  const entries = String(text || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)
    .flatMap((line) => {
      const links = line.split(/\s+/).filter((t) => /^https?:\/\//i.test(t) || /^\d{15,25}$/.test(t) || TIKTOK.test(t));
      return links.length ? links : [line];
    });
  for (const raw of entries) {
    const link = raw.replace(/[?#].*$/, '');
    const key = idOf(link) ?? link;
    if (TIKTOK.test(link) || /^\d{15,25}$/.test(link)) {
      if (seen.has(key)) dup.push(raw);
      else (seen.add(key), ok.push(link));
    } else if (YOUTUBE.test(raw)) other.push(raw);
    else bad.push(raw);
  }
  return { ok, dup, other, bad };
}

/** One line per video that already has comments: what reuse will do with it. */
function reuseLine(c, st) {
  const at = c.lastSeen ? ago(c.lastSeen) : '';
  const held = `${fmt(c.parents)} comment gốc + ${fmt(c.replies)} trả lời`;
  if (!st.reuse) return `<li><span class="va-st off">Lấy mới</span>Đã có ${held} (${at}); đang tắt dùng lại nên sẽ lấy lại từ TikTok.</li>`;
  if (c.state === 'ready') return `<li><span class="va-st ok">Dùng lại</span>Đủ dữ liệu: ${held}, lấy ${at}.</li>`;
  if (c.state === 'exhausted') return `<li><span class="va-st ok">Dùng lại</span>Đã lấy hết comment gốc công khai lúc ${new Date(c.exhaustedAt).toLocaleString('vi-VN')} (TikTok không trả thêm): ${held}. Trả lời chỉ lấy tối đa 20 mỗi comment. Có thể đã có bình luận mới sau đó; bỏ tick "Dùng lại" để lấy lại.</li>`;
  const why = st.replies && !c.repliesCollected && c.parents >= st.comments ? 'chưa từng lấy trả lời' : `thiếu ${fmt(c.missing)} comment gốc so với ${st.comments}`;
  return `<li><span class="va-st more">Lấy thêm</span>Có ${held}, ${why}: sẽ thu thập lại từ TikTok.</li>`;
}

export async function mount(root, params) {
  const st = store('tt-video-form', FORM);
  if (params.videos) st.videos = params.videos;
  root.innerHTML = `
    <div class="page-head va-head"><div><h1>${icon('bars')} Phân tích video (TikTok)</h1>
      <p>Số liệu, script và bình luận của một hoặc nhiều video TikTok, đặt cạnh nhau để so. Không cần đăng nhập TikTok.</p></div></div>
    <div class="card va-form" data-form>
      <div class="va-input"><textarea class="input" data-links rows="2" placeholder="Dán link video TikTok, mỗi dòng một link (tối đa ${MAX})" aria-label="Link video">${esc(st.videos)}</textarea>
        <button type="button" class="icon-btn" data-clear title="Xoá hết" aria-label="Xoá hết link">${icon('x')}</button></div>
      <div class="cc-check" data-check aria-live="polite"></div>
      <div class="va-bar">
        <label class="check"><input type="checkbox" data-k="script" ${st.script ? 'checked' : ''}> Lấy script</label>
        <span class="va-sep"></span>
        <span class="small muted">Comment gốc mỗi video</span>
        <div class="cx-seg" role="group" aria-label="Số comment gốc mỗi video">${[[0, 'Không lấy'], [100, '100'], [300, '300']].map(([v, l]) => `<button type="button" data-comments="${v}" class="${st.comments === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label class="check" data-cm-opt><input type="checkbox" data-k="replies" ${st.replies ? 'checked' : ''}> Lấy cả trả lời</label>
        <label class="check" data-cm-opt data-tip="Video đã có đủ comment (từ Thu thập bình luận, lần phân tích trước hoặc Insight) thì dùng lại, không gọi TikTok. Thiếu thì lấy mới."><input type="checkbox" data-k="reuse" ${st.reuse ? 'checked' : ''}> Dùng lại comment đã thu thập</label>
        <span class="spacer"></span>
        <span class="muted small" data-eta></span>
        <button type="button" class="btn primary" data-run>${icon('bars')} Phân tích video</button>
      </div>
      <ul class="va-reuse" data-known></ul>
    </div>
    <div data-prog></div>
    <div data-out></div>
    <div class="card va-hist" data-history></div>`;

  const shown = scope();
  const form = /** @type {HTMLElement} */ (root.querySelector('[data-form]'));
  const linksEl = /** @type {HTMLTextAreaElement} */ (root.querySelector('[data-links]'));
  const prog = /** @type {HTMLElement} */ (root.querySelector('[data-prog]'));
  const out = /** @type {HTMLElement} */ (root.querySelector('[data-out]'));
  const runBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-run]'));
  /** @type {number|string|null} */
  let shownId = null;
  const view = videoAnalysis(out, { exportUrl: (ext, query) => records.exportUrl(shownId, ext, query) });
  shown.add(view.off);
  shown.add(bindTips(root));
  /** @type {any[]} */
  let coverage = [];

  function check() {
    const r = readLinks(linksEl.value);
    linksEl.rows = Math.min(10, Math.max(2, linksEl.value.split('\n').length));
    const parts = [];
    if (r.ok.length) parts.push(`<span class="${r.ok.length > MAX ? 'cc-bad' : 'cc-ok'}">${r.ok.length <= MAX ? icon('check') : ''} ${r.ok.length} link hợp lệ${r.ok.length > MAX ? `, thừa ${r.ok.length - MAX} (tối đa ${MAX})` : ''}</span>`);
    if (r.dup.length) parts.push(`<span class="cc-warn">${r.dup.length} link trùng, sẽ bỏ qua</span>`);
    if (r.other.length) parts.push(`<span class="cc-warn">${r.other.length} link YouTube không chạy ở màn này</span>`);
    if (r.bad.length) parts.push(`<span class="cc-bad" title="${esc(r.bad.join('\n'))}">${r.bad.length} không phải link TikTok: ${esc(r.bad.slice(0, 2).join(', '))}${r.bad.length > 2 ? '…' : ''}</span>`);
    form.querySelector('[data-check]').innerHTML = parts.join('') || '<span class="muted">Link dạng tiktok.com/@kênh/video/… hoặc link rút gọn vm.tiktok.com</span>';
    runBtn.disabled = !r.ok.length || r.ok.length > MAX;
    runBtn.innerHTML = `${icon('bars')} Phân tích ${r.ok.length && r.ok.length <= MAX ? `${r.ok.length} ` : ''}video`;
    form.querySelectorAll('[data-cm-opt]').forEach((el) => (/** @type {HTMLElement} */ (el).hidden = !st.comments));
    const reused = new Set(st.reuse ? coverage.filter((c) => c.state === 'ready' || c.state === 'exhausted').map((c) => c.videoId) : []);
    const fresh = r.ok.filter((l) => !reused.has(idOf(l))).length;
    // Same rough estimate as before: ~10 s per video page, plus comments for each video read from TikTok.
    const secs = r.ok.length * 10 + fresh * (st.comments ? (st.comments === 300 ? 25 : 10) : 0);
    form.querySelector('[data-eta]').textContent = r.ok.length && r.ok.length <= MAX ? `khoảng ${secs < 90 ? `${secs} giây` : `${Math.round(secs / 60)} phút`}` : '';
    known(r.ok);
    return r;
  }
  let knownSeq = 0;
  async function known(links) {
    const el = /** @type {HTMLElement} */ (form.querySelector('[data-known]'));
    const ids = links.map(idOf).filter(Boolean);
    const mine = ++knownSeq;
    if (!ids.length || !st.comments) return void ((el.innerHTML = ''), (coverage = []));
    const cov = await tiktokCommentData.coverage(ids, { max: st.comments, replies: st.replies }).catch(() => []);
    if (mine !== knownSeq) return;
    const changed = JSON.stringify(cov) !== JSON.stringify(coverage);
    coverage = cov;
    const none = ids.length - cov.length;
    el.innerHTML = cov.length ? `${cov.map((c) => reuseLine(c, st)).join('')}${none ? `<li><span class="va-st off">Lấy mới</span>${none} video chưa có bình luận nào được thu thập.</li>` : ''}` : '';
    if (changed) check(); // the estimate depends on which videos are reused
  }
  const save = () => persist('tt-video-form', st);
  linksEl.addEventListener('input', () => ((st.videos = linksEl.value), save(), check()));
  form.querySelector('[data-clear]').addEventListener('click', () => ((linksEl.value = ''), (st.videos = ''), save(), check(), linksEl.focus()));
  form.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-comments]'));
    if (!b) return;
    st.comments = Number(b.dataset.comments);
    form.querySelectorAll('[data-comments]').forEach((x) => x.classList.toggle('on', x === b));
    save();
    check();
  });
  form.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => {
    st[/** @type {HTMLElement} */ (el).dataset.k] = /** @type {HTMLInputElement} */ (el).checked;
    save();
    check();
  }));

  /** Show a batch being analyzed (rows appear as videos finish), then the finished result. Also used when coming back mid-run. */
  async function follow(title, job) {
    prog.innerHTML = progressCard(title);
    let last = -1;
    try {
      const res = await job(async (p) => {
        updateProgress(prog, p);
        if (p?.recordId && p.done !== last) {
          last = p.done;
          const rec = await records.get(p.recordId).catch(() => null);
          if (rec) ((shownId = rec.id), view.show(rec));
        }
      });
      prog.innerHTML = '';
      await show(res.id);
      history();
    } catch (e) {
      prog.innerHTML = errorCallout(e);
    }
  }

  function run() {
    const r = check();
    if (!r.ok.length) return toast('Dán ít nhất một link TikTok', 'error');
    if (r.ok.length > MAX) return toast(`Tối đa ${MAX} video mỗi lần`, 'error');
    const body = { videos: r.ok.join('\n'), script: st.script, comments: st.comments, replies: st.replies, reuse: st.reuse };
    shownId = null;
    out.innerHTML = '';
    follow(`Đang phân tích ${r.ok.length} video`, (onProgress) => runJob(KIND, body, onProgress));
  }
  runBtn.addEventListener('click', run);

  async function show(id) {
    const rec = await records.get(id);
    setUrl(PATH, { id: rec.id }); // a reload or a copied link opens this result again
    shownId = rec.id;
    view.show(rec);
  }

  // History: each run with its videos, script status and comment counts. Collapsible so it never crowds the work.
  const hist = { list: /** @type {any[]} */ ([]), open: store('va-hist', { open: true }).open, armed: '', limit: 5 };
  const histBox = /** @type {HTMLElement} */ (root.querySelector('[data-history]'));
  async function history() {
    hist.list = await tiktokCommentData.analyses(30).catch(() => []);
    renderHistory();
  }
  function renderHistory() {
    const rows = hist.list.slice(0, hist.limit);
    histBox.innerHTML = `<button type="button" class="va-hhead" data-htoggle aria-expanded="${hist.open}"><h3>${icon('clock')} Lần phân tích trước</h3><span class="sub">${hist.list.length}</span>${icon('chevron')}</button>
      ${hist.open ? (rows.length ? rows.map((r) => {
        const first = r.items.find((x) => !x.error) ?? r.items[0] ?? {};
        const scripts = r.items.filter((x) => x.script === true).length;
        const parents = r.items.reduce((a, x) => a + x.parents, 0);
        const replies = r.items.reduce((a, x) => a + x.replies, 0);
        return `<div class="cc-hrow ${String(shownId) === String(r.id) ? 'on' : ''}">
          ${first.cover ? `<img src="${esc(first.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.removeAttribute('src')">` : '<span class="cc-noimg"></span>'}
          <div class="cc-vtext"><a href="#${PATH}?id=${r.id}"><b>${esc(first.caption || first.url || r.title)}</b>${r.items.length > 1 ? ` <span class="muted">+${r.items.length - 1} video</span>` : ''}</a>
            <span class="muted small">${first.author ? `@${esc(first.author)} · ` : ''}${ago(r.createdAt)}</span></div>
          <span class="cc-hnums">${r.params?.script === false ? '<span class="muted">không lấy script</span>' : `script ${scripts}/${r.items.length}`} · ${r.params?.comments ? `${fmt(parents)} gốc + ${fmt(replies)} trả lời` : '<span class="muted">không lấy comment</span>'}
            ${r.failed ? ` · <span class="cc-bad">${r.failed} lỗi</span>` : ''}</span>
          <span class="cc-hacts"><a class="btn sm" href="#${PATH}?id=${r.id}">Mở lại</a>${first.url ? `<a class="btn sm" href="${esc(first.url)}" target="_blank" rel="noopener" title="Mở video gốc">${icon('ext')}</a>` : ''}
            ${hist.armed === String(r.id) ? `<button type="button" class="btn sm danger" data-del="${r.id}">Xoá hẳn?</button>` : `<button type="button" class="icon-btn" data-del="${r.id}" title="Xoá lần phân tích này">${icon('trash')}</button>`}</span></div>`;
      }).join('') + (hist.list.length > hist.limit ? `<div class="cc-more"><button type="button" class="btn sm" data-hmore>Xem thêm</button></div>` : '') : `<div class="card-pad">${emptyState('Chưa phân tích video nào')}</div>`) : ''}`;
  }
  histBox.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-htoggle]')) return void ((hist.open = !hist.open), persist('va-hist', { open: hist.open }), renderHistory());
    if (t.closest('[data-hmore]')) return void ((hist.limit += 10), renderHistory());
    const del = /** @type {HTMLElement|null} */ (t.closest('[data-del]'));
    if (!del) return;
    if (hist.armed !== del.dataset.del) return void ((hist.armed = del.dataset.del), renderHistory()); // first click only asks
    await records.remove(del.dataset.del);
    hist.armed = '';
    toast('Đã xoá lần phân tích');
    history();
  });

  check();
  history();
  if (params.id) show(params.id).catch((e) => (out.innerHTML = errorCallout(e)));
  else if (params.videos && params.run) {
    setUrl(PATH); // started once: a reload must not start it again
    run();
  } else activeJob(KIND).then((live) => live && follow(`Đang phân tích: ${live.title}`, (onProgress) => watchJob(live.id, onProgress)));
  return () => shown.off();
}
