// src/core/video/metrics.js
// The numbers of one video in the "Phân tích video" compare table. Pure: `now` is a parameter.
const DAY = 86_400_000;

/**
 * @param {Record<string, any>} video a TikTokVideo (plays, createdAt, shares, saves) or a YouTube video (views, publishedAt)
 * @param {'tiktok'|'youtube'} platform @param {number} now
 * @returns {{views: number|null, ageDays: number|null, viewsPerDay: number|null, engagementRate: number|null}}
 */
export function videoRow(video, platform, now) {
  const tiktok = platform === 'tiktok';
  const views = (tiktok ? video.plays : video.views) ?? null;
  const at = tiktok ? video.createdAt : video.publishedAt;
  const age = at ? Math.max(0, (now - Date.parse(at)) / DAY) : null;
  const n = (x) => Number(x ?? 0);
  const interactions = n(video.likes) + n(video.comments) + (tiktok ? n(video.shares) + n(video.saves) : 0);
  return {
    views,
    ageDays: age == null ? null : Math.round(age * 10) / 10,
    viewsPerDay: views != null && age != null ? Math.round(views / Math.max(age, 1)) : null,
    engagementRate: views ? Math.round((interactions / views) * 10000) / 10000 : null,
  };
}
