// Ranks scraped TikTok videos by what the user asked for, in this order of weight:
// trending (views gained per day) > engagement (lots of interactions, good ratio) > timeliness (recent).
// Pure: `now` is never read here, the videos already carry ageDays from videoMetrics().

export const SORTS = /** @type {const} */ (['score', 'trending', 'engagement', 'fresh', 'hot']);
/** @typedef {typeof SORTS[number]} Sort */

/** Combined score weights; they follow the priority order trending → engagement → fresh. */
export const WEIGHTS = { trending: 0.5, engagement: 0.3, fresh: 0.2 };
/** A video this many days old gets half the freshness of one posted today. */
export const FRESH_HALF_LIFE_DAYS = 14;

/**
 * Percentile (0..1) of each value among the non-null values; ties share the mid rank; null → null.
 * @param {(number|null)[]} values
 */
function percentiles(values) {
  const sorted = values.filter((v) => v != null).sort((a, b) => a - b);
  const n = sorted.length;
  return values.map((v) => {
    if (v == null) return null;
    if (n === 1) return 1;
    let below = 0;
    while (below < n && sorted[below] < v) below++;
    let equal = 0;
    while (below + equal < n && sorted[below + equal] === v) equal++;
    return (below + (equal - 1) / 2) / (n - 1);
  });
}

const round1 = (x) => Math.round(x * 10) / 10;

/** Views gained per day since posting; the +2 days matches Hot score so a 1-hour-old video does not explode. @param {{plays: number, ageDays: number|null}} v */
export const playsPerDay = (v) => (v.ageDays == null ? null : Math.round(v.plays / (v.ageDays + 2)));

/**
 * Adds playsPerDay and four 0–100 scores, sorts by `sort` and numbers the result from 1.
 * Ties fall back to trending, then engagement, then freshness, then raw interactions.
 * @template {{plays: number, interactions: number, engagementRate: number|null, ageDays: number|null, hotScore: number|null}} V
 * @param {V[]} videos
 * @param {{sort?: Sort}} [o]
 */
export function rankVideos(videos, { sort = 'score' } = {}) {
  const vpd = videos.map(playsPerDay);
  const pTrend = percentiles(vpd);
  const pInter = percentiles(videos.map((v) => v.interactions));
  const pRate = percentiles(videos.map((v) => v.engagementRate));
  const scored = videos.map((v, i) => {
    const trendingScore = round1((pTrend[i] ?? 0) * 100);
    // Lots of interactions AND a good ratio: one without the other is either an old viral video or a tiny one.
    const engagementScore = round1((((pInter[i] ?? 0) + (pRate[i] ?? 0)) / 2) * 100);
    const freshnessScore = v.ageDays == null ? 0 : round1(100 * 0.5 ** (v.ageDays / FRESH_HALF_LIFE_DAYS));
    const score = round1(WEIGHTS.trending * trendingScore + WEIGHTS.engagement * engagementScore + WEIGHTS.fresh * freshnessScore);
    return { ...v, playsPerDay: vpd[i], trendingScore, engagementScore, freshnessScore, score };
  });
  const key = {
    score: (v) => v.score,
    trending: (v) => v.playsPerDay ?? -1,
    engagement: (v) => v.engagementScore,
    fresh: (v) => (v.ageDays == null ? -Infinity : -v.ageDays),
    hot: (v) => v.hotScore ?? -1,
  }[sort] ?? ((v) => v.score);
  scored.sort(
    (a, b) =>
      key(b) - key(a) ||
      b.trendingScore - a.trendingScore ||
      b.engagementScore - a.engagementScore ||
      b.freshnessScore - a.freshnessScore ||
      b.interactions - a.interactions,
  );
  return scored.map((v, i) => ({ rank: i + 1, ...v }));
}
