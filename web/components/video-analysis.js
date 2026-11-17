// Result of a "Phân tích video" batch: the compare table (when there is more than one video), and under it the chosen
// video's header and its Script, Comment and Thông số tabs. Gets the record and an export-link builder; never calls
// the server. Comments use the shared comment explorer (embedded mode), never a second implementation.
import { esc, icon, fmt, full, dur, emptyState, toast, isSaved, toggleSave, metric, store, persist } from '../lib.js';
import { insightContext, commentBrowser } from './insight-workspace.js';
import { savedTikTokVideo } from '../saved-items.js';

const NOTES = { none: 'Video không có phụ đề', off: 'Không lấy script', setup: 'Chưa cài Chromium nên chưa lấy được script', changed: 'Nền tảng đã đổi giao diện, chưa đọc được script', unsupported: 'YouTube chưa lấy được lời thoại' };
const OPENING_SECONDS = 5;
const pct = (x) => (x == null ? '–' : `${(x * 100).toFixed(1).replace('.', ',')}%`);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '–');
const clock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const titleOf = (e) => e.video?.caption || e.video?.title || e.link;
const channelOf = (e) => (e.video?.author ? `@${e.video.author}` : e.video?.channelTitle || '');
const cover = (v) => (v?.cover ? `<img loading="lazy" src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.removeAttribute('src')">` : '');
const ER_TIP = 'Tương tác công khai ước tính = (thích + bình luận + chia sẻ + lưu) ÷ lượt xem. Tính từ số công khai, không phải số liệu trong TikTok Studio.';

/** Sortable columns: [key, heading, value for sorting, cell HTML, platforms, tooltip]. Missing numbers show as "–", never 0. */
const COLS = [
  ['date', 'Ngày đăng', (e) => Date.parse(e.video?.createdAt || e.video?.publishedAt || '') || 0, (e) => day(e.video?.createdAt || e.video?.publishedAt)],
  ['dur', 'Dài', (e) => e.video?.durationSec ?? -1, (e) => dur(e.video?.durationSec)],
  ['views', 'View', (e) => e.row?.views ?? -1, (e) => fmt(e.row?.views)],
  ['likes', 'Thích', (e) => e.video?.likes ?? -1, (e) => fmt(e.video?.likes)],
  ['comments', 'Bình luận', (e) => e.video?.comments ?? -1, (e) => fmt(e.video?.comments), null, 'Số bình luận TikTok báo cho video (không phải số đã đọc)'],
  ['shares', 'Chia sẻ', (e) => e.video?.shares ?? -1, (e) => fmt(e.video?.shares), 'tiktok'],
  ['saves', 'Lưu', (e) => e.video?.saves ?? -1, (e) => fmt(e.video?.saves), 'tiktok'],
  ['er', 'Tương tác', (e) => e.row?.engagementRate ?? -1, (e) => pct(e.row?.engagementRate), null, ER_TIP],
  ['vpd', 'View/ngày', (e) => e.row?.viewsPerDay ?? -1, (e) => fmt(e.row?.viewsPerDay), null, metric('viewsPerDay').formula],
  ['words', 'Số từ', (e) => e.script?.words ?? -1, (e) => (e.script ? fmt(e.script.words) : '–')],
  ['wpm', 'Từ/phút', (e) => e.script?.wpm ?? -1, (e) => e.script?.wpm ?? '–', null, metric('wordsPerMinute').formula],
  ['read', 'Cmt đã đọc', (e) => e.comments?.length ?? -1, (e) => fmt(e.comments?.length ?? 0), null, 'Comment gốc + trả lời đã đọc trong lần này'],
];
/** Hidden by default: still one click away in "Cột". */
const DEFAULT_HIDDEN = ['vpd', 'words', 'wpm', 'read'];

// Words that usually ask the viewer to act. A keyword hint near the end of the script, not a judgement of the video.
const CTA = /(?<![\p{L}\p{N}])(follow|theo dõi|đăng ký|bấm|nhấn|để lại|bình luận|comment|inbox|nhắn tin|liên hệ|link|đặt lịch|lưu lại|chia sẻ|share|subscribe|xem thêm|phần sau|phần 2)(?![\p{L}\p{N}])/iu;

/**
 * @param {HTMLElement} box
 * @param {{exportUrl: (ext: string, query?: Record<string, any>) => string}} o
 * @returns {{show: (rec: any) => void, off: () => void}} show() may be called again as more videos of the batch finish
 */
