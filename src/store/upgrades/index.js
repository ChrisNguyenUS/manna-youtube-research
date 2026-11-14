// Records are upgraded to the latest shape when read, so UI code never patches old data.
// Changing the shape of a kind's data: bump `latest` in its module and add a step (docs/ARCHITECTURE.md §5.3).
import * as videoSearch from './video_search.js';
import * as research from './research.js';
import * as channelAnalysis from './channel_analysis.js';
import * as ideaCheck from './idea_check.js';
import * as videoAnalysis from './video_analysis.js';

const KINDS = { video_search: videoSearch, research, channel_analysis: channelAnalysis, idea_check: ideaCheck, tiktok_video_analysis: videoAnalysis, video_analysis: videoAnalysis };

/** @type {Record<string, number>} */
export const LATEST = Object.fromEntries(Object.entries(KINDS).map(([k, m]) => [k, m.latest]));

/** @param {string} kind @param {number} version @param {any} data @returns {{data: any, version: number}} */
export function upgradeRecord(kind, version, data) {
  const m = KINDS[kind];
  if (!m || data == null || version >= m.latest) return { data, version };
  let d = data;
  for (let v = version; v < m.latest; v++) d = m.steps[v](d);
  return { data: d, version: m.latest };
}
