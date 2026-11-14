// Result of a "Phân tích video" batch: the compare table on top, and under it the chosen video's
// script, comments and numbers. Gets the record and an export-link builder; never calls the server.
import { esc, icon, fmt, dur, emptyState, toast, isSaved, toggleSave, metric } from '../lib.js';
import { insightContext, commentBrowser } from './insight-workspace.js';
import { savedTikTokVideo } from '../saved-items.js';

const NOTES = { none: 'Video không có phụ đề', off: 'Không lấy script', setup: 'Chưa cài Chromium nên chưa lấy được script', changed: 'Nền tảng đã đổi giao diện, chưa đọc được script' };
const HOOK_SECONDS = 5;
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
const cover = (v) => (v?.cover ? `<img loading="lazy" src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '');

/** Sortable columns: [key, heading, value for sorting, cell HTML, platforms]. */
const COLS = [
  ['date', 'Đăng', (e) => Date.parse(e.video?.createdAt || e.video?.publishedAt || '') || 0, (e) => day(e.video?.createdAt || e.video?.publishedAt)],
  ['dur', 'Dài', (e) => e.video?.durationSec ?? -1, (e) => dur(e.video?.durationSec)],
  ['views', 'View', (e) => e.row?.views ?? -1, (e) => fmt(e.row?.views)],
  ['likes', 'Like', (e) => e.video?.likes ?? -1, (e) => fmt(e.video?.likes)],
  ['comments', 'Comment', (e) => e.video?.comments ?? -1, (e) => fmt(e.video?.comments)],
  ['shares', 'Share', (e) => e.video?.shares ?? -1, (e) => fmt(e.video?.shares), 'tiktok'],
  ['saves', 'Save', (e) => e.video?.saves ?? -1, (e) => fmt(e.video?.saves), 'tiktok'],
  ['er', 'Tương tác', (e) => e.row?.engagementRate ?? -1, (e) => pct(e.row?.engagementRate)],
  ['vpd', 'View/ngày', (e) => e.row?.viewsPerDay ?? -1, (e) => fmt(e.row?.viewsPerDay)],
  ['words', 'Số từ', (e) => e.script?.words ?? -1, (e) => (e.script ? fmt(e.script.words) : '–')],
  ['wpm', 'Từ/phút', (e) => e.script?.wpm ?? -1, (e) => e.script?.wpm ?? '–'],
  ['read', 'Cmt đã đọc', (e) => e.comments?.length ?? -1, (e) => fmt(e.comments?.length ?? 0)],
];
const TIPS = { er: 'engagementRate', vpd: 'viewsPerDay', wpm: 'wordsPerMinute' };

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
  let stamps = true;
  let find = '';
  /** @type {null | (() => void)} */
  let offTab = null;

  const entries = () => rec?.data.videos ?? [];
  const cols = () => COLS.filter((c) => !c[4] || c[4] === rec.data.platform);

  function table() {
    const list = entries().map((e, i) => ({ e, i }));
    const col = cols().find((c) => c[0] === sort.key);
    if (col) list.sort((a, b) => (col[2](a.e) - col[2](b.e)) * sort.dir);
    return `<div class="table-wrap"><table class="t va-table"><thead><tr><th>Video</th><th>Mở đầu</th>
        ${cols().map((c) => `<th class="r ${sort.key === c[0] ? 'sorted' : ''}" data-sort="${c[0]}" ${TIPS[c[0]] ? `data-tip="${esc(metric(TIPS[c[0]]).formula)}"` : ''} role="button" tabindex="0">${c[1]}${sort.key === c[0] ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}
        </tr></thead><tbody>
      ${list.map(({ e, i }) => (e.error
        ? `<tr class="va-row bad ${i === sel ? 'on' : ''}" data-row="${i}"><td><div class="va-vid"><span class="va-cover"></span><div><b>Video ${i + 1}</b><div class="small muted">${esc(e.link)}</div></div></div></td><td colspan="${cols().length + 1}" class="va-err">${esc(e.error.message)}</td></tr>`
        : `<tr class="va-row ${i === sel ? 'on' : ''}" data-row="${i}"><td><div class="va-vid"><span class="va-cover">${cover(e.video)}</span><div><b class="va-title">${esc(titleOf(e))}</b><div class="small muted">${esc(channelOf(e))}</div></div></div></td>
            <td class="va-hook">${e.script ? esc(e.script.hook) : `<span class="muted">${esc(NOTES[e.transcriptNote] || '–')}</span>`}</td>
            ${cols().map((c) => `<td class="r num">${c[3](e)}</td>`).join('')}</tr>`)).join('')}
      </tbody></table></div>`;
  }

  function scriptTab(e) {
    if (!e.transcript) return `<div class="card-pad">${emptyState(NOTES[e.transcriptNote] || 'Không có script', e.transcriptNote === 'none' ? 'Video không có lời nói, hoặc nền tảng chưa tạo phụ đề cho video này.' : '')}</div>`;
    const q = fold(find);
    const segs = e.transcript.segments.filter((s) => !q || fold(s.text).includes(q));
    return `<div class="va-tools"><label class="tt-searchmini">${icon('search')}<input data-find placeholder="Tìm trong script" value="${esc(find)}"></label>
        <label class="check"><input type="checkbox" data-stamps ${stamps ? 'checked' : ''}> Hiện mốc thời gian</label><span class="spacer"></span>
        <span class="small muted">${e.transcript.kind === 'auto' ? 'Phụ đề tự động, có thể sai chữ' : 'Phụ đề do kênh đăng'}${e.transcript.language ? ` · ${esc(e.transcript.language)}` : ''} · ${fmt(e.script.words)} từ${e.script.wpm != null ? ` · ${e.script.wpm} từ/phút` : ''}</span>
        <button type="button" class="btn sm" data-copy>${icon('doc')} Chép script</button></div>
      <div class="va-script">${segs.length ? segs.map((s) => `<div class="va-seg ${s.start < HOOK_SECONDS ? 'hook' : ''}">${stamps ? `<span class="va-t">${clock(s.start)}</span>` : ''}<span>${esc(s.text)}</span>${s.start < HOOK_SECONDS && s === e.transcript.segments[0] ? '<span class="tag">Mở đầu</span>' : ''}</div>`).join('') : emptyState('Không có đoạn nào khớp')}</div>`;
  }

  function statsTab(e) {
    const v = e.video;
    const stat = (l, val) => `<div class="tt-dr-stat"><div class="l">${l}</div><div class="v">${val}</div></div>`;
    const tiktok = rec.data.platform === 'tiktok';
    return `<div class="card-pad"><div class="tt-dr-stats">
        ${stat('Lượt xem', fmt(e.row?.views))}${stat('Like', fmt(v.likes))}${stat('Comment', fmt(v.comments))}${tiktok ? stat('Share', fmt(v.shares)) + stat('Save', fmt(v.saves)) : ''}
        ${stat('Tỉ lệ tương tác', pct(e.row?.engagementRate))}${stat('View/ngày', fmt(e.row?.viewsPerDay))}${stat('Đăng', day(v.createdAt || v.publishedAt))}${stat('Độ dài', dur(v.durationSec))}</div>
      <div class="section-label">${tiktok ? 'Caption' : 'Mô tả'}</div><p class="va-desc">${esc(v.caption ?? v.description ?? '') || '<span class="muted">(trống)</span>'}</p>
      ${(v.hashtags ?? v.tags ?? []).length ? `<div>${(v.hashtags ?? v.tags).map((h) => `<span class="tag">${tiktok ? '#' : ''}${esc(h)}</span>`).join(' ')}</div>` : ''}
      ${v.musicTitle ? `<p class="small muted" style="margin-top:10px">Nhạc: ${esc(v.musicTitle)}</p>` : ''}</div>`;
  }

  function commentsTab(body, e) {
    if (e.commentsNote) return void (body.innerHTML = `<div class="card-pad"><div class="callout">Không lấy được comment của video này: ${esc(e.commentsNote)}</div></div>`);
    if (!e.comments.length) return void (body.innerHTML = `<div class="card-pad">${emptyState('Chưa đọc comment nào', rec.data.params.comments ? 'Video chưa có comment có chữ.' : 'Lần chạy này tắt phần comment.')}</div>`);
    // The comment browser of the insight report, fed with this one video (no record id: saved quotes must not link to an insight report).
    const ctx = insightContext({ id: undefined, title: titleOf(e), data: { comments: e.comments, videos: [{ ...e.video, rank: sel + 1 }], keywords: [] } }, e.groups);
    offTab = commentBrowser(body, ctx, { base: ctx.all, filters: ['topic'] }).off;
  }

  function detail() {
    const e = entries()[sel];
    if (!e) return '';
    if (e.error) return `<div class="card" style="margin-top:14px"><div class="card-pad"><div class="callout">Không phân tích được video này: ${esc(e.error.message)}<div class="small" style="margin-top:6px">${esc(e.link)}</div></div></div></div>`;
    const saved = rec.data.platform === 'tiktok' && isSaved('tiktok_video', e.video.id);
    return `<div class="card va-detail" style="margin-top:14px"><div class="card-head"><h3>${icon('play')} <span class="va-dtitle">${sel + 1}. ${esc(titleOf(e))}</span></h3>
        <div class="row"><a class="btn sm" href="${esc(e.video.url)}" target="_blank" rel="noopener">${icon('ext')} Mở video</a>
          ${rec.data.platform === 'tiktok' ? `<button type="button" class="btn sm ${saved ? 'on' : ''}" data-save>${icon('bookmark')} ${saved ? 'Đã lưu' : 'Lưu video'}</button>` : ''}
          <a class="btn sm" href="${exportUrl('md', { video: sel + 1 })}">${icon('download')} Markdown video này</a></div></div>
      <div class="tabs" role="tablist">${[['script', 'Script'], ['comments', `Comment (${e.comments.length})`], ['stats', 'Thông số']].map(([k, l]) => `<button type="button" role="tab" class="tab ${tab === k ? 'on' : ''}" aria-selected="${tab === k}" data-vtab="${k}">${l}</button>`).join('')}</div>
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
    const ok = entries().filter((e) => !e.error).length;
    box.innerHTML = `<div class="card"><div class="card-head"><h3>${icon('columns')} So sánh ${entries().length} video</h3>
        <div class="row"><span class="small muted">${ok < entries().length ? `${entries().length - ok} video lỗi · ` : ''}Bấm một dòng để xem chi tiết</span>
          <a class="btn sm" href="${exportUrl('md')}">${icon('download')} Markdown cả lô</a><a class="btn sm" href="${exportUrl('csv')}">${icon('download')} CSV</a></div></div>${table()}</div>${detail()}`;
    fillTab();
  }

  const onClick = async (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target);
    const sortBy = /** @type {HTMLElement|null} */ (t.closest('[data-sort]'));
    if (sortBy) {
      const key = String(sortBy.dataset.sort);
      const keep = entries()[sel];
      sort = { key, dir: sort.key === key ? -sort.dir : -1 };
      sel = Math.max(0, entries().indexOf(keep));
      return render();
    }
    const row = /** @type {HTMLElement|null} */ (t.closest('[data-row]'));
    if (row && !t.closest('a')) {
      sel = Number(row.dataset.row);
      find = '';
      return render();
    }
    const vt = /** @type {HTMLElement|null} */ (t.closest('[data-vtab]'));
    if (vt) {
      tab = String(vt.dataset.vtab);
      box.querySelectorAll('[data-vtab]').forEach((b) => (b.classList.toggle('on', b === vt), b.setAttribute('aria-selected', String(b === vt))));
      return fillTab();
    }
    const e = entries()[sel];
    if (t.closest('[data-copy]') && e?.transcript) {
      const text = e.transcript.segments.map((s) => (stamps ? `[${clock(s.start)}] ${s.text}` : s.text)).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        toast(`Đã chép script (${e.script.words} từ)`);
      } catch {
        toast('Trình duyệt không cho chép, thử lại', 'error');
      }
    } else if (t.closest('[data-save]') && e?.video) {
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
    } else if (t.matches('[data-stamps]')) {
      stamps = t.checked;
      fillTab();
    }
  };
  const onKey = (ev) => {
    const th = /** @type {HTMLElement} */ (ev.target).closest?.('[data-sort]');
    if (th && (ev.key === 'Enter' || ev.key === ' ')) (ev.preventDefault(), /** @type {HTMLElement} */ (th).click());
  };
  box.addEventListener('click', onClick);
  box.addEventListener('input', onInput);
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
      box.removeEventListener('keydown', onKey);
    },
  };
}
