// Use case: customer insight from comments of the hottest on-topic TikTok videos (spec §4.2).
import { noop } from '../shared.js';
import { hasWords } from '../../core/analysis/text.js';
import { customerVoice } from '../../core/analysis/customer-voice.js';
import { rankVideos } from '../../core/tiktok/rank.js';
import { rethrowIfCancelled } from '../../core/cancel.js';
import { withAttention } from './comments.js';

const TOPS = [5, 10, 20, 30];

/** @param {{tiktok: import('../../ports/tiktok-source.js').TikTokSource, records: any, now: () => number, tiktokSearch: Function}} deps */
export function makeTikTokInsight({ tiktok, records, now, tiktokSearch }) {
  return async function tiktokInsight(params, progress = noop) {
    const top = TOPS.includes(Number(params.top)) ? Number(params.top) : 10;
    const perVideo = Number(params.commentsPerVideo) === 100 ? 100 : 300;
    const { keywords, perKeyword, keepOffTopic, minPlays, minLikes, maxAgeDays, minEngagement } = params;
    const search = await tiktokSearch({ keywords, perKeyword, keepOffTopic, minPlays, minLikes, maxAgeDays, minEngagement }, progress, { save: false });
    // Same order as the scrape API: trending, then engagement, then freshness.
    const picked = rankVideos(/** @type {any[]} */ (search.videos.filter((v) => v.comments > 0))).slice(0, top);
    const comments = [];
    const failedVideos = [];
    const videos = [];
    for (const [i, v] of picked.entries()) {
      const label = `Đọc comment ${i + 1}/${picked.length}`;
      progress({ step: label, done: 0, total: perVideo });
      try {
        const r = await tiktok.getComments(v.id, { max: perVideo, replies: params.replies !== false }, (n) => progress({ step: label, done: n, total: perVideo }));
        comments.push(...r.comments.filter((c) => hasWords(c.text)).map((c) => ({ ...c, videoId: v.id, videoRank: i + 1 })));
        videos.push({ ...v, commentsRead: r.comments.length });
      } catch (e) {
        rethrowIfCancelled(e);
        failedVideos.push({ id: v.id, url: v.url, error: e.message });
        videos.push({ ...v, commentsRead: 0 });
      }
    }
    const scored = withAttention(comments, now());
    const voice = customerVoice(scored, { limit: 50 });
    const insight = {
      version: 2,
      questions: voice.questions,
      themes: voice.themes,
      fears: voice.fears,
      buying: voice.buying,
      voiceLines: voice.voiceLines,
      topByAttention: [...scored].filter((c) => c.attentionPerDay != null).sort((a, b) => b.attentionPerDay - a.attentionPerDay).slice(0, 100),
      groupCounts: voice.counts,
    };
    const data = { keywords: search.keywords, counts: { ...search.counts, kept: search.videos.length, commentsRead: scored.length }, videos, comments: scored, insight, failedVideos };
    const id = records.add('tiktok_insight', search.keywords.join(', '), { params, data });
    return { id, ...data };
  };
}
