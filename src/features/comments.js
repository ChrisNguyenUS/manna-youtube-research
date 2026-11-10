import { rethrowIfCancelled } from '../core/cancel.js';
// Use case: fetch and classify comments of videos. Receives everything through deps (docs/ARCHITECTURE.md §4).
import { noop, splitList } from './shared.js';
import { commentInsights } from '../core/analysis/text.js';

/** @param {import('./shared.js').Deps & Record<string, any>} deps */
export function makeFetchComments(deps) {
  const { source, store, settings, now, records } = deps;
  const { channelInfo, channelVideos, videoDetails, enrichVideos } = deps.enrich;
  /** params: { videos: [id|url], max, sort, replies } */
  return async function fetchComments(params, progress = noop) {
    const ids = splitList(params.videos).map((x) => x.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] || x).filter((x) => /^[\w-]{11}$/.test(x));
    if (!ids.length) throw new Error('Không có video hợp lệ');
    const out = [];
    for (const [i, vid] of ids.entries()) {
      const label = `Comment video ${i + 1}/${ids.length}`;
      progress({ step: label, done: 0, total: params.max || 100 });
      const d = await videoDetails(vid).catch((e) => (rethrowIfCancelled(e), { id: vid, title: vid }));
      const res = await source.getComments(vid, { max: Number(params.max) || 100, sort: params.sort || 'top', replies: !!params.replies, maxRepliesPerThread: 10 }, (n) => progress({ step: label, done: n, total: params.max || 100 }));
      const video = { id: vid, title: d.title, channelTitle: d.channelTitle, views: d.views, publishedAt: d.publishedAt, url: `https://www.youtube.com/watch?v=${vid}` };
      const data = { video, disabled: res.disabled, comments: res.comments, insights: commentInsights(res.comments), params };
      const recId = records.add('comments', d.title || vid, { ref: vid, params, data });
      out.push({ id: recId, video, count: res.comments.length, disabled: res.disabled });
    }
    return { jobs: out };
  };
}
