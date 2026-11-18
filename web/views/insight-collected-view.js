// "Insight khách hàng" → "Từ comment đã có", the same on TikTok and YouTube: put together comments already collected
// across chosen videos, creators and periods. Collects nothing; every number opens the original comments behind it.
// What differs per platform comes in `pf` (web/views/tiktok/insight-collected.js, web/views/insight-collected.js).
import { esc, icon, fmt, ago, emptyState, errorCallout, progressCard, store, persist } from '../lib.js';
import { commentExplorer, INTENTS } from '../components/comment-explorer.js';
import { scope } from '../dom.js';

/**
 * @typedef {{
 *   platform: 'tiktok'|'youtube', formKey: string, intro: string, emptyHint: string, kinds: Record<string, string>,
 *   data: {videos: () => Promise<any[]>, of: (ids: string[]) => Promise<any>},
 * }} CollectedCfg
 *   kinds: report kind → how the list names it; data: the platform's collected-comment API
 */

const DAY = 86_400_000;
const PERIODS = [['7', '7 ngày'], ['30', '30 ngày'], ['90', '90 ngày'], ['all', 'Mọi lúc']];
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** @param {Element} root @param {CollectedCfg} pf */
export async function mountCollected(root, pf) {
  const at = (a) => (pf.platform === 'youtube' ? a : `@${a}`); // a TikTok creator is a @handle, a YouTube one a channel name
  const st = store(pf.formKey, { period: 'all', creator: '', q: '' });
  const picked = new Set();
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('message')} Insight từ comment đã có</h1>
      <p>${pf.intro}</p></div></div>
    <div class="card" data-pick></div>
    <div data-out style="margin-top:14px"></div>`;
  const pickBox = /** @type {HTMLElement} */ (root.querySelector('[data-pick]'));
  const out = /** @type {HTMLElement} */ (root.querySelector('[data-out]'));
  const shown = scope();
  /** @type {any[]} */
  let videos = [];
  try {
    videos = await pf.data.videos();
  } catch (e) {
    pickBox.innerHTML = errorCallout(e);
    return () => shown.off();
  }
  const creators = [...new Set(videos.map((v) => v.author).filter(Boolean))].sort();
  const KIND = pf.kinds;

  const visible = () => videos.filter((v) => (st.period === 'all' || Date.now() - v.lastSeen <= Number(st.period) * DAY) && (!st.creator || v.author === st.creator)
    && (!st.q || fold(`${v.caption} ${v.author}`).includes(fold(st.q))));
  function renderPick() {
    if (!videos.length) return void (pickBox.innerHTML = `<div class="card-pad">${emptyState('Chưa có bình luận nào được thu thập', pf.emptyHint)}</div>`);
    const list = visible();
    const chosen = list.filter((v) => picked.has(v.id));
    pickBox.innerHTML = `<div class="card-head"><h3>Chọn nguồn</h3><span class="sub">${videos.length} video có bình luận</span></div>
      <div class="cx-tools"><label class="cx-search">${icon('search')}<input data-q type="search" placeholder="Tìm theo caption hoặc creator" value="${esc(st.q)}" aria-label="Tìm video"></label>
        <div class="cx-seg" role="group" aria-label="Thời gian thu thập">${PERIODS.map(([k, l]) => `<button type="button" data-period="${k}" class="${st.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${creators.length > 1 ? `<select class="input cx-select" data-creator aria-label="Creator"><option value="">Mọi creator (${creators.length})</option>${creators.map((a) => `<option value="${esc(a)}" ${st.creator === a ? 'selected' : ''}>${esc(at(a))}</option>`).join('')}</select>` : ''}</div>
      <div class="ic-list">${list.map((v) => `<label class="ic-row"><input type="checkbox" class="tt-cb" data-v="${esc(v.id)}" ${picked.has(v.id) ? 'checked' : ''}>
        ${v.cover ? `<img src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '<span class="cc-noimg"></span>'}
        <span class="cc-vtext"><b>${esc(v.caption || v.url)}</b><span class="muted small">${v.author ? `${esc(at(v.author))} · ` : ''}${fmt(v.parents)} gốc + ${fmt(v.replies)} trả lời · ${ago(v.lastSeen)} · ${[...new Set(v.collections.map((c) => KIND[c.kind] ?? c.kind))].join(', ')}</span></span></label>`).join('') || `<div class="card-pad">${emptyState('Không có video khớp bộ lọc')}</div>`}</div>
      <div class="cx-foot"><label class="cx-pickall"><input type="checkbox" class="tt-cb" data-all ${list.length && list.every((v) => picked.has(v.id)) ? 'checked' : ''}> Chọn tất cả (${list.length})</label><span class="spacer"></span>
        <button type="button" class="btn primary" data-go ${chosen.length ? '' : 'disabled'}>${icon('bars')} Tổng hợp ${chosen.length} video · ${fmt(chosen.reduce((a, v) => a + v.total, 0))} comment</button></div>`;
  }
  const save = () => persist(pf.formKey, st);
  pickBox.addEventListener('input', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (!el.matches('[data-q]')) return;
    st.q = el.value;
    save();
    renderPick();
    const i = /** @type {HTMLInputElement} */ (pickBox.querySelector('[data-q]'));
    i.focus();
    i.setSelectionRange(i.value.length, i.value.length);
  });
  pickBox.addEventListener('change', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.matches('[data-v]')) el.checked ? picked.add(el.dataset.v) : picked.delete(el.dataset.v);
    else if (el.matches('[data-all]')) for (const v of visible()) el.checked ? picked.add(v.id) : picked.delete(v.id);
    else if (el.matches('[data-creator]')) (st.creator = el.value), save();
    else return;
    renderPick();
  });
  pickBox.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const p = /** @type {HTMLElement|null} */ (t.closest('[data-period]'));
    if (p) return void ((st.period = p.dataset.period), save(), renderPick());
    if (t.closest('[data-go]')) aggregate(visible().filter((v) => picked.has(v.id)).map((v) => v.id));
  });

  async function aggregate(ids) {
    out.innerHTML = progressCard('Đang gộp bình luận');
    try {
      const d = await pf.data.of(ids);
      const parents = d.comments.filter((c) => !c.parentId && !c.isReply).length;
      const total = d.comments.length || 1;
      const themes = (d.themes?.topics ?? []).filter((t) => t.kind === 'question');
      const themeIds = new Map(themes.map((t) => [t.key, new Set(t.ids)]));
      const sample = (k) => d.comments.filter((c) => c.intents.includes(k)).sort((a, b) => (b.likes ?? 0) + (b.replies ?? 0) - ((a.likes ?? 0) + (a.replies ?? 0))).slice(0, 2);
      out.innerHTML = `<div class="card cc-run">
        <div class="cc-sum"><div><span>Video</span><b>${d.videos.length}</b></div><div><span>Comment gốc</span><b>${fmt(parents)}</b></div><div><span>Trả lời</span><b>${fmt(d.comments.length - parents)}</b></div>
          <div><span>Tổng</span><b>${fmt(d.comments.length)}</b></div><div><span>Creator</span><b>${new Set(d.videos.map((v) => v.author).filter(Boolean)).size}</b></div></div>
        <div class="ic-grid">${INTENTS.filter(([k]) => k !== 'other').map(([k, l]) => `<button type="button" class="ic-card c-${k}" data-intent="${k}" ${d.counts[k] ? '' : 'disabled'}>
          <span class="ic-head"><b>${esc(l)}</b><span>${fmt(d.counts[k])} · ${Math.round((d.counts[k] / total) * 100)}%</span></span>
          ${sample(k).map((c) => `<span class="ic-quote">“${esc(String(c.text).slice(0, 110))}”</span>`).join('') || '<span class="muted small">Không có</span>'}</button>`).join('')}</div>
        ${themes.length ? `<div class="ic-themes"><h4>Câu hỏi hay gặp theo chủ đề</h4>${themes.map((t) => `<button type="button" class="ic-theme" data-theme="${esc(t.key)}"><span>${esc(t.label)}</span><span class="tc-bar"><i style="width:${(t.count / Math.max(...themes.map((x) => x.count))) * 100}%"></i></span><b>${t.count}</b></button>`).join('')}
          <p class="cx-note">Nhóm câu hỏi theo luật từ khoá của Insight; một câu hỏi có thể thuộc nhiều nhóm. Lọc người bán dịch vụ ra khỏi nhóm câu hỏi.</p></div>` : ''}
        <div data-explorer></div></div>`;
      shown.off();
      const el = /** @type {HTMLElement} */ (out.querySelector('[data-explorer]'));
      const explorer = commentExplorer(el, {
        comments: d.comments, videos: new Map(d.videos.map((v) => [String(v.id), v])), mode: 'full', platform: pf.platform, source: { title: `Insight từ ${d.videos.length} video` },
        facets: themes.length ? [{ key: 'theme', label: 'Chủ đề câu hỏi', all: 'Mọi chủ đề câu hỏi', choices: themes.map((t) => ({ value: t.key, label: `${t.label} (${t.count})` })), test: (c, v) => !!themeIds.get(v)?.has(c.id) }] : [],
      });
      shown.add(explorer.off);
      const go = (patch) => (explorer.set(patch), el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      out.querySelectorAll('[data-intent]').forEach((b) => b.addEventListener('click', () => go({ intent: /** @type {HTMLElement} */ (b).dataset.intent, theme: '' })));
      out.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => go({ theme: /** @type {HTMLElement} */ (b).dataset.theme, intent: '' })));
    } catch (e) {
      out.innerHTML = errorCallout(e);
    }
  }

  for (const v of visible()) picked.add(v.id);
  renderPick();
  return () => shown.off();
}
