// Channel health numbers (Playboard-style) computed from public data.
import { median, sum, round } from './video.js';

/** Channel health from its latest long videos (Playboard-style numbers, computed from public data). */
export function channelStats(info, videos, { outlierMultiple = 3, now = Date.now() } = {}) {
  const long = videos.filter((v) => !v.isLive && v.views != null);
  const recent30 = long.slice(0, 30);
  const med = median(recent30.map((v) => v.views));
  const within = (d) => long.filter((v) => v.ageDays != null && v.ageDays <= d);
  const last = long.find((v) => v.ageDays != null);
  const in90 = within(90).length;
  const joinedDays = info.joined ? (now - Date.parse(info.joined)) / 86400000 : null;
  return {
    medianViews: med,
    views7d: sum(within(7).map((v) => v.views)),
    views30d: sum(within(30).map((v) => v.views)),
    uploads30d: within(30).length,
    uploadsPerWeek: round(in90 / (90 / 7), 1),
    lastUploadDays: last ? round(last.ageDays, 1) : null,
    viewSubRatio: med != null && info.subs ? round(med / info.subs, 3) : null,
    outlierCount: med ? recent30.filter((v) => v.views >= outlierMultiple * med).length : 0,
    channelAgeDays: joinedDays == null ? null : Math.round(joinedDays),
    sampleSize: recent30.length,
  };
}
