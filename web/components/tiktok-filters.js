// Video thresholds for TikTok search/insight: views, likes, posted within, engagement (tap again to clear).
import { chips, fmt, icon } from '../lib.js';

const GROUPS = [
  ['minPlays', 'View tối thiểu', [10_000, 100_000, 1_000_000].map((v) => ({ v, label: fmt(v) + '+' }))],
  ['minLikes', 'Like tối thiểu', [1_000, 10_000, 100_000].map((v) => ({ v, label: fmt(v) + '+' }))],
  ['maxAgeDays', 'Đăng trong', [7, 30, 90, 365].map((v) => ({ v, label: v === 365 ? '1 năm' : `${v} ngày` }))],
  ['minEngagement', 'Tương tác ≥', [3, 5, 10].map((v) => ({ v, label: `${v}%` }))],
];

// Same thresholds as dropdowns, for the insight setup: label, icon, what "off" says, and a one-line explanation.
const SELECTS = {
  minPlays: ['Lượt xem tối thiểu', 'eye', 'Không lọc', 'Bỏ video ít view hơn mức này.'],
  minLikes: ['Lượt tim tối thiểu', 'heart', 'Không lọc', 'Bỏ video ít tim hơn mức này.'],
  maxAgeDays: ['Thời gian đăng', 'calendar', 'Mọi lúc', 'Chỉ giữ video đăng trong khoảng này.'],
  minEngagement: ['Tỉ lệ tương tác tối thiểu', 'bars', 'Không lọc', 'Tương tác = (tim + comment + share + lưu) ÷ view.'],
};

/** The four video thresholds as labelled dropdowns (values exactly as the chips above). @param {Record<string, any>} st */
export function tiktokFilterSelects(st) {
  return `<div class="ix-filters">${GROUPS.map(([k, , opts]) => {
    const [label, ic, off, help] = SELECTS[k];
    const cur = Number(st[k]) || 0;
    return `<label class="ix-filter"><span class="ix-flabel">${label} <span class="ix-tip" data-tip="${help}">${icon('info')}</span></span>
      <span class="tt-pill">${icon(ic)}<select data-filter="${k}"><option value="0" ${cur ? '' : 'selected'}>${off}</option>${opts.map((o) => `<option value="${o.v}" ${cur === o.v ? 'selected' : ''}>${o.label}</option>`).join('')}</select></span>
      <span class="ix-help">${help}</span></label>`;
  }).join('')}</div>`;
}

/** @param {Record<string, any>} st */
export function tiktokVideoFilters(st) {
  return `<div class="filter-table" style="margin-top:12px">${GROUPS.map(
    ([k, label, opts]) =>
      `<div class="filter-row"><div class="fr-label" ${k === 'minEngagement' ? 'data-tip="(like + comment + share + save) ÷ view"' : ''}>${label}</div>${chips(k, opts, st[k] || '').replace('data-chips=', 'data-allow-off data-chips=')}<div></div></div>`,
  ).join('')}</div>`;
}

/** Search settings of a saved TikTok report, for history lists: "10 N view+ · top 10 video · đăng trong 30 ngày". @param {Record<string, any>|null} p */
export function tiktokCriteria(p) {
  if (!p) return '';
  const parts = [];
  if (Number(p.minPlays)) parts.push(`${fmt(Number(p.minPlays))} view+`);
  if (Number(p.minLikes)) parts.push(`${fmt(Number(p.minLikes))} like+`);
  if (Number(p.maxAgeDays)) parts.push(Number(p.maxAgeDays) === 365 ? 'đăng trong 1 năm' : `đăng trong ${p.maxAgeDays} ngày`);
  if (Number(p.minEngagement)) parts.push(`tương tác ≥ ${p.minEngagement}%`);
  if (p.top) parts.push(`top ${p.top} video`);
  if (p.commentsPerVideo) parts.push(`${p.commentsPerVideo} cmt/video`);
  if (p.perKeyword && !p.top) parts.push(`${p.perKeyword} video/từ khoá`);
  if (p.keywords && p.topic) parts.push(`${String(p.keywords).split(/[,\n]/).filter((x) => x.trim()).length} từ khoá`);
  if (p.sort && p.sort !== 'score') parts.push({ plays: 'xếp theo view', trending: 'xếp theo view/ngày', fresh: 'mới nhất trước' }[p.sort] || '');
  if (p.keepOffTopic) parts.push('giữ cả video lạc đề');
  if (p.keepPrevious === false) parts.push('không giữ video lần trước');
  if (p.topComments === 0) parts.push('không lấy comment');
  return parts.filter(Boolean).join(' · ');
}
