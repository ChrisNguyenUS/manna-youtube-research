// A TikTok creator's numbers, outlier-style (like core/metrics/outlier.js for YouTube). Pure: `now` is a parameter.
// Baseline = median plays of the creator's newest videos, leaving out pinned ones (usually old hits) and the
// videos found by search (search favours popular videos and would raise the bar).
import { median, round } from '../metrics/video.js';
import { videoMetrics } from './metrics.js';
import { titlePhrases, titlePatterns } from '../analysis/text.js';

export const TIKTOK_DURATIONS = [
  { label: 'Dưới 15 giây', min: 0, max: 15 },
  { label: '15–30 giây', min: 15, max: 30 },
  { label: '30–60 giây', min: 30, max: 60 },
  { label: '1–3 phút', min: 60, max: 180 },
  { label: 'Trên 3 phút', min: 180, max: Infinity },
];
const DAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const HOURS = [
  { label: '0–6 giờ', from: 0, to: 6 }, { label: '6–9 giờ', from: 6, to: 9 }, { label: '9–12 giờ', from: 9, to: 12 },
  { label: '12–15 giờ', from: 12, to: 15 }, { label: '15–18 giờ', from: 15, to: 18 }, { label: '18–21 giờ', from: 18, to: 21 }, { label: '21–24 giờ', from: 21, to: 24 },
];

/** Caption without hashtags or mentions, for phrase and pattern mining. @param {string} c */
export const captionText = (c) => String(c || '').replace(/[#@][\p{L}\p{N}_.]+/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Plays baseline of a creator's videos. `biased` when too few newest videos were found and search results were used.
 * @param {any[]} videos with plays, ageDays, pinned, from
 * @param {{minAge?: number}} [o] videos younger than minAge days are still collecting plays
 */
export function tiktokBaseline(videos, { minAge = 2 } = {}) {
  const unpinned = videos.filter((v) => !v.pinned && v.plays != null);
  const fair = unpinned.filter((v) => v.from !== 'search');
  const base = fair.length >= 5 ? fair : unpinned;
  const settled = base.filter((v) => v.ageDays == null || v.ageDays >= minAge);
  return {
    medianPlays: median((settled.length >= 3 ? settled : base).map((v) => v.plays)),
    sample: (settled.length >= 3 ? settled : base).length,
    biased: base !== fair,
  };
}

/** Median of `key` over `list`, rounded. */
const med = (list, key, d = 2) => round(median(list.map((v) => v[key])), d);
const groupStats = (label, list) => ({ label, count: list.length, medianPlays: median(list.map((v) => v.plays)), medianScore: med(list, 'outlierScore', 1) });

/**
 * @param {any} profile TikTokProfile (ports/tiktok-source.js)
 * @param {any[]} raw TikTokVideo[] with optional pinned and from
 * @param {{now: number, outlierMultiple?: number, minAge?: number}} o
 */
export function tiktokChannelReport(profile, raw, { now, outlierMultiple = 3, minAge = 2 }) {
  const withMetrics = raw
    .map((v) => ({ ...v, ...videoMetrics(v, now) }))
    .sort((a, b) => (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0));
  const base = tiktokBaseline(withMetrics, { minAge });
  const videos = withMetrics.map((v) => {
    const score = base.medianPlays ? round(v.plays / base.medianPlays, 1) : null;
    return { ...v, outlierScore: score, standout: score != null && score >= outlierMultiple, young: v.ageDays != null && v.ageDays < minAge };
  });
  const newest = videos.filter((v) => v.from !== 'search' && !v.pinned);
  const dated = newest.filter((v) => v.createdAt);
  const spanDays = dated.length > 1 ? (Date.parse(dated[0].createdAt) - Date.parse(dated[dated.length - 1].createdAt)) / 86_400_000 : null;
  const sampleForRate = newest.length >= 5 ? newest : videos.filter((v) => !v.pinned);
  const forText = videos.map((v) => ({ id: v.id, title: captionText(v.caption), views: v.plays, vsMedian: v.outlierScore }));

  const tags = new Map();
  for (const v of videos) for (const t of new Set((v.hashtags || []).map((h) => String(h).toLowerCase()))) tags.set(t, [...(tags.get(t) || []), v]);
  const hashtags = [...tags.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([tag, list]) => ({ ...groupStats(`#${tag}`, list), tag }))
    .sort((a, b) => (b.medianScore ?? -1) - (a.medianScore ?? -1) || b.count - a.count)
    .slice(0, 20);

  const local = videos.filter((v) => v.createdAt).map((v) => ({ v, d: new Date(v.createdAt) }));
  return {
    profile,
    stats: {
      followers: profile.followers,
      likes: profile.likes,
      videoCount: profile.videoCount,
      likesPerVideo: profile.videoCount ? Math.round(profile.likes / profile.videoCount) : null,
      sampleSize: videos.length,
      newestCount: newest.length,
      searchCount: videos.filter((v) => v.from === 'search').length,
      medianPlays: base.medianPlays,
      baselineSample: base.sample,
      baselineBiased: base.biased,
      playsPerFollower: base.medianPlays != null && profile.followers ? round(base.medianPlays / profile.followers, 3) : null,
      medianEngagement: med(sampleForRate, 'engagementRate', 4),
      postsPerWeek: spanDays && dated.length > 1 ? round(((dated.length - 1) / spanDays) * 7, 1) : null,
      daysPerPost: spanDays && dated.length > 1 ? round(spanDays / (dated.length - 1), 1) : null,
      lastPostDays: newest.find((v) => v.ageDays != null)?.ageDays ?? null,
      standoutCount: videos.filter((v) => v.standout).length,
      outlierMultiple,
      minAge,
    },
    videos,
    durations: TIKTOK_DURATIONS.map((b) => groupStats(b.label, videos.filter((v) => v.durationSec >= b.min && v.durationSec < b.max))).filter((b) => b.count),
    hashtags,
    phrases: titlePhrases(forText, { metric: 'vsMedian', minCount: 2, limit: 20 }),
    patterns: titlePatterns(forText, { metric: 'vsMedian' }),
    dayOfWeek: DAYS.map((label, i) => groupStats(label, local.filter((x) => x.d.getDay() === i).map((x) => x.v))),
    hours: HOURS.map((h) => groupStats(h.label, local.filter((x) => x.d.getHours() >= h.from && x.d.getHours() < h.to).map((x) => x.v))),
  };
}
