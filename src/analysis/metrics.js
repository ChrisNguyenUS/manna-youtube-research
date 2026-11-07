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
 * Adds outlier (views / channel subs) and viewsPerDay to each video.
 * Channels below minSubs get outlier=null (sample too small to mean anything).
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
      outlier: v.views != null && subs != null && subs >= minSubs ? round(v.views / subs, 2) : null,
    };
  });
}

/**
 * A channel's "typical" performance from its latest long videos (1of10/vidIQ-style outlier baseline).
 * - medianViews: median views of videos at least `minAge` days old. Brand-new uploads haven't
 *   collected their views yet and would drag the baseline down (inflating every score).
 * - medianVph: median views/hour of videos 1–30 days old, used to judge videos younger than `minAge`.
 */
export function channelBaseline(channelVideos, { minAge = 7, exclude = null } = {}) {
  const list = (channelVideos || []).filter((v) => !v.isLive && v.views != null && v.ageDays != null && v.id !== exclude);
  const settled = list.filter((v) => v.ageDays >= minAge);
  const young = list.filter((v) => v.ageDays >= 1 && v.ageDays <= 30);
  return {
    medianViews: settled.length >= 3 ? median(settled.map((v) => v.views)) : null,
    medianVph: young.length >= 3 ? median(young.map((v) => v.views / (v.ageDays * 24))) : null,
    sample: settled.length,
  };
}

/** Outlier score = views ÷ channel's typical views; videos under `minAge` days compare VPH instead. */
export function outlierScore(video, baseline, { minAge = 7 } = {}) {
  if (!baseline || video.views == null) return { outlierScore: null, outlierBasis: null };
  if (video.durationSec != null && video.durationSec <= 60) return { outlierScore: null, outlierBasis: null }; // Shorts: baseline is long videos only
  const age = video.age ?? video.ageDays;
  if (age != null && age < minAge && baseline.medianVph) {
    const vph = video.views / Math.max(age * 24, 1);
    return { outlierScore: round(vph / baseline.medianVph, 1), outlierBasis: 'vph' };
  }
  if (!baseline.medianViews) return { outlierScore: null, outlierBasis: null };
  return { outlierScore: round(video.views / baseline.medianViews, 1), outlierBasis: 'views' };
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
      medianOutlier: median(list.map((v) => v.outlier)),
      medianViewsPerDay: median(list.map((v) => v.viewsPerDay)),
    };
  }).filter((b) => b.count > 0);
}

/** Channel health from its latest long videos (Playboard-style numbers, computed from public data). */
export function channelStats(info, videos, { outlierMultiple = 3 } = {}) {
  const long = videos.filter((v) => !v.isLive && v.views != null);
  const recent30 = long.slice(0, 30);
  const med = median(recent30.map((v) => v.views));
  const within = (d) => long.filter((v) => v.ageDays != null && v.ageDays <= d);
  const last = long.find((v) => v.ageDays != null);
  const in90 = within(90).length;
  const joinedDays = info.joined ? (Date.now() - Date.parse(info.joined)) / 86400000 : null;
  return {
    medianViews: med,
    views7d: sum(within(7).map((v) => v.views)),
    views30d: sum(within(30).map((v) => v.views)),
    uploads30d: within(30).length,
    uploadsPerWeek: round(in90 / (90 / 7), 1),
    lastUploadDays: last ? round(last.ageDays, 1) : null,
    viewSubRatio: med != null && info.subs ? round(med / info.subs, 3) : null,
    outlierCount: med ? recent30.filter((v) => v.views >= outlierMultiple * med).length : 0,
    channelAgeDays: joinedDays == null ? null : Math.round(joinedDays),
    sampleSize: recent30.length,
  };
}
