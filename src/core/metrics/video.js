export function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function sum(nums) {
  return nums.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
}

export function round(n, d = 2) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Age in days from an exact ISO date (preferred) or the relative estimate. */
export function ageDays(video, now = Date.now()) {
  if (video.publishedAt) {
    const t = Date.parse(video.publishedAt);
    if (!Number.isNaN(t)) return Math.max((now - t) / 86400000, 0);
  }
  return video.ageDays ?? null;
}

/**
 * Adds viewSub (views ÷ channel subs), vph and viewsPerDay to each video.
 * Channels below minSubs get viewSub=null (sample too small to mean anything).
 */
export function addVideoMetrics(videos, { minSubs = 500, now = Date.now() } = {}) {
  return videos.map((v) => {
    const age = ageDays(v, now);
    const subs = v.channelSubs;
    return {
      ...v,
      age: age == null ? null : round(age, 1),
      ageExact: !!v.publishedAt,
      viewsPerDay: v.views != null && age != null ? Math.round(v.views / Math.max(age, 1)) : null,
      vph: v.views != null && age != null ? round(v.views / Math.max(age * 24, 1), 1) : null,
      viewSub: v.views != null && subs != null && subs >= minSubs ? round(v.views / subs, 2) : null,
    };
  });
}

export const DURATION_BUCKETS = [
  { key: 'lt1', label: '< 1 phút', min: 0, max: 60 },
  { key: '1-4', label: '1–4 phút', min: 60, max: 240 },
  { key: '4-10', label: '4–10 phút', min: 240, max: 600 },
  { key: '10-20', label: '10–20 phút', min: 600, max: 1200 },
  { key: '20-60', label: '20–60 phút', min: 1200, max: 3600 },
  { key: 'gt60', label: '> 1 giờ', min: 3600, max: Infinity },
];

export function durationBuckets(videos, valueKey = 'views') {
  return DURATION_BUCKETS.map((b) => {
    const list = videos.filter((v) => v.durationSec != null && v.durationSec >= b.min && v.durationSec < b.max);
    return {
      ...b,
      max: Number.isFinite(b.max) ? b.max : null,
      count: list.length,
      medianViews: median(list.map((v) => v.views)),
      medianValue: median(list.map((v) => v[valueKey])),
      medianViewSub: median(list.map((v) => v.viewSub)),
      medianViewsPerDay: median(list.map((v) => v.viewsPerDay)),
    };
  }).filter((b) => b.count > 0);
}
