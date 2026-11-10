// video_search record history:
//   v1 (≤ 2026-11-09): videos[].outlier = views ÷ channel subs; some rows lack vph.
//   v2: field renamed to viewSub (the name "outlier" now means × channel, see core metrics registry); vph always present.
const addVph = (v) => (v.vph != null || v.views == null || v.age == null ? v : { ...v, vph: Math.round((v.views / Math.max(v.age * 24, 1)) * 10) / 10 });
const renameViewSub = ({ outlier, ...v }) => ('viewSub' in v || outlier === undefined ? v : { ...v, viewSub: outlier });

export const latest = 2;
/** @type {Record<number, (d: any) => any>} */
export const steps = {
  1: (d) => ({ ...d, videos: (d.videos || []).map((v) => renameViewSub(addVph(v))) }),
};
