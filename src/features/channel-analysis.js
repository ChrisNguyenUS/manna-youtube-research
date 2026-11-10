import { rethrowIfCancelled } from '../core/cancel.js';
// Use case: analyze one channel; compare analyzed channels. Receives everything through deps (docs/ARCHITECTURE.md §4).
import { noop } from './shared.js';
import { addVideoMetrics, channelStats, durationBuckets, median, sum, round } from '../core/metrics/index.js';
import { titlePhrases, titlePatterns, titleShape } from '../core/analysis/text.js';

/** @param {import('./shared.js').Deps & Record<string, any>} deps */
export function makeChannelAnalysis(deps) {
  const { source, store, settings, now, records } = deps;
  const { channelInfo, channelVideos, videoDetails, enrichVideos } = deps.enrich;
  return async function analyzeChannel(input, { max = 120, exactDates = 30 } = {}, progress = noop) {
    const s = settings();
    progress({ step: 'Tìm kênh', done: 0, total: 1 });
    const id = await source.resolveChannelId(input);
    const info = await source.getChannel(id, { about: true });
    store.cache.putChannel(info, true);
    progress({ step: 'Lấy danh sách video', done: 0, total: max });
    const vids = await source.getChannelVideos(id, { max, channel: info }, (n) => progress({ step: 'Lấy danh sách video', done: n, total: max }));
    store.cache.putChannelVideos(id, vids);
    let shorts = [];
    try {
      shorts = await source.getChannelShorts(id, { max: 60 });
    } catch (e) {
      rethrowIfCancelled(e);
      /* some channels have no shorts tab */
    }
    const details = new Map();
    await source.mapLimit(
      vids.slice(0, exactDates),
      async (v) => details.set(v.id, await videoDetails(v.id)),
      (done, total) => progress({ step: 'Lấy ngày đăng chính xác', done, total }),
    );
    const long = addVideoMetrics(
      vids.filter((v) => !v.isLive).map((v) => {
        const d = details.get(v.id);
        return d && !d.error ? { ...v, publishedAt: d.publishedAt, channelSubs: info.subs } : { ...v, channelSubs: info.subs };
      }),
      { minSubs: 0 },
    );
    const med = median(long.map((v) => v.views));
    const mult = s.outlierMultiple;
    const videos = long.map((v) => ({ ...v, vsMedian: med ? round(v.views / med, 1) : null, standout: med ? v.views >= mult * med : false }));
    const exact = videos.filter((v) => v.ageExact);
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dow = days.map((label, i) => {
      const list = exact.filter((v) => new Date(v.publishedAt).getDay() === i);
      return { label, count: list.length, medianViews: median(list.map((v) => v.views)) };
    });
    const span = exact.length > 1 ? (Date.parse(exact[0].publishedAt) - Date.parse(exact[exact.length - 1].publishedAt)) / 86400000 : null;
    const data = {
      info,
      stats: {
        ...channelStats(info, vids, { outlierMultiple: mult }),
        longCount: videos.length,
        longViews: sum(videos.map((v) => v.views)),
        shortsCount: shorts.length,
        shortsViews: sum(shorts.map((v) => v.views)),
        shortsMedian: median(shorts.map((v) => v.views)),
        medianAll: med,
        standoutCount: videos.filter((v) => v.standout).length,
        daysPerVideo: span && exact.length > 1 ? round(span / (exact.length - 1), 1) : null,
        exactFrom: exact[exact.length - 1]?.publishedAt || null,
        exactTo: exact[0]?.publishedAt || null,
        outlierMultiple: mult,
      },
      videos,
      shorts: shorts.slice(0, 30),
      durations: durationBuckets(videos),
      phrases: titlePhrases(videos, { metric: 'views', minCount: 2, limit: 30 }),
      patterns: titlePatterns(videos, { metric: 'vsMedian' }),
      titleShape: titleShape(videos),
      dayOfWeek: dow,
    };
    const recId = records.add('channel_analysis', info.title, { ref: id, params: { input }, data });
    return { id: recId, ...data };
  };
}

/** @param {import('./shared.js').Deps & Record<string, any>} deps */
export function makeCompareChannels(deps) {
  const { source, store, settings, now, records } = deps;
  return function compareChannels(ids) {
    return ids
      .map((cid) => records.latestByRef('channel_analysis', cid))
      .filter(Boolean)
      .map((r) => ({
        id: r.ref,
        recordId: r.id,
        created_at: r.created_at,
        info: r.data.info,
        stats: r.data.stats,
        durations: r.data.durations,
        phrases: r.data.phrases.slice(0, 10),
        patterns: r.data.patterns,
        dayOfWeek: r.data.dayOfWeek,
        top: [...r.data.videos].sort((a, b) => b.views - a.views).slice(0, 5),
      }));
  };
}
