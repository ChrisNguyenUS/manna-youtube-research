// Use case: "Phân tích video" for TikTok links — numbers, script and comments of each video, one record per batch.
import { makeVideoAnalysisRunner } from '../shared-video-analysis.js';
import { withAttention } from './comments.js';

/**
 * @param {{tiktok: import('../../ports/tiktok-source.js').TikTokSource, records: any, now: () => number,
 *   comments?: {coverage: (ids: string[], want: {max: number, replies: boolean}) => any[], ofVideo: (id: string) => any[]}}} deps
 *   comments: the shared dataset; coverage() says per video whether collected comments can be reused (core/tiktok/comment-reuse.js)
 */
export function makeTikTokVideoAnalysis({ tiktok, records, now, comments }) {
  return makeVideoAnalysisRunner({
    kind: 'tiktok_video_analysis', platform: 'tiktok', records, now,
    fetchVideo: (link) => tiktok.getVideo(link),
    fetchComments: async (video, o, onProgress) => {
      const cov = o.reuse && comments ? comments.coverage([String(video.id)], { max: o.max, replies: o.replies })[0] : undefined;
      if (comments && cov && (cov.state === 'ready' || cov.state === 'exhausted')) {
        // The most liked parent comments up to the limit, with their replies when asked: same shape as a fresh read.
        const all = comments.ofVideo(String(video.id));
        const parents = all.filter((c) => !c.parentId).slice(0, o.max);
        const keep = new Set(parents.map((c) => c.id));
        const list = [...parents, ...(o.replies ? all.filter((c) => c.parentId && keep.has(c.parentId)) : [])].map(({ firstSeen, lastSeen, ...c }) => c);
        onProgress(list.length);
        return { comments: withAttention(list, now()), reused: { at: cov.lastSeen, parents: parents.length, replies: list.length - parents.length, state: cov.state, exhaustedAt: cov.exhaustedAt } };
      }
      return withAttention((await tiktok.getComments(video.id, { max: o.max, replies: o.replies }, onProgress)).comments, now());
    },
    titleOf: (v) => String(v.caption || `@${v.author}`).replace(/\s+/g, ' ').trim().slice(0, 80),
  });
}

/**
 * "Lần phân tích trước": each saved run with its videos (cover, caption, creator), whether a script was read and how
 * many comments, so the list says what each run holds without opening it.
 * @param {{store: any, ws: string}} deps
 */
export function makeVideoAnalysisHistory({ store, ws }) {
  /** @param {number} [limit] */
  return function videoAnalysisHistory(limit = 20) {
    return store.records.list(ws, 'tiktok_video_analysis', limit).map((r) => {
      const d = store.records.get(ws, r.id)?.data;
      const items = (d?.videos || []).map((e) => ({
        url: e.video?.url ?? e.link, caption: e.video?.caption ?? '', author: e.video?.author ?? '', cover: e.video?.cover ?? null,
        script: e.error ? null : e.transcript ? true : e.transcriptNote === 'off' ? null : false,
        parents: (e.comments || []).filter((c) => !c.parentId).length, replies: (e.comments || []).filter((c) => c.parentId).length,
        reused: !!e.commentsReused, error: e.error?.message ?? null,
      }));
      return { id: r.id, title: r.title, createdAt: r.created_at, params: r.params, items, failed: items.filter((x) => x.error).length };
    });
  };
}
