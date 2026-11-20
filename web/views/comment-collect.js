// "Thu thập bình luận": one screen for TikTok and YouTube. The TikTok | YouTube switch above the page (two paths,
// /tiktok/comments and /comments, so every old link still works) changes only what differs between the platforms:
// which links are accepted, the options, and the job that collects. Reading the result (the shared comment explorer),
// "already collected" notes and the history look the same on both. Commenter names are never stored.
import { records, tiktokCommentData, youtubeCommentData } from '../http/client.js';
import { esc, icon, fmt, runJob, progressCard, updateProgress, toast, store, persist, ago, emptyState, resumeJob, errorCallout, chips, bindChips } from '../lib.js';
import { commentExplorer } from '../components/comment-explorer.js';
import { scope } from '../dom.js';
import { readLinks } from '../comment-links.js';

/** What differs per platform. Everything else on the screen is shared. */
const PLATFORMS = {
  tiktok: {
    label: 'TikTok', path: '/tiktok/comments', job: 'tiktok_comments', formKey: 'tt-comments-form',
    form: { videos: '', max: 100, replies: true },
    maxes: [100, 300], maxLabel: 'Comment gốc mỗi video', perParent: 20,
    placeholder: 'Dán link video TikTok, mỗi dòng một link (kể cả vm.tiktok.com)',
    hint: 'Link dạng tiktok.com/@kênh/video/… hoặc vm.tiktok.com/…', badLabel: 'không phải link video TikTok',
    data: tiktokCommentData,
    params: (st, links) => ({ videos: links.join('\n'), max: st.max, replies: st.replies }),
    why: (p) => `Đã chọn ${p.max ?? '?'} comment gốc mỗi video${p.replies !== false ? ' và trả lời (tối đa 20 mỗi comment)' : ', không lấy trả lời'}; video ít comment hơn thì lấy hết.`,
  },
  youtube: {
    label: 'YouTube', path: '/comments', job: 'comments', formKey: 'comments-form',
    form: { videos: '', max: 100, sort: 'top', replies: false },
    maxes: [50, 100, 300, 1000], maxLabel: 'Comment mỗi video', perParent: 10,
    placeholder: 'Dán link video YouTube, mỗi dòng một link (watch?v=…, youtu.be/…, shorts/…)',
    hint: 'Link dạng youtube.com/watch?v=…, youtu.be/… hoặc youtube.com/shorts/…', badLabel: 'không phải link video YouTube',
    data: youtubeCommentData,
    params: (st, links) => ({ videos: links.join('\n'), max: st.max, sort: st.sort, replies: st.replies }),
    why: (p) => `Đã chọn ${p.max ?? '?'} comment mỗi video, xếp ${p.sort === 'newest' ? 'mới nhất' : 'nổi bật'}${p.replies ? ', có cả trả lời (tối đa 10 mỗi comment)' : ', không lấy trả lời'}; video ít comment hơn thì lấy hết.`,
  },
};

