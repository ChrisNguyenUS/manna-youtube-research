// Workspace of a TikTok insight report: one place that knows the report's comments, videos, keywords and groups
// (groups = /tiktok/insight/:id/topics, the report's own rule and counts), and the views built on it:
// a comment browser (Comments and Questions tabs), the topic explorer, the video gallery and the overview.
// Everything shown comes from the comments stored with the report; commenter names are never stored.
import { esc, icon, fmt, store, persist, emptyState, toast } from '../lib.js';

export const COMMENT_SORTS = {
  attention: ['Được chú ý nhất (tim + trả lời)', (c) => (c.likes ?? 0) + (c.replies ?? 0)],
  likes: ['Nhiều tim nhất', (c) => c.likes ?? 0],
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
const cover = (v, cls = '') => (v?.cover ? `<img class="${cls}" loading="lazy" src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '');

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

/** One comment: full text (clamped until opened), its numbers, groups, keyword and source video. */
function commentRow(ctx, c, { open = false, picked = false } = {}) {
  const v = ctx.videos.get(c.videoId);
  const parent = c.parentId ? ctx.comments.get(c.parentId) : null;
  const answers = (ctx.replies.get(c.id) ?? []).slice().sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  const groups = ctx.topicsOf(c.id);
  return `<div class="tx-row ${open ? 'open' : ''} ${picked ? 'picked' : ''}" data-cid="${esc(c.id)}">
    <input type="checkbox" class="tt-cb" data-pick="${esc(c.id)}" ${picked ? 'checked' : ''} aria-label="Chọn comment">
    <div class="tx-body">
      <div class="tx-text">${esc(c.text)}</div>
      ${open && parent ? `<div class="tx-parent">Trả lời cho: “${esc(parent.text)}”</div>` : ''}
      <div class="tx-meta"><span>${icon('heart')} ${fmt(c.likes ?? 0)}</span><span>${icon('message')} ${fmt(c.replies ?? 0)} trả lời</span>
        ${monthYear(c.createdAt) ? `<span title="Tháng/năm comment">${monthYear(c.createdAt)}</span>` : ''}
        ${c.isReply ? '<span class="tag">Là trả lời</span>' : ''}${c.pinned ? '<span class="tag">Ghim</span>' : ''}
        ${groups.map((t) => `<span class="tx-topic" title="Nhóm của báo cáo">${esc(t.label)}</span>`).join('')}
        ${ctx.keywordsOf(c).map((k) => `<span class="tx-kw" title="Từ khoá nghiên cứu">${esc(k)}</span>`).join('')}</div>
      ${open && v ? `<div class="tx-detail">
        <div><span class="muted">Comment lúc</span> ${fullDate(c.createdAt)}</div>
        <div><span class="muted">Video nguồn:</span> ${esc(v.caption || '(không caption)')}</div>
        <div><span class="muted">Creator:</span> <b>@${esc(v.author)}</b>${v.authorName ? ` (${esc(v.authorName)})` : ''} · đăng ${fullDate(v.createdAt)} · ${fmt(v.plays)} view · ${fmt(v.likes)} tim · ${fmt(v.comments)} bình luận</div>
        ${answers.length ? `<div class="tx-answers"><div class="muted small">${answers.length} trả lời đã đọc</div>${answers.slice(0, 5).map((a) => `<div class="tx-answer">↳ ${esc(a.text)} <span class="muted small">♥ ${fmt(a.likes ?? 0)}</span></div>`).join('')}</div>` : ''}
        <div class="row"><a class="btn sm primary" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('ext')} Mở video trên TikTok</a>
          <button type="button" class="btn sm" data-copy-one="${esc(c.id)}">${icon('doc')} Sao chép comment</button>
          <a class="btn sm" href="#/tiktok/comments?videos=${encodeURIComponent(v.url)}">${icon('message')} Đọc thêm comment video này</a></div>
      </div>` : ''}
    </div>
    ${v ? `<a class="tx-video" href="${esc(v.url)}" target="_blank" rel="noopener" title="Mở video trên TikTok">
      <span class="tx-thumb">${cover(v)}</span>
      <span class="tx-vinfo"><span class="tx-vcap">${esc(v.caption || '(không caption)')}</span><span class="muted">@${esc(v.author)}</span><span class="muted">${icon('eye')} ${fmt(v.plays)}</span></span></a>` : '<span></span>'}
  </div>`;
}

const quoteLine = (c) => `“${String(c.text).replace(/\s+/g, ' ').trim()}” (♥ ${c.likes ?? 0}, ${c.replies ?? 0} trả lời)`;
async function copyText(text, n) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Đã chép ${n} comment`);
  } catch {
    toast('Trình duyệt không cho chép, thử lại', 'error');
  }
}

function pageNumbers(cur, total) {
  const list = [...new Set([1, total, cur - 1, cur, cur + 1].filter((n) => n >= 1 && n <= total))].sort((a, b) => a - b);
  const out = [];
  for (const [i, n] of list.entries()) {
    if (i && n - list[i - 1] > 1) out.push('…');
    out.push(n);
  }
  return out;
}

