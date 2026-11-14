// Use case: "Phân tích video" for TikTok links — numbers, script and comments of each video, one record per batch.
import { makeVideoAnalysisRunner } from '../shared-video-analysis.js';
import { withAttention } from './comments.js';

/**
 * Enough of a video already collected to reuse: as many parent comments as asked for, or (nearly) all the video has.
 * @param {{parents: number, replies: number}|undefined} cov @param {any} video @param {number} max
 */
export const enoughCollected = (cov, video, max) => !!cov && (cov.parents >= max || (video.comments != null && cov.parents + cov.replies >= video.comments * 0.9));

/**
 * @param {{tiktok: import('../../ports/tiktok-source.js').TikTokSource, records: any, now: () => number,
 *   comments?: {coverage: (ids: string[]) => any[], ofVideo: (id: string) => any[]}}} deps comments: the shared dataset (reuse)
 */
export function makeTikTokVideoAnalysis({ tiktok, records, now, comments }) {
  return makeVideoAnalysisRunner({
    kind: 'tiktok_video_analysis', platform: 'tiktok', records, now,
    fetchVideo: (link) => tiktok.getVideo(link),
    fetchComments: async (video, o, onProgress) => {
      const cov = o.reuse && comments ? comments.coverage([String(video.id)])[0] : undefined;
      if (comments && enoughCollected(cov, video, o.max)) {
        // The most liked parent comments up to the limit, with their replies when asked: same shape as a fresh read.
        const all = comments.ofVideo(String(video.id));
        const parents = all.filter((c) => !c.parentId).slice(0, o.max);
        const keep = new Set(parents.map((c) => c.id));
        const list = [...parents, ...(o.replies ? all.filter((c) => c.parentId && keep.has(c.parentId)) : [])].map(({ firstSeen, lastSeen, ...c }) => c);
        onProgress(list.length);
        return { comments: withAttention(list, now()), reused: { at: cov.lastSeen, parents: parents.length, replies: list.length - parents.length } };
      }
      return withAttention((await tiktok.getComments(video.id, { max: o.max, replies: o.replies }, onProgress)).comments, now());
    },
    titleOf: (v) => String(v.caption || `@${v.author}`).replace(/\s+/g, ' ').trim().slice(0, 80),
  });
}
