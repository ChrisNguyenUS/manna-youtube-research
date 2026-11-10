// research record history: v1 → v2 renames every view/sub field (see common.js).
import { upgradeVideos, upgradeSummary, upgradeMedians, renameKey } from './common.js';

const bestViewSub = (list) => (Array.isArray(list) ? list.map((c) => ({ ...renameKey(c, 'bestOutlier', 'bestViewSub'), videos: (c.videos || []).map((v) => renameKey(v, 'outlier', 'viewSub')) })) : list);

export const latest = 2;
/** @type {Record<number, (d: any) => any>} */
export const steps = {
  1: (d) =>
    renameKey(
      {
        ...d,
        videos: upgradeVideos(d.videos || []),
        summary: upgradeSummary(d.summary),
        durations: upgradeMedians(d.durations),
        phrases: upgradeMedians(d.phrases),
        channels: bestViewSub(d.channels),
        smallWinners: bestViewSub(d.smallWinners),
      },
      'topByOutlier',
      'topByViewSub',
    ),
};