/**
 * A searchable, filterable, paged list of comments.
 * @param {HTMLElement} box
 * @param {InsightCtx} ctx
 * @param {{base: any[], filters?: ('topic'|'keyword'|'video'|'creator')[], topicChoices?: any[], initial?: Record<string, string>, head?: string, placeholder?: string}} o
 * @returns {{off: () => void, set: (patch: Record<string, string>) => void}}
 */
export function commentBrowser(box, ctx, o) {
  const prefs = store('tt-explorer', { sort: 'attention', per: 10 });
  const filters = o.filters ?? ['topic', 'keyword', 'video', 'creator'];
  const st = { q: '', topic: '', kw: '', video: '', creator: '', page: 1, open: /** @type {string|null} */ (null), picked: new Set(), ...(o.initial ?? {}) };
  const base = o.base;
  const vids = [...new Set(base.map((c) => c.videoId))].map((id) => ctx.videos.get(id)).filter(Boolean).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const creators = [...new Set(vids.map((v) => v.author))];
  const topicChoices = o.topicChoices ?? ctx.topics;
  const kwChoices = [...new Set(base.flatMap(ctx.keywordsOf))];
  box.innerHTML = `${o.head ?? ''}
    <div class="tx-tools">
      <label class="tt-searchmini tx-grow">${icon('search')}<input data-cq placeholder="${esc(o.placeholder ?? `Tìm trong ${base.length} comment…`)}" value="${esc(st.q)}"></label>
      ${filters.includes('topic') ? `<label class="tt-pill"><select data-f="topic" title="Lọc theo nhóm">${opt('', 'Tất cả nhóm', st.topic)}${topicChoices.map((t) => opt(t.key, `${t.label} (${t.count})`, st.topic)).join('')}${o.topicChoices ? '' : opt('none', 'Chưa vào nhóm nào', st.topic)}</select></label>` : ''}
      ${filters.includes('keyword') && kwChoices.length > 1 ? `<label class="tt-pill"><select data-f="kw" title="Lọc theo từ khoá">${opt('', `Tất cả từ khoá (${kwChoices.length})`, st.kw)}${kwChoices.map((k) => opt(k, k, st.kw)).join('')}</select></label>` : ''}
      ${filters.includes('video') ? `<label class="tt-pill"><select data-f="video" title="Lọc theo video">${opt('', `Tất cả video (${vids.length})`, st.video)}${vids.map((v) => opt(v.id, `#${v.rank ?? ''} ${String(v.caption || '(không caption)').slice(0, 50)}`, st.video)).join('')}</select></label>` : ''}
      ${filters.includes('creator') ? `<label class="tt-pill"><select data-f="creator" title="Lọc theo creator">${opt('', `Tất cả creator (${creators.length})`, st.creator)}${creators.map((a) => opt(a, `@${a}`, st.creator)).join('')}</select></label>` : ''}
      <label class="tt-pill"><span class="muted">Sắp xếp:</span><select data-csort>${Object.entries(COMMENT_SORTS).map(([k, [l]]) => opt(k, l, prefs.sort)).join('')}</select></label>
    </div>
    <div class="tx-count small muted" data-ccount></div>
    <div class="tx-comments" data-clist></div>
    <div class="tx-foot" data-cfoot></div>`;
  const L = listen(box);

  function filtered() {
    const q = fold(st.q);
    const list = base.filter((c) => {
      const v = ctx.videos.get(c.videoId);
      const tps = ctx.topicsOf(c.id);
      return (!st.topic || (st.topic === 'none' ? !tps.length : tps.some((t) => t.key === st.topic)))
        && (!st.kw || ctx.keywordsOf(c).includes(st.kw)) && (!st.video || c.videoId === st.video)
        && (!st.creator || v?.author === st.creator) && (!q || fold(c.text).includes(q));
    });
    const f = (COMMENT_SORTS[prefs.sort] ?? COMMENT_SORTS.attention)[1];
    return list.sort((a, b) => f(b) - f(a) || (b.likes ?? 0) - (a.likes ?? 0));
  }

  function render() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / prefs.per));
    st.page = Math.min(st.page, pages);
    const slice = list.slice((st.page - 1) * prefs.per, st.page * prefs.per);
    box.querySelector('[data-ccount]').textContent = list.length === base.length ? `${base.length} comment` : `${list.length} / ${base.length} comment khớp bộ lọc`;
    box.querySelector('[data-clist]').innerHTML = slice.length ? slice.map((c) => commentRow(ctx, c, { open: st.open === c.id, picked: st.picked.has(c.id) })).join('') : `<div class="card-pad">${emptyState('Không có comment khớp', 'Thử bỏ bớt chữ tìm kiếm hoặc bộ lọc.')}</div>`;
    const allPicked = list.length > 0 && list.every((c) => st.picked.has(c.id));
    box.querySelector('[data-cfoot]').innerHTML = `
      <label class="tx-pickall"><input type="checkbox" class="tt-cb" data-pickall ${allPicked ? 'checked' : ''} ${list.length ? '' : 'disabled'}> Chọn tất cả (${list.length})</label>
      <button type="button" class="btn sm" data-copy ${st.picked.size ? '' : 'disabled'} title="Chép nguyên văn comment đã chọn, kèm số tim">${icon('doc')} Sao chép${st.picked.size ? ` (${st.picked.size})` : ''}</button>
      <span class="spacer"></span>
      ${pages > 1 ? `<div class="tx-pager"><button type="button" data-page="${st.page - 1}" ${st.page > 1 ? '' : 'disabled'} aria-label="Trang trước">${icon('back')}</button>
        ${pageNumbers(st.page, pages).map((n) => (n === '…' ? '<span class="muted">…</span>' : `<button type="button" class="${n === st.page ? 'on' : ''}" data-page="${n}">${n}</button>`)).join('')}
        <button type="button" class="tt-flip" data-page="${st.page + 1}" ${st.page < pages ? '' : 'disabled'} aria-label="Trang sau">${icon('back')}</button></div>` : ''}
      <label class="tt-pill"><select data-per>${[10, 20, 50].map((n) => opt(n, `${n} / trang`, prefs.per)).join('')}</select></label>`;
  }

  const save = () => persist('tt-explorer', prefs);
  L.on('input', '[data-cq]', (e, el) => ((st.q = el.value), (st.page = 1), render()));
  L.on('change', '[data-f]', (e, el) => ((st[el.dataset.f] = el.value), (st.page = 1), render()));
  L.on('change', '[data-csort]', (e, el) => ((prefs.sort = el.value), save(), (st.page = 1), render()));
  L.on('change', '[data-per]', (e, el) => ((prefs.per = Number(el.value)), save(), (st.page = 1), render()));
  L.on('click', '[data-page]', (e, el) => {
    st.page = Number(el.dataset.page);
    render();
    box.querySelector('[data-clist]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  L.on('change', '[data-pick]', (e, el) => (el.checked ? st.picked.add(el.dataset.pick) : st.picked.delete(el.dataset.pick), render()));
  L.on('change', '[data-pickall]', (e, el) => {
    for (const c of filtered()) el.checked ? st.picked.add(c.id) : st.picked.delete(c.id);
    render();
  });
  L.on('click', '[data-copy]', () => copyText([...st.picked].map((id) => ctx.comments.get(id)).filter(Boolean).map(quoteLine).join('\n'), st.picked.size));
  L.on('click', '[data-copy-one]', (e, el) => copyText(quoteLine(ctx.comments.get(el.dataset.copyOne)), 1));
  // Click a comment to read it whole, with its video, creator and the replies read under it.
  L.on('click', '[data-cid]', (e, el) => {
    if (/** @type {HTMLElement} */ (e.target).closest('a, input, label, button, select')) return;
    if (window.getSelection()?.toString()) return; // selecting text to copy is not a click
    st.open = st.open === el.dataset.cid ? null : el.dataset.cid;
    render();
  });
  render();
  return {
    off: L.off,
    set(patch) {
      Object.assign(st, patch, { page: 1 });
      for (const el of box.querySelectorAll('[data-f]')) /** @type {HTMLSelectElement} */ (el).value = st[/** @type {HTMLElement} */ (el).dataset.f] ?? '';
      render();
    },
  };
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

/** Video card for the gallery: cover, caption, creator, views, comments read, keyword. */
const videoCard = (ctx, v) => `<button type="button" class="ix-vcard" data-vid="${esc(v.id)}">
  <span class="ix-vcover">${cover(v)}<span class="tt-gviews">${icon('eye')}${fmt(v.plays)}</span>${v.rank ? `<span class="ix-vrank">#${v.rank}</span>` : ''}</span>
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
    dr.innerHTML = `<div class="tt-dr-head"><b>Video #${v.rank ?? ''}</b><span class="spacer"></span><button type="button" class="icon-btn" data-vclose title="Đóng (Esc)">${icon('x')}</button></div>
      <div class="tt-dr-body">
        <div class="tt-dr-top"><a class="tt-dr-cover" href="${esc(v.url)}" target="_blank" rel="noopener">${cover(v)}<span class="tt-gviews">${icon('eye')}${fmt(v.plays)}</span></a>
          <div class="tt-dr-who"><div><b>@${esc(v.author)}</b>${v.authorName ? `<div class="small muted">${esc(v.authorName)}</div>` : ''}</div>
            <div class="small">Đăng ${fullDate(v.createdAt)}</div>
            <div>${ctx.vKeywords(v).map((k) => `<span class="tx-kw">${esc(k)}</span>`).join(' ')}</div>
            <a class="btn sm primary" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('ext')} Mở trên TikTok</a></div></div>
        <p class="tt-dr-cap">${esc(v.caption || '(không caption)')}</p>
        <div class="tt-dr-stats">${stat('Lượt xem', fmt(v.plays))}${stat('Tim', fmt(v.likes))}${stat('Bình luận', fmt(v.comments))}${stat('Chia sẻ', fmt(v.shares))}${stat('Lưu', fmt(v.saves))}${stat('Comment đã đọc', fmt(cm.length))}</div>
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
