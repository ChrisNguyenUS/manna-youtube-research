// "Phân tích video" (TikTok): paste up to 10 links → numbers, script and comments of each, side by side.
import { records, tiktokCommentData } from '../../http/client.js';
import { esc, icon, chips, bindChips, runJob, watchJob, activeJob, progressCard, updateProgress, errorCallout, toast, store, persist, setUrl, bindTips, fmt, ago } from '../../lib.js';
import { scope } from '../../dom.js';
import { historyList } from '../../components/history-list.js';
import { videoAnalysis } from '../../components/video-analysis.js';

const KIND = 'tiktok_video_analysis';
const PATH = '/tiktok/video';
const MAX = 10;
const FORM = { videos: '', script: true, comments: 100, replies: true, reuse: true };
const TIKTOK = /^(https?:\/\/)?([a-z0-9-]+\.)*tiktok\.com\//i;
const YOUTUBE = /^(https?:\/\/)?([a-z0-9-]+\.)*(youtube\.com|youtu\.be)\//i;

/** Pasted text → what each line is. Duplicates (ignoring tracking parameters) count once. */
export function readLinks(text) {
  const seen = new Set();
  const ok = [];
  const other = [];
  const bad = [];
  for (const raw of String(text || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)) {
    const link = raw.replace(/[?#].*$/, '');
    if (seen.has(link)) continue;
    seen.add(link);
    if (TIKTOK.test(link) || /^\d{15,25}$/.test(link)) ok.push(link);
    else if (YOUTUBE.test(raw)) other.push(raw);
    else bad.push(raw);
  }
  return { ok, other, bad };
}

export async function mount(root, params) {
  const st = store('tt-video-form', FORM);
  if (params.videos) st.videos = params.videos;
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('bars')} Phân tích video (TikTok)</h1>
      <p>Dán link video TikTok để lấy thông số, script (lời thoại từ phụ đề) và comment của từng video, đặt cạnh nhau để so. Không cần đăng nhập TikTok.</p></div></div>
    <div class="card card-pad" data-form>
      <div class="field"><label for="va-links">Link video, mỗi dòng một link (tối đa ${MAX})</label>
        <textarea class="input" id="va-links" data-links rows="4" placeholder="https://www.tiktok.com/@kenh/video/7376610463154572560">${esc(st.videos)}</textarea>
        <div class="help" data-check></div></div>
      <div class="row" style="margin-top:12px">
        <label class="check"><input type="checkbox" data-k="script" ${st.script ? 'checked' : ''}> Lấy script</label>
        <span class="small muted" style="margin-left:14px">Comment mỗi video</span>${chips('comments', [0, 100, 300].map((v) => ({ v, label: v ? String(v) : 'Không lấy' })), st.comments)}
        <label class="check" data-replies-wrap><input type="checkbox" data-k="replies" ${st.replies ? 'checked' : ''}> Lấy cả trả lời</label>
        <label class="check" data-reuse-wrap title="Video nào đã có đủ comment (từ Thu thập bình luận, lần phân tích trước hoặc Insight) thì dùng lại, không lấy lại từ TikTok"><input type="checkbox" data-k="reuse" ${st.reuse ? 'checked' : ''}> Dùng lại comment đã thu thập (nếu đủ)</label>
      </div>
      <div class="help small" data-known></div>
      <div class="row" style="margin-top:14px"><button type="button" class="btn primary lg" data-run>${icon('bars')} Phân tích</button><span class="muted small" data-eta></span></div>
    </div>
    <div data-prog style="margin-top:14px"></div>
    <div data-out style="margin-top:14px"></div>
    <div class="card" data-history style="margin-top:14px"></div>`;

  const shown = scope();
  const form = root.querySelector('[data-form]');
  const linksEl = /** @type {HTMLTextAreaElement} */ (root.querySelector('[data-links]'));
  const prog = /** @type {HTMLElement} */ (root.querySelector('[data-prog]'));
  const out = /** @type {HTMLElement} */ (root.querySelector('[data-out]'));
  const runBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-run]'));
  /** @type {number|string|null} */
  let shownId = null;
  const view = videoAnalysis(out, { exportUrl: (ext, query) => records.exportUrl(shownId, ext, query) });
  shown.add(view.off);
  shown.add(bindTips(out));
  const history = historyList(root.querySelector('[data-history]'), { kind: KIND, path: PATH, title: `${icon('clock')} Lần phân tích trước`, empty: 'Chưa phân tích video nào' });

  function check() {
    const r = readLinks(linksEl.value);
    const notes = [];
    if (r.other.length) notes.push(`<span class="va-warn">${r.other.length} link YouTube không chạy ở màn này.</span>`);
    if (r.bad.length) notes.push(`<span class="va-warn">Không nhận ra: ${esc(r.bad.slice(0, 3).join(', '))}${r.bad.length > 3 ? '…' : ''}</span>`);
    if (r.ok.length > MAX) notes.push(`<span class="va-warn">Đang có ${r.ok.length} link, thừa ${r.ok.length - MAX}. Tối đa ${MAX} mỗi lần.</span>`);
    root.querySelector('[data-check]').innerHTML = notes.join(' ') || (r.ok.length ? `${r.ok.length} link TikTok.` : 'Link dạng tiktok.com/@kênh/video/… hoặc link rút gọn vm.tiktok.com.');
    runBtn.disabled = !r.ok.length || r.ok.length > MAX;
    runBtn.innerHTML = `${icon('bars')} Phân tích${r.ok.length ? ` ${Math.min(r.ok.length, MAX)} video` : ''}`;
    const secs = r.ok.length * (10 + (st.comments ? (st.comments === 300 ? 25 : 10) : 0));
    root.querySelector('[data-eta]').textContent = r.ok.length ? `Dự kiến khoảng ${secs < 90 ? `${secs} giây` : `${Math.round(secs / 60)} phút`}` : '';
    /** @type {HTMLElement} */ (root.querySelector('[data-replies-wrap]')).hidden = !st.comments;
    /** @type {HTMLElement} */ (root.querySelector('[data-reuse-wrap]')).hidden = !st.comments;
    known(r.ok);
    return r;
  }
  // Which pasted videos already have comments collected (any screen): said here, reused when the box is ticked.
  let knownSeq = 0;
  async function known(links) {
    const el = /** @type {HTMLElement} */ (root.querySelector('[data-known]'));
    const ids = links.map((l) => l.match(/\/(?:video|photo)\/(\d{15,25})/)?.[1] ?? (/^\d{15,25}$/.test(l) ? l : null)).filter(Boolean);
    const mine = ++knownSeq;
    if (!ids.length || !st.comments) return void (el.innerHTML = '');
    const cov = await tiktokCommentData.coverage(ids).catch(() => []);
    if (mine !== knownSeq) return;
    el.innerHTML = cov.length ? `${cov.length} video đã có comment: ${cov.map((c) => `<a href="#/tiktok/comments?video=${esc(c.videoId)}">${fmt(c.parents)} gốc + ${fmt(c.replies)} trả lời (${ago(c.lastSeen)})</a>`).join(' · ')}. Chỉ dùng lại khi đủ ${st.comments} comment gốc hoặc đã lấy gần hết comment của video; thiếu thì lấy mới.` : '';
  }
  const save = () => persist('tt-video-form', st);
  linksEl.addEventListener('input', () => ((st.videos = linksEl.value), save(), check()));
  bindChips(form, (n, v) => ((st[n] = Number(v)), save(), check()), { toggleOff: false });
  form.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => ((st[/** @type {HTMLElement} */ (el).dataset.k] = /** @type {HTMLInputElement} */ (el).checked), save())));

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

  check();
  history();
  if (params.id) show(params.id).catch((e) => (out.innerHTML = errorCallout(e)));
  else if (params.videos && params.run) {
    setUrl(PATH); // started once: a reload must not start it again
    run();
  } else activeJob(KIND).then((live) => live && follow(`Đang phân tích: ${live.title}`, (onProgress) => watchJob(live.id, onProgress)));
  return () => shown.off();
}
