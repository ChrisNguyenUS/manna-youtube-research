// Tabs of customer-voice groups (questions, fears, complaints, buying, requests, top, all) with verbatim quotes.
import { esc, emptyState } from '../lib.js';

const quote = (c) => `<blockquote class="quote">${esc(c.text)}<div class="m">${c.likes} like · ${c.replies ?? 0} trả lời${c.attentionPerDay != null ? ` · ${c.attentionPerDay}/ngày` : ''}${c.parentText ? ` · trả lời: “${esc(c.parentText.slice(0, 100))}”` : ''}${c.videoId ? ` · <a href="https://www.tiktok.com/video/${encodeURIComponent(c.videoId)}" target="_blank" rel="noopener">xem video</a>` : ''}</div></blockquote>`;
export const quotes = (list) => (list?.length ? list.map(quote).join('') : emptyState('Không có'));

/** @param {any} insight @param {{counts?: Record<string, number>, extraTabs?: [string, string, any[]][]}} [o] */
export function commentGroups(insight, { counts = insight.groupCounts || insight.counts || {}, extraTabs = [] } = {}) {
  const tabs = [
    ['questions', `Khách hỏi (${counts.questions ?? 0})`, insight.questions],
    ['fears', `Lo sợ (${counts.fears ?? 0})`, insight.fears],
    ['complaints', `Phàn nàn (${counts.complaints ?? 0})`, insight.complaints],
    ['buying', `Muốn mua (${counts.buying ?? 0})`, insight.buying],
    ['requests', `Muốn xem thêm (${counts.requests ?? 0})`, insight.requests],
    ...extraTabs,
  ].filter(([, , list]) => list !== undefined); // newer TikTok insight has no complaints/requests groups
  return `<div class="cg"><div class="tabs">${tabs.map(([k, l], i) => `<button class="tab ${i ? '' : 'on'}" data-cg="${k}">${esc(l)}</button>`).join('')}</div>
    ${tabs.map(([k, , list], i) => `<div class="card-pad" data-cg-body="${k}" ${i ? 'hidden' : ''}>${quotes(list ?? [])}</div>`).join('')}</div>`;
}

export function bindCommentGroups(root) {
  const onClick = (e) => {
    const b = e.target.closest('[data-cg]');
    if (!b) return;
    const box = b.closest('.cg');
    box.querySelectorAll('[data-cg]').forEach((x) => x.classList.toggle('on', x === b));
    box.querySelectorAll('[data-cg-body]').forEach((x) => (x.hidden = x.dataset.cgBody !== b.dataset.cg));
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
