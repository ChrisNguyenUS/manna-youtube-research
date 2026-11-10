// Helpers shared by the use cases: option parsing, cached channel/video lookups, enrichment.
import { addVideoMetrics, channelBaseline, outlierScore, median } from '../core/metrics/index.js';

export { regionsFor, durationBucket } from '../core/search-options.js';

/**
 * @typedef {{source: import('../ports/youtube-source.js').YouTubeSource, store: import('../ports/store.js').Store,
 *   ws: string, settings: () => Record<string, any>, now: () => number, records: ReturnType<typeof recordsFor>}} Deps
 */

/** @type {(p?: any) => void} */
export const noop = () => {};
/** @param {string|string[]|undefined} s */
export const splitList = (s) => (Array.isArray(s) ? s : String(s || '').split(/[,\n]/)).map((x) => x.trim()).filter(Boolean);

/** v0-style records API bound to one workspace, so use-case bodies stay readable. */
export function recordsFor(store, ws) {
  return {
    /** @param {string} kind @param {string} title @param {any} [o] */
    add: (kind, title, o) => store.records.add(ws, kind, title, o),
    get: (id) => store.records.get(ws, id),
    update: (id, data) => store.records.update(ws, id, data),
    remove: (id) => store.records.remove(ws, id),
    latestByRef: (kind, ref) => store.records.latestByRef(ws, kind, ref),
  };
}

/** @param {Omit<Deps, 'records'>} deps */
export function makeEnrich(deps) {
  const { source, store } = deps;
  async function channelInfo(id, { about = false } = {}) {
    const hit = store.cache.getChannel(id, { needAbout: about });
    if (hit) return hit;
    const info = await source.getChannel(id, { about });
    store.cache.putChannel(info, about);
    return info;
  }

  /** @param {string} id @param {{max?: number, channel?: any}} [o] */
  async function channelVideos(id, { max = 30, channel } = {}) {
    const hit = store.cache.getChannelVideos(id, { min: max });
    if (hit) return hit.slice(0, max);
    const list = await source.getChannelVideos(id, { max, channel });
    store.cache.putChannelVideos(id, list);
    return list;
  }

  async function videoDetails(id, { likes = false } = {}) {
    const hit = store.cache.getVideo(id);
    if (hit && (!likes || hit.likes != null)) return hit;
    const d = await source.getVideo(id, { likes });
    store.cache.putVideo(d);
    return d;
  }

  /** Attach channel subs to videos, then exact dates/likes for the top `exactTop` by views. */
  /**
   * Attach channel subs to videos; with `outliers`, also each channel's latest 30 videos (cached a day)
   * to score videos against the channel's own typical views (1of10/vidIQ-style outlier score).
   */
  async function enrichVideos(videos, { exactTop = 0, likes = false, minSubs, outliers = false, progress = noop }) {
    const ids = [...new Set(videos.map((v) => v.channelId).filter(Boolean))];
    const subs = new Map();
    const recentByChannel = new Map();
    const step = outliers ? 'Lấy sub + video gần đây của kênh' : 'Lấy số sub của kênh';
    progress({ step, done: 0, total: ids.length });
    await source.mapLimit(
      ids,
      async (id) => {
        const info = await channelInfo(id);
        subs.set(id, info);
        if (outliers) recentByChannel.set(id, await channelVideos(id, { max: 30, channel: info }).catch(() => []));
      },
      (done, total) => progress({ step, done, total }),
    );
    let out = videos.map((v) => {
      const c = subs.get(v.channelId);
      const base = { ...v, channelSubs: c?.subs ?? null, channelHandle: v.channelHandle || c?.handle || null, channelAvatar: c?.avatar || null };
      if (!outliers) return base;
      const bl = channelBaseline(recentByChannel.get(v.channelId), { exclude: v.id });
      return { ...base, channelMedianViews: bl.medianViews, channelBaselineSample: bl.sample, _baseline: bl };
    });
    if (exactTop > 0) {
      const top = [...out].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, exactTop);
      const details = new Map();
      await source.mapLimit(
        top,
        async (v) => details.set(v.id, await videoDetails(v.id, { likes })),
        (done, total) => progress({ step: 'Lấy ngày đăng chính xác', done, total }),
      );
      out = out.map((v) => {
        const d = details.get(v.id);
        return d && !d.error ? { ...v, publishedAt: d.publishedAt, likes: d.likes ?? v.likes ?? null, category: d.category } : v;
      });
    }
    out = addVideoMetrics(out, { minSubs });
    if (outliers) {
      out = out.map(({ _baseline, ...v }) => ({ ...v, ...outlierScore(v, _baseline) }));
    }
    return out;
  }
  return { channelInfo, channelVideos, videoDetails, enrichVideos };
}

export function summarizeVideos(videos) {
  return {
    count: videos.length,
    medianViews: median(videos.map((v) => v.views)),
    over100k: videos.filter((v) => v.views >= 100000).length,
    over1m: videos.filter((v) => v.views >= 1000000).length,
    viewSubOver1: videos.filter((v) => v.viewSub >= 1).length,
    outlierScore5: videos.filter((v) => v.outlierScore >= 5).length,
    channels: new Set(videos.map((v) => v.channelId)).size,
  };
}
