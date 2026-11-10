// Use case: search videos by keyword with outlier / view-sub metrics. Receives everything through deps (docs/ARCHITECTURE.md §4).
import { noop, splitList, regionsFor, durationBucket, summarizeVideos } from './shared.js';

/** @param {import('./shared.js').Deps & Record<string, any>} deps */
export function makeVideoSearch(deps) {
  const { source, store, settings, now, records } = deps;
  const { channelInfo, channelVideos, videoDetails, enrichVideos } = deps.enrich;
  /**
   * params: { keywords, upload, sort, minDur, maxDur (seconds), perKeyword, gl, exactTop, likes, cc }
   * Server-side YouTube filters narrow the search; exact duration filtering is applied here.
   * Everything else (subs, views, age) is filtered in the UI so chips don't need a new scrape.
   */
  return async function videoSearch(params, progress = noop) {
    const s = settings();
    const keywords = splitList(params.keywords);
    if (!keywords.length) throw new Error('Nhập ít nhất một từ khoá');
    const minDur = params.minDur ? Number(params.minDur) : null;
    const maxDur = params.maxDur ? Number(params.maxDur) : null;
    const opts = {
      sort: params.sort || 'popularity',
      upload: params.upload || 'year',
      duration: durationBucket(minDur, maxDur),
      gl: params.gl || s.gl,
      max: Math.min(Number(params.perKeyword) || 60, 300),
      cc: !!params.cc,
    };
    const regions = regionsFor(opts.gl, s.globalRegions);
    const where = regions.length > 1 ? ` · ${regions.length} nước` : '';
    const total = opts.max * regions.length;
    const all = new Map();
    for (const [i, kw] of keywords.entries()) {
      const label = `Tìm "${kw}" (${i + 1}/${keywords.length})${where}`;
      progress({ step: label, done: 0, total });
      const list = await source.searchVideos(kw, { ...opts, regions: regions }, (n) => progress({ step: label, done: n, total }));
      for (const v of list) {
        const cur = all.get(v.id);
        if (cur) {
          cur.queries.push(kw);
          for (const r of v.regions || []) if (!cur.regions.includes(r)) cur.regions.push(r);
        } else all.set(v.id, { ...v, queries: [kw] });
      }
    }
    let videos = [...all.values()].filter((v) => !v.isLive);
    videos = videos.filter((v) => v.durationSec == null || ((minDur == null || v.durationSec >= minDur) && (maxDur == null || v.durationSec <= maxDur)));
    videos = await enrichVideos(videos, { exactTop: params.exactTop ?? 30, likes: !!params.likes, minSubs: s.minSubsForOutlier, outliers: params.outliers !== false, progress });
    videos.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    const result = { videos, keywords, opts, regions, summary: summarizeVideos(videos) };
    const id = records.add('video_search', keywords.join(', '), { params, data: result });
    return { id, ...result };
  };
}
