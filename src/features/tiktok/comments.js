// Use case: comments of TikTok links (spec §4.3) + the helper the insight report shares.
import { noop, splitList } from '../shared.js';
import { attentionPerDay } from '../../core/tiktok/metrics.js';
import { commentInsights } from '../../core/analysis/text.js';
import { rethrowIfCancelled } from '../../core/cancel.js';

/** Adds attentionPerDay, and parentText on replies (first 200 chars of the parent comment). */
export function withAttention(comments, now) {
  const byId = new Map(comments.map((c) => [c.id, c]));
  return comments.map((c) => ({ ...c, attentionPerDay: attentionPerDay(c, now), ...(c.parentId ? { parentText: (byId.get(c.parentId)?.text || '').slice(0, 200) } : {}) }));
}

/** @param {{tiktok: import('../../ports/tiktok-source.js').TikTokSource, records: any, now: () => number}} deps */
export function makeTikTokComments({ tiktok, records, now }) {
  return async function tiktokComments(params, progress = noop) {
    const links = splitList(String(params.videos || '').replace(/\s+/g, '\n'));
    if (!links.length) throw new Error('Dán ít nhất một link TikTok');
    const max = Number(params.max) === 100 ? 100 : 300;
    const done = [];
    const skipped = [];
    for (const [i, link] of links.entries()) {
      let video;
      try {
        video = await tiktok.resolveVideo(link);
      } catch (e) {
        rethrowIfCancelled(e);
        skipped.push(link);
        continue;
      }
      const label = `Comment TikTok ${i + 1}/${links.length}`;
      progress({ step: label, done: 0, total: max });
      let r;
      try {
        r = await tiktok.getComments(video.id, { max, replies: params.replies !== false }, (n) => progress({ step: label, done: n, total: max }));
      } catch (e) {
        rethrowIfCancelled(e);
        skipped.push(link);
        continue;
      }
      done.push({ video, comments: withAttention(r.comments, now()) });
    }
    if (!done.length) throw new Error(skipped.length ? 'Không lấy được comment từ link nào' : 'Không có link video TikTok hợp lệ');
    // Saved after the loop so every record lists all skipped links.
    const jobs = done.map(({ video, comments }) => {
      const data = { video, comments, insight: commentInsights(comments, { limit: 50 }), params, skipped };
      return { id: records.add('tiktok_comments', video.url, { ref: video.id, params, data }), video, count: comments.length };
    });
    // inline: the runner keeps this result, so the screen can show every video of a multi-link job.
    return { inline: true, jobs, skipped };
  };
}