const cover = (v) => (v?.cover ? `<img src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '<span class="cc-noimg"></span>');
const isReply = (c) => Boolean(c.parentId || c.isReply);
const by = (platform, author) => (author ? `${platform === 'tiktok' ? '@' : ''}${esc(author)} · ` : '');

export async function mount(root, params) {
  const platform = location.hash.startsWith('#/tiktok/') ? 'tiktok' : 'youtube';
  const pf = PLATFORMS[platform];
  const st = store(pf.formKey, pf.form);
  if (typeof st.replies !== 'boolean') st.replies = pf.form.replies;
  if (!pf.maxes.includes(st.max)) st.max = pf.form.max;
  // Other screens send ids (YouTube) or links, comma or newline separated.
  if (params.videos) st.videos = String(params.videos).split(/[\n,]+/).map((x) => x.trim()).filter(Boolean).map((x) => (platform === 'youtube' && /^[\w-]{11}$/.test(x) ? `https://www.youtube.com/watch?v=${x}` : x)).join('\n');
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('message')} Thu thập bình luận</h1><p>Lấy bình luận công khai của video ${pf.label} rồi lọc theo câu hỏi, ý định mua, lo ngại… Không lưu tên người bình luận.</p></div>
      <a class="btn" href="#/ci/runs?new=1" title="Customer Intelligence: phân tích comment đã thu thập thành nỗi đau, nguyên nhân và cơ hội nội dung">${icon('target')} Phân tích khách hàng (AI)</a></div>
    <div class="card card-pad cc-form" data-form>
      <div class="cc-input"><textarea class="input" rows="2" data-videos placeholder="${esc(pf.placeholder)}" aria-label="Link video">${esc(st.videos)}</textarea>
        <button type="button" class="icon-btn" data-clear title="Xoá hết" aria-label="Xoá hết link">${icon('x')}</button></div>
      <div class="cc-check" data-check aria-live="polite"></div>
      <div class="cc-opts">
        <span class="small muted">${pf.maxLabel}</span><div class="cx-seg" role="group" aria-label="${esc(pf.maxLabel)}">${pf.maxes.map((n) => `<button type="button" data-max="${n}" class="${st.max === n ? 'on' : ''}">${n.toLocaleString('vi-VN')}</button>`).join('')}</div>
        ${platform === 'youtube' ? `<span class="small muted">Xếp</span>${chips('sort', [{ v: 'top', label: 'Nổi bật' }, { v: 'newest', label: 'Mới nhất' }], st.sort)}` : ''}
        <label class="check"><input type="checkbox" data-replies ${st.replies ? 'checked' : ''}> Lấy cả trả lời <span class="muted small">(tối đa ${pf.perParent} trả lời mỗi comment, tính thêm ngoài số trên)</span></label>
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
  const save = () => persist(pf.formKey, st);
  let checkSeq = 0;

  async function check() {
    const r = readLinks(area.value, platform);
    const runBtn = /** @type {HTMLButtonElement} */ (form.querySelector('[data-run]'));
    runBtn.disabled = !r.ok.length;
    runBtn.innerHTML = `${icon('message')} Thu thập${r.ok.length ? ` ${r.ok.length} video` : ''}`;
    area.rows = Math.min(8, Math.max(2, area.value.split('\n').length));
    const parts = [r.ok.length ? `<span class="cc-ok">${icon('check')} ${r.ok.length} video hợp lệ</span>` : ''];
    if (r.dup.length) parts.push(`<span class="cc-warn">${r.dup.length} link trùng, sẽ bỏ qua</span>`);
    if (r.bad.length) parts.push(`<span class="cc-bad" title="${esc(r.bad.join('\n'))}">${r.bad.length} ${pf.badLabel}: ${esc(r.bad.slice(0, 2).join(', '))}${r.bad.length > 2 ? '…' : ''}</span>`);
    const box = form.querySelector('[data-check]');
    box.innerHTML = parts.filter(Boolean).join('') || `<span class="muted">${esc(pf.hint)}</span>`;
    // Videos already collected before: say so, with a link to read them without collecting again.
    const ids = r.ok.map((x) => x.id).filter(Boolean);
    const mine = ++checkSeq;
    if (!ids.length) return;
    const cov = await pf.data.coverage(ids).catch(() => []);
    if (mine !== checkSeq || !cov.length) return;
    box.insertAdjacentHTML('beforeend', `<span class="cc-known">${cov.length} video đã có comment: ${cov.map((c) => `<a href="#${pf.path}?video=${esc(c.videoId)}">${fmt(c.parents)} gốc + ${fmt(c.replies)} trả lời, ${ago(c.lastSeen)}</a>`).join(' · ')}. Thu thập lại sẽ cập nhật số tim và trả lời.</span>`);
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
  if (platform === 'youtube') bindChips(form, (n, v) => ((st[n] = v), save()));
  form.querySelector('[data-replies]').addEventListener('change', (e) => ((st.replies = /** @type {HTMLInputElement} */ (e.target).checked), save()));

  async function run() {
    const r = readLinks(area.value, platform);
    if (!r.ok.length) return toast(`Dán ít nhất một link video ${pf.label}`, 'error');
    prog.innerHTML = progressCard(`Đang thu thập bình luận ${r.ok.length} video`);
    out.innerHTML = '';
    try {
      const res = await runJob(pf.job, pf.params(st, r.ok.map((x) => x.link)), (p) => updateProgress(prog, p));
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
    const parents = comments.filter((c) => !isReply(c)).length;
    const tagged = comments.filter((c) => (c.intents ?? []).some((k) => k !== 'other')).length;
    return `<div class="cc-sum">
      <div><span>Video</span><b>${videoCount}</b></div><div><span>Comment gốc</span><b>${fmt(parents)}</b></div><div><span>Trả lời</span><b>${fmt(comments.length - parents)}</b></div>
      <div><span>Tổng</span><b>${fmt(comments.length)}</b></div><div><span>Đã phân loại</span><b>${fmt(tagged)}</b><small>${comments.length ? Math.round((tagged / comments.length) * 100) : 0}% có ý định rõ</small></div>
      <div><span>Thu thập</span><b class="cc-when">${esc(at)}</b></div></div>${extra}`;
  };
  const videoRow = (v, nums, acts) => `<div class="cc-vrow">${cover(v)}
    <div class="cc-vtext"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.caption || v.url)}</a><span class="muted small">${by(platform, v.author)}${nums}</span></div>
    <span class="cc-vacts">${acts}<a class="btn sm" href="#/video?videos=${encodeURIComponent(v.url)}">${icon('bars')} Phân tích video</a></span></div>`;

  /**
   * One run (one report per video) in one explorer. TikTok reads the run's own reports; YouTube reads the comments
   * of its videos (tagged by the server), so both show the same explorer. @param {number[]} ids @param {string[]} [skipped]
   */
  async function showRun(ids, skipped = []) {
    if (!ids.length) return;
    const recs = (await Promise.all(ids.map((id) => records.get(id).catch(() => null)))).filter(Boolean);
    if (!recs.length) return void (out.innerHTML = errorCallout(new Error('Không mở được lần thu thập này')));
    if (ids.length === 1) window.history.replaceState(null, '', `#${pf.path}?id=${ids[0]}`);
    let videos;
    let comments;
    if (platform === 'tiktok') {
      videos = new Map(recs.map((r) => [String(r.data.video.id), r.data.video]));
      comments = recs.flatMap((r) => r.data.comments.map((c) => ({ ...c, videoId: String(c.videoId ?? r.data.video.id) })));
    } else {
      const d = await youtubeCommentData.of(recs.map((r) => String(r.data.video.id)));
      videos = new Map(d.videos.map((v) => [String(v.id), v]));
      comments = d.comments;
    }
    const p = recs[0].params || {};
    const perVideo = recs.map((r) => {
      const v = videos.get(String(r.data.video.id)) ?? { ...r.data.video, caption: r.data.video.title ?? r.data.video.caption };
      const list = r.data.comments ?? [];
      const parents = list.filter((c) => !isReply(c)).length;
      const total = platform === 'tiktok' ? r.data.video.comments : null;
      return videoRow(v, `${fmt(parents)} gốc + ${fmt(list.length - parents)} trả lời${total != null ? ` · video có ${fmt(total)} bình luận` : ''}${r.data.disabled ? ' · <b style="color:var(--bad)">video tắt comment</b>' : ''}`,
        `<a class="btn sm" href="${records.exportUrl(r.id, 'csv')}">${icon('download')} CSV</a><a class="btn sm" href="${records.exportUrl(r.id, 'md')}">${icon('download')} MD</a>`);
    }).join('');
    const note = `${pf.why(p)}${platform === 'youtube' ? ' Danh sách bên dưới gộp mọi lần đã lấy comment của các video này.' : ''}${skipped.length ? ` Bỏ qua ${skipped.length} link: ${skipped.join(', ')}.` : ''}`;
    out.innerHTML = `<div class="card cc-run">${summary(comments, recs.length, new Date(recs[0].created_at).toLocaleString('vi-VN'), `<p class="cx-note" style="padding:0 16px">${esc(note)}</p>`)}
      <div class="cc-videos">${perVideo}</div><div data-explorer></div></div>`;
    mountExplorer(comments, videos, { title: recs.length === 1 ? recs[0].title : `${recs.length} video`, recordId: recs[0].id });
  }

  /** Every collected comment of one video (all runs, Phân tích video and Insight included). @param {string} id */
  async function showVideo(id) {
    out.innerHTML = progressCard('Đang mở bình luận đã thu thập');
    try {
      const d = await pf.data.of([id]);
      const v = d.videos[0];
      if (!v) return void (out.innerHTML = `<div class="card card-pad">${emptyState('Video này chưa có bình luận nào được thu thập')}</div>`);
      out.innerHTML = `<div class="card cc-run">${summary(d.comments, 1, `lần cuối ${ago(v.lastSeen)}`)}
        <div class="cc-videos">${videoRow(v, 'gộp mọi lần thu thập, kể cả từ Phân tích video và Insight', `<button type="button" class="btn sm" data-recollect="${esc(v.url)}">${icon('refresh')} Thu thập lại</button>`)}</div>
        <div data-explorer></div></div>`;
      out.querySelector('[data-recollect]')?.addEventListener('click', (e) => {
        area.value = /** @type {HTMLElement} */ (e.currentTarget).dataset.recollect;
        st.videos = area.value;
        save();
        check();
        root.closest('.main')?.scrollTo({ top: 0, behavior: 'smooth' });
      });
      mountExplorer(d.comments, new Map(d.videos.map((x) => [String(x.id), x])), { title: v.caption || v.url });
    } catch (e) {
      out.innerHTML = errorCallout(e);
    }
  }

  function mountExplorer(comments, videos, source) {
    shown.off();
    const el = /** @type {HTMLElement} */ (out.querySelector('[data-explorer]'));
    shown.add(commentExplorer(el, { comments, videos, mode: 'full', platform, source }).off);
  }

  // History: each run with its video, counts and actions; repeated videos are marked.
  const hist = { all: /** @type {any[]} */ ([]), limit: 5, armed: '' };
  const histBox = /** @type {HTMLElement} */ (root.querySelector('[data-history]'));
  async function history() {
    hist.all = await pf.data.collections().catch(() => []);
    renderHistory();
  }
  function renderHistory() {
    const list = hist.all.slice(0, hist.limit);
    histBox.innerHTML = `<div class="card-head"><h3>${icon('clock')} Lịch sử thu thập</h3><span class="sub">${hist.all.length} lần</span></div>
      ${list.length ? list.map((r) => `<div class="cc-hrow">${cover(r.video)}
        <div class="cc-vtext"><a href="#${pf.path}?id=${r.id}"><b>${esc(r.video.caption || r.video.url)}</b></a>
          <span class="muted small">${by(platform, r.video.author)}<a href="${esc(r.video.url)}" target="_blank" rel="noopener" class="muted">${esc(String(r.video.url).replace(/^https:\/\/www\./, ''))}</a></span></div>
        <span class="cc-hnums"><b>${fmt(r.parents)}</b> gốc · <b>${fmt(r.replies)}</b> trả lời${r.timesCollected > 1 ? ` <span class="badge plain" title="Video này đã thu thập ${r.timesCollected} lần">${r.timesCollected} lần</span>` : ''}</span>
        <span class="muted small cc-hwhen">${ago(r.createdAt)}</span>
        <span class="cc-hacts"><a class="btn sm" href="#${pf.path}?id=${r.id}">Mở</a><a class="btn sm" href="#/video?videos=${encodeURIComponent(r.video.url)}" title="Phân tích video">${icon('bars')}</a>
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
  else if (!params.videos) resumeJob(pf.job, prog, () => 'Đang thu thập bình luận', async (res) => (history(), showRun((res?.jobs || []).map((j) => j.id), res?.skipped || [])));
  // Sent from another screen with links: start once (a reload or Back/Forward must not run it again).
  if (params.run && params.videos) {
    window.history.replaceState(null, '', `#${pf.path}`);
    run();
  }
  return () => shown.off();
}
