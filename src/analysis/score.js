// Keyword score in the style of vidIQ (Volume / Competition / Overall, 0–100).
// vidIQ uses real search volume; we don't have it, so Volume is estimated from how many views the
// top results get (total and per day) plus whether YouTube autocompletes the keyword.
// Every sub-score is returned so the UI can show why a keyword scored what it did.
import { median } from './metrics.js';

const clamp = (x) => Math.max(0, Math.min(100, Math.round(x)));
/** log10 scale: value `lo` → 0 points, each ×10 adds `step` points. */
const logScore = (v, lo, step) => (v == null || v <= 0 ? 0 : clamp((Math.log10(v) - Math.log10(lo)) * step));
const mean = (a) => {
  const x = a.filter((n) => Number.isFinite(n));
  return x.length ? x.reduce((s, n) => s + n, 0) / x.length : null;
};

/** Strip Vietnamese accents + case so "ăn chay" matches "AN CHAY". */
export function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function titleMatches(title, keyword) {
  const t = ` ${normalize(title)} `;
  const words = normalize(keyword).split(' ').filter(Boolean);
  return words.length > 0 && words.every((w) => t.includes(` ${w} `) || t.replace(/ /g, '').includes(w));
}

export function band(score) {
  if (score == null) return { key: 'na', label: '–' };
  if (score >= 80) return { key: 'vhigh', label: 'Rất cao' };
  if (score >= 60) return { key: 'high', label: 'Cao' };
  if (score >= 40) return { key: 'mid', label: 'Trung bình' };
  if (score >= 20) return { key: 'low', label: 'Thấp' };
  return { key: 'vlow', label: 'Rất thấp' };
}

/**
 * videos: top search results (relevance) with views, channelSubs, age/ageDays, title.
 * extra: { ccCount, autocomplete: 'exact'|'prefix'|'none' }
 */
export function scoreKeyword(keyword, videos, { ccCount = null, captionsCount = null, autocomplete = 'none' } = {}) {
  const n = videos.length;
  const views = videos.map((v) => v.views).filter((x) => x != null);
  const subs = videos.map((v) => v.channelSubs).filter((x) => x != null);
  const ages = videos.map((v) => v.age ?? v.ageDays).filter((x) => x != null);
  const vpd = videos.map((v) => (v.views != null && (v.age ?? v.ageDays) != null ? v.views / Math.max(v.age ?? v.ageDays, 1) : null)).filter((x) => x != null);

  const stats = {
    results: n,
    highestViews: views.length ? Math.max(...views) : null,
    avgViews: mean(views),
    medianViews: median(views),
    avgSubs: mean(subs),
    medianSubs: median(subs),
    added7d: ages.filter((a) => a <= 7).length,
    added30d: ages.filter((a) => a <= 30).length,
    ccCount,
    avgAgeDays: mean(ages),
    titleMatch: n ? videos.filter((v) => titleMatches(v.title, keyword)).length : 0,
    descMatch: n ? videos.filter((v) => v.description && titleMatches(v.description, keyword)).length : 0,
    captionsCount,
    bigChannels: subs.filter((s) => s >= 1e6).length,
    medianViewsPerDay: median(vpd),
  };

  // Volume (demand): 100 views → 0, 10M → 100 ; 1 view/day → 0, 100K/day → 100
  const vViews = logScore(stats.medianViews, 100, 20);
  const vDaily = logScore(stats.medianViewsPerDay, 1, 20);
  const vSuggest = { exact: 100, prefix: 60, none: 0 }[autocomplete] ?? 0;
  const volume = n ? clamp(0.5 * vViews + 0.3 * vDaily + 0.2 * vSuggest) : 0;

  // Competition (supply strength): big channels, optimized titles, fresh uploads
  const cSubs = logScore(stats.medianSubs, 100, 20); // 1K → 20, 100K → 60, 10M → 100
  const cTitle = n ? (stats.titleMatch / n) * 100 : 0;
  const cBig = n ? (stats.bigChannels / n) * 100 : 0;
  const cFresh = n ? (stats.added30d / n) * 100 : 0;
  const competition = n ? clamp(0.45 * cSubs + 0.25 * cTitle + 0.15 * cBig + 0.15 * cFresh) : 0;

  const overall = n ? clamp(0.55 * volume + 0.45 * (100 - competition)) : 0;

  return {
    keyword,
    overall,
    volume,
    competition,
    bands: { overall: band(overall), volume: band(volume), competition: band(competition) },
    parts: {
      volume: [
        { label: 'View trung vị top kết quả', score: vViews, weight: 0.5 },
        { label: 'View/ngày trung vị', score: vDaily, weight: 0.3 },
        { label: 'YouTube gợi ý khi gõ', score: vSuggest, weight: 0.2, note: { exact: 'có, đúng cụm này', prefix: 'có cụm dài hơn', none: 'không' }[autocomplete] },
      ],
      competition: [
        { label: 'Sub trung vị của kênh', score: clamp(cSubs), weight: 0.45 },
        { label: 'Tiêu đề chứa đúng từ khoá', score: clamp(cTitle), weight: 0.25 },
        { label: 'Kênh ≥ 1 triệu sub', score: clamp(cBig), weight: 0.15 },
        { label: 'Video mới trong 30 ngày', score: clamp(cFresh), weight: 0.15 },
      ],
    },
    stats,
  };
}

/** Does YouTube autocomplete this keyword? Checks suggestions for the keyword itself. */
export function autocompleteMatch(keyword, suggestions) {
  const k = normalize(keyword);
  const list = (suggestions || []).map(normalize);
  if (list.includes(k)) return 'exact';
  if (list.some((s) => s.startsWith(k + ' '))) return 'prefix';
  return 'none';
}

export function topChannels(videos, limit = 6) {
  const map = new Map();
  for (const v of videos) {
    if (!v.channelId) continue;
    const c = map.get(v.channelId) || { id: v.channelId, title: v.channelTitle, handle: v.channelHandle, avatar: v.channelAvatar, subs: v.channelSubs, count: 0, views: 0, best: null };
    c.count++;
    c.views += v.views || 0;
    if (!c.best || (v.views || 0) > c.best.views) c.best = { id: v.id, title: v.title, views: v.views || 0 };
    map.set(v.channelId, c);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.views - a.views).slice(0, limit);
}
