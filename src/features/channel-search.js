// Use case: Playboard-style channel search. Receives everything through deps (docs/ARCHITECTURE.md §4).
import { noop, splitList, regionsFor } from './shared.js';
import { channelStats } from '../core/metrics/index.js';

/** @param {import('./shared.js').Deps & Record<string, any>} deps */
export function makeChannelSearch(deps) {
  const { source, store, settings, now, records } = deps;
  const { channelInfo, channelVideos, videoDetails, enrichVideos } = deps.enrich;
  /**
   * params: { keywords, source: 'channels'|'videos'|'both', perKeyword, gl, upload }
   * Returns channels with stats computed from their latest videos + About panel.
   */
  return async function channelSearch(params, progress = noop) {
    const s = settings();
    const keywords = splitList(params.keywords);
    if (!keywords.length) throw new Error('Nhập ít nhất một từ khoá');
    const from = params.source || 'both'; // not `source`: that name is the YouTube adapter above
    const per = Math.min(Number(params.perKeyword) || 40, 200);
    const gl = params.gl || s.gl;
    const regions = regionsFor(gl, s.globalRegions);
    // Global: half as many per region, otherwise 8 regions × 3 requests per channel gets slow.
    const perRegion = regions.length > 1 ? Math.ceil(per / 2) : per;
    const found = new Map(); // id -> { base, hits: [video] }
    for (const [i, kw] of keywords.entries()) {
      const label = `Tìm kênh "${kw}" (${i + 1}/${keywords.length})`;
      if (from !== 'videos') {
        const list = await source.searchChannels(kw, { ...{ max: perRegion }, regions }, (n) => progress({ step: label, done: n, total: perRegion * regions.length }));
        for (const c of list) if (!found.has(c.id)) found.set(c.id, { base: c, hits: [], queries: new Set([kw]) });
        else found.get(c.id).queries.add(kw);
      }
      if (from !== 'channels') {
        const vids = await source.searchVideos(kw, { ...{ sort: 'popularity', upload: params.upload || 'year', max: perRegion }, regions: regions }, (n) => progress({ step: `Tìm video "${kw}" để gom kênh`, done: n, total: perRegion * regions.length }));
        for (const v of vids) {
          if (!v.channelId) continue;
          if (!found.has(v.channelId)) found.set(v.channelId, { base: { id: v.channelId, title: v.channelTitle, handle: v.channelHandle }, hits: [], queries: new Set([kw]) });
          const f = found.get(v.channelId);
          f.queries.add(kw);
          f.hits.push({ id: v.id, title: v.title, views: v.views, durationSec: v.durationSec, published: v.published });
        }
      }
    }
    const entries = [...found.values()];
    const channels = await source.mapLimit(
      entries,
      async ({ base, hits, queries }) => {
        const info = await channelInfo(base.id, { about: true });
        const vids = await channelVideos(base.id, { max: 30, channel: info });
        const st = channelStats(info, vids, { outlierMultiple: s.outlierMultiple });
        const top = [...vids].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
        return {
          ...info,
          description: (info.description || base.description || '').slice(0, 300),
          queries: [...queries],
          hits: hits.sort((a, b) => b.views - a.views).slice(0, 5),
          ...st,
          topVideo: top ? { id: top.id, title: top.title, views: top.views } : null,
          latestVideo: vids[0] ? { id: vids[0].id, title: vids[0].title, views: vids[0].views, published: vids[0].published } : null,
        };
      },
      (done, total) => progress({ step: 'Phân tích từng kênh', done, total }),
    );
    const ok = channels.filter((c) => c && !c.error);
    ok.sort((a, b) => (b.views30d ?? 0) - (a.views30d ?? 0));
    const result = { channels: ok, keywords, source: from, regions, failed: channels.length - ok.length };
    const id = records.add('channel_search', keywords.join(', '), { params, data: result });
    return { id, ...result };
  };
}
