// Topic explorer of a TikTok insight report: the groups on the left (same rule and counts as the report, from
// /tiktok/insight/:id/topics), the real comments of the chosen group on the right, with their video, creator and
// keyword. Everything shown comes from the comments stored with the report; commenter names are never stored.
import { esc, icon, fmt, store, persist, emptyState, toast } from '../lib.js';

const OPTS = { sort: 'attention', per: 10, topicSort: 'count' };
const SORTS = {
  attention: ['Được chú ý nhất (tim + trả lời)', (c) => (c.likes ?? 0) + (c.replies ?? 0)],
  likes: ['Nhiều tim nhất', (c) => c.likes ?? 0],
  replies: ['Nhiều trả lời nhất', (c) => c.replies ?? 0],
  newest: ['Mới nhất', (c) => Date.parse(c.createdAt) || 0],
};
const TOPIC_SORTS = { count: 'Nhiều comment nhất', order: 'Theo thứ tự báo cáo', az: 'Theo tên A–Z' };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const two = (n) => String(n).padStart(2, '0');
const monthYear = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${two(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};
const fullDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString('vi-VN');
};
const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;

/**
 * @param {HTMLElement} box where to draw
 * @param {any} rec the insight record (its data.comments and data.videos)
 * @param {{total: number, questions: number, topics: {key: string, kind: string, label: string, count: number, ids: string[]}[]}} groups
 * @returns {() => void} removes the listeners
 */
