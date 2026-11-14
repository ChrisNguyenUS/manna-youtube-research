// What one check of a followed channel found: its latest videos with outlier scores, and which are new. Pure.

/**
 * @typedef {{id: string, title: string, url: string, thumb: string|null, views: number|null, score: number|null,
 *   ageDays: number|null, standout: boolean, pinned?: boolean}} FollowVideo  one video, the same shape for both platforms
 */

/**
 * @param {FollowVideo[]} videos newest first
 * @param {string[]} seen ids shown by earlier checks; on the first check nothing counts as new
 * @param {{at: string, keep?: number}} o
 */
export function followScan(videos, seen, { at, keep = 12 }) {
  const known = new Set(seen);
  const newIds = seen.length ? videos.filter((v) => !known.has(v.id)).map((v) => v.id) : [];
  const outlierIds = videos.filter((v) => v.standout && !v.pinned).map((v) => v.id);
  const wanted = new Set([...newIds, ...outlierIds]);
  const shown = videos.filter((v, i) => i < keep || wanted.has(v.id));
  return {
    lastScan: { at, error: null, videos: shown, newIds, outlierIds },
    seen: [...new Set([...seen, ...videos.map((v) => v.id)])].slice(-500),
  };
}
