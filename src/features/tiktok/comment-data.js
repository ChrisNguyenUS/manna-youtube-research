// Use case: read the shared TikTok comment dataset (store.comments) for the three comment screens:
// which videos have comments, the comments of chosen videos with their intents, how much of a video is already
// collected (for reuse), and the history of "Thu thập bình luận" runs. Reads only; collecting stays in the features
// that already do it.
import { tagComments, intentCounts } from '../../core/analysis/comment-intents.js';
import { voiceTopics } from '../../core/analysis/customer-voice.js';

const COMMENT_KINDS = ['tiktok_comments', 'tiktok_video_analysis', 'tiktok_insight'];

/** The video object a report holds for this id (caption, creator, cover…), or null. @param {any} rec @param {string} id */
function videoIn(rec, id) {
  const d = rec?.data;
  if (!d) return null;
  if (rec.kind === 'tiktok_comments') return String(d.video?.id) === id ? d.video : null;
  if (rec.kind === 'tiktok_video_analysis') return d.videos?.map((e) => e.video).find((v) => v && String(v.id) === id) ?? null;
  return d.videos?.find((v) => String(v.id) === id) ?? null;
}
/** Small, safe subset of a video for lists. */
const meta = (id, v) => ({
  id, url: v?.url ?? `https://www.tiktok.com/video/${id}`, caption: v?.caption ?? '', author: v?.author ?? '', cover: v?.cover ?? null,
  plays: v?.plays ?? null, comments: v?.comments ?? null, createdAt: v?.createdAt ?? null,
});

/** @param {{store: any, ws: string}} deps */
export function makeCommentData({ store, ws }) {
  /** Reports read once per call (each read puts its comments back, which costs a little). */
  const reader = () => {
    const cache = new Map();
    return (id) => {
      if (!cache.has(id)) cache.set(id, store.records.get(ws, id));
      return cache.get(id);
    };
  };

  /** Best description of a video among the reports that hold its comments (newest first). */
  function describe(id, recordIds, read) {
    let best = null;
    for (const rid of [...recordIds].sort((a, b) => b - a)) {
      const v = videoIn(read(rid), id);
      if (v && (!best || (!best.caption && v.caption))) best = v;
      if (best?.caption) break;
    }
    return meta(id, best);
  }

  /** Every video with collected comments, newest first, with parent/reply counts and the reports holding them. */
  function videos() {
    const read = reader();
    return store.comments.videos(ws).map((r) => {
      const recs = r.recordIds.map(read).filter(Boolean);
      return {
        ...describe(r.videoId, r.recordIds, read), total: r.total, parents: r.parents, replies: r.replies, lastSeen: r.lastSeen,
        collections: recs.map((x) => ({ id: x.id, kind: x.kind, title: x.title, createdAt: x.created_at })).sort((a, b) => b.createdAt - a.createdAt),
      };
    });
  }

  /**
   * Comments of the chosen videos (all collected ones, newest numbers), with intents, the parent text on replies,
   * and the question themes (Insight's rule). @param {string[]} videoIds
   */
  function comments(videoIds) {
    const ids = [...new Set(videoIds.map(String))].slice(0, 200);
    const read = reader();
    const known = new Map(store.comments.videos(ws).map((r) => [r.videoId, r]));
    const list = ids.flatMap((id) => (known.has(id) ? store.comments.ofVideo(id) : []));
    const byId = new Map(list.map((c) => [c.id, c]));
    const tagged = tagComments(list.map((c) => (c.parentId ? { ...c, parentText: String(byId.get(c.parentId)?.text ?? '').slice(0, 200) } : c)));
    return {
      videos: ids.filter((id) => known.has(id)).map((id) => ({ ...describe(id, known.get(id).recordIds, read), parents: known.get(id).parents, replies: known.get(id).replies, lastSeen: known.get(id).lastSeen })),
      comments: tagged,
      counts: intentCounts(tagged),
      themes: voiceTopics(tagged),
    };
  }

  /** @param {string[]} videoIds */
  const coverage = (videoIds) => store.comments.coverage(ws, videoIds.map(String));

  /** "Thu thập bình luận" runs, newest first, with what each collected. @param {number} [limit] */
  function collections(limit = 100) {
    const rows = store.records.list(ws, 'tiktok_comments', limit);
    const counts = store.comments.countsByRecord(rows.map((r) => r.id));
    const runs = new Map();
    for (const r of rows) runs.set(r.ref, (runs.get(r.ref) ?? 0) + 1);
    const read = reader();
    return rows.map((r) => {
      const v = videoIn(read(r.id), String(r.ref));
      return { id: r.id, createdAt: r.created_at, video: meta(String(r.ref), v ?? { url: r.title }), ...(counts.get(r.id) ?? { total: 0, parents: 0, replies: 0 }), params: r.params, timesCollected: runs.get(r.ref) };
    });
  }

  /** Adds intents to the comments of a comment report (what the screens filter on). @param {any} rec */
  function tagRecord(rec) {
    if (!rec || !COMMENT_KINDS.includes(rec.kind) || !rec.data) return rec;
    const d = rec.data;
    if (rec.kind === 'tiktok_video_analysis') return { ...rec, data: { ...d, videos: (d.videos || []).map((e) => ({ ...e, comments: tagComments(e.comments || []) })) } };
    return { ...rec, data: { ...d, comments: tagComments(d.comments || []) } };
  }

  return { videos, comments, coverage, collections, tagRecord };
}
