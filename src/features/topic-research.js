import { rethrowIfCancelled } from '../core/cancel.js';
// Use case: topic research report (the four questions). Receives everything through deps (docs/ARCHITECTURE.md §4).
import { noop, splitList, summarizeVideos } from './shared.js';
import { addVideoMetrics, durationBuckets, sum } from '../core/metrics/index.js';
import { titlePhrases, titlePatterns, titleShape, commentInsights } from '../core/analysis/text.js';

const dirLabel = (d) => ({ top: 'Theo top', trend: 'Theo trend', keyword: 'Theo từ khoá' })[d] || d;
const uploadLabel = (u) => ({ today: 'Hôm nay', week: '7 ngày', month: '30 ngày', year: '1 năm', any: 'Mọi lúc' })[u] || u;

/** @param {import('./shared.js').Deps & Record<string, any>} deps */
export function makeResearch(deps) {
  const { source, store, settings, now, records } = deps;
  const { channelInfo, channelVideos, videoDetails, enrichVideos } = deps.enrich;
  const { videoSearch, keywordIdeas, researchComments } = deps;
  /**
   * params: { topic, keywords, direction: 'top'|'trend'|'keyword', upload, minDur, maxDur, perKeyword, gl, competitors, comments: {top, max} }
   */
  return async function research(params, progress = noop) {
    const s = settings();
    const topic = String(params.topic || '').trim();
    let keywords = splitList(params.keywords);
    if (!topic && !keywords.length) throw new Error('Nhập chủ đề');
    if (!keywords.length) keywords = [topic];
    const direction = params.direction || 'top';
    let suggestions = [];
    if (direction === 'keyword') {
      progress({ step: 'Lấy từ khoá người xem đang gõ', done: 0, total: 1 });
      suggestions = await keywordIdeas(topic || keywords[0], { gl: params.gl, depth: 'quick' });
      const extra = suggestions.slice(0, 6).map((x) => x.keyword).filter((k) => !keywords.includes(k));
      keywords = [...keywords, ...extra].slice(0, 6);
    }
    const upload = params.upload || (direction === 'trend' ? 'week' : 'year');
    const search = await videoSearch(
      { keywords, upload, sort: 'popularity', minDur: params.minDur, maxDur: params.maxDur, perKeyword: params.perKeyword || 40, gl: params.gl, exactTop: params.exactTop ?? 40, likes: true },
      progress,
    );
    records.remove(search.id); // keep only the research record
    let videos = search.videos;
    // Competitors: add their latest videos so they show up in the ranking.
    const competitors = splitList(params.competitors);
    for (const c of competitors) {
      try {
        const cid = await source.resolveChannelId(c);
        const info = await channelInfo(cid);
        const vids = await channelVideos(cid, { max: 30, channel: info });
        const extra = addVideoMetrics(vids.filter((v) => !videos.some((x) => x.id === v.id)).map((v) => ({ ...v, channelTitle: info.title, channelSubs: info.subs, queries: ['@' + (info.handle || info.title)] })), { minSubs: s.minSubsForOutlier });
        videos = videos.concat(extra);
      } catch (e) {
        rethrowIfCancelled(e);
        /* skip unknown competitor */
      }
    }
    const ranked = [...videos].filter((v) => v.viewSub != null).sort((a, b) => b.viewSub - a.viewSub);
    const byVpd = [...videos].sort((a, b) => (b.viewsPerDay ?? 0) - (a.viewsPerDay ?? 0));
    // Small channels winning (Thanh Hai step 1: nhiều view nhưng ít sub)
    const chMap = new Map();
    for (const v of videos) {
      if (!v.channelId) continue;
      if (!chMap.has(v.channelId)) chMap.set(v.channelId, { id: v.channelId, title: v.channelTitle, handle: v.channelHandle, avatar: v.channelAvatar, subs: v.channelSubs, videos: [] });
      chMap.get(v.channelId).videos.push(v);
    }
    const channels = [...chMap.values()]
      .map((c) => ({ ...c, count: c.videos.length, bestViewSub: Math.max(...c.videos.map((v) => v.viewSub ?? 0)), totalViews: sum(c.videos.map((v) => v.views)), videos: c.videos.sort((a, b) => b.views - a.views).slice(0, 3).map((v) => ({ id: v.id, title: v.title, views: v.views, viewSub: v.viewSub })) }))
      .sort((a, b) => b.bestViewSub - a.bestViewSub);
    const data = {
      topic: topic || keywords[0],
      keywords,
      direction,
      upload,
      suggestions,
      competitors,
      regions: search.regions,
      summary: summarizeVideos(videos),
      videos: videos.sort((a, b) => (b.viewSub ?? -1) - (a.viewSub ?? -1)),
      topByViewSub: ranked.slice(0, 15).map((v) => v.id),
      topByViewsPerDay: byVpd.slice(0, 15).map((v) => v.id),
      topByOutlierScore: [...videos].filter((v) => v.outlierScore != null).sort((a, b) => b.outlierScore - a.outlierScore).slice(0, 15).map((v) => v.id),
      patterns: titlePatterns(videos, { metric: 'viewSub' }),
      phrases: titlePhrases(videos, { metric: 'viewSub', minCount: 2, limit: 30 }),
      titleShape: titleShape(videos),
      durations: durationBuckets(videos, 'viewSub'),
      channels: channels.slice(0, 30),
      smallWinners: channels.filter((c) => c.subs != null && c.subs < 100000 && c.bestViewSub >= 1).slice(0, 15),
      comments: null,
    };
    const id = records.add('research', `${data.topic} · ${dirLabel(direction)} · ${uploadLabel(upload)}`, { params, data });
    if (params.comments?.top) {
      await researchComments(id, { top: params.comments.top, max: params.comments.max }, progress);
    }
    return { id, ...records.get(id).data };
  };
}

/** @param {import('./shared.js').Deps & Record<string, any>} deps */
export function makeResearchComments(deps) {
  const { source, store, settings, now, records } = deps;
  /** Comments for the top-N videos of a research record (by view/sub); merged insights stored on the record. */
  /** @param {number} recordId @param {{top?: number, max?: number, videoIds?: string[]}} [o] */
  return async function researchComments(recordId, { top = 5, max = 50, videoIds } = {}, progress = noop) {
    const rec = records.get(recordId);
    if (!rec) throw new Error('Không tìm thấy báo cáo');
    const data = rec.data;
    const ids = videoIds?.length ? videoIds : data.topByViewSub.slice(0, top);
    const all = [];
    const perVideo = [];
    for (const [i, vid] of ids.entries()) {
      const label = `Đọc comment ${i + 1}/${ids.length}`;
      try {
        const res = await source.getComments(vid, { max: Number(max) || 50, sort: 'top' }, (n) => progress({ step: label, done: n, total: max }));
        const v = data.videos.find((x) => x.id === vid);
        perVideo.push({ id: vid, title: v?.title || vid, count: res.comments.length, disabled: res.disabled });
        all.push(...res.comments.map((c) => ({ ...c, videoId: vid, videoTitle: v?.title || vid })));
      } catch (e) {
        rethrowIfCancelled(e);
        perVideo.push({ id: vid, title: vid, count: 0, error: e.message });
      }
    }
    data.comments = { videos: perVideo, insights: commentInsights(all, { limit: 30 }), fetchedAt: now(), total: all.length };
    records.update(recordId, data);
    return data.comments;
  };
}