export function videoAnalysis(box, { exportUrl }) {
  /** @type {any} */
  let rec = null;
  let sel = 0; // index in rec.data.videos
  let tab = 'script';
  let sort = { key: '', dir: -1 };
  const prefs = store('va-prefs', { stamps: true, hidden: DEFAULT_HIDDEN });
  let find = '';
  /** @type {Set<number>} */
  let picked = new Set(); // selected script segments (by index)
  /** @type {null | (() => void)} */
  let offTab = null;

  const entries = () => rec?.data.videos ?? [];
  const cols = () => COLS.filter((c) => !c[4] || c[4] === rec.data.platform);
  const shownCols = () => cols().filter((c) => !prefs.hidden.includes(c[0]));

  function table() {
    const list = entries().map((e, i) => ({ e, i }));
    const col = cols().find((c) => c[0] === sort.key);
    if (col) list.sort((a, b) => (col[2](a.e) - col[2](b.e)) * sort.dir);
    const visible = shownCols();
    return `<div class="table-wrap va-wrap"><table class="t va-table"><thead><tr><th class="va-stick">Video</th>${prefs.hidden.includes('hook') ? '' : '<th>Mở đầu (5 giây đầu)</th>'}
        ${visible.map((c) => `<th class="r ${sort.key === c[0] ? 'sorted' : ''}" data-sort="${c[0]}" ${c[5] ? `data-tip="${esc(c[5])}"` : ''} role="button" tabindex="0" aria-sort="${sort.key === c[0] ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none'}">${c[1]}${sort.key === c[0] ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}
        </tr></thead><tbody>
      ${list.map(({ e, i }) => (e.error
        ? `<tr class="va-row bad ${i === sel ? 'on' : ''}" data-row="${i}" tabindex="0"><td class="va-stick"><div class="va-vid"><span class="va-cover"></span><div><b>Video ${i + 1}</b><div class="small muted">${esc(e.link)}</div></div></div></td><td colspan="${visible.length + 1}" class="va-err">${esc(e.error.message)}</td></tr>`
        : `<tr class="va-row ${i === sel ? 'on' : ''}" data-row="${i}" tabindex="0" aria-selected="${i === sel}"><td class="va-stick"><div class="va-vid"><span class="va-cover">${cover(e.video)}${e.video?.durationSec ? `<span class="va-dur">${dur(e.video.durationSec)}</span>` : ''}</span><div><b class="va-title">${esc(titleOf(e))}</b><div class="small muted">${esc(channelOf(e))}</div></div></div></td>
            ${prefs.hidden.includes('hook') ? '' : `<td class="va-hook">${e.script ? esc(e.script.hook) : `<span class="muted">${esc(NOTES[e.transcriptNote] || '–')}</span>`}</td>`}
            ${visible.map((c) => `<td class="r num">${c[3](e)}</td>`).join('')}</tr>`)).join('')}
      </tbody></table></div>`;
  }

  function colMenu() {
    const all = [['hook', 'Mở đầu'], ...cols().map((c) => [c[0], c[1]])];
    return `<details class="tc-menu va-cols"><summary class="btn sm">${icon('columns')} Cột (${all.length - prefs.hidden.filter((k) => all.some((a) => a[0] === k)).length}/${all.length})</summary>
      <div>${all.map(([k, l]) => `<label class="check"><input type="checkbox" data-col="${k}" ${prefs.hidden.includes(k) ? '' : 'checked'}> ${esc(l)}</label>`).join('')}</div></details>`;
  }

  function scriptTab(e) {
    if (!e.transcript) return `<div class="card-pad">${emptyState(NOTES[e.transcriptNote] || 'Không có script', e.transcriptNote === 'none' ? ' Video không có lời nói, hoặc TikTok chưa tạo phụ đề cho video này.' : '')}</div>`;
    const all = e.transcript.segments;
    const q = fold(find);
    const lastStart = all[all.length - 1]?.start ?? 0;
    const label = (s, i) => {
      if (s.start < OPENING_SECONDS && i < 3) return '<span class="va-lab open" title="Đoạn nằm trong 5 giây đầu video">5 giây đầu</span>';
      if (all.length > 3 && s.start >= lastStart * 0.75 && CTA.test(s.text)) return '<span class="va-lab cta" title="Gợi ý theo từ khoá (follow, bình luận, inbox…) ở phần cuối script; không phải đánh giá">Gợi ý: kêu gọi hành động</span>';
      return '';
    };
    const mark = (text) => {
      if (!q) return esc(text);
      const f = fold(text);
      let outHtml = '';
      let at = 0;
      for (let i = f.indexOf(q); i >= 0; i = f.indexOf(q, i + q.length)) {
        outHtml += `${esc(text.slice(at, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>`;
        at = i + q.length;
      }
      return outHtml + esc(text.slice(at));
    };
    const rows = all.map((s, i) => ({ s, i })).filter(({ s }) => !q || fold(s.text).includes(q));
    const step = lastStart > 120 ? 30 : lastStart > 45 ? 15 : 10;
    const marks = [];
    for (let t = 0; t <= lastStart; t += step) marks.push(t);
    return `<div class="va-tools">
        <label class="cx-search">${icon('search')}<input data-find type="search" placeholder="Tìm trong script" value="${esc(find)}" aria-label="Tìm trong script"></label>
        <label class="check"><input type="checkbox" data-stamps ${prefs.stamps ? 'checked' : ''}> Mốc thời gian</label>
        <span class="small muted va-meta">${e.transcript.kind === 'auto' ? 'Phụ đề tự động (có thể sai chữ)' : 'Phụ đề do kênh đăng'}${e.transcript.language ? ` · ${esc(e.transcript.language)}` : ''} · ${fmt(e.script.words)} từ${e.script.wpm != null ? ` · ${e.script.wpm} từ/phút` : ''}${q ? ` · ${rows.length} đoạn khớp` : ''}</span>
        <span class="spacer"></span>
        <button type="button" class="btn sm" data-copy-picked ${picked.size ? '' : 'disabled'}>${icon('doc')} Chép đoạn đã chọn${picked.size ? ` (${picked.size})` : ''}</button>
        <button type="button" class="btn sm" data-copy>${icon('doc')} Chép cả script</button></div>
      ${marks.length > 2 ? `<div class="va-marks" aria-label="Nhảy tới mốc thời gian">${marks.map((t) => `<button type="button" data-jump="${t}">${clock(t)}</button>`).join('')}</div>` : ''}
      <div class="va-script" data-script>${rows.length ? rows.map(({ s, i }) => `<div class="va-seg ${picked.has(i) ? 'on' : ''}" data-seg="${i}" data-start="${s.start}">
          ${prefs.stamps ? `<button type="button" class="va-t" data-pick="${i}" title="Chọn đoạn này">${clock(s.start)}</button>` : `<input type="checkbox" class="tt-cb" data-pick="${i}" ${picked.has(i) ? 'checked' : ''} aria-label="Chọn đoạn">`}
          <span class="va-text">${mark(s.text)}</span>${label(s, i)}
          <button type="button" class="cx-link va-copy1" data-copy-seg="${i}" title="Chép đoạn này">${icon('doc')}</button></div>`).join('') : emptyState('Không có đoạn nào khớp')}</div>
      <p class="cx-note va-note">Nhãn chỉ là gợi ý theo vị trí và từ khoá trong lời thoại, không đánh giá được cách kể hay cảm xúc của video.</p>`;
  }

  function statsTab(e) {
    const v = e.video;
    const tiktok = rec.data.platform === 'tiktok';
    const card = (l, val, tip = '') => `<div class="va-kpi" ${tip ? `data-tip="${esc(tip)}"` : ''}><span>${l}${tip ? ' ⓘ' : ''}</span><b>${val}</b></div>`;
    return `<div class="card-pad"><div class="va-kpis">
        ${card('Lượt xem', full(e.row?.views))}${card('Thích', full(v.likes))}${card('Bình luận', full(v.comments), 'Số TikTok báo cho video')}
        ${tiktok ? card('Chia sẻ', full(v.shares)) + card('Lưu', full(v.saves)) : ''}
        ${card('Tương tác công khai (ước tính)', pct(e.row?.engagementRate), ER_TIP)}
        ${card('View/ngày', fmt(e.row?.viewsPerDay), metric('viewsPerDay').formula)}${card('Thời lượng', dur(v.durationSec))}${card('Ngày đăng', day(v.createdAt || v.publishedAt))}</div>
      <div class="section-label">${tiktok ? 'Caption' : 'Mô tả'}</div><p class="va-desc">${esc(v.caption ?? v.description ?? '') || '<span class="muted">(trống)</span>'}</p>
      ${(v.hashtags ?? v.tags ?? []).length ? `<div>${(v.hashtags ?? v.tags).map((h) => `<span class="tag">${tiktok ? '#' : ''}${esc(h)}</span>`).join(' ')}</div>` : ''}
      ${v.musicTitle ? `<p class="small muted" style="margin-top:10px">Nhạc: ${esc(v.musicTitle)}</p>` : ''}</div>`;
  }

  function commentsTab(body, e) {
    if (e.commentsNote) return void (body.innerHTML = `<div class="card-pad"><div class="callout">Không lấy được bình luận của video này: ${esc(e.commentsNote)}</div></div>`);
    if (!e.comments.length) return void (body.innerHTML = `<div class="card-pad">${emptyState(rec.data.params.comments ? 'Video chưa có bình luận có chữ' : 'Chưa thu thập bình luận', rec.data.params.comments ? '' : ' Lần chạy này tắt phần bình luận. Chạy lại với 100 hoặc 300 comment gốc, hoặc mở Thu thập bình luận.')}</div>`);
    // The shared explorer, fed with this one video (no record id: saved quotes must not link to an insight report).
    const ctx = insightContext({ id: undefined, title: titleOf(e), data: { comments: e.comments, videos: [{ ...e.video, rank: sel + 1 }], keywords: [] } }, e.groups);
    const parents = e.comments.filter((c) => !c.parentId).length;
    const tagged = e.comments.filter((c) => (c.intents ?? []).some((k) => k !== 'other')).length;
    const r = e.commentsReused;
    const at = r ? new Date(r.at) : rec.data.analyzedAt ? new Date(rec.data.analyzedAt) : null;
    const read = e.comments.length;
    const head = `<div class="cx-head"><span><b>${fmt(parents)}</b> comment gốc · <b>${fmt(read - parents)}</b> trả lời · <b>${fmt(read)}</b> bản ghi · <b>${fmt(tagged)}</b> đã phân loại</span>
      <span class="muted">${r ? `<span class="cx-reused">Dùng lại dữ liệu ${r.state === 'exhausted' ? 'đã lấy hết' : 'đã thu thập'}</span> ` : ''}${at ? `lấy lúc ${at.toLocaleString('vi-VN')}` : ''}</span>
      ${e.video?.comments != null && e.video.comments > read ? `<span class="muted small" title="TikTok tính cả bình luận bị ẩn, đã xoá hoặc chưa đọc tới">TikTok báo ${fmt(e.video.comments)} bình luận; đã đọc ${fmt(read)}.</span>` : ''}</div>`;
    offTab = commentBrowser(body, ctx, { base: ctx.all, filters: ['topic'], mode: 'embedded', head, openFull: rec.data.platform === 'tiktok' ? `#/tiktok/comments?video=${encodeURIComponent(e.video.id)}` : undefined }).off;
  }

  function detail() {
    const e = entries()[sel];
    if (!e) return '';
    const n = entries().length;
    const switcher = n > 1 ? `<div class="va-switch"><button type="button" class="icon-btn" data-step="-1" ${sel === 0 ? 'disabled' : ''} aria-label="Video trước">${icon('back')}</button>
      <select class="input cx-select" data-pickvideo aria-label="Chọn video">${entries().map((x, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${i + 1}/${n} · ${esc(String(titleOf(x)).slice(0, 40))}</option>`).join('')}</select>
      <button type="button" class="icon-btn va-next" data-step="1" ${sel === n - 1 ? 'disabled' : ''} aria-label="Video sau">${icon('back')}</button></div>` : '';
    if (e.error) return `<div class="card va-detail">${switcher ? `<div class="va-dhead">${switcher}</div>` : ''}<div class="card-pad"><div class="callout">Không phân tích được video này: ${esc(e.error.message)}<div class="small" style="margin-top:6px">${esc(e.link)}</div></div></div></div>`;
    const v = e.video;
    const tiktok = rec.data.platform === 'tiktok';
    const saved = tiktok && isSaved('tiktok_video', v.id);
    const stat = (l, x) => `<div class="va-mini"><b>${x}</b><span>${l}</span></div>`;
    return `<div class="card va-detail">
      <div class="va-dhead">
        <a class="va-dcover" href="${esc(v.url)}" target="_blank" rel="noopener" title="Mở video gốc">${cover(v)}${v.durationSec ? `<span class="va-dur">${dur(v.durationSec)}</span>` : ''}</a>
        <div class="va-dinfo"><div class="va-dtitle" title="${esc(titleOf(e))}">${esc(titleOf(e))}</div>
          <div class="small muted">${esc(channelOf(e))} · đăng ${day(v.createdAt || v.publishedAt)} · dài ${dur(v.durationSec)}</div>
          <div class="va-minis">${stat('Lượt xem', fmt(e.row?.views))}${stat('Thích', fmt(v.likes))}${stat('Bình luận', fmt(v.comments))}${tiktok ? stat('Chia sẻ', fmt(v.shares)) + stat('Lưu', fmt(v.saves)) : ''}</div></div>
        <div class="va-dacts">${switcher}
          <div class="row"><a class="btn sm" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('ext')} Mở video</a>
            ${tiktok ? `<button type="button" class="btn sm ${saved ? 'on' : ''}" data-save>${icon('bookmark')} ${saved ? 'Đã lưu' : 'Lưu video'}</button>` : ''}
            <details class="tc-menu"><summary class="btn sm">${icon('download')} Xuất</summary><div><a href="${exportUrl('md', { video: sel + 1 })}">Markdown video này</a>${n > 1 ? `<a href="${exportUrl('md')}">Markdown cả ${n} video</a>` : ''}<a href="${exportUrl('csv')}">Bảng số liệu (.csv)</a></div></details></div></div>
      </div>
      <div class="tabs" role="tablist">${[['script', `Script${e.script ? ` (${e.script.segments} đoạn)` : ''}`], ['comments', `Bình luận (${fmt(e.comments.length)})`], ['stats', 'Thông số']].map(([k, l]) => `<button type="button" role="tab" class="tab ${tab === k ? 'on' : ''}" aria-selected="${tab === k}" data-vtab="${k}">${l}</button>`).join('')}</div>
      <div data-vbody></div></div>`;
  }

  function fillTab() {
    offTab?.();
    offTab = null;
    const body = /** @type {HTMLElement|null} */ (box.querySelector('[data-vbody]'));
    const e = entries()[sel];
    if (!body || !e || e.error) return;
    if (tab === 'script') body.innerHTML = scriptTab(e);
    else if (tab === 'stats') body.innerHTML = statsTab(e);
    else commentsTab(body, e);
  }

  function render() {
    offTab?.();
    offTab = null;
    if (!rec) return void (box.innerHTML = '');
    const n = entries().length;
    const ok = entries().filter((e) => !e.error).length;
    // One video: its header says everything the table would, so the table is left out.
    box.innerHTML = `${n > 1 ? `<div class="card va-compare"><div class="card-head"><h3>${icon('columns')} So sánh ${n} video</h3>
        <div class="row"><span class="small muted">${ok < n ? `${n - ok} video lỗi · ` : ''}Bấm một dòng để xem chi tiết</span>${colMenu()}
          <a class="btn sm" href="${exportUrl('md')}">${icon('download')} Markdown cả lô</a><a class="btn sm" href="${exportUrl('csv')}">${icon('download')} CSV</a><a class="btn sm" href="#/bricks?record=${esc(rec.id)}">${icon('target')} Bóc gạch</a></div></div>${table()}</div>` : ''}${detail()}`;
    fillTab();
  }

  const select = (i) => {
    sel = Math.max(0, Math.min(entries().length - 1, i));
    find = '';
    picked = new Set();
    render();
    box.querySelector('.va-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Đã chép ${what}`);
    } catch {
      toast('Trình duyệt không cho chép, thử lại', 'error');
    }
  };
  const segText = (s) => (prefs.stamps ? `[${clock(s.start)}] ${s.text}` : s.text);

  const onClick = async (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target);
    const sortBy = /** @type {HTMLElement|null} */ (t.closest('[data-sort]'));
    if (sortBy) {
      const key = String(sortBy.dataset.sort);
      sort = { key, dir: sort.key === key ? -sort.dir : -1 };
      return render();
    }
    const row = /** @type {HTMLElement|null} */ (t.closest('[data-row]'));
    if (row && !t.closest('a')) return select(Number(row.dataset.row));
    const stepBtn = /** @type {HTMLElement|null} */ (t.closest('[data-step]'));
    if (stepBtn) return select(sel + Number(stepBtn.dataset.step));
    const vt = /** @type {HTMLElement|null} */ (t.closest('[data-vtab]'));
    if (vt) {
      tab = String(vt.dataset.vtab);
      box.querySelectorAll('[data-vtab]').forEach((b) => (b.classList.toggle('on', b === vt), b.setAttribute('aria-selected', String(b === vt))));
      return fillTab();
    }
    const e = entries()[sel];
    const pick = /** @type {HTMLElement|null} */ (t.closest('[data-pick]'));
    if (pick && pick.tagName === 'BUTTON') {
      const i = Number(pick.dataset.pick);
      picked.has(i) ? picked.delete(i) : picked.add(i);
      return fillTab();
    }
    const jump = /** @type {HTMLElement|null} */ (t.closest('[data-jump]'));
    if (jump) {
      const at = Number(jump.dataset.jump);
      const segs = [...box.querySelectorAll('[data-seg]')];
      const target = /** @type {HTMLElement|undefined} */ (segs.find((s) => Number(/** @type {HTMLElement} */ (s).dataset.start) >= at) ?? segs[segs.length - 1]);
      if (target) {
        const list = /** @type {HTMLElement} */ (box.querySelector('[data-script]'));
        list.scrollTo({ top: target.offsetTop - list.offsetTop, behavior: 'smooth' });
        target.classList.add('flash');
        setTimeout(() => target.classList.remove('flash'), 1200);
      }
      return;
    }
    const one = /** @type {HTMLElement|null} */ (t.closest('[data-copy-seg]'));
    if (one && e?.transcript) return copy(segText(e.transcript.segments[Number(one.dataset.copySeg)]), 'đoạn script');
    if (t.closest('[data-copy-picked]') && e?.transcript) return copy([...picked].sort((a, b) => a - b).map((i) => segText(e.transcript.segments[i])).join('\n'), `${picked.size} đoạn`);
    if (t.closest('[data-copy]') && e?.transcript) return copy(e.transcript.segments.map(segText).join('\n'), `script (${e.script.words} từ)`);
    if (t.closest('[data-save]') && e?.video) {
      const it = savedTikTokVideo(e.video);
      await toggleSave('tiktok_video', it.ref, it.title, it.data);
      render();
    }
  };
  const onInput = (ev) => {
    const t = /** @type {HTMLInputElement} */ (ev.target);
    if (t.matches('[data-find]')) {
      find = t.value;
      const at = t.selectionStart;
      fillTab();
      const again = /** @type {HTMLInputElement|null} */ (box.querySelector('[data-find]'));
      again?.focus();
      if (again && at != null) again.setSelectionRange(at, at);
    }
  };
  const onChange = (ev) => {
    const t = /** @type {HTMLInputElement} */ (ev.target);
    if (t.matches('[data-stamps]')) {
      prefs.stamps = t.checked;
      persist('va-prefs', prefs);
      fillTab();
    } else if (t.matches('[data-pick]')) {
      const i = Number(t.dataset.pick);
      t.checked ? picked.add(i) : picked.delete(i);
      fillTab();
    } else if (t.matches('[data-col]')) {
      const k = String(t.dataset.col);
      prefs.hidden = t.checked ? prefs.hidden.filter((x) => x !== k) : [...prefs.hidden, k];
      persist('va-prefs', prefs);
      const open = !!box.querySelector('.va-cols[open]');
      render();
      if (open) box.querySelector('.va-cols')?.setAttribute('open', '');
    } else if (t.matches('[data-pickvideo]')) select(Number(t.value));
  };
  const onKey = (ev) => {
    const th = /** @type {HTMLElement} */ (ev.target).closest?.('[data-sort], [data-row]');
    if (th && (ev.key === 'Enter' || ev.key === ' ')) (ev.preventDefault(), /** @type {HTMLElement} */ (th).click());
  };
  box.addEventListener('click', onClick);
  box.addEventListener('input', onInput);
  box.addEventListener('change', onChange);
  box.addEventListener('keydown', onKey);

  return {
    show(r) {
      const first = !rec;
      rec = r;
      if (first) sel = Math.max(0, entries().findIndex((e) => !e.error));
      sel = Math.min(sel, Math.max(0, entries().length - 1));
      render();
    },
    off() {
      offTab?.();
      box.removeEventListener('click', onClick);
      box.removeEventListener('input', onInput);
      box.removeEventListener('change', onChange);
      box.removeEventListener('keydown', onKey);
    },
  };
}
