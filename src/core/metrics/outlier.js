// 1of10/vidIQ-style outlier score: a video vs its own channel's typical views.
import { median, round } from './video.js';

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
