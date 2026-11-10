// channel_analysis v1 → v2: same view/sub renames on its videos, phrases and durations.
import { upgradeVideos, upgradeMedians } from './common.js';

export const latest = 2;
/** @type {Record<number, (d: any) => any>} */
export const steps = {
  1: (d) => ({ ...d, videos: upgradeVideos(d.videos || []), phrases: upgradeMedians(d.phrases), durations: upgradeMedians(d.durations) }),
};
