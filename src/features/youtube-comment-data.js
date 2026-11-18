// Use case: YouTube comments already collected, put together for "Insight → Từ comment đã có" (YouTube). Reads only:
// every report that keeps YouTube comments (Lấy comment, Phân tích video, Insight YouTube, and the "Đọc comment" of
// Nghiên cứu chủ đề) is read at request time, so comments from new runs show up without anything else to do.
// A comment collected twice counts once, with the numbers of its newest collection.
import { tagComments, intentCounts } from '../core/analysis/comment-intents.js';
import { voiceTopics } from '../core/analysis/customer-voice.js';

const DAY = 86_400_000;
/** Report kinds that keep YouTube comments, and how many of the newest of each are read. */
const KINDS = ['comments', 'video_analysis', 'youtube_insight', 'research'];
const PER_KIND = 300;

/**
 * The videos and comments one report holds: [{video, comments}], comments tagged with their video.
 * @param {{kind: string, data: any}} rec
 * @returns {{video: any, comments: any[]}[]}
 */
export function youtubeCommentsIn(rec) {
  const d = rec?.data;
  if (!d) return [];
  if (rec.kind === 'comments') return d.video?.id ? [{ video: d.video, comments: d.comments ?? [] }] : [];
  if (rec.kind === 'video_analysis') return (d.videos ?? []).filter((e) => e.video?.id).map((e) => ({ video: e.video, comments: e.comments ?? [] }));
  if (rec.kind === 'youtube_insight') return (d.videos ?? []).map((v) => ({ video: v, comments: (d.comments ?? []).filter((c) => c.videoId === v.id) }));
  if (rec.kind === 'research') {
    // Only reports read since raw comments were kept (data.comments.list); older ones kept a summary only.
    const list = d.comments?.list ?? [];
    const ids = [...new Set(list.map((c) => c.videoId))];
    return ids.map((id) => ({ video: (d.videos ?? []).find((v) => v.id === id) ?? { id, title: id }, comments: list.filter((c) => c.videoId === id) }));
  }
  return [];
}

/** Small, safe subset of a YouTube video for lists (same field names as the TikTok screens read). */
const meta = (v) => ({
  id: String(v.id),
  url: v.url ?? `https://www.youtube.com/watch?v=${v.id}`,
  caption: v.title ?? v.caption ?? '',
  author: v.channelTitle ?? v.authorName ?? '',
  cover: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
  plays: v.views ?? v.plays ?? null,
  createdAt: v.publishedAt ?? null,
});

/** @param {{store: any, ws: string}} deps */
export function makeYouTubeCommentData({ store, ws }) {
  /** Every video with collected comments: description, comments by id (newest collection wins), reports holding it. */
  function collect() {
    const rows = KINDS.flatMap((k) => store.records.list(ws, k, PER_KIND)).sort((a, b) => a.created_at - b.created_at); // oldest first: newer numbers overwrite
    /** @type {Map<string, {video: any, comments: Map<string, any>, lastSeen: number, collections: any[]}>} */
    const byVideo = new Map();
    for (const row of rows) {
      const rec = store.records.get(ws, row.id);
      for (const { video, comments } of youtubeCommentsIn(rec)) {
        if (!comments.length) continue;
        const id = String(video.id);
        const cur = byVideo.get(id) ?? { video: meta(video), comments: new Map(), lastSeen: 0, collections: [] };
        if (!cur.video.caption && (video.title || video.caption)) cur.video = meta(video);
        for (const c of comments) {
          if (!c?.id || typeof c.text !== 'string') continue;
          // YouTube gives an age, not a date: dated from when the report was made.
          const createdAt = c.createdAt ?? (c.ageDays != null ? new Date(rec.created_at - c.ageDays * DAY).toISOString() : null);
          cur.comments.set(String(c.id), { id: String(c.id), text: c.text, likes: c.likes ?? 0, replies: c.replies ?? 0, isReply: Boolean(c.isReply), hearted: Boolean(c.hearted), createdAt, videoId: id });
        }
        cur.lastSeen = Math.max(cur.lastSeen, rec.created_at);
        cur.collections.push({ id: rec.id, kind: rec.kind, title: rec.title, createdAt: rec.created_at });
        byVideo.set(id, cur);
      }
    }
    return byVideo;
  }

  const summary = (x) => {
    const list = [...x.comments.values()];
    const replies = list.filter((c) => c.isReply).length;
    return { ...x.video, total: list.length, parents: list.length - replies, replies, lastSeen: x.lastSeen, collections: [...x.collections].sort((a, b) => b.createdAt - a.createdAt) };
  };

  /** Every video with collected comments, newest first. */
  function videos() {
    return [...collect().values()].map(summary).sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /** Comments of the chosen videos with their intents and the question themes (Insight's rule). @param {string[]} videoIds */
  function comments(videoIds) {
    const all = collect();
    const ids = [...new Set(videoIds.map(String))].filter((id) => all.has(id)).slice(0, 200);
    const tagged = tagComments(ids.flatMap((id) => [...all.get(id).comments.values()]));
    return { videos: ids.map((id) => summary(all.get(id))), comments: tagged, counts: intentCounts(tagged), themes: voiceTopics(tagged) };
  }

  return { videos, comments };
}
