// Video thresholds for TikTok search/insight: views, likes, posted within, engagement (tap again to clear).
import { chips, fmt } from '../lib.js';

const GROUPS = [
  ['minPlays', 'View tối thiểu', [10_000, 100_000, 1_000_000].map((v) => ({ v, label: fmt(v) + '+' }))],
  ['minLikes', 'Like tối thiểu', [1_000, 10_000, 100_000].map((v) => ({ v, label: fmt(v) + '+' }))],
  ['maxAgeDays', 'Đăng trong', [7, 30, 90, 365].map((v) => ({ v, label: v === 365 ? '1 năm' : `${v} ngày` }))],
  ['minEngagement', 'Tương tác ≥', [3, 5, 10].map((v) => ({ v, label: `${v}%` }))],
];

/** @param {Record<string, any>} st */
export function tiktokVideoFilters(st) {
  return `<div class="filter-table" style="margin-top:12px">${GROUPS.map(
    ([k, label, opts]) =>
      `<div class="filter-row"><div class="fr-label" ${k === 'minEngagement' ? 'data-tip="(like + comment + share + save) ÷ view"' : ''}>${label}</div>${chips(k, opts, st[k] || '').replace('data-chips=', 'data-allow-off data-chips=')}<div></div></div>`,
  ).join('')}</div>`;
}
