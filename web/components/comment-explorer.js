// The one comment explorer of the app (TikTok; YouTube via o.platform): Collect Comments (full), Phân tích video (embedded) and Insight
// (full, with the report's extra filters) all use it. Intent (Câu hỏi, Ý định mua…), type (comment / reply) and
// sorting are separate controls. Comments carry `intents` from the server (core/analysis/comment-intents.js).
// Commenter names are never stored, so they are never shown.
import { esc, icon, fmt, store, persist, emptyState, toast, isSaved, toggleSave, saveMany } from '../lib.js';
import { savedQuote } from '../saved-items.js';

export const INTENTS = [
  ['question', 'Câu hỏi'], ['buying', 'Ý định mua'], ['concern', 'Lo ngại'], ['complaint', 'Phàn nàn'],
  ['request', 'Yêu cầu'], ['positive', 'Tích cực'], ['other', 'Khác'],
];
const INTENT_LABEL = Object.fromEntries(INTENTS);
export const SORTS = {
  newest: ['Mới nhất', (c) => Date.parse(c.createdAt) || 0],
  likes: ['Nhiều like nhất', (c) => c.likes ?? 0],
  replies: ['Nhiều trả lời nhất', (c) => c.replies ?? 0],
  attention: ['Được chú ý nhất (tim + trả lời)', (c) => (c.likes ?? 0) + (c.replies ?? 0)],
};
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const two = (n) => String(n).padStart(2, '0');
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${two(d.getDate())}/${two(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};
const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
const quoteLine = (c) => `“${String(c.text).replace(/\s+/g, ' ').trim()}” (♥ ${c.likes ?? 0}, ${c.replies ?? 0} trả lời)`;
const csvCell = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;

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
 * @typedef {{key: string, label: string, all: string, choices: {value: string, label: string}[], test: (c: any, value: string) => boolean}} Facet
 *   an extra filter (Insight: report group, keyword, creator)
 * @param {HTMLElement} box
 * @param {{
 *   comments: any[], videos: Map<string, any>, mode?: 'full'|'embedded',
 *   facets?: Facet[], tags?: (c: any) => string, source?: {title: string, recordId?: number},
 *   head?: string, openFull?: string, initial?: Record<string, any>, placeholder?: string, note?: string,
 * }} o
 *   tags: extra badges on a row (Insight groups and keywords); openFull: link "Mở trong Collect Comments" (embedded)
 * @returns {{off: () => void, set: (patch: Record<string, any>) => void}}
 */
export function commentExplorer(box, o) {
  const mode = o.mode ?? 'full';
  const prefs = store('cx-prefs', { sort: 'likes', per: 20, density: 'compact' });
  if (![20, 50, 100].includes(prefs.per)) prefs.per = 20;
  const facets = o.facets ?? [];
  const all = o.comments;
  const byId = new Map(all.map((c) => [String(c.id), c]));
  const replies = new Map();
  for (const c of all) if (c.parentId) replies.set(String(c.parentId), [...(replies.get(String(c.parentId)) ?? []), c]);
  const vids = [...new Set(all.map((c) => String(c.videoId ?? '')))].filter(Boolean).map((id) => o.videos.get(id)).filter(Boolean);
  const many = vids.length > 1;
  const st = { q: '', intent: '', type: 'all', video: '', page: 1, open: /** @type {Set<string>} */ (new Set()), picked: /** @type {Set<string>} */ (new Set()), ...Object.fromEntries(facets.map((f) => [f.key, ''])), ...(o.initial ?? {}) };
  // `open` may come in as one comment id (or null) from older callers: keep it a set of open threads.
  st.open = st.open instanceof Set ? st.open : new Set(st.open ? [String(st.open)] : []);
  const parents = all.filter((c) => !c.parentId).length;

  box.innerHTML = `<div class="cx ${mode} ${prefs.density}" data-cx>${o.head ?? ''}
    <div class="cx-chips" data-intents role="group" aria-label="Lọc theo ý định"></div>
    <div class="cx-tools">
      <label class="cx-search">${icon('search')}<input data-q type="search" placeholder="${esc(o.placeholder ?? `Tìm trong ${fmt(all.length)} comment…`)}" value="${esc(st.q)}" aria-label="Tìm comment"></label>
      <div class="cx-seg" role="group" aria-label="Loại comment">${[['all', `Tất cả bản ghi (${fmt(all.length)})`], ['parent', `Comment gốc (${fmt(parents)})`], ['reply', `Trả lời (${fmt(all.length - parents)})`]].map(([v, l]) => `<button type="button" data-type="${v}" class="${st.type === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${many ? `<select class="input cx-select" data-video aria-label="Video nguồn">${opt('', `Mọi video (${vids.length})`, st.video)}${vids.map((v) => opt(v.id, String(v.caption || v.url || v.id).slice(0, 60), st.video)).join('')}</select>` : ''}
      ${facets.map((f) => `<select class="input cx-select" data-facet="${esc(f.key)}" aria-label="${esc(f.label)}">${opt('', f.all, st[f.key])}${f.choices.map((ch) => opt(ch.value, ch.label, st[f.key])).join('')}</select>`).join('')}
      <select class="input cx-select" data-sort aria-label="Sắp xếp">${Object.entries(SORTS).map(([k, [l]]) => opt(k, `Sắp xếp: ${l}`, prefs.sort)).join('')}</select>
      <div class="cx-seg cx-density" role="group" aria-label="Kiểu hiển thị">${[['compact', 'Gọn'], ['comfortable', 'Thoáng']].map(([v, l]) => `<button type="button" data-density="${v}" class="${prefs.density === v ? 'on' : ''}" aria-pressed="${prefs.density === v}">${l}</button>`).join('')}</div>
    </div>
    ${o.note ? `<p class="cx-note">${o.note}</p>` : ''}
    <div class="cx-count" data-count></div>
    <div class="cx-list" data-list></div>
    <div class="cx-foot" data-foot></div></div>`;
  const offs = [];
  const on = (ev, sel, fn) => {
    const h = (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest?.(sel);
      if (el && box.contains(el)) fn(e, el);
    };
    box.addEventListener(ev, h);
    offs.push(() => box.removeEventListener(ev, h));
  };

  /** Everything but the intent filter (intent chip counts follow the other filters). */
  function narrowed() {
    const q = fold(st.q);
    return all.filter((c) => (st.type === 'all' || (st.type === 'reply') === !!c.parentId)
      && (!st.video || String(c.videoId) === st.video)
      && facets.every((f) => !st[f.key] || f.test(c, st[f.key]))
      && (!q || fold(c.text).includes(q)));
  }
  function filtered() {
    const f = (SORTS[prefs.sort] ?? SORTS.likes)[1];
    return narrowed().filter((c) => !st.intent || (c.intents ?? ['other']).includes(st.intent)).sort((a, b) => f(b) - f(a) || (b.likes ?? 0) - (a.likes ?? 0));
  }

  function row(c) {
    const id = String(c.id);
    const v = o.videos.get(String(c.videoId));
    const parent = c.parentId ? byId.get(String(c.parentId)) : null;
    const answers = (replies.get(id) ?? []).slice().sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    const open = st.open.has(id);
    const picked = st.picked.has(id);
    return `<div class="cx-row ${picked ? 'picked' : ''} ${c.parentId ? 'is-reply' : ''}" data-cid="${esc(id)}">
      <input type="checkbox" class="tt-cb" data-pick="${esc(id)}" ${picked ? 'checked' : ''} aria-label="Chọn comment">
      <div class="cx-body">
        ${parent || c.parentText ? `<div class="cx-parent">↳ trả lời: “${esc(String(parent?.text ?? c.parentText).slice(0, 140))}”</div>` : ''}
        <div class="cx-text ${open ? 'open' : ''}">${esc(c.text)}</div>
        <div class="cx-meta"><span title="Tim">${icon('heart')} ${fmt(c.likes ?? 0)}</span><span title="Số trả lời trên ${o.platform === 'youtube' ? 'YouTube' : 'TikTok'}">${icon('message')} ${fmt(c.replies ?? 0)}</span>${when(c.createdAt) ? `<span title="Ngày comment">${when(c.createdAt)}</span>` : ''}
          ${(c.intents ?? []).map((k) => `<span class="cx-tag t-${k}">${esc(INTENT_LABEL[k] ?? k)}</span>`).join('')}${c.seller ? '<span class="cx-tag t-seller" title="Câu này giống người bán dịch vụ trả lời, không phải khách">Người bán</span>' : ''}${c.pinned ? '<span class="cx-tag t-other">Ghim</span>' : ''}
          ${o.tags ? o.tags(c) : ''}</div>
        ${many && v && mode === 'full' ? `<a class="cx-video" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('play')} ${esc(String(v.caption || v.url).slice(0, 70))}${v.author ? ` · ${o.platform === 'youtube' ? '' : '@'}${esc(v.author)}` : ''}</a>` : ''}
        <div class="cx-acts">
          ${answers.length ? `<button type="button" class="cx-link" data-thread="${esc(id)}">${open ? 'Ẩn' : 'Xem'} ${answers.length} trả lời đã lấy</button>` : ''}
          <button type="button" class="cx-link" data-copy-one="${esc(id)}">${icon('doc')} Chép</button>
          <button type="button" class="cx-link ${isSaved('quote', id) ? 'on' : ''}" data-save-one="${esc(id)}">${icon('bookmark')} ${isSaved('quote', id) ? 'Đã lưu' : 'Lưu'}</button>
          ${v ? `<a class="cx-link" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('ext')} Video</a>` : ''}
        </div>
        ${open && answers.length ? `<div class="cx-thread">${answers.map((a) => `<div class="cx-answer">${esc(a.text)} <span class="muted small">♥ ${fmt(a.likes ?? 0)}${when(a.createdAt) ? ` · ${when(a.createdAt)}` : ''}</span>${(a.intents ?? []).filter((k) => k !== 'other').map((k) => `<span class="cx-tag t-${k}">${esc(INTENT_LABEL[k])}</span>`).join('')}</div>`).join('')}</div>` : ''}
      </div></div>`;
  }

  function render() {
    const base = narrowed();
    const counts = Object.fromEntries(INTENTS.map(([k]) => [k, base.filter((c) => (c.intents ?? ['other']).includes(k)).length]));
    box.querySelector('[data-intents]').innerHTML = [['', `Tất cả`, base.length], ...INTENTS.map(([k, l]) => [k, l, counts[k]])]
      .map(([k, l, n]) => `<button type="button" class="cx-chip ${st.intent === k ? 'on' : ''} ${k ? `c-${k}` : ''}" data-intent="${k}" aria-pressed="${st.intent === k}" ${n || k === st.intent ? '' : 'disabled'}>${esc(l)} <b>${fmt(n)}</b></button>`).join('');
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / prefs.per));
    st.page = Math.min(st.page, pages);
    const slice = list.slice((st.page - 1) * prefs.per, st.page * prefs.per);
    box.querySelector('[data-count]').textContent = list.length === all.length ? `${fmt(all.length)} comment` : `${fmt(list.length)} / ${fmt(all.length)} comment khớp bộ lọc`;
    box.querySelector('[data-list]').innerHTML = slice.length ? slice.map(row).join('') : `<div class="cx-empty">${emptyState('Không có comment khớp', ' Thử bỏ bớt chữ tìm kiếm hoặc bộ lọc.')}</div>`;
    const allPicked = list.length > 0 && list.every((c) => st.picked.has(String(c.id)));
    const n = st.picked.size;
    box.querySelector('[data-foot]').innerHTML = `
      <label class="cx-pickall"><input type="checkbox" class="tt-cb" data-pickall ${allPicked ? 'checked' : ''} ${list.length ? '' : 'disabled'}> Chọn tất cả (${fmt(list.length)})</label>
      <button type="button" class="btn sm" data-copy ${n ? '' : 'disabled'}>${icon('doc')} Sao chép${n ? ` (${n})` : ''}</button>
      <button type="button" class="btn sm" data-save-picked ${n ? '' : 'disabled'}>${icon('bookmark')} Lưu${n ? ` (${n})` : ''}</button>
      <button type="button" class="btn sm" data-csv ${n ? '' : 'disabled'} title="Tải các comment đã chọn thành file CSV">${icon('download')} CSV${n ? ` (${n})` : ''}</button>
      ${o.openFull ? `<a class="btn sm" href="${esc(o.openFull)}">${icon('message')} Mở trong Collect Comments</a>` : ''}
      <span class="spacer"></span>
      ${pages > 1 ? `<div class="tx-pager"><button type="button" data-page="${st.page - 1}" ${st.page > 1 ? '' : 'disabled'} aria-label="Trang trước">${icon('back')}</button>
        ${pageNumbers(st.page, pages).map((p) => (p === '…' ? '<span class="muted">…</span>' : `<button type="button" class="${p === st.page ? 'on' : ''}" data-page="${p}">${p}</button>`)).join('')}
        <button type="button" class="tt-flip" data-page="${st.page + 1}" ${st.page < pages ? '' : 'disabled'} aria-label="Trang sau">${icon('back')}</button></div>` : ''}
      <select class="input cx-select" data-per aria-label="Số comment mỗi trang">${[20, 50, 100].map((p) => opt(p, `${p} / trang`, prefs.per)).join('')}</select>`;
  }

  const savePrefs = () => persist('cx-prefs', prefs);
  const picked = () => [...st.picked].map((id) => byId.get(id)).filter(Boolean);
  const quoteOf = (c) => savedQuote(c, { video: o.videos.get(String(c.videoId)), topics: (c.intents ?? []).map((k) => INTENT_LABEL[k]).filter(Boolean), source: o.source?.title ?? '', recordId: o.source?.recordId });
  const copy = async (text, n) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Đã chép ${n} comment`);
    } catch {
      toast('Trình duyệt không cho chép, thử lại', 'error');
    }
  };
  on('input', '[data-q]', (e, el) => ((st.q = /** @type {HTMLInputElement} */ (el).value), (st.page = 1), render()));
  on('click', '[data-intent]', (e, el) => ((st.intent = el.dataset.intent ?? ''), (st.page = 1), render()));
  on('click', '[data-type]', (e, el) => {
    st.type = el.dataset.type ?? 'all';
    st.page = 1;
    box.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('on', b === el));
    render();
  });
  on('click', '[data-density]', (e, el) => {
    prefs.density = el.dataset.density === 'comfortable' ? 'comfortable' : 'compact';
    savePrefs();
    const root = box.querySelector('[data-cx]');
    root.classList.toggle('compact', prefs.density === 'compact');
    root.classList.toggle('comfortable', prefs.density === 'comfortable');
    box.querySelectorAll('[data-density]').forEach((b) => (b.classList.toggle('on', b === el), b.setAttribute('aria-pressed', String(b === el))));
  });
  on('change', '[data-video]', (e, el) => ((st.video = /** @type {HTMLSelectElement} */ (el).value), (st.page = 1), render()));
  on('change', '[data-facet]', (e, el) => ((st[el.dataset.facet] = /** @type {HTMLSelectElement} */ (el).value), (st.page = 1), render()));
  on('change', '[data-sort]', (e, el) => ((prefs.sort = /** @type {HTMLSelectElement} */ (el).value), savePrefs(), (st.page = 1), render()));
  on('change', '[data-per]', (e, el) => ((prefs.per = Number(/** @type {HTMLSelectElement} */ (el).value)), savePrefs(), (st.page = 1), render()));
  on('click', '[data-page]', (e, el) => {
    st.page = Number(el.dataset.page);
    render();
    box.querySelector('[data-list]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  on('change', '[data-pick]', (e, el) => (/** @type {HTMLInputElement} */ (el).checked ? st.picked.add(el.dataset.pick) : st.picked.delete(el.dataset.pick), render()));
  on('change', '[data-pickall]', (e, el) => {
    for (const c of filtered()) /** @type {HTMLInputElement} */ (el).checked ? st.picked.add(String(c.id)) : st.picked.delete(String(c.id));
    render();
  });
  on('click', '[data-thread]', (e, el) => (st.open.has(el.dataset.thread) ? st.open.delete(el.dataset.thread) : st.open.add(el.dataset.thread), render()));
  on('click', '[data-copy]', () => copy(picked().map(quoteLine).join('\n'), st.picked.size));
  on('click', '[data-copy-one]', (e, el) => copy(quoteLine(byId.get(el.dataset.copyOne)), 1));
  on('click', '[data-save-picked]', async () => (await saveMany('quote', picked().map(quoteOf), 'comment'), render()));
  on('click', '[data-save-one]', async (e, el) => {
    const c = byId.get(el.dataset.saveOne);
    if (!c) return;
    const q = quoteOf(c);
    await toggleSave('quote', q.ref, q.title, q.data);
    render();
  });
  on('click', '[data-csv]', () => {
    const head = ['Comment', 'Like', 'Trả lời', 'Ngày', 'Là trả lời', 'Ý định', 'Link video'];
    const lines = picked().map((c) => [c.text, c.likes ?? 0, c.replies ?? 0, c.createdAt ?? '', c.parentId ? 'Có' : '', (c.intents ?? []).map((k) => INTENT_LABEL[k]).join('; '), o.videos.get(String(c.videoId))?.url ?? ''].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob([`﻿${head.map(csvCell).join(',')}\n${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `comment-da-chon-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  render();
  return {
    off: () => offs.splice(0).forEach((f) => f()),
    set(patch) {
      Object.assign(st, patch, { page: 1 });
      for (const el of box.querySelectorAll('[data-facet]')) /** @type {HTMLSelectElement} */ (el).value = st[/** @type {HTMLElement} */ (el).dataset.facet] ?? '';
      const v = /** @type {HTMLSelectElement|null} */ (box.querySelector('[data-video]'));
      if (v) v.value = st.video ?? '';
      render();
    },
  };
}
