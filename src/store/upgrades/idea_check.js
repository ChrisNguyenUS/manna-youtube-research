// idea_check v1 → v2: top videos inside each keyword result use viewSub.
import { upgradeVideos } from './common.js';

export const latest = 2;
/** @type {Record<number, (d: any) => any>} */
export const steps = {
  1: (d) => ({ ...d, results: (d.results || []).map((r) => (r.top ? { ...r, top: upgradeVideos(r.top) } : r)) }),
};
