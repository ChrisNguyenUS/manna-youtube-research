// Shared rename helpers for records written before the metric registry (2026-11-09).
// v1 used "outlier" for views ÷ subs; v2 calls it viewSub so "outlier" can only mean × channel.

const addVph = (v) => (v.vph != null || v.views == null || v.age == null ? v : { ...v, vph: Math.round((v.views / Math.max(v.age * 24, 1)) * 10) / 10 });

/** Rename key `from` → `to` on an object when present and `to` is absent. */
export function renameKey(o, from, to) {
  if (!o || typeof o !== 'object' || !(from in o) || to in o) return o;
  const { [from]: value, ...rest } = o;
  return { ...rest, [to]: value };
}

export const upgradeVideo = (v) => renameKey(addVph(v), 'outlier', 'viewSub');
export const upgradeVideos = (list) => (Array.isArray(list) ? list.map(upgradeVideo) : list);
export const upgradeMedians = (list) => (Array.isArray(list) ? list.map((x) => renameKey(x, 'medianOutlier', 'medianViewSub')) : list);
export const upgradeSummary = (s) => renameKey(s, 'outliers', 'viewSubOver1');
