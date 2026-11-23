// Workspace of an insight report (TikTok, or YouTube: same comment shape, `d.platform` says which): one place that knows the report's comments, videos, keywords and groups
// (groups = /tiktok/insight/:id/topics, the report's own rule and counts), and the views built on it:
// a comment browser (Comments and Questions tabs), the topic explorer, the video gallery and the overview.
// Everything shown comes from the comments stored with the report; commenter names are never stored.
import { esc, icon, fmt, store, persist, emptyState, toast, isSaved, toggleSave, saveMany, img } from '../lib.js';
import { savedTikTokVideo } from '../saved-items.js';
import { commentExplorer } from './comment-explorer.js';

export const COMMENT_SORTS = {
  attention: ['Được chú ý nhất (tim + trả lời)', (c) => (c.likes ?? 0) + (c.replies ?? 0)],
  likes: ['Nhiều like nhất', (c) => c.likes ?? 0],
  replies: ['Nhiều trả lời nhất', (c) => c.replies ?? 0],
  newest: ['Mới nhất', (c) => Date.parse(c.createdAt) || 0],
};
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const two = (n) => String(n).padStart(2, '0');
export const monthYear = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${two(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};
const fullDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString('vi-VN');
};
const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
const cover = (v, cls = '') => (v?.cover ? `<img class="${cls}" loading="lazy" src="${esc(img(v.cover))}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '');

/** Delegated listeners on one element; returns off(). */
function listen(box) {
  const offs = [];
  const on = (ev, sel, fn) => {
    const h = (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest?.(sel);
      if (el && box.contains(el)) fn(e, el);
    };
    box.addEventListener(ev, h);
    offs.push(() => box.removeEventListener(ev, h));
  };
  return { on, off: () => offs.splice(0).forEach((f) => f()) };
}

/**
 * What every view of one report needs.
 * @param {any} rec the insight record
 * @param {{total: number, questions: number, topics: {key: string, kind: string, label: string, count: number, ids: string[]}[]}} groups
 */
export function insightContext(rec, groups) {
  const d = rec.data;
  const all = d.comments ?? [];
  const comments = new Map(all.map((c) => [c.id, c]));
  const videos = new Map((d.videos ?? []).map((v) => [v.id, v]));
  const vKeywords = (v) => (v?.queries?.length ? v.queries : v?.query ? [v.query] : []);
  const keywordsOf = (c) => {
    const k = vKeywords(videos.get(c.videoId));
    return k.length ? k : d.keywords ?? [];
  };
  const topics = groups.topics.map((t, i) => ({ ...t, order: i, list: t.ids.map((id) => comments.get(id)).filter(Boolean) }));
  const topicsById = new Map();
  for (const t of topics) for (const id of t.ids) topicsById.set(id, [...(topicsById.get(id) ?? []), t]);
  const replies = new Map();
  for (const c of all) if (c.parentId) replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c]);
  const questionIds = new Set(topics.filter((t) => t.kind === 'question').flatMap((t) => t.ids));
  return {
    rec, d, all, comments, videos, topics, topicsById, replies, keywordsOf, vKeywords,
    keywords: [...new Set((d.videos ?? []).flatMap(vKeywords))],
    topicsOf: (id) => topicsById.get(id) ?? [],
    questions: all.filter((c) => questionIds.has(c.id)),
    commentsOfVideo: (id) => all.filter((c) => c.videoId === id),
  };
}
/** @typedef {ReturnType<typeof insightContext>} InsightCtx */

/**
 * The report's comments in the shared comment explorer, with the report's own filters (group, keyword, creator) and
 * its groups and keywords shown on each comment.
 * @param {HTMLElement} box
 * @param {InsightCtx} ctx
 * @param {{base: any[], filters?: ('topic'|'keyword'|'video'|'creator')[], topicChoices?: any[], initial?: Record<string, string>, head?: string, placeholder?: string, mode?: 'full'|'embedded', openFull?: string}} o
 * @returns {{off: () => void, set: (patch: Record<string, string>) => void}}
 */
export function commentBrowser(box, ctx, o) {
  const filters = o.filters ?? ['topic', 'keyword', 'video', 'creator'];
  const base = o.base;
  const topicChoices = o.topicChoices ?? ctx.topics;
  const kwChoices = [...new Set(base.flatMap(ctx.keywordsOf))];
  const creators = [...new Set(base.map((c) => ctx.videos.get(c.videoId)?.author).filter(Boolean))];
  /** @type {import('./comment-explorer.js').Facet[]} */
  const facets = [];
  if (filters.includes('topic') && topicChoices.length) {
    facets.push({ key: 'topic', label: 'Nhóm câu hỏi', all: 'Mọi nhóm câu hỏi', choices: [...topicChoices.map((t) => ({ value: t.key, label: `${t.label} (${t.count})` })), ...(o.topicChoices ? [] : [{ value: 'none', label: 'Chưa vào nhóm nào' }])],
      test: (c, v) => (v === 'none' ? !ctx.topicsOf(c.id).length : ctx.topicsOf(c.id).some((t) => t.key === v)) });
  }
  if (filters.includes('keyword') && kwChoices.length > 1) facets.push({ key: 'kw', label: 'Từ khoá', all: `Mọi từ khoá (${kwChoices.length})`, choices: kwChoices.map((k) => ({ value: k, label: k })), test: (c, v) => ctx.keywordsOf(c).includes(v) });
  if (filters.includes('creator') && creators.length > 1) facets.push({ key: 'creator', label: 'Creator', all: `Mọi creator (${creators.length})`, choices: creators.map((a) => ({ value: a, label: `@${a}` })), test: (c, v) => ctx.videos.get(c.videoId)?.author === v });
  const tags = (c) => [...ctx.topicsOf(c.id).map((t) => `<span class="tx-topic" title="Nhóm câu hỏi của báo cáo">${esc(t.label)}</span>`), ...(filters.includes('keyword') ? ctx.keywordsOf(c).map((k) => `<span class="tx-kw" title="Từ khoá nghiên cứu">${esc(k)}</span>`) : [])].join('');
  return commentExplorer(box, {
    comments: base, videos: ctx.videos, mode: o.mode ?? 'full', facets, tags, head: o.head, placeholder: o.placeholder, openFull: o.openFull,
    initial: o.initial ? { ...o.initial } : undefined, source: { title: ctx.rec.title, recordId: ctx.rec.id },
  });
}

const TOPIC_SORTS = { count: 'Nhiều comment nhất', order: 'Theo thứ tự báo cáo', az: 'Theo tên A–Z' };

/**
 * Topics on the left (the report's groups), the chosen group's comments on the right.
 * @param {HTMLElement} box @param {InsightCtx} ctx @param {{topic?: string}} [o]
 */
export function topicExplorer(box, ctx, o = {}) {
  const prefs = store('tt-explorer', { topicSort: 'count' });
  const start = [...ctx.topics].sort((a, b) => Number(a.kind !== 'question') - Number(b.kind !== 'question') || Number(a.key === 'other') - Number(b.key === 'other') || b.count - a.count)[0];
  const st = { topic: o.topic ?? start?.key ?? null, kw: '', q: '' };
  box.innerHTML = `<div class="tx">
    <section class="tx-left">
      <div class="tx-lhead"><h3>Chủ đề được nhắc đến (<span data-tcount>${ctx.topics.length}</span>)</h3>
        <div class="small muted">Gom từ ${fmt(ctx.all.length)} comment đã đọc, cùng luật với báo cáo</div></div>
      <div class="tx-ltools">
        <label class="tt-searchmini">${icon('search')}<input data-tq placeholder="Tìm chủ đề…"></label>
        <label class="tt-pill"><select data-tsort title="Sắp xếp chủ đề">${Object.entries(TOPIC_SORTS).map(([k, l]) => opt(k, l, prefs.topicSort)).join('')}</select></label>
        ${ctx.keywords.length > 1 ? `<label class="tt-pill tx-wide"><span class="muted">Từ khoá:</span><select data-tkw>${opt('', 'Tất cả từ khoá', '')}${ctx.keywords.map((k) => opt(k, k, '')).join('')}</select></label>` : ''}
      </div>
      <div class="tx-list" data-tlist></div>
    </section>
    <section class="tx-right" data-right></section>
  </div>`;
  const tlist = box.querySelector('[data-tlist]');
  const right = /** @type {HTMLElement} */ (box.querySelector('[data-right]'));
  const inKw = (list) => (st.kw ? list.filter((c) => ctx.keywordsOf(c).includes(st.kw)) : list);
  /** @type {{off: () => void}|null} */
  let browser = null;

  function renderTopics() {
    const q = fold(st.q);
    const rows = ctx.topics.map((t) => ({ ...t, n: inKw(t.list).length })).filter((t) => !q || fold(t.label).includes(q));
    const sorter = { count: (a, b) => b.n - a.n, order: (a, b) => a.order - b.order, az: (a, b) => a.label.localeCompare(b.label, 'vi') }[prefs.topicSort] ?? ((a, b) => b.n - a.n);
    const qTotal = new Set(inKw(ctx.questions).map((c) => c.id)).size;
    const allBase = st.kw ? inKw(ctx.all).length : ctx.all.length;
    const section = (kind, title, base) => {
      const list = rows.filter((t) => t.kind === kind).sort((a, b) => Number(a.key === 'other') - Number(b.key === 'other') || sorter(a, b));
      if (!list.length) return '';
      return `<div class="tx-sec">${title}</div>${list.map((t) => {
        const pct = base ? Math.round((t.n / base) * 1000) / 10 : 0;
        return `<button type="button" class="tx-item ${t.key === st.topic ? 'on' : ''}" data-topic="${esc(t.key)}" aria-pressed="${t.key === st.topic}">
          <span class="tx-name">${esc(t.label)}</span><span class="tx-count"><b>${t.n}</b> <span class="muted">(${String(pct).replace('.', ',')}%)</span></span>
          <span class="tx-bar"><i style="width:${Math.min(100, pct)}%"></i></span></button>`;
      }).join('')}`;
    };
    tlist.innerHTML = (section('question', `Khách hỏi gì · ${qTotal} câu hỏi`, qTotal) + section('feeling', 'Cảm xúc, ý định', allBase)) || emptyState('Không có chủ đề khớp');
    box.querySelector('[data-tcount]').textContent = String(rows.length);
  }

  function renderRight() {
    browser?.off();
    const t = ctx.topics.find((x) => x.key === st.topic);
    if (!t) {
      right.innerHTML = emptyState('Chưa có chủ đề', 'Báo cáo này chưa có comment nào được gom nhóm.');
      return;
    }
    const base = inKw(t.list);
    const kwCount = new Map();
    for (const c of base) for (const k of ctx.keywordsOf(c)) kwCount.set(k, (kwCount.get(k) ?? 0) + 1);
    const nVideos = new Set(base.map((c) => c.videoId)).size;
    const head = `<div class="tx-rhead"><span class="tx-ic">${icon(t.kind === 'question' ? 'message' : 'heart')}</span>
      <div style="min-width:0"><h3>${esc(t.label)}</h3>
        <div class="small"><b>${base.length}</b> comment · xuất hiện trong ${nVideos} video · ${kwCount.size} từ khoá</div>
        ${kwCount.size ? `<div class="tx-kws">${[...kwCount].sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="tx-kw">${esc(k)} · ${n}</span>`).join('')}</div>` : ''}</div></div>`;
    browser = commentBrowser(right, ctx, { base, filters: ['video', 'creator'], head, placeholder: `Tìm trong ${base.length} comment…` });
  }

  const L = listen(box);
  L.on('click', '[data-topic]', (e, el) => ((st.topic = el.dataset.topic), renderTopics(), renderRight()));
  L.on('input', '[data-tq]', (e, el) => ((st.q = el.value), renderTopics()));
  L.on('change', '[data-tsort]', (e, el) => ((prefs.topicSort = el.value), persist('tt-explorer', { ...store('tt-explorer', {}), topicSort: el.value }), renderTopics()));
  L.on('change', '[data-tkw]', (e, el) => ((st.kw = el.value), renderTopics(), renderRight()));
  renderTopics();
  renderRight();
  return () => (L.off(), browser?.off());
}

