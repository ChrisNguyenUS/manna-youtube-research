// Use case: "Phân tích video" for TikTok links — numbers, script and comments of each video, one record per batch.
import { makeVideoAnalysisRunner } from '../shared-video-analysis.js';
import { withAttention } from './comments.js';

/** @param {{tiktok: import('../../ports/tiktok-source.js').TikTokSource, records: any, now: () => number}} deps */
export function makeTikTokVideoAnalysis({ tiktok, records, now }) {
  return makeVideoAnalysisRunner({
    kind: 'tiktok_video_analysis', platform: 'tiktok', records, now,
    fetchVideo: (link) => tiktok.getVideo(link),
    fetchComments: async (video, o, onProgress) => withAttention((await tiktok.getComments(video.id, { max: o.max, replies: o.replies }, onProgress)).comments, now()),
    titleOf: (v) => String(v.caption || `@${v.author}`).replace(/\s+/g, ' ').trim().slice(0, 80),
  });
}
