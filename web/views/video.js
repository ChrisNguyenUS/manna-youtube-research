// "Phân tích video": paste up to 10 links per platform → numbers, script and comments of each, side by side.
// TikTok and YouTube links share the box; each platform runs as its own job and shows its own result block.
// TikTok comments already collected anywhere in the app (Thu thập bình luận, earlier analyses, Insight) are reused when
// the dataset allows it (core/tiktok/comment-reuse.js); the form says, per video, what will happen.
import { records, tiktokCommentData } from '../http/client.js';
import { esc, icon, runJob, watchJob, activeJob, progressCard, updateProgress, errorCallout, toast, store, persist, setUrl, bindTips, fmt, ago, emptyState } from '../lib.js';
import { scope } from '../dom.js';
import { videoAnalysis } from '../components/video-analysis.js';
import { MAX_PER_PLATFORM as MAX, readVideoLinks } from '../video-links.js';

const KINDS = { tiktok: 'tiktok_video_analysis', youtube: 'video_analysis' };
const NAMES = { tiktok: 'TikTok', youtube: 'YouTube' };
const PLATFORMS = /** @type {const} */ (['tiktok', 'youtube']);
const PATH = '/video';
const FORM = { videos: '', platform: 'auto', script: true, comments: 100, replies: true, reuse: true };
const tiktokIdOf = (link) => link.match(/\/(?:video|photo)\/(\d{15,25})/)?.[1] ?? (/^\d{15,25}$/.test(link) ? link : null);

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
  const st = store('video-form', store('tt-video-form', FORM));
  if (!['auto', 'tiktok', 'youtube'].includes(st.platform)) st.platform = 'auto';
  if (params.videos) st.videos = params.videos;
  root.innerHTML = `
    <div class="page-head va-head"><div><h1>${icon('bars')} Phân tích video</h1>
      <p>Số liệu, script và bình luận của video TikTok hoặc YouTube, đặt cạnh nhau để so. Dán chung một ô; mỗi nền tảng chạy thành một lần riêng.</p></div></div>
    <div class="card va-form" data-form>
      <div class="va-input"><textarea class="input" data-links rows="2" placeholder="Dán link video TikTok hoặc YouTube, mỗi dòng một link (tối đa ${MAX} mỗi nền tảng)" aria-label="Link video">${esc(st.videos)}</textarea>
        <button type="button" class="icon-btn" data-clear title="Xoá hết" aria-label="Xoá hết link">${icon('x')}</button></div>
      <div class="cc-check" data-check aria-live="polite"></div>
      <div class="va-bar">
        <label class="small muted" for="va-plat">Nền tảng</label>
        <select class="select input" id="va-plat" data-platform style="width:auto">${[['auto', 'Tự nhận'], ['tiktok', 'TikTok'], ['youtube', 'YouTube']].map(([v, l]) => `<option value="${v}" ${st.platform === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="va-sep"></span>
        <label class="check"><input type="checkbox" data-k="script" ${st.script ? 'checked' : ''}> Lấy script</label>
        <span class="va-sep"></span>
        <span class="small muted">Comment gốc mỗi video</span>
        <div class="cx-seg" role="group" aria-label="Số comment gốc mỗi video">${[[0, 'Không lấy'], [100, '100'], [300, '300']].map(([v, l]) => `<button type="button" data-comments="${v}" class="${st.comments === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label class="check" data-cm-opt><input type="checkbox" data-k="replies" ${st.replies ? 'checked' : ''}> Lấy cả trả lời</label>
        <label class="check" data-cm-opt data-tt-opt data-tip="Video đã có đủ comment (từ Thu thập bình luận, lần phân tích trước hoặc Insight) thì dùng lại, không gọi TikTok. Thiếu thì lấy mới."><input type="checkbox" data-k="reuse" ${st.reuse ? 'checked' : ''}> Dùng lại comment đã thu thập</label>
        <span class="spacer"></span>
        <span class="muted small" data-eta></span>
        <button type="button" class="btn primary" data-run>${icon('bars')} Phân tích video</button>
      </div>
      <ul class="va-reuse" data-known></ul>
    </div>
    ${PLATFORMS.map((p) => `<section data-block="${p}" hidden><h3 class="section-label" data-block-title>${NAMES[p]}</h3><div data-prog></div><div data-out></div></section>`).join('')}
    <div class="card va-hist" data-history></div>`;

  const shown = scope();
  const form = /** @type {HTMLElement} */ (root.querySelector('[data-form]'));
  const linksEl = /** @type {HTMLTextAreaElement} */ (root.querySelector('[data-links]'));
  const runBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-run]'));
  const blocks = Object.fromEntries(PLATFORMS.map((p) => {
    const el = /** @type {HTMLElement} */ (root.querySelector(`[data-block="${p}"]`));
    const b = { el, prog: /** @type {HTMLElement} */ (el.querySelector('[data-prog]')), out: /** @type {HTMLElement} */ (el.querySelector('[data-out]')), shownId: /** @type {number|string|null} */ (null), view: /** @type {any} */ (null) };
    b.view = videoAnalysis(b.out, { exportUrl: (ext, query) => records.exportUrl(b.shownId, ext, query) });
    shown.add(b.view.off);
    return [p, b];
  }));
  /** The block titles only matter when both platforms are on screen. */
  const showBlocks = () => {
    const open = PLATFORMS.filter((p) => !blocks[p].el.hidden);
    for (const p of PLATFORMS) /** @type {HTMLElement} */ (blocks[p].el.querySelector('[data-block-title]')).hidden = open.length < 2;
  };
  shown.add(bindTips(root));
  /** @type {any[]} */
  let coverage = [];

  function check() {
    const r = readVideoLinks(linksEl.value, st.platform);
    const n = { tiktok: r.tiktok.length, youtube: r.youtube.length };
    const over = PLATFORMS.filter((p) => n[p] > MAX);
    const total = n.tiktok + n.youtube;
    linksEl.rows = Math.min(10, Math.max(2, linksEl.value.split('\n').length));
    const parts = PLATFORMS.filter((p) => n[p]).map((p) => `<span class="${n[p] > MAX ? 'cc-bad' : 'cc-ok'}">${n[p] <= MAX ? icon('check') : ''} ${n[p]} video ${NAMES[p]}${n[p] > MAX ? `, thừa ${n[p] - MAX} (tối đa ${MAX} mỗi nền tảng)` : ''}</span>`);
    if (n.tiktok && n.youtube && !over.length) parts.push('<span class="muted">chạy thành hai lần, mỗi nền tảng một kết quả</span>');
    if (r.dup.length) parts.push(`<span class="cc-warn">${r.dup.length} link trùng, sẽ bỏ qua</span>`);
    if (r.wrong.length) parts.push(`<span class="cc-warn" title="${esc(r.wrong.join('\n'))}">${r.wrong.length} link của nền tảng kia không chạy vì đang chọn ${NAMES[st.platform]}</span>`);
    if (r.bad.length) parts.push(`<span class="cc-bad" title="${esc(r.bad.join('\n'))}">${r.bad.length} dòng không phải link video: ${esc(r.bad.slice(0, 2).join(', '))}${r.bad.length > 2 ? '…' : ''}</span>`);
    form.querySelector('[data-check]').innerHTML = parts.join('') || '<span class="muted">Link TikTok (tiktok.com/@kênh/video/…, vm.tiktok.com/…) hoặc YouTube (youtube.com/watch?v=…, youtu.be/…, /shorts/…)</span>';
    runBtn.disabled = !total || over.length > 0;
    runBtn.innerHTML = `${icon('bars')} Phân tích ${total && !over.length ? `${total} ` : ''}video`;
    form.querySelectorAll('[data-cm-opt]').forEach((el) => (/** @type {HTMLElement} */ (el).hidden = !st.comments));
    form.querySelectorAll('[data-tt-opt]').forEach((el) => (/** @type {HTMLElement} */ (el).hidden = !st.comments || !n.tiktok));
    const reused = new Set(st.reuse ? coverage.filter((c) => c.state === 'ready' || c.state === 'exhausted').map((c) => c.videoId) : []);
    const fresh = r.tiktok.filter((l) => !reused.has(tiktokIdOf(l))).length;
    // Rough estimate: ~10 s per TikTok page and ~5 s per YouTube video, plus comments read from the platform.
    const cm = st.comments ? (st.comments === 300 ? 25 : 10) : 0;
    const secs = n.tiktok * 10 + fresh * cm + n.youtube * (5 + cm);
    form.querySelector('[data-eta]').textContent = total && !over.length ? `khoảng ${secs < 90 ? `${secs} giây` : `${Math.round(secs / 60)} phút`}` : '';
    known(r.tiktok);
    return r;
  }
  let knownSeq = 0;
  async function known(links) {
    const el = /** @type {HTMLElement} */ (form.querySelector('[data-known]'));
    const ids = links.map(tiktokIdOf).filter(Boolean);
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
  const save = () => persist('video-form', st);
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
  root.querySelector('[data-platform]').addEventListener('change', (e) => ((st.platform = /** @type {HTMLSelectElement} */ (e.target).value), save(), check()));
  form.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => {
    st[/** @type {HTMLElement} */ (el).dataset.k] = /** @type {HTMLInputElement} */ (el).checked;
    save();
    check();
  }));

  /** Show one platform's batch being analyzed (rows appear as videos finish), then its finished result. Also used when coming back mid-run. */
  async function follow(p, title, job) {
    const b = blocks[p];
    b.el.hidden = false;
    showBlocks();
    b.prog.innerHTML = progressCard(title);
    let last = -1;
    try {
      const res = await job(async (pr) => {
        updateProgress(b.prog, pr);
        if (pr?.recordId && pr.done !== last) {
          last = pr.done;
          const rec = await records.get(pr.recordId).catch(() => null);
          if (rec) ((b.shownId = rec.id), b.view.show(rec));
        }
      });
      b.prog.innerHTML = '';
      await show(res.id, false);
      history();
    } catch (e) {
      b.prog.innerHTML = errorCallout(e); // the other platform's block is untouched
    }
  }

  async function run() {
    const r = check();
    const todo = PLATFORMS.filter((p) => r[p].length);
    if (!todo.length) return toast('Dán ít nhất một link video TikTok hoặc YouTube', 'error');
    if (todo.some((p) => r[p].length > MAX)) return toast(`Tối đa ${MAX} video mỗi nền tảng`, 'error');
    for (const p of PLATFORMS) ((blocks[p].el.hidden = true), (blocks[p].shownId = null), (blocks[p].out.innerHTML = ''), (blocks[p].prog.innerHTML = ''));
    runBtn.disabled = true;
    // One job per platform, one after the other: a failed one shows its error and the next still runs.
    for (const p of todo) {
      const body = { videos: r[p].join('\n'), script: st.script, comments: st.comments, replies: st.replies, ...(p === 'tiktok' ? { reuse: st.reuse } : {}) };
      await follow(p, `Đang phân tích ${r[p].length} video ${NAMES[p]}`, (onProgress) => runJob(KINDS[p], body, onProgress));
    }
    check();
  }
  runBtn.addEventListener('click', run);

  /** Open a saved result in its platform's block. `alone`: opened from history or a link, so the other block is closed. */
  async function show(id, alone = true) {
    const rec = await records.get(id);
    const p = rec.data?.platform === 'youtube' ? 'youtube' : 'tiktok';
    if (alone) for (const q of PLATFORMS) if (q !== p) ((blocks[q].el.hidden = true), (blocks[q].shownId = null));
    blocks[p].el.hidden = false;
    showBlocks();
    setUrl(PATH, { id: rec.id }); // a reload or a copied link opens this result again
    blocks[p].shownId = rec.id;
    blocks[p].view.show(rec);
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
        return `<div class="cc-hrow ${PLATFORMS.some((p) => String(blocks[p].shownId) === String(r.id)) ? 'on' : ''}">
          ${first.cover ? `<img src="${esc(first.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.removeAttribute('src')">` : '<span class="cc-noimg"></span>'}
          <div class="cc-vtext"><a href="#${PATH}?id=${r.id}"><span class="tag">${NAMES[r.platform] ?? ''}</span> <b>${esc(first.caption || first.url || r.title)}</b>${r.items.length > 1 ? ` <span class="muted">+${r.items.length - 1} video</span>` : ''}</a>
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
  if (params.id) show(params.id).catch((e) => ((blocks.tiktok.el.hidden = false), showBlocks(), (blocks.tiktok.prog.innerHTML = errorCallout(e))));
  else if (params.videos && params.run) {
    setUrl(PATH); // started once: a reload must not start it again
    run();
  } else {
    for (const p of PLATFORMS) activeJob(KINDS[p]).then((live) => live && follow(p, `Đang phân tích video ${NAMES[p]}`, (onProgress) => watchJob(live.id, onProgress)));
  }
  return () => shown.off();
}