/** A YouTube insight report (same screens, YouTube links and numbers). @param {InsightCtx} ctx */
const isYouTube = (ctx) => ctx.d.platform === 'youtube';

/** Video card for the gallery: cover, caption, creator, views, comments read, keyword. */
const videoCard = (ctx, v) => `<button type="button" class="ix-vcard" data-vid="${esc(v.id)}">
  <span class="ix-vcover" ${isYouTube(ctx) ? 'style="aspect-ratio:16/9"' : ''}>${cover(v)}<span class="tt-gviews">${icon('eye')}${fmt(v.plays)}</span>${v.rank ? `<span class="ix-vrank">#${v.rank}</span>` : ''}</span>
  <span class="ix-vbody"><span class="tx-vcap">${esc(v.caption || '(không caption)')}</span>
    <span class="muted small">@${esc(v.author)}</span>
    <span class="small">${fmt(v.comments)} bình luận · <b>${fmt(ctx.commentsOfVideo(v.id).length)}</b> đã đọc</span>
    <span>${ctx.vKeywords(v).map((k) => `<span class="tx-kw">${esc(k)}</span>`).join(' ')}</span></span></button>`;

/**
 * Grid of the report's videos; clicking one opens its details and the comments read from it.
 * @param {HTMLElement} box @param {InsightCtx} ctx @param {{onAllComments: (videoId: string) => void, video?: string}} o
 */
export function videoGallery(box, ctx, o) {
  const list = [...ctx.videos.values()].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  box.innerHTML = `<div class="ix-vgrid">${list.map((v) => videoCard(ctx, v)).join('') || emptyState('Không có video')}</div>
    <aside class="tt-drawer" data-vdrawer hidden aria-label="Chi tiết video"></aside>`;
  const dr = /** @type {HTMLElement} */ (box.querySelector('[data-vdrawer]'));
  const L = listen(box);
  function openVideo(id) {
    const v = ctx.videos.get(id);
    if (!v) return;
    const cm = ctx.commentsOfVideo(id).sort((a, b) => (b.likes ?? 0) + (b.replies ?? 0) - ((a.likes ?? 0) + (a.replies ?? 0)));
    const stat = (l, val) => `<div class="tt-dr-stat"><div class="l">${l}</div><div class="v">${val}</div></div>`;
    const yt = isYouTube(ctx);
    const saveKind = yt ? 'video' : 'tiktok_video';
    dr.innerHTML = `<div class="tt-dr-head"><b>Video #${v.rank ?? ''}</b><span class="spacer"></span><button type="button" class="icon-btn" data-vclose title="Đóng (Esc)">${icon('x')}</button></div>
      <div class="tt-dr-body">
        <div class="tt-dr-top"><a class="tt-dr-cover" href="${esc(v.url)}" target="_blank" rel="noopener" ${yt ? 'style="aspect-ratio:16/9"' : ''}>${cover(v)}<span class="tt-gviews">${icon('eye')}${fmt(v.plays)}</span></a>
          <div class="tt-dr-who"><div><b>@${esc(v.author)}</b>${v.authorName ? `<div class="small muted">${esc(v.authorName)}</div>` : ''}</div>
            <div class="small">Đăng ${fullDate(v.createdAt)}</div>
            <div>${ctx.vKeywords(v).map((k) => `<span class="tx-kw">${esc(k)}</span>`).join(' ')}</div>
            <a class="btn sm primary" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('ext')} Mở trên ${yt ? 'YouTube' : 'TikTok'}</a>
            <button type="button" class="btn sm ${isSaved(saveKind, v.id) ? 'on' : ''}" data-vsave="${esc(v.id)}">${icon('bookmark')} ${isSaved(saveKind, v.id) ? 'Đã lưu' : 'Lưu video'}</button></div></div>
        <p class="tt-dr-cap">${esc(v.caption || '(không caption)')}</p>
        <div class="tt-dr-stats">${yt
          ? `${stat('View', fmt(v.views))}${stat('View/ngày', fmt(v.viewsPerDay))}${stat('Like', fmt(v.likes))}${stat('Sub kênh', fmt(v.channelSubs))}${stat('Outlier', v.viewSub != null ? `${v.viewSub}×` : '–')}${stat('Comment đã đọc', fmt(cm.length))}`
          : `${stat('View', fmt(v.plays))}${stat('Like', fmt(v.likes))}${stat('Comment', fmt(v.comments))}${stat('Chia sẻ', fmt(v.shares))}${stat('Lưu', fmt(v.saves))}${stat('Comment đã đọc', fmt(cm.length))}`}</div>
        <div class="tt-dr-sec">Comment được chú ý nhất</div>
        ${cm.slice(0, 8).map((c) => `<div class="tt-dr-cm"><span class="tt-cm-likes">♥ ${fmt(c.likes ?? 0)}</span> ${esc(c.text)}</div>`).join('') || '<div class="small muted">Chưa đọc comment nào của video này.</div>'}
        ${cm.length ? `<button type="button" class="btn" data-vall="${esc(v.id)}">${icon('message')} Xem cả ${cm.length} comment trong tab Comment</button>` : ''}
      </div>`;
    dr.hidden = false;
    box.querySelectorAll('.ix-vcard').forEach((el) => el.classList.toggle('on', /** @type {HTMLElement} */ (el).dataset.vid === id));
  }
  const close = () => {
    dr.hidden = true;
    box.querySelectorAll('.ix-vcard.on').forEach((el) => el.classList.remove('on'));
  };
  L.on('click', '.ix-vcard', (e, el) => openVideo(el.dataset.vid));
  L.on('click', '[data-vclose]', close);
  L.on('click', '[data-vsave]', async (e, el) => {
    const v = ctx.videos.get(el.dataset.vsave);
    if (!v) return;
    if (isYouTube(ctx)) await toggleSave('video', v.id, v.title, { id: v.id, title: v.title, channelTitle: v.channelTitle, channelId: v.channelId, views: v.views, channelSubs: v.channelSubs, viewSub: v.viewSub, durationSec: v.durationSec });
    else {
      const it = savedTikTokVideo(v, ctx.vKeywords(v));
      await toggleSave('tiktok_video', it.ref, it.title, it.data);
    }
    openVideo(v.id);
  });
  L.on('click', '[data-vall]', (e, el) => (close(), o.onAllComments(el.dataset.vall)));
  const onKey = (e) => e.key === 'Escape' && !dr.hidden && close();
  document.addEventListener('keydown', onKey);
  if (o.video) openVideo(o.video);
  return () => (L.off(), document.removeEventListener('keydown', onKey));
}

/**
 * Short previews of each tab, each with a link to the full tab.
 * @param {HTMLElement} box @param {InsightCtx} ctx @param {{go: (tab: string, opts?: any) => void}} o
 */
export function insightOverview(box, ctx, o) {
  const d = ctx.d;
  const byAttention = (a, b) => (b.likes ?? 0) + (b.replies ?? 0) - ((a.likes ?? 0) + (a.replies ?? 0));
  const qTotal = ctx.questions.length;
  const maxCount = Math.max(1, ...ctx.topics.map((t) => t.count));
  const more = (tab, label) => `<button type="button" class="ix-more" data-go="${tab}">${label} →</button>`;
  const quote = (c) => `<div class="ix-quote" data-go-comment="${esc(c.id)}"><div class="tx-text">${esc(c.text)}</div><div class="tx-meta"><span>${icon('heart')} ${fmt(c.likes ?? 0)}</span><span>${icon('message')} ${fmt(c.replies ?? 0)}</span>${monthYear(c.createdAt) ? `<span>${monthYear(c.createdAt)}</span>` : ''}${ctx.topicsOf(c.id).slice(0, 2).map((t) => `<span class="tx-topic">${esc(t.label)}</span>`).join('')}</div></div>`;
  const topComments = [...ctx.all].sort(byAttention).slice(0, 5);
  const topQuestions = [...ctx.questions].sort(byAttention).slice(0, 5);
  const topVideos = [...ctx.videos.values()].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 4);
  box.innerHTML = `<div class="ix-ov">
    <section class="ix-panel"><div class="ix-phead"><h3>${icon('layers')} Phân bố chủ đề</h3>${more('topics', 'Khám phá chủ đề')}</div>
      <div class="ix-dist">${[...ctx.topics].sort((a, b) => Number(a.kind !== 'question') - Number(b.kind !== 'question') || Number(a.key === 'other') - Number(b.key === 'other') || b.count - a.count).map((t) => `<button type="button" class="ix-drow" data-go-topic="${esc(t.key)}"><span class="ix-dname">${esc(t.label)}</span>
        <span class="ix-dbar ${t.kind === 'feeling' ? 'feel' : ''}"><i style="width:${Math.round((t.count / maxCount) * 100)}%"></i></span><b>${t.count}</b></button>`).join('') || emptyState('Chưa có nhóm nào')}</div>
      <div class="small muted" style="margin-top:8px">${qTotal} câu hỏi trong ${fmt(ctx.all.length)} comment · một câu hỏi có thể thuộc nhiều nhóm</div></section>
    <section class="ix-panel"><div class="ix-phead"><h3>${icon('message')} Câu hỏi nổi bật</h3>${more('questions', `Xem cả ${qTotal} câu hỏi`)}</div>
      ${topQuestions.map(quote).join('') || emptyState('Chưa có câu hỏi')}</section>
    <section class="ix-panel"><div class="ix-phead"><h3>${icon('heart')} Comment được chú ý nhất</h3>${more('comments', `Xem cả ${fmt(ctx.all.length)} comment`)}</div>
      ${topComments.map(quote).join('') || emptyState('Chưa có comment')}</section>
    <section class="ix-panel"><div class="ix-phead"><h3>${icon('doc')} Câu chữ thật của khách</h3><span class="small muted">nguyên liệu cho hook</span></div>
      ${d.insight.voiceLines ? d.insight.voiceLines.slice(0, 8).map((v) => `<div class="tt-voice">“${esc(v.text)}” <span class="small muted">♥ ${fmt(v.likes)} · ↩ ${fmt(v.replies)}</span></div>`).join('') || '<span class="muted">Chưa đủ comment</span>'
        : `<div class="chips">${(d.insight.phrases || []).map((p) => `<span class="tag">${esc(p.phrase)} · <b>${p.count}</b></span>`).join('') || '<span class="muted">Chưa đủ comment</span>'}</div>`}</section>
    <section class="ix-panel ix-wide"><div class="ix-phead"><h3>${icon('play')} Video nguồn hàng đầu</h3>${more('videos', `Xem cả ${ctx.videos.size} video`)}</div>
      <div class="ix-vgrid ix-vgrid-sm">${topVideos.map((v) => videoCard(ctx, v)).join('') || emptyState('Không có video')}</div></section>
  </div>`;
  const L = listen(box);
  L.on('click', '[data-go]', (e, el) => o.go(el.dataset.go));
  L.on('click', '[data-go-topic]', (e, el) => o.go('topics', { topic: el.dataset.goTopic }));
  L.on('click', '[data-go-comment]', (e, el) => {
    if (window.getSelection()?.toString()) return;
    // That comment, opened, in the Comments tab (found by its own words).
    const c = ctx.comments.get(el.dataset.goComment);
    if (c) o.go('comments', { q: String(c.text).replace(/\s+/g, ' ').trim().slice(0, 40), open: c.id });
  });
  L.on('click', '.ix-vcard', (e, el) => o.go('videos', { video: el.dataset.vid }));
  return L.off;
}
