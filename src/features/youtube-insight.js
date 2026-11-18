// Use case: customer insight from the comments of the hottest YouTube videos for a keyword: the YouTube twin of the
// TikTok insight report (src/features/tiktok/insight.js). Same comment analysis and report shape; only the way the
// videos are found differs: YouTube search with its own filters (region, upload date, duration: long form vs Shorts).
import { noop } from './shared.js';
import { hasWords } from '../core/analysis/text.js';
import { rethrowIfCancelled } from '../core/cancel.js';
import { withAttention } from './tiktok/comments.js';
import { insightOf } from './customer-insight.js';

const TOPS = [5, 10, 20, 30];
const DAY = 86400000;

/**
 * Video as the insight screens read it (the TikTok field names), with the YouTube fields kept as well.
 * @param {any} v a video from videoSearch @param {number} rank
 */
const insightVideo = (v, rank) => ({
  ...v,
  rank,
  url: `https://www.youtube.com/watch?v=${v.id}`,
  caption: v.title ?? '',
  cover: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
  plays: v.views ?? null,
  author: v.channelHandle ? String(v.channelHandle).replace(/^@/, '') : (v.channelTitle ?? ''),
  authorName: v.channelTitle ?? '',
  createdAt: v.publishedAt ?? null,
});

/** @param {{source: any, records: any, now: () => number, videoSearch: Function}} deps */
export function makeYouTubeInsight({ source, records, now, videoSearch }) {
  /**
   * params: { keywords, gl, upload, minDur, maxDur (seconds), perKeyword, top, commentsPerVideo (100|300), replies }
   */
  return async function youtubeInsight(params, progress = noop) {
    const top = TOPS.includes(Number(params.top)) ? Number(params.top) : 10;
    const perVideo = Number(params.commentsPerVideo) === 100 ? 100 : 300;
    const search = await videoSearch(
      { keywords: params.keywords, upload: params.upload || 'year', sort: 'popularity', minDur: params.minDur, maxDur: params.maxDur, perKeyword: params.perKeyword || 40, gl: params.gl, exactTop: 30, likes: true },
      progress,
    );
    records.remove(search.id); // keep only the insight record
    // "Hot" = most views per day (the same order the result tables offer); videos known to have no comments are skipped.
    const picked = search.videos
      .filter((v) => v.comments !== 0)
      .sort((a, b) => (b.viewsPerDay ?? -1) - (a.viewsPerDay ?? -1) || (b.views ?? 0) - (a.views ?? 0))
      .slice(0, top);
    const t = now();
    const comments = [];
    const failedVideos = [];
    const videos = [];
    for (const [i, v] of picked.entries()) {
      const label = `Đọc comment ${i + 1}/${picked.length}`;
      progress({ step: label, done: 0, total: perVideo });
      try {
        const r = await source.getComments(v.id, { max: perVideo, sort: 'top', replies: params.replies !== false, maxRepliesPerThread: 20 }, (n) => progress({ step: label, done: n, total: perVideo }));
        if (r.disabled) failedVideos.push({ id: v.id, url: `https://www.youtube.com/watch?v=${v.id}`, error: 'Video tắt bình luận' });
        const read = r.comments.filter((c) => hasWords(c.text));
        // YouTube gives an age ("3 ngày trước"), not a date: turned into one so attention per day works the same.
        comments.push(...read.map((c) => ({ ...c, createdAt: c.ageDays != null ? new Date(t - c.ageDays * DAY).toISOString() : null, videoId: v.id, videoRank: i + 1 })));
        videos.push({ ...insightVideo(v, i + 1), commentsRead: r.comments.length });
      } catch (e) {
        rethrowIfCancelled(e);
        failedVideos.push({ id: v.id, url: `https://www.youtube.com/watch?v=${v.id}`, error: e.message });
        videos.push({ ...insightVideo(v, i + 1), commentsRead: 0 });
      }
    }
    const scored = withAttention(comments, t);
    const data = {
      platform: 'youtube',
      keywords: search.keywords,
      regions: search.regions,
      counts: { found: search.videos.length, kept: picked.length, commentsRead: scored.length },
      videos,
      comments: scored,
      insight: insightOf(scored),
      failedVideos,
    };
    const id = records.add('youtube_insight', search.keywords.join(', '), { params, data });
    return { id, ...data };
  };
}
