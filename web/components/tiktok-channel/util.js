// Small helpers shared by the TikTok channel dashboard modules. Everything is computed from the saved report.
import { esc, median } from '../../lib.js';

export const METRICS = {
  plays: { label: 'Lượt xem', short: 'view' },
  likes: { label: 'Tim', short: 'tim' },
  comments: { label: 'Bình luận', short: 'comment' },
  shares: { label: 'Chia sẻ', short: 'share' },
};
export const RANGES = [['7', '7 ngày'], ['30', '30 ngày'], ['90', '90 ngày'], ['all', 'Tất cả']];

/** Vietnamese decimal: 1,5 */
export const num = (x, d = 1) => (x == null ? '–' : String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ','));
export const pct = (x) => (x == null ? '–' : `${num(x * 100)}%`);
/** dd/mm, with the year when it is not this year. */
export const ddmm = (iso) => {
  if (!iso) return '–';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}${d.getFullYear() === new Date().getFullYear() ? '' : `/${String(d.getFullYear()).slice(2)}`}`;
};
export const fullDate = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
/** Cover image. TikTok cover links expire after some days; an expired one falls back to a plain tile. */
export const cover = (v, cls = '') => (v.cover ? `<img class="${cls}" loading="lazy" src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.removeAttribute('src');this.classList.add('tc-noimg')">` : `<span class="${cls} tc-noimg"></span>`);
/** Caption without hashtags and mentions (same rule as the server's phrase mining). */
export const captionText = (c) => String(c || '').replace(/[#@][\p{L}\p{N}_.]+/gu, ' ').replace(/\s+/g, ' ').trim();
/** Within the last `range` days of the analysis ('all' keeps everything). */
export const inRange = (v, range) => range === 'all' || (v.ageDays != null && v.ageDays <= Number(range));

/** Group stats over a list of videos: count, median plays, median × channel median, median engagement. */
export function groupOf(list) {
  return {
    count: list.length,
    medianPlays: median(list.map((v) => v.plays)),
    medianScore: median(list.map((v) => v.outlierScore)),
    medianEr: median(list.map((v) => v.engagementRate)),
  };
}

/** Section card with a heading, an optional note and optional controls on the right. */
export const section = (id, title, body, { sub = '', tools = '' } = {}) =>
  `<section class="card tc-sec" data-sec="${id}"><div class="tc-sec-head"><div><h3>${title}</h3>${sub ? `<p class="tc-sub">${sub}</p>` : ''}</div>${tools ? `<div class="tc-tools">${tools}</div>` : ''}</div>${body}</section>`;

/** Segmented control. @param {string} name @param {[string, string][]} opts @param {string} value */
export const seg = (name, opts, value) => `<div class="tc-seg" role="group">${opts.map(([v, l]) => `<button type="button" data-seg="${name}" data-v="${esc(v)}" class="${String(value) === v ? 'on' : ''}" aria-pressed="${String(value) === v}">${esc(l)}</button>`).join('')}</div>`;
