// video_search record history:
//   v1 (≤ 2026-11-09): videos[].outlier = views ÷ channel subs; summary.outliers; some rows lack vph.
//   v2: viewSub / summary.viewSubOver1 (see core/metrics/definitions.js); vph always present.
import { upgradeVideos, upgradeSummary } from './common.js';

export const latest = 2;
/** @type {Record<number, (d: any) => any>} */
export const steps = {
  1: (d) => ({ ...d, videos: upgradeVideos(d.videos || []), summary: upgradeSummary(d.summary) }),
};