export function topicExplorer(box, rec, groups) {
  const o = store('tt-explorer', OPTS);
  const d = rec.data;
  const comments = new Map((d.comments ?? []).map((c) => [c.id, c]));
  const videos = new Map((d.videos ?? []).map((v) => [v.id, v]));
  const keywordsOf = (c) => {
    const v = videos.get(c.videoId);
    const list = v?.queries?.length ? v.queries : v?.query ? [v.query] : [];
    return list.length ? list : d.keywords ?? [];
  };
  const allKeywords = [...new Set((d.videos ?? []).flatMap((v) => (v.queries?.length ? v.queries : v.query ? [v.query] : [])))];
  const topics = groups.topics.map((t, i) => ({ ...t, order: i, list: t.ids.map((id) => comments.get(id)).filter(Boolean) }));
  const st = {
    // Start on the biggest question theme ("Câu hỏi khác" only when nothing else).
    topic: ([...topics].sort((a, b) => Number(a.kind !== 'question') - Number(b.kind !== 'question') || Number(a.key === 'other') - Number(b.key === 'other') || b.count - a.count)[0]?.key) ?? null,
    kw: '', topicQ: '', q: '', video: '', creator: '',
    page: 1, open: /** @type {string|null} */ (null), picked: new Set(),
  };

  box.innerHTML = `<div class="tx">
    <section class="tx-left">
      <div class="tx-lhead"><h3>Chủ đề được nhắc đến (<span data-tcount>${topics.length}</span>)</h3>
        <div class="small muted">Gom từ ${fmt(groups.total)} comment đã đọc, cùng luật với báo cáo</div></div>
      <div class="tx-ltools">
        <label class="tt-searchmini">${icon('search')}<input data-tq placeholder="Tìm chủ đề…"></label>
        <label class="tt-pill"><select data-tsort title="Sắp xếp chủ đề">${Object.entries(TOPIC_SORTS).map(([k, l]) => opt(k, l, o.topicSort)).join('')}</select></label>
        ${allKeywords.length > 1 ? `<label class="tt-pill tx-wide"><span class="muted">Từ khoá:</span><select data-kw>${opt('', 'Tất cả từ khoá', '')}${allKeywords.map((k) => opt(k, k, '')).join('')}</select></label>` : ''}
      </div>
      <div class="tx-list" data-tlist></div>
    </section>
    <section class="tx-right" data-right></section>
  </div>`;
  const tlist = box.querySelector('[data-tlist]');
  const right = box.querySelector('[data-right]');

  /** Comments of a topic that pass the keyword filter (left panel and right panel agree). */
  const inKeyword = (list) => (st.kw ? list.filter((c) => keywordsOf(c).includes(st.kw)) : list);

  function renderTopics() {
    const q = fold(st.topicQ);
    const rows = topics.map((t) => ({ ...t, n: inKeyword(t.list).length })).filter((t) => !q || fold(t.label).includes(q));
    const sorter = { count: (a, b) => b.n - a.n, order: (a, b) => a.order - b.order, az: (a, b) => a.label.localeCompare(b.label, 'vi') }[o.topicSort] ?? ((a, b) => b.n - a.n);
    const section = (kind, title, base) => {
      // "Câu hỏi khác" stays last among the questions: it is what the themes did not catch.
      const list = rows.filter((t) => t.kind === kind).sort((a, b) => Number(a.key === 'other') - Number(b.key === 'other') || sorter(a, b));
      if (!list.length) return '';
      return `<div class="tx-sec">${title}</div>${list.map((t) => {
        const pct = base ? Math.round((t.n / base) * 1000) / 10 : 0;
        return `<button type="button" class="tx-item ${t.key === st.topic ? 'on' : ''}" data-topic="${esc(t.key)}" aria-pressed="${t.key === st.topic}">
          <span class="tx-name">${esc(t.label)}</span><span class="tx-count"><b>${t.n}</b> <span class="muted">(${String(pct).replace('.', ',')}%)</span></span>
          <span class="tx-bar"><i style="width:${Math.min(100, pct)}%"></i></span></button>`;
      }).join('')}`;
    };
    const qBase = inKeyword(topics.filter((t) => t.kind === 'question').flatMap((t) => t.list)).length;
    const qTotal = new Set(inKeyword(topics.filter((t) => t.kind === 'question').flatMap((t) => t.list)).map((c) => c.id)).size || qBase;
    const allBase = st.kw ? (d.comments ?? []).filter((c) => keywordsOf(c).includes(st.kw)).length : groups.total;
    tlist.innerHTML = (section('question', `Khách hỏi gì · ${qTotal} câu hỏi`, qTotal) + section('feeling', 'Cảm xúc, ý định', allBase)) || emptyState('Không có chủ đề khớp');
    box.querySelector('[data-tcount]').textContent = String(rows.length);
  }

  const topicNow = () => topics.find((t) => t.key === st.topic);

  /** Comments on the right: the topic, then keyword, video, creator, search; sorted. */
  function filtered() {
    const t = topicNow();
    if (!t) return [];
    const q = fold(st.q);
    const list = inKeyword(t.list).filter((c) => {
      const v = videos.get(c.videoId);
      return (!st.video || c.videoId === st.video) && (!st.creator || v?.author === st.creator) && (!q || fold(c.text).includes(q));
    });
    const f = (SORTS[o.sort] ?? SORTS.attention)[1];
    return list.sort((a, b) => f(b) - f(a) || (b.likes ?? 0) - (a.likes ?? 0));
  }

  function renderRight() {
    const t = topicNow();
    if (!t) {
      right.innerHTML = emptyState('Chưa có chủ đề', 'Báo cáo này chưa có comment nào được gom nhóm.');
      return;
    }
    const base = inKeyword(t.list);
    const vids = [...new Set(base.map((c) => c.videoId))].map((id) => videos.get(id)).filter(Boolean);
    const kwCount = new Map();
    for (const c of base) for (const k of keywordsOf(c)) kwCount.set(k, (kwCount.get(k) ?? 0) + 1);
    const creators = [...new Set(vids.map((v) => v.author))];
    right.innerHTML = `
      <div class="tx-rhead"><span class="tx-ic">${icon(t.kind === 'question' ? 'message' : 'heart')}</span>
        <div style="min-width:0"><h3>${esc(t.label)}</h3>
          <div class="small"><b>${base.length}</b> comment · xuất hiện trong ${vids.length} video · ${kwCount.size} từ khoá</div>
          ${kwCount.size ? `<div class="tx-kws">${[...kwCount].sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="tx-kw">${esc(k)} · ${n}</span>`).join('')}</div>` : ''}
        </div></div>
      <div class="tx-tools">
        <label class="tt-searchmini tx-grow">${icon('search')}<input data-cq placeholder="Tìm trong ${base.length} comment…" value="${esc(st.q)}"></label>
        <label class="tt-pill"><select data-video title="Lọc theo video">${opt('', `Tất cả video (${vids.length})`, st.video)}${vids.map((v) => opt(v.id, `#${v.rank ?? ''} ${String(v.caption || '(không caption)').slice(0, 50)}`, st.video)).join('')}</select></label>
        <label class="tt-pill"><select data-creator title="Lọc theo creator">${opt('', `Tất cả creator (${creators.length})`, st.creator)}${creators.map((a) => opt(a, `@${a}`, st.creator)).join('')}</select></label>
        <label class="tt-pill"><span class="muted">Sắp xếp:</span><select data-csort>${Object.entries(SORTS).map(([k, [l]]) => opt(k, l, o.sort)).join('')}</select></label>
      </div>
      <div class="tx-comments" data-clist></div>
      <div class="tx-foot" data-cfoot></div>`;
    renderComments();
  }

  function renderComments() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / o.per));
    st.page = Math.min(st.page, pages);
    const slice = list.slice((st.page - 1) * o.per, st.page * o.per);
    const clist = right.querySelector('[data-clist]');
    clist.innerHTML = slice.length ? slice.map(row).join('') : `<div class="card-pad">${emptyState('Không có comment khớp', st.q ? 'Thử bỏ bớt chữ tìm kiếm hoặc bộ lọc.' : '')}</div>`;
    const allPicked = list.length > 0 && list.every((c) => st.picked.has(c.id));
    const nums = pageNumbers(st.page, pages);
    right.querySelector('[data-cfoot]').innerHTML = `
      <label class="tx-pickall"><input type="checkbox" class="tt-cb" data-pickall ${allPicked ? 'checked' : ''} ${list.length ? '' : 'disabled'}> Chọn tất cả (${list.length})</label>
      <button type="button" class="btn sm" data-copy ${st.picked.size ? '' : 'disabled'} title="Chép nguyên văn comment đã chọn, kèm số tim">${icon('doc')} Sao chép${st.picked.size ? ` (${st.picked.size})` : ''}</button>
      <span class="spacer"></span>
      ${pages > 1 ? `<div class="tx-pager"><button type="button" data-page="${st.page - 1}" ${st.page > 1 ? '' : 'disabled'} aria-label="Trang trước">${icon('back')}</button>
        ${nums.map((n) => (n === '…' ? '<span class="muted">…</span>' : `<button type="button" class="${n === st.page ? 'on' : ''}" data-page="${n}">${n}</button>`)).join('')}
        <button type="button" class="tt-flip" data-page="${st.page + 1}" ${st.page < pages ? '' : 'disabled'} aria-label="Trang sau">${icon('back')}</button></div>` : ''}
      <label class="tt-pill"><select data-per>${[10, 20, 50].map((n) => opt(n, `${n} / trang`, o.per)).join('')}</select></label>`;
  }

  function row(c) {
    const v = videos.get(c.videoId);
    const open = st.open === c.id;
    const parent = c.parentId ? comments.get(c.parentId) : null;
    const kws = keywordsOf(c);
    return `<div class="tx-row ${open ? 'open' : ''} ${st.picked.has(c.id) ? 'picked' : ''}" data-cid="${esc(c.id)}">
      <input type="checkbox" class="tt-cb" data-pick="${esc(c.id)}" ${st.picked.has(c.id) ? 'checked' : ''} aria-label="Chọn comment">
      <div class="tx-body">
        <div class="tx-text">${esc(c.text)}</div>
        ${open && parent ? `<div class="tx-parent">Trả lời cho: “${esc(parent.text)}”</div>` : ''}
        <div class="tx-meta"><span>${icon('heart')} ${fmt(c.likes ?? 0)}</span><span>${icon('message')} ${fmt(c.replies ?? 0)} trả lời</span>
          ${monthYear(c.createdAt) ? `<span title="Tháng/năm comment">${monthYear(c.createdAt)}</span>` : ''}
          ${c.isReply ? '<span class="tag">Là trả lời</span>' : ''}${c.pinned ? '<span class="tag">Ghim</span>' : ''}
          ${kws.map((k) => `<span class="tx-kw">${esc(k)}</span>`).join('')}</div>
        ${open && v ? `<div class="tx-detail">
          <div><span class="muted">Comment lúc</span> ${fullDate(c.createdAt)}</div>
          <div><span class="muted">Video nguồn:</span> ${esc(v.caption || '(không caption)')}</div>
          <div><span class="muted">Creator:</span> <b>@${esc(v.author)}</b>${v.authorName ? ` (${esc(v.authorName)})` : ''} · đăng ${fullDate(v.createdAt)} · ${fmt(v.plays)} view · ${fmt(v.likes)} tim · ${fmt(v.comments)} bình luận</div>
          <div class="row"><a class="btn sm primary" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('ext')} Mở video trên TikTok</a>
            <a class="btn sm" href="#/tiktok/comments?videos=${encodeURIComponent(v.url)}">${icon('message')} Đọc thêm comment video này</a></div>
        </div>` : ''}
      </div>
      ${v ? `<a class="tx-video" href="${esc(v.url)}" target="_blank" rel="noopener" title="Mở video trên TikTok">
        <span class="tx-thumb">${v.cover ? `<img loading="lazy" src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : ''}</span>
        <span class="tx-vinfo"><span class="tx-vcap">${esc(v.caption || '(không caption)')}</span><span class="muted">@${esc(v.author)}</span><span class="muted">${icon('eye')} ${fmt(v.plays)}</span></span></a>` : '<span></span>'}
    </div>`;
  }

  // ---------- events ----------
  const offs = [];
  const on = (ev, sel, fn) => {
    const h = (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest?.(sel);
      if (el && box.contains(el)) fn(e, el);
    };
    box.addEventListener(ev, h);
    offs.push(() => box.removeEventListener(ev, h));
  };
  const save = () => persist('tt-explorer', o);
  on('click', '[data-topic]', (e, el) => {
    st.topic = el.dataset.topic;
    Object.assign(st, { page: 1, open: null, q: '', video: '', creator: '' });
    renderTopics();
    renderRight();
  });
  on('input', '[data-tq]', (e, el) => ((st.topicQ = el.value), renderTopics()));
  on('change', '[data-tsort]', (e, el) => ((o.topicSort = el.value), save(), renderTopics()));
  on('change', '[data-kw]', (e, el) => {
    st.kw = el.value;
    st.page = 1;
    renderTopics();
    renderRight();
  });
  on('input', '[data-cq]', (e, el) => ((st.q = el.value), (st.page = 1), renderComments()));
  on('change', '[data-video]', (e, el) => ((st.video = el.value), (st.page = 1), renderComments()));
  on('change', '[data-creator]', (e, el) => ((st.creator = el.value), (st.page = 1), renderComments()));
  on('change', '[data-csort]', (e, el) => ((o.sort = el.value), save(), (st.page = 1), renderComments()));
  on('change', '[data-per]', (e, el) => ((o.per = Number(el.value)), save(), (st.page = 1), renderComments()));
  on('click', '[data-page]', (e, el) => {
    st.page = Number(el.dataset.page);
    renderComments();
    right.querySelector('[data-clist]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  on('change', '[data-pick]', (e, el) => {
    el.checked ? st.picked.add(el.dataset.pick) : st.picked.delete(el.dataset.pick);
    renderComments();
  });
  on('change', '[data-pickall]', (e, el) => {
    for (const c of filtered()) el.checked ? st.picked.add(c.id) : st.picked.delete(c.id);
    renderComments();
  });
  on('click', '[data-copy]', async () => {
    const text = [...st.picked].map((id) => comments.get(id)).filter(Boolean).map((c) => `“${c.text.replace(/\s+/g, ' ').trim()}” (♥ ${c.likes ?? 0}, ${c.replies ?? 0} trả lời)`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast(`Đã chép ${st.picked.size} comment`);
    } catch {
      toast('Trình duyệt không cho chép, thử lại', 'error');
    }
  });
  // Click a comment to see it whole, with its video and creator; the thumbnail and links still open TikTok.
  on('click', '[data-cid]', (e, el) => {
    if (/** @type {HTMLElement} */ (e.target).closest('a, input, label, button, select')) return;
    if (window.getSelection()?.toString()) return; // selecting text to copy is not a click
    st.open = st.open === el.dataset.cid ? null : el.dataset.cid;
    renderComments();
  });

  renderTopics();
  renderRight();
  return () => offs.splice(0).forEach((f) => f());
}

/** 1 … 4 5 6 … 9 */
function pageNumbers(cur, total) {
  const set = new Set([1, total, cur - 1, cur, cur + 1].filter((n) => n >= 1 && n <= total));
  const list = [...set].sort((a, b) => a - b);
  const out = [];
  for (const [i, n] of list.entries()) {
    if (i && n - list[i - 1] > 1) out.push('…');
    out.push(n);
  }
  return out;
}
